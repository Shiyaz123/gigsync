/* ==========================================================================
   GigSync — Vercel Serverless Function Handler (/api/*)
   Supports Real Auth, Worker Operations, Customer Jobs, and Admin Gateway
   ========================================================================== */

const crypto = require('node:crypto');

// In-memory / serverless runtime state store for Vercel
const runtimeState = {
    users: [
        {
            id: 1,
            name: 'Master Platform Administrator',
            phone: '9999999999',
            email: 'shiyazabdulazeez@gmail.com',
            role: 'admin',
            password_hash: crypto.scryptSync('admin@gigsync2026', 'gigsync_salt_tier2', 32).toString('hex'),
            city: 'Ramanagara',
            area: 'Headquarters'
        }
    ],
    sessions: {},
    workers: [],
    customers: [],
    jobs: [],
    callLogs: []
};

function parseBody(req) {
    return new Promise((resolve) => {
        if (req.body && typeof req.body === 'object') return resolve(req.body);
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try { resolve(body ? JSON.parse(body) : {}); } catch (e) { resolve({}); }
        });
    });
}

function sendJSON(res, data, statusCode = 200) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(statusCode).json(data);
}

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(204).end();
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    // 1. POST /api/auth/login
    if (pathname.endsWith('/auth/login') && req.method === 'POST') {
        const body = await parseBody(req);
        const cleanPhone = (body.phone || '').replace(/\D/g, '');
        const password = body.password || '';

        // Check user in runtime state
        let user = runtimeState.users.find(u => u.phone === cleanPhone);

        // Auto-provision default admin if queried
        if (!user && cleanPhone === '9999999999') {
            user = {
                id: 1,
                name: 'Master Platform Administrator',
                phone: '9999999999',
                email: 'shiyazabdulazeez@gmail.com',
                role: 'admin',
                password_hash: crypto.scryptSync('admin@gigsync2026', 'gigsync_salt_tier2', 32).toString('hex'),
                city: 'Ramanagara',
                area: 'Headquarters'
            };
            runtimeState.users.push(user);
        }

        if (!user) {
            return sendJSON(res, { status: 'error', message: 'User not found with this mobile number.' }, 401);
        }

        const hashedAttempt = crypto.scryptSync(password, 'gigsync_salt_tier2', 32).toString('hex');
        if (hashedAttempt !== user.password_hash) {
            return sendJSON(res, { status: 'error', message: 'Incorrect password.' }, 401);
        }

        const sessionToken = crypto.randomBytes(24).toString('hex');
        runtimeState.sessions[sessionToken] = user;

        let extraProfile = null;
        if (user.role === 'worker') {
            extraProfile = runtimeState.workers.find(w => w.user_id === user.id) || { trade: 'Specialist', rating: 5.0, price: 300 };
        }

        return sendJSON(res, {
            status: 'success',
            message: 'Login successful.',
            token: sessionToken,
            user: {
                id: user.id,
                name: user.name,
                phone: user.phone,
                email: user.email,
                role: user.role,
                city: user.city,
                area: user.area,
                profile: extraProfile
            }
        });
    }

    // 2. POST /api/auth/register
    if (pathname.endsWith('/auth/register') && req.method === 'POST') {
        const body = await parseBody(req);
        const cleanPhone = (body.phone || '').replace(/\D/g, '');
        const role = body.role || 'customer';

        if (role === 'admin') {
            const adminSecret = body.adminSecret || '';
            if (adminSecret !== 'gigsync@admin2026') {
                return sendJSON(res, { status: 'error', message: 'Access Denied: Valid Master Admin Security Key required.' }, 403);
            }
        }

        const existing = runtimeState.users.find(u => u.phone === cleanPhone);
        if (existing) {
            return sendJSON(res, { status: 'error', message: 'An account with this phone number already exists.' }, 409);
        }

        const newUser = {
            id: runtimeState.users.length + 1,
            name: body.name || 'User',
            phone: cleanPhone,
            email: body.email || null,
            role,
            password_hash: crypto.scryptSync(body.password || 'password123', 'gigsync_salt_tier2', 32).toString('hex'),
            city: body.city || 'Ramanagara',
            area: body.area || 'Town'
        };
        runtimeState.users.push(newUser);

        if (role === 'worker') {
            const newWorker = {
                id: runtimeState.workers.length + 1,
                user_id: newUser.id,
                name: newUser.name,
                phone: cleanPhone,
                trade: body.trade || 'General Specialist',
                service: (body.trade || 'general').toLowerCase(),
                tools: body.tools || 'Standard tool kit',
                rating: 5.0,
                jobs_completed: 0,
                price: body.price || 300,
                is_available: 1,
                is_verified: 1,
                city: newUser.city,
                area: newUser.area
            };
            runtimeState.workers.push(newWorker);
        }

        const sessionToken = crypto.randomBytes(24).toString('hex');
        runtimeState.sessions[sessionToken] = newUser;

        return sendJSON(res, {
            status: 'success',
            message: 'Account registered successfully.',
            token: sessionToken,
            user: newUser
        }, 201);
    }

    // 3. GET /api/auth/me
    if (pathname.endsWith('/auth/me') && req.method === 'GET') {
        const user = runtimeState.sessions[token];
        if (!user) return sendJSON(res, { status: 'error', message: 'Unauthorized' }, 401);

        let profile = null;
        if (user.role === 'worker') {
            profile = runtimeState.workers.find(w => w.user_id === user.id);
        }
        return sendJSON(res, { status: 'success', user: { ...user, profile } });
    }

    // 4. POST /api/auth/logout
    if (pathname.endsWith('/auth/logout') && req.method === 'POST') {
        if (token && runtimeState.sessions[token]) {
            delete runtimeState.sessions[token];
        }
        return sendJSON(res, { status: 'success', message: 'Logged out.' });
    }

    // 5. GET /api/workers
    if (pathname.endsWith('/workers') && req.method === 'GET') {
        return sendJSON(res, { status: 'success', count: runtimeState.workers.length, workers: runtimeState.workers });
    }

    // 6. GET & POST /api/jobs
    if (pathname.endsWith('/jobs') && req.method === 'GET') {
        return sendJSON(res, { status: 'success', count: runtimeState.jobs.length, jobs: runtimeState.jobs, opportunities: [] });
    }
    if (pathname.endsWith('/jobs') && req.method === 'POST') {
        const body = await parseBody(req);
        const newJob = {
            id: `GS-${Math.floor(1000 + Math.random() * 9000)}`,
            customer_phone: body.customer_phone || '9876543210',
            customer_name: body.customer_name || 'Customer',
            service: body.service || 'Electrical',
            problem_description: body.problem_description || 'Service request',
            location: body.location || 'Town Area',
            city: body.city || 'Ramanagara',
            requested_date: body.requested_date || 'Today',
            requested_time: body.requested_time || 'Immediate',
            budget: body.budget || '₹350',
            status: 'Requested',
            created_at: new Date().toISOString()
        };
        runtimeState.jobs.unshift(newJob);
        return sendJSON(res, { status: 'success', message: 'Job created', job: newJob }, 201);
    }

    // 7. GET /api/call-logs
    if (pathname.endsWith('/call-logs') && req.method === 'GET') {
        return sendJSON(res, { status: 'success', count: runtimeState.callLogs.length, callLogs: runtimeState.callLogs });
    }

    // 8. POST /api/ai/voice-call
    if (pathname.endsWith('/ai/voice-call') && req.method === 'POST') {
        const body = await parseBody(req);
        const speech = body.speechText || '';
        let response = "Namaskara! I am your GigSync Assistant. How can I help you today?";
        if (speech.toLowerCase().includes('plumber') || speech.includes('ಪ್ಲಂಬರ್')) {
            response = "I found 2 verified plumbers available in your area. Standard visit charge is ₹280.";
        } else if (speech.toLowerCase().includes('electrician') || speech.includes('ಎಲೆಕ್ಟ್ರಿಷಿಯನ್')) {
            response = "Electrician request received for Ramanagara. Dispatching to nearest on-duty technician.";
        }

        const logEntry = {
            id: runtimeState.callLogs.length + 1,
            caller_phone: body.callerPhone || '9876543210',
            caller_role: body.callerRole || 'customer',
            transcript: speech,
            intent_detected: 'voice_dispatch',
            duration_seconds: 12,
            timestamp: new Date().toISOString()
        };
        runtimeState.callLogs.unshift(logEntry);

        return sendJSON(res, { status: 'success', spokenResponse: response, log: logEntry });
    }

    // Default Fallback
    return sendJSON(res, { status: 'ok', message: 'GigSync Vercel API Gateway Active' });
};
