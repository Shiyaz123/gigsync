const { aiAgent } = require('./backend/ai_agent');
const DB = require('./backend/database');
const assert = require('assert');

async function runAsadTest() {
    console.log('--- Testing Asad Voice Flow ---');
    const sessionId = 'test_asad_' + Date.now();

    // Turn 1: "I am asad"
    console.log('\nTurn 1 Input: "I am asad"');
    const t1 = await aiAgent.processCallTurn({ sessionId, speechText: "I am asad", callerPhone: null, callerRole: 'worker' });
    console.log('Turn 1 Output:', t1.spokenResponse);
    assert(!t1.spokenResponse.toLowerCase().includes("didn't quite catch that"), "Should not fall back to generic catcher");
    assert(t1.spokenResponse.toLowerCase().includes('asad') || t1.spokenResponse.toLowerCase().includes('work') || t1.spokenResponse.toLowerCase().includes('number') || t1.spokenResponse.toLowerCase().includes('phone') || t1.spokenResponse.toLowerCase().includes('trade'), "Should acknowledge Asad or ask for trade/phone");

    // Turn 2: "I am electrician"
    console.log('\nTurn 2 Input: "I am electrician"');
    const t2 = await aiAgent.processCallTurn({ sessionId, speechText: "I am electrician", callerPhone: null, callerRole: 'worker' });
    console.log('Turn 2 Output:', t2.spokenResponse);
    assert(!t2.spokenResponse.toLowerCase().includes("didn't quite catch that"), "Should understand trade");
    assert(t2.spokenResponse.toLowerCase().includes('phone') || t2.spokenResponse.toLowerCase().includes('mobile') || t2.spokenResponse.toLowerCase().includes('number') || t2.spokenResponse.toLowerCase().includes('hour') || t2.spokenResponse.toLowerCase().includes('available'), "Should ask for phone or availability");

    // Turn 3: "7012280695"
    console.log('\nTurn 3 Input: "7012280695"');
    const t3 = await aiAgent.processCallTurn({ sessionId, speechText: "7012280695", callerPhone: null, callerRole: 'worker' });
    console.log('Turn 3 Output:', t3.spokenResponse);
    assert(t3.spokenResponse.toLowerCase().includes('hour') || t3.spokenResponse.toLowerCase().includes('available') || t3.spokenResponse.toLowerCase().includes('time') || t3.spokenResponse.toLowerCase().includes('day'), "Should ask for availability");

    // Turn 4: "Tomorrow 9 to 5"
    console.log('\nTurn 4 Input: "Tomorrow 9 to 5"');
    const t4 = await aiAgent.processCallTurn({ sessionId, speechText: "Tomorrow 9 to 5", callerPhone: null, callerRole: 'worker' });
    console.log('Turn 4 Output:', t4.spokenResponse);
    assert(t4.spokenResponse.toLowerCase().includes('asad') || t4.spokenResponse.toLowerCase().includes('save') || t4.spokenResponse.toLowerCase().includes('register') || t4.spokenResponse.toLowerCase().includes('confirm'), "Should summarize and ask for confirmation");

    // Turn 5: "Yes please"
    console.log('\nTurn 5 Input: "Yes please"');
    const t5 = await aiAgent.processCallTurn({ sessionId, speechText: "Yes please", callerPhone: null, callerRole: 'worker' });
    console.log('Turn 5 Output:', t5.spokenResponse);
    assert(t5.spokenResponse.toLowerCase().includes('done') || t5.spokenResponse.toLowerCase().includes('saved') || t5.spokenResponse.toLowerCase().includes('registered') || t5.spokenResponse.toLowerCase().includes('updated'), "Should confirm registration");

    const asad = DB.getWorkerByPhone('7012280695');
    console.log('\n✅ DB Record Verified:', asad);
    assert(asad && asad.name.toLowerCase() === 'asad', "Asad must be registered in DB");

    console.log('\n🎉 Asad registration flow passed with 100% success!');
}

runAsadTest().catch(e => {
    console.error('❌ Test failed:', e);
    process.exit(1);
});
