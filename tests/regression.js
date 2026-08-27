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

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        process.exit(1);
    } else {
        console.log("All role isolation regression tests passed successfully!");
        process.exit(0);
    }
}

runTests();
