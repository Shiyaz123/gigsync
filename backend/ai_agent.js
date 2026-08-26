/* ==========================================================================
   GigSync — Context-Aware & Database-First AI Voice Agent Engine
   Unified Google Gemini API Brain · Verified Real Database Tools
   ========================================================================== */

const fs = require('node:fs');
const path = require('node:path');

// Auto-load .env if present (strictly server-side, never exposed to client)
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    try {
        const envContent = fs.readFileSync(envPath, 'utf8');
        for (const line of envContent.split('\n')) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                const [k, ...v] = trimmed.split('=');
                const key = k.trim();
                const val = v.join('=').trim().replace(/^["']|["']$/g, '');
                if (!process.env[key]) {
                    process.env[key] = val;
                }
            }
        }
    } catch(e){}
}

const { GoogleGenAI } = require('@google/genai');
const DB = require('./database');

// ======================================================================
// 0. SHARED HELPERS FOR REAL-DATA TOOLS
// ======================================================================

// Resolve a worker strictly from the verified caller phone. Never guesses.
function resolveWorker(phone) {
    const clean = (phone || '').replace(/\D/g, '');
    if (!clean) return { clean: '', worker: null };
    return { clean, worker: DB.getWorkerByPhone(clean) || null };
}

// Standard "this caller has no worker record" answer so the AI can be honest
// instead of inventing a profile.
function notRegistered(clean) {
    return {
        status: 'not_registered',
        dataAvailable: false,
        workerPhone: clean,
        message: `No worker account is registered for ${clean || 'this caller'} in the GigSync database.`
    };
}

const WORKER_OPEN_STATUSES = ['Requested', 'Accepted', 'Confirmed', 'On the Way', 'In Progress'];

// Every job row belonging to this worker, newest first.
function jobsForWorker(clean, workerId) {
    return DB.getAllJobs().filter(j => {
        const jp = (j.worker_phone || '').replace(/\D/g, '');
        return (jp && jp === clean) || (workerId && Number(j.worker_id) === Number(workerId));
    });
}

// The database layer returns a `firebaseSync` promise for write operations so the
// caller can find out whether the Firestore mirror actually accepted the write.
// Nothing here ever claims success on the AI's behalf.
async function awaitFirebase(dbResult) {
    if (!dbResult || !dbResult.firebaseSync) {
        return { ok: null, message: 'Firebase mirror was not attempted for this operation.' };
    }
    try {
        const out = await dbResult.firebaseSync;
        return out || { ok: null, message: 'Firebase mirror returned no result.' };
    } catch (err) {
        return { ok: false, message: `Firebase mirror failed: ${err.message}` };
    }
}

// 1. Definition of Real Database Tools (No Assumptions, No Fabricated Records)
const AI_TOOLS = {
    // 1. Register or Update Worker Profile in Verified Database & Firebase
    async registerWorkerProfile({ name, phone, trade, city = 'Ramanagara', area = 'Town', tools = 'Standard tool kit', price = 300, experienceYears = 2, confirmed = false }) {
        const cleanPhone = (phone || '').replace(/\D/g, '');
        if (cleanPhone.length !== 10) {
            return {
                status: 'error',
                persisted: false,
                message: 'A valid 10-digit phone number is required before a worker record can be created. Ask the caller: "What is your phone number?"'
            };
        }
        if (!name || String(name).trim().length < 2 || ['worker', 'user', 'caller'].includes(String(name).toLowerCase())) {
            return { status: 'error', persisted: false, message: 'A worker name is required. Ask the caller: "What is your name?"' };
        }
        if (!trade || ['skilled specialist', 'general helper', 'specialist', 'worker', 'general labour'].includes(String(trade).toLowerCase().trim())) {
            return { status: 'error', persisted: false, message: 'A specific profession/trade (e.g. Electrician, Plumber, Carpenter, Mechanic) is required. Ask the caller: "What type of work do you do?"' };
        }

        if (!confirmed) {
            return {
                status: 'confirmation_required',
                persisted: false,
                pendingRegistration: { name: name.trim(), phone: cleanPhone, trade: trade.trim(), city },
                message: `NOT SAVED YET. Ask the caller to confirm registration: "Got it. You are ${name.trim()}, an ${trade.trim()}. Would you like me to register you as a GigSync worker?" If they say yes, call registerWorkerProfile again with confirmed: true.`
            };
        }

        const existingBefore = DB.getWorkerByPhone(cleanPhone);

        const res = DB.registerWorkerProfile({
            name: name.trim(),
            phone: cleanPhone,
            trade: trade.trim(),
            city,
            area,
            tools,
            price: Number(price) || 300,
            experienceYears: Number(experienceYears) || 2
        });

        // Read back from SQLite. A returned object is not proof; a re-read is.
        const after = DB.getWorkerByPhone(cleanPhone);
        const persisted = Boolean(after && after.id);
        const firebase = await awaitFirebase(res);

        return {
            status: persisted ? 'success' : 'error',
            persisted,
            action: existingBefore ? 'WORKER_PROFILE_UPDATED' : 'WORKER_REGISTERED',
            wasExistingWorker: Boolean(existingBefore),
            workerId: after ? after.id : null,
            worker: after,
            firebase,
            // True only when BOTH the authoritative DB and the Firebase mirror confirmed.
            fullySynced: persisted && firebase.ok === true
        };
    },

    // 2. Worker Availability Update
    async updateWorkerAvailability({ workerPhone, trade = 'Skilled Specialist', date = 'Tomorrow', startTime, endTime, isAvailable = true, confirmed = false }) {
        const { clean, worker } = resolveWorker(workerPhone);

        // An availability slot must belong to a real worker; otherwise it is an orphan record.
        if (!worker) {
            return {
                status: 'not_registered',
                persisted: false,
                workerPhone: clean,
                message: `No worker is registered for ${clean || 'this caller'}. Register the worker profile first (name, phone, profession), then set availability.`
            };
        }
        // Marking a whole day OFF needs no clock times — "I don't want to work tomorrow" is a
        // complete instruction. Reuse whatever hours are already stored for that day so the record
        // stays meaningful, and fall back to a full-day span when nothing is stored.
        let effectiveStart = startTime;
        let effectiveEnd = endTime;
        if (!isAvailable && (!startTime || !endTime)) {
            const existing = (DB.getWorkerAvailability(clean, date) || [])[0] || null;
            effectiveStart = startTime || (existing ? existing.start_time : '12:00 AM');
            effectiveEnd = endTime || (existing ? existing.end_time : '11:59 PM');
        }

        // Hours are never guessed for an AVAILABLE day — the AI must ask.
        if (!effectiveStart || !effectiveEnd) {
            return {
                status: 'error',
                persisted: false,
                message: 'Both a start time and an end time are required to mark the worker available. Ask the worker for the missing one — do not assume it.'
            };
        }

        // CONFIRMATION GATE. Nothing is written until the worker has agreed to these exact
        // details out loud. This is enforced here rather than only in the prompt because a
        // prompt rule is advisory — the model was observed saving a schedule change on the
        // worker's first sentence, without ever asking.
        if (!confirmed) {
            const summary = isAvailable
                ? `${date}, ${effectiveStart} to ${effectiveEnd}`
                : `${date} as a day off`;
            return {
                status: 'confirmation_required',
                persisted: false,
                pendingChange: { date, startTime: effectiveStart, endTime: effectiveEnd, isAvailable: Boolean(isAvailable) },
                message: `NOT SAVED YET. Read these exact details back to the worker and ask them to confirm: ${summary}. If they say yes, call updateWorkerAvailability again with the same values and confirmed set to true. If they change any detail, use the new values and ask again.`
            };
        }

        const res = DB.setWorkerAvailabilitySlot({
            workerId: worker.id,
            workerPhone: clean,
            trade: worker.trade || trade,
            dateStr: date,
            startTime: effectiveStart,
            endTime: effectiveEnd,
            isAvailable: Boolean(isAvailable),
            notes: isAvailable ? '' : 'Worker marked this day as not working'
        });

        DB.updateWorkerAvailabilityStatus(worker.id, isAvailable);

        // Read back the stored slot for this exact date.
        const storedForDate = (DB.getWorkerAvailability(clean, date) || [])[0] || null;
        const persisted = Boolean(storedForDate)
            && storedForDate.start_time === effectiveStart
            && storedForDate.end_time === effectiveEnd
            && Boolean(storedForDate.is_available) === Boolean(isAvailable);
        const firebase = await awaitFirebase(res);

        return {
            status: persisted ? 'success' : 'error',
            persisted,
            action: isAvailable ? 'AVAILABILITY_UPDATED' : 'MARKED_NOT_WORKING',
            workerName: worker.name,
            workerPhone: clean,
            trade: worker.trade || trade,
            date,
            startTime: storedForDate ? storedForDate.start_time : effectiveStart,
            endTime: storedForDate ? storedForDate.end_time : effectiveEnd,
            hours: `${effectiveStart} – ${effectiveEnd}`,
            isAvailable: Boolean(isAvailable),
            firebase,
            fullySynced: persisted && firebase.ok === true
        };
    },

    // 3. Get Worker Schedule & Bookings for Given Date
    getWorkerSchedule({ workerPhone, date = 'Today' }) {
        const { clean, worker } = resolveWorker(workerPhone);
        if (!worker) return notRegistered(clean);

        const schedule = DB.getWorkerSchedule(clean);
        let activeJobs = jobsForWorker(clean, worker.id).filter(j => WORKER_OPEN_STATUSES.includes(j.status));

        if (date && date.toLowerCase() !== 'all') {
            activeJobs = activeJobs.filter(j => j.requested_date && j.requested_date.toLowerCase() === date.toLowerCase());
        }

        return {
            status: 'success',
            dataAvailable: true,
            workerName: worker.name,
            profession: worker.trade,
            isAvailableNow: schedule?.isAvailableNow || false,
            date,
            count: activeJobs.length,
            bookings: activeJobs,
            availabilitySlots: schedule?.availabilitySlots || []
        };
    },

    // 4. Get Next Upcoming Job for Worker
    getWorkerNextJob({ workerPhone }) {
        const { clean, worker } = resolveWorker(workerPhone);
        if (!worker) return notRegistered(clean);

        const jobs = jobsForWorker(clean, worker.id)
            .filter(j => WORKER_OPEN_STATUSES.includes(j.status))
            .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

        if (jobs.length === 0) {
            return {
                status: 'none',
                dataAvailable: true,
                workerName: worker.name,
                message: 'This worker has no upcoming or open jobs in the database.'
            };
        }

        const j = jobs[0];
        return {
            status: 'success',
            dataAvailable: true,
            workerName: worker.name,
            remainingOpenJobs: jobs.length,
            job: {
                jobId: j.id,
                status: j.status,
                customerName: j.customer_name,
                service: j.service,
                problem: j.problem_description,
                location: j.location,
                city: j.city,
                requestedDate: j.requested_date,
                requestedTime: j.requested_time,
                budget: j.budget
            }
        };
    },

    // 5. Update Job Status by Worker (Arrived, Completed, Cancelled)
    updateJobStatusByWorker({ workerPhone, jobId, status = 'Completed' }) {
        const { clean, worker } = resolveWorker(workerPhone);
        if (!worker) return notRegistered(clean);

        const openJobs = jobsForWorker(clean, worker.id).filter(j => WORKER_OPEN_STATUSES.includes(j.status));

        let targetJob = null;
        if (jobId) {
            targetJob = jobsForWorker(clean, worker.id)
                .find(j => String(j.id).toLowerCase() === String(jobId).toLowerCase());
            if (!targetJob) {
                return {
                    status: 'error',
                    persisted: false,
                    message: `Job ${jobId} does not belong to this worker or does not exist.`
                };
            }
        } else if (openJobs.length === 1) {
            targetJob = openJobs[0];
        } else if (openJobs.length > 1) {
            // More than one candidate: ask the worker which one. Never pick for them.
            return {
                status: 'needs_disambiguation',
                persisted: false,
                message: 'This worker has more than one open job. Ask which job before changing any status.',
                choices: openJobs.map(j => ({
                    jobId: j.id, customerName: j.customer_name, service: j.service,
                    location: j.location, requestedDate: j.requested_date,
                    requestedTime: j.requested_time, status: j.status
                }))
            };
        }

        if (!targetJob) {
            return {
                status: 'none',
                persisted: false,
                message: 'This worker has no open job in the database to update.'
            };
        }

        DB.updateJobStatus(targetJob.id, status);

        // Read back — only a re-read proves the status actually changed.
        const after = DB.getJobById(targetJob.id);
        const persisted = Boolean(after) && after.status === status;

        return {
            status: persisted ? 'success' : 'error',
            persisted,
            action: 'JOB_STATUS_UPDATED',
            jobId: targetJob.id,
            requestedStatus: status,
            storedStatus: after ? after.status : null,
            job: after
        };
    },

    // 6. Get Worker Earnings
    getWorkerEarnings({ workerPhone }) {
        const { clean, worker } = resolveWorker(workerPhone);
        if (!worker) return notRegistered(clean);
        const earnings = DB.getWorkerEarnings(clean);
        const last = (earnings.completedJobs || [])[0] || null;
        return {
            status: 'success',
            dataAvailable: true,
            workerName: worker.name,
            workerPhone: clean,
            currency: 'INR',
            earnings,
            lastPayment: last ? {
                jobId: last.id,
                amount: last.final_price,
                service: last.service,
                customerName: last.customer_name,
                completedAt: last.completed_at,
                paymentStatus: last.payment_status,
                paymentMethod: last.payment_method
            } : null
        };
    },

    // 6a. Full worker profile as actually stored ("What details do you have about me?")
    getWorkerProfile({ workerPhone }) {
        const { clean, worker } = resolveWorker(workerPhone);
        if (!worker) return notRegistered(clean);
        const slots = DB.getWorkerAvailability(clean) || [];
        return {
            status: 'success',
            dataAvailable: true,
            profile: {
                workerId: worker.id,
                name: worker.name,
                phone: worker.phone,
                profession: worker.trade,
                service: worker.service,
                skills: worker.skills || null,
                tools: worker.tools || null,
                city: worker.city,
                area: worker.area,
                serviceAreas: worker.service_areas || null,
                experienceYears: worker.experience_years ?? null,
                startingPrice: worker.price,
                rating: worker.rating,
                jobsCompleted: worker.jobs_completed,
                isVerified: Boolean(worker.is_verified),
                onDutyNow: Boolean(worker.is_available)
            },
            availabilitySlots: slots.map(s => ({
                date: s.date_str, startTime: s.start_time, endTime: s.end_time,
                isAvailable: Boolean(s.is_available), updatedAt: s.updated_at
            }))
        };
    },

    // 6b. Availability for a date, or every stored slot ("Am I available today?")
    getWorkerAvailability({ workerPhone, date = null }) {
        const { clean, worker } = resolveWorker(workerPhone);
        if (!worker) return notRegistered(clean);
        const all = DB.getWorkerAvailability(clean) || [];
        const wanted = date && String(date).toLowerCase() !== 'all'
            ? all.filter(s => (s.date_str || '').toLowerCase() === String(date).toLowerCase())
            : all;

        return {
            status: 'success',
            dataAvailable: true,
            workerName: worker.name,
            profession: worker.trade,
            queriedDate: date || 'all',
            onDutyNow: Boolean(worker.is_available),
            matchCount: wanted.length,
            // Empty match means nothing is stored for that date — say so, do not guess.
            slots: wanted.map(s => ({
                date: s.date_str, startTime: s.start_time, endTime: s.end_time,
                isAvailable: Boolean(s.is_available), updatedAt: s.updated_at
            })),
            allStoredDates: [...new Set(all.map(s => s.date_str))]
        };
    },

    // 6c. Every booking/request for this worker, with status breakdown
    getWorkerBookings({ workerPhone, date = null, status = null }) {
        const { clean, worker } = resolveWorker(workerPhone);
        if (!worker) return notRegistered(clean);

        let jobs = jobsForWorker(clean, worker.id);
        if (date && String(date).toLowerCase() !== 'all') {
            jobs = jobs.filter(j => (j.requested_date || '').toLowerCase() === String(date).toLowerCase());
        }
        if (status && String(status).toLowerCase() !== 'all') {
            jobs = jobs.filter(j => (j.status || '').toLowerCase() === String(status).toLowerCase());
        }

        const byStatus = {};
        for (const j of jobs) byStatus[j.status] = (byStatus[j.status] || 0) + 1;

        return {
            status: 'success',
            dataAvailable: true,
            workerName: worker.name,
            queriedDate: date || 'all',
            queriedStatus: status || 'all',
            totalCount: jobs.length,
            countsByStatus: byStatus,
            openCount: jobs.filter(j => WORKER_OPEN_STATUSES.includes(j.status)).length,
            bookings: jobs.map(j => ({
                jobId: j.id,
                status: j.status,
                customerName: j.customer_name,
                service: j.service,
                problem: j.problem_description,
                location: j.location,
                city: j.city,
                requestedDate: j.requested_date,
                requestedTime: j.requested_time,
                budget: j.budget,
                createdAt: j.created_at
            }))
        };
    },

    // 6d. Completed job history incl. real ratings/reviews ("How was my last job?")
    getWorkerJobHistory({ workerPhone, limit = 10 }) {
        const { clean, worker } = resolveWorker(workerPhone);
        if (!worker) return notRegistered(clean);

        const completed = jobsForWorker(clean, worker.id)
            .filter(j => j.status === 'Completed')
            .sort((a, b) => String(b.completed_at || b.created_at).localeCompare(String(a.completed_at || a.created_at)));

        const shape = j => ({
            jobId: j.id,
            service: j.service,
            customerName: j.customer_name,
            location: j.location,
            completedAt: j.completed_at,
            amount: j.final_price,
            paymentStatus: j.payment_status,
            // null means the customer never left one — report it as unavailable.
            rating: j.rating ?? null,
            review: j.review || null
        });

        return {
            status: 'success',
            dataAvailable: true,
            workerName: worker.name,
            completedCount: completed.length,
            lastCompletedJob: completed.length ? shape(completed[0]) : null,
            history: completed.slice(0, Number(limit) || 10).map(shape)
        };
    },

    // 6e. "Is there anything I need to do today?" — one real snapshot of the day
    getWorkerDayBriefing({ workerPhone, date = 'Today' }) {
        const { clean, worker } = resolveWorker(workerPhone);
        if (!worker) return notRegistered(clean);

        const jobs = jobsForWorker(clean, worker.id);
        const forDate = jobs.filter(j => (j.requested_date || '').toLowerCase() === String(date).toLowerCase());
        const slots = (DB.getWorkerAvailability(clean) || [])
            .filter(s => (s.date_str || '').toLowerCase() === String(date).toLowerCase());

        return {
            status: 'success',
            dataAvailable: true,
            workerName: worker.name,
            profession: worker.trade,
            date,
            onDutyNow: Boolean(worker.is_available),
            availabilityForDate: slots.map(s => ({ startTime: s.start_time, endTime: s.end_time, isAvailable: Boolean(s.is_available) })),
            pendingRequests: forDate.filter(j => j.status === 'Requested').length,
            confirmedJobs: forDate.filter(j => ['Accepted', 'Confirmed'].includes(j.status)).length,
            inProgressJobs: forDate.filter(j => ['On the Way', 'In Progress'].includes(j.status)).length,
            completedToday: forDate.filter(j => j.status === 'Completed').length,
            cancelled: forDate.filter(j => j.status === 'Cancelled').length,
            jobs: forDate.map(j => ({
                jobId: j.id, status: j.status, customerName: j.customer_name,
                service: j.service, location: j.location, requestedTime: j.requested_time
            }))
        };
    },

    // 6f. Change stored profile fields for the verified worker (profession, price, ...)
    updateWorkerProfileField({ workerPhone, name, trade, price, city, area, skills, tools, confirmed = false }) {
        const { clean, worker } = resolveWorker(workerPhone);
        if (!worker) return notRegistered(clean);

        const updates = {};
        if (name) updates.name = name;
        if (trade) { updates.trade = trade; updates.service = String(trade).toLowerCase(); }
        if (price) updates.price = Number(price) || worker.price;
        if (city) updates.city = city;
        if (area) updates.area = area;
        if (skills) updates.skills = skills;
        if (tools) updates.tools = tools;

        if (Object.keys(updates).length === 0) {
            return { status: 'error', persisted: false, message: 'No profile field was supplied to change.' };
        }

        // Same confirmation gate as availability: a worker's profession, name or rate is not
        // changed until they have agreed to the specific change.
        if (!confirmed) {
            const summary = Object.entries(updates)
                .filter(([k]) => k !== 'service')
                .map(([k, v]) => `${k === 'trade' ? 'profession' : k} to ${v}`)
                .join(', ');
            return {
                status: 'confirmation_required',
                persisted: false,
                pendingChange: updates,
                message: `NOT SAVED YET. Ask the worker to confirm this change: ${summary}. If they say yes, call updateWorkerProfileField again with the same values and confirmed set to true.`
            };
        }

        DB.updateWorkerProfile(worker.id, updates);

        // Read back from the database — the only proof the write landed.
        const after = DB.getWorkerByPhone(clean);
        const persisted = Boolean(after) && Object.entries(updates).every(([k, v]) =>
            String(after[k] ?? '').toLowerCase() === String(v ?? '').toLowerCase());

        return {
            status: persisted ? 'success' : 'error',
            persisted,
            action: 'WORKER_PROFILE_UPDATED',
            changedFields: Object.keys(updates),
            workerId: worker.id,
            profile: after ? { name: after.name, profession: after.trade, price: after.price, city: after.city, area: after.area } : null
        };
    },

    // 6g. Worker marks a job finished ("I completed the job.")
    completeJob({ workerPhone, jobId = null }) {
        return AI_TOOLS.updateJobStatusByWorker({ workerPhone, jobId, status: 'Completed' });
    },

    // 7. Find Real Registered Workers from Database (Customer Tool)
    findWorkers({ service, trade, city = 'Ramanagara' } = {}) {
        const targetTrade = trade || (service && service !== 'all' ? service : undefined);
        const workers = DB.getAllWorkers({
            service: targetTrade,
            city: city,
            isAvailable: true
        });

        return {
            status: 'success',
            count: workers.length,
            workers: workers.map(w => ({
                id: w.id,
                name: w.name,
                phone: w.phone,
                trade: w.trade,
                service: w.service,
                rating: w.rating,
                distanceKm: w.km,
                startingPrice: `₹${w.price}`,
                isAvailable: Boolean(w.is_available),
                tools: w.tools,
                city: w.city,
                area: w.area
            }))
        };
    },

    // 8. Create Job in Real Database (Customer Tool)
    createJob({ customerPhone = '9876543210', customerName = 'Customer', service, problemDescription, location = 'Town Area', city = 'Ramanagara', requestedDate = 'Today', requestedTime = 'Immediate', budget = '₹300', workerId = null, workerName = null, workerPhone = null }) {
        let assignedWorker = null;
        if (workerId) {
            assignedWorker = DB.getWorkerById(workerId);
        } else if (workerPhone) {
            assignedWorker = DB.getWorkerByPhone(workerPhone);
        }

        const newJob = DB.createJob({
            customer_phone: (customerPhone || '').replace(/\D/g, '') || '9876543210',
            customer_name: customerName || 'Customer',
            service: service || 'General Service',
            problem_description: problemDescription || `Service request for ${service}`,
            location: location || `${city} Town`,
            city: city || 'Ramanagara',
            requested_date: requestedDate,
            requested_time: requestedTime,
            budget: budget || '₹300',
            worker_id: assignedWorker ? assignedWorker.id : null,
            worker_phone: assignedWorker ? assignedWorker.phone : (workerPhone || null),
            worker_name: assignedWorker ? assignedWorker.name : (workerName || null),
            status: assignedWorker ? 'Confirmed' : 'Requested'
        });

        return {
            status: 'success',
            action: 'JOB_CREATED',
            job: newJob,
            assignedWorker
        };
    },

    // 9. Get Customer Bookings (Customer Tool)
    getCustomerBookings({ customerPhone }) {
        const cleanPhone = (customerPhone || '').replace(/\D/g, '');
        const jobs = DB.getAllJobs().filter(j => j.customer_phone && j.customer_phone.replace(/\D/g, '') === cleanPhone);
        return {
            status: 'success',
            count: jobs.length,
            bookings: jobs
        };
    },

    // 10. Cancel Job (Customer Tool)
    cancelJob({ jobId, customerPhone }) {
        const job = DB.getJobById(jobId);
        if (!job) {
            return { status: 'error', message: `Job #${jobId} was not found.` };
        }
        if (customerPhone && job.customer_phone.replace(/\D/g, '') !== customerPhone.replace(/\D/g, '')) {
            return { status: 'error', message: `Unauthorized to cancel Job #${jobId}.` };
        }

        const updated = DB.updateJobStatus(jobId, 'Cancelled');
        return {
            status: 'success',
            action: 'JOB_CANCELLED',
            job: updated
        };
    },

    // 11. List Supported Services
    getServices() {
        return [
            'Electrical (Fan, wiring, switchboards)',
            'Plumbing (Pipe leaks, tap repairs, motor)',
            'Carpentry (Doors, locks, furniture)',
            'Two-Wheeler & Auto Mechanics',
            'AC & Fridge Tech',
            'Washing Machine & Appliance Repair',
            'Painting',
            'Home Cleaning',
            'Masonry & Construction',
            'Tailoring & Alterations',
            'Welding & Metalwork',
            'Driver Services',
            'TV & Electronics Repair',
            'Water Purifier & RO Service'
        ];
    }
};

