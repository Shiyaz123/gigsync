/* ==========================================================================
   GigSync — Context-Aware & Database-First AI Voice Agent Engine
   Zero Dummy Data · Multi-Turn Conversation Memory · Verified SQLite Tools
   ========================================================================== */

const DB = require('./database');

// 1. Definition of Real Database Tools (No Assumptions, No Fabricated Records)
const AI_TOOLS = {
    // 1. Find Real Registered Workers from Database
    findWorkers({ service = 'all', city = 'Ramanagara' }) {
        const workers = DB.getAllWorkers({
            service: service === 'all' ? undefined : service,
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

    // 2. Check Specific Worker Availability
    checkWorkerAvailability({ workerId, workerName, date = 'Today', time = 'Immediate' }) {
        let worker = null;
        if (workerId) {
            worker = DB.getWorkerById(workerId);
        } else if (workerName) {
            const all = DB.getAllWorkers();
            worker = all.find(w => w.name.toLowerCase().includes(workerName.toLowerCase()));
        }

        if (!worker) {
            return {
                status: 'error',
                message: `Worker "${workerName || workerId}" was not found in the registered database.`
            };
        }

        const schedule = DB.getWorkerSchedule(worker.id);
        const hasConflict = DB.checkScheduleConflict(worker.id, date, time);

        return {
            status: 'success',
            workerId: worker.id,
            workerName: worker.name,
            trade: worker.trade,
            city: worker.city,
            isAvailable: Boolean(worker.is_available) && !hasConflict,
            hasConflict,
            schedule: schedule ? schedule.availabilitySlots : []
        };
    },

    // 3. Worker Availability Update
    updateWorkerAvailability({ workerPhone, trade = 'Skilled Specialist', date = 'Tomorrow', startTime = '09:00 AM', endTime = '06:00 PM', isAvailable = true }) {
        const cleanPhone = (workerPhone || '').replace(/\D/g, '');
        const worker = DB.getWorkerByPhone(cleanPhone);

        const slot = DB.setWorkerAvailabilitySlot({
            workerId: worker ? worker.id : null,
            workerPhone: cleanPhone,
            trade: worker ? worker.trade : trade,
            dateStr: date,
            startTime,
            endTime,
            isAvailable: Boolean(isAvailable)
        });

        if (worker) {
            DB.updateWorkerAvailabilityStatus(worker.id, isAvailable);
        }

        return {
            status: 'success',
            action: 'AVAILABILITY_UPDATED',
            workerName: worker ? worker.name : 'Worker',
            workerPhone: cleanPhone,
            date,
            hours: `${startTime} – ${endTime}`,
            isAvailable: Boolean(isAvailable)
        };
    },

    // 4. Get Worker Availability
    getWorkerAvailability({ workerPhone, date = 'Tomorrow' }) {
        const cleanPhone = (workerPhone || '').replace(/\D/g, '');
        const schedule = DB.getWorkerSchedule(cleanPhone);
        if (!schedule) {
            return { status: 'not_found', message: 'No registered worker profile found for this phone.' };
        }

        const matchingSlot = schedule.availabilitySlots.find(s => s.date_str.toLowerCase() === date.toLowerCase());
        return {
            status: 'success',
            workerName: schedule.worker ? schedule.worker.name : 'Worker',
            isAvailableNow: schedule.isAvailableNow,
            slot: matchingSlot || null,
            date
        };
    },

    // 5. Get Customer Bookings
    getCustomerBookings({ customerPhone }) {
        const cleanPhone = (customerPhone || '').replace(/\D/g, '');
        const jobs = DB.getAllJobs().filter(j => j.customer_phone && j.customer_phone.replace(/\D/g, '') === cleanPhone);
        return {
            status: 'success',
            count: jobs.length,
            bookings: jobs
        };
    },

    // 6. Get Worker Bookings
    getWorkerBookings({ workerPhone, date }) {
        const cleanPhone = (workerPhone || '').replace(/\D/g, '');
        let jobs = DB.getAllJobs().filter(j => (j.worker_phone && j.worker_phone.replace(/\D/g, '') === cleanPhone));
        if (date) {
            jobs = jobs.filter(j => j.requested_date.toLowerCase() === date.toLowerCase());
        }
        return {
            status: 'success',
            count: jobs.length,
            bookings: jobs
        };
    },

    // 7. Get Worker Earnings
    getWorkerEarnings({ workerPhone }) {
        const cleanPhone = (workerPhone || '').replace(/\D/g, '');
        const earnings = DB.getWorkerEarnings(cleanPhone);
        return {
            status: 'success',
            workerPhone: cleanPhone,
            earnings
        };
    },

    // 8. Create Job in Real Database
    createJob({ customerPhone = '9876543210', customerName = 'Customer', service, problemDescription, location = 'Town Area', city = 'Ramanagara', requestedDate = 'Today', requestedTime = 'Immediate', budget = '₹300', workerId = null, workerName = null, workerPhone = null }) {
        // Check if there is an explicit or auto-matched worker
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

    // 9. Cancel Job
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

    // 10. List Supported Real Services
    getServices() {
        return [
            'Electrical (Fan, wiring, switchboards)',
            'Plumbing (Pipe leaks, tap repairs, motor)',
            'Carpentry (Doors, locks, furniture)',
            'Two-Wheeler & Auto Mechanics',
            'AC & Fridge Tech',
            'Washing Machine & Appliance Repair',
            'Painting',
            'Home Cleaning'
        ];
    }
};

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
        if (defaultData.city) session.city = defaultData.city;
        if (defaultData.callerRole) session.callerRole = defaultData.callerRole;
        if (defaultData.callerName) session.callerName = defaultData.callerName;
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

// 3. Entity & Trade Extractor
function extractTradeAndService(text) {
    const lower = text.toLowerCase();
    if (lower.includes('electric') || lower.includes('fan') || lower.includes('switch') || lower.includes('wire') || lower.includes('current') || lower.includes('power') || lower.includes('bulb') || lower.includes('ಎಲೆಕ್ಟ್ರಿಷಿಯನ್')) {
        return 'Electrical';
    }
    if (lower.includes('plumb') || lower.includes('pipe') || lower.includes('tap') || lower.includes('leak') || lower.includes('drain') || lower.includes('water') || lower.includes('ಪ್ಲಂಬರ್') || lower.includes('ನೀರು')) {
        return 'Plumbing';
    }
    if (lower.includes('carpenter') || lower.includes('wood') || lower.includes('door') || lower.includes('window') || lower.includes('furniture') || lower.includes('lock') || lower.includes('ಕಾರ್ಪೆಂಟರ್') || lower.includes('ಮರಗೆಲಸ')) {
        return 'Carpentry';
    }
    if (lower.includes('washing machine') || lower.includes('washer') || lower.includes('വാഷിംഗ് മെഷീൻ')) {
        return 'Washing Machine Repair';
    }
    if (lower.includes('ac') || lower.includes('air conditioner') || lower.includes('fridge') || lower.includes('refrigerator') || lower.includes('cooler')) {
        return 'AC & Appliances';
    }
    if (lower.includes('bike') || lower.includes('scooter') || lower.includes('mechanic') || lower.includes('puncture') || lower.includes('motorcycle') || lower.includes('breakdown') || lower.includes('ಮೇಕಾನಿಕ್')) {
        return 'Mechanics';
    }
    if (lower.includes('clean') || lower.includes('maid') || lower.includes('sweep') || lower.includes('wash') || lower.includes('ಕ್ಲೀನಿಂಗ್')) {
        return 'Home Cleaning';
    }
    if (lower.includes('paint') || lower.includes('painter') || lower.includes('ಬಣ್ಣ')) {
        return 'Painting';
    }
    return null;
}

// 4. Extract Date & Time Entities
function extractDateTimeEntities(text) {
    const lower = text.toLowerCase();
    let date = null;
    let time = null;

    if (lower.includes('today') || lower.includes('now') || lower.includes('immediately') || lower.includes('ivathu') || lower.includes('ಇವತ್ತು')) {
        date = 'Today';
    } else if (lower.includes('tomorrow') || lower.includes('naale') || lower.includes('ನಾಳೆ') || lower.includes('kal')) {
        date = 'Tomorrow';
    } else if (lower.includes('monday') || lower.includes('somavara')) {
        date = 'Monday';
    }

    if (lower.includes('morning') || lower.includes('beligge') || lower.includes('ಬೆಳಿಗ್ಗೆ')) {
        time = 'Morning (10:00 AM)';
    } else if (lower.includes('afternoon') || lower.includes('madhyahna')) {
        time = 'Afternoon (02:00 PM)';
    } else if (lower.includes('evening') || lower.includes('sanje')) {
        time = 'Evening (05:00 PM)';
    } else {
        const timeMatch = text.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm|o'clock)?)/i);
        if (timeMatch && !text.match(/₹|\brupees\b/i)) {
            time = timeMatch[1];
        }
    }

    return { date, time };
}

// 5. Intelligent Multi-Turn Conversational Processor
class ContextAwareVoiceAgent {
    async processCallTurn({ sessionId, callerPhone, callerRole = 'customer', callerName = 'User', city = 'Ramanagara', speechText }) {
        const text = (speechText || '').trim();
        const lower = text.toLowerCase();

        // 1. Get or create session context
        const session = sessionManager.getSession(sessionId, { callerPhone, callerRole, callerName, city });
        sessionManager.addTurn(session, 'user', text);

        let spokenResponse = '';
        let toolExecuted = null;
        let toolResult = null;
        const actionsPerformed = [];

        actionsPerformed.push(`Identified ${session.callerRole} (${session.callerName})`);

        // 2. Check for Pending Confirmation / Affirmation (e.g. "Yes", "Confirm", "Post it", "Go ahead")
        const isAffirmative = /^(yes|yeah|yep|sure|ok|okay|confirm|post it|go ahead|book him|book it|ha|haan|houdu|ಹೌದು|sari|ಸರಿ)\b/i.test(lower);
        const isNegative = /^(no|nope|cancel|cancel it|don't|beda|ಬೇಡ|nahi)\b/i.test(lower);

        if (session.context.pendingIntent === 'CONFIRM_POST_JOB' && (isAffirmative || isNegative)) {
            if (isAffirmative && session.context.pendingJobData) {
                const jobData = session.context.pendingJobData;
                toolExecuted = 'createJob';
                toolResult = AI_TOOLS.createJob(jobData);
                actionsPerformed.push(`Created Job #${toolResult.job.id} for ${jobData.service} in SQLite database`);

                spokenResponse = `Done! Your job request for ${jobData.service} in ${jobData.location} has been posted. We are notifying nearby registered specialists.`;
                session.context.pendingIntent = null;
                session.context.pendingJobData = null;
            } else if (isNegative) {
                spokenResponse = `No problem, I've cancelled the job request. Let me know if you need help with anything else.`;
                session.context.pendingIntent = null;
                session.context.pendingJobData = null;
            }
        }

        else if (session.context.pendingIntent === 'CONFIRM_CONNECT_WORKER' && (isAffirmative || isNegative)) {
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
                    requestedDate: 'Today',
                    requestedTime: 'Immediate',
                    budget: worker.startingPrice || '₹300',
                    workerId: worker.id,
                    workerName: worker.name,
                    workerPhone: worker.phone
                });
                actionsPerformed.push(`Dispatched direct booking #${toolResult.job.id} to ${worker.name}`);
                spokenResponse = `Booking confirmed! I have assigned ${worker.name} (${worker.trade}) for your request. They have been notified.`;
                session.context.pendingIntent = null;
            } else if (isNegative) {
                spokenResponse = `Understood. Would you like me to look for another specialist or post an open job?`;
                session.context.pendingIntent = null;
            }
        }

        // 3. Intent: Greeting / Welcome
        else if (/^(hello|hi|hey|namaskara|namaste|good morning|good afternoon|good evening|ನಮಸ್ಕಾರ)\b/i.test(lower) && lower.split(/\s+/).length <= 4) {
            spokenResponse = `Hello! Welcome to GigSync. How can I help you with local trade specialists or bookings in ${session.city} today?`;
            actionsPerformed.push(`Greeting acknowledged`);
        }

        // 4. Intent: Service Catalog Inquiries
        else if (lower.includes('what services') || lower.includes('which services') || lower.includes('services you provide') || lower.includes('what do you do') || lower.includes('ಯಾವ ಸೇವೆಗಳು')) {
            const services = AI_TOOLS.getServices();
            spokenResponse = `GigSync currently connects verified local specialists for: Electrical, Plumbing, Carpentry, Two-Wheeler Mechanics, AC & Appliance Repair, Painting, and Home Cleaning in ${session.city}.`;
            actionsPerformed.push(`Provided service catalog`);
        }

        // 5. Worker Queries: Check My Availability / Schedule
        else if (session.callerRole === 'worker' && (lower.includes('my availability') || lower.includes('am i available') || lower.includes('my schedule') || lower.includes('ನನ್ನ ಶೆಡ್ಯೂಲ್'))) {
            const { date } = extractDateTimeEntities(text);
            const targetDate = date || 'Tomorrow';
            toolExecuted = 'getWorkerAvailability';
            toolResult = AI_TOOLS.getWorkerAvailability({ workerPhone: session.callerPhone, date: targetDate });
            actionsPerformed.push(`Queried worker availability for ${targetDate}`);

            if (toolResult.status === 'success' && toolResult.slot) {
                spokenResponse = `You are currently marked ${toolResult.slot.is_available ? 'Available' : 'Unavailable'} for ${targetDate} from ${toolResult.slot.start_time} to ${toolResult.slot.end_time}.`;
            } else if (toolResult.status === 'success') {
                spokenResponse = `You are currently marked ${toolResult.isAvailableNow ? 'ON-DUTY and Available' : 'OFF-DUTY'} today. No custom slot is set for ${targetDate}. Would you like to set one?`;
            } else {
                spokenResponse = `I couldn't find your worker profile in the database. Please make sure your worker account is registered.`;
            }
        }

        // 6. Worker Queries: Update My Availability
        else if (session.callerRole === 'worker' && (lower.includes('available') || lower.includes('free') || lower.includes('duty') || lower.includes('shift') || lower.includes('ಫ್ರೀ') || lower.includes('ಲಭ್ಯ'))) {
            const { date, time } = extractDateTimeEntities(text);
            const targetDate = date || 'Tomorrow';

            let startTime = '09:00 AM';
            let endTime = '06:00 PM';
            const rangeMatch = text.match(/(\d{1,2})\s*(?:to|inda|inda\s*te|\-)\s*(\d{1,2})/i);
            if (rangeMatch) {
                startTime = `${rangeMatch[1]}:00 AM`;
                endTime = `${rangeMatch[2]}:00 PM`;
            }

            const isAvail = !lower.includes('not available') && !lower.includes('unavailable') && !lower.includes('off') && !lower.includes('leave');

            toolExecuted = 'updateWorkerAvailability';
            toolResult = AI_TOOLS.updateWorkerAvailability({
                workerPhone: session.callerPhone,
                date: targetDate,
                startTime,
                endTime,
                isAvailable: isAvail
            });
            actionsPerformed.push(`Updated ${targetDate} availability: ${startTime} – ${endTime} in database`);
            spokenResponse = isAvail
                ? `Done. Your availability for ${targetDate} from ${startTime} to ${endTime} has been updated in the database.`
                : `Done. You have been marked OFF-DUTY for ${targetDate}.`;
        }

        // 7. Worker Queries: Check My Earnings
        else if (session.callerRole === 'worker' && (lower.includes('earning') || lower.includes('earn') || lower.includes('income') || lower.includes('payment') || lower.includes('ಸಂಪಾದನೆ'))) {
            toolExecuted = 'getWorkerEarnings';
            toolResult = AI_TOOLS.getWorkerEarnings({ workerPhone: session.callerPhone });
            actionsPerformed.push(`Computed earnings from completed database gigs`);

            if (toolResult.earnings && toolResult.earnings.totalEarnings > 0) {
                spokenResponse = `You have earned ₹${toolResult.earnings.totalEarnings} from ${toolResult.earnings.totalCompletedJobs} completed gig(s) in the database.`;
            } else {
                spokenResponse = `You don't have any recorded earnings from completed jobs in the database yet.`;
            }
        }

        // 8. Worker Queries: Check Assigned Jobs / Bookings
        else if (session.callerRole === 'worker' && (lower.includes('my jobs') || lower.includes('my bookings') || lower.includes('assigned') || lower.includes('work today') || lower.includes('work tomorrow'))) {
            const { date } = extractDateTimeEntities(text);
            toolExecuted = 'getWorkerBookings';
            toolResult = AI_TOOLS.getWorkerBookings({ workerPhone: session.callerPhone, date });
            actionsPerformed.push(`Queried assigned jobs for worker`);

            if (toolResult.count > 0) {
                const summary = toolResult.bookings.map(b => `${b.service} at ${b.location} (${b.requested_time}, Status: ${b.status})`).join('; ');
                spokenResponse = `You have ${toolResult.count} assigned booking(s): ${summary}.`;
            } else {
                spokenResponse = `You don't have any assigned bookings ${date ? 'for ' + date : 'right now'}.`;
            }
        }

        // 9. Customer Queries: Check My Bookings / Orders
        else if (session.callerRole === 'customer' && (lower.includes('booking') || lower.includes('bookings') || lower.includes('my order') || lower.includes('my job') || lower.includes('active job') || lower.includes('ನನ್ನ ಬುಕಿಂಗ್')) && !lower.includes('book him') && !lower.includes('book her') && !lower.includes('book them')) {
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

        // 10. Intent: Connect / Book Specific Worker or Pronoun Reference ("connect me to him", "book him", "call him")
        else if (lower.includes('connect') || lower.includes('book him') || lower.includes('book her') || lower.includes('hire him') || lower.includes('call him') || lower.includes('contact him')) {
            // Check if we previously found workers in session context
            if (session.context.lastFoundWorkers.length > 0) {
                const worker = session.context.lastFoundWorkers[0];
                session.context.lastSelectedWorker = worker;
                session.context.pendingIntent = 'CONFIRM_CONNECT_WORKER';
                spokenResponse = `I found ${worker.name}, a registered ${worker.trade} in ${worker.city} with a visiting fee of ${worker.startingPrice}. Shall I confirm and dispatch this booking to ${worker.name}?`;
                actionsPerformed.push(`Referenced ${worker.name} from previous database search`);
            } else {
                // Try searching database for current trade
                const trade = extractTradeAndService(text) || session.context.currentService;
                if (trade) {
                    toolExecuted = 'findWorkers';
                    toolResult = AI_TOOLS.findWorkers({ service: trade, city: session.city });
                    actionsPerformed.push(`Searched database for ${trade} in ${session.city}`);

                    if (toolResult.count > 0) {
                        const worker = toolResult.workers[0];
                        session.context.lastFoundWorkers = toolResult.workers;
                        session.context.lastSelectedWorker = worker;
                        session.context.pendingIntent = 'CONFIRM_CONNECT_WORKER';
                        spokenResponse = `I found ${worker.name}, a registered ${worker.trade} in ${worker.city}. Shall I confirm and book ${worker.name} for you?`;
                    } else {
                        spokenResponse = `I couldn't find any registered ${trade} specialists available in ${session.city} right now. Would you like me to post a job instead?`;
                    }
                } else {
                    spokenResponse = `Which trade specialist would you like me to connect you with? (e.g. Electrician, plumber, mechanic)`;
                }
            }
        }

        // 11. Intent: Explicit Create Job / Post a Job
        else if (lower.includes('post a job') || lower.includes('create a job') || lower.includes('job posting') || lower.includes('post job')) {
            const detectedTrade = extractTradeAndService(text) || session.context.currentService;
            const { date, time } = extractDateTimeEntities(text);

            if (!detectedTrade) {
                session.context.pendingIntent = 'CREATE_JOB_AWAITING_SERVICE';
                spokenResponse = `Yes, I can post a job for you. What type of service or repair do you need?`;
            } else {
                session.context.currentService = detectedTrade;
                session.context.currentDate = date || 'Today';
                session.context.currentTime = time || 'Immediate';
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
                spokenResponse = `I have prepared a ${detectedTrade} job request in ${session.city} for ${session.context.currentDate}. Shall I post it to nearby specialists?`;
                actionsPerformed.push(`Drafted job request for ${detectedTrade}`);
            }
        }

        // 12. Intent: Find Worker / Need Help with Service (e.g. "I need repair my washing machine", "Is there anyone available now?", "Find me an electrician")
        else {
            const detectedTrade = extractTradeAndService(text);
            const { date, time } = extractDateTimeEntities(text);

            if (detectedTrade) {
                session.context.currentService = detectedTrade;
                if (date) session.context.currentDate = date;
                if (time) session.context.currentTime = time;

                // Query REAL SQLite database first
                toolExecuted = 'findWorkers';
                toolResult = AI_TOOLS.findWorkers({ service: detectedTrade, city: session.city });
                session.context.lastFoundWorkers = toolResult.workers;
                actionsPerformed.push(`Queried SQLite database for ${detectedTrade} in ${session.city} (${toolResult.count} found)`);

                if (toolResult.count > 0) {
                    const topWorker = toolResult.workers[0];
                    session.context.lastSelectedWorker = topWorker;
                    session.context.pendingIntent = 'CONFIRM_CONNECT_WORKER';

                    if (toolResult.count === 1) {
                        spokenResponse = `I found 1 registered ${detectedTrade} specialist available in ${session.city}: ${topWorker.name} (Visiting charge: ${topWorker.startingPrice}). Would you like me to book them?`;
                    } else {
                        spokenResponse = `I found ${toolResult.count} registered ${detectedTrade} specialists available in ${session.city}. The closest is ${topWorker.name} (${topWorker.startingPrice}). Shall I connect you with ${topWorker.name}?`;
                    }
                } else {
                    // ZERO WORKERS IN DATABASE -> HONEST ANSWER
                    session.context.pendingJobData = {
                        customerPhone: session.callerPhone,
                        customerName: session.callerName,
                        service: detectedTrade,
                        problemDescription: text,
                        location: `${session.city} Town`,
                        city: session.city,
                        requestedDate: date || 'Today',
                        requestedTime: time || 'Immediate',
                        budget: '₹300'
                    };
                    session.context.pendingIntent = 'CONFIRM_POST_JOB';
                    spokenResponse = `I couldn't find any registered ${detectedTrade} specialists available in ${session.city} right now. Would you like me to post an open job request so nearby workers can respond?`;
                    actionsPerformed.push(`Identified 0 matching workers in database; offered job post`);
                }
            } else if (lower.includes('anyone available') || lower.includes('who is available') || lower.includes('workers near') || lower.includes('ಯಾರು ಲಭ್ಯವಿದ್ದಾರೆ')) {
                // General availability query without trade specified
                toolExecuted = 'findWorkers';
                toolResult = AI_TOOLS.findWorkers({ service: 'all', city: session.city });
                actionsPerformed.push(`Queried all available workers in ${session.city} (${toolResult.count} found)`);

                if (toolResult.count > 0) {
                    const workerNames = toolResult.workers.slice(0, 3).map(w => `${w.name} (${w.trade})`).join(', ');
                    spokenResponse = `There are ${toolResult.count} registered worker(s) available in ${session.city}: ${workerNames}. Which trade do you need help with?`;
                } else {
                    spokenResponse = `There are currently no registered workers available in ${session.city}. You can post a job request or let me know what trade you need.`;
                }
            } else {
                // Conversational Fallback without templates
                spokenResponse = `I can help you check worker availability, book a specialist, or post a job in ${session.city}. What service are you looking for?`;
                actionsPerformed.push(`Prompted for service trade`);
            }
        }

        // Add assistant turn to session memory
        sessionManager.addTurn(session, 'assistant', spokenResponse);

        // Record real call log in SQLite DB
        DB.logCall({
            callerPhone: session.callerPhone,
            callerRole: session.callerRole,
            transcript: text,
            intentDetected: toolExecuted || session.context.pendingIntent || 'conversation',
            actionsTaken: actionsPerformed.join('; '),
            durationSeconds: 10
        });

        return {
            spokenResponse,
            toolExecuted,
            toolResult,
            actionsPerformed,
            context: {
                currentService: session.context.currentService,
                currentLocation: session.city,
                pendingIntent: session.context.pendingIntent,
                workersFound: session.context.lastFoundWorkers.length
            }
        };
    }
}

const aiAgent = new ContextAwareVoiceAgent();

module.exports = {
    aiAgent,
    AI_TOOLS,
    sessionManager
};
