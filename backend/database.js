/* ==========================================================================
   GigSync — Central SQLite Database Layer
   Zero-external-dependency persistence using native Node.js SQLite
   ========================================================================== */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DB_PATH = path.join(__dirname, '..', 'gigsync.db');
const db = new DatabaseSync(DB_PATH);

// Initialize Tables
function initDatabase() {
    db.exec(`
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS workers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL UNIQUE,
            trade TEXT NOT NULL,
            service TEXT NOT NULL,
            rating REAL DEFAULT 4.8,
            km REAL DEFAULT 1.5,
            jobs_completed INTEGER DEFAULT 0,
            experience_years INTEGER DEFAULT 1,
            price INTEGER DEFAULT 300,
            is_available INTEGER DEFAULT 1,
            is_verified INTEGER DEFAULT 1,
            tools TEXT NOT NULL,
            initials TEXT NOT NULL,
            city TEXT NOT NULL DEFAULT 'Ramanagara',
            area TEXT NOT NULL DEFAULT 'Vijaya Nagar',
            about TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL UNIQUE,
            email TEXT,
            city TEXT NOT NULL DEFAULT 'Ramanagara',
            area TEXT NOT NULL DEFAULT 'Vijaya Nagar',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            customer_phone TEXT NOT NULL,
            customer_name TEXT NOT NULL,
            service TEXT NOT NULL,
            problem_description TEXT NOT NULL,
            location TEXT NOT NULL,
            requested_time TEXT NOT NULL,
            budget TEXT NOT NULL,
            worker_id INTEGER,
            worker_name TEXT,
            status TEXT DEFAULT 'Requested',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (worker_id) REFERENCES workers(id)
        );

        CREATE TABLE IF NOT EXISTS worker_availability (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            worker_phone TEXT NOT NULL,
            trade TEXT NOT NULL,
            date_str TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            is_available INTEGER DEFAULT 1,
            notes TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

    // Seed Initial Workers if table is empty
    const countRow = db.prepare('SELECT COUNT(*) as count FROM workers').get();
    if (countRow.count === 0) {
        const seedWorkers = [
            {
                name: 'Ramesh Kumar',
                phone: '9845011223',
                trade: 'Master Electrician',
                service: 'electrical',
                rating: 4.8,
                km: 1.2,
                jobs_completed: 126,
                experience_years: 5,
                price: 300,
                is_available: 1,
                is_verified: 1,
                tools: 'Digital Multimeter, Impact Drill, Wire Stripper Kit, Safety Gloves',
                initials: 'RK',
                city: 'Ramanagara',
                area: 'Vijaya Nagar',
                about: 'Ramesh has been serving households and retail shops across Ramanagara and Channapatna for 5 years. Expert in house wiring, inverter battery systems, ceiling fans, and fuse boards.'
            },
            {
                name: 'Suresh Gowda',
                phone: '9845022334',
                trade: 'Plumbing & Motor Specialist',
                service: 'plumbing',
                rating: 4.7,
                km: 1.8,
                jobs_completed: 98,
                experience_years: 7,
                price: 280,
                is_available: 1,
                is_verified: 1,
                tools: 'Heavy Pipe Wrench, Thread Sealer, Pipe Cutter, Motor Pressure Tester',
                initials: 'SG',
                city: 'Ramanagara',
                area: 'Town Market Ward',
                about: 'Specialist in bathroom fixtures, overhead water tank piping, and submersible pump repairs across Ramanagara.'
            },
            {
                name: 'Anil Prasad',
                phone: '9845033445',
                trade: 'General Carpenter',
                service: 'carpentry',
                rating: 4.6,
                km: 3.1,
                jobs_completed: 74,
                experience_years: 4,
                price: 350,
                is_available: 0,
                is_verified: 1,
                tools: 'Circular Saw, Wood Chisels, Router, Hand Plane, Drill Kit',
                initials: 'AP',
                city: 'Ramanagara',
                area: 'Channapatna Link',
                about: 'Custom door fittings, lock replacements, window framing, and modular kitchen repair for homes and village houses.'
            },
            {
                name: 'Manoj N.',
                phone: '9845044556',
                trade: 'AC & Refrigerator Tech',
                service: 'ac',
                rating: 4.9,
                km: 2.4,
                jobs_completed: 151,
                experience_years: 8,
                price: 450,
                is_available: 1,
                is_verified: 1,
                tools: 'Gas Pressure Gauge, Vacuum Pump, Flaring Tool, Refrigerant Canister',
                initials: 'MN',
                city: 'Ramanagara',
                area: 'Station Road',
                about: 'Certified technician for home refrigerators, washing machines, and split/window AC installation and gas charging.'
            },
            {
                name: 'Imran Khan',
                phone: '9845055667',
                trade: 'Two-Wheeler & Auto Mechanic',
                service: 'mechanics',
                rating: 4.8,
                km: 1.5,
                jobs_completed: 112,
                experience_years: 6,
                price: 250,
                is_available: 1,
                is_verified: 1,
                tools: 'Spanner Toolkit, Spark Plug Tester, Tyre Lever, Battery Jump Kit',
                initials: 'IK',
                city: 'Ramanagara',
                area: 'MG Road',
                about: 'On-site motorcycle, scooter, and auto-rickshaw emergency repair. Fast doorstep breakdown assistance.'
            },
            {
                name: 'Manjunath K.',
                phone: '9845066778',
                trade: 'Welder & Fabricator',
                service: 'welding',
                rating: 4.7,
                km: 3.8,
                jobs_completed: 67,
                experience_years: 9,
                price: 400,
                is_available: 1,
                is_verified: 1,
                tools: 'Portable Arc Welding Machine, Angle Grinder, Safety Mask, Clamp Set',
                initials: 'MK',
                city: 'Ramanagara',
                area: 'Bidadi Gate',
                about: 'Expert in MS gate repairs, window safety grills, agricultural equipment welding, and roofing frame fabrication.'
            },
            {
                name: 'Lakshmi R.',
                phone: '9845077889',
                trade: 'Master Tailor',
                service: 'tailoring',
                rating: 4.9,
                km: 0.9,
                jobs_completed: 210,
                experience_years: 10,
                price: 150,
                is_available: 1,
                is_verified: 1,
                tools: 'Industrial Sewing Machine, Overlock Machine, Fabric Scissors, Measuring Kit',
                initials: 'LR',
                city: 'Ramanagara',
                area: 'Gandhi Nagar',
                about: 'Doorstep blouse stitching, dress alterations, curtain hemming, and uniform fittings.'
            }
        ];

        const insertWorker = db.prepare(`
            INSERT INTO workers (name, phone, trade, service, rating, km, jobs_completed, experience_years, price, is_available, is_verified, tools, initials, city, area, about)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const w of seedWorkers) {
            insertWorker.run(w.name, w.phone, w.trade, w.service, w.rating, w.km, w.jobs_completed, w.experience_years, w.price, w.is_available, w.is_verified, w.tools, w.initials, w.city, w.area, w.about);
        }
    }

    // Seed Initial Jobs
    const jobCount = db.prepare('SELECT COUNT(*) as count FROM jobs').get();
    if (jobCount.count === 0) {
        const insertJob = db.prepare(`
            INSERT INTO jobs (id, customer_phone, customer_name, service, problem_description, location, requested_time, budget, worker_id, worker_name, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        insertJob.run('GS-1082', '9876543210', 'Kavya Rao', 'Electrical Repair', 'Ceiling fan buzzing and not spinning at full speed', 'Vijaya Nagar, Ramanagara', 'Tomorrow 10:00 AM', '₹350–₹500', 1, 'Ramesh Kumar', 'Confirmed');
        insertJob.run('GS-1083', '9876543211', 'Pradeep Gowda', 'Plumbing Repair', 'Submersible pump valve leak in overhead tank', 'Town Market, Ramanagara', 'Today 4:00 PM', '₹400–₹600', 2, 'Suresh Gowda', 'Requested');
    }

    // Seed Initial Worker Availability
    const availCount = db.prepare('SELECT COUNT(*) as count FROM worker_availability').get();
    if (availCount.count === 0) {
        const insertAvail = db.prepare(`
            INSERT INTO worker_availability (worker_phone, trade, date_str, start_time, end_time, is_available, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        insertAvail.run('9845011223', 'Electrician', 'Tomorrow', '10:00 AM', '02:00 PM', 1, 'Confirmed by AI Voice Phone Call');
        insertAvail.run('9845022334', 'Plumber', 'Today', '08:30 AM', '06:30 PM', 1, 'Full day on-duty');
    }
}

// Database helper functions
const DB = {
    // Workers
    getAllWorkers(filters = {}) {
        let query = 'SELECT * FROM workers WHERE 1=1';
        const params = [];

        if (filters.service && filters.service !== 'all') {
            query += ' AND (LOWER(service) LIKE ? OR LOWER(trade) LIKE ?)';
            params.push(`%${filters.service.toLowerCase()}%`, `%${filters.service.toLowerCase()}%`);
        }
        if (filters.maxKm) {
            query += ' AND km <= ?';
            params.push(Number(filters.maxKm));
        }
        if (filters.isAvailable !== undefined) {
            query += ' AND is_available = ?';
            params.push(filters.isAvailable ? 1 : 0);
        }
        if (filters.minRating) {
            query += ' AND rating >= ?';
            params.push(Number(filters.minRating));
        }

        query += ' ORDER BY rating DESC, km ASC';
        return db.prepare(query).all(...params);
    },

    getWorkerById(id) {
        return db.prepare('SELECT * FROM workers WHERE id = ?').get(id);
    },

    getWorkerByPhone(phone) {
        const clean = String(phone).replace(/\D/g, '').slice(-10);
        return db.prepare('SELECT * FROM workers WHERE phone LIKE ?').get(`%${clean}%`);
    },

    createWorker(data) {
        const initials = data.name ? data.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'WK';
        const stmt = db.prepare(`
            INSERT INTO workers (name, phone, trade, service, rating, km, jobs_completed, experience_years, price, is_available, is_verified, tools, initials, city, area, about)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run(
            data.name,
            data.phone,
            data.trade,
            data.service || data.trade.toLowerCase(),
            data.rating || 5.0,
            data.km || 1.0,
            data.jobs_completed || 0,
            data.experience_years || 1,
            data.price || 300,
            data.is_available !== undefined ? (data.is_available ? 1 : 0) : 1,
            data.is_verified !== undefined ? (data.is_verified ? 1 : 0) : 1,
            data.tools || 'Standard kit',
            initials,
            data.city || 'Ramanagara',
            data.area || 'Vijaya Nagar',
            data.about || `${data.name} is a skilled ${data.trade} in ${data.city || 'Ramanagara'}.`
        );
        return this.getWorkerById(info.lastInsertRowid);
    },

    updateWorkerAvailability(phone, dateStr, startTime, endTime, isAvailable = 1, trade = 'Skilled Worker') {
        const clean = String(phone).replace(/\D/g, '').slice(-10);
        // Also update workers table
        db.prepare('UPDATE workers SET is_available = ? WHERE phone LIKE ?').run(isAvailable ? 1 : 0, `%${clean}%`);

        // Insert log in worker_availability
        const stmt = db.prepare(`
            INSERT INTO worker_availability (worker_phone, trade, date_str, start_time, end_time, is_available, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(clean, trade, dateStr, startTime, endTime, isAvailable ? 1 : 0, 'Updated via GigSync AI Voice Engine');

        return {
            success: true,
            phone: clean,
            trade,
            date: dateStr,
            startTime,
            endTime,
            isAvailable: Boolean(isAvailable)
        };
    },

    // Jobs
    getAllJobs(status = null) {
        if (status) {
            return db.prepare('SELECT * FROM jobs WHERE status = ? ORDER BY created_at DESC').all(status);
        }
        return db.prepare('SELECT * FROM jobs ORDER BY created_at DESC').all();
    },

    getJobById(id) {
        return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
    },

    getJobsByPhone(phone) {
        const clean = String(phone).replace(/\D/g, '').slice(-10);
        return db.prepare('SELECT * FROM jobs WHERE customer_phone LIKE ? OR worker_id IN (SELECT id FROM workers WHERE phone LIKE ?) ORDER BY created_at DESC').all(`%${clean}%`, `%${clean}%`);
    },

    createJob(data) {
        const jobId = 'GS-' + Math.floor(1000 + Math.random() * 9000);
        const stmt = db.prepare(`
            INSERT INTO jobs (id, customer_phone, customer_name, service, problem_description, location, requested_time, budget, worker_id, worker_name, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            jobId,
            data.customer_phone || '9876543210',
            data.customer_name || 'Customer',
            data.service,
            data.problem_description || 'General Service Required',
            data.location || 'Ramanagara',
            data.requested_time || 'Tomorrow Morning',
            data.budget || '₹300–₹500',
            data.worker_id || null,
            data.worker_name || 'Nearby Available Workers Broadcast',
            data.status || 'Requested'
        );
        return this.getJobById(jobId);
    },

    updateJobStatus(jobId, status, workerId = null, workerName = null) {
        if (workerId && workerName) {
            db.prepare('UPDATE jobs SET status = ?, worker_id = ?, worker_name = ? WHERE id = ?').run(status, workerId, workerName, jobId);
        } else {
            db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run(status, jobId);
        }
        return this.getJobById(jobId);
    },

    // Call Logs
    addCallLog(data) {
        const stmt = db.prepare(`
            INSERT INTO call_logs (caller_phone, caller_role, transcript, intent_detected, actions_taken, duration_seconds, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run(
            data.caller_phone || 'Anonymous',
            data.caller_role || 'unknown',
            data.transcript || '',
            data.intent_detected || 'General Inquiry',
            data.actions_taken || 'None',
            data.duration_seconds || 0,
            data.status || 'Completed'
        );
        return db.prepare('SELECT * FROM call_logs WHERE id = ?').get(info.lastInsertRowid);
    },

    getRecentCallLogs(limit = 20) {
        return db.prepare('SELECT * FROM call_logs ORDER BY timestamp DESC LIMIT ?').all(limit);
    }
};

initDatabase();

module.exports = DB;
