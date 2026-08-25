/* ==========================================================================
   GigSync — Central SQLite Database Layer with Firebase Firestore Sync
   Dual Persistence: Instant Local SQLite + Real-Time Firebase Cloud Sync
   ========================================================================== */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const FirebaseSync = require('./firebase');

const DB_PATH = path.join(__dirname, '..', 'gigsync.db');
const db = new DatabaseSync(DB_PATH);

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

// Initialize Database Tables
function initDatabase() {
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
        console.log('✅ [Database] Default Master Admin provisioned: 9999999999 / admin@gigsync2026');
    }
}

initDatabase();

/* ==========================================================================
   DATABASE OPERATIONS & REPOSITORY METHODS
   ========================================================================== */

const DB = {
    // ---------------- AUTH & USER OPERATIONS ----------------
    createUser({ name, phone, email, role, password, city = 'Ramanagara', area = 'Town' }) {
        const cleanPhone = phone.replace(/\D/g, '');
        const pHash = hashPassword(password);

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
        const cleanPhone = phone.replace(/\D/g, '');
        const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(cleanPhone);
        return user || null;
    },

    getUserById(id) {
        const user = db.prepare('SELECT id, name, phone, email, role, city, area, created_at FROM users WHERE id = ?').get(id);
        return user || null;
    },

    getCustomerById(id) {
        return db.prepare('SELECT * FROM customers WHERE id = ?').get(id) || null;
    },

    updateCustomerProfile(phoneOrId, updates = {}) {
        let customer = null;
        if (typeof phoneOrId === 'number') {
            customer = this.getCustomerById(phoneOrId);
        } else {
            const clean = String(phoneOrId).replace(/\D/g, '');
            customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(clean);
        }
        if (!customer) return null;

        const fields = [];
        const params = [];
        if (updates.city) { fields.push('city = ?'); params.push(updates.city); }
        if (updates.area) { fields.push('area = ?'); params.push(updates.area); }
        if (updates.name) { fields.push('name = ?'); params.push(updates.name); }
        if (updates.email) { fields.push('email = ?'); params.push(updates.email); }

        if (fields.length > 0) {
            params.push(customer.id);
            db.prepare(`UPDATE customers SET ${fields.join(', ')} WHERE id = ?`).run(...params);
            if (updates.city || updates.area) {
                db.prepare(`UPDATE users SET city = ?, area = ? WHERE phone = ?`).run(updates.city || customer.city, updates.area || customer.area, customer.phone);
            }
        }
        const updated = this.getCustomerById(customer.id);
        FirebaseSync.syncCustomer(updated).catch(e => console.warn('[Firebase Sync Error]:', e));
        return updated;
    },

    authenticateUser(phone, password) {
        const cleanPhone = phone.replace(/\D/g, '');
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
        db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    },

    // ---------------- WORKER OPERATIONS ----------------
    getAllWorkers(filters = {}) {
        let query = 'SELECT * FROM workers WHERE 1=1';
        const params = [];

        if (filters.service && filters.service !== 'all') {
            query += ' AND (service LIKE ? OR trade LIKE ?)';
            params.push(`%${filters.service}%`, `%${filters.service}%`);
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
        return db.prepare(query).all(...params);
    },

    getWorkerById(id) {
        return db.prepare('SELECT * FROM workers WHERE id = ?').get(id) || null;
    },

    getWorkerByPhone(phone) {
        const clean = phone.replace(/\D/g, '');
        return db.prepare('SELECT * FROM workers WHERE phone = ?').get(clean) || null;
    },

    getWorkerByUserId(userId) {
        return db.prepare('SELECT * FROM workers WHERE user_id = ?').get(userId) || null;
    },

    createWorker(data) {
        const initials = (data.name || 'WK').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
        const cleanPhone = (data.phone || '').replace(/\D/g, '');

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
            data.service_areas || `${data.city || 'Ramanagara'}, Nearby Areas`,
            data.about || ''
        );

        const created = this.getWorkerById(Number(res.lastInsertRowid));
        FirebaseSync.syncWorker(created).catch(e => console.warn('[Firebase Sync Error]:', e));
        return created;
    },

    updateWorkerProfile(id, updates = {}) {
        const fields = [];
        const params = [];

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
        FirebaseSync.syncWorker(updated).catch(e => console.warn('[Firebase Sync Error]:', e));
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
        db.prepare('UPDATE workers SET is_available = ? WHERE id = ?').run(isAvailable ? 1 : 0, worker.id);
        const updated = this.getWorkerById(worker.id);
        FirebaseSync.syncWorker(updated).catch(e => console.warn('[Firebase Sync Error]:', e));
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

        const stmt = db.prepare(`
            INSERT INTO worker_availability (worker_id, worker_phone, trade, date_str, start_time, end_time, is_available, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(wId, phone, wTrade, dateStr, startTime, endTime, isAvailable ? 1 : 0, notes);

        return {
            workerId: wId,
            workerPhone: phone,
            trade: wTrade,
            date: dateStr,
            startTime,
            endTime,
            isAvailable: Boolean(isAvailable)
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

        const availabilitySlots = db.prepare(`
            SELECT * FROM worker_availability
            WHERE worker_phone = ? OR (worker_id IS NOT NULL AND worker_id = ?)
            ORDER BY updated_at DESC LIMIT 10
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

    checkScheduleConflict(workerId, requestedDate, requestedTime) {
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
        return created;
    },

    getJobById(id) {
        return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) || null;
    },

    getAllJobs(filters = {}) {
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
        if (typeof customerPhoneOrId === 'number') {
            return db.prepare('SELECT * FROM jobs WHERE customer_id = ? ORDER BY created_at DESC').all(customerPhoneOrId);
        }
        const clean = customerPhoneOrId.replace(/\D/g, '');
        return db.prepare('SELECT * FROM jobs WHERE customer_phone = ? ORDER BY created_at DESC').all(clean);
    },

    getJobsByWorker(workerIdOrPhone) {
        if (typeof workerIdOrPhone === 'number' || !isNaN(Number(workerIdOrPhone))) {
            return db.prepare('SELECT * FROM jobs WHERE worker_id = ? ORDER BY created_at DESC').all(Number(workerIdOrPhone));
        }
        const clean = workerIdOrPhone.replace(/\D/g, '');
        return db.prepare('SELECT * FROM jobs WHERE worker_phone = ? ORDER BY created_at DESC').all(clean);
    },

    getAvailableJobsForWorker(trade, city = 'Ramanagara') {
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
        return updated;
    },

    submitJobReview(jobId, rating, review) {
        const job = this.getJobById(jobId);
        if (!job) return null;

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

    // ---------------- CALL LOGS (TELEPHONY / VOICE) ----------------
    logCall({ callerPhone, callerRole = 'customer', transcript, intentDetected, actionsTaken, durationSeconds = 15 }) {
        const clean = callerPhone.replace(/\D/g, '');
        const stmt = db.prepare(`
            INSERT INTO call_logs (caller_phone, caller_role, transcript, intent_detected, actions_taken, duration_seconds)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const res = stmt.run(clean, callerRole, transcript, intentDetected || 'general_query', actionsTaken || 'none', durationSeconds);
        return db.prepare('SELECT * FROM call_logs WHERE id = ?').get(Number(res.lastInsertRowid));
    },

    getAllCallLogs() {
        return db.prepare('SELECT * FROM call_logs ORDER BY timestamp DESC LIMIT 50').all();
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
