const { aiAgent } = require('./backend/ai_agent');
const DB = require('./backend/database');

async function runVerification() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(' GIGSYNC WORKER 3.5MM VOICE CALLING VERIFICATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const sessionId = 'test_worker_sess_' + Date.now();

    // 1. Worker Self-Identification & Availability Turn 1
    console.log('[TEST 1] Worker states: "Hello my name is Rajesh I am an electrician I am available from 9 to 5 o\'clock tomorrow my number is 7012280695"');
    const turn1 = await aiAgent.processCallTurn({
        sessionId,
        callerPhone: '7012280695',
        callerRole: 'worker',
        callerName: 'Rajesh',
        city: 'Ramanagara',
        speechText: "Hello my name is Rajesh I am an electrician I am available from 9 to 5 o'clock tomorrow my number is 7012280695"
    });
    console.log('AI Response:', turn1.spokenResponse);
    console.log('Actions:', turn1.actionsPerformed);
    console.log('Pass:', turn1.spokenResponse.includes("Rajesh") && turn1.spokenResponse.includes("electrician") && turn1.spokenResponse.includes("save") ? '✅ PASS' : '❌ FAIL');
    console.log('-----------------------------------------------------\n');

    // 2. Worker Natural Confirmation ("Please add to worker")
    console.log('[TEST 2] Worker confirms: "Please add to worker"');
    const turn2 = await aiAgent.processCallTurn({
        sessionId,
        callerPhone: '7012280695',
        callerRole: 'worker',
        callerName: 'Rajesh',
        city: 'Ramanagara',
        speechText: "Please add to worker"
    });
    console.log('AI Response:', turn2.spokenResponse);
    console.log('Actions:', turn2.actionsPerformed);
    console.log('Pass:', turn2.spokenResponse.includes("registered") && turn2.spokenResponse.includes("available") ? '✅ PASS' : '❌ FAIL');

    // Verify DB
    const savedWorker = DB.getWorkerByPhone('7012280695');
    console.log('DB Worker Record:', savedWorker ? `Found: ${savedWorker.name} (${savedWorker.trade}, ${savedWorker.phone})` : 'NOT FOUND');
    console.log('-----------------------------------------------------\n');

    // 3. Worker Schedule Inquiry ("What jobs do I have today?")
    console.log('[TEST 3] Worker asks: "What jobs do I have today?"');
    const turn3 = await aiAgent.processCallTurn({
        sessionId,
        callerPhone: '7012280695',
        callerRole: 'worker',
        callerName: 'Rajesh',
        city: 'Ramanagara',
        speechText: "What jobs do I have today?"
    });
    console.log('AI Response:', turn3.spokenResponse);
    console.log('Pass:', turn3.spokenResponse.includes("jobs") ? '✅ PASS' : '❌ FAIL');
    console.log('-----------------------------------------------------\n');

    // 4. Worker Next Customer / Next Job ("Who is my next customer?")
    console.log('[TEST 4] Worker asks: "Who is my next customer?"');
    const turn4 = await aiAgent.processCallTurn({
        sessionId,
        callerPhone: '7012280695',
        callerRole: 'worker',
        callerName: 'Rajesh',
        city: 'Ramanagara',
        speechText: "Who is my next customer?"
    });
    console.log('AI Response:', turn4.spokenResponse);
    console.log('Pass:', turn4.spokenResponse.length > 0 ? '✅ PASS' : '❌ FAIL');
    console.log('-----------------------------------------------------\n');

    // 5. Worker Earnings ("How much did I earn this month?")
    console.log('[TEST 5] Worker asks: "How much did I earn this month?"');
    const turn5 = await aiAgent.processCallTurn({
        sessionId,
        callerPhone: '7012280695',
        callerRole: 'worker',
        callerName: 'Rajesh',
        city: 'Ramanagara',
        speechText: "How much did I earn this month?"
    });
    console.log('AI Response:', turn5.spokenResponse);
    console.log('Pass:', turn5.spokenResponse.includes("earned") ? '✅ PASS' : '❌ FAIL');
    console.log('-----------------------------------------------------\n');

    // 6. Worker Off-duty ("I am not available on Sunday")
    console.log('[TEST 6] Worker states: "I am not available on Sunday"');
    const turn6 = await aiAgent.processCallTurn({
        sessionId,
        callerPhone: '7012280695',
        callerRole: 'worker',
        callerName: 'Rajesh',
        city: 'Ramanagara',
        speechText: "I am not available on Sunday"
    });
    console.log('AI Response:', turn6.spokenResponse);
    console.log('Pass:', turn6.spokenResponse.includes("off-duty") || turn6.spokenResponse.includes("sunday") ? '✅ PASS' : '❌ FAIL');
    console.log('-----------------------------------------------------\n');

    // 7. Customer in Chatbot searching worker ("I need an electrician tomorrow")
    console.log('[TEST 7] Customer in Chatbot: "I need an electrician tomorrow"');
    const turn7 = await aiAgent.processCallTurn({
        sessionId: 'cust_sess_' + Date.now(),
        callerPhone: '9876543210',
        callerRole: 'customer',
        callerName: 'Customer',
        city: 'Ramanagara',
        speechText: "I need an electrician tomorrow"
    });
    console.log('AI Response:', turn7.spokenResponse);
    console.log('Pass:', turn7.spokenResponse.includes("electrician") || turn7.spokenResponse.includes("specialist") ? '✅ PASS' : '❌ FAIL');
    console.log('-----------------------------------------------------\n');
}

runVerification().catch(console.error);
