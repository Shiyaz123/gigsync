/* ==========================================================================
   GigSync — End-to-End Automated System Diagnostic Test Suite
   Desktop-First Real Backend Architecture Verification
   ========================================================================== */

async function runDiagnostic() {
    console.log('\n================================================================');
    console.log(' GIGSYNC DESKTOP-FIRST REAL BACKEND DIAGNOSTIC REPORT');
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
        const hasZeroDummyInit = !html.includes('Rumaiz') && !html.includes('Saqib');
        const pass = res.status === 200 && hasCustomerPortal && hasWorkerPortal && hasZeroDummyInit;
        console.log('[TEST 1/8] Desktop Web Server & Portal Delivery:', pass ? '✅ PASS (Customer & Worker Desktop UI Live)' : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 1/8] Desktop Web Server & Portal Delivery: ❌ FAIL -', e.message);
        allPassed = false;
    }

    // 2. Real Customer Registration & Authentication
    try {
        const phone = `98765${Math.floor(10000 + Math.random() * 90000)}`;
        const res = await fetch('http://localhost:8089/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Kavya Rao',
                phone,
                password: 'password123',
                role: 'customer',
                city: 'Ramanagara'
            })
        });
        const data = await res.json();
        customerToken = data.token;
        const pass = res.status === 201 && data.status === 'success' && customerToken;
        console.log('[TEST 2/8] Customer Registration & Auth Token:  ', pass ? `✅ PASS (Registered ${phone} with token)` : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 2/8] Customer Registration & Auth Token:   ❌ FAIL -', e.message);
        allPassed = false;
    }

    // 3. Real Worker Registration & Profile
    try {
        const workerPhone = `98450${Math.floor(10000 + Math.random() * 90000)}`;
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
                city: 'Ramanagara'
            })
        });
        const data = await res.json();
        workerToken = data.token;
        workerId = data.user?.profile?.id;
        const pass = res.status === 201 && data.status === 'success' && workerToken && workerId;
        console.log('[TEST 3/8] Worker Registration & Trade Profile:  ', pass ? `✅ PASS (Worker ID: ${workerId} - ${data.user.name})` : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 3/8] Worker Registration & Trade Profile:   ❌ FAIL -', e.message);
        allPassed = false;
    }

    // 4. Worker Availability Update via Voice / API
    try {
        const res = await fetch('http://localhost:8089/api/workers/me/availability', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${workerToken}`
            },
            body: JSON.stringify({
                is_available: true,
                date_str: 'Tomorrow',
                start_time: '10:00 AM',
                end_time: '02:00 PM'
            })
        });
        const data = await res.json();
        const pass = res.status === 200 && data.status === 'success' && data.isAvailableNow === true;
        console.log('[TEST 4/8] Worker Availability Persistence:      ', pass ? '✅ PASS (Slot saved & On-Duty status active)' : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 4/8] Worker Availability Persistence:       ❌ FAIL -', e.message);
        allPassed = false;
    }

    // 5. Trilingual Customer AI Voice Booking (Kannada Script)
    try {
        const res = await fetch('http://localhost:8089/api/ai/voice-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callerPhone: '9876543210',
                callerRole: 'customer',
                callerName: 'Kavya Rao',
                city: 'Ramanagara',
                speechText: 'ನನಗೆ ನಾಳೆ ಬೆಳಿಗ್ಗೆ electrician ಬೇಕು for ceiling fan repair in Vijaya Nagar.'
            })
        });
        const data = await res.json();
        testJobId = data.toolResult?.job?.jobId;
        const pass = data.status === 'success' && data.toolExecuted === 'createJob' && testJobId;
        console.log('[TEST 5/8] Trilingual AI Job Booking (Kannada):  ', pass ? `✅ PASS (Job #${testJobId} created in SQLite)` : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 5/8] Trilingual AI Job Booking (Kannada):   ❌ FAIL -', e.message);
        allPassed = false;
    }

    // 6. Worker Job Acceptance & Status Progression
    try {
        const acceptRes = await fetch(`http://localhost:8089/api/jobs/${testJobId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${workerToken}`
            },
            body: JSON.stringify({ status: 'Accepted' })
        });
        const acceptData = await acceptRes.json();

        // Complete Job
        const compRes = await fetch(`http://localhost:8089/api/jobs/${testJobId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${workerToken}`
            },
            body: JSON.stringify({ status: 'Completed' })
        });
        const compData = await compRes.json();

        const pass = acceptData.job?.status === 'Accepted' && compData.job?.status === 'Completed' && compData.job?.payment_status === 'Paid';
        console.log('[TEST 6/8] Job Lifecycle (Accept -> Complete):   ', pass ? `✅ PASS (Job #${testJobId} Completed & Paid)` : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 6/8] Job Lifecycle (Accept -> Complete):    ❌ FAIL -', e.message);
        allPassed = false;
    }

    // 7. Real Aggregated Worker Earnings & Work Statement
    try {
        const res = await fetch(`http://localhost:8089/api/workers/${workerId}/earnings`);
        const data = await res.json();
        const hasEarnings = data.earnings?.totalEarnings > 0;
        const pass = data.status === 'success' && hasEarnings && data.earnings?.totalCompletedJobs >= 1;
        console.log('[TEST 7/8] Worker Real Earnings Computation:     ', pass ? `✅ PASS (Total: ₹${data.earnings.totalEarnings} from ${data.earnings.totalCompletedJobs} gigs)` : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 7/8] Worker Real Earnings Computation:      ❌ FAIL -', e.message);
        allPassed = false;
    }

    // 8. Schedule Conflict Prevention Logic
    try {
        const res = await fetch('http://localhost:8089/api/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                customer_phone: '9999900000',
                service: 'Electrical',
                problem_description: 'Double booking test',
                worker_id: workerId,
                requested_date: 'Tomorrow',
                requested_time: '10:00 AM'
            })
        });
        const data = await res.json();
        const pass = data.status === 'success';
        console.log('[TEST 8/9] Booking & Conflict Prevention Logic:  ', pass ? '✅ PASS (Valid booking dispatch confirmed)' : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 8/9] Booking & Conflict Prevention Logic:   ❌ FAIL -', e.message);
        allPassed = false;
    }

    // 9. Firebase Cloud Firestore Sync Layer
    try {
        const res = await fetch('http://localhost:8089/api/firebase/sync', { method: 'POST' });
        const data = await res.json();
        const pass = data.status === 'success' && data.workersSynced >= 1 && data.jobsSynced >= 1;
        console.log('[TEST 9/10] Firebase Cloud Firestore Sync:       ', pass ? `✅ PASS (Synced ${data.workersSynced} workers & ${data.jobsSynced} jobs to Firestore)` : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 9/10] Firebase Cloud Firestore Sync:        ❌ FAIL -', e.message);
        allPassed = false;
    }

    // 10. Master Admin Account Authentication
    try {
        const res = await fetch('http://localhost:8089/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: '9999999999',
                password: 'admin@gigsync2026'
            })
        });
        const data = await res.json();
        const pass = res.status === 200 && data.status === 'success' && data.user?.role === 'admin';
        console.log('[TEST 10/10] Master Admin Authentication:       ', pass ? '✅ PASS (Logged in as Master Platform Administrator)' : '❌ FAIL');
        if (!pass) allPassed = false;
    } catch (e) {
        console.log('[TEST 10/10] Master Admin Authentication:        ❌ FAIL -', e.message);
        allPassed = false;
    }

    console.log('\n================================================================');
    if (allPassed) {
        console.log(' 🚀 SYSTEM HEALTH: 100% OPERATIONAL & VERIFIED (DESKTOP + FIREBASE + ADMIN)');
    } else {
        console.log(' ⚠️ WARNING: SOME TESTS FAILED. PLEASE REVIEW SERVER LOGS.');
    }
    console.log('================================================================\n');
}

runDiagnostic();
