/* ==========================================================================
   GigSync — Full-Stack Server & Telephony Gateway
   Port 8089: Static SPA + REST APIs + SQLite DB + AI Voice Engine
   ========================================================================== */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

const DB = require('./database');
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
    '.ico': 'image/x-icon'
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
       1. REST API ENDPOINTS
       ---------------------------------------------------------------------- */

    // GET /api/workers
    if (pathname === '/api/workers' && req.method === 'GET') {
        const filters = {
            service: parsedUrl.query.service || null,
            maxKm: parsedUrl.query.maxKm || null,
            minRating: parsedUrl.query.minRating || null,
            isAvailable: parsedUrl.query.available !== undefined ? parsedUrl.query.available === 'true' : undefined
        };
        const workers = DB.getAllWorkers(filters);
        return sendJSON(res, { status: 'success', count: workers.length, workers });
    }

    // POST /api/workers
    if (pathname === '/api/workers' && req.method === 'POST') {
        const body = await parseBody(req);
        if (!body.name || !body.phone || !body.trade) {
            return sendJSON(res, { status: 'error', message: 'Name, phone, and trade are required.' }, 400);
        }
        const created = DB.createWorker(body);
        return sendJSON(res, { status: 'success', worker: created }, 201);
    }

    // GET /api/jobs
    if (pathname === '/api/jobs' && req.method === 'GET') {
        const status = parsedUrl.query.status || null;
        const phone = parsedUrl.query.phone || null;
        let jobs;
        if (phone) {
            jobs = DB.getJobsByPhone(phone);
        } else {
            jobs = DB.getAllJobs(status);
        }
        return sendJSON(res, { status: 'success', count: jobs.length, jobs });
    }

    // POST /api/jobs
    if (pathname === '/api/jobs' && req.method === 'POST') {
        const body = await parseBody(req);
        if (!body.service || !body.problem_description) {
            return sendJSON(res, { status: 'error', message: 'Service and problem description are required.' }, 400);
        }
        const created = DB.createJob(body);
        return sendJSON(res, { status: 'success', job: created }, 201);
    }

    // PATCH /api/jobs/:id
    if (pathname.startsWith('/api/jobs/') && req.method === 'PATCH') {
        const id = pathname.replace('/api/jobs/', '');
        const body = await parseBody(req);
        const updated = DB.updateJobStatus(id, body.status || 'Accepted', body.worker_id, body.worker_name);
        return sendJSON(res, { status: 'success', job: updated });
    }

    // GET /api/call-logs
    if (pathname === '/api/call-logs' && req.method === 'GET') {
        const logs = DB.getRecentCallLogs(30);
        return sendJSON(res, { status: 'success', count: logs.length, logs });
    }

    // POST /api/ai/voice-call (Main AI Telephony / Call Processing Engine)
    if (pathname === '/api/ai/voice-call' && req.method === 'POST') {
        const body = await parseBody(req);
        const callerPhone = body.callerPhone || '9876543210';
        const callerRole = body.callerRole || 'customer';
        const speechText = body.speechText || 'I need an electrician tomorrow morning.';

        try {
            const callResult = await aiAgent.processCallTurn(callerPhone, callerRole, speechText);
            return sendJSON(res, {
                status: 'success',
                callerPhone,
                speechReceived: speechText,
                spokenResponse: callResult.spokenResponse,
                toolExecuted: callResult.toolExecuted,
                toolArgs: callResult.toolArgs,
                toolResult: callResult.toolResult,
                callerRole: callResult.callerRole
            });
        } catch (err) {
            console.error('Voice Call Processing Error:', err);
            return sendJSON(res, { status: 'error', message: 'Internal AI voice processing error.' }, 500);
        }
    }

    // POST /api/telephony/twilio/voice (Twilio / Telecom Cloud Webhook)
    if (pathname === '/api/telephony/twilio/voice' && (req.method === 'POST' || req.method === 'GET')) {
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Aditi" language="en-IN">Namaskara! Welcome to GigSync AI local voice assistance for Ramanagara. Please state your requirement after the beep.</Say>
    <Record timeout="10" action="/api/telephony/twilio/recording" />
</Response>`;
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        res.end(twiml);
        return;
    }

    /* ----------------------------------------------------------------------
       2. STATIC FILE SERVER (SPA Web Application)
       ---------------------------------------------------------------------- */
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname.replace('/', ''));
    // Security check: ensure path is inside PUBLIC_DIR
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        return res.end('Forbidden');
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            // SPA Fallback: serve index.html
            filePath = path.join(PUBLIC_DIR, 'index.html');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        fs.readFile(filePath, (readErr, content) => {
            if (readErr) {
                res.writeHead(500);
                res.end('Server Read Error');
                return;
            }
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        });
    });
});

server.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(` GigSync Full-Stack Server & AI Voice Gateway`);
    console.log(` Running at: http://localhost:${PORT}/`);
    console.log(` SQLite Database: Connected (gigsync.db)`);
    console.log(` AI Tools Loaded: 11 Live Functions`);
    console.log(` AI Telephony Endpoint: POST http://localhost:${PORT}/api/ai/voice-call`);
    console.log(`=======================================================`);
});
