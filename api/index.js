/* ==========================================================================
   GigSync — Vercel Serverless Function Handler (/api/*)
   Supports Real Auth, Worker Operations, Customer Jobs, and Admin Gateway
   ========================================================================== */

const DB = require('../backend/database');
const { aiAgent } = require('../backend/ai_agent');
const { resolveAiCaller } = require('../backend/caller_identity');

/* --------------------------------------------------------------------------
   Persistence note

   There is deliberately no in-memory fallback store in this file. Every read and
   write below goes to backend/database.js. If a database call fails, the endpoint
   reports the failure instead of fabricating a record — a job that was never
   saved must not come back with an id that looks like it was.
   -------------------------------------------------------------------------- */

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
        // res.status() is a Vercel/Express helper; guard it so this handler can also be
        // mounted on a plain node:http server (which is how it gets tested).
        if (typeof res.status === 'function') return res.status(204).end();
        res.statusCode = 204;
        return res.end();
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

        // One authentication path: the real database. The old fallback re-hashed the
        // password against an in-file copy of the user list, and would even create the
        // admin account on the fly for 9999999999 — so a login could succeed against a
        // record no other endpoint could see.
        let session = null;
        try {
            session = DB.authenticateUser(cleanPhone, password);
        } catch (err) {
            console.error('[Vercel Login Error]', err);
            return sendJSON(res, { status: 'error', message: 'Sign-in is temporarily unavailable. Please try again.' }, 503);
        }

        if (!session) {
            return sendJSON(res, { status: 'error', message: 'Invalid mobile number or password.' }, 401);
        }

        return sendJSON(res, {
            status: 'success',
            message: 'Login successful.',
            ...session
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

        if (cleanPhone.length !== 10) {
            return sendJSON(res, { status: 'error', message: 'A valid 10-digit mobile number is required.' }, 400);
        }
        if (!body.password) {
            return sendJSON(res, { status: 'error', message: 'A password is required.' }, 400);
        }

        try {
            const user = DB.createUser({
                name: (body.name || 'User').trim(),
                phone: cleanPhone,
                email: body.email ? body.email.trim() : null,
                role,
                password: body.password,
                city: body.city || 'Ramanagara',
                area: body.area || 'Town'
            });

            if (role === 'worker') {
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
        } catch (err) {
            if (err.message && err.message.includes('UNIQUE')) {
                return sendJSON(res, { status: 'error', message: 'An account with this phone number already exists.' }, 409);
            }
            // No in-memory fallback. Registration either created a real row or it did not;
            // handing back a token for an account that was never stored would let the next
            // request find nothing.
            console.error('[Vercel Register Error]', err);
            return sendJSON(res, { status: 'error', message: 'Could not create the account. Please try again.' }, 500);
        }
    }

    // 3. GET /api/auth/me
    if (pathname.endsWith('/auth/me') && req.method === 'GET') {
        const session = token ? DB.getSession(token) : null;
        if (!session) {
            return sendJSON(res, { status: 'error', message: 'Unauthorized' }, 401);
        }

        const profile = session.role === 'worker'
            ? DB.getWorkerByUserId(session.user_id)
            : DB.getUserById(session.user_id);

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

    // 4. POST /api/auth/logout
    if (pathname.endsWith('/auth/logout') && req.method === 'POST') {
        if (token) {
            try { DB.deleteSession(token); } catch (_) {}
        }
        return sendJSON(res, { status: 'success', message: 'Logged out.' });
    }

    // 5. GET /api/workers
    if (pathname.endsWith('/workers') && req.method === 'GET') {
        const city = url.searchParams.get('city') || null;
        const service = url.searchParams.get('service') || null;
        const available = url.searchParams.get('available');
        const minRating = url.searchParams.get('minRating');

        // An empty result means there really are no matching workers. It used to fall
        // through to a hardcoded list of three Ramanagara specialists, so a customer
        // searching an unserved city was shown workers who could never accept the job.
        let workers = [];
        try {
            workers = DB.getAllWorkers({
                city,
                service,
                minRating,
                isAvailable: available !== null ? available === 'true' : undefined
            });
        } catch (err) {
            console.error('[Vercel Workers Error]', err);
            return sendJSON(res, { status: 'error', message: 'Could not load specialists right now.' }, 503);
        }

        return sendJSON(res, { status: 'success', count: workers.length, workers });
    }

    // 5b. GET /api/workers/:id/schedule & GET /api/workers/me/schedule
    const schedMatch = pathname.match(/\/workers\/(\d+|me)\/schedule/);
    if (schedMatch && req.method === 'GET') {
        let workerId = schedMatch[1];
        if (workerId === 'me') {
            const authSession = token ? DB.getSession(token) : null;
            if (!authSession) {
                return sendJSON(res, { status: 'error', message: 'Sign in to view your schedule.' }, 401);
            }
            const w = DB.getWorkerByUserId(authSession.user_id);
            if (!w) {
                return sendJSON(res, { status: 'error', message: 'No worker profile is linked to this account.' }, 404);
            }
            workerId = w.id;
        }

        const sched = DB.getWorkerSchedule(Number(workerId));
        if (!sched) {
            return sendJSON(res, { status: 'error', message: 'That worker was not found.' }, 404);
        }
        return sendJSON(res, { status: 'success', ...sched });
    }

    // 6. GET & POST /api/jobs
    if (pathname.endsWith('/jobs') && req.method === 'GET') {
        let jobs = [];
        try {
            jobs = DB.getAllJobs();
        } catch (err) {
            console.error('[Vercel Jobs Error]', err);
            return sendJSON(res, { status: 'error', message: 'Could not load jobs right now.' }, 503);
        }
        return sendJSON(res, { status: 'success', count: jobs.length, jobs, opportunities: [] });
    }
    if (pathname.endsWith('/jobs') && req.method === 'POST') {
        const body = await parseBody(req);

        // The customer's phone is how the worker reaches them and how the job is later
        // matched back to its customer, so it has to be the real one. The old default of
        // '9876543210' filed every anonymous request under one phantom number.
        const customerPhone = (body.customer_phone || '').replace(/\D/g, '');
        if (customerPhone.length !== 10) {
            return sendJSON(res, { status: 'error', message: 'A 10-digit customer mobile number is required to create a job.' }, 400);
        }
        if (!body.problem_description) {
            return sendJSON(res, { status: 'error', message: 'Please describe the problem so a specialist knows what to bring.' }, 400);
        }

        try {
            const created = DB.createJob({
                customer_phone: customerPhone,
                customer_name: body.customer_name || 'Customer',
                service: body.service || 'Electrical',
                problem_description: body.problem_description,
                location: body.location || 'Town Area',
                city: body.city || 'Ramanagara',
                requested_date: body.requested_date || 'Today',
                requested_time: body.requested_time || 'Immediate',
                budget: body.budget || null
            });
            if (!created) {
                return sendJSON(res, { status: 'error', message: 'The job could not be saved. Please try again.' }, 500);
            }
            return sendJSON(res, { status: 'success', message: 'Job created', job: created }, 201);
        } catch (err) {
            console.error('[Vercel Create Job Error]', err);
            return sendJSON(res, { status: 'error', message: 'The job could not be saved. Please try again.' }, 500);
        }
    }

    // 7. GET /api/call-logs
    if (pathname.endsWith('/call-logs') && req.method === 'GET') {
        // getAllCallLogs, not getCallLogs — the old name did not exist on DB, so this
        // endpoint silently returned only the calls handled by the current warm lambda.
        let callLogs = [];
        try {
            callLogs = DB.getAllCallLogs();
        } catch (err) {
            console.error('[Vercel Call Logs Error]', err);
            return sendJSON(res, { status: 'error', message: 'Could not load call logs right now.' }, 503);
        }
        return sendJSON(res, { status: 'success', count: callLogs.length, callLogs });
    }
    // 8. POST /api/ai/voice-call & POST /api/ai/chat (Unified Context-Aware Conversational Engine)
    if ((pathname.endsWith('/ai/voice-call') || pathname.endsWith('/ai/chat')) && req.method === 'POST') {
        const body = await parseBody(req);
        const speechText = body.speechText || body.message || '';

        if (!speechText) {
            return sendJSON(res, { status: 'error', message: 'speechText or message is required.' }, 400);
        }

        const isVoice = pathname.endsWith('/ai/voice-call') || body.isVoiceCall === true || body.portal === 'terminal';
        const session = (!isVoice && token) ? DB.getSession(token) : null;
        const identity = resolveAiCaller(session, { ...body, isVoiceCall: isVoice });
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
                isVoiceCall: isVoice,
                portal: body.portal,
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
            console.error('[Vercel AI Error]', err);
            return sendJSON(res, {
                status: 'error',
                message: err.message || 'AI Voice Agent processing error'
            }, 500);
        }
    }

    // 8a. POST /api/ai/reset-session (Reset in-progress worker draft & voice session state)
    if (pathname.endsWith('/ai/reset-session') && req.method === 'POST') {
        const body = await parseBody(req);
        const sessionId = body && body.sessionId;
        if (sessionId) {
            const { sessionManager } = require('../backend/ai_agent');
            if (sessionManager && sessionManager.resetSession) {
                sessionManager.resetSession(sessionId);
            }
        }
        return sendJSON(res, { status: 'success', message: 'Voice session reset.' });
    }

    // 8b. GET /api/ai/caller?phone=XXXXXXXXXX — who does this number belong to?
    if (pathname.endsWith('/ai/caller') && req.method === 'GET') {
        const session = token ? DB.getSession(token) : null;
        const identity = resolveAiCaller(session, { callerPhone: url.searchParams.get('phone') || '' });
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

    // 10. GET /api/events (SSE Stream for Live Updates)
    if (pathname.endsWith('/events') && req.method === 'GET') {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        if (typeof res.status === 'function') res.status(200);
        else res.statusCode = 200;
        res.write('event: ready\ndata: {}\n\n');
        return res.end();
    }

    // Default Fallback
    return sendJSON(res, { status: 'ok', message: 'GigSync Vercel API Gateway Active' });
};
