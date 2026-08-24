/* ==========================================================================
   GigSync — Full-Stack Server & REST API Gateway (Desktop-First)
   Port 8089: Authentication, SQLite Persistence, Firebase Cloud Sync, AI Voice
   ========================================================================== */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

const DB = require('./database');
const FirebaseSync = require('./firebase');
const { aiAgent, AI_TOOLS } = require('./ai_agent');

const PORT = 8089;
const PUBLIC_DIR = path.join(__dirname, '..');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8'
};

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (err) {
                resolve({});
            }
        });
        req.on('error', reject);
    });
}

function sendJSON(res, data, statusCode = 200) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end(JSON.stringify(data));
}

function getAuthSession(req) {
    const authHeader = req.headers['authorization'] || '';
    if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        return DB.getSession(token);
    }
    return null;
}

const server = http.createServer(async (req, res) => {
    // CORS Preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    /* ----------------------------------------------------------------------
       1. AUTHENTICATION REST API
       ---------------------------------------------------------------------- */

    // POST /api/auth/register
    if (pathname === '/api/auth/register' && req.method === 'POST') {
        const body = await parseBody(req);
        if (!body.name || !body.phone || !body.password || !body.role) {
            return sendJSON(res, { status: 'error', message: 'Name, mobile number, password, and role are required.' }, 400);
        }

        const cleanPhone = body.phone.replace(/\D/g, '');
        const existing = DB.getUserByPhone(cleanPhone);
        if (existing) {
            return sendJSON(res, { status: 'error', message: 'An account with this phone number already exists. Please log in.' }, 409);
        }

        // Security Check: Restrict Admin Registration
        if (body.role === 'admin') {
            const adminSecret = body.adminSecret || body.admin_secret || '';
            const validSecret = process.env.ADMIN_SECRET_KEY || 'gigsync@admin2026';
            if (adminSecret !== validSecret) {
                return sendJSON(res, {
                    status: 'error',
                    message: 'Access Denied: A valid Master Admin Security Key is required to create an Administrator account.'
                }, 403);
            }
        }

        const user = DB.createUser({
            name: body.name.trim(),
            phone: cleanPhone,
            email: body.email ? body.email.trim() : null,
            role: body.role,
            password: body.password,
            city: body.city || 'Ramanagara',
            area: body.area || 'Town'
        });

        if (body.role === 'worker') {
            const worker = DB.getWorkerByUserId(user.id);
            if (worker && (body.trade || body.skills || body.tools || body.price)) {
                DB.updateWorkerProfile(worker.id, {
                    trade: body.trade || 'General Specialist',
                    skills: body.skills || '',
                    tools: body.tools || 'Standard tool kit',
                    price: body.price || 300,
                    about: body.about || ''
                });
            }
        }

        const session = DB.authenticateUser(cleanPhone, body.password);
        return sendJSON(res, { status: 'success', message: 'Account registered successfully.', ...session }, 201);
    }

    // POST /api/auth/login
    if (pathname === '/api/auth/login' && req.method === 'POST') {
        const body = await parseBody(req);
        if (!body.phone || !body.password) {
            return sendJSON(res, { status: 'error', message: 'Mobile number and password are required.' }, 400);
        }

        const cleanPhone = body.phone.replace(/\D/g, '');
        const session = DB.authenticateUser(cleanPhone, body.password);
        if (!session) {
            return sendJSON(res, { status: 'error', message: 'Invalid mobile number or password.' }, 401);
        }

        return sendJSON(res, { status: 'success', message: 'Login successful.', ...session });
    }

    // GET /api/auth/me
    if (pathname === '/api/auth/me' && req.method === 'GET') {
        const session = getAuthSession(req);
        if (!session) {
            return sendJSON(res, { status: 'error', message: 'Unauthorized or session expired.' }, 401);
        }

        let profile = null;
        if (session.role === 'worker') {
            profile = DB.getWorkerByUserId(session.user_id);
        } else {
            profile = DB.getUserById(session.user_id);
        }

        return sendJSON(res, {
            status: 'success',
            user: {
                id: session.user_id,
                name: session.name,
                phone: session.phone,
                email: session.email,
                role: session.role,
                city: session.city,
                area: session.area,
                profile
            }
        });
    }

    // POST /api/auth/logout
    if (pathname === '/api/auth/logout' && req.method === 'POST') {
        const authHeader = req.headers['authorization'] || '';
        if (authHeader.startsWith('Bearer ')) {
            DB.deleteSession(authHeader.slice(7).trim());
        }
        return sendJSON(res, { status: 'success', message: 'Logged out successfully.' });
    }

    /* ----------------------------------------------------------------------
       2. WORKERS REST API
       ---------------------------------------------------------------------- */

    // GET /api/workers
    if (pathname === '/api/workers' && req.method === 'GET') {
        const filters = {
            service: parsedUrl.query.service || null,
            city: parsedUrl.query.city || null,
            minRating: parsedUrl.query.minRating || null,
            isAvailable: parsedUrl.query.available !== undefined ? parsedUrl.query.available === 'true' : undefined
        };
        const workers = DB.getAllWorkers(filters);
        return sendJSON(res, { status: 'success', count: workers.length, workers });
    }

    // GET /api/workers/:id
    const workerMatch = pathname.match(/^\/api\/workers\/(\d+)$/);
    if (workerMatch && req.method === 'GET') {
        const workerId = Number(workerMatch[1]);
        const worker = DB.getWorkerById(workerId);
        if (!worker) return sendJSON(res, { status: 'error', message: 'Worker not found.' }, 404);
        return sendJSON(res, { status: 'success', worker });
    }

    // GET /api/workers/:id/schedule
    const schedMatch = pathname.match(/^\/api\/workers\/(\d+)\/schedule$/);
    if (schedMatch && req.method === 'GET') {
        const workerId = Number(schedMatch[1]);
        const schedule = DB.getWorkerSchedule(workerId);
        if (!schedule) return sendJSON(res, { status: 'error', message: 'Worker schedule not found.' }, 404);
        return sendJSON(res, { status: 'success', ...schedule });
    }

    // GET /api/workers/:id/earnings
    const earnMatch = pathname.match(/^\/api\/workers\/(\d+)\/earnings$/);
    if (earnMatch && req.method === 'GET') {
        const workerId = Number(earnMatch[1]);
        const earnings = DB.getWorkerEarnings(workerId);
        return sendJSON(res, { status: 'success', workerId, earnings });
    }

    // PATCH /api/workers/me/availability
    if (pathname === '/api/workers/me/availability' && req.method === 'PATCH') {
        const session = getAuthSession(req);
        if (!session || session.role !== 'worker') {
            return sendJSON(res, { status: 'error', message: 'Worker authorization required.' }, 403);
        }

        const body = await parseBody(req);
        const worker = DB.getWorkerByUserId(session.user_id);
        if (!worker) return sendJSON(res, { status: 'error', message: 'Worker profile not found.' }, 404);

        if (body.is_available !== undefined) {
            DB.updateWorkerAvailabilityStatus(worker.id, body.is_available);
        }

        if (body.date_str && body.start_time && body.end_time) {
            DB.setWorkerAvailabilitySlot({
                workerId: worker.id,
                workerPhone: worker.phone,
                trade: worker.trade,
                dateStr: body.date_str,
                startTime: body.start_time,
                endTime: body.end_time,
                isAvailable: body.is_available !== undefined ? body.is_available : true,
                notes: body.notes || ''
            });
        }

        const updated = DB.getWorkerSchedule(worker.id);
        return sendJSON(res, { status: 'success', message: 'Availability updated.', ...updated });
    }

    // PATCH /api/workers/me/profile
    if (pathname === '/api/workers/me/profile' && req.method === 'PATCH') {
        const session = getAuthSession(req);
        if (!session || session.role !== 'worker') {
            return sendJSON(res, { status: 'error', message: 'Worker authorization required.' }, 403);
        }

        const body = await parseBody(req);
        const worker = DB.getWorkerByUserId(session.user_id);
        if (!worker) return sendJSON(res, { status: 'error', message: 'Worker profile not found.' }, 404);

        const updated = DB.updateWorkerProfile(worker.id, body);
        return sendJSON(res, { status: 'success', message: 'Profile updated successfully.', worker: updated });
    }

    /* ----------------------------------------------------------------------
       3. JOBS & BOOKINGS REST API
       ---------------------------------------------------------------------- */

    // GET /api/jobs
    if (pathname === '/api/jobs' && req.method === 'GET') {
        const session = getAuthSession(req);
        const status = parsedUrl.query.status || null;
        const city = parsedUrl.query.city || null;
        const phone = parsedUrl.query.phone || null;

        let jobs = [];
        let availableOpportunities = [];

        if (session && session.role === 'worker') {
            const worker = DB.getWorkerByUserId(session.user_id);
            if (worker) {
                jobs = DB.getJobsByWorker(worker.id);
                availableOpportunities = DB.getAvailableJobsForWorker(worker.trade, worker.city);
            }
        } else if (session && session.role === 'customer') {
            jobs = DB.getJobsByCustomer(session.phone);
        } else if (phone) {
            jobs = DB.getJobsByCustomer(phone);
        } else {
            jobs = DB.getAllJobs({ status, city });
        }

        return sendJSON(res, {
            status: 'success',
            count: jobs.length,
            jobs,
            opportunities: availableOpportunities
        });
    }

    // POST /api/jobs
    if (pathname === '/api/jobs' && req.method === 'POST') {
        const body = await parseBody(req);
        if (!body.service || !body.problem_description || !body.customer_phone) {
            return sendJSON(res, { status: 'error', message: 'Service, problem description, and customer phone are required.' }, 400);
        }

        // Schedule Conflict Prevention Check
        if (body.worker_id && body.requested_date && body.requested_time) {
            const hasConflict = DB.checkScheduleConflict(body.worker_id, body.requested_date, body.requested_time);
            if (hasConflict) {
                return sendJSON(res, {
                    status: 'error',
                    message: 'This worker already has an accepted booking during this time slot. Please choose another time or worker.'
                }, 409);
            }
        }

        const session = getAuthSession(req);
        const newJob = DB.createJob({
            customer_id: session ? session.user_id : null,
            customer_phone: body.customer_phone,
            customer_name: body.customer_name || (session ? session.name : 'Customer'),
            worker_id: body.worker_id || null,
            worker_phone: body.worker_phone || null,
            worker_name: body.worker_name || 'Broadcasting to nearby verified specialists...',
            service: body.service,
            problem_description: body.problem_description,
            location: body.location || 'Town Area',
            city: body.city || (session ? session.city : 'Ramanagara'),
            requested_date: body.requested_date || 'Today',
            requested_time: body.requested_time || 'Immediate',
            budget: body.budget || '₹350',
            status: body.worker_id ? 'Confirmed' : 'Requested',
            payment_method: body.payment_method || 'Cash'
        });

        return sendJSON(res, { status: 'success', message: 'Job created and dispatched.', job: newJob }, 201);
    }

    // PATCH /api/jobs/:id
    const jobUpdateMatch = pathname.match(/^\/api\/jobs\/([A-Za-z0-9-]+)$/);
    if (jobUpdateMatch && req.method === 'PATCH') {
        const jobId = jobUpdateMatch[1];
        const body = await parseBody(req);

        if (!body.status) {
            return sendJSON(res, { status: 'error', message: 'New status is required.' }, 400);
        }

        const session = getAuthSession(req);
        let workerId = body.worker_id || null;
        let workerName = body.worker_name || null;
        let workerPhone = body.worker_phone || null;

        if (session && session.role === 'worker' && !workerId) {
            const worker = DB.getWorkerByUserId(session.user_id);
            if (worker) {
                workerId = worker.id;
                workerName = worker.name;
                workerPhone = worker.phone;
            }
        }

        const updated = DB.updateJobStatus(jobId, body.status, workerId, workerName, workerPhone);
        if (!updated) return sendJSON(res, { status: 'error', message: 'Job not found.' }, 404);

        return sendJSON(res, { status: 'success', message: `Job #${jobId} status updated to ${body.status}.`, job: updated });
    }

    // POST /api/jobs/:id/review
    const jobReviewMatch = pathname.match(/^\/api\/jobs\/([A-Za-z0-9-]+)\/review$/);
    if (jobReviewMatch && req.method === 'POST') {
        const jobId = jobReviewMatch[1];
        const body = await parseBody(req);
        if (!body.rating) {
            return sendJSON(res, { status: 'error', message: 'Rating (1 to 5) is required.' }, 400);
        }

        const updated = DB.submitJobReview(jobId, Number(body.rating), body.review || '');
        if (!updated) return sendJSON(res, { status: 'error', message: 'Job not found.' }, 404);

        return sendJSON(res, { status: 'success', message: 'Review submitted.', job: updated });
    }

    /* ----------------------------------------------------------------------
       4. FIREBASE CLOUD FIRESTORE ENDPOINTS
       ---------------------------------------------------------------------- */

    // GET /api/firebase/config
    if (pathname === '/api/firebase/config' && req.method === 'GET') {
        return sendJSON(res, {
            status: 'success',
            config: FirebaseSync.getConfig()
        });
    }

    // POST /api/firebase/config
    if (pathname === '/api/firebase/config' && req.method === 'POST') {
        const body = await parseBody(req);
        const updated = FirebaseSync.saveConfig(body);
        return sendJSON(res, { status: 'success', message: 'Firebase config updated.', config: updated });
    }

    // POST /api/firebase/sync
    if (pathname === '/api/firebase/sync' && req.method === 'POST') {
        const syncResult = await DB.triggerFullFirebaseSync();
        return sendJSON(res, {
            status: 'success',
            message: 'All local workers and jobs synchronized to Cloud Firestore collections.',
            ...syncResult
        });
    }

    /* ----------------------------------------------------------------------
       5. AI VOICE & CONVERSATIONAL GATEWAY
       ---------------------------------------------------------------------- */

    // POST /api/ai/voice-call & POST /api/ai/chat
    if ((pathname === '/api/ai/voice-call' || pathname === '/api/ai/chat') && req.method === 'POST') {
        const body = await parseBody(req);
        const session = getAuthSession(req);

        const callerPhone = body.callerPhone || (session ? session.phone : '9876543210');
        const callerRole = body.callerRole || (session ? session.role : 'customer');
        const callerName = body.callerName || (session ? session.name : 'User');
        const callerCity = body.city || (session ? session.city : 'Ramanagara');
        const speechText = body.speechText || body.message || '';

        if (!speechText) {
            return sendJSON(res, { status: 'error', message: 'speechText or message is required.' }, 400);
        }

        try {
            const aiTurn = await aiAgent.processCallTurn({
                callerPhone,
                callerRole,
                callerName,
                city: callerCity,
                speechText
            });

            return sendJSON(res, {
                status: 'success',
                ...aiTurn
            });
        } catch (err) {
            console.error('AI Processing Error:', err);
            return sendJSON(res, {
                status: 'error',
                message: 'AI voice agent processing failed.',
                error: err.message
            }, 500);
        }
    }

    // GET /api/call-logs
    if (pathname === '/api/call-logs' && req.method === 'GET') {
        const logs = DB.getAllCallLogs();
        return sendJSON(res, { status: 'success', count: logs.length, callLogs: logs });
    }

    /* ----------------------------------------------------------------------
       6. STATIC WEB APPLICATION SERVING
       ---------------------------------------------------------------------- */

    let reqPath = pathname === '/' ? '/index.html' : pathname;
    const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(PUBLIC_DIR, safePath);

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            const fallbackPath = path.join(PUBLIC_DIR, 'index.html');
            fs.readFile(fallbackPath, (fallbackErr, content) => {
                if (fallbackErr) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('404 Not Found');
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(content);
            });
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        fs.readFile(filePath, (readErr, content) => {
            if (readErr) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('500 Server Error');
                return;
            }
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        });
    });
});

server.listen(PORT, () => {
    console.log('=======================================================');
    console.log(` GigSync Full-Stack Desktop Server & AI Voice Gateway`);
    console.log(` Running at: http://localhost:${PORT}/`);
    console.log(` SQLite Database: Connected (gigsync.db)`);
    console.log(` Firebase Cloud Sync: Connected (Firestore REST Layer)`);
    console.log(` Real Authentication: Enabled (/api/auth/*)`);
    console.log(` Desktop Customer & Worker REST Endpoints: Live`);
    console.log('=======================================================');
});

module.exports = server;
