/* ==========================================================================
   GigSync — Central SQLite Database Layer with Firebase Firestore Sync
   Dual Persistence: Instant Local SQLite + Real-Time Firebase Cloud Sync
   ========================================================================== */

let DatabaseSync = null;
try {
    DatabaseSync = require('node:sqlite').DatabaseSync;
} catch (e) {
    DatabaseSync = null;
}

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const FirebaseSync = require('./firebase');

let db = null;
let useMemoryFallback = false;

if (DatabaseSync) {
    try {
        let dbFile = path.join(__dirname, '..', 'gigsync.db');
        const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION);
        
        if (isServerless) {
            const tmpPath = path.join('/tmp', 'gigsync.db');
            try {
                if (fs.existsSync(dbFile) && !fs.existsSync(tmpPath)) {
                    fs.copyFileSync(dbFile, tmpPath);
                }
                dbFile = tmpPath;
            } catch (_) {}
        }

        try {
            db = new DatabaseSync(dbFile);
            db.exec('PRAGMA foreign_keys = ON;');
            db.exec('CREATE TABLE IF NOT EXISTS _health_check (id INTEGER PRIMARY KEY);');
        } catch (writeErr) {
            // Read-only filesystem detected -> copy to /tmp and retry
            try {
                const tmpPath = path.join('/tmp', 'gigsync.db');
                const srcPath = path.join(__dirname, '..', 'gigsync.db');
                if (fs.existsSync(srcPath)) {
                    fs.copyFileSync(srcPath, tmpPath);
                }
                db = new DatabaseSync(tmpPath);
                db.exec('PRAGMA foreign_keys = ON;');
                db.exec('CREATE TABLE IF NOT EXISTS _health_check (id INTEGER PRIMARY KEY);');
            } catch (tmpErr) {
                // If /tmp also fails, use in-memory SQLite database
                try {
                    db = new DatabaseSync(':memory:');
                    db.exec('PRAGMA foreign_keys = ON;');
                } catch (_) {
                    db = null;
                    useMemoryFallback = true;
                }
            }
        }
    } catch (e) {
        db = null;
        useMemoryFallback = true;
    }
} else {
    useMemoryFallback = true;
}

// In-Memory Fallback Store (Used on Vercel Serverless if native SQLite is unavailable)
const memoryStore = {
    users: [
        {
            id: 1,
            name: 'Master Platform Administrator',
            phone: '9999999999',
            email: 'shiyazabdulazeez@gmail.com',
            role: 'admin',
            password_hash: crypto.scryptSync('admin@gigsync2026', 'gigsync_salt_tier2', 32).toString('hex'),
            city: 'Ramanagara',
            area: 'Headquarters'
        },
        {
            id: 2,
            name: 'Rumais',
            phone: '7760782551',
            email: 'rumais.electrician@gmail.com',
            role: 'worker',
            password_hash: crypto.scryptSync('worker123', 'gigsync_salt_tier2', 32).toString('hex'),
            city: 'Ramanagara',
            area: 'Town'
        },
        {
            id: 3,
            name: 'Saqib',
            phone: '8073280683',
            email: 'saqib.plumber@gmail.com',
            role: 'worker',
            password_hash: crypto.scryptSync('worker123', 'gigsync_salt_tier2', 32).toString('hex'),
            city: 'Ramanagara',
            area: 'Town'
        },
        {
            id: 4,
            name: 'Shaik Mohammed Anas',
            phone: '9743191097',
            email: 'anas.mechanic@gmail.com',
            role: 'worker',
            password_hash: crypto.scryptSync('worker123', 'gigsync_salt_tier2', 32).toString('hex'),
            city: 'Ramanagara',
            area: 'Town'
        }
    ],
    sessions: {},
    workers: [
        {
            id: 1,
            user_id: 2,
            name: 'Rumais',
            phone: '7760782551',
            trade: 'Electrician',
            service: 'electrical',
            skills: 'Wiring, MCB, Inverter, Appliances',
            tools: 'Multimeter, Drill, Insulated Tool Kit',
            rating: 4.8,
            km: 1.2,
            jobs_completed: 28,
            experience_years: 4,
            price: 300,
            is_available: 1,
            is_verified: 1,
            initials: 'RM',
            city: 'Ramanagara',
            area: 'Town',
            service_areas: 'Ramanagara, Nearby Areas',
            about: 'Specialist electrician serving Ramanagara.'
        },
        {
            id: 2,
            user_id: 3,
            name: 'Saqib',
            phone: '8073280683',
            trade: 'Plumber',
            service: 'plumbing',
            skills: 'Pipe Fitting, Leakages, Tap & Tank Repair',
            tools: 'Pipe Wrench, Thread Tape, Cutting Tools',
            rating: 4.7,
            km: 1.8,
            jobs_completed: 34,
            experience_years: 5,
            price: 300,
            is_available: 1,
            is_verified: 1,
            initials: 'SQ',
            city: 'Ramanagara',
            area: 'Town',
            service_areas: 'Ramanagara, Nearby Areas',
            about: 'Certified plumber for installations and repairs in Ramanagara.'
        },
        {
            id: 3,
            user_id: 4,
            name: 'Shaik Mohammed Anas',
            phone: '9743191097',
            trade: 'Mechanic',
            service: 'mechanics',
            skills: 'Vehicle Maintenance, Diagnostics, Breakdown Support',
            tools: 'Complete Mechanical Tool Kit, Diagnostic Gauge',
            rating: 4.9,
            km: 2.0,
            jobs_completed: 45,
            experience_years: 6,
            price: 350,
            is_available: 1,
            is_verified: 1,
            initials: 'SA',
            city: 'Ramanagara',
            area: 'Town',
            service_areas: 'Ramanagara, Nearby Areas',
            about: 'Experienced mechanic in Ramanagara.'
        }
    ],
    customers: [],
    jobs: [],
    availability: {
        '7760782551': [{ id: 1, worker_id: 1, worker_phone: '7760782551', trade: 'Electrician', date_str: 'Tomorrow', start_time: '09:00 AM', end_time: '04:00 PM', is_available: 1, notes: 'Standard shift' }],
        '8073280683': [{ id: 2, worker_id: 2, worker_phone: '8073280683', trade: 'Plumber', date_str: 'Today', start_time: '10:00 AM', end_time: '05:00 PM', is_available: 1, notes: 'Standard shift' }],
        '9743191097': [{ id: 3, worker_id: 3, worker_phone: '9743191097', trade: 'Mechanic', date_str: 'Tomorrow', start_time: '11:00 AM', end_time: '06:00 PM', is_available: 1, notes: 'Standard shift' }]
    },
    callLogs: []
};

// Helper for unique Job IDs (e.g. GS-1048)
function generateJobId() {
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `GS-${rand}`;
}

// Password hashing helper
function hashPassword(password) {
    return crypto.scryptSync(password, 'gigsync_salt_tier2', 32).toString('hex');
}

function verifyPassword(password, hash) {
    const hashedAttempt = crypto.scryptSync(password, 'gigsync_salt_tier2', 32).toString('hex');
    return hashedAttempt === hash;
}

