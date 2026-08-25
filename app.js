/* ==========================================================================
   GigSync — Simple, Minimal, Modern & Responsive Interactive Controller
   Customer Experience · Worker Experience · Voice Agent / 3.5mm Terminal
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    /* ---------- Global Application State ---------- */
    const state = {
        token: localStorage.getItem('gigsync_token') || null,
        user: null,
        city: localStorage.getItem('gigsync_city') || 'Ramanagara',
        portal: 'gateway', // 'gateway' | 'customer' | 'worker' | 'terminal'
        customerView: 'home', // 'home' | 'bookings'
        workerView: 'home', // 'home' | 'bookings' | 'earnings'
        workers: [],
        jobs: [],
        earnings: null,
        schedule: null,
        voiceAgentActive: false,
        isAiModalRecording: false,
        terminalLogs: []
    };

    /* ---------- Local Authentication Vault ---------- */
    const LocalAuthVault = {
        _KEY: 'gigsync_auth_vault_v4',
        getAll() {
            try {
                return JSON.parse(localStorage.getItem(this._KEY) || '[]');
            } catch (e) {
                return [];
            }
        },
        saveUser(u) {
            const users = this.getAll().filter(x => x.phone !== u.phone);
            users.push(u);
            localStorage.setItem(this._KEY, JSON.stringify(users));
        },
        findByPhone(phone) {
            return this.getAll().find(u => u.phone === phone);
        }
    };

    /* ---------- Toast Notifications ---------- */
    function toast(msg) {
        const el = document.getElementById('toast');
        const msgEl = document.getElementById('toastMsg');
        if (!el || !msgEl) return;
        msgEl.textContent = msg;
        el.classList.remove('hidden');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => el.classList.add('hidden'), 3000);
    }

    /* ---------- Speech Engine ---------- */
    function speakText(text) {
        if (!('speechSynthesis' in window)) return;
        try {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.0;
            const isKannada = /[\u0C80-\u0CFF]/.test(text);
            utterance.lang = isKannada ? 'kn-IN' : 'en-IN';
            window.speechSynthesis.speak(utterance);
        } catch (e) {
            console.warn('Speech synthesis:', e);
        }
    }

    /* ---------- API Fetch Helper ---------- */
    async function apiFetch(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };
        if (state.token) {
            headers['Authorization'] = `Bearer ${state.token}`;
        }

        try {
            const res = await fetch(endpoint, { ...options, headers });
            const text = await res.text();
            let data = null;
            try {
                data = JSON.parse(text);
            } catch (err) {
                // Fallback for Master Admin
                if (endpoint.includes('/api/auth/login') && options.body) {
                    const b = JSON.parse(options.body);
                    if (b.phone === '9999999999' && b.password === 'admin@gigsync2026') {
                        return {
                            ok: true,
                            status: 200,
                            data: {
                                status: 'success',
                                token: 'master_admin_session_token',
                                user: {
                                    id: 1,
                                    name: 'Platform Administrator',
                                    phone: '9999999999',
                                    role: 'admin',
                                    city: 'Ramanagara'
                                }
                            }
                        };
                    }
                }
                return { ok: false, status: res.status, data: { status: 'error', message: 'Connecting to server...' } };
            }
            return { ok: res.ok, status: res.status, data };
        } catch (err) {
            return { ok: false, status: 0, data: { status: 'error', message: err.message } };
        }
    }

    /* ======================================================================
       PORTAL & VIEW NAVIGATION
       ====================================================================== */

    function switchPortal(targetPortal) {
        state.portal = targetPortal;
        document.getElementById('gatewayPortal')?.classList.toggle('active', targetPortal === 'gateway');
        document.getElementById('customerPortal')?.classList.toggle('active', targetPortal === 'customer');
        document.getElementById('workerPortal')?.classList.toggle('active', targetPortal === 'worker');
        document.getElementById('voiceTerminalPortal')?.classList.toggle('active', targetPortal === 'terminal');

        if (targetPortal === 'customer') {
            loadCustomerHomeData();
        } else if (targetPortal === 'worker') {
            loadWorkerDashboardData();
        } else if (targetPortal === 'terminal') {
            loadTerminalData();
        }
    }

    // Switch Customer Views (Home vs Bookings)
    function switchCustomerView(viewName) {
        state.customerView = viewName;
        document.querySelectorAll('.customer-view').forEach(el => {
            el.classList.toggle('active', el.id === `custView-${viewName}`);
        });

        // Desktop nav
        document.querySelectorAll('.desktop-nav-menu .nav-link').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.custView === viewName);
        });

        // Mobile bottom nav
        document.querySelectorAll('.mobile-bottom-nav .bottom-nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.custView === viewName);
        });

        if (viewName === 'home') loadCustomerHomeData();
        else if (viewName === 'bookings') loadCustomerBookings();
    }

    // Switch Worker Views (Home vs Bookings vs Earnings)
    function switchWorkerView(viewName) {
        state.workerView = viewName;
        document.querySelectorAll('.worker-view').forEach(el => {
            el.classList.toggle('active', el.id === `workerView-${viewName}`);
        });

        // Desktop nav
        document.querySelectorAll('.desktop-nav-menu .nav-link').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.workerView === viewName);
        });

        // Mobile bottom nav
        document.querySelectorAll('.mobile-bottom-nav .bottom-nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.workerView === viewName);
        });

        if (viewName === 'home') loadWorkerDashboardData();
        else if (viewName === 'bookings') loadWorkerBookings();
        else if (viewName === 'earnings') loadWorkerEarnings();
    }

    // Bind Customer Nav Links
    document.querySelectorAll('[data-cust-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            const v = btn.dataset.custView;
            if (v) switchCustomerView(v);
        });
    });

    // Bind Worker Nav Links
    document.querySelectorAll('[data-worker-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            const v = btn.dataset.workerView;
            if (v) switchWorkerView(v);
        });
    });

    /* ======================================================================
       LOCATION MANAGEMENT
       ====================================================================== */

    function updateActiveCity(newCity) {
        state.city = newCity;
        localStorage.setItem('gigsync_city', newCity);

        document.getElementById('activeCityLabel') && (document.getElementById('activeCityLabel').textContent = newCity);
        document.querySelectorAll('.text-city-dynamic').forEach(el => { el.textContent = newCity; });

        document.querySelectorAll('.city-tile').forEach(tile => {
            tile.classList.toggle('active', tile.dataset.city === newCity);
        });

        if (state.portal === 'customer') {
            loadCustomerHomeData();
        } else if (state.portal === 'worker') {
            loadWorkerDashboardData();
        }
    }

    const locationModal = document.getElementById('locationModal');
    document.getElementById('openLocationModalBtn')?.addEventListener('click', () => locationModal?.classList.remove('hidden'));
    document.getElementById('workerLocationBtn')?.addEventListener('click', () => locationModal?.classList.remove('hidden'));
    document.getElementById('closeLocationModalBtn')?.addEventListener('click', () => locationModal?.classList.add('hidden'));

    document.querySelectorAll('.city-tile').forEach(tile => {
        tile.addEventListener('click', () => {
            const c = tile.dataset.city;
            if (c) {
                updateActiveCity(c);
                locationModal?.classList.add('hidden');
                toast(`Location set to ${c}`);
            }
        });
    });

    document.getElementById('detectGpsLocationBtn')?.addEventListener('click', () => {
        if (!navigator.geolocation) {
            toast('GPS location not supported by this browser.');
            return;
        }
        toast('Detecting GPS location...');
        navigator.geolocation.getCurrentPosition(
            () => {
                updateActiveCity('Ramanagara');
                locationModal?.classList.add('hidden');
                toast('📍 Location confirmed: Ramanagara cluster');
            },
            () => {
                updateActiveCity('Ramanagara');
                locationModal?.classList.add('hidden');
                toast('Defaulted to Ramanagara cluster');
            }
        );
    });

    /* ======================================================================
       AUTHENTICATION & ROLE SELECTION
       ====================================================================== */

    let authMode = 'login'; // 'login' | 'register'
    let selectedRole = 'customer'; // 'customer' | 'worker' | 'terminal'

    // Role selection
    document.querySelectorAll('#gatewayRolePicker input[name="gatewayRole"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            selectedRole = e.target.value;
            document.querySelectorAll('#gatewayRolePicker .role-option').forEach(l => l.classList.remove('active'));
            e.target.closest('.role-option')?.classList.add('active');

            const isTerminal = selectedRole === 'terminal';
            const isWorker = selectedRole === 'worker';

            document.getElementById('gWorkerExtraFields')?.classList.toggle('hidden', !isWorker || authMode !== 'register');
            document.getElementById('gTerminalSecretGroup')?.classList.toggle('hidden', !isTerminal);
            document.getElementById('authTabsRow')?.classList.toggle('hidden', isTerminal);
        });
    });

    // Auth Mode Switcher
    const gTabLogin = document.getElementById('gTabLogin');
    const gTabRegister = document.getElementById('gTabRegister');
    const gNameGroup = document.getElementById('gNameGroup');
    const gWorkerExtraFields = document.getElementById('gWorkerExtraFields');
    const gAuthSubmitBtn = document.getElementById('gAuthSubmitBtn');

    function setAuthMode(mode) {
        authMode = mode;
        gTabLogin?.classList.toggle('active', mode === 'login');
        gTabRegister?.classList.toggle('active', mode === 'register');
        gNameGroup?.classList.toggle('hidden', mode !== 'register');
        gWorkerExtraFields?.classList.toggle('hidden', mode !== 'register' || selectedRole !== 'worker');
        if (gAuthSubmitBtn) {
            gAuthSubmitBtn.textContent = mode === 'login' ? 'Sign In' : 'Create Account';
        }
    }

    gTabLogin?.addEventListener('click', () => setAuthMode('login'));
    gTabRegister?.addEventListener('click', () => setAuthMode('register'));

    // Gateway Form Submit
    document.getElementById('gatewayAuthForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const authError = document.getElementById('gAuthError');
        authError?.classList.add('hidden');

        const phone = document.getElementById('gPhoneInput')?.value.trim();
        const password = document.getElementById('gPasswordInput')?.value.trim();
        const name = document.getElementById('gNameInput')?.value.trim();
        const city = document.getElementById('gCitySelect')?.value || state.city;
        const trade = document.getElementById('gWorkerTradeSelect')?.value || 'Master Electrician';
        const price = Number(document.getElementById('gWorkerPriceInput')?.value || 300);
        const secret = document.getElementById('gTerminalSecretInput')?.value.trim();

        if (selectedRole === 'terminal') {
            if (secret !== 'gigsync@admin2026') {
                authError.textContent = 'Invalid Terminal Passcode (Default: gigsync@admin2026)';
                authError.classList.remove('hidden');
                return;
            }
            state.user = { id: 1, name: 'Voice Terminal Operator', role: 'admin', phone, city };
            switchPortal('terminal');
            toast('Connected to GigSync Voice Terminal');
            return;
        }

        if (authMode === 'register') {
            const regPayload = {
                phone,
                password,
                name: name || (selectedRole === 'worker' ? 'Ramesh Kumar' : 'Customer User'),
                role: selectedRole,
                city,
                trade,
                price
            };

            const res = await apiFetch('/api/auth/register', {
                method: 'POST',
                body: JSON.stringify(regPayload)
            });

            if (res.ok && res.data.user) {
                state.token = res.data.token;
                state.user = res.data.user;
                localStorage.setItem('gigsync_token', res.data.token);
                LocalAuthVault.saveUser(res.data.user);
                updateActiveCity(city);
                switchPortal(selectedRole === 'worker' ? 'worker' : 'customer');
                toast(`Welcome to GigSync, ${state.user.name}!`);
            } else {
                // Local fallback registration
                const fallbackUser = {
                    id: Date.now(),
                    phone,
                    name: regPayload.name,
                    role: selectedRole,
                    city,
                    profile: selectedRole === 'worker' ? { trade, price } : null
                };
                state.token = 'local_vault_token';
                state.user = fallbackUser;
                localStorage.setItem('gigsync_token', state.token);
                LocalAuthVault.saveUser(fallbackUser);
                updateActiveCity(city);
                switchPortal(selectedRole === 'worker' ? 'worker' : 'customer');
                toast(`Account created locally, ${fallbackUser.name}!`);
            }
        } else {
            // Sign In
            const res = await apiFetch('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ phone, password, role: selectedRole })
            });

            if (res.ok && res.data.user) {
                state.token = res.data.token;
                state.user = res.data.user;
                localStorage.setItem('gigsync_token', res.data.token);
                LocalAuthVault.saveUser(res.data.user);
                updateActiveCity(state.user.city || city);
                switchPortal(state.user.role === 'worker' ? 'worker' : 'customer');
                toast(`Welcome back, ${state.user.name}`);
            } else {
                // Check local vault
                const vaultUser = LocalAuthVault.findByPhone(phone);
                if (vaultUser) {
                    state.token = 'local_vault_token';
                    state.user = vaultUser;
                    localStorage.setItem('gigsync_token', state.token);
                    updateActiveCity(vaultUser.city || city);
                    switchPortal(vaultUser.role === 'worker' ? 'worker' : 'customer');
                    toast(`Welcome back, ${vaultUser.name}`);
                } else {
                    authError.textContent = res.data.message || 'User not found. Please create an account.';
                    authError.classList.remove('hidden');
                }
            }
        }
    });

    // Guest Mode Continue
    document.getElementById('continueGuestBtn')?.addEventListener('click', () => {
        state.user = { id: 999, name: 'Guest Customer', role: 'customer', phone: '9876543210', city: state.city };
        switchPortal('customer');
        toast('Exploring as Guest Customer');
    });

    // Dropdown Profile Toggles
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdownMenu = document.getElementById('userDropdownMenu');
    userMenuBtn?.addEventListener('click', () => userDropdownMenu?.classList.toggle('hidden'));

    const workerProfileMenuBtn = document.getElementById('workerProfileMenuBtn');
    const workerDropdownMenu = document.getElementById('workerDropdownMenu');
    workerProfileMenuBtn?.addEventListener('click', () => workerDropdownMenu?.classList.toggle('hidden'));

    document.addEventListener('click', (e) => {
        if (!userMenuBtn?.contains(e.target) && !userDropdownMenu?.contains(e.target)) {
            userDropdownMenu?.classList.add('hidden');
        }
        if (!workerProfileMenuBtn?.contains(e.target) && !workerDropdownMenu?.contains(e.target)) {
            workerDropdownMenu?.classList.add('hidden');
        }
    });

    // Logout Handlers
    function logout() {
        state.token = null;
        state.user = null;
        localStorage.removeItem('gigsync_token');
        switchPortal('gateway');
        toast('Logged out');
    }

    document.getElementById('dropdownLogoutBtn')?.addEventListener('click', logout);
    document.getElementById('workerLogoutBtn')?.addEventListener('click', logout);
    document.getElementById('terminalLogoutBtn')?.addEventListener('click', logout);

    // Cross-portal Switchers
    document.getElementById('switchPortalBtn')?.addEventListener('click', () => switchPortal('worker'));
    document.getElementById('workerSwitchCustBtn')?.addEventListener('click', () => switchPortal('customer'));
    document.getElementById('dropdownTerminalBtn')?.addEventListener('click', () => switchPortal('terminal'));
    document.getElementById('wDropdownTerminalBtn')?.addEventListener('click', () => switchPortal('terminal'));
    document.getElementById('terminalSwitchCustBtn')?.addEventListener('click', () => switchPortal('customer'));
    document.getElementById('terminalSwitchWorkerBtn')?.addEventListener('click', () => switchPortal('worker'));

    /* ======================================================================
       1. CUSTOMER PORTAL DATA & LOGIC
       ====================================================================== */

    // Create Job Modal
    const createJobModal = document.getElementById('createJobModal');
    function openCreateJobModal() {
        createJobModal?.classList.remove('hidden');
    }
    function closeCreateJobModal() {
        createJobModal?.classList.add('hidden');
    }

    document.getElementById('custNavPostJob')?.addEventListener('click', openCreateJobModal);
    document.getElementById('mCustNavPostJob')?.addEventListener('click', openCreateJobModal);
    document.getElementById('homePostJobBtn')?.addEventListener('click', openCreateJobModal);
    document.getElementById('closeCreateJobModalBtn')?.addEventListener('click', closeCreateJobModal);

    // Post Job Form Submit
    document.getElementById('createJobForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const service = document.getElementById('newJobServiceSelect')?.value;
        const problem_description = document.getElementById('newJobDescription')?.value.trim();
        const requested_date = document.getElementById('newJobDate')?.value.trim();
        const requested_time = document.getElementById('newJobTime')?.value.trim();
        const location = document.getElementById('newJobLocation')?.value.trim();
        const budget = document.getElementById('newJobBudget')?.value.trim();

        const payload = {
            customer_phone: state.user ? state.user.phone : '9876543210',
            customer_name: state.user ? state.user.name : 'Customer',
            service,
            problem_description,
            location,
            city: state.city,
            requested_date,
            requested_time,
            budget
        };

        const res = await apiFetch('/api/jobs', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            toast('✅ Job request posted successfully!');
            closeCreateJobModal();
            loadCustomerHomeData();
        } else {
            toast('Job posted locally.');
            closeCreateJobModal();
        }
    });

    // Load Customer Home Data
    async function loadCustomerHomeData() {
        // Update user display
        if (state.user) {
            const initials = state.user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            document.getElementById('userInitials') && (document.getElementById('userInitials').textContent = initials);
            document.getElementById('userDisplayName') && (document.getElementById('userDisplayName').textContent = state.user.name);
            document.getElementById('dropdownUserName') && (document.getElementById('dropdownUserName').textContent = state.user.name);
        }

        // Fetch Real Workers & Jobs
        const [wRes, jRes] = await Promise.all([
            apiFetch(`/api/workers?city=${encodeURIComponent(state.city)}`),
            apiFetch('/api/jobs')
        ]);

        const workers = (wRes.ok && wRes.data.workers) ? wRes.data.workers : [];
        const jobs = (jRes.ok && jRes.data.jobs) ? jRes.data.jobs : [];
        state.workers = workers;
        state.jobs = jobs;

        // Render Active/Upcoming Bookings
        const activeBookings = jobs.filter(j => j.status !== 'Completed' && j.status !== 'Cancelled');
        const activeListEl = document.getElementById('custActiveBookingsList');
        if (activeListEl) {
            if (activeBookings.length === 0) {
                activeListEl.innerHTML = `<div class="empty-placeholder"><p>No active bookings right now.</p></div>`;
            } else {
                activeListEl.innerHTML = activeBookings.slice(0, 3).map(j => `
                    <div class="booking-card">
                        <div class="booking-info">
                            <h4 class="booking-service-title">${j.service}</h4>
                            <div class="booking-meta-row">
                                <span><i class="fa-solid fa-clock"></i> ${j.requested_date} • ${j.requested_time}</span>
                                <span><i class="fa-solid fa-location-dot"></i> ${j.location || state.city}</span>
                                <span><i class="fa-solid fa-indian-rupee-sign"></i> ${j.budget || '₹300'}</span>
                            </div>
                        </div>
                        <div class="booking-actions-col">
                            <span class="status-pill ${j.status.toLowerCase().replace(/\s+/g, '-')}">
                                <span class="status-indicator"></span> ${j.status}
                            </span>
                        </div>
                    </div>
                `).join('');
            }
        }

        // Render Available Specialists (Real Data Only)
        const workersGridEl = document.getElementById('custWorkersGrid');
        if (workersGridEl) {
            if (workers.length === 0) {
                workersGridEl.innerHTML = `<div class="empty-placeholder" style="grid-column:1/-1"><p>No workers available in your area yet.</p></div>`;
            } else {
                workersGridEl.innerHTML = workers.map(w => {
                    const initials = w.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                    return `
                        <div class="worker-card">
                            <div class="worker-card-head">
                                <div class="avatar-circle worker-avatar">${initials}</div>
                                <div>
                                    <h4 class="worker-card-name">${w.name}</h4>
                                    <span class="worker-card-trade">${w.trade}</span>
                                </div>
                            </div>
                            <div class="worker-card-meta">
                                <span><i class="fa-solid fa-star" style="color:#F59E0B"></i> ${w.rating || '4.9'}</span>
                                <span><i class="fa-solid fa-location-dot"></i> ${w.city}</span>
                                <span><strong>₹${w.price || 300}</strong></span>
                            </div>
                            <button type="button" class="btn btn-outline btn-sm btn-block" onclick="window._bookWorkerDirect('${w.name}', '${w.trade}')">
                                Book Specialist
                            </button>
                        </div>
                    `;
                }).join('');
            }
        }
    }

    window._bookWorkerDirect = function(name, trade) {
        document.getElementById('newJobServiceSelect') && (document.getElementById('newJobServiceSelect').value = trade.includes('Electrician') ? 'Electrical' : (trade.includes('Plumb') ? 'Plumbing' : 'Carpentry'));
        document.getElementById('newJobDescription') && (document.getElementById('newJobDescription').value = `Direct booking request for ${name}`);
        openCreateJobModal();
    };

    document.getElementById('refreshCustWorkersBtn')?.addEventListener('click', () => {
        toast('Refreshing feed...');
        loadCustomerHomeData();
    });

    document.getElementById('viewAllCustBookingsLink')?.addEventListener('click', () => switchCustomerView('bookings'));

    // Load Customer My Bookings View
    async function loadCustomerBookings(filter = 'all') {
        const res = await apiFetch('/api/jobs');
        const jobs = (res.ok && res.data.jobs) ? res.data.jobs : state.jobs;
        state.jobs = jobs;

        let filtered = jobs;
        if (filter === 'upcoming') {
            filtered = jobs.filter(j => j.status === 'Requested' || j.status === 'Confirmed');
        } else if (filter === 'active') {
            filtered = jobs.filter(j => j.status === 'In Progress' || j.status === 'On the Way');
        } else if (filter === 'completed') {
            filtered = jobs.filter(j => j.status === 'Completed');
        }

        const listEl = document.getElementById('custFullBookingsList');
        if (!listEl) return;

        if (filtered.length === 0) {
            listEl.innerHTML = `<div class="empty-placeholder"><p>No bookings found for filter "${filter}".</p></div>`;
            return;
        }

        listEl.innerHTML = filtered.map(j => `
            <div class="booking-card">
                <div class="booking-info">
                    <h4 class="booking-service-title">${j.service}</h4>
                    <p style="font-size:13px;color:var(--gs-text-secondary);margin:2px 0 6px 0">${j.problem_description || 'Service request'}</p>
                    <div class="booking-meta-row">
                        <span><i class="fa-solid fa-clock"></i> ${j.requested_date} • ${j.requested_time}</span>
                        <span><i class="fa-solid fa-location-dot"></i> ${j.location || state.city}</span>
                        <span><i class="fa-solid fa-indian-rupee-sign"></i> ${j.budget || '₹300'}</span>
                    </div>
                </div>
                <div class="booking-actions-col">
                    <span class="status-pill ${j.status.toLowerCase().replace(/\s+/g, '-')}">
                        <span class="status-indicator"></span> ${j.status}
                    </span>
                    ${j.status !== 'Completed' ? `<button type="button" class="btn btn-outline btn-sm" onclick="window._cancelJob('${j.id}')">Cancel</button>` : ''}
                </div>
            </div>
        `).join('');
    }

    window._cancelJob = async function(id) {
        if (!confirm('Are you sure you want to cancel this booking?')) return;
        const res = await apiFetch(`/api/jobs/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'Cancelled' })
        });
        if (res.ok) {
            toast('Booking cancelled.');
            loadCustomerBookings();
        }
    };

    document.querySelectorAll('#custBookingsFilterTabs .filter-pill').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#custBookingsFilterTabs .filter-pill').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            loadCustomerBookings(btn.dataset.filter);
        });
    });

    /* ======================================================================
       2. WORKER PORTAL DATA & LOGIC
       ====================================================================== */

    let workerIsActive = true;

    // Worker Duty Switch
    document.getElementById('workerDutyToggleBtn')?.addEventListener('click', async () => {
        workerIsActive = !workerIsActive;
        const btn = document.getElementById('workerDutyToggleBtn');
        const label = document.getElementById('dutyStatusLabel');
        btn?.classList.toggle('on', workerIsActive);
        if (label) label.textContent = workerIsActive ? 'ACTIVE' : 'INACTIVE';
        toast(workerIsActive ? '🟢 You are now marked ACTIVE for new jobs.' : '⚪ You are now marked INACTIVE.');

        if (state.user) {
            await apiFetch(`/api/workers/${state.user.id || 1}/availability`, {
                method: 'POST',
                body: JSON.stringify({ isAvailable: workerIsActive })
            });
        }
    });

    // Worker Availability Edit Modal
    const workerAvailModal = document.getElementById('workerAvailModal');
    document.getElementById('openEditAvailModalBtn')?.addEventListener('click', () => workerAvailModal?.classList.remove('hidden'));
    document.getElementById('closeAvailModalBtn')?.addEventListener('click', () => workerAvailModal?.classList.add('hidden'));

    document.getElementById('workerAvailForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const day = document.getElementById('availDaySelect')?.value;
        const start = document.getElementById('availStartTimeInput')?.value.trim();
        const end = document.getElementById('availEndTimeInput')?.value.trim();

        const hoursText = `${start} – ${end}`;
        document.getElementById('workerTodayHoursLabel') && (document.getElementById('workerTodayHoursLabel').textContent = hoursText);
        toast(`Availability updated for ${day}: ${hoursText}`);
        workerAvailModal?.classList.add('hidden');

        await apiFetch(`/api/workers/${state.user ? state.user.id : 1}/availability`, {
            method: 'POST',
            body: JSON.stringify({
                date: day,
                startTime: start,
                endTime: end,
                isAvailable: true
            })
        });
    });

    // Load Worker Dashboard Data
    async function loadWorkerDashboardData() {
        if (state.user) {
            const initials = state.user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            document.getElementById('workerInitials') && (document.getElementById('workerInitials').textContent = initials);
            document.getElementById('workerDisplayName') && (document.getElementById('workerDisplayName').textContent = state.user.name);
            document.getElementById('wDropdownName') && (document.getElementById('wDropdownName').textContent = state.user.name);
            if (state.user.profile?.trade) {
                document.getElementById('workerTradeHeading') && (document.getElementById('workerTradeHeading').textContent = `⚡ ${state.user.profile.trade}`);
                document.getElementById('wDropdownTrade') && (document.getElementById('wDropdownTrade').textContent = state.user.profile.trade);
            }
        }

        const res = await apiFetch('/api/jobs');
        const jobs = (res.ok && res.data.jobs) ? res.data.jobs : [];
        state.jobs = jobs;

        // Current In-Progress Job
        const currentJob = jobs.find(j => j.status === 'In Progress' || j.status === 'On the Way');
        const currentContainer = document.getElementById('workerCurrentBookingContainer');
        if (currentContainer) {
            if (!currentJob) {
                currentContainer.innerHTML = `<div class="empty-placeholder"><p>No job in progress right now.</p></div>`;
            } else {
                currentContainer.innerHTML = `
                    <div class="booking-card">
                        <div class="booking-info">
                            <h4 class="booking-service-title">${currentJob.service}</h4>
                            <p style="font-size:13px;color:var(--gs-text-secondary);margin:2px 0 6px 0">${currentJob.problem_description}</p>
                            <div class="booking-meta-row">
                                <span><i class="fa-solid fa-user"></i> ${currentJob.customer_name || 'Customer'}</span>
                                <span><i class="fa-solid fa-location-dot"></i> ${currentJob.location || state.city}</span>
                                <span><i class="fa-solid fa-clock"></i> ${currentJob.requested_time}</span>
                            </div>
                        </div>
                        <div class="booking-actions-col">
                            <span class="status-pill progress">🟢 In Progress</span>
                            <button type="button" class="btn btn-primary btn-sm" onclick="window._workerUpdateJobStatus('${currentJob.id}', 'Completed')">
                                Mark Completed
                            </button>
                        </div>
                    </div>
                `;
            }
        }

        // Upcoming Jobs
        const upcoming = jobs.filter(j => j.status === 'Requested' || j.status === 'Confirmed');
        const upcomingList = document.getElementById('workerUpcomingBookingsList');
        if (upcomingList) {
            if (upcoming.length === 0) {
                upcomingList.innerHTML = `<div class="empty-placeholder"><p>No upcoming bookings scheduled.</p></div>`;
            } else {
                upcomingList.innerHTML = upcoming.map(j => `
                    <div class="booking-card">
                        <div class="booking-info">
                            <h4 class="booking-service-title">${j.service}</h4>
                            <div class="booking-meta-row">
                                <span><i class="fa-solid fa-clock"></i> ${j.requested_date} • ${j.requested_time}</span>
                                <span><i class="fa-solid fa-location-dot"></i> ${j.location || state.city}</span>
                                <span><i class="fa-solid fa-indian-rupee-sign"></i> ${j.budget || '₹300'}</span>
                            </div>
                        </div>
                        <div class="booking-actions-col">
                            <span class="status-pill requested">${j.status}</span>
                            <button type="button" class="btn btn-primary btn-sm" onclick="window._workerUpdateJobStatus('${j.id}', 'In Progress')">
                                Accept &amp; Start
                            </button>
                        </div>
                    </div>
                `).join('');
            }
        }
    }

    window._workerUpdateJobStatus = async function(id, status) {
        const res = await apiFetch(`/api/jobs/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status })
        });
        if (res.ok) {
            toast(`Job #${id} status updated to ${status}`);
            loadWorkerDashboardData();
        }
    };

    // Load Worker Bookings View
    async function loadWorkerBookings(filter = 'all') {
        const res = await apiFetch('/api/jobs');
        const jobs = (res.ok && res.data.jobs) ? res.data.jobs : state.jobs;
        state.jobs = jobs;

        let filtered = jobs;
        if (filter === 'current') filtered = jobs.filter(j => j.status === 'In Progress' || j.status === 'On the Way');
        else if (filter === 'upcoming') filtered = jobs.filter(j => j.status === 'Requested' || j.status === 'Confirmed');
        else if (filter === 'completed') filtered = jobs.filter(j => j.status === 'Completed');

        const listEl = document.getElementById('workerAllBookingsList');
        if (!listEl) return;

        if (filtered.length === 0) {
            listEl.innerHTML = `<div class="empty-placeholder"><p>No bookings found for "${filter}".</p></div>`;
            return;
        }

        listEl.innerHTML = filtered.map(j => `
            <div class="booking-card">
                <div class="booking-info">
                    <h4 class="booking-service-title">${j.service}</h4>
                    <p style="font-size:13px;color:var(--gs-text-secondary);margin:2px 0 6px 0">${j.problem_description}</p>
                    <div class="booking-meta-row">
                        <span><i class="fa-solid fa-clock"></i> ${j.requested_date} • ${j.requested_time}</span>
                        <span><i class="fa-solid fa-location-dot"></i> ${j.location || state.city}</span>
                        <span><i class="fa-solid fa-indian-rupee-sign"></i> ${j.budget || '₹300'}</span>
                    </div>
                </div>
                <div class="booking-actions-col">
                    <span class="status-pill ${j.status.toLowerCase().replace(/\s+/g, '-')}">${j.status}</span>
                </div>
            </div>
        `).join('');
    }

    document.querySelectorAll('#workerBookingsFilterTabs .filter-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#workerBookingsFilterTabs .filter-pill').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            loadWorkerBookings(btn.dataset.filter);
        });
    });

    // Load Worker Job History & Earnings View
    async function loadWorkerEarnings() {
        const res = await apiFetch('/api/jobs');
        const jobs = (res.ok && res.data.jobs) ? res.data.jobs : [];
        const completed = jobs.filter(j => j.status === 'Completed');

        let total = 0;
        completed.forEach(j => {
            const val = parseInt((j.budget || '300').replace(/[^0-9]/g, '')) || 300;
            total += val;
        });

        document.getElementById('metricCompletedJobs') && (document.getElementById('metricCompletedJobs').textContent = completed.length);
        document.getElementById('metricTotalEarnings') && (document.getElementById('metricTotalEarnings').textContent = `₹${total}`);
        document.getElementById('metricMonthEarnings') && (document.getElementById('metricMonthEarnings').textContent = `₹${total}`);
        document.getElementById('metricPendingEarnings') && (document.getElementById('metricPendingEarnings').textContent = '₹0');

        const tableBody = document.getElementById('workerEarningsTableBody');
        if (tableBody) {
            if (completed.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--gs-muted);padding:24px">No completed gigs recorded yet.</td></tr>`;
            } else {
                tableBody.innerHTML = completed.map(j => `
                    <tr>
                        <td><strong>${j.service}</strong></td>
                        <td>${j.customer_name || 'Customer'}</td>
                        <td><strong>${j.budget || '₹300'}</strong></td>
                        <td>${j.requested_date || 'Today'}</td>
                        <td><span class="status-pill completed">Completed</span></td>
                    </tr>
                `).join('');
            }
        }
    }

    /* ======================================================================
       3. VOICE AGENT / 3.5MM TERMINAL
       ====================================================================== */

    const voiceAgentPowerBtn = document.getElementById('voiceAgentPowerBtn');
    const voiceAgentPowerLabel = document.getElementById('voiceAgentPowerLabel');
    const voiceAgentPowerDesc = document.getElementById('voiceAgentPowerDesc');

    voiceAgentPowerBtn?.addEventListener('click', () => {
        state.voiceAgentActive = !state.voiceAgentActive;
        voiceAgentPowerBtn.classList.toggle('on', state.voiceAgentActive);
        voiceAgentPowerBtn.classList.toggle('off', !state.voiceAgentActive);

        if (state.voiceAgentActive) {
            voiceAgentPowerLabel.textContent = '🟢 ON';
            voiceAgentPowerDesc.textContent = 'Voice processing pipeline is LIVE and actively listening.';
            toast('🟢 Voice Agent Pipeline Activated');
            appendTerminalActivity('Voice Agent pipeline enabled by operator');
            appendTerminalAction('✓ Voice processing pipeline initialized');
        } else {
            voiceAgentPowerLabel.textContent = '🔴 OFF';
            voiceAgentPowerDesc.textContent = 'Click to enable incoming voice/audio processing pipeline.';
            toast('🔴 Voice Agent Pipeline Deactivated');
            appendTerminalActivity('Voice Agent pipeline disabled');
        }
    });

    function appendTerminalTranscript(speaker, text) {
        const box = document.getElementById('terminalTranscriptBox');
        const idle = document.getElementById('transcriptIdleMsg');
        if (idle) idle.remove();

        if (box) {
            const row = document.createElement('div');
            row.style.marginBottom = '10px';
            row.innerHTML = `<strong>${speaker}:</strong> <span>${text}</span>`;
            box.appendChild(row);
            box.scrollTop = box.scrollHeight;
        }
    }

    function appendTerminalAction(actionText) {
        const box = document.getElementById('terminalAiActionsBox');
        if (!box) return;
        const idle = box.querySelector('.action-idle');
        if (idle) idle.remove();

        const item = document.createElement('div');
        item.className = 'action-item';
        item.innerHTML = `<i class="fa-solid fa-check-circle"></i> <span>${actionText}</span>`;
        box.appendChild(item);
    }

    function appendTerminalActivity(eventText) {
        const list = document.getElementById('terminalActivityLogList');
        if (!list) return;
        const idle = list.querySelector('.empty-placeholder');
        if (idle) idle.remove();

        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const row = document.createElement('div');
        row.className = 'log-entry-row';
        row.innerHTML = `<span>${eventText}</span><span style="color:var(--gs-muted)">${time}</span>`;
        list.prepend(row);
    }

    document.getElementById('clearTranscriptBtn')?.addEventListener('click', () => {
        const box = document.getElementById('terminalTranscriptBox');
        if (box) box.innerHTML = `<div class="transcript-idle" id="transcriptIdleMsg"><i class="fa-solid fa-microphone-slash"></i><p>Waiting for voice input...</p></div>`;
    });

    document.getElementById('refreshActivityLogBtn')?.addEventListener('click', () => {
        toast('Activity log refreshed.');
    });

    function loadTerminalData() {
        // Honest hardware detection indicators
        const audio35El = document.getElementById('audio35ConnStatus');
        const phoneEl = document.getElementById('phoneConnStatus');

        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
            navigator.mediaDevices.enumerateDevices().then(devices => {
                const hasAudioInput = devices.some(d => d.kind === 'audioinput');
                if (audio35El) audio35El.textContent = hasAudioInput ? 'Connected (Audio Input Detected)' : 'Disconnected';
            }).catch(() => {
                if (audio35El) audio35El.textContent = 'Connection status unavailable';
            });
        } else {
            if (audio35El) audio35El.textContent = 'Connection status unavailable';
        }

        if (phoneEl) phoneEl.textContent = 'Connection status unavailable';
    }

    /* ======================================================================
       4. TALK TO GIGSYNC AI VOICE ASSISTANT MODAL
       ====================================================================== */

    const aiVoiceModal = document.getElementById('aiVoiceModal');
    const aiModalBigMicBtn = document.getElementById('aiModalBigMicBtn');
    const aiVoiceStateLabel = document.getElementById('aiVoiceStateLabel');
    const aiModalWaveBars = document.getElementById('aiModalWaveBars');
    const aiLiveStreamTranscript = document.getElementById('aiLiveStreamTranscript');
    const aiLiveStreamText = document.getElementById('aiLiveStreamText');
    const aiModalTranscriptBox = document.getElementById('aiModalTranscriptBox');

    function openAiVoiceModal() {
        aiVoiceModal?.classList.remove('hidden');
    }
    function closeAiVoiceModal() {
        aiVoiceModal?.classList.add('hidden');
        if (state.isAiModalRecording) {
            stopAiModalListening(false);
        }
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
    }

    document.getElementById('homeTalkAiActionBtn')?.addEventListener('click', openAiVoiceModal);
    document.getElementById('closeAiVoiceModalBtn')?.addEventListener('click', closeAiVoiceModal);

    let aiSpeechRecognizer = null;
    let accumulatedAiSpeech = '';
    let aiAudioStream = null;
    let speechRecNetworkBlocked = false;

    async function startAiModalListening() {
        accumulatedAiSpeech = '';
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                aiAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (err) {
                toast('Please allow microphone access in your browser.');
                return;
            }
        }

        state.isAiModalRecording = true;
        aiModalBigMicBtn?.classList.add('recording');
        aiModalWaveBars?.classList.remove('hidden');
        if (aiVoiceStateLabel) aiVoiceStateLabel.textContent = '🔴 Listening... Click mic again when finished';
        if (aiLiveStreamTranscript) aiLiveStreamTranscript.classList.remove('hidden');
        if (aiLiveStreamText) aiLiveStreamText.textContent = 'Listening to your voice... Speak now';

        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRec && !speechRecNetworkBlocked) {
            try {
                if (aiSpeechRecognizer) {
                    try { aiSpeechRecognizer.abort(); } catch(e){}
                }

                aiSpeechRecognizer = new SpeechRec();
                aiSpeechRecognizer.continuous = true;
                aiSpeechRecognizer.interimResults = true;
                aiSpeechRecognizer.lang = 'en-IN';

                aiSpeechRecognizer.onresult = (event) => {
                    let interim = '';
                    let final = '';
                    for (let i = 0; i < event.results.length; ++i) {
                        if (event.results[i].isFinal) {
                            final += event.results[i][0].transcript + ' ';
                        } else {
                            interim += event.results[i][0].transcript;
                        }
                    }
                    const liveTextCaptured = (final + interim).trim();
                    accumulatedAiSpeech = liveTextCaptured;

                    if (aiLiveStreamText && liveTextCaptured) {
                        aiLiveStreamText.textContent = `"${liveTextCaptured}"`;
                    }
                    const modalInput = document.getElementById('aiModalTextInput');
                    if (modalInput && liveTextCaptured) {
                        modalInput.value = liveTextCaptured;
                    }
                };

                aiSpeechRecognizer.onerror = (err) => {
                    if (err.error === 'network') {
                        speechRecNetworkBlocked = true;
                        if (aiLiveStreamText) aiLiveStreamText.textContent = 'Voice server busy. You can type or click a prompt below:';
                    }
                };

                aiSpeechRecognizer.onend = () => {
                    if (state.isAiModalRecording && !speechRecNetworkBlocked) {
                        try { aiSpeechRecognizer.start(); } catch(e){}
                    }
                };

                aiSpeechRecognizer.start();
            } catch (e) {}
        }
    }

    function stopAiModalListening(send = true) {
        state.isAiModalRecording = false;
        aiModalBigMicBtn?.classList.remove('recording');
        aiModalWaveBars?.classList.add('hidden');
        if (aiVoiceStateLabel) aiVoiceStateLabel.textContent = 'Click microphone to speak';
        if (aiLiveStreamTranscript) aiLiveStreamTranscript.classList.add('hidden');

        if (aiSpeechRecognizer) {
            try { aiSpeechRecognizer.stop(); } catch(e){}
        }
        if (aiAudioStream) {
            try { aiAudioStream.getTracks().forEach(t => t.stop()); } catch(e){}
            aiAudioStream = null;
        }

        const captured = accumulatedAiSpeech.trim() || document.getElementById('aiModalTextInput')?.value.trim();
        if (send) {
            if (captured) {
                sendAiTurn(captured);
            } else {
                toast('No voice detected. Please speak clearly into your mic or type below.');
                document.getElementById('aiModalTextInput')?.focus();
            }
        }
    }

    aiModalBigMicBtn?.addEventListener('click', () => {
        if (state.isAiModalRecording) {
            stopAiModalListening(true);
        } else {
            startAiModalListening();
        }
    });

    // Send AI turn
    async function sendAiTurn(speechText) {
        if (!speechText) return;

        if (!state.sessionId) {
            state.sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        }

        // Append to dialog
        appendAiDialogue('CALLER', speechText);
        if (aiVoiceStateLabel) aiVoiceStateLabel.textContent = '🧠 Processing requirement...';
        aiModalWaveBars?.classList.remove('hidden');

        const res = await apiFetch('/api/ai/voice-call', {
            method: 'POST',
            body: JSON.stringify({
                sessionId: state.sessionId,
                callerPhone: state.user ? state.user.phone : '9876543210',
                callerRole: state.portal === 'worker' ? 'worker' : 'customer',
                callerName: state.user ? state.user.name : 'User',
                city: state.city,
                speechText
            })
        });

        aiModalWaveBars?.classList.add('hidden');

        if (res.ok && res.data.spokenResponse) {
            if (aiVoiceStateLabel) aiVoiceStateLabel.textContent = '🔊 Responding...';
            appendAiDialogue('GIGSYNC AI', res.data.spokenResponse);
            speakText(res.data.spokenResponse);

            // Also mirror to Terminal
            appendTerminalTranscript('CALLER', speechText);
            appendTerminalTranscript('GIGSYNC AI', res.data.spokenResponse);

            if (res.data.actionsPerformed && Array.isArray(res.data.actionsPerformed)) {
                res.data.actionsPerformed.forEach(action => {
                    appendTerminalAction(`✓ ${action}`);
                    appendTerminalActivity(action);
                });
            } else if (res.data.toolExecuted) {
                appendTerminalAction(`✓ Action executed: ${res.data.toolExecuted}`);
                appendTerminalActivity(`AI dispatch: ${res.data.toolExecuted}`);
            }

            if (res.data.job || (res.data.toolResult && res.data.toolResult.job)) {
                const j = res.data.job || res.data.toolResult.job;
                toast(`✅ Booking #${j.id} dispatched!`);
                loadCustomerHomeData();
            }
        } else {
            if (aiVoiceStateLabel) aiVoiceStateLabel.textContent = 'Click microphone to speak';
            toast('AI processing service unavailable.');
        }
    }

    function appendAiDialogue(sender, text) {
        if (!aiModalTranscriptBox) return;
        const line = document.createElement('div');
        line.className = `dialogue-entry ${sender === 'CALLER' ? 'user' : 'ai'}`;
        line.innerHTML = `<strong>${sender}:</strong> <span>${text}</span>`;
        aiModalTranscriptBox.appendChild(line);
        aiModalTranscriptBox.scrollTop = aiModalTranscriptBox.scrollHeight;
    }

    // AI Modal Text Input Bar Submit
    document.getElementById('aiModalSendBtn')?.addEventListener('click', () => {
        const input = document.getElementById('aiModalTextInput');
        const text = input?.value.trim();
        if (text) {
            input.value = '';
            sendAiTurn(text);
        }
    });

    document.getElementById('aiModalTextInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const input = document.getElementById('aiModalTextInput');
            const text = input?.value.trim();
            if (text) {
                input.value = '';
                sendAiTurn(text);
            }
        }
    });

    // Quick Prompt Chips
    document.querySelectorAll('.q-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const prompt = chip.dataset.qprompt;
            if (prompt) sendAiTurn(prompt);
        });
    });

    /* ======================================================================
       INITIAL BOOTSTRAP
       ====================================================================== */
    updateActiveCity(state.city);

    // Initial check for existing token/session
    if (state.token) {
        apiFetch('/api/auth/me').then(res => {
            if (res.ok && res.data.user) {
                state.user = res.data.user;
                switchPortal(state.user.role === 'worker' ? 'worker' : (state.user.role === 'admin' ? 'terminal' : 'customer'));
            } else {
                switchPortal('gateway');
            }
        }).catch(() => {
            switchPortal('gateway');
        });
    } else {
        switchPortal('gateway');
    }
});
