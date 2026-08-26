/* ==========================================================================
   GigSync — AI caller identity resolution

   Shared by the local server (backend/server.js) and the Vercel serverless
   handler (api/index.js). It lives in one file on purpose: both surfaces hand
   the resolved phone number straight to the AI's worker tools, so if the two
   ever disagreed about who the caller is, one of them would be reading and
   writing the wrong person's real record.
   ========================================================================== */

const DB = require('./database');

/* --------------------------------------------------------------------------
   Rules:

   - A verified session always wins over anything in the request body.
   - Exception: the 3.5mm voice terminal. An admin operator connects a handset on
     behalf of a worker who is physically on the line, so an ADMIN session may
     name the caller. The caller's name and role are then looked up in the
     database — the request body never supplies them.
   - With no verified session a caller is treated as an anonymous customer, and only if
     the number they gave is not a registered account. The old code fell back to a
     hardcoded '9876543210', which silently attached voice registrations and
     availability changes to a phantom account.

   Returns either an identity object or { error, statusCode }.
   -------------------------------------------------------------------------- */
function resolveAiCaller(session, body = {}) {
    const claimedPhone = (body.callerPhone || '').replace(/\D/g, '');

    // Look up whoever the phone number really belongs to.
    const describe = (phone, fallbackRole, fallbackName, fallbackCity) => {
        const worker = DB.getWorkerByPhone(phone);
        const user = DB.getUserByPhone ? DB.getUserByPhone(phone) : null;
        return {
            callerPhone: phone,
            callerRole: worker ? 'worker' : (user ? user.role : fallbackRole),
            callerName: worker ? worker.name : (user ? user.name : fallbackName),
            city: body.city || (worker && worker.city) || (user && user.city) || fallbackCity || 'Ramanagara',
            registeredWorker: Boolean(worker)
        };
    };

    if (session) {
        const sessionPhone = (session.phone || '').replace(/\D/g, '');

        // Voice terminal: an admin dialing in a specific caller.
        if (session.role === 'admin' && claimedPhone && claimedPhone !== sessionPhone) {
            if (claimedPhone.length !== 10) {
                return { error: 'A 10-digit caller phone number is required to connect a call.', statusCode: 400 };
            }
            return { ...describe(claimedPhone, body.callerRole || 'worker', body.callerName || 'Caller', session.city), source: 'terminal_operator' };
        }

        // Everyone else is themselves.
        return { ...describe(sessionPhone, session.role || 'customer', session.name || 'User', session.city), source: 'verified_session' };
    }

    // No verified session.
    //
    // A first-time customer must still be able to use the chatbot before they have an
    // account, so an unauthenticated caller is allowed — but strictly as an ANONYMOUS
    // CUSTOMER. If the number they typed belongs to a registered account we refuse,
    // because otherwise anyone could read a worker's earnings and rewrite their
    // availability just by posting that worker's phone number.
    if (claimedPhone.length === 10) {
        const existingWorker = DB.getWorkerByPhone(claimedPhone);
        const existingUser = DB.getUserByPhone ? DB.getUserByPhone(claimedPhone) : null;
        if (existingWorker || existingUser) {
            return {
                error: 'That number belongs to a registered GigSync account. Please sign in to continue.',
                statusCode: 401
            };
        }
        return {
            callerPhone: claimedPhone,
            callerRole: 'customer',
            callerName: body.callerName || 'Caller',
            city: body.city || 'Ramanagara',
            registeredWorker: false,
            source: 'anonymous_customer'
        };
    }

    return {
        error: 'Caller identity is required. Sign in, or supply the 10-digit phone number of the person on the call.',
        statusCode: 401
    };
}

// Reads the bearer token off a request and returns the real session row, or null.
function getAuthSession(req) {
    const authHeader = (req.headers && req.headers['authorization']) || '';
    if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        return DB.getSession(token);
    }
    return null;
}

module.exports = { resolveAiCaller, getAuthSession };
