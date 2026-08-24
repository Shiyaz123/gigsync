/* ==========================================================================
   GigSync — End-to-End Automated System Diagnostic Test
   ========================================================================== */

async function runDiagnostic() {
    console.log('\n======================================================');
    console.log(' GIGSYNC MOBILE-FIRST & AI SYSTEM DIAGNOSTIC REPORT');
    console.log('======================================================\n');
    let allPassed = true;

    // 1. Static Web Server & Mobile-First HTML
    try {
        const res = await fetch('http://localhost:8089/');
        const html = await res.text();
        const hasTitle = html.includes('GigSync');
        const hasBottomNav = html.includes('bottom-nav');
        const hasOrderView = html.includes('view-order');
        const pass = res.status === 200 && hasTitle && hasBottomNav && hasOrderView;
        console.log('[TEST 1/7] Web Server & Mobile App Shell:    ', pass ? '✅ PASS (HTTP 200, 5-Tab Nav Ready)' : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 1/7] Web Server & Mobile App Shell:     ❌ FAIL -', e.message);
        allPassed = false;
    }

    // 2. SQLite Database & Workers API
    try {
        const res = await fetch('http://localhost:8089/api/workers');
        const data = await res.json();
        const pass = data.status === 'success' && data.count > 0;
        console.log('[TEST 2/7] SQLite Database & Workers API:    ', pass ? `✅ PASS (${data.count} workers loaded from gigsync.db)` : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 2/7] SQLite Database & Workers API:     ❌ FAIL -', e.message);
        allPassed = false;
    }

    // 3. Jobs Management API
    try {
        const res = await fetch('http://localhost:8089/api/jobs');
        const data = await res.json();
        const pass = data.status === 'success';
        console.log('[TEST 3/7] Jobs Management API:              ', pass ? `✅ PASS (${data.count} jobs retrieved)` : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 3/7] Jobs Management API:               ❌ FAIL -', e.message);
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
        console.log('[TEST 4/7] Worker AI Voice Availability:     ', pass ? '✅ PASS (Tool: updateWorkerAvailability executed)' : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 4/7] Worker AI Voice Availability:      ❌ FAIL -', e.message);
        allPassed = false;
    }

    // 5. Kannada Script AI Query ("ನನಗೆ ನಾಳೆ ಬೆಳಿಗ್ಗೆ plumber ಬೇಕು")
    try {
        const res = await fetch('http://localhost:8089/api/ai/voice-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callerPhone: '9876543210',
                callerRole: 'customer',
                speechText: 'ನನಗೆ ನಾಳೆ ಬೆಳಿಗ್ಗೆ plumber ಬೇಕು.'
            })
        });
        const data = await res.json();
        const pass = data.status === 'success' && data.toolExecuted === 'createJob';
        console.log('[TEST 5/7] Kannada Script AI Booking:        ', pass ? `✅ PASS (Job ${data.toolResult.job.jobId} created in Kannada)` : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 5/7] Kannada Script AI Booking:         ❌ FAIL -', e.message);
        allPassed = false;
    }

    // 6. Dynamic Schedule Inquiry ("What is Ramesh Kumar's schedule?")
    try {
        const res = await fetch('http://localhost:8089/api/ai/voice-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callerPhone: '9876543210',
                callerRole: 'customer',
                speechText: "What is Ramesh Kumar's schedule?"
            })
        });
        const data = await res.json();
        const pass = data.status === 'success' && data.toolExecuted === 'getWorkerSchedule' && data.cardType === 'workerSchedule';
        console.log('[TEST 6/7] Dynamic Worker Schedule Query:    ', pass ? `✅ PASS (Schedule retrieved for ${data.toolResult.worker.name})` : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 6/7] Dynamic Worker Schedule Query:     ❌ FAIL -', e.message);
        allPassed = false;
    }

    // 7. SQLite Call Logs Persistence
    try {
        const res = await fetch('http://localhost:8089/api/call-logs');
        const data = await res.json();
        const pass = data.status === 'success' && data.count > 0;
        console.log('[TEST 7/7] SQLite Call Logs Persistence:     ', pass ? `✅ PASS (${data.count} call logs persisted in DB)` : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 7/7] SQLite Call Logs Persistence:      ❌ FAIL -', e.message);
        allPassed = false;
    }

    console.log('\n======================================================');
    if (allPassed) {
        console.log(' 🚀 SYSTEM HEALTH: 100% OPERATIONAL & READY FOR DEMO');
    } else {
        console.log(' ⚠️ WARNING: SOME TESTS FAILED. PLEASE REVIEW LOGS.');
    }
    console.log('======================================================\n');
}

runDiagnostic();
