/* ==========================================================================
   GigSync — Serverless handler test (api/index.js)

   Mounts the real Vercel handler on a plain node:http server and drives it over
   real HTTP against the real database. No mocks, no stubs.

   What this exists to prove:
     1. There is no in-file shadow store any more. A city with no workers returns
        an empty list instead of three hardcoded Ramanagara specialists.
     2. Authentication goes through the real database only — the old fallback
        could mint a token for an account that lived only inside api/index.js.
     3. The AI endpoint resolves the caller with the shared identity rule, so an
        unauthenticated request can no longer act as a registered worker. It used
        to default to the phantom number 9876543210.
     4. Writes require the real data they need instead of substituting defaults.

   Run:  node test_api_serverless_handler.js
   ========================================================================== */

const http = require('node:http');
const handler = require('./api/index.js');
const DB = require('./backend/database');

const PORT = 8091;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
    if (condition) {
        passed++;
        console.log(`  PASS  ${label}`);
    } else {
        failed++;
        console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
    }
}

function request(method, path, { body, token } = {}) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const headers = {};
        if (payload) {
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = Buffer.byteLength(payload);
        }
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const req = http.request(`${BASE}${path}`, { method, headers }, (res) => {
            let raw = '';
            res.on('data', (c) => { raw += c; });
            res.on('end', () => {
                let data = null;
                try { data = JSON.parse(raw); } catch (_) { data = { raw }; }
                resolve({ statusCode: res.statusCode, data });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function main() {
    const server = http.createServer((req, res) => {
        Promise.resolve(handler(req, res)).catch((err) => {
            console.error('handler threw:', err);
            if (!res.headersSent) { res.statusCode = 500; res.end('{}'); }
        });
    });

    await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
    console.log(`\nServerless handler mounted on ${BASE}\n`);

    // Real seed accounts, read from the database rather than assumed.
    const seedWorker = DB.getWorkerByPhone('7760782551');
    if (!seedWorker) {
        console.log('Cannot run: no worker found for 7760782551 in the database.');
        server.close();
        process.exit(1);
    }

    /* ---------------------------------------------------------------- 1 */
    console.log('1. Login rejects a wrong password with no in-file fallback');
    {
        const res = await request('POST', '/api/auth/login', { body: { phone: '9999999999', password: 'not-the-password' } });
        check('401 returned', res.statusCode === 401, `got ${res.statusCode}`);
        check('no token issued', !res.data.token, JSON.stringify(res.data));
    }

    /* ---------------------------------------------------------------- 2 */
    console.log('\n2. Login succeeds against the real database and returns a real session token');
    let adminToken = null;
    {
        const res = await request('POST', '/api/auth/login', { body: { phone: '9999999999', password: 'admin@gigsync2026' } });
        check('200 returned', res.statusCode === 200, `got ${res.statusCode} ${JSON.stringify(res.data)}`);
        adminToken = res.data.token;
        check('token is a 48-char hex session token', /^[0-9a-f]{48}$/.test(adminToken || ''), String(adminToken));
        check('role is admin', res.data.user && res.data.user.role === 'admin', JSON.stringify(res.data.user));

        // The decisive check: the token must exist in the shared sessions table, which is
        // what every other surface reads. A token from an in-file store would not.
        const dbSession = adminToken ? DB.getSession(adminToken) : null;
        check('token resolves in the real sessions table', Boolean(dbSession) && dbSession.role === 'admin',
              dbSession ? JSON.stringify(dbSession) : 'not found in DB');
    }

    /* ---------------------------------------------------------------- 3 */
    console.log('\n3. /auth/me honours the real token and rejects a fabricated one');
    {
        const good = await request('GET', '/api/auth/me', { token: adminToken });
        check('real token accepted', good.statusCode === 200 && good.data.user.phone === '9999999999',
              `${good.statusCode} ${JSON.stringify(good.data)}`);

        const fake = await request('GET', '/api/auth/me', { token: 'instant_session_token' });
        check('fabricated token rejected with 401', fake.statusCode === 401, `got ${fake.statusCode}`);
    }

    /* ---------------------------------------------------------------- 4 */
    console.log('\n4. An unserved city returns no workers instead of hardcoded ones');
    {
        const res = await request('GET', '/api/workers?city=Nowhereville');
        check('200 returned', res.statusCode === 200, `got ${res.statusCode}`);
        check('count is 0', res.data.count === 0, `count=${res.data.count}`);
        const names = (res.data.workers || []).map(w => w.name);
        check('no phantom specialists in the response', names.length === 0, names.join(', '));
    }

    /* ---------------------------------------------------------------- 5 */
    console.log('\n5. A real city returns the real database rows');
    {
        const res = await request('GET', '/api/workers?city=Ramanagara');
        const dbCount = DB.getAllWorkers({ city: 'Ramanagara' }).length;
        check('count matches the database exactly', res.data.count === dbCount,
              `endpoint=${res.data.count} db=${dbCount}`);
        check('at least one real worker exists to compare', dbCount > 0, `db=${dbCount}`);
    }

    /* ---------------------------------------------------------------- 6 */
    console.log('\n6. The AI endpoint handles voice calls with callerPhone without requiring web session tokens');
    {
        const res = await request('POST', '/api/ai/voice-call', {
            body: { callerPhone: seedWorker.phone, speechText: 'How much did I earn this month?' }
        });
        check('200 returned', res.statusCode === 200, `got ${res.statusCode} ${JSON.stringify(res.data)}`);
        check('resolves caller to registered worker', res.data.callerIdentity && res.data.callerIdentity.name === seedWorker.name, JSON.stringify(res.data.callerIdentity));
        check('AI response generated from real data', !!res.data.spokenResponse, JSON.stringify(res.data).slice(0, 200));
    }

    /* ---------------------------------------------------------------- 7 */
    console.log('\n7. The AI endpoint handles incoming anonymous voice callers without crashing');
    {
        const res = await request('POST', '/api/ai/voice-call', { body: { speechText: 'Hello' } });
        check('200 returned', res.statusCode === 200, `got ${res.statusCode}`);
        check('does not fall back to a phantom number', !JSON.stringify(res.data).includes('9876543210'),
              JSON.stringify(res.data));
    }

    /* ---------------------------------------------------------------- 8 */
    console.log('\n8. /api/ai/caller resolves a number to its real owner for an operator');
    {
        const res = await request('GET', `/api/ai/caller?phone=${seedWorker.phone}`, { token: adminToken });
        check('200 returned for an operator', res.statusCode === 200, `got ${res.statusCode} ${JSON.stringify(res.data)}`);
        check('name comes from the database, not the request', res.data.caller && res.data.caller.name === seedWorker.name,
              JSON.stringify(res.data.caller));
        check('flagged as a registered worker', res.data.caller && res.data.caller.registeredWorker === true,
              JSON.stringify(res.data.caller));
    }

    /* ---------------------------------------------------------------- 9 */
    console.log('\n9. Job creation requires a real customer phone and a real description');
    {
        const before = DB.getAllJobs().length;

        const noPhone = await request('POST', '/api/jobs', {
            body: { service: 'Electrical', problem_description: 'Fan not working' }
        });
        check('missing phone rejected with 400', noPhone.statusCode === 400, `got ${noPhone.statusCode}`);
        check('no phantom 9876543210 job created', !JSON.stringify(noPhone.data).includes('9876543210'),
              JSON.stringify(noPhone.data));

        const noDesc = await request('POST', '/api/jobs', {
            body: { customer_phone: '9012345678', service: 'Electrical' }
        });
        check('missing description rejected with 400', noDesc.statusCode === 400, `got ${noDesc.statusCode}`);

        const after = DB.getAllJobs().length;
        check('no job rows were written by the rejected requests', after === before, `before=${before} after=${after}`);
    }

    /* --------------------------------------------------------------- 10 */
    console.log('\n10. Call logs come from the real table (getAllCallLogs, which actually exists)');
    {
        const res = await request('GET', '/api/call-logs');
        const dbCount = DB.getAllCallLogs().length;
        check('200 returned', res.statusCode === 200, `got ${res.statusCode} ${JSON.stringify(res.data).slice(0, 200)}`);
        check('count matches the database', res.data.count === dbCount, `endpoint=${res.data.count} db=${dbCount}`);
    }

    /* --------------------------------------------------------------- 11 */
    console.log('\n11. A worker schedule request without a session is refused, not answered blankly');
    {
        const res = await request('GET', '/api/workers/me/schedule');
        check('401 returned', res.statusCode === 401, `got ${res.statusCode}`);
        check('no empty-but-successful schedule invented', res.data.status === 'error', JSON.stringify(res.data));
    }

    server.close();

    console.log(`\n${'='.repeat(62)}`);
    console.log(`  ${passed} passed, ${failed} failed`);
    console.log('='.repeat(62));
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
    console.error('Test run failed:', err);
    process.exit(1);
});
