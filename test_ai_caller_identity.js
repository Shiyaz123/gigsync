/* ==========================================================================
   GigSync — AI Caller Identity Verification (real HTTP, real server)

   Proves that the AI endpoint takes its caller identity from the VERIFIED
   SESSION and never from whatever the browser claims. Run the backend first:

       node backend/server.js
       node test_ai_caller_identity.js

   These are live HTTP assertions against a running server, not unit tests of a
   mocked function.
   ========================================================================== */

const BASE = process.env.GIGSYNC_BASE || 'http://localhost:8089';

const SEED_WORKER = { phone: '7760782551', name: 'Rumais', password: 'worker123' };
const OTHER_WORKER = { phone: '8073280683', name: 'Saqib' };
const ADMIN = { phone: '9999999999', password: 'admin@gigsync2026' };

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
    if (condition) {
        passed++;
        console.log(`  PASS  ${label}`);
    } else {
        failed++;
        console.log(`  FAIL  ${label}`);
        if (detail !== undefined) console.log(`        got: ${JSON.stringify(detail)}`);
    }
}

async function post(path, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    let data = null;
    try { data = await res.json(); } catch (_) {}
    return { statusCode: res.status, data };
}

async function login(phone, password) {
    const res = await post('/api/auth/login', { phone, password });
    if (!res.data || !res.data.token) {
        throw new Error(`Login failed for ${phone}: ${JSON.stringify(res.data)}`);
    }
    return res.data.token;
}

// A harmless read-only utterance, so these checks do not mutate any record.
const NEUTRAL = 'Who am I registered as?';

async function main() {
    console.log('\n=== GigSync AI caller identity — live HTTP verification ===\n');
    console.log(`Server: ${BASE}\n`);

    /* ---------------------------------------------------------------
       1. No session, no phone number -> refused, no identity invented
       --------------------------------------------------------------- */
    console.log('1. Unauthenticated request with no caller phone');
    {
        const r = await post('/api/ai/voice-call', { speechText: NEUTRAL });
        check('is refused with 401', r.statusCode === 401, r.statusCode);
        check('does not invent an identity', !r.data || !r.data.callerIdentity, r.data && r.data.callerIdentity);
        check('explains that identity is required',
            Boolean(r.data && /identity is required/i.test(r.data.message || '')), r.data && r.data.message);
    }

    /* ---------------------------------------------------------------
       2. No session, claiming a REGISTERED worker's phone -> refused
          This is the impersonation case that used to succeed.
       --------------------------------------------------------------- */
    console.log('\n2. Unauthenticated request impersonating registered worker ' + SEED_WORKER.phone);
    {
        const r = await post('/api/ai/voice-call', { speechText: NEUTRAL, callerPhone: SEED_WORKER.phone, callerRole: 'worker' });
        check('is refused with 401', r.statusCode === 401, r.statusCode);
        check('tells the caller to sign in',
            Boolean(r.data && /sign in/i.test(r.data.message || '')), r.data && r.data.message);
        check('leaks no worker record', !r.data || !r.data.callerIdentity, r.data && r.data.callerIdentity);
    }

    /* ---------------------------------------------------------------
       3. Verified worker session -> identity comes from the session,
          and a claimed different phone is IGNORED, not honoured.
       --------------------------------------------------------------- */
    console.log('\n3. Verified worker session claiming another worker\'s phone');
    {
        const token = await login(SEED_WORKER.phone, SEED_WORKER.password);
        const r = await post('/api/ai/voice-call', {
            speechText: NEUTRAL,
            callerPhone: OTHER_WORKER.phone,   // hostile claim
            callerRole: 'admin',               // hostile claim
            callerName: 'Somebody Else'        // hostile claim
        }, token);

        const id = (r.data && r.data.callerIdentity) || {};
        check('request succeeds', r.statusCode === 200, r.statusCode);
        check('phone is the session owner, not the claim', id.phone === SEED_WORKER.phone, id.phone);
        check('claimed phone was ignored', id.phone !== OTHER_WORKER.phone, id.phone);
        check('role comes from the database', id.role === 'worker', id.role);
        check('claimed admin role was ignored', id.role !== 'admin', id.role);
        check('name comes from the database', id.name === SEED_WORKER.name, id.name);
        check('claimed name was ignored', id.name !== 'Somebody Else', id.name);
        check('source is the verified session', id.source === 'verified_session', id.source);
        check('recognised as a registered worker', id.registeredWorker === true, id.registeredWorker);
    }

    /* ---------------------------------------------------------------
       4. Admin (3.5mm terminal operator) may dial a named worker in,
          but the name and role still come from the database.
       --------------------------------------------------------------- */
    console.log('\n4. Admin voice terminal dialling in worker ' + OTHER_WORKER.phone);
    {
        const token = await login(ADMIN.phone, ADMIN.password);
        const r = await post('/api/ai/voice-call', {
            speechText: NEUTRAL,
            callerPhone: OTHER_WORKER.phone,
            callerName: 'Wrong Name From Browser'
        }, token);

        const id = (r.data && r.data.callerIdentity) || {};
        check('request succeeds', r.statusCode === 200, r.statusCode);
        check('caller is the dialled worker', id.phone === OTHER_WORKER.phone, id.phone);
        check('role resolved from the database', id.role === 'worker', id.role);
        check('name resolved from the database, not the body', id.name === OTHER_WORKER.name, id.name);
        check('source is the terminal operator', id.source === 'terminal_operator', id.source);
        check('recognised as a registered worker', id.registeredWorker === true, id.registeredWorker);
    }

    /* ---------------------------------------------------------------
       5. Admin with no explicit caller -> the admin is the caller.
          A terminal operator who forgets to enter a number must not
          silently become some default worker.
       --------------------------------------------------------------- */
    console.log('\n5. Admin session with no caller phone supplied');
    {
        const token = await login(ADMIN.phone, ADMIN.password);
        const r = await post('/api/ai/voice-call', { speechText: NEUTRAL }, token);
        const id = (r.data && r.data.callerIdentity) || {};
        check('request succeeds', r.statusCode === 200, r.statusCode);
        check('caller is the admin themself', id.phone === ADMIN.phone, id.phone);
        check('is not treated as a registered worker', id.registeredWorker === false, id.registeredWorker);
        check('source is the verified session', id.source === 'verified_session', id.source);
    }

    /* ---------------------------------------------------------------
       6. A brand-new customer with an unregistered number may still
          use the chatbot, as an anonymous customer.
       --------------------------------------------------------------- */
    console.log('\n6. Unauthenticated new customer with an unregistered number');
    {
        const unregistered = '9000000123';
        const r = await post('/api/ai/chat', { message: 'I need an electrician', callerPhone: unregistered });
        const id = (r.data && r.data.callerIdentity) || {};
        check('request succeeds', r.statusCode === 200, r.statusCode);
        check('treated as a customer', id.role === 'customer', id.role);
        check('keeps the number they gave', id.phone === unregistered, id.phone);
        check('source is anonymous customer', id.source === 'anonymous_customer', id.source);
        check('is not treated as a registered worker', id.registeredWorker === false, id.registeredWorker);
    }

    console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch(err => {
    console.error('\nTest run aborted:', err.message);
    console.error('Is the backend running?  node backend/server.js');
    process.exit(1);
});
