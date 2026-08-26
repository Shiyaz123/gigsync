const assert = require('node:assert');
const { aiAgent, sessionManager } = require('./backend/ai_agent');
const DB = require('./backend/database');

async function runTests() {
    console.log('=== RUNNING SIMPLIFIED WORKER VOICE AGENT TESTS ===\n');

    // Test 1: Step-by-Step 6-Field Collection
    console.log('--- Test 1: Step-by-Step 6-Field Collection ---');
    const sess1 = 'test_sess_rajesh_step_' + Date.now();
    sessionManager.resetSession(sess1);

    let t1 = await aiAgent.processCallTurn({ sessionId: sess1, speechText: 'Hello' });
    console.log('Worker: "Hello" -> AI:', t1.spokenResponse);
    assert.strictEqual(t1.spokenResponse, 'Hello. What is your name?');

    let t2 = await aiAgent.processCallTurn({ sessionId: sess1, speechText: 'Rajesh' });
    console.log('Worker: "Rajesh" -> AI:', t2.spokenResponse);
    assert.strictEqual(t2.spokenResponse, 'What type of work do you do?');

    let t3 = await aiAgent.processCallTurn({ sessionId: sess1, speechText: 'Electrician' });
    console.log('Worker: "Electrician" -> AI:', t3.spokenResponse);
    assert.strictEqual(t3.spokenResponse, 'What is your phone number?');

    let t4 = await aiAgent.processCallTurn({ sessionId: sess1, speechText: '7012280695' });
    console.log('Worker: "7012280695" -> AI:', t4.spokenResponse);
    assert.strictEqual(t4.spokenResponse, 'What date are you available?');

    let t5 = await aiAgent.processCallTurn({ sessionId: sess1, speechText: 'Tomorrow' });
    console.log('Worker: "Tomorrow" -> AI:', t5.spokenResponse);
    assert.strictEqual(t5.spokenResponse, 'What time are you available?');

    let t6 = await aiAgent.processCallTurn({ sessionId: sess1, speechText: '9 AM to 5 PM' });
    console.log('Worker: "9 AM to 5 PM" -> AI:', t6.spokenResponse);
    assert.match(t6.spokenResponse, /updated successfully/i);
    assert.match(t6.spokenResponse, /electrician/i);
    assert.match(t6.spokenResponse, /tomorrow/i);

    // Verify in DB
    const w1 = DB.getWorkerByPhone('7012280695');
    assert.ok(w1, 'Worker must be in DB');
    assert.strictEqual(w1.name, 'Rajesh');
    assert.match(w1.trade, /electric/i);
    const av1 = DB.getWorkerAvailability('7012280695');
    assert.ok(av1 && av1.length > 0, 'Availability slot must be in DB');
    console.log('✅ Test 1 Passed: Step-by-step collection persisted in DB!\n');

    // Test 2: Natural Speech Multi-Entity Input
    console.log('--- Test 2: Natural Speech Multi-Entity Input ---');
    const sess2 = 'test_sess_rajesh_multi_' + Date.now();
    sessionManager.resetSession(sess2);

    let m1 = await aiAgent.processCallTurn({
        sessionId: sess2,
        speechText: 'My name is Rajesh, I am an electrician and I am available tomorrow from 9 to 5.'
    });
    console.log('Worker: Multi-entity utterance -> AI:', m1.spokenResponse);
    assert.strictEqual(m1.spokenResponse, 'What is your phone number?');

    let m2 = await aiAgent.processCallTurn({
        sessionId: sess2,
        speechText: '7012280695'
    });
    console.log('Worker: "7012280695" -> AI:', m2.spokenResponse);
    assert.match(m2.spokenResponse, /updated successfully/i);
    console.log('✅ Test 2 Passed: Multi-entity extraction and single missing field question passed!\n');

    // Test 3: Unanswered / Repeat Question
    console.log('--- Test 3: Unanswered / Repeat Question Guard ---');
    const sess3 = 'test_sess_repeat_' + Date.now();
    sessionManager.resetSession(sess3);

    await aiAgent.processCallTurn({ sessionId: sess3, speechText: 'Hello' });
    await aiAgent.processCallTurn({ sessionId: sess3, speechText: 'Rajesh' });
    await aiAgent.processCallTurn({ sessionId: sess3, speechText: 'Electrician' });
    // AI asks for phone:
    let r1 = await aiAgent.processCallTurn({ sessionId: sess3, speechText: 'umm what did you say' });
    console.log('Worker gives unusable response -> AI:', r1.spokenResponse);
    assert.strictEqual(r1.spokenResponse, "Sorry, I didn't get the phone number. Please tell me your phone number.");
    console.log('✅ Test 3 Passed: Repeat question guard works!\n');

    // Test 4: Booking Inquiries
    console.log('--- Test 4: Booking Inquiries ---');
    const sess4 = 'test_sess_booking_' + Date.now();
    const testPhone4 = '98450' + String(Date.now()).slice(-5);
    sessionManager.resetSession(sess4);

    // First register worker
    DB.registerOrUpdateWorker({
        name: 'Gopal',
        phone: testPhone4,
        job_role: 'Plumber',
        availability_date: 'Tomorrow',
        start_time: '09:00 AM',
        end_time: '05:00 PM',
        city: 'Ramanagara'
    });

    // Initial check: no bookings
    let b1 = await aiAgent.processCallTurn({
        sessionId: sess4,
        callerPhone: testPhone4,
        speechText: 'Has anyone booked me?'
    });
    console.log('Worker: "Has anyone booked me?" -> AI:', b1.spokenResponse);
    assert.strictEqual(b1.spokenResponse, "You don't have any bookings at the moment.");

    // Create a real booking for Gopal
    const workerGopal = DB.getWorkerByPhone(testPhone4);
    const job = DB.createJob({
        customer_name: 'Suresh Kumar',
        customer_phone: '9845012345',
        worker_id: workerGopal.id,
        worker_name: workerGopal.name,
        worker_phone: workerGopal.phone,
        service: 'Plumbing',
        problem_description: 'Tap leak repair',
        location: 'MG Road, Ramanagara',
        city: 'Ramanagara',
        requested_date: 'Tomorrow',
        requested_time: '2 PM to 4 PM',
        status: 'Confirmed'
    });

    let b2 = await aiAgent.processCallTurn({
        sessionId: sess4,
        callerPhone: testPhone4,
        speechText: 'Do I have a booking?'
    });
    console.log('Worker: "Do I have a booking?" -> AI:', b2.spokenResponse);
    assert.match(b2.spokenResponse, /Yes\. You have been booked tomorrow from 2 PM to 4 PM/i);
    console.log('✅ Test 4 Passed: Real booking query reads actual database rows!\n');

    // Test 5: Account Inquiries
    console.log('--- Test 5: Direct Account Queries ---');
    let q1 = await aiAgent.processCallTurn({
        sessionId: sess4,
        callerPhone: testPhone4,
        speechText: 'What is my job?'
    });
    console.log('Worker: "What is my job?" -> AI:', q1.spokenResponse);
    assert.match(q1.spokenResponse, /You are registered as a plumber/i);

    let q2 = await aiAgent.processCallTurn({
        sessionId: sess4,
        callerPhone: testPhone4,
        speechText: 'What time am I available?'
    });
    console.log('Worker: "What time am I available?" -> AI:', q2.spokenResponse);
    assert.match(q2.spokenResponse, /available tomorrow from 09:00 AM to 05:00 PM/i);

    let q3 = await aiAgent.processCallTurn({
        sessionId: sess4,
        callerPhone: testPhone4,
        speechText: 'What is the weather outside?'
    });
    console.log('Worker: "What is the weather outside?" -> AI:', q3.spokenResponse);
    assert.strictEqual(q3.spokenResponse, 'I can help with your GigSync worker details and bookings.');

    let q4 = await aiAgent.processCallTurn({
        sessionId: sess4,
        callerPhone: testPhone4,
        speechText: 'Thank you, that is all.'
    });
    console.log('Worker: "Thank you, that is all." -> AI:', q4.spokenResponse);
    assert.match(q4.spokenResponse, /You're welcome! Feel free to call back anytime/i);
    assert.strictEqual(q4.shouldEndCall, true);
    console.log('✅ Test 5 Passed: Account queries and closures work properly!\n');

    // Test 6: Customer Portal Available Workers Sync
    console.log('--- Test 6: Customer Portal Sync ---');
    const availableWorkers = DB.getAllWorkers({ service: 'electrical', city: 'Ramanagara' });
    const foundRajesh = availableWorkers.find(w => w.phone === '7012280695');
    assert.ok(foundRajesh, 'Rajesh must appear in customer available electrical workers');
    assert.match(foundRajesh.trade, /electric/i);
    console.log('Found Rajesh in customer electrical list:', foundRajesh.name, foundRajesh.trade, foundRajesh.phone);
    console.log('Rajesh availability slot in customer portal:', foundRajesh.latest_availability);
    assert.ok(foundRajesh.latest_availability, 'Latest availability slot must be present');
    console.log('✅ Test 6 Passed: Customer portal sync verified with real database records!\n');

    console.log('🎉 ALL SIMPLIFIED WORKER VOICE AGENT TESTS PASSED WITH 100% SUCCESS!');
}

runTests().catch(err => {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
});
