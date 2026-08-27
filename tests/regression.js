/**
 * GigSync — Regression Test Suite
 *
 * Covers:
 *   • Phase 0.5 — Availability matching (the primary bug this branch fixes)
 *   • Schedule conflict detection (NotAvailable, OutsideHours, JobConflict)
 *
 * Run:  node tests/regression.js
 */

'use strict';

const DB     = require('../backend/database');
const assert = require('assert');

console.log('=========================================');
console.log('  GIGSYNC REGRESSION TEST SUITE          ');
console.log('=========================================');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        const r = fn();
        if (r && typeof r.then === 'function') {
            return r.then(() => {
                console.log('[PASS] ' + name);
                passed++;
            }).catch(err => {
                console.error('[FAIL] ' + name + ': ' + err.message);
                failed++;
            });
        }
        console.log('[PASS] ' + name);
        passed++;
    } catch (err) {
        console.error('[FAIL] ' + name + ': ' + err.message);
        failed++;
    }
    return Promise.resolve();
}

async function runAll() {

/* =========================================================================
   PHASE 0.5 — Required availability matching tests (from the spec)
   ========================================================================= */

await test('Phase 0.5 — happy path: booking inside available window must succeed (null conflict)', () => {
    const reg = DB.registerWorkerProfile({
        name: 'Priya Electrician', phone: '9876501111',
        trade: 'Electrician', city: 'Ramanagara'
    });
    const worker = reg.worker || DB.getWorkerByPhone('9876501111');
    assert.ok(worker && worker.id, 'Worker must be registered');

    // Worker sets availability: 2026-09-01, 09:00 AM – 05:00 PM
    const slot = DB.setWorkerAvailabilitySlot({
        workerId: worker.id, workerPhone: worker.phone, trade: worker.trade,
        dateStr: '2026-09-01', startTime: '09:00 AM', endTime: '05:00 PM', isAvailable: true
    });
    assert.ok(slot.success, 'Availability slot must be saved');

    // Customer books 10:00 AM on 2026-09-01 — must be allowed
    const conflict = DB.checkScheduleConflict(worker.id, '2026-09-01', '10:00 AM');
    assert.strictEqual(conflict, null,
        'Expected null (no conflict) but got: ' + conflict +
        '. If NotAvailable: date strings are not matching. If OutsideHours: time parser failed.');
});

await test('Phase 0.5 — booking just outside available window must return OutsideHours', () => {
    const worker = DB.getWorkerByPhone('9876501111');
    assert.ok(worker && worker.id, 'Worker must exist from previous test');

    // 07:00 AM is before the 09:00 AM start
    const conflict = DB.checkScheduleConflict(worker.id, '2026-09-01', '07:00 AM');
    assert.strictEqual(conflict, 'OutsideHours',
        'Expected OutsideHours but got: ' + conflict);
});

await test('Phase 0.5 — no availability set for date must return NotAvailable', () => {
    const worker = DB.getWorkerByPhone('9876501111');
    assert.ok(worker && worker.id);

    // No slot was ever set for 2026-09-15
    const conflict = DB.checkScheduleConflict(worker.id, '2026-09-15', '10:00 AM');
    assert.strictEqual(conflict, 'NotAvailable',
        'Expected NotAvailable but got: ' + conflict);
});

await test('Phase 0.5 — Bug B guard: range string as time is handled (start portion used)', () => {
    // Old _bookWorkerDirect used to pass "09:00 AM – 05:00 PM" as requested_time.
    // After the fix, parseTimeToMinutes strips everything after the dash and uses 09:00 AM.
    // 09:00 AM (540 min) is the boundary of the slot — should NOT be OutsideHours.
    const worker = DB.getWorkerByPhone('9876501111');
    assert.ok(worker && worker.id);

    const conflict = DB.checkScheduleConflict(worker.id, '2026-09-01', '09:00 AM \u2013 05:00 PM');
    assert.strictEqual(conflict, null,
        'Range string must resolve to start time 09:00 AM which is inside the window. Got: ' + conflict);
});

/* =========================================================================
   SCHEDULE CONFLICT DETECTION
   ========================================================================= */

await test('NotAvailable when worker has no availability slots', () => {
    const reg = DB.registerWorkerProfile({
        name: 'Ramesh Plumber', phone: '9876502222',
        trade: 'Plumber', city: 'Ramanagara'
    });
    const worker = reg.worker || DB.getWorkerByPhone('9876502222');
    assert.ok(worker && worker.id);

    const conflict = DB.checkScheduleConflict(worker.id, '2026-09-01', '10:00 AM');
    assert.strictEqual(conflict, 'NotAvailable');
});

await test('OutsideHours when booking time is before slot start', () => {
    const reg = DB.registerWorkerProfile({
        name: 'Suresh Carpenter', phone: '9876503333',
        trade: 'Carpenter', city: 'Ramanagara'
    });
    const worker = reg.worker || DB.getWorkerByPhone('9876503333');
    DB.setWorkerAvailabilitySlot({
        workerId: worker.id, workerPhone: worker.phone, trade: worker.trade,
        dateStr: '2026-09-02', startTime: '09:00 AM', endTime: '05:00 PM', isAvailable: true
    });

    const conflict = DB.checkScheduleConflict(worker.id, '2026-09-02', '08:00 AM');
    assert.strictEqual(conflict, 'OutsideHours');
});

await test('OutsideHours when booking time is after slot end', () => {
    const worker = DB.getWorkerByPhone('9876503333');
    const conflict = DB.checkScheduleConflict(worker.id, '2026-09-02', '06:00 PM');
    assert.strictEqual(conflict, 'OutsideHours');
});

await test('JobConflict for exact same time as existing confirmed job', () => {
    const reg = DB.registerWorkerProfile({
        name: 'John Painter', phone: '9876504444',
        trade: 'Painter', city: 'Ramanagara'
    });
    const worker = reg.worker || DB.getWorkerByPhone('9876504444');

    DB.setWorkerAvailabilitySlot({
        workerId: worker.id, workerPhone: worker.phone, trade: worker.trade,
        dateStr: '2026-09-03', startTime: '09:00 AM', endTime: '05:00 PM', isAvailable: true
    });

    DB.createJob({
        customer_phone: '9998887776', customer_name: 'Test Customer',
        worker_id: worker.id, worker_phone: worker.phone, worker_name: worker.name,
        service: 'Painter', problem_description: 'Paint walls',
        location: 'Town Area', city: 'Ramanagara',
        requested_date: '2026-09-03', requested_time: '10:00 AM',
        budget: '500', status: 'Confirmed'
    });

    assert.strictEqual(DB.checkScheduleConflict(worker.id, '2026-09-03', '10:00 AM'), 'JobConflict',
        'Exact same time as existing confirmed job');
    assert.strictEqual(DB.checkScheduleConflict(worker.id, '2026-09-03', '10:30 AM'), 'JobConflict',
        '30 min overlap (within 1-hour window)');
    assert.strictEqual(DB.checkScheduleConflict(worker.id, '2026-09-03', '11:30 AM'), null,
        '90 min gap — outside the 1-hour window, must be free');
});

/* =========================================================================
   RESULTS
   ========================================================================= */

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
else { console.log('All regression tests passed!'); process.exit(0); }

} // end runAll

runAll().catch(err => { console.error('Fatal:', err); process.exit(1); });