// ======================================================================
// 1.1 GEMINI FUNCTION DECLARATIONS (OFFICIAL GOOGLE GENAI SCHEMA)
// ======================================================================
const GEMINI_TOOLS_DECLARATIONS = [
    {
        name: 'registerWorkerProfile',
        description: 'Register a new worker profile. Both name, 10-digit phone number, and specific trade/profession are REQUIRED. NOTHING IS SAVED until you call this with confirmed:true, after reading back and confirming with the caller.',
        parameters: {
            type: 'OBJECT',
            properties: {
                name: { type: 'STRING', description: 'Full name of the worker e.g. Rajesh' },
                phone: { type: 'STRING', description: '10-digit mobile number e.g. 7012280695' },
                trade: { type: 'STRING', description: 'Specific trade profession e.g. Electrician, Plumber, Carpenter, Mechanic' },
                city: { type: 'STRING', description: 'City/town in Karnataka e.g. Ramanagara' },
                experienceYears: { type: 'NUMBER', description: 'Years of experience' },
                confirmed: { type: 'BOOLEAN', description: 'Set true ONLY after the caller confirmed. Leave false on first call.' }
            },
            required: ['name', 'phone', 'trade']
        }
    },
    {
        name: 'updateWorkerAvailability',
        description: 'Set the calling worker\'s working hours for one day, or mark that day off. To set hours you MUST have both a start and an end time — ask the worker for whichever is missing instead of guessing. To mark a day off, pass isAvailable:false and no times are needed ("I don\'t want to work tomorrow"). NOTHING IS SAVED until you call this a second time with confirmed:true, after the worker has agreed to the exact details.',
        parameters: {
            type: 'OBJECT',
            properties: {
                workerPhone: { type: 'STRING', description: 'Filled automatically from the verified caller. Do not ask for it.' },
                trade: { type: 'STRING', description: 'Trade e.g. Electrician. Optional — the stored profession is used when omitted.' },
                date: { type: 'STRING', description: 'Day label: Today, Tomorrow, or a weekday name' },
                startTime: { type: 'STRING', description: 'Start time e.g. 09:00 AM. Required when isAvailable is true.' },
                endTime: { type: 'STRING', description: 'End time e.g. 05:00 PM. Required when isAvailable is true.' },
                isAvailable: { type: 'BOOLEAN', description: 'True = working these hours. False = not working that day (no times required).' },
                confirmed: { type: 'BOOLEAN', description: 'Set true ONLY after you read the exact day and hours back to the worker and they agreed. Leave false or omit on the first call — the tool will then tell you what to confirm.' }
            },
            required: ['date']
        }
    },
    {
        name: 'getWorkerSchedule',
        description: 'Jobs booked with the calling worker for a given day, plus their stored availability slots.',
        parameters: {
            type: 'OBJECT',
            properties: {
                workerPhone: { type: 'STRING', description: 'Worker phone number' },
                date: { type: 'STRING', description: 'Optional date to filter e.g. Today, Tomorrow' }
            }
        }
    },
    {
        name: 'getWorkerNextJob',
        description: 'Get the next upcoming job details (customer name, time, location, problem description) for the worker.',
        parameters: {
            type: 'OBJECT',
            properties: {
                workerPhone: { type: 'STRING', description: 'Worker phone number' }
            }
        }
    },
    {
        name: 'updateJobStatusByWorker',
        description: 'Update the job progress status by worker (e.g. Arrived / In Progress, Completed, Cancelled).',
        parameters: {
            type: 'OBJECT',
            properties: {
                workerPhone: { type: 'STRING', description: 'Worker phone number' },
                jobId: { type: 'STRING', description: 'Optional Job ID (e.g. GS-1048)' },
                status: { type: 'STRING', description: 'New status: "In Progress" (Arrived), "Completed" (Job finished), "Cancelled" (Cannot take job)' }
            },
            required: ['status']
        }
    },
    {
        name: 'getWorkerEarnings',
        description: 'Real earnings for the calling worker: today, this month, lifetime total, pending amount, number of completed jobs, and the most recent payment. Use for any money/payment/income question.',
        parameters: {
            type: 'OBJECT',
            properties: {
                workerPhone: { type: 'STRING', description: 'Filled automatically from the verified caller. Do not ask for it.' }
            }
        }
    },
    {
        name: 'getWorkerProfile',
        description: 'Read everything GigSync actually stores about the calling worker: name, phone, profession/trade, skills, tools, city, area, experience, starting price, rating, jobs completed, verification and duty status. Use for "what details do you have about me", "who am I registered as", "what is my rate", "what trade am I listed under".',
        parameters: {
            type: 'OBJECT',
            properties: {
                workerPhone: { type: 'STRING', description: 'Filled automatically from the verified caller. Do not ask for it.' }
            }
        }
    },
    {
        name: 'getWorkerAvailability',
        description: 'Read the calling worker\'s stored availability slots. Pass a date to check one day ("Today", "Tomorrow", a weekday) or omit it for every stored day. Use for "am I available today", "what is my availability tomorrow", "what are my working hours", "am I on duty".',
        parameters: {
            type: 'OBJECT',
            properties: {
                workerPhone: { type: 'STRING', description: 'Filled automatically from the verified caller. Do not ask for it.' },
                date: { type: 'STRING', description: 'Day label to check, e.g. Today, Tomorrow, Sunday. Omit for all stored days.' }
            }
        }
    },
    {
        name: 'getWorkerBookings',
        description: 'Read every booking and job request attached to the calling worker, with a count broken down by status. Optionally filter by date or status. Use for "has anyone booked me", "did anyone request me", "how many jobs do I have this week", "has my customer cancelled", "what bookings do I have", "do I have anything tomorrow".',
        parameters: {
            type: 'OBJECT',
            properties: {
                workerPhone: { type: 'STRING', description: 'Filled automatically from the verified caller. Do not ask for it.' },
                date: { type: 'STRING', description: 'Optional day label filter, e.g. Today, Tomorrow.' },
                status: { type: 'STRING', description: 'Optional status filter: Requested, Confirmed, Accepted, On the Way, In Progress, Completed, Cancelled.' }
            }
        }
    },
    {
        name: 'getWorkerJobHistory',
        description: 'Read the calling worker\'s completed job history including the real customer rating and written review for each job, the amount paid and the payment status. Use for "what jobs have I completed", "how was my last job", "what was my last payment", "what did customers say about me". If rating or review is null the customer never left one — say it is not available.',
        parameters: {
            type: 'OBJECT',
            properties: {
                workerPhone: { type: 'STRING', description: 'Filled automatically from the verified caller. Do not ask for it.' },
                limit: { type: 'NUMBER', description: 'How many past jobs to return. Default 10.' }
            }
        }
    },
    {
        name: 'getWorkerDayBriefing',
        description: 'One combined snapshot of a single day for the calling worker: the availability stored for that day plus counts of pending requests, confirmed jobs, jobs in progress, completed and cancelled jobs, with the job list. Use for open-ended questions like "is there anything I need to do today", "what does my day look like", "am I busy tomorrow", "what is my status".',
        parameters: {
            type: 'OBJECT',
            properties: {
                workerPhone: { type: 'STRING', description: 'Filled automatically from the verified caller. Do not ask for it.' },
                date: { type: 'STRING', description: 'Day label, e.g. Today or Tomorrow. Defaults to Today.' }
            }
        }
    },
    {
        name: 'updateWorkerProfileField',
        description: 'Change stored profile fields for the calling worker who already has an account: profession/trade, display name, starting price, city, area, skills or tools. Only pass the fields that are actually changing. NOTHING IS SAVED until you call this a second time with confirmed:true, after the worker has agreed to the change.',
        parameters: {
            type: 'OBJECT',
            properties: {
                workerPhone: { type: 'STRING', description: 'Filled automatically from the verified caller. Do not ask for it.' },
                name: { type: 'STRING', description: 'New display name' },
                trade: { type: 'STRING', description: 'New profession e.g. Plumber, Electrician, Carpenter, Mechanic' },
                price: { type: 'NUMBER', description: 'New starting price in rupees' },
                city: { type: 'STRING', description: 'New city' },
                area: { type: 'STRING', description: 'New area/neighbourhood' },
                skills: { type: 'STRING', description: 'Comma separated skills' },
                tools: { type: 'STRING', description: 'Comma separated tools owned' },
                confirmed: { type: 'BOOLEAN', description: 'Set true ONLY after you read the change back to the worker and they agreed. Leave false or omit on the first call.' }
            }
        }
    },
    {
        name: 'getServices',
        description: 'The list of service categories GigSync covers. Use when a caller asks what services the platform offers, or when a worker asks which trades they can be listed under.',
        parameters: { type: 'OBJECT', properties: {} }
    },
    {
        name: 'completeJob',
        description: 'Mark one of the calling worker\'s jobs as Completed. Use when the worker says the job is finished. If the worker has several open jobs the tool returns the list so you can ask which one — never guess.',
        parameters: {
            type: 'OBJECT',
            properties: {
                workerPhone: { type: 'STRING', description: 'Filled automatically from the verified caller. Do not ask for it.' },
                jobId: { type: 'STRING', description: 'Job ID such as GS-1048, when known.' }
            }
        }
    },
    {
        name: 'findWorkers',
        description: 'Find real registered and available trade workers from the GigSync database for a requested trade and city.',
        parameters: {
            type: 'OBJECT',
            properties: {
                service: { type: 'STRING', description: 'Trade or service category, e.g. Electrical, Plumbing, Carpentry, Mechanics, Painting' },
                city: { type: 'STRING', description: 'City name e.g. Ramanagara' }
            },
            required: ['service']
        }
    },
    {
        name: 'createJob',
        description: 'Create a real customer job request or dispatch a booking to a registered worker in the database.',
        parameters: {
            type: 'OBJECT',
            properties: {
                service: { type: 'STRING', description: 'The service required e.g. Electrical, Plumbing' },
                problemDescription: { type: 'STRING', description: 'Brief description of the customer issue' },
                city: { type: 'STRING', description: 'Service city' },
                location: { type: 'STRING', description: 'Neighborhood or address' },
                requestedDate: { type: 'STRING', description: 'Requested service date' },
                requestedTime: { type: 'STRING', description: 'Requested time' },
                budget: { type: 'STRING', description: 'Budget or fee' },
                workerId: { type: 'STRING', description: 'ID of worker if booking a specific worker' },
                workerName: { type: 'STRING', description: 'Name of worker if booking a specific worker' },
                workerPhone: { type: 'STRING', description: 'Phone of worker if booking a specific worker' }
            },
            required: ['service', 'city']
        }
    },
    {
        name: 'getCustomerBookings',
        description: 'Retrieve real active bookings and jobs for the customer.',
        parameters: {
            type: 'OBJECT',
            properties: {
                customerPhone: { type: 'STRING', description: 'Customer phone number' }
            }
        }
    },
    {
        name: 'cancelJob',
        description: 'Cancel an active job or booking in the database.',
        parameters: {
            type: 'OBJECT',
            properties: {
                jobId: { type: 'STRING', description: 'The Job ID to cancel' },
                customerPhone: { type: 'STRING', description: 'Customer phone for verification' }
            },
            required: ['jobId']
        }
    }
];

