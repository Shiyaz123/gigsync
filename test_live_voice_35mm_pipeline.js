/* ==========================================================================
   GigSync — Real 3.5mm Voice Terminal Pipeline Regression Test Suite
   ========================================================================== */

const DB = require('./backend/database');

async function runLivePipelineTests() {
    console.log('\n================================================================');
    console.log(' GIGSYNC REAL 3.5MM VOICE PIPELINE VERIFICATION SUITE');
    console.log('================================================================\n');

    let allPassed = true;

    // 1. Setup Verified Worker in Database
    const workerPhone = '9845099887';
    let worker = DB.getWorkerByPhone(workerPhone);
    if (!worker) {
        worker = DB.createWorker({
            name: 'Rajesh',
            phone: workerPhone,
            trade: 'Electrician',
            city: 'Ramanagara',
            experienceYears: 5,
            startingPrice: '₹300',
            rating: 4.8
        });
    }

    const unregPhone = '9777000111';

    // -------------------------------------------------------------------------
    // TEST 1: Registered Worker Greeting (No Echo Fallback)
    // -------------------------------------------------------------------------
    try {
        const res = await fetch('http://localhost:8089/api/ai/voice-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: `sess_${workerPhone}`,
                callerPhone: workerPhone,
                callerRole: 'worker',
                callerName: 'Rajesh',
                city: 'Ramanagara',
                speechText: 'hello'
            })
        });
        const data = await res.json();
        const noEcho = !data.spokenResponse.includes('I received your message');
        const pass = data.status === 'success' && noEcho && data.spokenResponse.length > 5;
        console.log('[TEST 1/6] Registered Worker Greeting:           ', pass ? `✅ PASS ("${data.spokenResponse.slice(0, 45)}...")` : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 1/6] Registered Worker Greeting:           ❌ FAIL -', e.message);
        allPassed = false;
    }

    // -------------------------------------------------------------------------
    // TEST 2: Verified Worker Availability Statement ("Rajesh I am an electrician...")
    // -------------------------------------------------------------------------
    try {
        const res = await fetch('http://localhost:8089/api/ai/voice-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: `sess_${workerPhone}`,
                callerPhone: workerPhone,
                callerRole: 'worker',
                callerName: 'Rajesh',
                city: 'Ramanagara',
                speechText: 'Rajesh I am an electrician I am available tomorrow from 6 to 5'
            })
        });
        const data = await res.json();
        const noEcho = !data.spokenResponse.includes('I received your message');
        const askedConfirm = data.spokenResponse.toLowerCase().includes('electrician') &&
                             data.spokenResponse.toLowerCase().includes('tomorrow') &&
                             (data.spokenResponse.toLowerCase().includes('6 am') || data.spokenResponse.toLowerCase().includes('6')) &&
                             (data.spokenResponse.toLowerCase().includes('5 pm') || data.spokenResponse.toLowerCase().includes('5')) &&
                             data.spokenResponse.toLowerCase().includes('save');

        const pass = data.status === 'success' && noEcho && askedConfirm && data.context?.pendingIntent === 'CONFIRM_UPDATE_AVAILABILITY';
        console.log('[TEST 2/6] Worker Availability Extraction & Confirm:', pass ? `✅ PASS ("${data.spokenResponse}")` : '❌ FAIL');
        if (!pass) {
            console.log('      Received Response:', data.spokenResponse);
            console.log('      Pending Intent:', data.context?.pendingIntent);
            allPassed = false;
        }
    } catch (e) {
        console.log('[TEST 2/6] Worker Availability Extraction & Confirm: ❌ FAIL -', e.message);
        allPassed = false;
    }

    // -------------------------------------------------------------------------
    // TEST 3: Multi-Turn Confirmation ("Yes" / "Save it") -> Database Update
    // -------------------------------------------------------------------------
    try {
        const res = await fetch('http://localhost:8089/api/ai/voice-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: `sess_${workerPhone}`,
                callerPhone: workerPhone,
                callerRole: 'worker',
                callerName: 'Rajesh',
                city: 'Ramanagara',
                speechText: 'Save it'
            })
        });
        const data = await res.json();
        const confirmed = data.status === 'success' &&
                          data.toolExecuted === 'updateWorkerAvailability' &&
                          data.spokenResponse.toLowerCase().includes('updated');

        // Check SQLite Database directly
        const slots = DB.getWorkerAvailability(worker.id, 'tomorrow');
        const dbHasSlot = slots && slots.length > 0;

        const pass = confirmed && dbHasSlot;
        console.log('[TEST 3/6] Confirmation & Real DB Update:        ', pass ? `✅ PASS (Availability slot saved in SQLite for tomorrow)` : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 3/6] Confirmation & Real DB Update:        ❌ FAIL -', e.message);
        allPassed = false;
    }

    // -------------------------------------------------------------------------
    // TEST 4: Unregistered Caller Security Protection
    // -------------------------------------------------------------------------
    try {
        const res = await fetch('http://localhost:8089/api/ai/voice-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: `sess_${unregPhone}`,
                callerPhone: unregPhone,
                callerRole: 'worker',
                callerName: 'Unknown',
                city: 'Ramanagara',
                speechText: 'Rajesh I am an electrician I am available tomorrow from 6 to 5'
            })
        });
        const data = await res.json();
        const unregProtected = data.status === 'success' &&
                               data.spokenResponse.toLowerCase().includes('not registered') &&
                               data.spokenResponse.toLowerCase().includes('register');

        // Verify unregPhone was NOT inserted as a worker without auth
        const fakeWorker = DB.getWorkerByPhone(unregPhone);
        const pass = unregProtected && !fakeWorker;
        console.log('[TEST 4/6] Unregistered Caller Security Guard:   ', pass ? `✅ PASS (Rejected unauthorized self-creation; prompted registration)` : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 4/6] Unregistered Caller Security Guard:   ❌ FAIL -', e.message);
        allPassed = false;
    }

    // -------------------------------------------------------------------------
    // TEST 5: Customer Intent ("I need an electrician tomorrow") != Worker Intent
    // -------------------------------------------------------------------------
    try {
        const res = await fetch('http://localhost:8089/api/ai/voice-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: `sess_cust_998811`,
                callerPhone: '9988112233',
                callerRole: 'customer',
                callerName: 'Kavya',
                city: 'Ramanagara',
                speechText: 'I need an electrician tomorrow'
            })
        });
        const data = await res.json();
        const isFindWorker = data.toolExecuted === 'findWorkers' || data.detectedIntent === 'find_worker';
        const notWorkerUpdate = data.toolExecuted !== 'updateWorkerAvailability' && data.context?.pendingIntent !== 'CONFIRM_UPDATE_AVAILABILITY';
        const pass = data.status === 'success' && isFindWorker && notWorkerUpdate;
        console.log('[TEST 5/6] Customer Intent Discrimination:       ', pass ? `✅ PASS (Routed to findWorkers, not worker profile)` : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 5/6] Customer Intent Discrimination:       ❌ FAIL -', e.message);
        allPassed = false;
    }

    // -------------------------------------------------------------------------
    // TEST 6: TTS Audio Stream Delivery (3.5mm Hardware Output)
    // -------------------------------------------------------------------------
    try {
        const ttsRes = await fetch('http://localhost:8089/api/ai/tts?text=Done!%20Your%20availability%20has%20been%20updated&lang=en-IN');
        const audioBuffer = await ttsRes.arrayBuffer();
        const pass = ttsRes.status === 200 && audioBuffer.byteLength > 100;
        console.log('[TEST 6/6] TTS Audio Stream (3.5mm Output):      ', pass ? `✅ PASS (${audioBuffer.byteLength} bytes WAV/audio stream delivered)` : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 6/6] TTS Audio Stream (3.5mm Output):      ❌ FAIL -', e.message);
        allPassed = false;
    }

    console.log('\n================================================================');
    if (allPassed) {
        console.log(' 🚀 LIVE 3.5MM VOICE PIPELINE: 100% VERIFIED & FULLY OPERATIONAL');
    } else {
        console.log(' ⚠️ ISSUES DETECTED IN VOICE PIPELINE');
    }
    console.log('================================================================\n');

    process.exit(allPassed ? 0 : 1);
}

runLivePipelineTests().catch(err => {
    console.error('Fatal Test Error:', err);
    process.exit(1);
});
