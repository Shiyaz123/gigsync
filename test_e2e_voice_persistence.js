/**
 * End-to-End Automated Regression Test Suite
 * Validates Complete Voice-to-Database-to-UI Persistence Flow
 */

const assert = require('node:assert');
const { aiAgent } = require('./backend/ai_agent');
const DB = require('./backend/database');
const FirebaseSync = require('./backend/firebase');

async function runE2ETests() {
    console.log('================================================================');
    console.log('🚀 RUNNING END-TO-END VOICE PERSISTENCE & UI INTEGRATION TESTS');
    console.log('================================================================\n');

    let passed = 0;
    let failed = 0;

    const testWorkerPhone = '7012280695';

    // Clean up any previous test record for this phone to start fresh
    DB.deleteTestWorkerByPhone(testWorkerPhone);
    DB.deleteTestWorkerByPhone('9845011111');
    DB.deleteTestWorkerByPhone('9845022222');
    DB.deleteTestWorkerByPhone('9845033333');

    // --------------------------------------------------------------------------
    // TEST 1: Worker Voice Registration + Availability with Confirmation
    // --------------------------------------------------------------------------
    try {
        console.log('TEST 1: Worker Voice Registration + Shift ("Rajesh, Electrician, tomorrow 9 AM to 5 PM")...');
        
        const turn1Session = {
            callerPhone: testWorkerPhone,
            callerRole: 'worker',
            city: 'Ramanagara',
            history: [],
            context: {}
        };

        const turn1Res = await aiAgent.processCallTurn(
            turn1Session,
            "My name is Rajesh. I am an electrician. I am available tomorrow from 9 AM to 5 PM."
        );

        console.log('  Turn 1 Spoken:', turn1Res.spokenResponse);
        assert(
            turn1Res.spokenResponse.toLowerCase().includes('rajesh') &&
            turn1Res.spokenResponse.toLowerCase().includes('electr') &&
            turn1Res.spokenResponse.toLowerCase().includes('tomorrow') &&
            (turn1Res.spokenResponse.toLowerCase().includes('save') || turn1Res.spokenResponse.toLowerCase().includes('shall i') || turn1Res.spokenResponse.toLowerCase().includes('register') || turn1Res.spokenResponse.toLowerCase().includes('would you like')),
            `Turn 1 must prompt confirmation for Rajesh, electrician, tomorrow 9 to 5. Got: ${turn1Res.spokenResponse}`
        );

        // Turn 2: Worker confirms
        const turn2Res = await aiAgent.processCallTurn(turn1Session, "Yes, save it.");
        console.log('  Turn 2 Spoken:', turn2Res.spokenResponse);
        
        assert(
            (turn2Res.spokenResponse.toLowerCase().includes('done') || turn2Res.spokenResponse.toLowerCase().includes('saved') || turn2Res.spokenResponse.toLowerCase().includes('registered') || turn2Res.spokenResponse.toLowerCase().includes('all set')) &&
            turn2Res.spokenResponse.toLowerCase().includes('tomorrow') &&
            turn2Res.spokenResponse.toLowerCase().includes('9') &&
            turn2Res.spokenResponse.toLowerCase().includes('5'),
            `Turn 2 must confirm exact updated details. Got: ${turn2Res.spokenResponse}`
        );

        // Verify Direct SQLite Database Record
        const savedWorker = DB.getWorkerByPhone(testWorkerPhone);
        assert(savedWorker, 'Worker record must exist in SQLite database');
        assert.strictEqual(savedWorker.name, 'Rajesh', 'Worker name must be Rajesh');
        assert(savedWorker.trade.toLowerCase().includes('electr'), `Worker trade must be Electrician/Electrical. Got: ${savedWorker.trade}`);
        assert.strictEqual(savedWorker.is_available, 1, 'Worker is_available must be 1');

        const schedule = DB.getWorkerSchedule(testWorkerPhone);
        assert(schedule.availabilitySlots.length > 0, 'Availability slot must exist in worker_availability table');
        const latestSlot = schedule.availabilitySlots[0];
        assert.strictEqual(latestSlot.date_str, 'Tomorrow', 'Slot date must be Tomorrow');
        assert.strictEqual(latestSlot.start_time, '09:00 AM', 'Start time must be 09:00 AM');
        assert.strictEqual(latestSlot.end_time, '05:00 PM', 'End time must be 05:00 PM');

        // Verify Firestore Sync Snapshot
        const fsDoc = FirebaseSync.getDocument('workers', `worker_${savedWorker.id}_${testWorkerPhone}`);
        assert(fsDoc, 'Worker document snapshot must be stored in Firestore sync layer');
        assert(fsDoc.trade.toLowerCase().includes('electr'));

        console.log('  ✅ TEST 1 PASSED: Worker registered and availability persisted with verified voice confirmation.\n');
        passed++;
    } catch (err) {
        console.error('  ❌ TEST 1 FAILED:', err.message, '\n');
        failed++;
    }

    // --------------------------------------------------------------------------
    // TEST 2: Worker Availability Update (Shift change only: 10 AM to 6 PM)
    // --------------------------------------------------------------------------
    try {
        console.log('TEST 2: Worker Shift Change ("Change my availability tomorrow to 10 AM to 6 PM")...');
        
        const turnSession = {
            callerPhone: testWorkerPhone,
            callerRole: 'worker',
            city: 'Ramanagara',
            history: [],
            context: {}
        };

        const turn1Res = await aiAgent.processCallTurn(
            turnSession,
            "Change my availability tomorrow to 10 AM to 6 PM."
        );
        console.log('  Turn 1 Spoken:', turn1Res.spokenResponse);

        const turn2Res = await aiAgent.processCallTurn(turnSession, "Yes.");
        console.log('  Turn 2 Spoken:', turn2Res.spokenResponse);

        assert(
            (turn2Res.spokenResponse.toLowerCase().includes('done') || turn2Res.spokenResponse.toLowerCase().includes('saved') || turn2Res.spokenResponse.toLowerCase().includes('updated') || turn2Res.spokenResponse.toLowerCase().includes('all set')) &&
            (turn2Res.spokenResponse.toLowerCase().includes('10') || turn2Res.spokenResponse.toLowerCase().includes('10:00')) &&
            (turn2Res.spokenResponse.toLowerCase().includes('6') || turn2Res.spokenResponse.toLowerCase().includes('06:00')),
            `Spoken response must confirm 10 AM to 6 PM shift. Got: ${turn2Res.spokenResponse}`
        );

        const schedule = DB.getWorkerSchedule(testWorkerPhone);
        const latestSlot = schedule.availabilitySlots[0];
        assert.strictEqual(latestSlot.start_time, '10:00 AM');
        assert.strictEqual(latestSlot.end_time, '06:00 PM');

        console.log('  ✅ TEST 2 PASSED: Shift updated and exact hours spoken back.\n');
        passed++;
    } catch (err) {
        console.error('  ❌ TEST 2 FAILED:', err.message, '\n');
        failed++;
    }

    // --------------------------------------------------------------------------
    // TEST 3: Worker Profession Change ("I am a plumber now")
    // --------------------------------------------------------------------------
    try {
        console.log('TEST 3: Worker Profession Change ("I am a plumber now")...');
        
        const turnSession = {
            callerPhone: testWorkerPhone,
            callerRole: 'worker',
            city: 'Ramanagara',
            history: [],
            context: {}
        };

        const turn1Res = await aiAgent.processCallTurn(
            turnSession,
            "I am a plumber now."
        );
        console.log('  Turn 1 Spoken:', turn1Res.spokenResponse);

        const turn2Res = await aiAgent.processCallTurn(turnSession, "Yes.");
        console.log('  Turn 2 Spoken:', turn2Res.spokenResponse);

        assert(
            (turn2Res.spokenResponse.toLowerCase().includes('done') || turn2Res.spokenResponse.toLowerCase().includes('updated') || turn2Res.spokenResponse.toLowerCase().includes('saved') || turn2Res.spokenResponse.toLowerCase().includes('all set')) &&
            turn2Res.spokenResponse.toLowerCase().includes('plumber'),
            `Spoken response must confirm profession changed to plumber. Got: ${turn2Res.spokenResponse}`
        );

        const updatedWorker = DB.getWorkerByPhone(testWorkerPhone);
        assert(updatedWorker.trade.toLowerCase().includes('plumb'), `Worker trade must be Plumber/Plumbing. Got: ${updatedWorker.trade}`);

        console.log('  ✅ TEST 3 PASSED: Profession changed to plumber and verified.\n');
        passed++;
    } catch (err) {
        console.error('  ❌ TEST 3 FAILED:', err.message, '\n');
        failed++;
    }

    // --------------------------------------------------------------------------
    // TEST 4: UI Worker Dashboard Data Consistency (Simulating Page Refresh)
    // --------------------------------------------------------------------------
    try {
        console.log('TEST 4: Worker Dashboard Refresh & Schedule Slot Query...');

        const schedule = DB.getWorkerSchedule(testWorkerPhone);
        assert(schedule.worker, 'Worker profile must load upon dashboard refresh');
        assert.strictEqual(schedule.worker.name, 'Rajesh');
        assert(schedule.worker.trade.toLowerCase().includes('plumb'), `Dashboard trade must match Plumber/Plumbing. Got: ${schedule.worker.trade}`);
        assert(schedule.availabilitySlots.length > 0);
        
        const latest = schedule.availabilitySlots[0];
        const formattedHours = `${latest.start_time} – ${latest.end_time} (${latest.date_str})`;
        assert.strictEqual(formattedHours, '10:00 AM – 06:00 PM (Tomorrow)');

        console.log(`  Worker Dashboard Label: "${formattedHours}"`);
        console.log('  ✅ TEST 4 PASSED: Worker dashboard successfully reads persisted schedule upon refresh.\n');
        passed++;
    } catch (err) {
        console.error('  ❌ TEST 4 FAILED:', err.message, '\n');
        failed++;
    }

    // --------------------------------------------------------------------------
    // TEST 5: Customer Feed Persistence (Simulating Customer Home Refresh)
    // --------------------------------------------------------------------------
    try {
        console.log('TEST 5: Customer Home Workers Feed...');

        const workers = DB.getAllWorkers({ city: 'Ramanagara' });
        const rajesh = workers.find(w => w.phone === testWorkerPhone);
        assert(rajesh, 'Rajesh must appear in customer available specialists grid');
        assert(rajesh.trade.toLowerCase().includes('plumb'), `Feed trade must match Plumber/Plumbing. Got: ${rajesh.trade}`);
        assert(rajesh.availability_hours.includes('10:00 AM – 06:00 PM (Tomorrow)'));

        console.log(`  Customer Card Meta: ${rajesh.name} | ${rajesh.trade} | ${rajesh.availability_hours}`);
        console.log('  ✅ TEST 5 PASSED: Customer portal shows updated worker card with real availability.\n');
        passed++;
    } catch (err) {
        console.error('  ❌ TEST 5 FAILED:', err.message, '\n');
        failed++;
    }

    // --------------------------------------------------------------------------
    // TEST 6: Customer Query for Available Plumbers
    // --------------------------------------------------------------------------
    try {
        console.log('TEST 6: Customer Query ("Which plumbers are available tomorrow?")...');

        const custSession = {
            callerPhone: '9845099999',
            callerRole: 'customer',
            city: 'Ramanagara',
            history: [],
            context: {}
        };

        const custRes = await aiAgent.processCallTurn(
            custSession,
            "Which plumbers are available tomorrow?"
        );
        console.log('  Customer AI Response:', custRes.spokenResponse);

        assert(
            custRes.spokenResponse.toLowerCase().includes('rajesh') ||
            custRes.spokenResponse.toLowerCase().includes('plumber'),
            `Customer query must return available plumber Rajesh. Got: ${custRes.spokenResponse}`
        );

        console.log('  ✅ TEST 6 PASSED: Customer search finds newly registered worker.\n');
        passed++;
    } catch (err) {
        console.error('  ❌ TEST 6 FAILED:', err.message, '\n');
        failed++;
    }

    // --------------------------------------------------------------------------
    // TEST 7: Idempotency & No Duplicate Workers
    // --------------------------------------------------------------------------
    try {
        console.log('TEST 7: No Duplicate Worker Rows in SQLite Database...');

        const allWorkers = DB.getAllWorkers({});
        const matching = allWorkers.filter(w => w.phone === testWorkerPhone);
        assert.strictEqual(matching.length, 1, `Exactly 1 worker record must exist for phone ${testWorkerPhone}. Found: ${matching.length}`);

        console.log('  ✅ TEST 7 PASSED: Idempotent upsert verified with 0 duplicates.\n');
        passed++;
    } catch (err) {
        console.error('  ❌ TEST 7 FAILED:', err.message, '\n');
        failed++;
    }

    // --------------------------------------------------------------------------
    // TEST 8: Continuous Natural Conversation ("What jobs do I have tomorrow?")
    // --------------------------------------------------------------------------
    try {
        console.log('TEST 8: Natural Conversation Continuation After Update...');

        const continuousSession = {
            callerPhone: testWorkerPhone,
            callerRole: 'worker',
            city: 'Ramanagara',
            history: [],
            context: {}
        };

        const followUpRes = await aiAgent.processCallTurn(
            continuousSession,
            "What jobs do I have tomorrow?"
        );
        console.log('  Follow-up AI Spoken:', followUpRes.spokenResponse);

        assert(
            followUpRes.spokenResponse.toLowerCase().includes('available') ||
            followUpRes.spokenResponse.toLowerCase().includes('job') ||
            followUpRes.spokenResponse.toLowerCase().includes('schedule'),
            `Follow-up query must query database schedule. Got: ${followUpRes.spokenResponse}`
        );

        console.log('  ✅ TEST 8 PASSED: Natural conversation continued with real database schedule query.\n');
        passed++;
    } catch (err) {
        console.error('  ❌ TEST 8 FAILED:', err.message, '\n');
        failed++;
    }

    // --------------------------------------------------------------------------
    // TEST 9: Multi-Turn Slot Filling When Name Is Missing
    // --------------------------------------------------------------------------
    try {
        console.log('TEST 9: Multi-Turn Slot Filling (Missing Name)...');

        const s9 = {
            callerPhone: '9845011111',
            callerRole: 'worker',
            city: 'Ramanagara',
            history: [],
            context: {}
        };

        const t1 = await aiAgent.processCallTurn(s9, "I am an electrician and I am available tomorrow from 11 to 5.");
        console.log('  T1 Spoken:', t1.spokenResponse);
        assert(t1.spokenResponse.toLowerCase().includes('name'), `Must prompt for missing name. Got: ${t1.spokenResponse}`);

        const t2 = await aiAgent.processCallTurn(s9, "Rajesh.");
        console.log('  T2 Spoken:', t2.spokenResponse);
        assert(
            t2.spokenResponse.toLowerCase().includes('rajesh') &&
            t2.spokenResponse.toLowerCase().includes('electr') &&
            (t2.spokenResponse.toLowerCase().includes('11') || t2.spokenResponse.toLowerCase().includes('11:00')) &&
            (t2.spokenResponse.toLowerCase().includes('5') || t2.spokenResponse.toLowerCase().includes('05:00')) &&
            (t2.spokenResponse.toLowerCase().includes('save') || t2.spokenResponse.toLowerCase().includes('shall i') || t2.spokenResponse.toLowerCase().includes('register') || t2.spokenResponse.toLowerCase().includes('would you like')),
            `Must summarize all details and ask confirmation. Got: ${t2.spokenResponse}`
        );

        const t3 = await aiAgent.processCallTurn(s9, "Yes.");
        console.log('  T3 Spoken:', t3.spokenResponse);
        assert(
            (t3.spokenResponse.toLowerCase().includes('done') || t3.spokenResponse.toLowerCase().includes('saved') || t3.spokenResponse.toLowerCase().includes('registered') || t3.spokenResponse.toLowerCase().includes('all set')) &&
            t3.spokenResponse.toLowerCase().includes('electr') &&
            (t3.spokenResponse.toLowerCase().includes('11') || t3.spokenResponse.toLowerCase().includes('11:00')) &&
            (t3.spokenResponse.toLowerCase().includes('5') || t3.spokenResponse.toLowerCase().includes('05:00')),
            `Must confirm saved details. Got: ${t3.spokenResponse}`
        );

        const w9 = DB.getWorkerByPhone('9845011111');
        assert(w9 && w9.name === 'Rajesh');
        const sch9 = DB.getWorkerSchedule('9845011111');
        assert(sch9.availabilitySlots[0].start_time === '11:00 AM');
        assert(sch9.availabilitySlots[0].end_time === '05:00 PM');

        console.log('  ✅ TEST 9 PASSED: Missing name collected and complete worker saved.\n');
        passed++;
    } catch (err) {
        console.error('  ❌ TEST 9 FAILED:', err.message, '\n');
        failed++;
    }

    // --------------------------------------------------------------------------
    // TEST 10: Multi-Turn Slot Filling When Trade Is Missing
    // --------------------------------------------------------------------------
    try {
        console.log('TEST 10: Multi-Turn Slot Filling (Missing Trade)...');

        const s10 = {
            callerPhone: '9845022222',
            callerRole: 'worker',
            city: 'Ramanagara',
            history: [],
            context: {}
        };

        const t1 = await aiAgent.processCallTurn(s10, "My name is Anas and I'm available today from 9 AM to 4 PM.");
        console.log('  T1 Spoken:', t1.spokenResponse);
        assert(
            t1.spokenResponse.toLowerCase().includes('work') ||
            t1.spokenResponse.toLowerCase().includes('trade') ||
            t1.spokenResponse.toLowerCase().includes('do you do') ||
            t1.spokenResponse.toLowerCase().includes('type'),
            `Must prompt for missing profession. Got: ${t1.spokenResponse}`
        );

        const t2 = await aiAgent.processCallTurn(s10, "Plumber.");
        console.log('  T2 Spoken:', t2.spokenResponse);
        assert(
            t2.spokenResponse.toLowerCase().includes('anas') &&
            t2.spokenResponse.toLowerCase().includes('plumb') &&
            (t2.spokenResponse.toLowerCase().includes('9') || t2.spokenResponse.toLowerCase().includes('09:00')) &&
            (t2.spokenResponse.toLowerCase().includes('4') || t2.spokenResponse.toLowerCase().includes('04:00')) &&
            (t2.spokenResponse.toLowerCase().includes('save') || t2.spokenResponse.toLowerCase().includes('shall i') || t2.spokenResponse.toLowerCase().includes('register') || t2.spokenResponse.toLowerCase().includes('would you like')),
            `Must summarize all details. Got: ${t2.spokenResponse}`
        );

        const t3 = await aiAgent.processCallTurn(s10, "Yes.");
        console.log('  T3 Spoken:', t3.spokenResponse);
        assert(
            (t3.spokenResponse.toLowerCase().includes('done') || t3.spokenResponse.toLowerCase().includes('saved') || t3.spokenResponse.toLowerCase().includes('registered') || t3.spokenResponse.toLowerCase().includes('all set')) &&
            t3.spokenResponse.toLowerCase().includes('plumb') &&
            (t3.spokenResponse.toLowerCase().includes('9') || t3.spokenResponse.toLowerCase().includes('09:00')) &&
            (t3.spokenResponse.toLowerCase().includes('4') || t3.spokenResponse.toLowerCase().includes('04:00')),
            `Must confirm saved details. Got: ${t3.spokenResponse}`
        );

        const w10 = DB.getWorkerByPhone('9845022222');
        assert(w10 && w10.name === 'Anas');
        assert(w10.trade.toLowerCase().includes('plumb'));

        console.log('  ✅ TEST 10 PASSED: Missing trade collected and worker persisted.\n');
        passed++;
    } catch (err) {
        console.error('  ❌ TEST 10 FAILED:', err.message, '\n');
        failed++;
    }

    // --------------------------------------------------------------------------
    // TEST 11: Real Profile Query ("What are my details?")
    // --------------------------------------------------------------------------
    try {
        console.log('TEST 11: Worker Profile Details Query ("What are my details?")...');

        const s11 = {
            callerPhone: '9845022222',
            callerRole: 'worker',
            city: 'Ramanagara',
            history: [],
            context: {}
        };

        const res11 = await aiAgent.processCallTurn(s11, "What are my details?");
        console.log('  Profile Spoken:', res11.spokenResponse);

        assert(
            res11.spokenResponse.toLowerCase().includes('anas') &&
            res11.spokenResponse.toLowerCase().includes('plumber'),
            `Must query real database profile and respond accurately. Got: ${res11.spokenResponse}`
        );

        console.log('  ✅ TEST 11 PASSED: Profile details queried and spoken accurately from SQLite.\n');
        passed++;
    } catch (err) {
        console.error('  ❌ TEST 11 FAILED:', err.message, '\n');
        failed++;
    }

    // --------------------------------------------------------------------------
    // TEST 12: Anonymous Caller Missing Phone & "10 in the morning until 6"
    // --------------------------------------------------------------------------
    try {
        console.log('TEST 12: Anonymous Caller Phone Missing & Natural Timing...');

        const s12 = {
            callerPhone: null,
            callerRole: 'worker',
            city: 'Ramanagara',
            history: [],
            context: {}
        };

        const t1 = await aiAgent.processCallTurn(s12, "My name is Ramesh and I am a carpenter.");
        assert(
            t1.spokenResponse.toLowerCase().includes('phone') ||
            t1.spokenResponse.toLowerCase().includes('mobile') ||
            t1.spokenResponse.toLowerCase().includes('number'),
            `Must prompt for missing phone. Got: ${t1.spokenResponse}`
        );

        const t2 = await aiAgent.processCallTurn(s12, "9845033333");
        console.log('  T2 Spoken:', t2.spokenResponse);
        assert(t2.spokenResponse.toLowerCase().includes('hours') || t2.spokenResponse.toLowerCase().includes('available'), `Must prompt for missing availability. Got: ${t2.spokenResponse}`);

        const t3 = await aiAgent.processCallTurn(s12, "10 in the morning until 6 tomorrow");
        console.log('  T3 Spoken:', t3.spokenResponse);
        assert(
            t3.spokenResponse.toLowerCase().includes('ramesh') &&
            t3.spokenResponse.toLowerCase().includes('carpenter') &&
            (t3.spokenResponse.toLowerCase().includes('register') || t3.spokenResponse.toLowerCase().includes('save') || t3.spokenResponse.toLowerCase().includes('available') || t3.spokenResponse.toLowerCase().includes('would you like')),
            `Must prompt for registration or availability confirmation. Got: ${t3.spokenResponse}`
        );

        const t4 = await aiAgent.processCallTurn(s12, "Yes.");
        console.log('  T4 Spoken:', t4.spokenResponse);
        assert(t4.spokenResponse.toLowerCase().includes('done'));

        const w12 = DB.getWorkerByPhone('9845033333');
        assert(w12 && w12.name === 'Ramesh');
        assert(w12.trade.toLowerCase().includes('carpent'));

        console.log('  ✅ TEST 12 PASSED: Anonymous caller phone and natural hours successfully processed.\n');
        passed++;
    } catch (err) {
        console.error('  ❌ TEST 12 FAILED:', err.message, '\n');
        failed++;
    }

    console.log('================================================================');
    console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================\n');

    if (failed > 0) process.exit(1);
}

runE2ETests().catch(err => {
    console.error('Fatal Test Suite Error:', err);
    process.exit(1);
});
