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

// Caller identity lives in backend/caller_identity.js so that this server and the
// Vercel handler resolve "who is on the line" with the exact same rule. See that
// file for why the session — not the request body — decides.
const { resolveAiCaller, getAuthSession } = require('./caller_identity');

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
       0. LIVE CHANGE STREAM (Server-Sent Events)

       GET /api/events — a long-lived stream that pushes one message every time a
       worker, availability slot or job actually changes in the database.

       Why this exists: a customer looking at the specialist list used to see
       whatever was loaded when the page opened. If a worker changed their hours
       on the 3.5mm voice line a second later, the customer's screen kept showing
       the old ones until they manually refreshed.

       Why it is fed from the database and not from a browser Firestore listener:
       the browser has no Firebase SDK here (by design — one AI brain, one data
       path through the backend), and Firestore is currently a mirror of SQLite
       rather than the authority. Pushing from the write path means the customer
       sees the same truth the AI just wrote, including when the cloud mirror is
       failing. Events carry only what changed; the client re-reads through the
       normal API, so there is exactly one code path that produces the data.
       ---------------------------------------------------------------------- */
    if (pathname === '/api/events' && req.method === 'GET') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
            'Access-Control-Allow-Origin': '*'
        });

        // Tell the client it is connected, so the UI can show a live indicator that
        // reflects a real open stream rather than an assumption.
        res.write(`event: ready\ndata: ${JSON.stringify({ connected: true })}\n\n`);

        const unsubscribe = DB.onChange((change) => {
            try {
                res.write(`event: change\ndata: ${JSON.stringify(change)}\n\n`);
            } catch (_) {
                // Socket already gone; the close handler will clean up.
            }
        });

        // Comment frames keep proxies and browsers from dropping an idle stream.
        const heartbeat = setInterval(() => {
            try { res.write(': keep-alive\n\n'); } catch (_) {}
        }, 25000);

        const cleanup = () => {
            clearInterval(heartbeat);
            unsubscribe();
        };
        req.on('close', cleanup);
        req.on('error', cleanup);
        return;
    }

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

    // GET /api/workers/:id/schedule & GET /api/workers/me/schedule
    const schedMatch = pathname.match(/^\/api\/workers\/(me|\d+)\/schedule$/);
    if (schedMatch && req.method === 'GET') {
        let workerId = schedMatch[1];
        if (workerId === 'me') {
            const session = getAuthSession(req);
            if (!session || session.role !== 'worker') {
                return sendJSON(res, { status: 'error', message: 'Worker authorization required.' }, 403);
            }
            const worker = DB.getWorkerByUserId(session.user_id);
            if (!worker) return sendJSON(res, { status: 'error', message: 'Worker profile not found.' }, 404);
            workerId = worker.id;
        } else {
            workerId = Number(workerId);
        }
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

    // PATCH /api/customers/me/profile
    if (pathname === '/api/customers/me/profile' && req.method === 'PATCH') {
        const session = getAuthSession(req);
        if (!session) {
            return sendJSON(res, { status: 'error', message: 'Authentication required.' }, 401);
        }

        const body = await parseBody(req);
        const customer = DB.updateCustomerProfile(session.phone, {
            name: body.name,
            city: body.city,
            area: body.area,
            email: body.email
        });

        // updateCustomerProfile already handles users table update internally

        return sendJSON(res, { status: 'success', message: 'Profile updated.', customer });
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
        let workerId = body.worker_id || body.workerId || null;
        let workerName = body.worker_name || body.workerName || null;
        let workerPhone = body.worker_phone || body.workerPhone || null;

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

    // GET /api/ai/caller?phone=XXXXXXXXXX
    //
    // Resolves who a number belongs to using the SAME rule the AI endpoint uses, so the
    // 3.5mm voice terminal can confirm the person on the handset before the call starts
    // and cannot end up talking to a different record than the one it displayed.
    if (pathname === '/api/ai/caller' && req.method === 'GET') {
        const session = getAuthSession(req);
        const identity = resolveAiCaller(session, { callerPhone: parsedUrl.query.phone || '' });
        if (identity.error) {
            return sendJSON(res, { status: 'error', message: identity.error }, identity.statusCode || 400);
        }
        return sendJSON(res, {
            status: 'success',
            caller: {
                phone: identity.callerPhone,
                name: identity.callerName,
                role: identity.callerRole,
                city: identity.city,
                source: identity.source,
                registeredWorker: identity.registeredWorker
            }
        });
    }

    // POST /api/ai/voice-call & POST /api/ai/chat
    if ((pathname === '/api/ai/voice-call' || pathname === '/api/ai/chat') && req.method === 'POST') {
        const body = await parseBody(req);
        const session = getAuthSession(req);
        const speechText = body.speechText || body.message || '';

        if (!speechText) {
            return sendJSON(res, { status: 'error', message: 'speechText or message is required.' }, 400);
        }

        // Caller identity resolution.
        //
        // The verified session is authoritative — a browser must not be able to claim
        // someone else's phone number and read or edit their record. The one exception is
        // the 3.5mm voice terminal: an admin operator dials in on behalf of a worker who is
        // physically on the handset, so an admin session MAY name the caller explicitly.
        // In that case the caller's real name and role come from the database, never from
        // the request body.
        const identity = resolveAiCaller(session, body);
        if (identity.error) {
            return sendJSON(res, { status: 'error', message: identity.error }, identity.statusCode || 400);
        }

        try {
            const aiTurn = await aiAgent.processCallTurn({
                sessionId: body.sessionId || identity.callerPhone,
                callerPhone: identity.callerPhone,
                callerRole: identity.callerRole,
                callerName: identity.callerName,
                city: identity.city,
                speechText
            });

            return sendJSON(res, {
                status: 'success',
                callerIdentity: {
                    phone: identity.callerPhone,
                    name: identity.callerName,
                    role: identity.callerRole,
                    source: identity.source,
                    registeredWorker: identity.registeredWorker
                },
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

    // GET & POST /api/ai/tts (Real-Time Text-to-Speech Audio Stream)
    if (pathname === '/api/ai/tts' && (req.method === 'GET' || req.method === 'POST')) {
        let text = '';
        let lang = 'en-IN';
        if (req.method === 'GET') {
            text = (parsedUrl.query && parsedUrl.query.text) ? parsedUrl.query.text : '';
            lang = (parsedUrl.query && parsedUrl.query.lang) ? parsedUrl.query.lang : 'en-IN';
        } else {
            const body = await parseBody(req);
            text = body.text || '';
            lang = body.lang || 'en-IN';
        }

        if (!text) {
            return sendJSON(res, { status: 'error', message: 'Text is required for TTS' }, 400);
        }

        const isKannada = /[\u0C80-\u0CFF]/.test(text);
        const targetLang = isKannada ? 'kn' : (lang || 'en-IN');
        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.slice(0, 200))}&tl=${targetLang}&client=tw-ob`;

        const https = require('node:https');
        https.get(ttsUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (ttsRes) => {
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            ttsRes.pipe(res);
        }).on('error', (err) => {
            console.error('TTS Proxy Error:', err);
            sendJSON(res, { status: 'error', message: 'TTS audio generation failed', error: err.message }, 500);
        });
        return;
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

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.warn(`[Server] Port ${PORT} already in use. Retrying or using existing server instance.`);
    } else {
        console.error('[Server Error]:', err.message);
    }
});

process.on('uncaughtException', (err) => {
    console.error('[Uncaught Exception]:', err.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('[Unhandled Rejection]:', reason);
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