// ======================================================================
// 1.2 UNIFIED GEMINI CONVERSATIONAL BRAIN
// ======================================================================
const GEMINI_MODEL_CHAIN = (() => {
    const preferred = (process.env.GEMINI_MODEL || '').trim();
    const chain = [
        'gemini-3.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite',
        'gemini-3.6-flash'
    ];
    if (preferred) chain.unshift(preferred);
    return chain.filter((m, i) => chain.indexOf(m) === i);
})();

// Errors that mean "this model is busy / out of quota" — try the next model instead of
// silently dropping the caller into a scripted reply.
function isModelExhaustedError(err) {
    const blob = `${err && err.status ? err.status : ''} ${err && err.code ? err.code : ''} ${err && err.message ? err.message : err}`;
    return /\b(429|500|503)\b|RESOURCE_EXHAUSTED|UNAVAILABLE|INTERNAL|quota|rate limit|overloaded|exceeded/i.test(blob);
}

// Tools that act on the caller's own worker record. The phone always comes from the
// verified session, never from anything the caller (or a mis-heard transcript) supplied.
const SELF_SCOPED_WORKER_TOOLS = new Set([
    'getWorkerProfile', 'getWorkerAvailability', 'getWorkerBookings', 'getWorkerJobHistory',
    'getWorkerDayBriefing', 'getWorkerSchedule', 'getWorkerNextJob', 'getWorkerEarnings',
    'updateWorkerAvailability', 'updateWorkerProfileField', 'updateJobStatusByWorker',
    'completeJob', 'registerWorkerProfile'
]);

// Turns a tool result into one honest operator-facing audit line. Writes report whether
// they actually persisted, and a broken Firebase mirror is named explicitly.
function describeToolOutcome(toolName, result) {
    if (!result || typeof result !== 'object') return `${toolName}: no result returned`;

    if (result.status === 'confirmation_required') {
        return `${toolName}: awaiting caller confirmation — nothing written`;
    }
    if (result.status === 'not_registered') {
        return `${toolName}: no worker account for ${result.workerPhone || 'this caller'}`;
    }
    if (result.status === 'needs_disambiguation') {
        return `${toolName}: asked the caller which job they meant`;
    }

    // Writes expose a persisted flag; reads do not.
    if (Object.prototype.hasOwnProperty.call(result, 'persisted')) {
        if (!result.persisted) {
            return `${toolName}: WRITE FAILED — ${result.message || 'the change did not persist'}`;
        }
        let line = `${toolName}: saved to the database`;
        if (result.firebase && result.firebase.ok === true) line += ', mirrored to Firebase';
        else if (result.firebase && result.firebase.ok === false) line += `, but the Firebase mirror FAILED — ${result.firebase.message}`;
        return line;
    }

    if (result.status === 'error') return `${toolName}: ${result.message || 'failed'}`;
    if (result.dataAvailable === false) return `${toolName}: no data available`;
    return `${toolName}: read real data`;
}

