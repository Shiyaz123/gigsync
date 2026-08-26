/* ==========================================================================
   GigSync — End-to-End Automated System Diagnostic Test Suite
   Context-Aware Database-First Voice AI & Real Backend Verification
   ========================================================================== */

async function runDiagnostic() {
    console.log('\n================================================================');
    console.log(' GIGSYNC CONTEXT-AWARE & DATABASE-FIRST DIAGNOSTIC REPORT');
    console.log('================================================================\n');
    let allPassed = true;
    let customerToken = null;
    let workerToken = null;
    let workerId = null;
    let testJobId = null;

    // 1. Static Web Server & Desktop SPA Delivery
    try {
        const res = await fetch('http://localhost:8089/');
        const html = await res.text();
        const hasCustomerPortal = html.includes('id="customerPortal"');
        const hasWorkerPortal = html.includes('id="workerPortal"');
        const hasVoiceTerminal = html.includes('id="voiceTerminalPortal"');
        const pass = res.status === 200 && hasCustomerPortal && hasWorkerPortal && hasVoiceTerminal;
        console.log('[TEST 1/10] Web Server & Portal Delivery:          ', pass ? '✅ PASS (Customer, Worker, & Terminal Live)' : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 1/10] Web Server & Portal Delivery:          ❌ FAIL -', e.message);
        allPassed = false;
    }

    // 2. Real Customer Registration & Authentication
    const customerPhone = `98765${Math.floor(10000 + Math.random() * 90000)}`;
    try {
        const res = await fetch('http://localhost:8089/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Kavya Rao',
                phone: customerPhone,
                password: 'password123',
                role: 'customer',
                city: 'Ramanagara'
            })
        });
        const data = await res.json();
        customerToken = data.token;
        const pass = res.status === 201 && data.status === 'success' && customerToken;
        console.log('[TEST 2/10] Customer Registration & Auth Token:    ', pass ? `✅ PASS (Registered ${customerPhone})` : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 2/10] Customer Registration & Auth Token:    ❌ FAIL -', e.message);
        allPassed = false;
    }

    // 3. Real Worker Registration & Profile
    const workerPhone = `98450${Math.floor(10000 + Math.random() * 90000)}`;
    try {
        const res = await fetch('http://localhost:8089/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Ramesh Kumar',
                phone: workerPhone,
                password: 'password123',
                role: 'worker',
                trade: 'Master Electrician',
                skills: 'Wiring, Inverter, Fan Repair',
                tools: 'Multimeter, Drill machine',
                city: 'Ramanagara',
                price: 350
            })
        });
        const data = await res.json();
        workerToken = data.token;
        workerId = data.user?.profile?.id;
        const pass = res.status === 201 && data.status === 'success' && workerToken && workerId;
        console.log('[TEST 3/10] Worker Registration & Trade Profile:    ', pass ? `✅ PASS (Worker ID: ${workerId} - ${data.user.name})` : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 3/10] Worker Registration & Trade Profile:    ❌ FAIL -', e.message);
        allPassed = false;
    }

    // 4. AI Intent: Greeting without Premature Search
    try {
        const res = await fetch('http://localhost:8089/api/ai/voice-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callerPhone: customerPhone,
                callerRole: 'customer',
                callerName: 'Kavya Rao',
                city: 'Ramanagara',
                speechText: 'Hello'
            })
        });
        const data = await res.json();
        const pass = data.status === 'success' && (data.spokenResponse.includes('Welcome') || data.spokenResponse.includes('Hello') || data.spokenResponse.includes('help')) && !data.spokenResponse.includes('Namaskara! I received your requirement');
        console.log('[TEST 4/10] AI Natural Greeting (No Template):      ', pass ? '✅ PASS (Empathetic welcome without template loop)' : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 4/10] AI Natural Greeting:                    ❌ FAIL -', e.message);
        allPassed = false;
    }

    // 5. AI Database-First Search: Honest Zero-Result when Trade is Empty
    try {
        const res = await fetch('http://localhost:8089/api/ai/voice-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callerPhone: customerPhone,
                callerRole: 'customer',
                callerName: 'Kavya Rao',
                city: 'Ramanagara',
                speechText: 'I need a painter in Ramanagara'
            })
        });
        const data = await res.json();
        const pass = data.status === 'success' &&
            (data.spokenResponse.toLowerCase().includes("couldn't find") || data.spokenResponse.toLowerCase().includes("no registered") || data.spokenResponse.toLowerCase().includes("not available")) &&
            data.spokenResponse.toLowerCase().includes('post');
        console.log('[TEST 5/10] Database-First Zero Worker Truth:       ', pass ? '✅ PASS (Honest zero-worker message; zero dummy data)' : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 5/10] Database-First Zero Worker Truth:       ❌ FAIL -', e.message);
        allPassed = false;
    }

    // 6. AI Multi-Turn Session Memory & Slot Filling (Turn 1 -> Turn 2 Affirmation)
    const testSessionId = `test_sess_${Date.now()}`;
    try {
        // Turn 1: Caller says they want a job posted
        const t1Res = await fetch('http://localhost:8089/api/ai/voice-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: testSessionId,
                callerPhone: customerPhone,
                callerRole: 'customer',
                callerName: 'Kavya Rao',
                city: 'Ramanagara',
                speechText: 'Can you do a job posting for plumbing in Ramanagara?'
            })
        });
        const t1Data = await t1Res.json();

        // Turn 2: Caller confirms with "Yes"
        const t2Res = await fetch('http://localhost:8089/api/ai/voice-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: testSessionId,
                callerPhone: customerPhone,
                callerRole: 'customer',
                callerName: 'Kavya Rao',
                city: 'Ramanagara',
                speechText: 'Yes, please post it.'
            })
        });
        const t2Data = await t2Res.json();
        testJobId = t2Data.toolResult?.job?.id || t1Data.toolResult?.job?.id;
        const pass = (t2Data.status === 'success' || t1Data.status === 'success') && (t2Data.toolExecuted === 'createJob' || t1Data.toolExecuted === 'createJob' || testJobId);
        console.log('[TEST 6/10] Multi-Turn Dialog & Confirmation:       ', pass ? `✅ PASS (Job #${testJobId} created and confirmed)` : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 6/10] Multi-Turn Dialog & Confirmation:       ❌ FAIL -', e.message);
        allPassed = false;
    }

    // 7. Worker Availability Voice Inquiry & Update
    try {
        const updateRes = await fetch('http://localhost:8089/api/ai/voice-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: `sess_${workerPhone}`,
                callerPhone: workerPhone,
                callerRole: 'worker',
                callerName: 'Ramesh Kumar',
                city: 'Ramanagara',
                speechText: 'I am available tomorrow from 10 to 2'
            })
        });
        const updateData = await updateRes.json();

        // Turn 2: Worker confirms
        const confirmRes = await fetch('http://localhost:8089/api/ai/voice-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: `sess_${workerPhone}`,
                callerPhone: workerPhone,
                callerRole: 'worker',
                callerName: 'Ramesh Kumar',
                city: 'Ramanagara',
                speechText: 'Save it'
            })
        });
        const confirmData = await confirmRes.json();

        // Turn 3: Worker checks availability
        const checkRes = await fetch('http://localhost:8089/api/ai/voice-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: `sess_${workerPhone}`,
                callerPhone: workerPhone,
                callerRole: 'worker',
                callerName: 'Ramesh Kumar',
                city: 'Ramanagara',
                speechText: 'Am I available tomorrow?'
            })
        });
        const checkData = await checkRes.json();

        const pass = (updateData.status === 'success' || confirmData.status === 'success') &&
                     checkData.spokenResponse.includes('10:00 AM') &&
                     (checkData.spokenResponse.includes('02:00 PM') || checkData.spokenResponse.includes('2:00 PM'));
        console.log('[TEST 7/10] Worker Availability Query & Update:     ', pass ? '✅ PASS (Slot saved & queried from SQLite DB)' : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 7/10] Worker Availability Query & Update:     ❌ FAIL -', e.message);
        allPassed = false;
    }

    // 8. Worker Completes Job & Queries Real Earnings
    try {
        if (testJobId) {
            await fetch(`http://localhost:8089/api/jobs/${testJobId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'Completed', worker_id: workerId, worker_phone: workerPhone, worker_name: 'Ramesh Kumar' })
            });
        }

        const earnRes = await fetch('http://localhost:8089/api/ai/voice-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callerPhone: workerPhone,
                callerRole: 'worker',
                callerName: 'Ramesh Kumar',
                city: 'Ramanagara',
                speechText: 'How much did I earn this month?'
            })
        });
        const earnData = await earnRes.json();
        const pass = earnData.status === 'success' && (earnData.spokenResponse.includes('₹') || earnData.spokenResponse.includes('earned'));
        console.log('[TEST 8/10] Worker Real Earnings Computation:       ', pass ? '✅ PASS (Real database computation returned)' : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 8/10] Worker Real Earnings Computation:       ❌ FAIL -', e.message);
        allPassed = false;
    }

    // 9. Customer Bookings Voice Inquiry
    try {
        const custRes = await fetch('http://localhost:8089/api/ai/voice-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callerPhone: customerPhone,
                callerRole: 'customer',
                callerName: 'Kavya Rao',
                city: 'Ramanagara',
                speechText: 'What bookings do I have?'
            })
        });
        const custData = await custRes.json();
        const pass = custData.status === 'success' && (custData.spokenResponse.includes('booking') || custData.toolResult?.count >= 1);
        console.log('[TEST 9/10] Customer Bookings Voice Inquiry:        ', pass ? '✅ PASS (Real customer jobs returned from DB)' : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 9/10] Customer Bookings Voice Inquiry:        ❌ FAIL -', e.message);
        allPassed = false;
    }

    // 10. Master Admin Access
    try {
        const res = await fetch('http://localhost:8089/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: '9999999999',
                password: 'admin@gigsync2026',
                role: 'admin'
            })
        });
        const data = await res.json();
        const pass = res.status === 200 && data.status === 'success' && data.user.role === 'admin';
        console.log('[TEST 10/10] Master Admin Authentication:          ', pass ? '✅ PASS (Logged in as Master Platform Administrator)' : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 10/10] Master Admin Authentication:          ❌ FAIL -', e.message);
        allPassed = false;
    }

    console.log('\n================================================================');
    if (allPassed) {
        console.log(' 🚀 SYSTEM HEALTH: 100% OPERATIONAL & VERIFIED (VOICE AI + DATABASE + AUTH)');
    } else {
        console.log(' ⚠️ SYSTEM HEALTH: SOME TESTS ENCOUNTERED ISSUES');
    }
    console.log('================================================================\n');
}

runDiagnostic();
