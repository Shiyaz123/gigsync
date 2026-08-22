/* ==========================================================================
   GigSync — End-to-End Automated System Diagnostic Test
   ========================================================================== */

async function runDiagnostic() {
    console.log('\n======================================================');
    console.log(' GIGSYNC END-TO-END SYSTEM DIAGNOSTIC REPORT');
    console.log('======================================================\n');
    let allPassed = true;

    // 1. Static Web Server & HTML
    try {
        const res = await fetch('http://localhost:8089/');
        const html = await res.text();
        const hasTitle = html.includes('GigSync');
        const hasPhoneModal = html.includes('phoneCallModal');
        const pass = res.status === 200 && hasTitle && hasPhoneModal;
        console.log('[TEST 1/6] Web Server & SPA Delivery:       ', pass ? '✅ PASS (HTTP 200, Phone Modal Ready)' : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 1/6] Web Server & SPA Delivery:        ❌ FAIL -', e.message);
        allPassed = false;
    }

    // 2. SQLite Database & Workers API
    try {
        const res = await fetch('http://localhost:8089/api/workers');
        const data = await res.json();
        const pass = data.status === 'success' && data.count > 0;
        console.log('[TEST 2/6] SQLite Database & Workers API:    ', pass ? `✅ PASS (${data.count} workers loaded from gigsync.db)` : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 2/6] SQLite Database & Workers API:     ❌ FAIL -', e.message);
        allPassed = false;
    }

    // 3. Jobs Management API
    try {
        const res = await fetch('http://localhost:8089/api/jobs');
        const data = await res.json();
        const pass = data.status === 'success';
        console.log('[TEST 3/6] Jobs Management API:              ', pass ? `✅ PASS (${data.count} jobs retrieved)` : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 3/6] Jobs Management API:               ❌ FAIL -', e.message);
        allPassed = false;
    }

    // 4. Worker Availability AI Voice Turn (English)
    try {
        const res = await fetch('http://localhost:8089/api/ai/voice-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callerPhone: '9845011223',
                callerRole: 'worker',
                speechText: 'I am an electrician. I am available tomorrow from 10 AM to 2 PM.'
            })
        });
        const data = await res.json();
        const pass = data.status === 'success' && data.toolExecuted === 'updateWorkerAvailability' && data.toolArgs.isAvailable === true;
        console.log('[TEST 4/6] Worker AI Voice Call (English):   ', pass ? '✅ PASS (Tool: updateWorkerAvailability executed)' : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 4/6] Worker AI Voice Call (English):    ❌ FAIL -', e.message);
        allPassed = false;
    }

    // 5. Customer Booking AI Voice Turn (Regional / Kannada input)
    try {
        const res = await fetch('http://localhost:8089/api/ai/voice-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callerPhone: '9876543210',
                callerRole: 'customer',
                speechText: 'Naale morning urgent plumber beku for bathroom pipe leak in Vijaya Nagar.'
            })
        });
        const data = await res.json();
        const pass = data.status === 'success' && data.toolExecuted === 'createJob';
        console.log('[TEST 5/6] Customer AI Voice Call (Regional):', pass ? `✅ PASS (Tool: createJob executed -> Job ${data.toolResult.job.jobId})` : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 5/6] Customer AI Voice Call (Regional): ❌ FAIL -', e.message);
        allPassed = false;
    }

    // 6. SQLite Call Logs Persistence
    try {
        const res = await fetch('http://localhost:8089/api/call-logs');
        const data = await res.json();
        const pass = data.status === 'success' && data.count > 0;
        console.log('[TEST 6/6] SQLite Call Logs Persistence:     ', pass ? `✅ PASS (${data.count} telephone call logs persisted)` : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 6/6] SQLite Call Logs Persistence:      ❌ FAIL -', e.message);
        allPassed = false;
    }

    console.log('\n======================================================');
    if (allPassed) {
        console.log(' 🚀 SYSTEM HEALTH: 100% OPERATIONAL & READY FOR DEMO');
    } else {
        console.log(' ⚠️ SYSTEM HEALTH: SOME TESTS FAILED');
    }
    console.log('======================================================\n');
}

runDiagnostic();