class GeminiConversationalBrain {
    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY || '';
        this.client = this.apiKey ? new GoogleGenAI({ apiKey: this.apiKey }) : null;
        this.modelChain = GEMINI_MODEL_CHAIN;
        this.modelIndex = 0;          // sticky: stay on the last model that actually worked
        this.lastError = null;        // surfaced honestly instead of a generic menu reply
        this.lastModelUsed = null;
    }

    getClient() {
        if (!this.client && process.env.GEMINI_API_KEY) {
            this.apiKey = process.env.GEMINI_API_KEY;
            this.client = new GoogleGenAI({ apiKey: this.apiKey });
        }
        return this.client;
    }

    // Ask the model chain in order, starting from whichever model last succeeded.
    // Advances only on quota/availability errors; real errors (bad request, bad key) throw.
    async generateWithFallback(client, request) {
        let lastErr = null;
        for (let attempt = 0; attempt < this.modelChain.length; attempt++) {
            const idx = (this.modelIndex + attempt) % this.modelChain.length;
            const model = this.modelChain[idx];
            try {
                const response = await client.models.generateContent({ ...request, model });
                if (idx !== this.modelIndex) {
                    console.warn(`[Gemini Engine] Switched active model to '${model}' after ${this.modelChain[this.modelIndex]} was unavailable.`);
                    this.modelIndex = idx;
                }
                this.lastModelUsed = model;
                this.lastError = null;
                return response;
            } catch (err) {
                lastErr = err;
                if (!isModelExhaustedError(err)) throw err;
                console.warn(`[Gemini Engine] Model '${model}' unavailable (${err.message}). Trying next model.`);
            }
        }
        throw lastErr || new Error('All Gemini models in the fallback chain are unavailable.');
    }

    async processTurn({ session, text }) {
        const client = this.getClient();
        if (!client) {
            this.lastError = 'GEMINI_API_KEY is not configured, so the AI brain cannot run.';
            return null;
        }

        const workerRecord = DB.getWorkerByPhone(session.callerPhone);
        const isVerifiedWorker = Boolean(workerRecord);
        const isWorkerCall = session.callerRole === 'worker' || isVerifiedWorker;

        const now = new Date();
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const tomorrow = new Date(now.getTime() + 86400000);

        const hasVerifiedPhone = session.callerPhone && /^[6-9]\d{9}$/.test(session.callerPhone);
        const identityBlock = `CALLER IDENTITY:
- Phone: ${hasVerifiedPhone ? session.callerPhone : '(unknown - if registering or updating schedule, you MUST ask for their 10-digit mobile number)'}
- Role: ${isWorkerCall ? 'worker' : 'customer'}
- Registered GigSync worker account: ${isVerifiedWorker
    ? `YES — id ${workerRecord.id}, name "${workerRecord.name}", profession "${workerRecord.trade}", city ${workerRecord.city}`
    : 'NO — unregistered / new caller'}
- City: ${session.city || 'Ramanagara'}
- Right now it is ${dayNames[now.getDay()]}, ${now.toDateString()}. "Today" = ${dayNames[now.getDay()]}, "Tomorrow" = ${dayNames[tomorrow.getDay()]}.`;

        const workerBrief = `YOU ARE A GENERAL GIGSYNC WORKER ASSISTANT — NOT A MENU OF COMMANDS.
The worker may ask anything about GigSync: their profile, availability, working hours, bookings,
job requests, customers, locations, schedule, this week's workload, earnings, payments, ratings,
reviews, completed jobs, cancellations, or the services they offer. Understand the intent behind
whatever wording they use. The examples below are examples only — generalise to questions nobody
listed. Never reply with a generic capability menu just because the exact phrasing is new to you.

FOR EVERY WORKER MESSAGE, FOLLOW THIS PROCEDURE:
1. Work out what the worker is actually asking or asking you to do.
2. Decide whether answering needs real GigSync data.
3. If it needs data, CALL THE TOOL that holds it. Never answer a data question from memory.
4. Answer using only what the tool returned.
5. If they want something changed, confirm the change in one short sentence first.
6. Then call the tool that performs the change.
7. Check the tool's 'persisted' / 'storedStatus' / 'firebase' fields to see what really happened.
8. Tell the worker what actually happened — including when it failed.

WHICH TOOL TO REACH FOR (map intent, not keywords):
- Who am I / what do you have on me / my rate / my trade / my area  -> getWorkerProfile
- Am I available today / my hours / availability for a day           -> getWorkerAvailability
- Has anyone booked me / did anyone request me / how many jobs this
  week / has a customer cancelled / anything tomorrow                -> getWorkerBookings
- Next job / next customer / where do I need to go / what time       -> getWorkerNextJob
- Today's plan / anything I need to do / how busy am I               -> getWorkerDayBriefing
- Jobs today or on a given day                                       -> getWorkerSchedule
- Earnings / income / payment / how much have I made / pending money -> getWorkerEarnings
- Completed jobs / how was my last job / rating / review             -> getWorkerJobHistory
- Change/set my working hours, "I don't want to work tomorrow"       -> updateWorkerAvailability
- Change my profession, name, price, city or area                    -> updateWorkerProfileField
- Register me / I am new / first-time signup                         -> registerWorkerProfile
- Job finished / I'm done                                            -> completeJob
- On my way / arrived / started / can't take it / cancel             -> updateJobStatusByWorker

SLOT-FILLING & REGISTRATION RULES (DO NOT GUESS MISSING DATA):
- A complete worker registration requires: (1) Full Name, (2) 10-digit Phone number, (3) Specific Trade/Profession, (4) Availability date (e.g. Today, Tomorrow), (5) Shift start and end times (e.g. 9 AM to 5 PM).
- If the caller's Name is missing: ASK FOR IT: "Sure. What is your name?"
- If the caller's Profession/Trade is missing: ASK FOR IT: "What type of work do you do?"
- If the caller's 10-digit Phone number is missing or unknown: YOU MUST ASK: "Thank you, [Name]. What is your 10-digit mobile number?"
- If the caller's Working hours are missing: ASK FOR IT: "What hours are you available?"
- NEVER invent, assume, or default a worker's phone or name. NEVER attempt to register without a valid 10-digit phone number.
- When all 5 details are present, read back and ask confirmation: "Got it. You are [Name], an [Trade], and you are available [Tomorrow] from [9 AM] to [5 PM]. Would you like me to register you as a GigSync worker?"
- Only call registerWorkerProfile and updateWorkerAvailability with confirmed:true AFTER the caller confirms with "Yes".

HONESTY RULES (these outrank sounding helpful):
- Never invent a name, hour, date, customer, amount, rating or job. If it is not in a tool result,
  you do not know it.
- If a tool returns dataAvailable:false, or an empty list, or a null field, SAY it is not available:
  "There's no availability saved for tomorrow yet." / "No customer has left a rating for that job."
- If a tool returns status:"not_registered", explain there is no worker account for their number and
  offer to register them — do not pretend to read their data.
- If a tool returns status:"needs_disambiguation", read out the choices and ask which job they mean.
- BEFORE any write (availability, profile change, registration, job status), read the exact details
  back and ask for a yes: "Got it — you're [Name], [an Electrician], available [Tomorrow] from [9 AM] to [5 PM]. Shall I save that?" Only skip that
  question if the worker has already said yes to those same details earlier in this call. Never save
  something they have not agreed to.
- If a tool returns status:"confirmation_required", NOTHING has been saved. Read the details in its
  message back to the worker and ask them to confirm. Do not tell them it is done. When they say yes,
  call the same tool again with the same values plus confirmed:true. If they change a detail, use the
  new value and confirm again.
- AFTER EVERY SUCCESSFUL WORKER REGISTRATION OR UPDATE, YOU MUST EXPLICITLY CONFIRM THE UPDATED DETAILS TO THE WORKER:
  * For new worker registration + availability: "Done. Your worker profile has been registered as an [trade] and your availability has been saved for [day] from [start] to [end]."
  * For availability change only: "Done. Your availability has been updated to [day], [start] to [end]."
  * For profession change: "Done. Your profession has been updated to [trade]."
- For writes, only say "Done" when the result has persisted:true. If persisted is false, say plainly
  that it did not save. If persisted is true but firebase.ok is false, their change IS saved — tell
  them it is saved. Do not read out technical causes; a worker on a phone call does not need to hear
  about Firestore, APIs, projects or cloud sync. Never say the words Firebase, Firestore, database,
  API, sync or server to a worker.
- Never guess missing details. No availability without both a start and an end time; ask for what is
  missing, and if the worker doesn't answer, ask once more.
- Tolerate speech-to-text noise, but confirm genuine ambiguity: "6 to 5" -> "Just to confirm, 6 AM to 5 PM?"
- Handle changes of mind mid-call: "Actually make it 10 to 6" replaces the number they just gave.
- Pass day labels ("Today", "Tomorrow", a weekday name) to tools, not calendar dates.

IF THE REQUEST IS UNCLEAR: ask ONE short clarifying question and keep the thread.
  "Can I change it?" -> "Sure. What would you like to change?"
  "Tomorrow." -> "Do you want to change your availability for tomorrow?"
  "Yes." -> "What hours would you like?"
This is a conversation, not a questionnaire. Use the earlier turns of this call to fill in the
subject the worker left out.

IF THE REQUEST HAS NOTHING TO DO WITH GIGSYNC: redirect politely, once —
  "I'm here to help with your GigSync work, bookings, availability and account. What would you like help with?"
Never dress up an unrelated answer as a GigSync answer.`;

        const customerBrief = `YOU ARE HELPING A CUSTOMER looking for a skilled worker.
- Searching for a trade ("I need an electrician tomorrow", "Nanage electrician beku") -> findWorkers.
  Never call updateWorkerAvailability for a customer.
- Booking a worker -> createJob, after confirming the details back to them.
- "What have I booked?" -> getCustomerBookings. "Cancel my booking" -> cancelJob.
- Available services -> getServices.
- Only describe workers, prices and slots that a tool actually returned. If nothing is available in
  their city for that day, say exactly that instead of inventing an option.`;

        const systemInstruction = `You are GigSync AI, the single conversational brain behind GigSync — a hyperlocal
marketplace for skilled workers in Tier-2 and Tier-3 Karnataka cities (Ramanagara, Kanakapura,
Channapatna, Bengaluru, Mysuru, Bidadi, Magadi).

${identityBlock}

${isWorkerCall ? workerBrief : customerBrief}

STYLE: you are being spoken aloud over a phone line. One or two short sentences. Plain spoken
English (a little Kannada/Hindi is fine if the caller uses it). No lists, no markdown, no emoji.
When the caller says thanks or goodbye, reply warmly and let the call end.`;

        try {
            // Format history for Gemini API
            const contents = [];
            for (const h of session.history.slice(-8)) {
                contents.push({
                    role: h.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: h.text }]
                });
            }
            if (contents.length === 0 || contents[contents.length - 1].parts[0].text !== text) {
                contents.push({
                    role: 'user',
                    parts: [{ text }]
                });
            }

            const actionsPerformed = [];
            let toolExecuted = null;
            let toolResult = null;
            let shouldEndCall = false;

            // Gemini Function Calling Loop (up to 6 tool turns — a single question can need
            // several lookups, e.g. "who is my next customer and how much do they owe me")
            for (let step = 0; step < 6; step++) {
                const response = await this.generateWithFallback(client, {
                    contents,
                    config: {
                        systemInstruction,
                        tools: [{ functionDeclarations: GEMINI_TOOLS_DECLARATIONS }]
                    }
                });

                const candidate = response.candidates && response.candidates[0];
                if (!candidate || !candidate.content) break;

                const parts = candidate.content.parts || [];
                const functionCallPart = parts.find(p => p.functionCall);

                if (functionCallPart && functionCallPart.functionCall) {
                    const call = functionCallPart.functionCall;
                    toolExecuted = call.name;
                    const args = call.args || {};

                    // Default contextual arguments
                    if (!args.city) args.city = session.city;
                    if (!args.customerPhone) args.customerPhone = session.callerPhone;
                    if (!args.customerName) args.customerName = session.callerName;

                    // Identity is taken from the verified session, not from the transcript, so a
                    // mis-heard or spoken phone number can never read or edit someone else's record.
                    if (SELF_SCOPED_WORKER_TOOLS.has(call.name)) {
                        args.workerPhone = session.callerPhone;
                    } else if (!args.workerPhone) {
                        args.workerPhone = session.callerPhone;
                    }

                    // Execute tool from AI_TOOLS
                    if (typeof AI_TOOLS[call.name] === 'function') {
                        try {
                            toolResult = await AI_TOOLS[call.name](args);
                        } catch (toolErr) {
                            console.error(`[Gemini Engine] Tool '${call.name}' threw:`, toolErr.message);
                            toolResult = {
                                status: 'error',
                                persisted: false,
                                dataAvailable: false,
                                message: `The ${call.name} operation failed: ${toolErr.message}`
                            };
                        }
                        // Operator-facing audit line. The worker hears a plain spoken answer, so
                        // this is where a failed write or a failed cloud mirror has to become
                        // visible — otherwise nobody ever learns the sync is broken.
                        actionsPerformed.push(describeToolOutcome(call.name, toolResult));
                    } else {
                        toolResult = { status: 'error', message: `Unknown tool ${call.name}` };
                    }

                    // Append assistant function call and tool result to contents
                    contents.push(candidate.content);
                    contents.push({
                        role: 'user',
                        parts: [{
                            functionResponse: {
                                name: call.name,
                                response: { output: toolResult }
                            }
                        }]
                    });
                } else {
                    // Final text response generated
                    const spokenText = parts.map(p => p.text || '').join(' ').trim();

                    // Check for natural call closure
                    if (/goodbye|have a great day|have a good day|take care|bye|ಧನ್ಯವಾದ|ಶುಭ ದಿನ/i.test(spokenText) &&
                        /\b(thank you|bye|goodbye|thats all|that's all|nothing else|end call)\b/i.test(text.toLowerCase())) {
                        shouldEndCall = true;
                    }

                    return {
                        spokenResponse: spokenText,
                        toolExecuted,
                        toolResult,
                        actionsPerformed,
                        shouldEndCall,
                        modelUsed: this.lastModelUsed
                    };
                }
            }
        } catch (err) {
            // Do NOT hide this. When the brain is down the caller deserves to know, instead of
            // getting a scripted line that looks like a real answer.
            this.lastError = err.message || String(err);
            console.error(`[Gemini Engine] Brain unavailable across models [${this.modelChain.join(', ')}]:`, this.lastError);
            return null;
        }

        return null;
    }
}

const geminiBrain = new GeminiConversationalBrain();

// 2. Multi-Turn Session & Memory Manager
class ConversationSessionManager {
    constructor() {
        this.sessions = new Map();
    }

    getSession(sessionId, defaultData = {}) {
        const key = sessionId || defaultData.callerPhone || 'default_session';
        if (!this.sessions.has(key)) {
            this.sessions.set(key, {
                sessionId: key,
                callerPhone: defaultData.callerPhone || '9876543210',
                callerRole: defaultData.callerRole || 'customer',
                callerName: defaultData.callerName || 'User',
                city: defaultData.city || 'Ramanagara',
                history: [],
                context: {
                    pendingIntent: null,
                    currentService: null,
                    currentLocation: defaultData.city || 'Ramanagara',
                    currentDate: null,
                    currentTime: null,
                    lastFoundWorkers: [],
                    lastSelectedWorker: null,
                    pendingJobData: null
                },
                lastActivity: Date.now()
            });
        }

        const session = this.sessions.get(key);
        session.lastActivity = Date.now();
        if (defaultData.callerPhone) session.callerPhone = defaultData.callerPhone.replace(/\D/g, '');
        if (defaultData.city && !session.city) session.city = defaultData.city;
        if (defaultData.callerRole && (!session.callerRole || defaultData.callerRole !== 'customer')) {
            session.callerRole = defaultData.callerRole;
        }
        if (defaultData.callerName && (!session.callerName || defaultData.callerName !== 'User')) {
            session.callerName = defaultData.callerName;
        }
        return session;
    }

    addTurn(session, role, text) {
        session.history.push({ role, text, timestamp: new Date().toISOString() });
        // Keep last 16 turns to maintain sharp context
        if (session.history.length > 16) {
            session.history.shift();
        }
    }
}

const sessionManager = new ConversationSessionManager();

// 3. Location Entity Extractor
function extractLocationEntity(text, defaultCity = 'Ramanagara') {
    if (!text) return defaultCity;
    const lower = text.toLowerCase();

    // Specific city / neighborhood matching FIRST
    const locationMap = [
        { patterns: ['ramanagara', 'ramnagar', 'ರಾಮನಗರ'], city: 'Ramanagara' },
        { patterns: ['kanakapura', 'kanakpur', 'ಕನಕಪುರ'], city: 'Kanakapura' },
        { patterns: ['channapatna', 'channapatana', 'ಚನ್ನಪಟ್ಟಣ'], city: 'Channapatna' },
        { patterns: ['bengaluru', 'bangalore', 'ಬೆಂಗಳೂರು'], city: 'Bengaluru' },
        { patterns: ['mysuru', 'mysore', 'ಮೈಸೂರು'], city: 'Mysuru' },
        { patterns: ['vijaya nagar', 'vijayanagar', 'ವಿಜಯನಗರ'], city: 'Vijaya Nagar' },
        { patterns: ['bidadi', 'ಬಿದದಿ'], city: 'Bidadi' },
        { patterns: ['magadi', 'ಮಾಗಡಿ'], city: 'Magadi' },
        { patterns: ['mandya', 'ಮಂಡ್ಯ'], city: 'Mandya' },
        { patterns: ['hassan', 'ಹಾಸನ'], city: 'Hassan' },
        { patterns: ['tumakuru', 'tumkur', 'ತುಮಕೂರು'], city: 'Tumakuru' },
        { patterns: ['shivamogga', 'shimoga', 'ಶಿವಮೊಗ್ಗ'], city: 'Shivamogga' },
        { patterns: ['davangere', 'ದಾವಣಗೆರೆ'], city: 'Davangere' },
        { patterns: ['belagavi', 'belgaum', 'ಬೆಳಗಾವಿ'], city: 'Belagavi' },
        { patterns: ['hubballi', 'hubli', 'ಹುಬ್ಬಳ್ಳಿ'], city: 'Hubballi' },
        { patterns: ['kannur'], city: 'Kannur' },
        { patterns: ['kasaragod'], city: 'Kasaragod' }
    ];

    for (const item of locationMap) {
        for (const pat of item.patterns) {
            const regex = new RegExp(`\\b${pat}\\b`, 'i');
            if (regex.test(lower)) {
                return item.city;
            }
        }
    }

    // Relative / local location references (with boundary checking to avoid false substring matches like 'is there')
    if (/\b(near me|my current location|my location|current location|around here|locally)\b/i.test(lower)) {
        return defaultCity;
    }

    // Fallback: Check preposition patterns (e.g. "in Mysore", "near Bidadi", "at Vijaya Nagar")
    const prepMatch = text.match(/\b(?:in|at|near|around|for)\s+([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)?)\b/);
    if (prepMatch && !/^(today|now|tomorrow|morning|afternoon|evening|tonight|monday|saturday|sunday)$/i.test(prepMatch[1])) {
        return prepMatch[1].trim();
    }

    return defaultCity;
}

// 4. Entity & Trade Extractor
function extractTradeAndService(text) {
    if (!text) return null;
    const lower = text.toLowerCase();

    // Specific Multi-word trades first
    if (lower.includes('washing machine') || lower.includes('washer') || lower.includes('വാഷിംഗ് മെಷೀನ್')) {
        return 'Washing Machine Repair';
    }
    if (lower.includes('water purifier') || lower.includes('ro technician') || lower.includes('aquaguard') || lower.includes('kent ro') || lower.includes('water filter')) {
        return 'Water Purifier & RO Service';
    }
    if (lower.includes('tv technician') || lower.includes('television') || lower.includes('led tv') || lower.includes('smart tv') || lower.includes('screen repair') || lower.includes('ಟಿವಿ')) {
        return 'TV & Electronics Repair';
    }
    if (lower.includes('refrigerator') || lower.includes('fridge') || lower.includes('deep freezer')) {
        return 'Refrigerator Repair';
    }
    if (lower.includes('ac technician') || lower.includes('air conditioner') || lower.includes('split ac') || lower.includes('ac repair') || lower.includes('cooler')) {
        return 'AC & Appliances';
    }
    if (lower.includes('bike mechanic') || lower.includes('two wheeler') || lower.includes('scooter') || lower.includes('motorcycle') || lower.includes('puncture') || lower.includes('bike repair')) {
        return 'Mechanics';
    }
    if (lower.includes('pipe leakage') || lower.includes('leakage repair') || lower.includes('pipe repair') || lower.includes('leaking tap') || lower.includes('tap leak')) {
        return 'Plumbing';
    }

    // Single-word / Core Trade matchers (including common speech-to-text mishears & phonetic variants)
    if (lower.includes('electric') || lower.includes('cliteration') || lower.includes('literation') || lower.includes('elctric') || lower.includes('lectrition') || lower.includes('electritian') || lower.includes('electrition') || lower.includes('electrishan') || lower.includes('fan') || lower.includes('switch') || lower.includes('wire') || lower.includes('current') || lower.includes('power') || lower.includes('bulb') || lower.includes('ಎಲೆಕ್ಟ್ರಿಷಿಯನ್')) {
        return 'Electrical';
    }
    if (lower.includes('plumb') || lower.includes('plamber') || lower.includes('plamer') || lower.includes('pipe') || lower.includes('tap') || lower.includes('leak') || lower.includes('drain') || lower.includes('water') || lower.includes('ಪ್ಲಂಬರ್') || lower.includes('ನೀರು')) {
        return 'Plumbing';
    }
    if (lower.includes('carpenter') || lower.includes('carpanter') || lower.includes('carpnter') || lower.includes('wood') || lower.includes('door') || lower.includes('window') || lower.includes('furniture') || lower.includes('lock') || lower.includes('ಕಾರ್ಪೆಂಟರ್') || lower.includes('ಮರಗೆಲಸ')) {
        return 'Carpentry';
    }
    if (lower.includes('mason') || lower.includes('masonry') || lower.includes('brick') || lower.includes('plaster') || lower.includes('cement') || lower.includes('tile') || lower.includes('ಮೇಸ್ತ್ರಿ') || lower.includes('ಕಟ್ಟಡ')) {
        return 'Masonry & Construction';
    }
    if (lower.includes('tailor') || lower.includes('tailoring') || lower.includes('stitch') || lower.includes('alteration') || lower.includes('blouse') || lower.includes('dressmaker') || lower.includes('ಟೈಲರ್')) {
        return 'Tailoring & Alterations';
    }
    if (lower.includes('welder') || lower.includes('welding') || lower.includes('grill') || lower.includes('fabrication') || lower.includes('metal') || lower.includes('iron gate') || lower.includes('ವೆಲ್ಡರ್')) {
        return 'Welding & Metalwork';
    }
    if (lower.includes('driver') || lower.includes('driving') || lower.includes('chauffeur') || lower.includes('cab driver') || lower.includes('car driver') || lower.includes('ಡ್ರೈವರ್')) {
        return 'Driver Services';
    }
    if (lower.includes('mechanic') || lower.includes('mecanic') || lower.includes('makanic') || lower.includes('breakdown') || lower.includes('engine') || lower.includes('ಮೇಕಾನಿಕ್')) {
        return 'Mechanics';
    }
    if (lower.includes('clean') || lower.includes('maid') || lower.includes('sweep') || lower.includes('wash') || lower.includes('deep clean') || lower.includes('ಕ್ಲೀನಿಂಗ್')) {
        return 'Home Cleaning';
    }
    if (lower.includes('paint') || lower.includes('painter') || lower.includes('whitewash') || lower.includes('wall paint') || lower.includes('ಬಣ್ಣ')) {
        return 'Painting';
    }

    return null;
}

