const { aiAgent, sessionManager } = require('../backend/ai_agent');
const DB = require('../backend/database');
const assert = require('assert');

console.log("==========================================");
console.log("  GIGSYNC ROLE ISOLATION REGRESSION TEST  ");
console.log("==========================================");

async function runTests() {
    let passed = 0;
    let failed = 0;

    async function test(name, fn) {
        try {
            await fn();
            console.log(`[PASS] ${name}`);
            passed++;
        } catch (err) {
            console.error(`[FAIL] ${name}: ${err.message}`);
            console.error(err);
            failed++;
        }
    }

    // Register test worker Rajesh in SQLite database for worker tests
    DB.registerWorkerProfile({
        name: "Rajesh",
        phone: "9845011223",
        trade: "Electrician",
        city: "Ramanagara"
    });

    // 1. Customer Role Isolation Test
    await test("Customer asking for availability should not trigger worker onboarding", async () => {
        const sessionId = "test_cust_" + Date.now();
        const session = sessionManager.getSession(sessionId, {
            callerRole: 'customer',
            callerPhone: '9991112223',
            callerName: 'Test Customer',
            city: 'Ramanagara'
        });
        
        assert.strictEqual(session.callerRole, 'customer', "Session role should be customer");

        const turn = await aiAgent.processCallTurn(session, "is there any electrician available today");
        
        assert.strictEqual(turn.detectedIntent, 'check_worker_availability', "Intent should be check_worker_availability");
        assert.ok(turn.spokenResponse.toLowerCase().includes("electric") || turn.spokenResponse.toLowerCase().includes("electrical"), "Response should mention electrician/electrical availability");
        assert.ok(!turn.spokenResponse.includes("What is your name"), "Response should NOT ask for name");
        assert.ok(!turn.spokenResponse.includes("What type of work"), "Response should NOT ask for trade");
    });

    await test("Customer requesting a booking should prompt for booking confirmation, not onboarding", async () => {
        const sessionId = "test_cust_book_" + Date.now();
        const session = sessionManager.getSession(sessionId, {
            callerRole: 'customer',
            callerPhone: '9991112223',
            callerName: 'Test Customer',
            city: 'Ramanagara'
        });

        const turn = await aiAgent.processCallTurn(session, "I want to book an electrician");
        
        assert.strictEqual(turn.detectedIntent, 'request_service', "Intent should be request_service");
        assert.ok(turn.spokenResponse.toLowerCase().includes("book"), "Response should mention booking");
        assert.ok(!turn.spokenResponse.includes("What is your name"), "Response should NOT ask for name");
        assert.ok(!turn.spokenResponse.includes("What type of work"), "Response should NOT ask for trade");
    });

    await test("Customer checking status should trigger check_slot_status", async () => {
        const sessionId = "test_cust_status_" + Date.now();
        const session = sessionManager.getSession(sessionId, {
            callerRole: 'customer',
            callerPhone: '9991112223',
            callerName: 'Test Customer',
            city: 'Ramanagara'
        });

        const turn = await aiAgent.processCallTurn(session, "check my booking status");
        assert.strictEqual(turn.detectedIntent, 'check_slot_status', "Intent should be check_slot_status");
        assert.ok(turn.spokenResponse.includes("booking") || turn.spokenResponse.includes("register"), "Response should mention booking status");
    });

    // 2. Worker Role Isolation Test
    await test("Unregistered worker starting call should run onboarding slot-filling", async () => {
        const sessionId = "test_work_onb_" + Date.now();
        const session = sessionManager.getSession(sessionId, {
            callerRole: 'worker',
            callerPhone: '5556667777',
            callerName: 'User',
            city: 'Ramanagara'
        });

        assert.strictEqual(session.callerRole, 'worker', "Session role should be worker");

        const turn = await aiAgent.processCallTurn(session, "hello");
        assert.strictEqual(turn.detectedIntent, 'ask_name', "Intent should be ask_name");
        assert.ok(turn.spokenResponse.includes("What is your name"), "Response should ask for name");
    });

    await test("Worker checking jobs should trigger check_job_availability", async () => {
        const sessionId = "test_work_jobs_" + Date.now();
        const session = sessionManager.getSession(sessionId, {
            callerRole: 'worker',
            callerPhone: '9845011223',
            callerName: 'Rajesh',
            city: 'Ramanagara'
        });

        const turn = await aiAgent.processCallTurn(session, "are there any jobs available");
        assert.strictEqual(turn.detectedIntent, 'check_job_availability', "Intent should be check_job_availability");
        assert.ok(turn.spokenResponse.includes("jobs available") || turn.spokenResponse.includes("no new service jobs"), "Response should mention jobs availability");
    });

    await test("Worker checking license status should trigger check_license_status", async () => {
        const sessionId = "test_work_license_" + Date.now();
        const session = sessionManager.getSession(sessionId, {
            callerRole: 'worker',
            callerPhone: '9845011223',
            callerName: 'Rajesh',
            city: 'Ramanagara'
        });

        const turn = await aiAgent.processCallTurn(session, "check my license status");
        assert.strictEqual(turn.detectedIntent, 'check_license_status', "Intent should be check_license_status");
        assert.ok(turn.spokenResponse.toLowerCase().includes("verified") || turn.spokenResponse.toLowerCase().includes("pending"), "Response should mention verification status");
    });

    // 3. Immutability Test
    await test("Session role should be immutable once set", async () => {
        const sessionId = "test_immutable_" + Date.now();
        const session = sessionManager.getSession(sessionId, {
            callerRole: 'customer',
            callerPhone: '9991112223',
            callerName: 'Test Customer'
        });
        assert.strictEqual(session.callerRole, 'customer', "Role should be customer initial");

        const session2 = sessionManager.getSession(sessionId, {
            callerRole: 'worker'
        });
        assert.strictEqual(session2.callerRole, 'customer', "Role should remain customer and not be overwritten");
    });

    // 4. Semantic NLU Tests
    await test("Semantic matching: 'I fix ACs' should resolve to 'AC & Appliances'", async () => {
        const sessionId = "test_nlu_ac_" + Date.now();
        const session = sessionManager.getSession(sessionId, {
            callerRole: 'worker',
            callerPhone: '1112223333',
            callerName: 'AC Worker'
        });
        
        await aiAgent.processCallTurn(session, "I fix ACs");
        const draft = session.workerDraft;
        assert.ok(draft && draft.job_role === 'AC & Appliances', "Extracted job role should be AC & Appliances");
    });

    await test("Semantic matching: 'stitch clothes' should resolve to 'Tailoring & Alterations'", async () => {
        const sessionId = "test_nlu_tailor_" + Date.now();
        const session = sessionManager.getSession(sessionId, {
            callerRole: 'customer',
            callerPhone: '9991112223',
            callerName: 'Customer',
            city: 'Ramanagara'
        });
        
        const turn = await aiAgent.processCallTurn(session, "I want to book someone to stitch my clothes");
        assert.strictEqual(turn.detectedIntent, 'request_service', "Intent should be request_service");
        assert.strictEqual(session.context.pendingJobData.service, 'Tailoring & Alterations', "Service should be Tailoring & Alterations");
    });

    await test("Semantic matching: random text should fall back to low confidence / LLM", async () => {
        const sessionId = "test_nlu_random_" + Date.now();
        const session = sessionManager.getSession(sessionId, {
            callerRole: 'customer',
            callerPhone: '9991112223',
            callerName: 'Customer'
        });
        
        const turn = await aiAgent.processCallTurn(session, "is it going to rain today");
        assert.ok(turn.detectedIntent !== 'request_service', "Intent should not be request_service");
        assert.ok(turn.detectedIntent !== 'check_worker_availability', "Intent should not be check_worker_availability");
    });

    // 5. Interactive Location Flow Tests
    await test("Customer booking without location should prompt for city, then confirm when provided", async () => {
        const sessionId = "test_cust_no_loc_" + Date.now();
        const session = sessionManager.getSession(sessionId, {
            callerRole: 'customer',
            callerPhone: '9991112223',
            callerName: 'Test Customer'
        });

        // 1. Initial request without city
        const turn1 = await aiAgent.processCallTurn(session, "I need a plumber tomorrow morning");
        assert.strictEqual(turn1.detectedIntent, 'ask_city_for_booking', "Should ask for city");
        assert.ok(turn1.spokenResponse.includes("Which city or area"), "Response should prompt for city");

        // 2. Provide city "in rt nagar" (which resolves to Rt Nagar)
        const turn2 = await aiAgent.processCallTurn(session, "I need in rt nagar");
        assert.strictEqual(turn2.detectedIntent, 'request_service', "Should now proceed to request_service");
        assert.strictEqual(session.city, 'Rt Nagar', "City should be extracted as Rt Nagar");
        assert.ok(turn2.spokenResponse.includes("Rt Nagar"), "Response should confirm location is Rt Nagar");
    });

    await test("Customer should be able to correct location during confirmation", async () => {
        const sessionId = "test_cust_correct_loc_" + Date.now();
        const session = sessionManager.getSession(sessionId, {
            callerRole: 'customer',
            callerPhone: '9991112223',
            callerName: 'Test Customer',
            city: 'Ramanagara'
        });

        // 1. Book plumber -> prompts confirmation in Ramanagara
        const turn1 = await aiAgent.processCallTurn(session, "I need a plumber");
        assert.strictEqual(turn1.detectedIntent, 'request_service', "Should prompt for confirmation");
        assert.ok(turn1.spokenResponse.includes("Ramanagara"), "Should offer to book in Ramanagara");

        // 2. Correct location to Kanakapura -> updates and re-prompts for confirmation in Kanakapura
        const turn2 = await aiAgent.processCallTurn(session, "I need in kanakapura, who said Ramanagara?");
        assert.strictEqual(turn2.detectedIntent, 'request_service', "Should still be in request_service/confirmation flow");
        assert.strictEqual(session.city, 'Kanakapura', "City should update to Kanakapura");
        assert.ok(turn2.spokenResponse.includes("Kanakapura"), "Response should confirm location is Kanakapura");
    });

    await test("Worker should be able to register availability slots and check overlap", async () => {
        // Register test worker John Plumber
        const regResult = DB.registerWorkerProfile({
            name: "John Plumber",
            phone: "9845022334",
            trade: "Plumber",
            city: "Bengaluru",
            price: 400
        });
        const worker = regResult.worker || DB.getWorkerByPhone("9845022334");

        assert.ok(worker && worker.id, "Worker registration should succeed");

        // Set availability slot for John Plumber for tomorrow (2026-08-28) from 09:00 AM to 05:00 PM
        const slot = DB.setWorkerAvailabilitySlot({
            workerId: worker.id,
            workerPhone: worker.phone,
            trade: worker.trade,
            dateStr: "2026-08-28",
            startTime: "09:00 AM",
            endTime: "05:00 PM",
            isAvailable: true
        });

        assert.ok(slot.success, "Setting availability slot should succeed");

        // Test conflict checking logic:
        // 1. Booking at 10:00 AM should NOT conflict initially (since there are no jobs booked)
        const conflict1 = DB.checkScheduleConflict(worker.id, "2026-08-28", "10:00 AM");
        assert.strictEqual(conflict1, null, "Should be no conflict initially");

        // 2. Booking at 08:00 AM should be OUTSIDE hours (availability starts at 09:00 AM)
        const conflictOutside = DB.checkScheduleConflict(worker.id, "2026-08-28", "08:00 AM");
        assert.strictEqual(conflictOutside, "OutsideHours", "Should return OutsideHours");

        // 3. Create a confirmed job at 10:00 AM
        const firstJob = DB.createJob({
            customer_phone: "9998887776",
            customer_name: "Test Customer",
            worker_id: worker.id,
            worker_phone: worker.phone,
            worker_name: worker.name,
            service: "Plumber",
            problem_description: "Fix faucet",
            location: "Town Area",
            city: "Bengaluru",
            requested_date: "2026-08-28",
            requested_time: "10:00 AM",
            budget: "₹400",
            status: "Confirmed"
        });

        assert.ok(firstJob && firstJob.id, "Job creation should succeed");

        // 4. Booking at 10:00 AM again should return JobConflict
        const conflict2 = DB.checkScheduleConflict(worker.id, "2026-08-28", "10:00 AM");
        assert.strictEqual(conflict2, "JobConflict", "Should return JobConflict");

        // 5. Booking at 10:30 AM should also return JobConflict (within 1-hour overlap window)
        const conflict3 = DB.checkScheduleConflict(worker.id, "2026-08-28", "10:30 AM");
        assert.strictEqual(conflict3, "JobConflict", "Should return JobConflict due to 1-hour window");

        // 6. Booking at 11:30 AM should NOT conflict (outside the 1-hour window of 10:00 AM job)
        const conflict4 = DB.checkScheduleConflict(worker.id, "2026-08-28", "11:30 AM");
        assert.strictEqual(conflict4, null, "Should not conflict at 11:30 AM");
    });

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        process.exit(1);
    } else {
        console.log("All role isolation regression tests passed successfully!");
        process.exit(0);
    }
}

runTests();