// Initialize Database Tables & Seed the 3 Test Workers
function initDatabase() {
    if (!db) return;
    try {
        db.exec(`
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL UNIQUE,
            email TEXT,
            role TEXT NOT NULL CHECK(role IN ('customer', 'worker', 'admin')),
            password_hash TEXT NOT NULL,
            city TEXT NOT NULL DEFAULT 'Ramanagara',
            area TEXT NOT NULL DEFAULT 'Town',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            phone TEXT NOT NULL,
            role TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS workers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE,
            name TEXT NOT NULL,
            phone TEXT NOT NULL UNIQUE,
            trade TEXT NOT NULL,
            service TEXT NOT NULL,
            skills TEXT DEFAULT '',
            tools TEXT DEFAULT 'Standard tool kit',
            rating REAL DEFAULT 5.0,
            km REAL DEFAULT 1.5,
            jobs_completed INTEGER DEFAULT 0,
            experience_years INTEGER DEFAULT 2,
            price INTEGER DEFAULT 300,
            is_available INTEGER DEFAULT 1,
            is_verified INTEGER DEFAULT 1,
            initials TEXT NOT NULL,
            city TEXT NOT NULL DEFAULT 'Ramanagara',
            area TEXT NOT NULL DEFAULT 'Town',
            service_areas TEXT NOT NULL DEFAULT 'Ramanagara, Nearby Areas',
            about TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE,
            name TEXT NOT NULL,
            phone TEXT NOT NULL UNIQUE,
            email TEXT,
            city TEXT NOT NULL DEFAULT 'Ramanagara',
            area TEXT NOT NULL DEFAULT 'Town',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            customer_id INTEGER,
            customer_phone TEXT NOT NULL,
            customer_name TEXT NOT NULL,
            worker_id INTEGER,
            worker_phone TEXT,
            worker_name TEXT,
            service TEXT NOT NULL,
            problem_description TEXT NOT NULL,
            location TEXT NOT NULL,
            city TEXT NOT NULL DEFAULT 'Ramanagara',
            requested_date TEXT NOT NULL DEFAULT 'Today',
            requested_time TEXT NOT NULL DEFAULT 'Immediate',
            budget TEXT NOT NULL,
            final_price INTEGER,
            status TEXT DEFAULT 'Requested',
            payment_status TEXT DEFAULT 'Pending',
            payment_method TEXT DEFAULT 'Cash',
            rating INTEGER,
            review TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME,
            FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE SET NULL,
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS worker_availability (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            worker_id INTEGER,
            worker_phone TEXT NOT NULL,
            trade TEXT NOT NULL,
            date_str TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            is_available INTEGER DEFAULT 1,
            notes TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS call_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            caller_phone TEXT NOT NULL,
            caller_role TEXT NOT NULL DEFAULT 'customer',
            transcript TEXT NOT NULL,
            intent_detected TEXT,
            actions_taken TEXT,
            duration_seconds INTEGER DEFAULT 0,
            status TEXT DEFAULT 'Completed',
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS voice_sessions (
            session_id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );
    `);

    // Ensure Master Admin account exists
    const adminPhone = '9999999999';
    const adminUser = db.prepare('SELECT * FROM users WHERE phone = ?').get(adminPhone);
    if (!adminUser) {
        const pHash = hashPassword('admin@gigsync2026');
        db.prepare(`
            INSERT INTO users (name, phone, email, role, password_hash, city, area)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run('Master Platform Administrator', adminPhone, 'shiyazabdulazeez@gmail.com', 'admin', pHash, 'Ramanagara', 'Headquarters');
    }

    // --------------------------------------------------------------------------
    // SEED / TEST RECORDS — kept strictly separate from production data.
    //
    // These 3 rows exist so the app has something to demo with. They are NOT
    // production records and nothing in the app logic may depend on them.
    // Production data (workers who registered by voice, chat or signup) is never
    // touched here. The old code deleted every worker whose phone was not one of
    // the 3 seeds on EVERY process start, which silently destroyed every worker
    // created through the voice pipeline. That purge now only runs when it is
    // explicitly asked for: GIGSYNC_SEED_RESET=1
    // --------------------------------------------------------------------------
    const seedReset = process.env.GIGSYNC_SEED_RESET === '1';

    if (seedReset) {
        console.warn('⚠️  [Database] GIGSYNC_SEED_RESET=1 — deleting ALL worker records except the 3 seed test phones.');
        db.prepare(`DELETE FROM workers WHERE phone NOT IN ('7760782551', '8073280683', '9743191097')`).run();
        db.prepare(`DELETE FROM users WHERE role = 'worker' AND phone NOT IN ('7760782551', '8073280683', '9743191097')`).run();
        db.prepare(`DELETE FROM worker_availability WHERE worker_phone NOT IN ('7760782551', '8073280683', '9743191097')`).run();
        db.prepare(`DELETE FROM jobs WHERE worker_phone IS NOT NULL AND worker_phone NOT IN ('7760782551', '8073280683', '9743191097')`).run();
    }

    // Seed the 3 test workers
    const seedWorkers = [
        {
            name: 'Rumais',
            phone: '7760782551',
            email: 'rumais.electrician@gmail.com',
            trade: 'Electrician',
            service: 'electrical',
            skills: 'Wiring, MCB, Inverter, Appliances',
            tools: 'Multimeter, Drill, Insulated Tool Kit',
            rating: 4.8,
            price: 300,
            initials: 'RM',
            city: 'Ramanagara',
            area: 'Town',
            about: 'Specialist electrician serving Ramanagara.',
            slotDate: 'Tomorrow',
            slotStart: '09:00 AM',
            slotEnd: '04:00 PM'
        },
        {
            name: 'Saqib',
            phone: '8073280683',
            email: 'saqib.plumber@gmail.com',
            trade: 'Plumber',
            service: 'plumbing',
            skills: 'Pipe Fitting, Leakages, Tap & Tank Repair',
            tools: 'Pipe Wrench, Thread Tape, Cutting Tools',
            rating: 4.7,
            price: 300,
            initials: 'SQ',
            city: 'Ramanagara',
            area: 'Town',
            about: 'Certified plumber for installations and repairs in Ramanagara.',
            slotDate: 'Today',
            slotStart: '10:00 AM',
            slotEnd: '05:00 PM'
        },
        {
            name: 'Shaik Mohammed Anas',
            phone: '9743191097',
            email: 'anas.mechanic@gmail.com',
            trade: 'Mechanic',
            service: 'mechanics',
            skills: 'Vehicle Maintenance, Diagnostics, Breakdown Support',
            tools: 'Complete Mechanical Tool Kit, Diagnostic Gauge',
            rating: 4.9,
            price: 350,
            initials: 'SA',
            city: 'Ramanagara',
            area: 'Town',
            about: 'Experienced mechanic in Ramanagara.',
            slotDate: 'Tomorrow',
            slotStart: '11:00 AM',
            slotEnd: '06:00 PM'
        }
    ];

    for (const w of seedWorkers) {
        // Upsert User
        let u = db.prepare('SELECT * FROM users WHERE phone = ?').get(w.phone);
        if (!u) {
            const pHash = hashPassword('worker123');
            const res = db.prepare(`
                INSERT INTO users (name, phone, email, role, password_hash, city, area)
                VALUES (?, ?, ?, 'worker', ?, ?, ?)
            `).run(w.name, w.phone, w.email, pHash, w.city, w.area);
            u = { id: Number(res.lastInsertRowid) };
        } else if (seedReset) {
            db.prepare(`UPDATE users SET name = ?, email = ? WHERE id = ?`).run(w.name, w.email, u.id);
        }

        // Upsert Worker (Strictly 1 Record Per Person)
        let workerRow = db.prepare('SELECT * FROM workers WHERE phone = ?').get(w.phone);
        if (!workerRow) {
            const wRes = db.prepare(`
                INSERT INTO workers (
                    user_id, name, phone, trade, service, skills, tools, rating, km, jobs_completed,
                    experience_years, price, is_available, is_verified, initials, city, area, service_areas, about
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1.5, 25, 4, ?, 1, 1, ?, ?, ?, 'Ramanagara, Nearby Areas', ?)
            `).run(u.id, w.name, w.phone, w.trade, w.service, w.skills, w.tools, w.rating, w.price, w.initials, w.city, w.area, w.about);
            workerRow = { id: Number(wRes.lastInsertRowid) };
        } else if (seedReset) {
            // Only overwrite a live record when a seed reset was explicitly requested —
            // otherwise a worker who changed their trade by voice would be reverted on restart.
            db.prepare(`
                UPDATE workers SET name = ?, trade = ?, service = ?, rating = ?, price = ?, is_available = 1, is_verified = 1
                WHERE id = ?
            `).run(w.name, w.trade, w.service, w.rating, w.price, workerRow.id);
        }

        // Give a seed worker one starter availability slot ONLY if they have none at all.
        // Never delete slots the worker set themselves through the voice or chat agent.
        const existingSlots = db.prepare(
            `SELECT COUNT(*) AS c FROM worker_availability WHERE worker_phone = ?`
        ).get(w.phone);
        if (seedReset) {
            db.prepare(`DELETE FROM worker_availability WHERE worker_phone = ?`).run(w.phone);
        }
        if (seedReset || !existingSlots || existingSlots.c === 0) {
            db.prepare(`
                INSERT INTO worker_availability (worker_id, worker_phone, trade, date_str, start_time, end_time, is_available, notes)
                VALUES (?, ?, ?, ?, ?, ?, 1, 'Seed test record — standard shift')
            `).run(workerRow.id, w.phone, w.trade, w.slotDate, w.slotStart, w.slotEnd);
        }
    }

    const liveWorkerCount = db.prepare(
        `SELECT COUNT(*) AS c FROM workers WHERE phone NOT IN ('7760782551', '8073280683', '9743191097')`
    ).get();
    console.log(`✅ [Database] Seed test workers present (Rumais, Saqib, Shaik Mohammed Anas). Real (non-seed) worker records preserved: ${liveWorkerCount ? liveWorkerCount.c : 0}`);
    } catch (e) {
        console.warn('[Database Init Exception]:', e.message);
    }
}

initDatabase();

/* ==========================================================================
   FIREBASE MIRROR HELPER
   Returns a promise resolving to the REAL Firestore outcome so callers can
   verify the cloud write instead of assuming it worked. Firestore failures
   never break the local write — SQLite stays authoritative — but they are
   reported truthfully rather than swallowed.
   ========================================================================== */
function mirrorToFirebase({ worker = null, slot = null, job = null, customer = null }) {
    const jobs = [];
    if (worker) jobs.push(['worker', FirebaseSync.syncWorker(worker)]);
    if (slot) jobs.push(['worker_availability', FirebaseSync.syncAvailability(slot)]);
    if (job) jobs.push(['job', FirebaseSync.syncJob(job)]);
    if (customer) jobs.push(['customer', FirebaseSync.syncCustomer(customer)]);

    if (jobs.length === 0) {
        return Promise.resolve({ ok: null, message: 'Nothing to mirror to Firebase.', collections: [] });
    }

    return Promise.all(jobs.map(([label, p]) =>
        Promise.resolve(p)
            .then(res => ({ label, ok: Boolean(res && res.status === 'success'), detail: res || null }))
            .catch(err => ({ label, ok: false, detail: { status: 'error', message: err.message } }))
    )).then(results => {
        const failed = results.filter(r => !r.ok);
        return {
            ok: failed.length === 0,
            collections: results.map(r => r.label),
            results,
            message: failed.length === 0
                ? `Mirrored to Firestore: ${results.map(r => r.label).join(', ')}.`
                : `Firestore write failed for ${failed.map(f => f.label).join(', ')}: ${failed.map(f => (f.detail && f.detail.message ? String(f.detail.message).slice(0, 240) : 'unknown error')).join(' | ')}`
        };
    });
}

/* ==========================================================================
   CHANGE NOTIFICATIONS

   Every write below funnels through this so open browser pages can be told what
   changed the moment it changes, instead of showing whatever the customer's
   screen happened to load minutes ago.

   Why it is here and not in the API layer: a worker's availability can be changed
   by a REST call, by the AI voice agent, or by the 3.5mm terminal. Notifying from
   each of those separately guarantees one of them eventually gets forgotten. This
   is the one place they all pass through.

   Listeners must never break a write, so each is wrapped.
   ========================================================================== */

const changeListeners = new Set();

function emitChange(entity, detail = {}) {
    if (changeListeners.size === 0) return;
    const event = { entity, ...detail, at: new Date().toISOString() };
    for (const listener of changeListeners) {
        try {
            listener(event);
        } catch (err) {
            console.warn('[DB Change Listener Error]:', err.message);
        }
    }
}

/* ==========================================================================
   DATABASE OPERATIONS & REPOSITORY METHODS
   ========================================================================== */

const DB = {
    // Subscribe to writes. Returns an unsubscribe function.
    onChange(listener) {
        changeListeners.add(listener);
        return () => changeListeners.delete(listener);
    },

    // ---------------- AUTH & USER OPERATIONS ----------------
    createUser({ name, phone, email, role, password, city = 'Ramanagara', area = 'Town' }) {
        const cleanPhone = (phone || '').replace(/\D/g, '');
        const pHash = hashPassword(password);

        if (!db) {
            const userId = memoryStore.users.length + 1;
            const user = { id: userId, name, phone: cleanPhone, email: email || null, role, password_hash: pHash, city, area, created_at: new Date().toISOString() };
            memoryStore.users.push(user);
            if (role === 'worker') {
                const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'WK';
                const worker = { id: memoryStore.workers.length + 1, user_id: userId, name, phone: cleanPhone, trade: 'General Specialist', service: 'general', initials, city, area, service_areas: `${city}, Nearby Areas`, rating: 5.0, km: 1.5, jobs_completed: 0, price: 300, is_available: 1, is_verified: 1, skills: '', tools: 'Standard tool kit', experience_years: 2, about: '' };
                memoryStore.workers.push(worker);
                FirebaseSync.syncWorker(worker).catch(e => console.warn('[Firebase Sync Error]:', e));
            } else {
                const cust = { id: memoryStore.customers.length + 1, user_id: userId, name, phone: cleanPhone, email: email || null, city, area, created_at: new Date().toISOString() };
                memoryStore.customers.push(cust);
                FirebaseSync.syncCustomer(cust).catch(e => console.warn('[Firebase Sync Error]:', e));
            }
            return user;
        }

        const stmt = db.prepare(`
            INSERT INTO users (name, phone, email, role, password_hash, city, area)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(name, cleanPhone, email || null, role, pHash, city, area);
        const userId = Number(result.lastInsertRowid);

        if (role === 'worker') {
            const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'WK';
            const workerStmt = db.prepare(`
                INSERT INTO workers (user_id, name, phone, trade, service, initials, city, area, service_areas)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const wRes = workerStmt.run(userId, name, cleanPhone, 'General Specialist', 'general', initials, city, area, `${city}, Nearby Areas`);
            const createdWorker = this.getWorkerById(Number(wRes.lastInsertRowid));
            FirebaseSync.syncWorker(createdWorker).catch(e => console.warn('[Firebase Sync Error]:', e));
        } else {
            const custStmt = db.prepare(`
                INSERT INTO customers (user_id, name, phone, email, city, area)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            const cRes = custStmt.run(userId, name, cleanPhone, email || null, city, area);
            const createdCust = this.getCustomerById(Number(cRes.lastInsertRowid));
            FirebaseSync.syncCustomer(createdCust).catch(e => console.warn('[Firebase Sync Error]:', e));
        }

        return this.getUserById(userId);
    },

    getUserByPhone(phone) {
        const cleanPhone = (phone || '').replace(/\D/g, '');
        if (!db) {
            return memoryStore.users.find(u => u.phone === cleanPhone) || null;
        }
        const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(cleanPhone);
        return user || null;
    },

    getUserById(id) {
        if (!db) {
            return memoryStore.users.find(u => u.id === Number(id)) || null;
        }
        const user = db.prepare('SELECT id, name, phone, email, role, city, area, created_at FROM users WHERE id = ?').get(id);
        return user || null;
    },

    getCustomerById(id) {
        if (!db) {
            return memoryStore.customers.find(c => c.id === Number(id)) || null;
        }
        return db.prepare('SELECT * FROM customers WHERE id = ?').get(id) || null;
    },

    updateCustomerProfile(phoneOrId, updates = {}) {
        let customer = null;
        if (typeof phoneOrId === 'number') {
            customer = this.getCustomerById(phoneOrId);
        } else {
            const clean = String(phoneOrId).replace(/\D/g, '');
            if (!db) {
                customer = memoryStore.customers.find(c => c.phone === clean);
            } else {
                customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(clean);
            }
        }
        if (!customer) return null;

        if (!db) {
            Object.assign(customer, updates);
            const user = memoryStore.users.find(u => u.phone === customer.phone || u.id === customer.user_id);
            if (user) Object.assign(user, updates);
            FirebaseSync.syncCustomer(customer).catch(e => console.warn('[Firebase Sync Error]:', e));
            return customer;
        }

        const fields = [];
        const params = [];
        if (updates.city) { fields.push('city = ?'); params.push(updates.city); }
        if (updates.area) { fields.push('area = ?'); params.push(updates.area); }
        if (updates.name) { fields.push('name = ?'); params.push(updates.name); }
        if (updates.email) { fields.push('email = ?'); params.push(updates.email); }

        if (fields.length > 0) {
            params.push(customer.id);
            db.prepare(`UPDATE customers SET ${fields.join(', ')} WHERE id = ?`).run(...params);
            // Sync name, city, and area back to users table
            const uFields = [];
            const uParams = [];
            if (updates.name) { uFields.push('name = ?'); uParams.push(updates.name); }
            if (updates.city) { uFields.push('city = ?'); uParams.push(updates.city); }
            if (updates.area) { uFields.push('area = ?'); uParams.push(updates.area); }
            if (uFields.length > 0) {
                uParams.push(customer.phone);
                db.prepare(`UPDATE users SET ${uFields.join(', ')} WHERE phone = ?`).run(...uParams);
            }
        }
        const updated = this.getCustomerById(customer.id);
        FirebaseSync.syncCustomer(updated).catch(e => console.warn('[Firebase Sync Error]:', e));
        return updated;
    },

    authenticateUser(phone, password) {
        const cleanPhone = (phone || '').replace(/\D/g, '');
        if (!db) {
            const user = memoryStore.users.find(u => u.phone === cleanPhone);
            if (!user) return null;
            if (!verifyPassword(password, user.password_hash)) return null;
            const token = crypto.randomBytes(24).toString('hex');
            memoryStore.sessions[token] = user;
            const extraProfile = user.role === 'worker' ? memoryStore.workers.find(w => w.user_id === user.id || w.phone === cleanPhone) : memoryStore.customers.find(c => c.user_id === user.id || c.phone === cleanPhone);
            return {
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    phone: user.phone,
                    email: user.email,
                    role: user.role,
                    city: user.city,
                    area: user.area,
                    profile: extraProfile
                }
            };
        }

        const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(cleanPhone);
        if (!user) return null;
        if (!verifyPassword(password, user.password_hash)) return null;

        // Generate session token
        const token = crypto.randomBytes(24).toString('hex');
        db.prepare('INSERT INTO sessions (token, user_id, phone, role) VALUES (?, ?, ?, ?)').run(token, user.id, user.phone, user.role);

        let extraProfile = null;
        if (user.role === 'worker') {
            extraProfile = db.prepare('SELECT * FROM workers WHERE user_id = ?').get(user.id);
        } else {
            extraProfile = db.prepare('SELECT * FROM customers WHERE user_id = ?').get(user.id);
        }

        return {
            token,
            user: {
                id: user.id,
                name: user.name,
                phone: user.phone,
                email: user.email,
                role: user.role,
                city: user.city,
                area: user.area,
                profile: extraProfile
            }
        };
    },

    getSession(token) {
        if (!token) return null;
        if (!db) {
            const user = memoryStore.sessions[token];
            if (!user) return null;
            return { token, user_id: user.id, phone: user.phone, role: user.role, name: user.name, email: user.email, city: user.city, area: user.area };
        }
        const session = db.prepare(`
            SELECT s.token, s.user_id, s.phone, s.role, u.name, u.email, u.city, u.area
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token = ?
        `).get(token);
        return session || null;
    },

    deleteSession(token) {
        if (!token) return;
        if (!db) {
            delete memoryStore.sessions[token];
            return;
        }
        db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    },

    // ---------------- WORKER OPERATIONS ----------------
    getAllWorkers(filters = {}) {
        if (!db) {
            let workers = [...memoryStore.workers];
            if (filters.service && filters.service !== 'all') {
                const sLower = filters.service.toLowerCase();
                workers = workers.filter(w => (w.trade && w.trade.toLowerCase().includes(sLower)) || (w.service && w.service.toLowerCase().includes(sLower)));
            }
            if (filters.city && filters.city !== 'all') {
                workers = workers.filter(w => w.city && w.city.toLowerCase() === filters.city.toLowerCase());
            }
            if (filters.isAvailable !== undefined) {
                workers = workers.filter(w => Boolean(w.is_available) === Boolean(filters.isAvailable));
            }
            return workers.map(w => {
                const slots = (memoryStore.availability[w.phone] || memoryStore.availability[String(w.id)] || []);
                const latestSlot = slots.length > 0 ? slots[0] : null;
                return {
                    ...w,
                    latest_availability: latestSlot || null,
                    availability_hours: latestSlot ? `${latestSlot.start_time} – ${latestSlot.end_time} (${latestSlot.date_str})` : 'Available'
                };
            });
        }

        let query = 'SELECT * FROM workers WHERE 1=1';
        const params = [];

        if (filters.service && filters.service !== 'all') {
            // Normalize trade search keyword to root stem to match variations (e.g. Electrical -> Electric, Plumbing -> Plumb)
            let sTerm = filters.service.trim();
            const stems = {
                'Electrical': 'Electric',
                'Plumbing': 'Plumb',
                'Carpentry': 'Carpent',
                'Mechanics': 'Mechanic',
                'Home Cleaning': 'Clean',
                'Painting': 'Paint',
                'Masonry & Construction': 'Mason',
                'Tailoring & Alterations': 'Tailor',
                'Welding & Metalwork': 'Weld',
                'Driver Services': 'Driver',
                'TV & Electronics Repair': 'TV',
                'Water Purifier & RO Service': 'Water',
                'Washing Machine Repair': 'Washing',
                'Refrigerator Repair': 'Fridge',
                'AC & Appliances': 'AC'
            };
            const stem = stems[sTerm] || sTerm;

            query += ' AND (service LIKE ? OR trade LIKE ? OR service LIKE ? OR trade LIKE ?)';
            params.push(`%${sTerm}%`, `%${sTerm}%`, `%${stem}%`, `%${stem}%`);
        }
        if (filters.city && filters.city !== 'all') {
            query += ' AND city = ?';
            params.push(filters.city);
        }
        if (filters.isAvailable !== undefined) {
            query += ' AND is_available = ?';
            params.push(filters.isAvailable ? 1 : 0);
        }
        if (filters.minRating) {
            query += ' AND rating >= ?';
            params.push(Number(filters.minRating));
        }

        query += ' ORDER BY is_available DESC, rating DESC, jobs_completed DESC';
        const workers = db.prepare(query).all(...params);

        // Attach latest availability slot to each worker
        return workers.map(w => {
            const latestSlot = db.prepare(`
                SELECT date_str, start_time, end_time, is_available, updated_at
                FROM worker_availability
                WHERE worker_id = ? OR worker_phone = ?
                ORDER BY updated_at DESC, id DESC LIMIT 1
            `).get(w.id, w.phone);
            return {
                ...w,
                latest_availability: latestSlot || null,
                availability_hours: latestSlot ? `${latestSlot.start_time} – ${latestSlot.end_time} (${latestSlot.date_str})` : 'Available'
            };
        });
    },

    deleteTestWorkerByPhone(phone) {
        if (!phone) return;
        const clean = String(phone).replace(/\D/g, '');
        if (!db) {
            memoryStore.workers = memoryStore.workers.filter(w => w.phone !== clean);
            delete memoryStore.availability[clean];
            memoryStore.users = memoryStore.users.filter(u => u.phone !== clean);
            return;
        }
        const worker = this.getWorkerByPhone(clean);
        if (worker) {
            db.prepare('DELETE FROM worker_availability WHERE worker_id = ? OR worker_phone = ?').run(worker.id, clean);
            db.prepare('DELETE FROM workers WHERE id = ?').run(worker.id);
            if (worker.user_id) {
                db.prepare('DELETE FROM users WHERE id = ?').run(worker.user_id);
            }
        } else {
            db.prepare('DELETE FROM worker_availability WHERE worker_phone = ?').run(clean);
            db.prepare('DELETE FROM users WHERE phone = ?').run(clean);
        }
    },

    getWorkerById(id) {
        if (!db) return memoryStore.workers.find(w => w.id === Number(id)) || null;
        return db.prepare('SELECT * FROM workers WHERE id = ?').get(id) || null;
    },

    getWorkerByPhone(phone) {
        if (!phone) return null;
        const clean = String(phone).replace(/\D/g, '');
        const last10 = clean.slice(-10);
        if (!db) {
            return memoryStore.workers.find(w => w.phone === clean || w.phone === phone || (w.phone && w.phone.endsWith(last10))) || null;
        }
        return db.prepare('SELECT * FROM workers WHERE phone = ? OR phone = ? OR phone LIKE ?').get(phone, clean, `%${last10}`) || null;
    },

    getWorkerByUserId(userId) {
        if (!db) return memoryStore.workers.find(w => w.user_id === Number(userId)) || null;
        return db.prepare('SELECT * FROM workers WHERE user_id = ?').get(userId) || null;
    },

    createWorker(data) {
        const initials = (data.name || 'WK').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
        const cleanPhone = (data.phone || '').replace(/\D/g, '');

        if (!db) {
            const existing = this.getWorkerByPhone(cleanPhone);
            if (existing) {
                return this.updateWorkerProfile(existing.id, data);
            }
            const created = {
                id: memoryStore.workers.length + 1,
                user_id: data.user_id || null,
                name: data.name || 'Worker',
                phone: cleanPhone,
                trade: data.trade || 'Skilled Specialist',
                service: (data.service || data.trade || 'general').toLowerCase(),
                skills: data.skills || '',
                tools: data.tools || 'Standard tool kit',
                rating: data.rating || 5.0,
                km: data.km || 1.5,
                jobs_completed: data.jobs_completed || 0,
                experience_years: data.experience_years || 2,
                price: data.price || 300,
                is_available: data.is_available !== undefined ? (data.is_available ? 1 : 0) : 1,
                is_verified: data.is_verified !== undefined ? (data.is_verified ? 1 : 0) : 1,
                initials,
                city: data.city || 'Ramanagara',
                area: data.area || 'Town',
                service_areas: data.service_areas || `${data.city || 'Ramanagara'}, Nearby Areas`,
                about: data.about || `${data.trade} specialist serving Karnataka`
            };
            memoryStore.workers.push(created);
            FirebaseSync.syncWorker(created).catch(e => console.warn('[Firebase Sync Error]:', e));
            return created;
        }

        try {
            const stmt = db.prepare(`
                INSERT INTO workers (user_id, name, phone, trade, service, skills, tools, rating, km, jobs_completed, experience_years, price, is_available, is_verified, initials, city, area, service_areas, about)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const res = stmt.run(
                data.user_id || null,
                data.name,
                cleanPhone,
                data.trade,
                data.service || data.trade.toLowerCase(),
                data.skills || '',
                data.tools || 'Standard tool kit',
                data.rating || 5.0,
                data.km || 1.5,
                data.jobs_completed || 0,
                data.experience_years || 2,
                data.price || 300,
                data.is_available !== undefined ? (data.is_available ? 1 : 0) : 1,
                data.is_verified !== undefined ? (data.is_verified ? 1 : 0) : 1,
                initials,
                data.city || 'Ramanagara',
                data.area || 'Town',
                data.service_areas || JSON.stringify(['Town Area', 'Market Circle', 'Bus Stand Area']),
                data.about || `${data.trade} specialist serving Karnataka`
            );

            const created = this.getWorkerById(res.lastInsertRowid);
            FirebaseSync.syncWorker(created);
            return created;
        } catch (err) {
            const existing = this.getWorkerByPhone(cleanPhone);
            if (existing) {
                return this.updateWorkerProfile(existing.id, {
                    name: data.name || existing.name,
                    trade: data.trade || existing.trade,
                    city: data.city || existing.city,
                    area: data.area || existing.area,
                    tools: data.tools || existing.tools,
                    price: data.price || existing.price
                });
            }
            throw err;
        }
    },

    registerWorkerProfile({ name, phone, trade, city = 'Ramanagara', area = 'Town', tools = 'Standard tool kit', price = 300, experienceYears = 2, skills = '' }) {
        const cleanPhone = (phone || '').replace(/\D/g, '');
        if (!cleanPhone) return null;

        let existingWorker = this.getWorkerByPhone(cleanPhone);
        if (existingWorker) {
            const updated = this.updateWorkerProfile(existingWorker.id, {
                name: name || existingWorker.name,
                trade: trade || existingWorker.trade,
                city: city || existingWorker.city,
                area: area || existingWorker.area,
                tools: tools || existingWorker.tools,
                price: price || existingWorker.price
            });
            // Re-read from storage: 'persisted' must describe what is actually stored,
            // not what we hoped the UPDATE did.
            const readBack = this.getWorkerByPhone(cleanPhone);
            return {
                success: Boolean(readBack),
                persisted: Boolean(readBack)
                    && (!name || readBack.name === name)
                    && (!trade || readBack.trade === trade),
                workerId: readBack ? readBack.id : (updated ? updated.id : null),
                worker: readBack || updated,
                action: 'UPDATED',
                firebaseSync: mirrorToFirebase({ worker: readBack || updated })
            };
        }

        let existingUser = this.getUserByPhone ? this.getUserByPhone(cleanPhone) : null;
        let userId = existingUser ? existingUser.id : null;

        if (!userId && this.createUser) {
            try {
                const u = this.createUser({
                    name: name || 'Worker',
                    phone: cleanPhone,
                    role: 'worker',
                    password: 'worker@gigsync',
                    city,
                    area
                });
                userId = u ? u.id : null;
            } catch (_) {}
        }

        const created = this.createWorker({
            user_id: userId,
            name: name || 'Worker',
            phone: cleanPhone,
            trade: trade || 'Skilled Specialist',
            service: (trade || 'general').toLowerCase(),
            skills: skills || trade || '',
            tools: tools || 'Standard tool kit',
            rating: 5.0,
            km: 1.5,
            jobs_completed: 0,
            experience_years: experienceYears || 2,
            price: price || 300,
            is_available: 1,
            is_verified: 1,
            city,
            area,
            about: `${experienceYears || 2}+ years experience as ${trade || 'specialist'}.`
        });

        // Verify the row exists in storage before reporting success.
        const readBack = this.getWorkerByPhone(cleanPhone);
        return {
            success: Boolean(readBack),
            persisted: Boolean(readBack),
            workerId: readBack ? readBack.id : (created ? created.id : null),
            worker: readBack || created,
            action: 'CREATED',
            firebaseSync: mirrorToFirebase({ worker: readBack || created })
        };
    },

    registerOrUpdateWorker({ name, phone, job_role, availability_date, start_time, end_time, city = 'Ramanagara' }) {
        const cleanPhone = (phone || '').replace(/\D/g, '');
        if (!cleanPhone || cleanPhone.length !== 10) {
            return { success: false, persisted: false, error: 'A valid 10-digit phone number is required.' };
        }

        const trade = job_role || 'Skilled Specialist';
        let worker = this.getWorkerByPhone(cleanPhone);
        if (worker) {
            this.updateWorkerProfile(worker.id, {
                name: name || worker.name,
                trade: trade,
                city: city || worker.city || 'Ramanagara',
                is_available: 1
            });
        } else {
            this.registerWorkerProfile({
                name: name || 'Worker',
                phone: cleanPhone,
                trade: trade,
                city: city || 'Ramanagara'
            });
        }

        const updatedWorker = this.getWorkerByPhone(cleanPhone);
        let availabilityResult = null;
        if (updatedWorker && availability_date && start_time && end_time) {
            availabilityResult = this.setWorkerAvailabilitySlot({
                workerId: updatedWorker.id,
                workerPhone: cleanPhone,
                trade: updatedWorker.trade,
                dateStr: availability_date,
                startTime: start_time,
                endTime: end_time,
                isAvailable: true
            });
        }

        const persisted = Boolean(updatedWorker && updatedWorker.id);
        return {
            success: persisted,
            persisted,
            worker: updatedWorker,
            availability: availabilityResult
        };
    },

    updateWorkerProfile(id, updates = {}) {
        if (!db) {
            const worker = memoryStore.workers.find(w => w.id === Number(id));
            if (!worker) return null;
            Object.assign(worker, updates);
            if (updates.trade) worker.service = updates.trade.toLowerCase();
            if (updates.name) {
                const user = memoryStore.users.find(u => u.phone === worker.phone || u.id === worker.user_id);
                if (user) user.name = updates.name;
            }
            FirebaseSync.syncWorker(worker).catch(e => console.warn('[Firebase Sync Error]:', e));
            emitChange('worker', { workerId: worker.id, workerPhone: worker.phone, workerName: worker.name, city: worker.city });
            return worker;
        }

        const fields = [];
        const params = [];

        if (updates.name) { fields.push('name = ?'); params.push(updates.name); }
        if (updates.trade) { fields.push('trade = ?', 'service = ?'); params.push(updates.trade, updates.trade.toLowerCase()); }
        if (updates.skills !== undefined) { fields.push('skills = ?'); params.push(updates.skills); }
        if (updates.tools !== undefined) { fields.push('tools = ?'); params.push(updates.tools); }
        if (updates.price !== undefined) { fields.push('price = ?'); params.push(Number(updates.price)); }
        if (updates.city !== undefined) { fields.push('city = ?'); params.push(updates.city); }
        if (updates.area !== undefined) { fields.push('area = ?'); params.push(updates.area); }
        if (updates.service_areas !== undefined) { fields.push('service_areas = ?'); params.push(updates.service_areas); }
        if (updates.about !== undefined) { fields.push('about = ?'); params.push(updates.about); }
        if (updates.is_available !== undefined) { fields.push('is_available = ?'); params.push(updates.is_available ? 1 : 0); }

        if (fields.length === 0) return this.getWorkerById(id);

        params.push(id);
        db.prepare(`UPDATE workers SET ${fields.join(', ')} WHERE id = ?`).run(...params);
        const updated = this.getWorkerById(id);
        
        // Sync name changes to users table
        if (updates.name && updated) {
            db.prepare('UPDATE users SET name = ? WHERE phone = ? OR id = ?').run(updates.name, updated.phone, updated.user_id || -1);
        }

        FirebaseSync.syncWorker(updated).catch(e => console.warn('[Firebase Sync Error]:', e));
        if (updated) emitChange('worker', { workerId: updated.id, workerPhone: updated.phone, workerName: updated.name, city: updated.city });
        return updated;
    },

    updateWorkerAvailabilityStatus(workerIdOrPhone, isAvailable) {
        let worker = null;
        if (typeof workerIdOrPhone === 'string' && workerIdOrPhone.length >= 10) {
            worker = this.getWorkerByPhone(workerIdOrPhone);
        } else if (typeof workerIdOrPhone === 'number') {
            worker = this.getWorkerById(workerIdOrPhone);
        } else if (!isNaN(Number(workerIdOrPhone)) && String(workerIdOrPhone).length < 10) {
            worker = this.getWorkerById(Number(workerIdOrPhone));
        } else {
            worker = this.getWorkerByPhone(workerIdOrPhone);
        }

        if (!worker) return null;
        if (!db) {
            worker.is_available = isAvailable ? 1 : 0;
            FirebaseSync.syncWorker(worker).catch(e => console.warn('[Firebase Sync Error]:', e));
            emitChange('worker', { workerId: worker.id, workerPhone: worker.phone, workerName: worker.name, isAvailable: Boolean(isAvailable) });
            return worker;
        }
        db.prepare('UPDATE workers SET is_available = ? WHERE id = ?').run(isAvailable ? 1 : 0, worker.id);
        const updated = this.getWorkerById(worker.id);
        FirebaseSync.syncWorker(updated).catch(e => console.warn('[Firebase Sync Error]:', e));
        emitChange('worker', { workerId: updated.id, workerPhone: updated.phone, workerName: updated.name, isAvailable: Boolean(updated.is_available) });
        return updated;
    },

    // ---------------- SCHEDULE & CONFLICT CHECK ----------------
    setWorkerAvailabilitySlot({ workerId, workerPhone, trade, dateStr, startTime, endTime, isAvailable = true, notes = '' }) {
        let worker = null;
        if (workerId) worker = this.getWorkerById(workerId);
        else if (workerPhone) worker = this.getWorkerByPhone(workerPhone);

        const phone = worker ? worker.phone : (workerPhone || '').replace(/\D/g, '');
        const wTrade = worker ? worker.trade : trade || 'Skilled Specialist';
        const wId = worker ? worker.id : null;

        if (!db) {
            if (!memoryStore.availability[phone]) memoryStore.availability[phone] = [];
            // Upsert by (worker, date) so "change my hours for tomorrow" replaces the slot
            // instead of stacking a second, contradictory row for the same day.
            const existingIdx = memoryStore.availability[phone].findIndex(
                s => String(s.date_str).toLowerCase() === String(dateStr).toLowerCase()
            );
            const slot = {
                id: existingIdx >= 0 ? memoryStore.availability[phone][existingIdx].id : Date.now(),
                worker_id: wId,
                worker_phone: phone,
                trade: wTrade,
                date_str: dateStr,
                start_time: startTime,
                end_time: endTime,
                is_available: isAvailable ? 1 : 0,
                notes
            };
            if (existingIdx >= 0) memoryStore.availability[phone][existingIdx] = slot;
            else memoryStore.availability[phone].unshift(slot);
            if (worker) worker.is_available = isAvailable ? 1 : 0;
            emitChange('availability', {
                workerId: wId,
                workerPhone: phone,
                workerName: worker ? worker.name : null,
                date: dateStr,
                startTime,
                endTime,
                isAvailable: Boolean(isAvailable)
            });
            return {
                success: true,
                persisted: true,
                slotId: slot.id,
                workerId: wId,
                workerPhone: phone,
                workerName: worker ? worker.name : null,
                trade: wTrade,
                date: dateStr,
                startTime,
                endTime,
                hours: `${startTime} – ${endTime}`,
                isAvailable: Boolean(isAvailable),
                firebaseSync: mirrorToFirebase({ worker, slot })
            };
        }

        // Upsert on (worker_phone, date_str): one authoritative slot per worker per day.
        const existingSlot = db.prepare(
            `SELECT * FROM worker_availability WHERE worker_phone = ? AND LOWER(date_str) = LOWER(?) ORDER BY id DESC LIMIT 1`
        ).get(phone, dateStr);

        let slotId;
        if (existingSlot) {
            db.prepare(`
                UPDATE worker_availability
                SET worker_id = ?, trade = ?, date_str = ?, start_time = ?, end_time = ?, is_available = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(wId, wTrade, dateStr, startTime, endTime, isAvailable ? 1 : 0, notes, existingSlot.id);
            slotId = existingSlot.id;
            // Remove any older duplicates for the same day left behind by the previous insert-only code.
            db.prepare(
                `DELETE FROM worker_availability WHERE worker_phone = ? AND LOWER(date_str) = LOWER(?) AND id <> ?`
            ).run(phone, dateStr, existingSlot.id);
        } else {
            const runRes = db.prepare(`
                INSERT INTO worker_availability (worker_id, worker_phone, trade, date_str, start_time, end_time, is_available, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(wId, phone, wTrade, dateStr, startTime, endTime, isAvailable ? 1 : 0, notes);
            slotId = Number(runRes.lastInsertRowid);
        }

        if (wId) {
            db.prepare('UPDATE workers SET is_available = ? WHERE id = ?').run(isAvailable ? 1 : 0, wId);
        }

        // Read back what SQLite actually stored — this, not the input, is the truth.
        const slot = db.prepare('SELECT * FROM worker_availability WHERE id = ?').get(slotId);
        const updatedWorker = wId ? this.getWorkerById(wId) : null;

        // Tell open pages. Announced from the read-back row, so a listener can never be
        // told about hours that were not actually stored.
        if (slot) {
            emitChange('availability', {
                workerId: wId,
                workerPhone: phone,
                workerName: worker ? worker.name : null,
                date: slot.date_str,
                startTime: slot.start_time,
                endTime: slot.end_time,
                isAvailable: Boolean(slot.is_available)
            });
        }

        return {
            success: Boolean(slot),
            persisted: Boolean(slot) && slot.start_time === startTime && slot.end_time === endTime,
            slotId,
            workerId: wId,
            workerPhone: phone,
            workerName: worker ? worker.name : null,
            trade: wTrade,
            date: slot ? slot.date_str : dateStr,
            startTime: slot ? slot.start_time : startTime,
            endTime: slot ? slot.end_time : endTime,
            hours: `${slot ? slot.start_time : startTime} – ${slot ? slot.end_time : endTime}`,
            isAvailable: Boolean(isAvailable),
            // Promise the caller can await to learn the REAL Firestore outcome, instead of a
            // fire-and-forget call whose 403 nobody ever saw.
            firebaseSync: mirrorToFirebase({ worker: updatedWorker, slot })
        };
    },

    getWorkerSchedule(workerIdOrPhone) {
        let worker = null;
        if (typeof workerIdOrPhone === 'string' && workerIdOrPhone.length >= 10) {
            worker = this.getWorkerByPhone(workerIdOrPhone);
        } else if (typeof workerIdOrPhone === 'number') {
            worker = this.getWorkerById(workerIdOrPhone);
        } else if (!isNaN(Number(workerIdOrPhone)) && String(workerIdOrPhone).length < 10) {
            worker = this.getWorkerById(Number(workerIdOrPhone));
        } else {
            worker = this.getWorkerByPhone(workerIdOrPhone);
        }

        const phone = worker ? worker.phone : String(workerIdOrPhone).replace(/\D/g, '');
        const wId = worker ? worker.id : null;

        if (!db) {
            const slots = memoryStore.availability[phone] || [];
            const activeBookings = memoryStore.jobs.filter(j => (j.worker_phone === phone || (wId && j.worker_id === wId)) && ['Accepted', 'On the Way', 'In Progress', 'Requested'].includes(j.status));
            return {
                worker,
                isAvailableNow: worker ? Boolean(worker.is_available) : true,
                availabilitySlots: slots,
                activeBookings
            };
        }

        const availabilitySlots = db.prepare(`
            SELECT * FROM worker_availability
            WHERE worker_phone = ? OR (worker_id IS NOT NULL AND worker_id = ?)
            ORDER BY updated_at DESC, id DESC LIMIT 10
        `).all(phone, wId || -1);

        const activeBookings = db.prepare(`
            SELECT id, service, problem_description, location, requested_date, requested_time, status, customer_name, budget
            FROM jobs
            WHERE (worker_id = ? OR worker_phone = ?) AND status IN ('Accepted', 'On the Way', 'In Progress', 'Requested')
            ORDER BY created_at ASC
        `).all(wId || -1, phone);

        return {
            worker,
            isAvailableNow: worker ? Boolean(worker.is_available) : true,
            availabilitySlots,
            activeBookings
        };
    },

    getWorkerAvailability(workerIdOrPhone, dateStr = null) {
        const schedule = this.getWorkerSchedule(workerIdOrPhone);
        const slots = schedule ? schedule.availabilitySlots : [];
        if (!dateStr) return slots;
        return slots.filter(s => s.date_str && s.date_str.toLowerCase() === dateStr.toLowerCase());
    },

    checkScheduleConflict(workerId, requestedDate, requestedTime) {
        if (!db) {
            const conflict = memoryStore.jobs.find(j => j.worker_id === workerId && j.requested_date === requestedDate && j.requested_time === requestedTime && ['Accepted', 'On the Way', 'In Progress'].includes(j.status));
            return Boolean(conflict);
        }
        const conflict = db.prepare(`
            SELECT * FROM jobs
            WHERE worker_id = ?
              AND requested_date = ?
              AND requested_time = ?
              AND status IN ('Accepted', 'On the Way', 'In Progress')
        `).get(workerId, requestedDate, requestedTime);

        return Boolean(conflict);
    },

    // ---------------- JOB & BOOKING OPERATIONS ----------------
    createJob(jobData) {
        const jobId = jobData.id || generateJobId();
        const priceNum = parseInt(String(jobData.budget || '350').replace(/\D/g, ''), 10) || 350;

        if (!db) {
            const job = {
                id: jobId,
                customer_id: jobData.customer_id || null,
                customer_phone: (jobData.customer_phone || '').replace(/\D/g, '') || '9876543210',
                customer_name: jobData.customer_name || 'Customer',
                worker_id: jobData.worker_id || null,
                worker_phone: jobData.worker_phone ? String(jobData.worker_phone).replace(/\D/g, '') : null,
                worker_name: jobData.worker_name || 'Finding nearby specialists...',
                service: jobData.service || 'Specialist Visit',
                problem_description: jobData.problem_description || '',
                location: jobData.location || 'Town Area',
                city: jobData.city || 'Ramanagara',
                requested_date: jobData.requested_date || 'Today',
                requested_time: jobData.requested_time || 'Immediate',
                budget: jobData.budget || `₹${priceNum}`,
                final_price: priceNum,
                status: jobData.status || (jobData.worker_id ? 'Assigned' : 'Requested'),
                payment_status: 'Pending',
                payment_method: jobData.payment_method || 'Cash',
                created_at: new Date().toISOString()
            };
            memoryStore.jobs.unshift(job);
            FirebaseSync.syncJob(job).catch(e => console.warn('[Firebase Sync Error]:', e));
            return job;
        }

        const stmt = db.prepare(`
            INSERT INTO jobs (
                id, customer_id, customer_phone, customer_name,
                worker_id, worker_phone, worker_name,
                service, problem_description, location, city,
                requested_date, requested_time, budget, final_price,
                status, payment_status, payment_method
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            jobId,
            jobData.customer_id || null,
            jobData.customer_phone,
            jobData.customer_name || 'Customer',
            jobData.worker_id || null,
            jobData.worker_phone || null,
            jobData.worker_name || 'Finding nearby specialists...',
            jobData.service,
            jobData.problem_description,
            jobData.location || 'Town Area',
            jobData.city || 'Ramanagara',
            jobData.requested_date || 'Today',
            jobData.requested_time || 'Immediate',
            jobData.budget || `₹${priceNum}`,
            priceNum,
            jobData.status || 'Requested',
            'Pending',
            jobData.payment_method || 'Cash'
        );

        const created = this.getJobById(jobId);
        FirebaseSync.syncJob(created).catch(e => console.warn('[Firebase Sync Error]:', e));
        if (created) emitChange('job', { jobId: created.id, status: created.status, customerPhone: created.customer_phone, workerPhone: created.worker_phone, workerId: created.worker_id, city: created.city });
        return created;
    },

    getJobById(id) {
        if (!db) return memoryStore.jobs.find(j => j.id === id || String(j.id) === String(id)) || null;
        return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) || null;
    },

    getAllJobs(filters = {}) {
        if (!db) {
            let jobs = [...memoryStore.jobs];
            if (filters.status) jobs = jobs.filter(j => j.status === filters.status);
            if (filters.city) jobs = jobs.filter(j => j.city && j.city.toLowerCase() === filters.city.toLowerCase());
            return jobs;
        }

        let query = 'SELECT * FROM jobs WHERE 1=1';
        const params = [];

        if (filters.status) {
            query += ' AND status = ?';
            params.push(filters.status);
        }
        if (filters.city) {
            query += ' AND city = ?';
            params.push(filters.city);
        }

        query += ' ORDER BY created_at DESC';
        return db.prepare(query).all(...params);
    },

    getJobsByCustomer(customerPhoneOrId) {
        if (!db) {
            const clean = (customerPhoneOrId || '').replace(/\D/g, '');
            return memoryStore.jobs.filter(j => j.customer_phone === clean || j.customer_id === customerPhoneOrId);
        }
        if (typeof customerPhoneOrId === 'number') {
            return db.prepare('SELECT * FROM jobs WHERE customer_id = ? ORDER BY created_at DESC').all(customerPhoneOrId);
        }
        const clean = (customerPhoneOrId || '').replace(/\D/g, '');
        return db.prepare('SELECT * FROM jobs WHERE customer_phone = ? ORDER BY created_at DESC').all(clean);
    },

    getJobsByWorker(workerIdOrPhone) {
        if (!workerIdOrPhone) return [];
        if (!db) {
            const clean = String(workerIdOrPhone).replace(/\D/g, '');
            return memoryStore.jobs.filter(j => j.worker_phone === clean || String(j.worker_id) === String(workerIdOrPhone));
        }
        const cleanPhone = String(workerIdOrPhone).replace(/\D/g, '');
        if (cleanPhone.length >= 10) {
            const w = this.getWorkerByPhone(cleanPhone);
            if (w) {
                return db.prepare('SELECT * FROM jobs WHERE worker_phone = ? OR worker_id = ? ORDER BY created_at DESC').all(cleanPhone, w.id);
            }
            return db.prepare('SELECT * FROM jobs WHERE worker_phone = ? ORDER BY created_at DESC').all(cleanPhone);
        }
        if (typeof workerIdOrPhone === 'number' || (!isNaN(Number(workerIdOrPhone)) && Number(workerIdOrPhone) < 1000000)) {
            return db.prepare('SELECT * FROM jobs WHERE worker_id = ? ORDER BY created_at DESC').all(Number(workerIdOrPhone));
        }
        return db.prepare('SELECT * FROM jobs WHERE worker_phone = ? ORDER BY created_at DESC').all(String(workerIdOrPhone));
    },

    getAvailableJobsForWorker(trade, city = 'Ramanagara') {
        if (!db) {
            const tLower = (trade || '').toLowerCase();
            return memoryStore.jobs.filter(j => j.status === 'Requested' && ((j.service && j.service.toLowerCase().includes(tLower)) || (j.problem_description && j.problem_description.toLowerCase().includes(tLower))));
        }
        return db.prepare(`
            SELECT * FROM jobs
            WHERE status = 'Requested'
              AND (service LIKE ? OR ? LIKE '%' || service || '%')
              AND city = ?
            ORDER BY created_at DESC
        `).all(`%${trade}%`, trade, city);
    },

    updateJobStatus(jobId, status, workerId = null, workerName = null, workerPhone = null) {
        const job = this.getJobById(jobId);
        if (!job) return null;

        if (!db) {
            job.status = status;
            if (workerId) {
                job.worker_id = workerId;
                job.worker_name = workerName || 'Worker';
                job.worker_phone = workerPhone || '';
            }
            if (status === 'Completed') {
                job.completed_at = new Date().toISOString();
                job.payment_status = 'Paid';
                if (job.worker_id) {
                    const w = this.getWorkerById(job.worker_id);
                    if (w) w.jobs_completed = (w.jobs_completed || 0) + 1;
                }
            }
            FirebaseSync.syncJob(job).catch(e => console.warn('[Firebase Sync Error]:', e));
            emitChange('job', { jobId: job.id, status: job.status, customerPhone: job.customer_phone, workerPhone: job.worker_phone, workerId: job.worker_id, city: job.city });
            return job;
        }

        const fields = ['status = ?'];
        const params = [status];

        if (workerId) {
            fields.push('worker_id = ?', 'worker_name = ?', 'worker_phone = ?');
            params.push(workerId, workerName || 'Worker', workerPhone || '');
        }

        if (status === 'Completed') {
            fields.push("completed_at = CURRENT_TIMESTAMP", "payment_status = 'Paid'");
            if (job.worker_id) {
                db.prepare('UPDATE workers SET jobs_completed = jobs_completed + 1 WHERE id = ?').run(job.worker_id);
            }
        }

        params.push(jobId);
        db.prepare(`UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`).run(...params);
        const updated = this.getJobById(jobId);
        FirebaseSync.syncJob(updated).catch(e => console.warn('[Firebase Sync Error]:', e));
        if (updated) emitChange('job', { jobId: updated.id, status: updated.status, customerPhone: updated.customer_phone, workerPhone: updated.worker_phone, workerId: updated.worker_id, city: updated.city });
        return updated;
    },

    submitJobReview(jobId, rating, review) {
        const job = this.getJobById(jobId);
        if (!job) return null;

        if (!db) {
            job.rating = rating;
            job.review = review;
            FirebaseSync.syncJob(job).catch(e => console.warn('[Firebase Sync Error]:', e));
            return job;
        }

        db.prepare('UPDATE jobs SET rating = ?, review = ? WHERE id = ?').run(rating, review, jobId);

        if (job.worker_id) {
            const avgRow = db.prepare('SELECT AVG(rating) as avg_rating FROM jobs WHERE worker_id = ? AND rating IS NOT NULL').get(job.worker_id);
            if (avgRow && avgRow.avg_rating) {
                const rounded = Math.round(avgRow.avg_rating * 10) / 10;
                db.prepare('UPDATE workers SET rating = ? WHERE id = ?').run(rounded, job.worker_id);
            }
        }

        const updated = this.getJobById(jobId);
        FirebaseSync.syncJob(updated).catch(e => console.warn('[Firebase Sync Error]:', e));
        return updated;
    },

    // ---------------- EARNINGS & DIGITAL WORK RECORD ----------------
    getWorkerEarnings(workerIdOrPhone) {
        let worker = null;
        if (typeof workerIdOrPhone === 'string' && workerIdOrPhone.length >= 10) {
            worker = this.getWorkerByPhone(workerIdOrPhone);
        } else if (typeof workerIdOrPhone === 'number') {
            worker = this.getWorkerById(workerIdOrPhone);
        } else if (!isNaN(Number(workerIdOrPhone)) && String(workerIdOrPhone).length < 10) {
            worker = this.getWorkerById(Number(workerIdOrPhone));
        } else {
            worker = this.getWorkerByPhone(workerIdOrPhone);
        }

        const wId = worker ? worker.id : (typeof workerIdOrPhone === 'number' ? workerIdOrPhone : -1);
        const phone = worker ? worker.phone : String(workerIdOrPhone).replace(/\D/g, '');

        if (!db) {
            const completedJobs = memoryStore.jobs.filter(j => (j.worker_phone === phone || (wId && j.worker_id === wId)) && j.status === 'Completed');
            const total = completedJobs.reduce((sum, j) => sum + (j.final_price || 300), 0);
            return {
                today: total,
                thisMonth: total,
                totalEarnings: total,
                totalCompletedJobs: completedJobs.length,
                pendingEarnings: 0,
                completedJobs
            };
        }

        const totalRow = db.prepare(`
            SELECT COALESCE(SUM(COALESCE(final_price, CAST(REPLACE(REPLACE(budget, '₹', ''), ' ', '') AS INTEGER), 300)), 0) as total, COUNT(*) as count
            FROM jobs
            WHERE (worker_id = ? OR worker_phone = ?) AND status = 'Completed'
        `).get(wId, phone);

        const todayRow = db.prepare(`
            SELECT COALESCE(SUM(COALESCE(final_price, CAST(REPLACE(REPLACE(budget, '₹', ''), ' ', '') AS INTEGER), 300)), 0) as today
            FROM jobs
            WHERE (worker_id = ? OR worker_phone = ?) AND status = 'Completed' AND date(completed_at) = date('now')
        `).get(wId, phone);

        const monthRow = db.prepare(`
            SELECT COALESCE(SUM(COALESCE(final_price, CAST(REPLACE(REPLACE(budget, '₹', ''), ' ', '') AS INTEGER), 300)), 0) as month
            FROM jobs
            WHERE (worker_id = ? OR worker_phone = ?) AND status = 'Completed' AND strftime('%Y-%m', completed_at) = strftime('%Y-%m', 'now')
        `).get(wId, phone);

        const pendingRow = db.prepare(`
            SELECT COALESCE(SUM(COALESCE(final_price, CAST(REPLACE(REPLACE(budget, '₹', ''), ' ', '') AS INTEGER), 300)), 0) as pending
            FROM jobs
            WHERE (worker_id = ? OR worker_phone = ?) AND status IN ('Accepted', 'On the Way', 'In Progress')
        `).get(wId, phone);

        const completedJobs = db.prepare(`
            SELECT id, service, customer_name, location, requested_date, final_price, completed_at, payment_status, payment_method, rating
            FROM jobs
            WHERE (worker_id = ? OR worker_phone = ?) AND status = 'Completed'
            ORDER BY completed_at DESC
        `).all(wId, phone);

        return {
            today: todayRow?.today || 0,
            thisMonth: monthRow?.month || 0,
            totalEarnings: totalRow?.total || 0,
            totalCompletedJobs: totalRow?.count || 0,
            pendingEarnings: pendingRow?.pending || 0,
            completedJobs
        };
    },

    getWorkerEarningsSummary(workerIdOrPhone) {
        return this.getWorkerEarnings(workerIdOrPhone);
    },

    // ---------------- CALL LOGS (TELEPHONY / VOICE) ----------------
    logCall({ callerPhone, callerRole = 'customer', transcript, intentDetected, actionsTaken, durationSeconds = 15 }) {
        const clean = (callerPhone || 'anonymous').replace(/\D/g, '') || 'anonymous';
        if (!db) {
            const entry = {
                id: memoryStore.callLogs.length + 1,
                caller_phone: clean,
                caller_role: callerRole,
                transcript,
                intent_detected: intentDetected || 'general_query',
                actions_taken: actionsTaken || 'none',
                duration_seconds: durationSeconds,
                timestamp: new Date().toISOString()
            };
            memoryStore.callLogs.unshift(entry);
            return entry;
        }
        const stmt = db.prepare(`
            INSERT INTO call_logs (caller_phone, caller_role, transcript, intent_detected, actions_taken, duration_seconds)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const res = stmt.run(clean, callerRole, transcript, intentDetected || 'general_query', actionsTaken || 'none', durationSeconds);
        return db.prepare('SELECT * FROM call_logs WHERE id = ?').get(Number(res.lastInsertRowid));
    },

    getAllCallLogs() {
        if (!db) return [...memoryStore.callLogs];
        return db.prepare('SELECT * FROM call_logs ORDER BY timestamp DESC LIMIT 50').all();
    },

    // ---------------- VOICE SESSIONS (SERVERLESS MULTI-TURN PERSISTENCE) ----------------
    getVoiceSession(sessionId) {
        if (!sessionId) return null;
        if (db) {
            try {
                const stmt = db.prepare('SELECT data FROM voice_sessions WHERE session_id = ?');
                const row = stmt.get(sessionId);
                if (row && row.data) {
                    return JSON.parse(row.data);
                }
            } catch (e) {}
        }
        return memoryStore.voice_sessions?.[sessionId] || null;
    },

    saveVoiceSession(sessionId, data) {
        if (!sessionId || !data) return;
        const jsonStr = JSON.stringify(data);
        if (db) {
            try {
                const stmt = db.prepare(`
                    INSERT INTO voice_sessions (session_id, data, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(session_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
                `);
                stmt.run(sessionId, jsonStr, Date.now());
            } catch (e) {}
        }
        if (!memoryStore.voice_sessions) memoryStore.voice_sessions = {};
        memoryStore.voice_sessions[sessionId] = data;
    },

    deleteVoiceSession(sessionId) {
        if (!sessionId) return;
        if (db) {
            try {
                db.prepare('DELETE FROM voice_sessions WHERE session_id = ?').run(sessionId);
            } catch (e) {}
        }
        if (memoryStore.voice_sessions) {
            delete memoryStore.voice_sessions[sessionId];
        }
    },

    // Trigger complete sync of all SQLite records to Firebase
    async triggerFullFirebaseSync() {
        const allWorkers = this.getAllWorkers();
        const allJobs = this.getAllJobs();
        const results = { workersSynced: 0, jobsSynced: 0 };

        for (const w of allWorkers) {
            await FirebaseSync.syncWorker(w);
            results.workersSynced++;
        }
        for (const j of allJobs) {
            await FirebaseSync.syncJob(j);
            results.jobsSynced++;
        }
        return results;
    }
};

module.exports = DB;