// 5. Extract Date & Time Entities
function extractDateTimeEntities(text) {
    if (!text) return { date: 'Today', time: 'Immediate' };
    const lower = text.toLowerCase();
    let date = null;
    let time = null;

    // Date Matching
    if (lower.includes('tomorrow morning')) {
        date = 'Tomorrow';
        time = 'Morning (10:00 AM)';
    } else if (lower.includes('tomorrow afternoon')) {
        date = 'Tomorrow';
        time = 'Afternoon (02:00 PM)';
    } else if (lower.includes('tomorrow evening')) {
        date = 'Tomorrow';
        time = 'Evening (05:00 PM)';
    } else if (lower.includes('this morning')) {
        date = 'Today';
        time = 'Morning (10:00 AM)';
    } else if (lower.includes('this afternoon')) {
        date = 'Today';
        time = 'Afternoon (02:00 PM)';
    } else if (lower.includes('this evening')) {
        date = 'Today';
        time = 'Evening (05:00 PM)';
    } else if (lower.includes('tonight') || lower.includes('this night')) {
        date = 'Today';
        time = 'Night (08:00 PM)';
    } else if (lower.includes('next monday') || lower.includes('next week monday')) {
        date = 'Next Monday';
    } else if (lower.includes('saturday') || lower.includes('shanivara')) {
        date = 'Saturday';
    } else if (lower.includes('sunday') || lower.includes('bhanuvara')) {
        date = 'Sunday';
    } else if (lower.includes('monday') || lower.includes('somavara')) {
        date = 'Monday';
    } else if (lower.includes('tomorrow') || lower.includes('naale') || lower.includes('ನಾಳೆ') || lower.includes('kal')) {
        date = 'Tomorrow';
    } else if (lower.includes('today') || lower.includes('now') || lower.includes('immediately') || lower.includes('urgent') || lower.includes('ivathu') || lower.includes('ಇವತ್ತು') || lower.includes('aaj')) {
        date = 'Today';
        if (lower.includes('now') || lower.includes('immediately') || lower.includes('urgent')) {
            time = 'Immediate';
        }
    }

    // Time Window / Range Matching
    if (lower.includes('from 9 am to 4 pm') || lower.includes('9 am to 4 pm') || lower.includes('9 to 4')) {
        time = '09:00 AM – 04:00 PM';
    } else if (lower.includes('after 5 pm') || lower.includes('post 5 pm') || lower.includes('evening after 5')) {
        time = 'After 05:00 PM';
    } else if (!time) {
        if (lower.includes('morning') || lower.includes('beligge') || lower.includes('ಬೆಳಿಗ್ಗೆ') || lower.includes('subah')) {
            time = 'Morning (10:00 AM)';
        } else if (lower.includes('afternoon') || lower.includes('madhyahna') || lower.includes('dopahar')) {
            time = 'Afternoon (02:00 PM)';
        } else if (lower.includes('evening') || lower.includes('sanje') || lower.includes('shaam')) {
            time = 'Evening (05:00 PM)';
        } else {
            const timeMatch = text.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm|o'clock)?)/i);
            if (timeMatch && !text.match(/₹|\brupees\b/i)) {
                time = timeMatch[1];
            }
        }
    }

    return {
        date: date || 'Today',
        time: time || 'Immediate'
    };
}

// Helper to convert trade category to natural specialist noun (e.g. Electrical -> an electrician)
function getTradePersonNoun(tradeCategory) {
    if (!tradeCategory) return 'a specialist';
    const t = tradeCategory.toLowerCase();
    if (t.includes('electr')) return 'an electrician';
    if (t.includes('plumb')) return 'a plumber';
    if (t.includes('carpent')) return 'a carpenter';
    if (t.includes('mechanic')) return 'a mechanic';
    if (t.includes('paint')) return 'a painter';
    if (t.includes('mason')) return 'a mason';
    if (t.includes('tailor')) return 'a tailor';
    if (t.includes('weld')) return 'a welder';
    if (t.includes('driver')) return 'a driver';
    if (t.includes('clean')) return 'a cleaning specialist';
    if (t.includes('tv') || t.includes('electronic')) return 'a TV repair specialist';
    if (t.includes('purifier') || t.includes('ro')) return 'a water purifier technician';
    if (t.includes('washing')) return 'a washing machine technician';
    if (t.includes('refrigerat') || t.includes('fridge')) return 'a refrigerator technician';
    if (t.includes('ac ') || t.includes('appliance')) return 'an appliance technician';
    return `a ${tradeCategory}`;
}

// Helper to extract start and end time range from natural utterances
function extractTimeRange(text) {
    if (!text) return { startTime: '09:00 AM', endTime: '05:00 PM', startDisplay: '9 AM', endDisplay: '5 PM' };
    const lower = text.toLowerCase();

    // Match "10 in the morning until 6", "10 in the morning to 6 in the evening", etc.
    if (lower.includes('in the morning') && (lower.includes('until') || lower.includes('to') || lower.includes('till'))) {
        const m = lower.match(/(\d{1,2})\s*in the morning\s*(?:until|to|till)\s*(\d{1,2})/);
        if (m) {
            let sVal = parseInt(m[1]);
            let eVal = parseInt(m[2]);
            let sAmPm = 'AM';
            let eAmPm = (eVal <= 11) ? 'PM' : 'AM';
            const startTime = `${sVal < 10 ? '0' + sVal : sVal}:00 ${sAmPm}`;
            const endTime = `${eVal < 10 ? '0' + eVal : eVal}:00 ${eAmPm}`;
            return { startTime, endTime, startDisplay: `${sVal} ${sAmPm}`, endDisplay: `${eVal} ${eAmPm}` };
        }
    }

    // Match "free today evening", "this evening", "evening"
    if (lower.includes('evening') && !lower.match(/\d/)) {
        return { startTime: '05:00 PM', endTime: '09:00 PM', startDisplay: '5 PM', endDisplay: '9 PM' };
    }
    if (lower.includes('morning') && !lower.match(/\d/)) {
        return { startTime: '09:00 AM', endTime: '01:00 PM', startDisplay: '9 AM', endDisplay: '1 PM' };
    }
    if (lower.includes('afternoon') && !lower.match(/\d/)) {
        return { startTime: '01:00 PM', endTime: '05:00 PM', startDisplay: '1 PM', endDisplay: '5 PM' };
    }

    // Match variations: "6 to 5", "11 to 5", "11 to 5 o'clock", "11 am till 5 pm", "11 inda 5 varege", "from 11:00 to 17:00", etc.
    const rangeMatch = text.match(/(\d{1,2}(?::\d{2})?)\s*(?:am|pm|in the morning|in the evening)?\s*(?:to|till|until|inda|inda\s*te|\-)\s*(\d{1,2}(?::\d{2})?)\s*(?:am|pm|o'clock|varege|in the evening|in the afternoon)?/i);

    if (rangeMatch) {
        let sStr = rangeMatch[1];
        let eStr = rangeMatch[2];

        let sVal = parseInt(sStr);
        let eVal = parseInt(eStr);

        // Typical Indian trade shift heuristics: 5 to 11 is AM, 12 is PM, 1 to 4 is PM, 6 with eVal 5 is 6 AM to 5 PM
        let sAmPm = (sVal >= 5 && sVal <= 11) ? 'AM' : ((sVal === 12 || (sVal >= 1 && sVal <= 4)) ? 'PM' : 'AM');
        let eAmPm = (eVal >= 1 && eVal <= 11) ? 'PM' : ((eVal === 12) ? 'PM' : 'AM');
        if (sVal === 12) sAmPm = 'PM';

        if (lower.includes(sStr + ' am') || lower.includes(sStr + 'am') || lower.includes(sStr + ' in the morning')) sAmPm = 'AM';
        if (lower.includes(sStr + ' pm') || lower.includes(sStr + 'pm') || lower.includes(sStr + ' in the afternoon') || lower.includes(sStr + ' in the evening')) sAmPm = 'PM';
        if (lower.includes(eStr + ' am') || lower.includes(eStr + 'am')) eAmPm = 'AM';
        if (lower.includes(eStr + ' pm') || lower.includes(eStr + 'pm') || lower.includes(eStr + ' in the evening') || lower.includes(eStr + ' in the afternoon')) eAmPm = 'PM';

        const startTime = `${sVal < 10 ? '0' + sVal : sVal}:00 ${sAmPm}`;
        const endTime = `${eVal < 10 ? '0' + eVal : eVal}:00 ${eAmPm}`;
        const startDisplay = `${sVal} ${sAmPm}`;
        const endDisplay = `${eVal} ${eAmPm}`;

        return { startTime, endTime, startDisplay, endDisplay };
    }

    return { startTime: '09:00 AM', endTime: '05:00 PM', startDisplay: '9 AM', endDisplay: '5 PM' };
}

// Helper to extract 10-digit Indian phone number from utterance
function extractPhoneNumber(text) {
    if (!text) return null;
    
    // 1. Convert spoken digit words to numbers if present
    const wordToDigit = {
        zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
        six: '6', seven: '7', eight: '8', nine: '9'
    };
    const normalized = text.toLowerCase().replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine)\b/g, m => wordToDigit[m]);

    // 2. Extract digits only from the utterance
    const digitsOnly = normalized.replace(/\D/g, '');

    // 3. Match 10-digit mobile number with or without +91 / 91 / 0 prefix
    if (digitsOnly.length === 12 && digitsOnly.startsWith('91') && /^[6-9]/.test(digitsOnly.slice(2))) {
        return digitsOnly.slice(2);
    }
    if (digitsOnly.length === 11 && digitsOnly.startsWith('0') && /^[6-9]/.test(digitsOnly.slice(1))) {
        return digitsOnly.slice(1);
    }
    if (digitsOnly.length === 10 && /^[6-9]/.test(digitsOnly)) {
        return digitsOnly;
    }
    
    // If digitsOnly contains a 10-digit substring starting with 6-9
    const subMatch = digitsOnly.match(/[6-9]\d{9}/);
    if (subMatch) {
        return subMatch[0];
    }

    return null;
}

