/* ==========================================================================
   GigSync — AI Voice Agent & Tool Calling Engine
   Zero-Dummy Data · Trilingual NLU (English / Kannada / Hindi) · Context-Bound
   ========================================================================== */

const DB = require('./database');
const https = require('node:https');

// 1. Definition of Backend Tool Functions Connected to SQLite
const AI_TOOLS = {
    // 1. Find Real Registered Workers
    findWorkers({ service, city = 'Ramanagara' }) {
        const workers = DB.getAllWorkers({ service, city, isAvailable: true });
        if (workers.length === 0) {
            return {
                status: 'success',
                count: 0,
                workers: [],
                message: `No ${service || 'skilled'} workers registered in ${city} yet. You can post a job request or invite a local specialist.`
            };
        }
        return {
            status: 'success',
            count: workers.length,
            workers: workers.map(w => ({
                id: w.id,
                name: w.name,
                trade: w.trade,
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

    // 2. Check Specific Worker Availability
    checkAvailability({ workerId, date = 'Today', time = 'Immediate' }) {
        const worker = DB.getWorkerById(workerId);
        if (!worker) return { status: 'error', message: `Worker ID ${workerId} not found in database.` };
        return {
            status: 'success',
            workerId: worker.id,
            workerName: worker.name,
            trade: worker.trade,
            isAvailable: Boolean(worker.is_available),
            date,
            time,
            message: worker.is_available ? `${worker.name} (${worker.trade}) is currently on-duty and available in ${worker.city}.` : `${worker.name} is currently off-duty.`
        };
    },

    // 3. Worker Availability Voice Update
    updateWorkerAvailability({ workerPhone, trade = 'Skilled Specialist', date = 'Tomorrow', startTime = '10:00 AM', endTime = '02:00 PM', isAvailable = true }) {
        const slot = DB.setWorkerAvailabilitySlot({
            workerPhone,
            trade,
            dateStr: date,
            startTime,
            endTime,
            isAvailable: Boolean(isAvailable)
        });

        DB.updateWorkerAvailabilityStatus(workerPhone, isAvailable);

        return {
            status: 'success',
            action: 'AVAILABILITY_UPDATED',
            workerPhone,
            trade,
            date,
            hours: `${startTime} – ${endTime}`,
            isAvailable: Boolean(isAvailable),
            spokenConfirmation: `Dhanyavadagalu! Your availability for ${date} from ${startTime} to ${endTime} has been updated in the GigSync database.`
        };
    },

    // 4. Voice-First Worker Profile Creation
    createWorkerProfile({ name, phone, trade, city = 'Ramanagara', area = 'Town', tools = 'Standard tool kit', experienceYears = 2, price = 300 }) {
        const newWorker = DB.createWorker({
            name,
            phone,
            trade,
            service: trade.toLowerCase(),
            city,
            area,
            tools,
            experience_years: experienceYears,
            price,
            is_available: 1
        });
        return {
            status: 'success',
            action: 'WORKER_REGISTERED',
            worker: newWorker,
            spokenConfirmation: `Namaskara ${name}! Your professional profile as ${trade} in ${city} has been created on GigSync.`
        };
    },

    // 5. Customer Job Creation & Broadcast
    createJob({ customerPhone = '9876543210', customerName = 'Customer', service, problemDescription, location = 'Town Area', city = 'Ramanagara', requestedTime = 'Tomorrow Morning', budget = '₹350' }) {
        const matchedWorkers = DB.getAllWorkers({ service, city, isAvailable: true });
        const autoAssigned = matchedWorkers.length > 0 ? matchedWorkers[0] : null;

        const newJob = DB.createJob({
            customer_phone: customerPhone,
            customer_name: customerName,
            service,
            problem_description: problemDescription || `Repair needed for ${service}`,
            location,
            city,
            requested_date: requestedTime.toLowerCase().includes('tomorrow') ? 'Tomorrow' : 'Today',
            requested_time: requestedTime,
            budget,
            worker_id: autoAssigned ? autoAssigned.id : null,
            worker_phone: autoAssigned ? autoAssigned.phone : null,
            worker_name: autoAssigned ? autoAssigned.name : 'Finding nearby verified specialists...',
            status: autoAssigned ? 'Confirmed' : 'Requested'
        });

        return {
            status: 'success',
            action: 'JOB_BROADCASTED',
            job: {
                jobId: newJob.id,
                service: newJob.service,
                location: newJob.location,
                requestedTime: newJob.requested_time,
                status: newJob.status
            },
            matchedWorker: autoAssigned,
            spokenConfirmation: autoAssigned
                ? `Namaskara! Your job #${newJob.id} for ${service} has been booked and assigned to ${autoAssigned.name}.`
                : `Namaskara! Your job #${newJob.id} for ${service} has been posted. We are notifying nearby registered specialists in ${city}.`
        };
    },

    // 6. Get Worker Schedule & Bookings
    getWorkerSchedule({ workerId, workerName }) {
        let targetId = workerId;
        if (!targetId && workerName) {
            const all = DB.getAllWorkers();
            const found = all.find(w => w.name.toLowerCase().includes(workerName.toLowerCase()));
            if (found) targetId = found.id;
        }

        if (!targetId) {
            const allWorkers = DB.getAllWorkers();
            if (allWorkers.length > 0) targetId = allWorkers[0].id;
            else return { status: 'error', message: 'No registered workers found in database.' };
        }

        const schedule = DB.getWorkerSchedule(targetId);
        if (!schedule) return { status: 'error', message: 'Schedule not found.' };

        return {
            status: 'success',
            worker: schedule.worker,
            schedule: {
                hours: '08:30 AM – 06:30 PM',
                status: schedule.isAvailableNow ? 'On-Duty · Available' : 'Off-Duty',
                activeBookingsCount: schedule.activeBookings.length,
                slots: schedule.availabilitySlots
            }
        };
    },

    // 7. Get Worker Earnings
    getWorkerEarnings({ workerId }) {
        const earnings = DB.getWorkerEarnings(workerId);
        return {
            status: 'success',
            workerId,
            earnings
        };
    },

    // 8. Accept Job
    acceptJob({ jobId, workerId, workerName, workerPhone }) {
        const updated = DB.updateJobStatus(jobId, 'Accepted', workerId, workerName, workerPhone);
        return {
            status: 'success',
            action: 'JOB_ACCEPTED',
            job: updated,
            spokenConfirmation: `Job #${jobId} has been accepted! You can now view customer details and head to the service location.`
        };
    },

    // 9. Reject / Cancel Job
    cancelJob({ jobId, reason = 'Cancelled by user' }) {
        const updated = DB.updateJobStatus(jobId, 'Cancelled');
        return {
            status: 'success',
            action: 'JOB_CANCELLED',
            job: updated,
            spokenConfirmation: `Job #${jobId} has been cancelled.`
        };
    },

    // 10. Complete Job
    completeJob({ jobId }) {
        const updated = DB.updateJobStatus(jobId, 'Completed');
        return {
            status: 'success',
            action: 'JOB_COMPLETED',
            job: updated,
            spokenConfirmation: `Congratulations! Job #${jobId} is completed. Your digital work record and earnings have been updated.`
        };
    },

    // 11. Get Job Status
    getJobStatus({ jobId }) {
        const job = DB.getJobById(jobId);
        if (!job) return { status: 'error', message: `Booking #${jobId} was not found.` };
        return {
            status: 'success',
            job
        };
    }
};

// 2. Intelligent Trilingual NLU & Intent Parser
class VoiceAIAgent {
    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY || '';
    }

    async processCallTurn({ callerPhone, callerRole = 'customer', callerName = 'User', city = 'Ramanagara', speechText }) {
        const text = (speechText || '').trim();
        const lower = text.toLowerCase();

        let toolExecuted = null;
        let toolArgs = {};
        let toolResult = null;
        let spokenResponse = '';
        let cardType = null;
        let cardData = null;

        // Intent 1: Schedule Inquiries
        if (lower.includes('schedule') || lower.includes('ಶೆಡ್ಯೂಲ್') || lower.includes('timing') || lower.includes('samaya')) {
            let targetName = null;
            const words = text.split(/\s+/);
            const workers = DB.getAllWorkers();
            for (const w of workers) {
                if (lower.includes(w.name.toLowerCase()) || lower.includes(w.name.split(' ')[0].toLowerCase())) {
                    targetName = w.name;
                    break;
                }
            }

            toolExecuted = 'getWorkerSchedule';
            toolArgs = { workerName: targetName };
            toolResult = AI_TOOLS.getWorkerSchedule(toolArgs);

            if (toolResult.status === 'success') {
                const w = toolResult.worker;
                cardType = 'workerSchedule';
                cardData = { worker: w, schedule: toolResult.schedule };
                spokenResponse = `${w.name}'s schedule is ${toolResult.schedule.hours}. They are currently ${toolResult.schedule.status} in ${w.city}.`;
            } else {
                spokenResponse = `No registered worker schedule was found in the database.`;
            }
        }

        // Intent 2: Worker Availability Update (e.g. "I am available tomorrow from 10 to 2" / "Naale 10 inda 2 varege free iddini")
        else if (
            (callerRole === 'worker') ||
            lower.includes('available') || lower.includes('ಫ್ರೀ') || lower.includes('ಲಭ್ಯ') ||
            lower.includes('free iddini') || lower.includes('duty') || lower.includes('shift')
        ) {
            toolExecuted = 'updateWorkerAvailability';
            let dateStr = 'Tomorrow';
            if (lower.includes('today') || lower.includes('ee dina') || lower.includes('ivathu') || lower.includes('ಇವತ್ತು')) dateStr = 'Today';
            if (lower.includes('monday') || lower.includes('somavara')) dateStr = 'Monday';

            let startTime = '10:00 AM';
            let endTime = '02:00 PM';
            const timeMatch = text.match(/(\d{1,2})\s*(?:to|inda|inda\s*te|\-)\s*(\d{1,2})/i);
            if (timeMatch) {
                startTime = `${timeMatch[1]}:00 AM`;
                endTime = `${timeMatch[2]}:00 PM`;
            }

            toolArgs = {
                workerPhone: callerPhone,
                date: dateStr,
                startTime,
                endTime,
                isAvailable: !lower.includes('not available') && !lower.includes('unavailable') && !lower.includes('off')
            };

            toolResult = AI_TOOLS.updateWorkerAvailability(toolArgs);
            spokenResponse = toolResult.spokenConfirmation;
            cardType = 'availabilityUpdated';
            cardData = toolResult;
        }

        // Intent 3: Find Workers / Check Available Workers Nearby
        else if (
            lower.includes('find') || lower.includes('show') || lower.includes('workers near') ||
            lower.includes('ಯಾರು ಲಭ್ಯವಿದ್ದಾರೆ') || lower.includes('who is available') || lower.includes('available workers')
        ) {
            let service = 'all';
            if (lower.includes('electric') || lower.includes('ಎಲೆಕ್ಟ್ರಿ') || lower.includes('current')) service = 'Electrical';
            else if (lower.includes('plumb') || lower.includes('ಪ್ಲಂಬರ್') || lower.includes('pipe') || lower.includes('leak')) service = 'Plumbing';
            else if (lower.includes('carpenter') || lower.includes('ಮರಗೆಲಸ') || lower.includes('wood')) service = 'Carpentry';
            else if (lower.includes('mechanic') || lower.includes('bike') || lower.includes('car')) service = 'Mechanics';
            else if (lower.includes('ac') || lower.includes('fridge') || lower.includes('cool')) service = 'AC & Appliances';

            toolExecuted = 'findWorkers';
            toolArgs = { service, city };
            toolResult = AI_TOOLS.findWorkers(toolArgs);

            cardType = 'workerList';
            cardData = toolResult;

            if (toolResult.count > 0) {
                spokenResponse = `Found ${toolResult.count} registered ${service === 'all' ? '' : service} specialist(s) available in ${city}. You can book them with 1 tap.`;
            } else {
                spokenResponse = `No registered ${service === 'all' ? '' : service} specialists are currently in ${city}. Would you like to post an open job request?`;
            }
        }

        // Intent 4: Customer Create Job / Hire Request (English, Kannada script, Kanglish)
        else if (
            lower.includes('need') || lower.includes('beku') || lower.includes('ಬೇಕು') ||
            lower.includes('chahiye') || lower.includes('repair') || lower.includes('plumber') ||
            lower.includes('electrician') || lower.includes('carpenter') || lower.includes('mechanic') ||
            lower.includes('cleaning') || lower.includes('washing machine') || lower.includes('fan')
        ) {
            let service = 'General Repair';
            if (lower.includes('electric') || lower.includes('fan') || lower.includes('switch') || lower.includes('current') || lower.includes('ಎಲೆಕ್ಟ್ರಿಷಿಯನ್')) {
                service = 'Electrical';
            } else if (lower.includes('plumb') || lower.includes('pipe') || lower.includes('leak') || lower.includes('tap') || lower.includes('ನೀರು') || lower.includes('ಪ್ಲಂಬರ್')) {
                service = 'Plumbing';
            } else if (lower.includes('carpenter') || lower.includes('door') || lower.includes('wood') || lower.includes('table') || lower.includes('ಕಾರ್ಪೆಂಟರ್')) {
                service = 'Carpentry';
            } else if (lower.includes('ac') || lower.includes('fridge') || lower.includes('refrigerator') || lower.includes('washing machine')) {
                service = 'AC & Appliances';
            } else if (lower.includes('bike') || lower.includes('scooter') || lower.includes('mechanic') || lower.includes('ಮೇಕಾನಿಕ್')) {
                service = 'Mechanics';
            } else if (lower.includes('clean') || lower.includes('sweep') || lower.includes('ಮನೆ ಕ್ಲೀನಿಂಗ್')) {
                service = 'Home Cleaning';
            }

            let requestedTime = 'Immediate (Today)';
            if (lower.includes('tomorrow') || lower.includes('naale') || lower.includes('ನಾಳೆ') || lower.includes('kal')) {
                requestedTime = 'Tomorrow Morning (10:00 AM)';
            }

            toolExecuted = 'createJob';
            toolArgs = {
                customerPhone: callerPhone,
                customerName: callerName,
                service,
                problemDescription: text,
                location: `${city} Town`,
                city,
                requestedTime,
                budget: '₹350'
            };

            toolResult = AI_TOOLS.createJob(toolArgs);
            spokenResponse = toolResult.spokenConfirmation;
            cardType = 'jobCreated';
            cardData = toolResult;
        }

        // Fallback: Helpful Assistant Response
        else {
            spokenResponse = `Namaskara! I am your GigSync AI assistant for ${city}. You can tell me what service you need (e.g. "I need an electrician tomorrow", "Nanage plumber beku"), check worker schedules, or set your work availability.`;
        }

        // Log call turn in SQLite database
        DB.logCall({
            callerPhone,
            callerRole,
            transcript: text,
            intentDetected: toolExecuted || 'general_conversation',
            actionsTaken: toolExecuted ? JSON.stringify(toolArgs) : 'chat_reply',
            durationSeconds: 12
        });

        return {
            spokenResponse,
            toolExecuted,
            toolArgs,
            toolResult,
            cardType,
            cardData
        };
    }
}

const aiAgent = new VoiceAIAgent();

module.exports = {
    aiAgent,
    AI_TOOLS
};
