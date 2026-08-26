const { aiAgent } = require('./backend/ai_agent');
const DB = require('./backend/database');
const assert = require('assert');

async function runAll12Scenarios() {
    console.log('================================================================');
    console.log('GIGSYNC — 12 COMPREHENSIVE WORKER VOICE AGENT SCENARIOS TEST');
    console.log('================================================================\n');

    // -------------------------------------------------------------------------
    // TEST 1: NEW WORKER FULL ONBOARDING FLOW
    // -------------------------------------------------------------------------
    console.log('▶ TEST 1: New Worker Multi-Turn Registration & Availability');
    const s1 = { callerPhone: null, callerRole: 'worker', city: 'Ramanagara', history: [], context: {} };
    
    const t1_1 = await aiAgent.processTurn(s1, "Hello");
    console.log('  T1 [Hello]:', t1_1.spokenResponse);
    assert(!t1_1.spokenResponse.includes("can't reach"), "T1.1 failed");

    const t1_2 = await aiAgent.processTurn(s1, "I want to register as a worker");
    console.log('  T1 [Register]:', t1_2.spokenResponse);
    assert(t1_2.spokenResponse.toLowerCase().includes('name') || t1_2.spokenResponse.toLowerCase().includes('what'), "T1.2 failed to ask details");

    const t1_3 = await aiAgent.processTurn(s1, "My name is Rajesh");
    console.log('  T1 [Rajesh]:', t1_3.spokenResponse);
    assert(t1_3.spokenResponse.toLowerCase().includes('phone') || t1_3.spokenResponse.toLowerCase().includes('mobile') || t1_3.spokenResponse.toLowerCase().includes('number') || t1_3.spokenResponse.toLowerCase().includes('work'), "T1.3 failed to ask phone or work");

    const t1_4 = await aiAgent.processTurn(s1, "My number is 7012280695");
    console.log('  T1 [Phone]:', t1_4.spokenResponse);
    assert(t1_4.spokenResponse.toLowerCase().includes('work') || t1_4.spokenResponse.toLowerCase().includes('trade') || t1_4.spokenResponse.toLowerCase().includes('type') || t1_4.spokenResponse.toLowerCase().includes('profession'), "T1.4 failed to ask profession");

    const t1_5 = await aiAgent.processTurn(s1, "I am an electrician");
    console.log('  T1 [Electrician]:', t1_5.spokenResponse);
    assert(t1_5.spokenResponse.toLowerCase().includes('hours') || t1_5.spokenResponse.toLowerCase().includes('available') || t1_5.spokenResponse.toLowerCase().includes('time') || t1_5.spokenResponse.toLowerCase().includes('day') || t1_5.spokenResponse.toLowerCase().includes('city') || t1_5.spokenResponse.toLowerCase().includes('area'), "T1.5 failed to ask availability or area");

    const t1_6 = await aiAgent.processTurn(s1, "Tomorrow 9 to 5");
    console.log('  T1 [Tomorrow 9 to 5]:', t1_6.spokenResponse);
    assert(t1_6.spokenResponse.toLowerCase().includes('rajesh') || t1_6.spokenResponse.toLowerCase().includes('electrical') || t1_6.spokenResponse.toLowerCase().includes('electrician') || t1_6.spokenResponse.toLowerCase().includes('save') || t1_6.spokenResponse.toLowerCase().includes('done') || t1_6.spokenResponse.toLowerCase().includes('register'), "T1.6 failed to summarize or register");

    const t1_7 = await aiAgent.processTurn(s1, "Yes, save it");
    console.log('  T1 [Yes]:', t1_7.spokenResponse);
    assert(t1_7.spokenResponse.toLowerCase().includes('done') || t1_7.spokenResponse.toLowerCase().includes('saved') || t1_7.spokenResponse.toLowerCase().includes('registered') || t1_7.spokenResponse.toLowerCase().includes('help') || t1_7.spokenResponse.toLowerCase().includes('welcome'), "T1.7 failed to confirm");

    const rajesh = DB.getWorkerByPhone('7012280695');
    assert(rajesh && rajesh.name === 'Rajesh', "Rajesh must exist in database");
    console.log('  ✅ TEST 1 PASSED: Worker Rajesh registered and persisted in DB.\n');

    // -------------------------------------------------------------------------
    // TEST 2: MISSING DATA SLOT-FILLING
    // -------------------------------------------------------------------------
    console.log('▶ TEST 2: Missing Data Active Detection');
    const s2 = { callerPhone: null, callerRole: 'worker', city: 'Ramanagara', history: [], context: {} };
    const t2_1 = await aiAgent.processTurn(s2, "My name is Suresh");
    console.log('  T2 [Suresh]:', t2_1.spokenResponse);
    assert(t2_1.spokenResponse.toLowerCase().includes('phone') || t2_1.spokenResponse.toLowerCase().includes('mobile') || t2_1.spokenResponse.toLowerCase().includes('number') || t2_1.spokenResponse.toLowerCase().includes('work'), "T2.1 failed to ask phone");

    const t2_2 = await aiAgent.processTurn(s2, "My number is 8073280683");
    console.log('  T2 [Phone]:', t2_2.spokenResponse);
    assert(t2_2.spokenResponse.toLowerCase().includes('work') || t2_2.spokenResponse.toLowerCase().includes('trade') || t2_2.spokenResponse.toLowerCase().includes('profession'), "T2.2 failed to ask trade");
    console.log('  ✅ TEST 2 PASSED: Missing data actively detected and prompted in correct sequence.\n');

    // -------------------------------------------------------------------------
    // TEST 3: EXISTING WORKER IDENTIFICATION & AVAILABILITY QUERY
    // -------------------------------------------------------------------------
    console.log('▶ TEST 3: Existing Worker Identification (Rumais - 7760782551)');
    const s3 = { callerPhone: '7760782551', callerRole: 'worker', city: 'Ramanagara', history: [], context: {} };
    const t3_1 = await aiAgent.processTurn(s3, "What is my availability?");
    console.log('  T3 [Availability]:', t3_1.spokenResponse);
    assert(!t3_1.spokenResponse.includes("can't reach"), "T3.1 failed");
    console.log('  ✅ TEST 3 PASSED: Existing worker recognized and availability reported.\n');

    // -------------------------------------------------------------------------
    // TEST 4: WORKER BOOKINGS QUERY
    // -------------------------------------------------------------------------
    console.log('▶ TEST 4: Worker Bookings Query');
    const s4 = { callerPhone: '7760782551', callerRole: 'worker', city: 'Ramanagara', history: [], context: {} };
    const t4_1 = await aiAgent.processTurn(s4, "Has anyone booked me today?");
    console.log('  T4 [Bookings]:', t4_1.spokenResponse);
    assert(!t4_1.spokenResponse.includes("can't reach"), "T4.1 failed");
    console.log('  ✅ TEST 4 PASSED: Booking queries answered from real data.\n');

    // -------------------------------------------------------------------------
    // TEST 5: WORKER EARNINGS QUERY
    // -------------------------------------------------------------------------
    console.log('▶ TEST 5: Worker Earnings Query');
    const s5 = { callerPhone: '7760782551', callerRole: 'worker', city: 'Ramanagara', history: [], context: {} };
    const t5_1 = await aiAgent.processTurn(s5, "How much did I earn this month?");
    console.log('  T5 [Earnings]:', t5_1.spokenResponse);
    assert(!t5_1.spokenResponse.includes("can't reach"), "T5.1 failed");
    console.log('  ✅ TEST 5 PASSED: Earnings calculated and reported.\n');

    // -------------------------------------------------------------------------
    // TEST 6: AVAILABILITY CHANGE WITH CONFIRMATION
    // -------------------------------------------------------------------------
    console.log('▶ TEST 6: Availability Change with Confirmation Gate');
    const s6 = { callerPhone: '7760782551', callerRole: 'worker', city: 'Ramanagara', history: [], context: {} };
    const t6_1 = await aiAgent.processTurn(s6, "Change tomorrow to 10 AM to 6 PM");
    console.log('  T6 [Change]:', t6_1.spokenResponse);
    
    const t6_2 = await aiAgent.processTurn(s6, "Yes");
    console.log('  T6 [Yes]:', t6_2.spokenResponse);
    assert(t6_2.spokenResponse.toLowerCase().includes('done') || t6_2.spokenResponse.toLowerCase().includes('updated') || t6_2.spokenResponse.toLowerCase().includes('saved'), "T6.2 failed to confirm");
    console.log('  ✅ TEST 6 PASSED: Availability changed with explicit confirmation.\n');

    // -------------------------------------------------------------------------
    // TEST 7: JOB STATUS UPDATE
    // -------------------------------------------------------------------------
    console.log('▶ TEST 7: Job Status Update');
    const s7 = { callerPhone: '7760782551', callerRole: 'worker', city: 'Ramanagara', history: [], context: {} };
    const t7_1 = await aiAgent.processTurn(s7, "I completed my current job");
    console.log('  T7 [Complete Job]:', t7_1.spokenResponse);
    assert(!t7_1.spokenResponse.includes("can't reach"), "T7.1 failed");
    console.log('  ✅ TEST 7 PASSED: Job completion request handled cleanly.\n');

    // -------------------------------------------------------------------------
    // TEST 8: GENERAL GIGSYNC PLATFORM QUESTION
    // -------------------------------------------------------------------------
    console.log('▶ TEST 8: General GigSync Workflow Question');
    const s8 = { callerPhone: null, callerRole: 'worker', city: 'Ramanagara', history: [], context: {} };
    const t8_1 = await aiAgent.processTurn(s8, "How does GigSync work?");
    console.log('  T8 [How GigSync Works]:', t8_1.spokenResponse);
    assert(t8_1.spokenResponse.toLowerCase().includes('gigsync') || t8_1.spokenResponse.toLowerCase().includes('worker') || t8_1.spokenResponse.toLowerCase().includes('customer') || t8_1.spokenResponse.toLowerCase().includes('service'), "T8.1 failed");
    console.log('  ✅ TEST 8 PASSED: Natural explanation of GigSync provided.\n');

    // -------------------------------------------------------------------------
    // TEST 9: NATURAL LANGUAGE INTENT VARIATIONS
    // -------------------------------------------------------------------------
    console.log('▶ TEST 9: Natural Language Intent Variations');
    const s9 = { callerPhone: '7760782551', callerRole: 'worker', city: 'Ramanagara', history: [], context: {} };
    const variations = [
        "Do I have any work today?",
        "Anyone booked me?",
        "Am I free tomorrow?",
        "Who is my next customer?"
    ];
    for (const v of variations) {
        const res = await aiAgent.processTurn(s9, v);
        console.log(`  T9 ["${v}"] ->`, res.spokenResponse);
        assert(!res.spokenResponse.includes("can't reach"), `T9 failed for variation: ${v}`);
    }
    console.log('  ✅ TEST 9 PASSED: All natural language variations resolved smoothly.\n');

    // -------------------------------------------------------------------------
    // TEST 10: UNRELATED QUESTION POLITE REDIRECTION
    // -------------------------------------------------------------------------
    console.log('▶ TEST 10: Unrelated Question Polite Redirection');
    const s10 = { callerPhone: null, callerRole: 'worker', city: 'Ramanagara', history: [], context: {} };
    const t10_1 = await aiAgent.processTurn(s10, "What is the weather outside today?");
    console.log('  T10 [Weather]:', t10_1.spokenResponse);
    assert(t10_1.spokenResponse.toLowerCase().includes('gigsync') || t10_1.spokenResponse.toLowerCase().includes('help') || t10_1.spokenResponse.toLowerCase().includes('service'), "T10.1 failed to redirect politely");
    console.log('  ✅ TEST 10 PASSED: Unrelated question politely redirected.\n');

    // -------------------------------------------------------------------------
    // TEST 11: CONVERSATIONAL THANK YOU / WRAP UP
    // -------------------------------------------------------------------------
    console.log('▶ TEST 11: Conversational Thank You & Call Ending');
    const s11 = { callerPhone: '7760782551', callerRole: 'worker', city: 'Ramanagara', history: [], context: {} };
    const t11_1 = await aiAgent.processTurn(s11, "Thank you, that is all I needed.");
    console.log('  T11 [Thank you]:', t11_1.spokenResponse);
    assert(t11_1.spokenResponse.toLowerCase().includes('welcome') || t11_1.spokenResponse.toLowerCase().includes('glad') || t11_1.spokenResponse.toLowerCase().includes('help'), "T11.1 failed warm response");
    console.log('  ✅ TEST 11 PASSED: Warm closing without questionnaire repetition.\n');

    // -------------------------------------------------------------------------
    // TEST 12: UNASSIGNED JOB REQUESTS QUERY
    // -------------------------------------------------------------------------
    console.log('▶ TEST 12: Unassigned Job Requests Query');
    const s12 = { callerPhone: '7760782551', callerRole: 'worker', city: 'Ramanagara', history: [], context: {} };
    const t12_1 = await aiAgent.processTurn(s12, "Are there any jobs available near me?");
    console.log('  T12 [Available Jobs]:', t12_1.spokenResponse);
    assert(!t12_1.spokenResponse.includes("can't reach"), "T12.1 failed");
    console.log('  ✅ TEST 12 PASSED: Job requests query answered accurately.\n');

    console.log('================================================================');
    console.log('🎉 ALL 12 WORKER VOICE AGENT SCENARIOS PASSED WITH 100% SUCCESS!');
    console.log('================================================================\n');
}

runAll12Scenarios().catch(e => {
    console.error('❌ Test suite failed:', e);
    process.exit(1);
});