// Helper to extract caller's stated name (e.g. "My name is Rajesh", "This is Rajesh")
function extractCallerName(text) {
    if (!text) return null;
    const match = text.match(/\b(?:my name is|name is|i am|i'm|this is|call me|hesaru|ಹೆಸರು)\s+([A-Za-z]+)\b/i);
    if (match) {
        const candidate = match[1].trim();
        const nonNames = ['a', 'an', 'the', 'electrician', 'plumber', 'carpenter', 'mechanic', 'available', 'free', 'not', 'looking', 'here', 'calling', 'user', 'there', 'from', 'in', 'on', 'at', 'today', 'tomorrow', 'naale', 'ivathu'];
        if (!nonNames.includes(candidate.toLowerCase()) && candidate.length >= 2) {
            return candidate.charAt(0).toUpperCase() + candidate.slice(1).toLowerCase();
        }
    }
    return null;
}

// Helper to identify whether caller is self-identifying as a worker or providing worker availability
function isWorkerIntent(text, currentRole = 'customer') {
    if (!text) return false;
    const lower = text.toLowerCase();

    // Inquiries asking about current availability or schedule are questions, not availability declarations
    if (/\b(?:am i available|am i free|check my availability|my working hours|what are my hours|what jobs|who is my next|where is my next|how much did i earn|what are my details|what is my profile)\b/i.test(lower)) {
        return false;
    }

    // Customer explicit inquiries or search requests (English / Kannada)
    if (/\b(?:which|who|find|search|need|looking for|look for|want to hire|can you|send me|book me|beku|ಬೇಕು|is there|are there|how many|show me specialists|show me workers)\b/i.test(lower)) {
        return false;
    }
    if (/\b(?:nanage|ನನಗೆ)\b/i.test(lower) && /\b(?:beku|ಬೇಕಾಗಿದೆ|ಬೇಕು)\b/i.test(lower)) {
        return false;
    }

    // Direct worker self-identification & availability statements in English / Kannada / Kanglish
    const selfIdPatterns = [
        /\b(?:i am|i'm|myself|i work as|naanu|ನಾನು|naan)\s+(?:an?|a registered|a skilled)?\s*(?:electrician|plumber|carpenter|mechanic|painter|technician|mason|tailor|welder|driver|specialist|cliteration|literation|electritian|electrition|electrishan|ಎಲೆಕ್ಟ್ರಿಷಿಯನ್|ಪ್ಲಂಬರ್|ಕಾರ್ಪೆಂಟರ್|ಮೆಕ್ಯಾನಿಕ್)\b/i,
        /\b(?:my name is|name is|this is|hesaru|ಹೆಸರು)\s+[a-z]+\s+(?:and\s+)?(?:i am|i'm|i work as|naanu)\s+(?:an?|a)?\s*(?:electrician|plumber|carpenter|mechanic|painter|technician|mason|tailor|welder|driver)\b/i,
        /\b(?:my name is|name is|this is)\s+[a-z]+\s+(?:and\s+)?(?:i'm\s+available|i am\s+available|available)\b/i,
        /\b(?:i am|i'm|myself|iddini|ಇದ್ದೇನೆ)\s+(?:available|free|on duty|off duty|labhyaviddini|ಲಭ್ಯ)\s+(?:from|for|today|tomorrow|naale|ivathu|now|between|till|after|\d)\b/i,
        /\b(?:wanted to work|want to work|ready to work|kelasa madalu|kelasa madbeku|i wanted to work|i want to work)\b/i,
        /\b(?:my availability|my schedule|my working hours|my shift|nanna availability|nanna schedule)\s+(?:is|for|from|to|inda)\b/i,
        /\b(?:set|update|change|mark|add)\s+(?:my\s+|tomorrow's\s+|today's\s+)?(?:availability|schedule|timing|shift|hours)\b/i,
        /\b(?:i can work|i will be available|i am not available|i won't be available|i will work|add me as available)\b/i,
        /\b(?:register me|add me|sign me up|join as worker|i am a new worker|new worker|register as worker|add me as|i want to register|i would like to add me|add me a|add me an)\b/i,
        /\b(?:my number is|my phone is|phone number is)\s*[\d\s]+\b/i,
        /\b(?:free today|free tomorrow|available today|available tomorrow)\b/i,
        /\b(?:not available on|make me unavailable|cancel my availability|cancel availability|not available)\b/i,
        /\b(?:inda|ರಿಂದ)\s+\d{1,2}\s*(?:to|till|varege|ವರೆಗೆ)\s+\d{1,2}\s*(?:available|iddini|ಇದ್ದೇನೆ)\b/i
    ];

    for (const pat of selfIdPatterns) {
        if (pat.test(lower)) return true;
    }

    // Contextual follow-up if caller is already identified as a worker
    if (currentRole === 'worker') {
        if (/\b(?:available|free|from \d|to \d|\d to \d|tomorrow too|saturday too|sunday too|off duty|on duty|leave|varege|inda)\b/i.test(lower)) {
            if (!/\b(?:which|who|find|search|need|look for|book|hire|get me|send me|beku|ಬೇಕು|am i|check)\b/i.test(lower)) {
                return true;
            }
        }
    }

    return false;
}

// Helper for slot-filling worker registration and availability without guessing
function evaluateWorkerDraft(session, text, actionsPerformed) {
    session.context.workerDraft = session.context.workerDraft || {
        name: null,
        phone: (session.callerPhone && /^[6-9]\d{9}$/.test(session.callerPhone)) ? session.callerPhone : null,
        trade: null,
        date: null,
        startTime: null,
        endTime: null,
        startDisplay: null,
        endDisplay: null,
        hasAvailability: false
    };

    const draft = session.context.workerDraft;

    if (!draft.phone && session.callerPhone && /^[6-9]\d{9}$/.test(session.callerPhone)) {
        draft.phone = session.callerPhone;
    }

    const existingWorker = draft.phone ? DB.getWorkerByPhone(draft.phone) : null;
    if (existingWorker) {
        if (!draft.name) draft.name = existingWorker.name;
        if (!draft.trade) draft.trade = existingWorker.trade;
    }

    if (!draft.name) {
        session.context.pendingIntent = 'AWAITING_WORKER_NAME';
        actionsPerformed.push('Prompted worker for missing name');
        return `Sure. What is your name?`;
    }

    if (!draft.trade) {
        session.context.pendingIntent = 'AWAITING_WORKER_TRADE';
        actionsPerformed.push('Prompted worker for missing trade');
        return draft.name ? `Hello ${draft.name}. What type of work do you do?` : `What type of work do you do?`;
    }

    if (!draft.phone || !/^[6-9]\d{9}$/.test(draft.phone)) {
        session.context.pendingIntent = 'AWAITING_WORKER_PHONE';
        actionsPerformed.push('Prompted worker for missing phone');
        return draft.name ? `Thank you, ${draft.name}. What is your 10-digit mobile number?` : `What is your 10-digit mobile number?`;
    }

    if (!draft.hasAvailability) {
        session.context.pendingIntent = 'AWAITING_WORKER_AVAILABILITY';
        actionsPerformed.push('Prompted worker for missing availability');
        return `What hours are you available?`;
    }

    // All 5 fields present!
    const tradeNoun = getTradePersonNoun(draft.trade).replace(/^(an?)\s+/i, '');
    const article = /^[aeiou]/i.test(tradeNoun) ? 'an' : 'a';
    session.context.pendingIntent = 'CONFIRM_UPDATE_AVAILABILITY';
    session.context.pendingAvailabilityData = {
        workerId: existingWorker ? existingWorker.id : null,
        name: draft.name,
        phone: draft.phone,
        trade: draft.trade,
        tradeNoun: tradeNoun,
        date: draft.date,
        startTime: draft.startTime,
        endTime: draft.endTime,
        startDisplay: draft.startDisplay,
        endDisplay: draft.endDisplay,
        isAvailable: true,
        updateType: (!existingWorker ? 'REGISTRATION_AND_AVAILABILITY' : 'MULTIPLE_DETAILS')
    };
    actionsPerformed.push(`Prepared complete worker details for confirmation`);

    if (!existingWorker) {
        return `Got it. You are ${draft.name}, ${article} ${tradeNoun}, and you are available ${draft.date.toLowerCase()} from ${draft.startDisplay} to ${draft.endDisplay}. Would you like me to register you as a GigSync worker?`;
    } else {
        return `Got it. You are ${draft.name}, ${article} ${tradeNoun}, available ${draft.date.toLowerCase()} from ${draft.startDisplay} to ${draft.endDisplay}. Shall I save these details?`;
    }
}

// 5. Intelligent Multi-Turn Conversational Processor
class ContextAwareVoiceAgent {
    async processTurn(optsOrSession, maybeText) {
        return this.processCallTurn(optsOrSession, maybeText);
    }

    async processCallTurn(optsOrSession, maybeText) {
        let sessionId, callerPhone, callerRole, callerName, city, speechText;

        if (typeof optsOrSession === 'string' && typeof maybeText === 'string') {
            sessionId = optsOrSession;
            speechText = maybeText;
        } else if (optsOrSession && typeof optsOrSession === 'object' && typeof maybeText === 'string') {
            sessionId = optsOrSession.sessionId || optsOrSession.callerPhone || 'default_session';
            callerPhone = optsOrSession.callerPhone;
            callerRole = optsOrSession.callerRole || 'customer';
            callerName = optsOrSession.callerName || 'User';
            city = optsOrSession.city || 'Ramanagara';
            speechText = maybeText;
        } else if (optsOrSession && typeof optsOrSession === 'object') {
            sessionId = optsOrSession.sessionId || optsOrSession.callerPhone || 'default_session';
            callerPhone = optsOrSession.callerPhone;
            callerRole = optsOrSession.callerRole || 'customer';
            callerName = optsOrSession.callerName || 'User';
            city = optsOrSession.city || 'Ramanagara';
            speechText = optsOrSession.speechText || optsOrSession.text || '';
        } else {
            speechText = String(optsOrSession || '');
        }

        const text = (speechText || '').trim();
        const lower = text.toLowerCase();

        // 1. Extract dynamic location from utterance (or fallback to session default city)
        const targetCity = extractLocationEntity(text, city || 'Ramanagara');

        // 2. Get or create session context
        const session = (optsOrSession && optsOrSession.context && optsOrSession.history)
            ? optsOrSession
            : sessionManager.getSession(sessionId, { callerPhone, callerRole, callerName, city: targetCity });
        
        session.city = targetCity;
        session.context.currentLocation = targetCity;
        sessionManager.addTurn(session, 'user', text);

        let spokenResponse = '';
        let toolExecuted = null;
        let toolResult = null;
        let detectedIntent = 'unknown';
        let extractedEntities = {};
        let aiBrainAttempted = false;
        let aiBrainError = null;
        const actionsPerformed = [];

        actionsPerformed.push(`Identified ${session.callerRole} (${session.callerName})`);

        // Helper to deduplicate repeated speech strings from noisy STT
        function cleanUtterance(str) {
            if (!str) return '';
            return str
                .replace(/\b(\w+(?:\s+\w+){1,4})\s+\1\b/gi, '$1')
                .replace(/\b(\w+)\s+\1\b/gi, '$1')
                .trim();
        }

        const cleanedInput = cleanUtterance(text);
        const lowerCleaned = cleanedInput.toLowerCase();

        const isAffirmative = /\b(yes|yeah|yep|sure|ok|okay|confirm|post it|please post|post|go ahead|book him|book it|book|ha|haan|houdu|ಹೌದು|sari|ಸರಿ|do it|save it|save that|save this|save|please save|please add|add to worker|please add to worker|add it|add me|confirm that|yes save it|yes do it|yes please)\b/i.test(lowerCleaned) ||
            /^(add|save|yes please|ha|sari|houdu|save that|save it|do it|okay|ok)$/i.test(lowerCleaned.trim());
        const isNegative = /\b(no|nope|cancel|cancel it|don't|beda|ಬೇಡ|nahi)\b/i.test(lowerCleaned);
        const isShortNegation = /^(no|nope|no thanks|no thank you|nothing else|nothing more|nothing|thats all|that's all|beda|ಬೇಡ|nahi)\b/i.test(lowerCleaned);

        let shouldEndCall = false;

        // ======================================================================
        // A. ADVERSARIAL, SAFETY, PRIVACY & AUTHORIZATION GUARDS (HIGHEST PRIORITY)
        // ======================================================================

        // 1. Refuse Hallucination / Fabrication Requests
        if (/\b(invent|make up|fabricate|fake|dummy|create a fake|imagine|pretend|generate a fake)\b.*?\b(worker|plumber|electrician|carpenter|mechanic|specialist|technician|customer|booking|review|rating|profile|price|schedule|earnings|person)\b/i.test(lowerCleaned) ||
            /\b(invent\s+(a\s+)?worker|fake\s+worker|make\s+up\s+a\s+worker|invent\s+a\s+person|invent\s+a\s+fake)\b/i.test(lowerCleaned)) {
            spokenResponse = `GigSync strictly connects you with real, verified trade specialists registered in our active database. I cannot fabricate, invent, or create simulated workers, bookings, or ratings.`;
            actionsPerformed.push(`Refused data fabrication request`);
        }

        // 2. Refuse Privacy & Private Data Disclosures
        else if (/\b(another customer|other customer|other user|worker's private|worker private|customer's phone|customer phone|home address|personal details|private info|private data|secret|password)\b/i.test(lowerCleaned) ||
                 /\b(show me another|tell me a worker's private|what is customer|give me customer)\b/i.test(lowerCleaned)) {
            spokenResponse = `For privacy and data security, GigSync cannot disclose private customer contact details, personal addresses, or confidential worker information.`;
            actionsPerformed.push(`Refused privacy disclosure request`);
        }

        // 3. Refuse Unauthorized Security & Administrative Commands
        else if (/\b(drop table|delete from|truncate|eval\(|database password|bypass auth|admin access|master admin password)\b/i.test(lowerCleaned)) {
            spokenResponse = `Access denied. Administrative operations require authorized Master Admin authentication credentials.`;
            actionsPerformed.push(`Refused unauthorized admin command`);
        }

        // ======================================================================
        // B. PRIMARY GEMINI API CLOUD BRAIN (CALLED FOR ALL LIVE CONVERSATION TURNS)
        // ======================================================================
        else if (process.env.GEMINI_API_KEY || geminiBrain.getClient()) {
            aiBrainAttempted = true;
            try {
                const geminiTurn = await geminiBrain.processTurn({ session, text });
                if (geminiTurn && geminiTurn.spokenResponse) {
                    spokenResponse = geminiTurn.spokenResponse;
                    toolExecuted = geminiTurn.toolExecuted;
                    toolResult = geminiTurn.toolResult;
                    shouldEndCall = geminiTurn.shouldEndCall;
                    if (Array.isArray(geminiTurn.actionsPerformed)) {
                        actionsPerformed.push(...geminiTurn.actionsPerformed);
                    }
                } else {
                    aiBrainError = geminiBrain.lastError || 'The AI brain returned no response.';
                }
            } catch (geminiErr) {
                aiBrainError = geminiErr.message;
                console.error('[Gemini Voice Agent] Brain failed, using deterministic engine:', geminiErr.message);
            }
        }

        // ======================================================================
        // C. DETERMINISTIC OFFLINE RULES & DATABASE ENGINE (FALLBACK ONLY)
        // ======================================================================
        if (!spokenResponse) {
            // C.1 Multi-Turn Pending Confirmations & Slot-Filling Responses
            if (session.context.pendingIntent === 'AWAITING_WORKER_NAME') {
                detectedIntent = 'provide_worker_name';
                session.context.workerDraft = session.context.workerDraft || {};
                const candidateName = extractCallerName(text) || text.replace(/^(my name is|name is|i am|i'm|it's|its|this is|call me|hesaru|ಹೆಸರು)\s+/i, '').trim().replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/)[0];
                if (candidateName && candidateName.length >= 2 && !['yes', 'no', 'ok', 'okay', 'sure', 'ha'].includes(candidateName.toLowerCase())) {
                    session.context.workerDraft.name = candidateName.charAt(0).toUpperCase() + candidateName.slice(1).toLowerCase();
                    session.context.pendingIntent = null;
                    spokenResponse = evaluateWorkerDraft(session, text, actionsPerformed);
                } else {
                    spokenResponse = `Sorry, I didn't catch that. What is your name?`;
                    actionsPerformed.push('Requested name again');
                }
            }

            else if (session.context.pendingIntent === 'AWAITING_WORKER_TRADE') {
                detectedIntent = 'provide_worker_trade';
                session.context.workerDraft = session.context.workerDraft || {};
                const candidateTrade = extractTradeAndService(text);
                if (candidateTrade) {
                    session.context.workerDraft.trade = candidateTrade;
                    session.context.pendingIntent = null;
                    spokenResponse = evaluateWorkerDraft(session, text, actionsPerformed);
                } else {
                    spokenResponse = `I still need to know your type of work. Are you an electrician, plumber, carpenter, or another type of worker?`;
                    actionsPerformed.push('Clarified trade with suggestions');
                }
            }

            else if (session.context.pendingIntent === 'AWAITING_WORKER_PHONE') {
                detectedIntent = 'provide_worker_phone';
                session.context.workerDraft = session.context.workerDraft || {};
                const candidatePhone = extractPhoneNumber(text) || text.replace(/\D/g, '');
                if (candidatePhone && candidatePhone.length === 10) {
                    session.context.workerDraft.phone = candidatePhone;
                    session.callerPhone = candidatePhone;
                    session.context.pendingIntent = null;
                    spokenResponse = evaluateWorkerDraft(session, text, actionsPerformed);
                } else {
                    spokenResponse = `I need your 10-digit mobile number. Please say it again.`;
                    actionsPerformed.push('Requested 10-digit phone number again');
                }
            }

            else if (session.context.pendingIntent === 'AWAITING_WORKER_AVAILABILITY') {
                detectedIntent = 'provide_worker_availability';
                session.context.workerDraft = session.context.workerDraft || {};
                const hasAvail = text.match(/\d/) || /morning|evening|afternoon|today|tomorrow|naale/i.test(text);
                if (hasAvail) {
                    const range = extractTimeRange(text);
                    const { date } = extractDateTimeEntities(text);
                    session.context.workerDraft.date = date || 'Tomorrow';
                    session.context.workerDraft.startTime = range.startTime;
                    session.context.workerDraft.endTime = range.endTime;
                    session.context.workerDraft.startDisplay = range.startDisplay;
                    session.context.workerDraft.endDisplay = range.endDisplay;
                    session.context.workerDraft.hasAvailability = true;
                    session.context.pendingIntent = null;
                    spokenResponse = evaluateWorkerDraft(session, text, actionsPerformed);
                } else {
                    spokenResponse = `What hours are you available? For example, 9 AM to 5 PM tomorrow.`;
                    actionsPerformed.push('Requested hours again');
                }
            }

            else if (session.context.pendingIntent === 'CONFIRM_UPDATE_AVAILABILITY' && (isAffirmative || isNegative)) {
                detectedIntent = 'confirm_availability';
                if (isAffirmative && session.context.pendingAvailabilityData) {
                    const avail = session.context.pendingAvailabilityData;
                    const effectivePhone = avail.phone || session.callerPhone;

                    if (!effectivePhone || !/^[6-9]\d{9}$/.test(effectivePhone)) {
                        session.context.pendingIntent = 'AWAITING_WORKER_PHONE';
                        spokenResponse = avail.name ? `I need your 10-digit mobile number to complete registration, ${avail.name}. What is your phone number?` : `I need your 10-digit mobile number to complete registration. What is your phone number?`;
                        actionsPerformed.push('Prompted worker for missing 10-digit phone number');
                    } else {
                        if (avail.updateType === 'REGISTRATION_AND_AVAILABILITY' || avail.updateType === 'MULTIPLE_DETAILS') {
                            await AI_TOOLS.registerWorkerProfile({
                                name: avail.name || 'Worker',
                                phone: effectivePhone,
                                trade: avail.trade || 'Specialist',
                                city: session.city
                            });
                            actionsPerformed.push(`Registered/updated worker profile for ${avail.name || 'Worker'} (${avail.trade})`);
                        }

                        toolExecuted = 'updateWorkerAvailability';
                        toolResult = await AI_TOOLS.updateWorkerAvailability({
                            workerPhone: effectivePhone,
                            trade: avail.trade || 'Specialist',
                            date: avail.date,
                            startTime: avail.startTime,
                            endTime: avail.endTime,
                            isAvailable: avail.isAvailable !== false,
                            confirmed: true
                        });
                        
                        if (toolResult && toolResult.persisted) {
                            actionsPerformed.push(`Updated ${avail.date} availability (${avail.startTime} – ${avail.endTime}) in the database`);
                            if (toolResult.firebase && toolResult.firebase.ok === true) {
                                actionsPerformed.push('Mirrored the availability change to Firebase');
                            } else if (toolResult.firebase && toolResult.firebase.ok === false) {
                                actionsPerformed.push(`Firebase mirror failed: ${toolResult.firebase.message}`);
                            }
                        } else {
                            actionsPerformed.push(`Could not save ${avail.date} availability — the database write did not persist`);
                        }

                        if (toolResult && toolResult.persisted) {
                            const tradeNoun = (avail.tradeNoun || getTradePersonNoun(avail.trade)).replace(/^(an?)\s+/i, '');
                            if (avail.updateType === 'AVAILABILITY_ONLY') {
                                spokenResponse = `Done. Your availability has been updated to ${avail.date.toLowerCase()}, ${avail.startDisplay} to ${avail.endDisplay}.`;
                            } else if (avail.updateType === 'MULTIPLE_DETAILS') {
                                spokenResponse = `Done. Your worker profile and availability have been saved for ${avail.date.toLowerCase()} from ${avail.startDisplay} to ${avail.endDisplay}.`;
                            } else {
                                spokenResponse = `Done. Your worker profile has been registered and your availability has been saved for ${avail.date.toLowerCase()} from ${avail.startDisplay} to ${avail.endDisplay}.`;
                            }
                        } else {
                            spokenResponse = `Sorry, I couldn't update your details. Please tell me your 10-digit mobile number and available hours again.`;
                        }

                        session.context.pendingIntent = null;
                        session.context.pendingAvailabilityData = null;
                        session.context.workerDraft = null;
                        session.context.lastActionCompleted = 'AVAILABILITY_UPDATED';
                    }
                } else if (isNegative) {
                    spokenResponse = `No problem, I haven't saved this to your schedule. Let me know if you need anything else.`;
                    session.context.pendingIntent = null;
                    session.context.pendingAvailabilityData = null;
                    session.context.workerDraft = null;
                }
            }

            else if (session.context.pendingIntent === 'CONFIRM_UPDATE_PROFESSION' && (isAffirmative || isNegative)) {
                detectedIntent = 'confirm_update_profession';
                if (isAffirmative && session.context.pendingProfessionData) {
                    const prof = session.context.pendingProfessionData;
                    toolExecuted = 'registerWorkerProfile';
                    toolResult = await AI_TOOLS.registerWorkerProfile({
                        name: prof.name,
                        phone: prof.phone || session.callerPhone,
                        trade: prof.trade,
                        city: session.city
                    });
                    actionsPerformed.push(toolResult && toolResult.persisted
                        ? `Updated worker profession to ${prof.trade} in the database`
                        : `Could not update worker profession to ${prof.trade} — the write did not persist`);

                    if (toolResult && toolResult.persisted) {
                        const profNoun = getTradePersonNoun(prof.trade).replace(/^(an?)\s+/i, '');
                        spokenResponse = `Done. Your profession has been updated to ${profNoun}.`;
                    } else {
                        spokenResponse = `Sorry, I couldn't update your details. Please try again.`;
                    }
                    session.context.pendingIntent = null;
                    session.context.pendingProfessionData = null;
                    session.context.workerDraft = null;
                } else if (isNegative) {
                    spokenResponse = `Understood, your profession remains unchanged. Let me know if you need anything else.`;
                    session.context.pendingIntent = null;
                    session.context.pendingProfessionData = null;
                    session.context.workerDraft = null;
                }
            }

            else if (session.context.pendingIntent === 'CONFIRM_REGISTER_OFFER' && (isAffirmative || isNegative)) {
                detectedIntent = 'confirm_register_offer';
                if (isAffirmative) {
                    spokenResponse = `Please tell me your name, trade, and available hours, and I will set up your worker profile immediately.`;
                    actionsPerformed.push(`Prompted caller for voice worker registration details`);
                    session.context.pendingIntent = null;
                    session.context.lastActionCompleted = 'REGISTER_OFFER_GUIDED';
                } else if (isNegative) {
                    spokenResponse = `Understood. Let me know if you need help with anything else.`;
                    session.context.pendingIntent = null;
                }
            }

            else if (session.context.pendingIntent === 'CONFIRM_POST_JOB' && (isAffirmative || isNegative)) {
                detectedIntent = 'confirm_post_job';
                if (isAffirmative && session.context.pendingJobData) {
                    const jobData = session.context.pendingJobData;
                    toolExecuted = 'createJob';
                    toolResult = AI_TOOLS.createJob(jobData);
                    actionsPerformed.push(`Created Job #${toolResult.job.id} for ${jobData.service} in SQLite database`);

                    spokenResponse = `Done! Your job request for ${jobData.service} in ${jobData.location || jobData.city} has been posted. We are notifying nearby registered specialists. Is there anything else I can help you with?`;
                    session.context.pendingIntent = null;
                    session.context.pendingJobData = null;
                    session.context.lastActionCompleted = 'JOB_POSTED';
                } else if (isNegative) {
                    spokenResponse = `No problem, I've cancelled the job request. Let me know if you need help with anything else.`;
                    session.context.pendingIntent = null;
                    session.context.pendingJobData = null;
                }
            }

            else if (session.context.pendingIntent === 'CONFIRM_CONNECT_WORKER' && (isAffirmative || isNegative)) {
                detectedIntent = 'confirm_connect_worker';
                if (isAffirmative && session.context.lastSelectedWorker) {
                    const worker = session.context.lastSelectedWorker;
                    toolExecuted = 'createJob';
                    toolResult = AI_TOOLS.createJob({
                        customerPhone: session.callerPhone,
                        customerName: session.callerName,
                        service: worker.trade || session.context.currentService || 'Specialist Visit',
                        problemDescription: `Direct booking request for ${worker.name}`,
                        location: `${session.city} Town`,
                        city: session.city,
                        requestedDate: session.context.currentDate || 'Today',
                        requestedTime: session.context.currentTime || 'Immediate',
                        budget: worker.startingPrice || '₹300',
                        workerId: worker.id,
                        workerName: worker.name,
                        workerPhone: worker.phone
                    });
                    actionsPerformed.push(`Created Booking #${toolResult.job.id} dispatched to ${worker.name}`);

                    spokenResponse = `Booking confirmed! I have assigned ${worker.name} (${worker.trade}) for your request. They have been notified. Is there anything else you need?`;
                    session.context.pendingIntent = null;
                    session.context.lastActionCompleted = 'BOOKING_CONFIRMED';
                } else if (isNegative) {
                    spokenResponse = `Understood. Would you like me to look for another specialist or post an open job?`;
                    session.context.pendingIntent = null;
                }
            }

            else if (session.context.pendingIntent === 'CONFIRM_CANCEL_BOOKING' && (isAffirmative || isNegative)) {
                detectedIntent = 'confirm_cancel_booking';
                if (isAffirmative && session.context.pendingCancelJobId) {
                    const jId = session.context.pendingCancelJobId;
                    toolExecuted = 'cancelJob';
                    toolResult = AI_TOOLS.cancelJob({ jobId: jId, customerPhone: session.callerPhone });
                    actionsPerformed.push(`Cancelled Booking #${jId} in SQLite database`);
                    spokenResponse = `Your booking #${jId} has been cancelled successfully. Is there anything else I can help you with?`;
                    session.context.pendingIntent = null;
                    session.context.pendingCancelJobId = null;
                    session.context.lastActionCompleted = 'BOOKING_CANCELLED';
                } else if (isNegative) {
                    spokenResponse = `Your booking remains active. Let me know if you need any other assistance.`;
                    session.context.pendingIntent = null;
                    session.context.pendingCancelJobId = null;
                }
            }

            // C.2 Conversational Greetings & Goodbyes
            else if (/\b(thank you|thanks|thanks a lot|thank you so much|thank you for your help|dhanyavada|dhanyavadagalu|dhanyavadam|shukriya|bahut shukriya)\b/i.test(lowerCleaned) &&
                /\b(bye|goodbye|okay bye|ok bye|tata|see you|good night|that's all|thats all|that's it|thats it|nothing else|no nothing|nothing more|no that's all|no thats all|no thanks|no thank you)\b/i.test(lowerCleaned)) {
                spokenResponse = `You're welcome! I'm glad I could help. Have a great day!`;
                actionsPerformed.push(`Completed conversation with closing goodbye`);
                session.context.pendingIntent = null;
                shouldEndCall = true;
            } else if (/\b(bye|goodbye|okay bye|ok bye|tata|see you|good night|that's all|thats all|that's it|thats it|nothing else|no nothing|nothing more|no that's all|no thats all|no thanks|no thank you)\b/i.test(lowerCleaned) && lowerCleaned.split(/\s+/).length <= 4) {
                spokenResponse = `Goodbye! Thank you for calling GigSync. Have a wonderful day!`;
                actionsPerformed.push(`Caller ended conversation`);
                session.context.pendingIntent = null;
                shouldEndCall = true;
            } else if (/\b(thank you|thanks|thanks a lot|thank you so much|thank you for your help|dhanyavada|dhanyavadagalu|dhanyavadam|shukriya|bahut shukriya)\b/i.test(lowerCleaned) && lowerCleaned.split(/\s+/).length <= 5) {
                spokenResponse = `You're welcome! I'm glad I could help. You can end the call whenever you're ready, or let me know if you need anything else.`;
                actionsPerformed.push(`Acknowledged gratitude`);
                session.context.pendingIntent = null;
            } else if (/\b(hello|hi|hey|namaskara|namaste|vanakkam|good morning|good afternoon|good evening)\b/i.test(lowerCleaned) && lowerCleaned.split(/\s+/).length <= 3) {
                spokenResponse = `Hello! How can I help you today?`;
                actionsPerformed.push(`Natural greeting response`);
            }

            // C.2b Standalone Affirmation with no active pending confirmation
            else if (isAffirmative && !session.context.pendingIntent) {
                if (session.context.workerDraft) {
                    spokenResponse = evaluateWorkerDraft(session, text, actionsPerformed);
                } else if (session.callerRole === 'worker') {
                    spokenResponse = `Sure! What is your name and what trade do you work in?`;
                    actionsPerformed.push(`Prompted worker for name and trade`);
                } else {
                    spokenResponse = `Sure! How can I help you today? You can say your name and profession to register as a worker, or tell me what service you need.`;
                    actionsPerformed.push(`Prompted caller for intent`);
                }
            }

            // C.3 Worker Schedule Request ("I would like to do workers schedule", "update my schedule")
            else if (/\b(do workers schedule|worker schedule|workers schedule|update my schedule|change my schedule|set my schedule|change my availability|update my availability)\b/i.test(lowerCleaned) && !/\b(from \d|to \d|\d to \d|\d:\d\d|am|pm|o'clock|hours|\d+ to \d+)\b/i.test(lowerCleaned)) {
                spokenResponse = `Sure. What hours are you available?`;
                actionsPerformed.push(`Prompted worker for available hours`);
            }

            // C.4 Worker Self-Identification & Availability Statements
            else if (isWorkerIntent(text, session.callerRole)) {
                session.callerRole = 'worker';
                session.context.workerDraft = session.context.workerDraft || {
                    name: null,
                    phone: (session.callerPhone && /^[6-9]\d{9}$/.test(session.callerPhone)) ? session.callerPhone : null,
                    trade: null,
                    date: null,
                    startTime: null,
                    endTime: null,
                    startDisplay: null,
                    endDisplay: null,
                    hasAvailability: false
                };
                const draft = session.context.workerDraft;

                const statedName = extractCallerName(text);
                if (statedName) draft.name = statedName;

                const statedPhone = extractPhoneNumber(text);
                if (statedPhone) {
                    draft.phone = statedPhone;
                    session.callerPhone = statedPhone;
                } else if (!draft.phone && session.callerPhone && /^[6-9]\d{9}$/.test(session.callerPhone)) {
                    draft.phone = session.callerPhone;
                }

                const statedTrade = extractTradeAndService(text);
                if (statedTrade) draft.trade = statedTrade;

                const hasAvail = /\b(available|free|duty|from \d|to \d|\d to \d|timing|hours|schedule|varege|inda|o'clock|wanted to work|want to work|ready to work|\d+ to \d+|\d+\s*am|\d+\s*pm|morning|evening|afternoon|today|tomorrow)\b/i.test(lowerCleaned);
                if (hasAvail && (text.match(/\d/) || lowerCleaned.includes('morning') || lowerCleaned.includes('evening') || lowerCleaned.includes('afternoon') || lowerCleaned.includes('today') || lowerCleaned.includes('tomorrow'))) {
                    const range = extractTimeRange(text);
                    const { date } = extractDateTimeEntities(text);
                    draft.date = date || 'Tomorrow';
                    draft.startTime = range.startTime;
                    draft.endTime = range.endTime;
                    draft.startDisplay = range.startDisplay;
                    draft.endDisplay = range.endDisplay;
                    draft.hasAvailability = true;
                }

                const existingWorker = draft.phone ? DB.getWorkerByPhone(draft.phone) : null;

                // Specific case: Worker explicitly requested trade/profession change
                if (statedTrade && /\b(now|became|changed to|change to|new trade|profession)\b/i.test(lowerCleaned)) {
                    const tradeNoun = getTradePersonNoun(statedTrade).replace(/^(an?)\s+/i, '');
                    session.context.pendingProfessionData = {
                        workerId: existingWorker ? existingWorker.id : null,
                        name: draft.name || (existingWorker ? existingWorker.name : 'Worker'),
                        trade: statedTrade,
                        tradeNoun: tradeNoun,
                        phone: draft.phone || session.callerPhone
                    };
                    session.context.pendingIntent = 'CONFIRM_UPDATE_PROFESSION';
                    spokenResponse = `Got it. You want to update your profession to ${tradeNoun}. Shall I save this?`;
                    actionsPerformed.push(`Prompted confirmation for trade change to ${statedTrade}`);
                }
                // Specific case: Existing worker changing availability only
                else if (existingWorker && draft.hasAvailability && !statedName && (!statedTrade || statedTrade.toLowerCase() === existingWorker.trade.toLowerCase())) {
                    session.context.pendingAvailabilityData = {
                        workerId: existingWorker.id,
                        name: existingWorker.name,
                        trade: existingWorker.trade,
                        tradeNoun: getTradePersonNoun(existingWorker.trade).replace(/^(an?)\s+/i, ''),
                        phone: draft.phone,
                        date: draft.date,
                        startTime: draft.startTime,
                        endTime: draft.endTime,
                        startDisplay: draft.startDisplay,
                        endDisplay: draft.endDisplay,
                        isAvailable: true,
                        updateType: 'AVAILABILITY_ONLY'
                    };
                    session.context.pendingIntent = 'CONFIRM_UPDATE_AVAILABILITY';
                    spokenResponse = `Got it. You want to update your availability to ${draft.date.toLowerCase()}, ${draft.startDisplay} to ${draft.endDisplay}. Shall I save this?`;
                    actionsPerformed.push(`Prepared worker availability update for ${draft.date}`);
                }
                // General Slot-filling evaluation (never guess missing data)
                else {
                    spokenResponse = evaluateWorkerDraft(session, text, actionsPerformed);
                }
            }

            // C.5b Worker Profile & Details Inquiry ("What are my details?", "What is my profile?")
            else if (/\b(what are my details|what is my details|what are my detail|what is my detail|what is my profile|check my details|check my profile|my details|my profile|who am i|show my details|show my profile)\b/i.test(lowerCleaned)) {
                detectedIntent = 'get_worker_profile';
                session.callerRole = 'worker';
                const worker = DB.getWorkerByPhone(session.callerPhone);
                if (!worker) {
                    spokenResponse = `I don't have a registered profile for this phone number yet. Would you like to register as a worker?`;
                } else {
                    const schedule = DB.getWorkerSchedule(session.callerPhone);
                    const latestSlot = (schedule && schedule.availabilitySlots && schedule.availabilitySlots.length > 0) ? schedule.availabilitySlots[0] : null;
                    const tradeNoun = getTradePersonNoun(worker.trade).replace(/^(an?)\s+/i, '');
                    const article = /^[aeiou]/i.test(tradeNoun) ? 'an' : 'a';
                    if (latestSlot) {
                        spokenResponse = `You're ${worker.name}, ${article} ${tradeNoun}. You're available ${latestSlot.date_str.toLowerCase()} from ${latestSlot.start_time} to ${latestSlot.end_time}.`;
                    } else {
                        spokenResponse = `You're ${worker.name}, registered as ${article} ${tradeNoun}. You don't have any active availability slots set.`;
                    }
                }
                actionsPerformed.push(`Queried real worker profile from database`);
            }

            // C.5 Worker Schedule Inquiry ("What jobs do I have today?")
            else if (/\b(what jobs|what job|any jobs|do i have any jobs|do i have any bookings|my bookings|my schedule|check my schedule|show my jobs|what are my jobs|am i available|check my availability|my working hours)\b/i.test(lowerCleaned)) {
                detectedIntent = 'get_worker_schedule';
                session.callerRole = 'worker';
                const { date } = extractDateTimeEntities(text);
                const targetDate = date || 'Today';
                toolExecuted = 'getWorkerSchedule';
                toolResult = AI_TOOLS.getWorkerSchedule({ workerPhone: session.callerPhone, date: targetDate });

                const matchingSlot = (toolResult.availabilitySlots || []).find(s => s.date_str && s.date_str.toLowerCase() === targetDate.toLowerCase());
                if (toolResult.status === 'not_registered') {
                    spokenResponse = `I don't have a worker account registered for your number yet, so there's no schedule saved. Would you like me to register you?`;
                } else if (matchingSlot) {
                    spokenResponse = `Yes, you are marked available for ${targetDate.toLowerCase()} from ${matchingSlot.start_time} to ${matchingSlot.end_time}.`;
                } else if (!toolResult.count || toolResult.count === 0) {
                    spokenResponse = `You don't have any jobs scheduled for ${targetDate.toLowerCase()}.`;
                } else {
                    const first = toolResult.bookings[0];
                    spokenResponse = `You have ${toolResult.count} job(s) for ${targetDate.toLowerCase()}: ${first.service} for ${first.customer_name} at ${first.requested_time} in ${first.location}.`;
                }
                actionsPerformed.push(`Queried worker schedule (${toolResult.count || 0} jobs found)`);
            }

            // C.6 Worker Next Job
            else if (/\b(who is my next|where is my next|what time is my next|next customer|next job|next booking|show me my next)\b/i.test(lowerCleaned)) {
                detectedIntent = 'get_worker_next_job';
                session.callerRole = 'worker';
                toolExecuted = 'getWorkerNextJob';
                toolResult = AI_TOOLS.getWorkerNextJob({ workerPhone: session.callerPhone });
                if (toolResult.status === 'not_registered') {
                    spokenResponse = `I don't have a worker account registered for your number yet, so there are no jobs to show. Would you like me to register you?`;
                } else if (toolResult.status !== 'success' || !toolResult.job) {
                    spokenResponse = `You don't have any upcoming jobs scheduled right now.`;
                } else {
                    const j = toolResult.job;
                    spokenResponse = `Your next job is ${j.service} for ${j.customerName} at ${j.location}${j.requestedTime ? `, ${j.requestedTime}` : ''}. It's currently ${j.status}.`;
                }
                actionsPerformed.push(`Queried worker next job`);
            }

            // C.7 Worker Earnings
            else if (/\b(how much did i earn|how much i earned|my earnings|show my earnings|show my completed jobs|worker earnings)\b/i.test(lowerCleaned)) {
                detectedIntent = 'get_worker_earnings';
                session.callerRole = 'worker';
                toolExecuted = 'getWorkerEarnings';
                toolResult = AI_TOOLS.getWorkerEarnings({ workerPhone: session.callerPhone });
                if (toolResult.status === 'not_registered') {
                    spokenResponse = `I don't have a worker account registered for your number, so there are no earnings recorded. Would you like me to register you?`;
                } else {
                    // Report this month and lifetime separately — never pass a lifetime total off as
                    // this month's income.
                    const e = toolResult.earnings || {};
                    const month = e.thisMonth || 0;
                    const total = e.totalEarnings || 0;
                    const completed = e.totalCompletedJobs || 0;
                    if (completed === 0) {
                        spokenResponse = `You have no completed jobs recorded yet, so there are no earnings to report.`;
                    } else if (month === 0) {
                        spokenResponse = `You haven't earned anything yet this month. Your lifetime total is ₹${total} across ${completed} completed jobs.`;
                    } else {
                        spokenResponse = `You've earned ₹${month} this month. Your lifetime total is ₹${total} across ${completed} completed jobs.`;
                    }
                    actionsPerformed.push(`Read real earnings (month ₹${month}, total ₹${total})`);
                }
            }

            // C.8 Worker Job Completion
            else if (/\b(complete job|completed job|mark completed|finish job|done with job|job is done)\b/i.test(lowerCleaned)) {
                detectedIntent = 'complete_job';
                session.callerRole = 'worker';
                const nextJob = AI_TOOLS.getWorkerNextJob({ workerPhone: session.callerPhone });
                if (nextJob.status === 'not_registered') {
                    spokenResponse = `I don't have a worker account registered for your number yet, so there are no jobs to close. Would you like me to register you?`;
                } else if (nextJob.status === 'success' && nextJob.job) {
                    if (nextJob.remainingOpenJobs > 1) {
                        // More than one open job — ask instead of guessing which one is finished.
                        spokenResponse = `You have ${nextJob.remainingOpenJobs} open jobs. Which one is finished — the ${nextJob.job.service} for ${nextJob.job.customerName} at ${nextJob.job.location}?`;
                        session.context.pendingIntent = 'CONFIRM_COMPLETE_JOB';
                        session.context.pendingCompleteJobId = nextJob.job.jobId;
                    } else {
                        toolExecuted = 'completeJob';
                        toolResult = await AI_TOOLS.completeJob({ jobId: nextJob.job.jobId, workerPhone: session.callerPhone });
                        spokenResponse = (toolResult && toolResult.persisted)
                            ? `Done. Job ${nextJob.job.jobId} for ${nextJob.job.customerName} is marked completed.`
                            : `Sorry, I couldn't mark that job completed. It is still showing as ${nextJob.job.status}.`;
                        actionsPerformed.push(`completeJob ${nextJob.job.jobId} persisted=${toolResult && toolResult.persisted}`);
                    }
                } else {
                    spokenResponse = `You don't have any open jobs to mark completed right now.`;
                }
            }

            // C.9 Customer Post Job Request
            else if (/\b(post a job|create job|new job|book a service|need repair|need service|post job)\b/i.test(lowerCleaned)) {
                detectedIntent = 'create_job';
                session.callerRole = 'customer';
                const detectedTrade = extractTradeAndService(text);
                const { date, time } = extractDateTimeEntities(text);

                if (!detectedTrade) {
                    session.context.pendingIntent = 'CREATE_JOB_AWAITING_SERVICE';
                    spokenResponse = `Sure. What type of trade specialist or repair work do you need?`;
                } else {
                    session.context.currentService = detectedTrade;
                    session.context.currentDate = date || session.context.currentDate || 'Today';
                    session.context.currentTime = time || session.context.currentTime || 'Immediate';
                    session.context.pendingJobData = {
                        customerPhone: session.callerPhone,
                        customerName: session.callerName,
                        service: detectedTrade,
                        problemDescription: text,
                        location: `${session.city} Town`,
                        city: session.city,
                        requestedDate: session.context.currentDate,
                        requestedTime: session.context.currentTime,
                        budget: '₹300'
                    };
                    session.context.pendingIntent = 'CONFIRM_POST_JOB';
                    spokenResponse = `I have prepared a ${detectedTrade} job request in ${session.city} for ${session.context.currentDate} (${session.context.currentTime}). Shall I post it to nearby specialists?`;
                    actionsPerformed.push(`Drafted job request for ${detectedTrade} in ${session.city}`);
                }
            }

            // C.10 Customer Bookings Inquiry
            else if (session.callerRole === 'customer' && /\b(my bookings|my orders|my active job|do i have a booking|what bookings do i have|what bookings|check my booking)\b/i.test(lowerCleaned)) {
                detectedIntent = 'get_customer_bookings';
                toolExecuted = 'getCustomerBookings';
                toolResult = AI_TOOLS.getCustomerBookings({ customerPhone: session.callerPhone });
                actionsPerformed.push(`Queried customer booking records`);

                if (toolResult.count > 0) {
                    const summary = toolResult.bookings.map(b => `#${b.id} for ${b.service} (${b.status})`).join(', ');
                    spokenResponse = `You have ${toolResult.count} booking(s) on file: ${summary}.`;
                } else {
                    spokenResponse = `You don't have any bookings in your account right now. Would you like me to help you post a job or find a specialist?`;
                }
            }

            // C.11 Customer Search Specialists
            else if (/\b(electrician|electricians|plumber|plumbers|carpenter|carpenters|mechanic|mechanics|painter|painters|technician|mason|tailor|welder|cleaning|driver|repair|appliance|ac)\b/i.test(lowerCleaned)) {
                detectedIntent = 'find_worker';
                const service = extractTradeAndService(text) || 'Specialist';
                const { date, time } = extractDateTimeEntities(text);
                toolExecuted = 'findWorkers';
                toolResult = AI_TOOLS.findWorkers({ trade: service, city: session.city, date: date || 'Today' });
                if (!toolResult.workers || toolResult.workers.length === 0) {
                    spokenResponse = `I couldn't find any registered ${service} specialists available in ${session.city} ${date ? date.toLowerCase() : 'today'}. Would you like me to post an open job request so nearby workers can respond?`;
                    session.context.pendingJobData = {
                        customerPhone: session.callerPhone,
                        customerName: session.callerName,
                        service,
                        location: `${session.city} Town`,
                        city: session.city,
                        requestedDate: date || 'Today',
                        requestedTime: time || 'Immediate',
                        budget: '₹300'
                    };
                    session.context.pendingIntent = 'CONFIRM_POST_JOB';
                } else {
                    const top = toolResult.workers[0];
                    session.context.lastSelectedWorker = top;
                    session.context.pendingIntent = 'CONFIRM_CONNECT_WORKER';
                    const availTime = top.latest_availability ? ` available ${top.latest_availability.date_str.toLowerCase()} from ${top.latest_availability.start_time} to ${top.latest_availability.end_time}` : '';
                    spokenResponse = `Yes, I found ${toolResult.count} registered ${service} specialists in ${session.city}. The closest is ${top.name}${availTime} (${top.startingPrice || '₹300'}). Shall I connect you with ${top.name}?`;
                }
                actionsPerformed.push(`Searched database for ${service} specialists`);
            }

            // No rule matched. Always ask natural clarifying questions to keep the conversation flowing
            else {
                detectedIntent = 'needs_clarification';
                if (session.context.workerDraft && !session.context.workerDraft.name) {
                    spokenResponse = `Sure. What is your name?`;
                } else if (session.context.workerDraft && !session.context.workerDraft.trade) {
                    spokenResponse = `What type of work do you do?`;
                } else if (session.context.workerDraft && !session.context.workerDraft.phone) {
                    spokenResponse = `What is your 10-digit mobile number?`;
                } else if (session.context.workerDraft && !session.context.workerDraft.hasAvailability) {
                    spokenResponse = `What hours are you available?`;
                } else if (session.callerRole === 'worker') {
                    spokenResponse = `Sorry, I didn't quite catch that. Could you please tell me your name, profession, or available hours?`;
                } else {
                    spokenResponse = `Sorry, I didn't quite catch that. How can I help you today? You can tell me your profession to register as a worker, or describe the service you need.`;
                }
                actionsPerformed.push(`Asked the caller to clarify an unrecognised request`);
            }
        }

        // Add assistant turn to session memory
        sessionManager.addTurn(session, 'assistant', spokenResponse);

        // Record real call log in SQLite DB
        DB.logCall({
            callerPhone: session.callerPhone,
            callerRole: session.callerRole,
            transcript: text,
            intentDetected: detectedIntent || toolExecuted || session.context.pendingIntent || 'conversation',
            actionsTaken: actionsPerformed.join('; '),
            durationSeconds: 10
        });

        console.log('\n[VOICE] Transcript:', text);
        console.log('[VOICE] Detected intent:', detectedIntent);
        console.log('[VOICE] Extracted entities:', extractedEntities);
        console.log('[VOICE] Selected tool:', toolExecuted);
        console.log('[VOICE] Tool result:', toolResult ? (toolResult.count !== undefined ? `${toolResult.count} workers found` : (toolResult.job ? `Job #${toolResult.job.id}` : toolResult.status)) : null);
        console.log('[VOICE] Final response:', spokenResponse);

        return {
            spokenResponse,
            toolExecuted,
            toolResult,
            detectedIntent,
            extractedEntities,
            actionsPerformed,
            shouldEndCall,
            context: {
                currentService: session.context.currentService,
                currentLocation: session.city,
                pendingIntent: session.context.pendingIntent,
                workersFound: (session.context.lastFoundWorkers || []).length
            }
        };
    }
}


const aiAgent = new ContextAwareVoiceAgent();

module.exports = {
    aiAgent,
    geminiBrain,
    GEMINI_TOOLS_DECLARATIONS,
    GEMINI_MODEL_CHAIN,
    AI_TOOLS,
    sessionManager
};

