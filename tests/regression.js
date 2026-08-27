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

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        process.exit(1);
    } else {
        console.log("All role isolation regression tests passed successfully!");
        process.exit(0);
    }
}

runTests();
