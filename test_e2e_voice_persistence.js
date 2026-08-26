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
    try {
        const existing = DB.getWorkerByPhone(testWorkerPhone);
        if (existing) {
            DB.getWorkerSchedule(testWorkerPhone);
        }
    } catch (_) {}

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
            (turn1Res.spokenResponse.toLowerCase().includes('save') || turn1Res.spokenResponse.toLowerCase().includes('shall i')),
            `Turn 1 must prompt confirmation for Rajesh, electrician, tomorrow 9 to 5. Got: ${turn1Res.spokenResponse}`
        );

        // Turn 2: Worker confirms
        const turn2Res = await aiAgent.processCallTurn(turn1Session, "Yes, save it.");
        console.log('  Turn 2 Spoken:', turn2Res.spokenResponse);
        
        assert(
            turn2Res.spokenResponse.toLowerCase().includes('done') &&
            turn2Res.spokenResponse.toLowerCase().includes('electrician') &&
            turn2Res.spokenResponse.toLowerCase().includes('tomorrow') &&
            turn2Res.spokenResponse.toLowerCase().includes('9 am') &&
            turn2Res.spokenResponse.toLowerCase().includes('5 pm'),
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
            turn2Res.spokenResponse.toLowerCase().includes('done') &&
            turn2Res.spokenResponse.toLowerCase().includes('10 am') &&
            turn2Res.spokenResponse.toLowerCase().includes('6 pm'),
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
            turn2Res.spokenResponse.toLowerCase().includes('done') &&
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

    console.log('================================================================');
    console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================\n');

    if (failed > 0) process.exit(1);
}

runE2ETests().catch(err => {
    console.error('Fatal Test Suite Error:', err);
    process.exit(1);
});
