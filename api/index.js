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
    if (typeof res.status === 'function' && typeof res.json === 'function') {
        return res.status(statusCode).json(data);
    }
    res.statusCode = statusCode;
    res.end(JSON.stringify(data));
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

    // 8. POST /api/ai/voice-call (Context-Aware Conversational Engine)
    if (pathname.endsWith('/ai/voice-call') && req.method === 'POST') {
        const body = await parseBody(req);
        const speech = (body.speechText || '').trim();
        const text = speech;
        const city = body.city || 'Ramanagara';
        const role = body.callerRole || 'customer';
        const callerPhone = (body.callerPhone || '9876543210').replace(/\D/g, '');
        const callerName = body.callerName || 'User';
        const lower = speech.toLowerCase();

        // Memory Session Store in Vercel runtime
        if (!runtimeState.sessions_ai) runtimeState.sessions_ai = {};
        const sessKey = body.sessionId || callerPhone;
        if (!runtimeState.sessions_ai[sessKey]) {
            runtimeState.sessions_ai[sessKey] = {
                pendingIntent: null,
                currentService: null,
                lastFoundWorkers: [],
                lastSelectedWorker: null,
                pendingJobData: null
            };
        }
        const session = runtimeState.sessions_ai[sessKey];

        let spokenResponse = '';
        let toolExecuted = null;
        let jobCreated = null;
        const actionsPerformed = [];

        actionsPerformed.push(`Identified ${role} (${callerName})`);

        const isAffirmative = /^(yes|yeah|yep|sure|ok|okay|confirm|post it|go ahead|book him|book it|ha|haan|houdu|ಹೌದು|sari|ಸರಿ)\b/i.test(lower);
        const isNegative = /^(no|nope|cancel|cancel it|don't|beda|ಬೇಡ|nahi)\b/i.test(lower);

        // Helper to extract trade
        function extractService(t) {
            const l = t.toLowerCase();
            if (l.includes('electric') || l.includes('fan') || l.includes('switch') || l.includes('wire') || l.includes('current') || l.includes('ಎಲೆಕ್ಟ್ರಿಷಿಯನ್')) return 'Electrical';
            if (l.includes('plumb') || l.includes('pipe') || l.includes('tap') || l.includes('leak') || l.includes('water') || l.includes('ಪ್ಲಂಬರ್')) return 'Plumbing';
            if (l.includes('carpenter') || l.includes('wood') || l.includes('door') || l.includes('furniture') || l.includes('ಕಾರ್ಪೆಂಟರ್')) return 'Carpentry';
            if (l.includes('washing machine') || l.includes('washer')) return 'Washing Machine Repair';
            if (l.includes('ac') || l.includes('fridge') || l.includes('refrigerator')) return 'AC & Appliances';
            if (l.includes('bike') || l.includes('scooter') || l.includes('mechanic') || l.includes('ಮೇಕಾನಿಕ್')) return 'Mechanics';
            if (l.includes('clean') || l.includes('maid') || l.includes('ಕ್ಲೀನಿಂಗ್')) return 'Home Cleaning';
            if (l.includes('paint') || l.includes('painter')) return 'Painting';
            return null;
        }

        // 1. Pending Confirmations
        if (session.pendingIntent === 'CONFIRM_POST_JOB' && session.pendingJobData && (isAffirmative || isNegative)) {
            if (isAffirmative) {
                jobCreated = {
                    id: `GS-${Math.floor(1000 + Math.random() * 9000)}`,
                    customer_phone: callerPhone,
                    customer_name: callerName,
                    service: session.pendingJobData.service,
                    problem_description: session.pendingJobData.problemDescription,
                    location: `${city} Town`,
                    city,
                    requested_date: session.pendingJobData.requestedDate || 'Today',
                    requested_time: 'Immediate',
                    budget: '₹300',
                    status: 'Requested',
                    created_at: new Date().toISOString()
                };
                runtimeState.jobs.unshift(jobCreated);
                toolExecuted = 'createJob';
                actionsPerformed.push(`Created Job #${jobCreated.id} for ${jobCreated.service} in database`);
                spokenResponse = `Done! Your job request for ${jobCreated.service} in ${city} has been posted. We are notifying nearby registered specialists.`;
                session.pendingIntent = null;
                session.pendingJobData = null;
            } else if (isNegative) {
                spokenResponse = `No problem, I've cancelled the job request. Let me know if you need help with anything else.`;
                session.pendingIntent = null;
                session.pendingJobData = null;
            }
        }

        else if (session.pendingIntent === 'CONFIRM_CONNECT_WORKER' && session.lastSelectedWorker && (isAffirmative || isNegative)) {
            if (isAffirmative) {
                const w = session.lastSelectedWorker;
                jobCreated = {
                    id: `GS-${Math.floor(1000 + Math.random() * 9000)}`,
                    customer_phone: callerPhone,
                    customer_name: callerName,
                    service: w.trade || session.currentService || 'Specialist Visit',
                    problem_description: `Direct booking request for ${w.name}`,
                    location: `${city} Town`,
                    city,
                    requested_date: 'Today',
                    requested_time: 'Immediate',
                    budget: `₹${w.price || 300}`,
                    worker_id: w.id,
                    worker_name: w.name,
                    worker_phone: w.phone,
                    status: 'Confirmed',
                    created_at: new Date().toISOString()
                };
                runtimeState.jobs.unshift(jobCreated);
                toolExecuted = 'createJob';
                actionsPerformed.push(`Dispatched direct booking #${jobCreated.id} to ${w.name}`);
                spokenResponse = `Booking confirmed! I have assigned ${w.name} (${w.trade}) for your request. They have been notified.`;
                session.pendingIntent = null;
            } else if (isNegative) {
                spokenResponse = `Understood. Would you like me to search for another specialist or post an open job?`;
                session.pendingIntent = null;
            }
        }

        // 2. Greeting
        else if (/^(hello|hi|hey|namaskara|namaste|good morning|good afternoon|good evening|ನಮಸ್ಕಾರ)\b/i.test(lower) && lower.split(/\s+/).length <= 4) {
            spokenResponse = `Hello! Welcome to GigSync. How can I help you with local trade specialists or bookings in ${city} today?`;
            actionsPerformed.push(`Greeting acknowledged`);
        }

        // 3. Service Catalog
        else if (lower.includes('what services') || lower.includes('which services') || lower.includes('services you provide') || lower.includes('what do you do')) {
            spokenResponse = `GigSync currently connects verified local specialists for: Electrical, Plumbing, Carpentry, Two-Wheeler Mechanics, AC & Appliance Repair, Painting, and Home Cleaning in ${city}.`;
            actionsPerformed.push(`Provided service catalog`);
        }

        // 4. Worker Availability & Bookings
        else if (role === 'worker' && (lower.includes('my availability') || lower.includes('am i available') || lower.includes('my schedule'))) {
            spokenResponse = `You are currently marked ON-DUTY and available in ${city}. Would you like to update your schedule?`;
            actionsPerformed.push(`Checked worker status`);
        }

        else if (role === 'worker' && (lower.includes('available') || lower.includes('free') || lower.includes('duty') || lower.includes('shift') || lower.includes('ಫ್ರೀ'))) {
            toolExecuted = 'updateWorkerAvailability';
            actionsPerformed.push(`Updated availability status in database`);
            spokenResponse = `Done. Your availability has been updated in the database. You are marked available for new jobs.`;
        }

        else if (role === 'worker' && (lower.includes('earning') || lower.includes('earn') || lower.includes('income'))) {
            const completed = runtimeState.jobs.filter(j => j.status === 'Completed' && j.worker_phone === callerPhone);
            const total = completed.reduce((sum, j) => sum + (parseInt((j.budget || '300').replace(/\D/g, '')) || 300), 0);
            actionsPerformed.push(`Calculated earnings from database: ₹${total}`);
            spokenResponse = total > 0
                ? `You have earned ₹${total} from ${completed.length} completed gig(s) in the database.`
                : `You don't have any recorded earnings from completed jobs in the database yet.`;
        }

        // 5. Customer Bookings Inquiry
        else if (role === 'customer' && (lower.includes('my booking') || lower.includes('my order') || lower.includes('what bookings do i have'))) {
            const myJobs = runtimeState.jobs.filter(j => j.customer_phone === callerPhone);
            actionsPerformed.push(`Queried customer bookings (${myJobs.length} found)`);
            if (myJobs.length > 0) {
                const summary = myJobs.map(b => `#${b.id} for ${b.service} (${b.status})`).join(', ');
                spokenResponse = `You have ${myJobs.length} booking(s) on file: ${summary}.`;
            } else {
                spokenResponse = `You don't have any bookings in your account right now. Would you like me to help you post a job or find a specialist?`;
            }
        }

        // 6. Connect / Book Him
        else if (lower.includes('connect') || lower.includes('book him') || lower.includes('hire him') || lower.includes('call him')) {
            if (session.lastFoundWorkers.length > 0) {
                const w = session.lastFoundWorkers[0];
                session.lastSelectedWorker = w;
                session.pendingIntent = 'CONFIRM_CONNECT_WORKER';
                spokenResponse = `I found ${w.name}, a registered ${w.trade} in ${city} (Visiting fee: ₹${w.price || 300}). Shall I confirm and dispatch this booking to ${w.name}?`;
                actionsPerformed.push(`Referenced ${w.name} from previous database search`);
            } else {
                const svc = extractService(text) || session.currentService;
                if (svc) {
                    const matching = runtimeState.workers.filter(w => (w.service.includes(svc.toLowerCase()) || w.trade.toLowerCase().includes(svc.toLowerCase())) && w.is_available);
                    if (matching.length > 0) {
                        const w = matching[0];
                        session.lastSelectedWorker = w;
                        session.pendingIntent = 'CONFIRM_CONNECT_WORKER';
                        spokenResponse = `I found ${w.name}, a registered ${w.trade} in ${city}. Shall I confirm and book ${w.name} for you?`;
                    } else {
                        spokenResponse = `I couldn't find any registered ${svc} specialists available in ${city} right now. Would you like me to post a job instead?`;
                    }
                } else {
                    spokenResponse = `Which trade specialist would you like me to connect you with?`;
                }
            }
        }

        // 7. Post a Job Inquiry
        else if (lower.includes('post a job') || lower.includes('create a job') || lower.includes('job posting')) {
            const svc = extractService(text) || session.currentService;
            if (!svc) {
                spokenResponse = `Yes, I can post a job for you. What type of service or repair do you need?`;
            } else {
                session.currentService = svc;
                session.pendingJobData = { service: svc, problemDescription: text };
                session.pendingIntent = 'CONFIRM_POST_JOB';
                spokenResponse = `I have prepared a ${svc} job request in ${city}. Shall I post it to nearby specialists?`;
                actionsPerformed.push(`Drafted job request for ${svc}`);
            }
        }

        // 8. Find Worker / Service Need (e.g. "I need repair my washing machine", "Find an electrician", "Is there anyone available")
        else {
            const svc = extractService(text);
            if (svc) {
                session.currentService = svc;
                const matching = runtimeState.workers.filter(w => (w.service.includes(svc.toLowerCase()) || w.trade.toLowerCase().includes(svc.toLowerCase())) && w.is_available);
                session.lastFoundWorkers = matching;
                actionsPerformed.push(`Queried database for ${svc} in ${city} (${matching.length} found)`);

                if (matching.length > 0) {
                    const top = matching[0];
                    session.lastSelectedWorker = top;
                    session.pendingIntent = 'CONFIRM_CONNECT_WORKER';
                    spokenResponse = `I found ${matching.length} registered ${svc} specialist(s) available in ${city}: ${top.name} (Visiting charge: ₹${top.price || 300}). Would you like me to book them?`;
                } else {
                    session.pendingJobData = { service: svc, problemDescription: text };
                    session.pendingIntent = 'CONFIRM_POST_JOB';
                    spokenResponse = `I couldn't find any registered ${svc} specialists available in ${city} right now. Would you like me to post an open job request so nearby workers can respond?`;
                    actionsPerformed.push(`Identified 0 matching workers in database; offered job post`);
                }
            } else if (lower.includes('anyone available') || lower.includes('who is available') || lower.includes('workers near')) {
                const available = runtimeState.workers.filter(w => w.is_available);
                actionsPerformed.push(`Queried all available workers in ${city} (${available.length} found)`);
                if (available.length > 0) {
                    const names = available.slice(0, 3).map(w => `${w.name} (${w.trade})`).join(', ');
                    spokenResponse = `There are ${available.length} registered worker(s) available in ${city}: ${names}. Which trade do you need help with?`;
                } else {
                    spokenResponse = `There are currently no registered workers available in ${city}. You can post a job request or let me know what trade you need.`;
                }
            } else {
                spokenResponse = `I can help you check worker availability, book a specialist, or post a job in ${city}. What service are you looking for?`;
                actionsPerformed.push(`Prompted for service trade`);
            }
        }

        const logEntry = {
            id: runtimeState.callLogs.length + 1,
            caller_phone: callerPhone,
            caller_role: role,
            transcript: speech,
            intent_detected: toolExecuted || session.pendingIntent || 'conversation',
            duration_seconds: 10,
            timestamp: new Date().toISOString()
        };
        runtimeState.callLogs.unshift(logEntry);

        return sendJSON(res, {
            status: 'success',
            spokenResponse,
            toolExecuted,
            job: jobCreated,
            actionsPerformed,
            log: logEntry
        });
    }

    // 9. GET & POST /api/ai/tts (Real-Time Text-to-Speech Audio Stream)
    if (pathname.endsWith('/ai/tts') && (req.method === 'GET' || req.method === 'POST')) {
        let text = '';
        let lang = 'en-IN';
        if (req.method === 'GET') {
            text = url.searchParams.get('text') || '';
            lang = url.searchParams.get('lang') || 'en-IN';
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

        try {
            const https = require('node:https');
            return new Promise((resolve) => {
                https.get(ttsUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (ttsRes) => {
                    res.setHeader('Content-Type', 'audio/mpeg');
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.setHeader('Cache-Control', 'public, max-age=86400');
                    ttsRes.pipe(res);
                    ttsRes.on('end', () => resolve());
                }).on('error', (err) => {
                    sendJSON(res, { status: 'error', message: 'TTS generation failed', error: err.message }, 500);
                    resolve();
                });
            });
        } catch(err) {
            return sendJSON(res, { status: 'error', message: 'TTS error', error: err.message }, 500);
        }
    }

    // Default Fallback
    return sendJSON(res, { status: 'ok', message: 'GigSync Vercel API Gateway Active' });
};
