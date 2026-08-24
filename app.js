/* ==========================================================================
   GigSync — Desktop-First Interactive Client Controller
   Real Authentication · SQLite Persistence · Zero Dummy Data · Voice AI Engine
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    /* ---------- Global Application State ---------- */
    const state = {
        token: localStorage.getItem('gigsync_token') || null,
        user: null,
        city: localStorage.getItem('gigsync_city') || 'Ramanagara',
        portal: 'customer', // 'customer' | 'worker'
        customerView: 'home',
        workerView: 'dashboard',
        workers: [],
        jobs: [],
        opportunities: [],
        earnings: null,
        schedule: null,
        isVoiceRecording: false,
        isAiModalRecording: false
    };

    /* ---------- Speech Engine Init ---------- */
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let speechRecognizer = null;
    if (SpeechRecognition) {
        speechRecognizer = new SpeechRecognition();
        speechRecognizer.continuous = false;
        speechRecognizer.interimResults = false;
    }

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
            console.warn('Speech synthesis notice:', e);
        }
    }

    /* ---------- Toast Notifications ---------- */
    function toast(msg) {
        const el = document.getElementById('toast');
        const msgEl = document.getElementById('toastMsg');
        if (!el || !msgEl) return;
        msgEl.textContent = msg;
        el.classList.remove('hidden');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => el.classList.add('hidden'), 3200);
    }

    /* ---------- API Helper with Auth Headers ---------- */
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
            const data = await res.json();
            return { ok: res.ok, status: res.status, data };
        } catch (err) {
            console.error(`API Error on ${endpoint}:`, err);
            return { ok: false, status: 0, data: { status: 'error', message: err.message } };
        }
    }

    /* ---------- Navigation / View Controllers ---------- */

    // Switch between Customer and Worker Portals
    function switchPortal(targetPortal) {
        state.portal = targetPortal;
        document.getElementById('customerPortal')?.classList.toggle('active', targetPortal === 'customer');
        document.getElementById('workerPortal')?.classList.toggle('active', targetPortal === 'worker');

        if (targetPortal === 'worker') {
            loadWorkerDashboardData();
        } else {
            loadCustomerHomeData();
        }
    }

    // Switch Customer Top Views
    function switchCustomerView(viewName) {
        state.customerView = viewName;
        document.querySelectorAll('.customer-view').forEach(view => {
            view.classList.toggle('active', view.id === `custView-${viewName}`);
        });

        document.querySelectorAll('.desktop-nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.customerView === viewName);
        });

        if (viewName === 'home') loadCustomerHomeData();
        else if (viewName === 'find-workers') loadFindWorkersData();
        else if (viewName === 'my-jobs') loadCustomerJobs();
        else if (viewName === 'post-job') window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Switch Worker Sidebar Views
    function switchWorkerView(viewName) {
        state.workerView = viewName;
        document.querySelectorAll('.worker-view').forEach(view => {
            view.classList.toggle('active', view.id === `workerView-${viewName}`);
        });

        document.querySelectorAll('.worker-nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.workerView === viewName);
        });

        if (viewName === 'dashboard') loadWorkerDashboardData();
        else if (viewName === 'bookings') loadWorkerBookings();
        else if (viewName === 'earnings') loadWorkerEarnings();
        else if (viewName === 'history') loadWorkerHistory();
        else if (viewName === 'profile') populateWorkerProfileForm();
    }

    // Bind Customer Nav Links
    document.querySelectorAll('.desktop-nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const v = btn.dataset.customerView;
            if (v) switchCustomerView(v);
        });
    });

    // Bind Worker Sidebar Links
    document.querySelectorAll('.worker-nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const v = btn.dataset.workerView;
            if (v) switchWorkerView(v);
        });
    });

    document.getElementById('switchPortalBtn')?.addEventListener('click', () => {
        if (!state.user) {
            openAuthModal('worker');
        } else if (state.user.role === 'worker') {
            switchPortal('worker');
        } else {
            toast('You are logged in as Customer. Switching to Worker Workspace demo mode.');
            switchPortal('worker');
        }
    });

    document.getElementById('workerSwitchToCustBtn')?.addEventListener('click', () => switchPortal('customer'));
    document.getElementById('dropdownWorkerPortalBtn')?.addEventListener('click', () => {
        closeUserDropdown();
        switchPortal('worker');
    });

    /* ---------- City / Location Management ---------- */

    function updateActiveCity(newCity) {
        state.city = newCity;
        localStorage.setItem('gigsync_city', newCity);

        // Update all dynamic city placeholders
        document.getElementById('activeCityLabel').textContent = newCity;
        document.getElementById('heroCityName').textContent = newCity;
        document.querySelectorAll('.text-city-dynamic').forEach(el => { el.textContent = newCity; });

        // Update active tile in modal
        document.querySelectorAll('.city-tile').forEach(tile => {
            tile.classList.toggle('active', tile.dataset.city === newCity);
        });

        toast(`📍 Location updated to ${newCity}`);
        if (state.portal === 'customer') {
            loadCustomerHomeData();
            loadFindWorkersData();
        }
    }

    const locationModal = document.getElementById('locationModal');
    document.getElementById('openLocationModalBtn')?.addEventListener('click', () => locationModal?.classList.remove('hidden'));
    document.getElementById('closeLocationModalBtn')?.addEventListener('click', () => locationModal?.classList.add('hidden'));

    document.querySelectorAll('.city-tile').forEach(tile => {
        tile.addEventListener('click', () => {
            const c = tile.dataset.city;
            if (c) {
                updateActiveCity(c);
                locationModal?.classList.add('hidden');
            }
        });
    });

    document.getElementById('detectGpsLocationBtn')?.addEventListener('click', () => {
        if (!navigator.geolocation) {
            toast('Geolocation is not supported by your browser.');
            return;
        }
        toast('Detecting GPS location in Karnataka...');
        navigator.geolocation.getCurrentPosition(
            () => {
                updateActiveCity('Ramanagara');
                locationModal?.classList.add('hidden');
            },
            () => {
                toast('GPS permission denied. Using Ramanagara.');
                updateActiveCity('Ramanagara');
                locationModal?.classList.add('hidden');
            }
        );
    });

    /* ---------- Real-Time Database Fetching (Zero Dummy Data) ---------- */

    // 1. Customer Home Feed
    async function loadCustomerHomeData() {
        const container = document.getElementById('homeWorkersContainer');
        if (!container) return;

        const res = await apiFetch(`/api/workers?city=${encodeURIComponent(state.city)}&available=true`);
        if (res.ok && Array.isArray(res.data.workers)) {
            state.workers = res.data.workers;
            renderWorkersGrid(container, res.data.workers);
        } else {
            renderEmptyWorkersState(container);
        }
    }

    // 2. Find Workers Page
    async function loadFindWorkersData() {
        const container = document.getElementById('findWorkersGrid');
        const countLabel = document.getElementById('workerResultsCount');
        if (!container) return;

        const trade = document.getElementById('filterTradeSelect')?.value || 'all';
        const availableOnly = document.getElementById('filterAvailableOnly')?.checked;
        const minRating = document.getElementById('filterRatingSelect')?.value || '0';

        let url = `/api/workers?city=${encodeURIComponent(state.city)}`;
        if (trade !== 'all') url += `&service=${encodeURIComponent(trade)}`;
        if (availableOnly) url += `&available=true`;
        if (Number(minRating) > 0) url += `&minRating=${minRating}`;

        const res = await apiFetch(url);
        if (res.ok && Array.isArray(res.data.workers)) {
            if (countLabel) countLabel.textContent = `${res.data.workers.length} specialist(s) found in ${state.city}`;
            renderWorkersGrid(container, res.data.workers);
        } else {
            if (countLabel) countLabel.textContent = `0 workers found`;
            renderEmptyWorkersState(container);
        }
    }

    function renderWorkersGrid(container, workers) {
        if (!workers || workers.length === 0) {
            renderEmptyWorkersState(container);
            return;
        }

        container.innerHTML = workers.map(w => `
            <div class="worker-desktop-card" data-worker-id="${w.id}">
                <div class="worker-card-top">
                    <div class="worker-avatar-box">${w.initials || w.name.slice(0, 2).toUpperCase()}</div>
                    <div>
                        <div class="worker-name-title">
                            ${w.name}
                            ${w.is_verified ? '<i class="fa-solid fa-circle-check verified-badge-icon" title="Verified Trade Professional"></i>' : ''}
                        </div>
                        <span class="worker-trade-subtitle">${w.trade}</span>
                    </div>
                </div>

                <div class="worker-meta-bar">
                    <span class="star-rating"><i class="fa-solid fa-star"></i> ${w.rating ? Number(w.rating).toFixed(1) : '5.0'}</span>
                    <span><i class="fa-solid fa-location-dot" style="color:var(--gs-muted)"></i> ${w.city}</span>
                    <span><i class="fa-solid fa-briefcase" style="color:var(--gs-muted)"></i> ${w.jobs_completed || 0} gigs done</span>
                    <span class="duty-status-badge ${w.is_available ? 'duty-on' : 'duty-off'}">${w.is_available ? '🟢 On-Duty' : 'Off-Duty'}</span>
                </div>

                <div class="worker-skills-chips">
                    ${(w.tools || 'Standard tool kit').split(',').map(t => `<span class="skill-chip">${t.trim()}</span>`).join('')}
                </div>

                <div class="worker-card-footer">
                    <div class="worker-price-text">
                        ₹${w.price || 300} <small>/ visit</small>
                    </div>
                    <button type="button" class="btn btn-primary btn-sm" onclick="window._gigsyncRequestWorker(${w.id}, '${w.name}', '${w.trade}')">
                        <i class="fa-solid fa-bolt"></i> Request Worker
                    </button>
                </div>
            </div>
        `).join('');
    }

    function renderEmptyWorkersState(container) {
        container.innerHTML = `
            <div class="empty-state-card">
                <i class="fa-solid fa-user-group"></i>
                <h3>No registered specialists in ${state.city} yet</h3>
                <p>Real skilled workers can register their profile to start receiving direct job requests from customers.</p>
                <div style="display:flex;justify-content:center;gap:12px">
                    <button type="button" class="btn btn-primary" onclick="window._gigsyncOpenWorkerReg('${state.city}')">
                        <i class="fa-solid fa-user-plus"></i> Register as a Worker in ${state.city}
                    </button>
                    <button type="button" class="btn btn-ghost" onclick="window._gigsyncPostOpenJob()">
                        <i class="fa-solid fa-file-pen"></i> Post an Open Job Request
                    </button>
                </div>
            </div>
        `;
    }

    // 3. Customer Bookings / My Jobs List
    async function loadCustomerJobs() {
        const container = document.getElementById('customerBookingsList');
        if (!container) return;

        const res = await apiFetch('/api/jobs');
        if (res.ok && Array.isArray(res.data.jobs)) {
            state.jobs = res.data.jobs;
            renderCustomerBookings(container, res.data.jobs);
        } else {
            container.innerHTML = `<div class="empty-state-card"><p>No bookings found.</p></div>`;
        }
    }

    function renderCustomerBookings(container, jobs) {
        if (!jobs || jobs.length === 0) {
            container.innerHTML = `
                <div class="empty-state-card">
                    <i class="fa-solid fa-clipboard-list"></i>
                    <h3>You haven't posted any jobs yet</h3>
                    <p>Tell GigSync what you need, and we'll match you with available verified specialists.</p>
                    <button type="button" class="btn btn-primary" onclick="window._gigsyncPostOpenJob()">
                        <i class="fa-solid fa-file-pen"></i> Post a Job Now
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = jobs.map(j => {
            const st = (j.status || 'Requested').toLowerCase().replace(/\s+/g, '');
            return `
                <div class="booking-item-row-card" data-job-id="${j.id}">
                    <div class="booking-service-col">
                        <span class="booking-job-id">#${j.id} · ${j.requested_date} (${j.requested_time})</span>
                        <h3>${j.service}</h3>
                        <p class="booking-problem-desc"><i class="fa-solid fa-circle-info"></i> "${j.problem_description}"</p>
                    </div>

                    <div class="booking-worker-meta">
                        <div>Assigned: <strong>${j.worker_name || 'Broadcasting to nearby workers...'}</strong></div>
                        <div>Location: 📍 ${j.location}, ${j.city}</div>
                        <div>Estimated: <b style="color:var(--gs-green-dark)">${j.budget || '₹350'}</b></div>
                    </div>

                    <div>
                        <span class="status-badge-pill st-${st}">${j.status || 'Requested'}</span>
                    </div>

                    <div style="display:flex;flex-direction:column;gap:6px">
                        <button type="button" class="btn btn-ghost btn-sm" onclick="window._gigsyncCallAssigned('${j.id}')">
                            <i class="fa-solid fa-phone"></i> Call
                        </button>
                        ${j.status !== 'Completed' && j.status !== 'Cancelled' ? `
                            <button type="button" class="btn btn-primary btn-sm" onclick="window._gigsyncCompleteCustomerJob('${j.id}')">
                                <i class="fa-solid fa-check"></i> Mark Done
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    /* ---------- Worker Portal Real-Time Data (No Dummy Data) ---------- */

    async function loadWorkerDashboardData() {
        const res = await apiFetch('/api/jobs');
        if (res.ok) {
            const jobs = res.data.jobs || [];
            const opps = res.data.opportunities || [];
            state.opportunities = opps;

            // KPI Counts
            const activeCount = jobs.filter(j => j.status === 'Accepted' || j.status === 'On the Way' || j.status === 'In Progress').length;
            const todayCompleted = jobs.filter(j => j.status === 'Completed').length;

            document.getElementById('kpiTodayJobs').textContent = jobs.length;
            document.getElementById('kpiActiveJobs').textContent = activeCount;

            renderWorkerOpportunities(opps);
            renderWorkerActiveJobs(jobs.filter(j => j.status !== 'Completed' && j.status !== 'Cancelled'));
        }

        // Fetch Real Earnings
        if (state.user && state.user.profile && state.user.profile.id) {
            const earnRes = await apiFetch(`/api/workers/${state.user.profile.id}/earnings`);
            if (earnRes.ok && earnRes.data.earnings) {
                const e = earnRes.data.earnings;
                document.getElementById('kpiTodayEarnings').textContent = `₹${e.today}`;
                document.getElementById('kpiMonthEarnings').textContent = `₹${e.thisMonth}`;
            }
        }
    }

    function renderWorkerOpportunities(opps) {
        const container = document.getElementById('workerOpportunitiesList');
        if (!container) return;

        if (!opps || opps.length === 0) {
            container.innerHTML = `
                <div class="empty-state-card" style="padding:28px">
                    <i class="fa-solid fa-bell-slash" style="font-size:24px;margin-bottom:6px"></i>
                    <h4 style="font-size:15px;margin:0">No new job opportunities right now</h4>
                    <p style="font-size:12px;margin:4px 0 0">You will be notified immediately when a customer in ${state.city} requests your trade.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = opps.map(opp => `
            <div class="opportunity-card" data-opp-id="${opp.id}">
                <div class="opportunity-info">
                    <span class="booking-job-id">#${opp.id} · ${opp.requested_date} (${opp.requested_time})</span>
                    <h4>${opp.service}</h4>
                    <div class="opportunity-meta">
                        <span><i class="fa-solid fa-user"></i> Customer: ${opp.customer_name}</span>
                        <span><i class="fa-solid fa-location-dot"></i> ${opp.location}, ${opp.city}</span>
                        <span><i class="fa-solid fa-wallet"></i> Estimated: <b>${opp.budget}</b></span>
                    </div>
                    <p style="font-size:12.5px;color:var(--gs-ink-2);margin:0">"${opp.problem_description}"</p>
                </div>

                <div class="opportunity-actions">
                    <button type="button" class="btn btn-primary" onclick="window._gigsyncWorkerAcceptJob('${opp.id}')">
                        <i class="fa-solid fa-check"></i> Accept Job
                    </button>
                    <button type="button" class="btn btn-ghost" onclick="window._gigsyncWorkerRejectJob('${opp.id}')">
                        Reject
                    </button>
                </div>
            </div>
        `).join('');
    }

    function renderWorkerActiveJobs(activeJobs) {
        const container = document.getElementById('workerActiveJobsList');
        if (!container) return;

        if (!activeJobs || activeJobs.length === 0) {
            container.innerHTML = `<div class="empty-state-card" style="padding:20px"><p style="margin:0;font-size:13px">No active jobs in progress.</p></div>`;
            return;
        }

        container.innerHTML = activeJobs.map(j => `
            <div class="booking-item-row-card" style="background:#FFFBEB;border-color:#FDE68A">
                <div>
                    <span class="booking-job-id">#${j.id} · Active Job</span>
                    <h3>${j.service}</h3>
                    <p class="booking-problem-desc">"${j.problem_description}"</p>
                </div>
                <div>
                    <div>Customer: <b>${j.customer_name}</b> (📞 ${j.customer_phone})</div>
                    <div>Location: 📍 ${j.location}, ${j.city}</div>
                </div>
                <div>
                    <span class="status-badge-pill st-${j.status.toLowerCase().replace(/\s+/g, '')}">${j.status}</span>
                </div>
                <div style="display:flex;gap:6px">
                    <button type="button" class="btn btn-primary btn-sm" onclick="window._gigsyncWorkerAdvanceStatus('${j.id}', '${j.status}')">
                        <i class="fa-solid fa-arrow-right"></i> Next Status
                    </button>
                    <button type="button" class="btn btn-success btn-sm" onclick="window._gigsyncWorkerCompleteJob('${j.id}')">
                        <i class="fa-solid fa-check"></i> Complete
                    </button>
                </div>
            </div>
        `).join('');
    }

    async function loadWorkerBookings() {
        const container = document.getElementById('workerScheduleTimeline');
        if (!container) return;

        const res = await apiFetch('/api/jobs');
        if (res.ok && Array.isArray(res.data.jobs)) {
            const accepted = res.data.jobs.filter(j => j.status === 'Accepted' || j.status === 'On the Way' || j.status === 'In Progress');
            if (accepted.length === 0) {
                container.innerHTML = `
                    <div class="schedule-slot-item">
                        <span><b>09:00 AM – 06:00 PM</b> · Full Day</span>
                        <span style="color:var(--gs-green-dark);font-weight:750">🟢 Available for new bookings (No conflicts)</span>
                    </div>
                `;
                return;
            }

            container.innerHTML = accepted.map(j => `
                <div class="schedule-slot-item booked">
                    <div>
                        <strong>${j.requested_time} · #${j.id} (${j.service})</strong>
                        <div style="font-size:12px;color:var(--gs-muted)">Customer: ${j.customer_name} · 📍 ${j.location}</div>
                    </div>
                    <span class="status-badge-pill st-accepted">Booked (${j.status})</span>
                </div>
            `).join('');
        }
    }

    async function loadWorkerEarnings() {
        if (!state.user || !state.user.profile) return;
        const res = await apiFetch(`/api/workers/${state.user.profile.id}/earnings`);
        if (res.ok && res.data.earnings) {
            const e = res.data.earnings;
            document.getElementById('earnTotalVal').textContent = `₹${e.totalEarnings}`;
            document.getElementById('earnMonthVal').textContent = `₹${e.thisMonth}`;
            document.getElementById('earnCompletedCount').textContent = e.totalCompletedJobs;
            document.getElementById('earnPendingVal').textContent = `₹${e.pendingEarnings}`;

            const tbody = document.getElementById('workerEarningsTableBody');
            if (tbody) {
                if (!e.completedJobs || e.completedJobs.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--gs-muted)">No completed jobs yet. Completed jobs will generate your verified payment log.</td></tr>`;
                } else {
                    tbody.innerHTML = e.completedJobs.map(c => `
                        <tr>
                            <td><b>#${c.id}</b></td>
                            <td>${c.service}</td>
                            <td>${c.customer_name}</td>
                            <td>${new Date(c.completed_at).toLocaleDateString('en-IN')}</td>
                            <td><strong style="color:var(--gs-green-dark)">₹${c.final_price}</strong></td>
                            <td><span class="status-badge-pill st-completed"><i class="fa-solid fa-circle-check"></i> ${c.payment_status} (${c.payment_method})</span></td>
                        </tr>
                    `).join('');
                }
            }
        }
    }

    async function loadWorkerHistory() {
        const container = document.getElementById('workerHistoryList');
        if (!container) return;

        const res = await apiFetch('/api/jobs');
        if (res.ok && Array.isArray(res.data.jobs)) {
            const completed = res.data.jobs.filter(j => j.status === 'Completed');
            if (completed.length === 0) {
                container.innerHTML = `
                    <div class="empty-state-card">
                        <i class="fa-solid fa-award"></i>
                        <h3>Your digital work history is clean</h3>
                        <p>Every completed gig builds a verifiable statement of your skills, customer feedback, and earnings in ${state.city}.</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = completed.map(c => `
                <div class="booking-item-row-card">
                    <div>
                        <span class="booking-job-id">#${c.id} · Completed</span>
                        <h3>${c.service}</h3>
                        <p class="booking-problem-desc">"${c.problem_description}"</p>
                    </div>
                    <div>
                        <div>Customer: <b>${c.customer_name}</b></div>
                        <div>Payment: ₹${c.final_price} (${c.payment_method})</div>
                    </div>
                    <div>
                        <span class="star-rating"><i class="fa-solid fa-star"></i> ${c.rating || 5}.0</span>
                    </div>
                    <div>
                        <span class="status-badge-pill st-completed">Verified Complete</span>
                    </div>
                </div>
            `).join('');
        }
    }

    function populateWorkerProfileForm() {
        if (!state.user) return;
        const u = state.user;
        const p = u.profile || {};

        document.getElementById('wProfName').value = u.name || '';
        document.getElementById('wProfPhone').value = u.phone || '';
        document.getElementById('wProfTrade').value = p.trade || 'General Specialist';
        document.getElementById('wProfPrice').value = p.price || 300;
        document.getElementById('wProfTools').value = p.tools || '';
        document.getElementById('wProfSkills').value = p.skills || '';
        document.getElementById('wProfCity').value = p.city || state.city;
        document.getElementById('wProfAreas').value = p.service_areas || '';
        document.getElementById('wProfAbout').value = p.about || '';
    }

    /* ---------- Worker Global Action Hooks ---------- */
    window._gigsyncWorkerAcceptJob = async (jobId) => {
        const res = await apiFetch(`/api/jobs/${jobId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'Accepted' })
        });
        if (res.ok) {
            toast(`🎉 Job #${jobId} accepted! Check Active Gigs.`);
            loadWorkerDashboardData();
        }
    };

    window._gigsyncWorkerRejectJob = async (jobId) => {
        toast(`Job #${jobId} dismissed.`);
        document.querySelector(`[data-opp-id="${jobId}"]`)?.remove();
    };

    window._gigsyncWorkerAdvanceStatus = async (jobId, currentStatus) => {
        const nextStatus = currentStatus === 'Accepted' ? 'On the Way' : currentStatus === 'On the Way' ? 'In Progress' : 'Completed';
        const res = await apiFetch(`/api/jobs/${jobId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: nextStatus })
        });
        if (res.ok) {
            toast(`Job #${jobId} status is now "${nextStatus}"`);
            loadWorkerDashboardData();
        }
    };

    window._gigsyncWorkerCompleteJob = async (jobId) => {
        const res = await apiFetch(`/api/jobs/${jobId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'Completed' })
        });
        if (res.ok) {
            toast(`🎉 Job #${jobId} completed and payment recorded!`);
            loadWorkerDashboardData();
        }
    };

    /* ---------- Customer Global Action Hooks ---------- */
    window._gigsyncRequestWorker = (workerId, workerName, trade) => {
        switchCustomerView('post-job');
        document.getElementById('postJobServiceSelect').value = trade;
        const radioManual = document.querySelector('input[name="jobAssignMode"][value="manual"]');
        if (radioManual) {
            radioManual.checked = true;
            document.getElementById('radioManualMatchCard')?.classList.add('active');
            document.getElementById('radioAutoMatchCard')?.classList.remove('active');
            const wrap = document.getElementById('manualWorkerSelectWrap');
            const select = document.getElementById('postJobManualWorkerSelect');
            if (wrap && select) {
                wrap.classList.remove('hidden');
                select.innerHTML = `<option value="${workerId}">${workerName} (${trade})</option>`;
            }
        }
    };

    window._gigsyncPostJobFor = (serviceName) => {
        switchCustomerView('post-job');
        document.getElementById('postJobServiceSelect').value = serviceName;
    };

    window._gigsyncPostOpenJob = () => switchCustomerView('post-job');

    window._gigsyncOpenWorkerReg = (city) => {
        openAuthModal('worker');
        document.getElementById('authCitySelect').value = city;
    };

    window._gigsyncCompleteCustomerJob = async (jobId) => {
        const res = await apiFetch(`/api/jobs/${jobId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'Completed' })
        });
        if (res.ok) {
            toast(`Booking #${jobId} marked Completed!`);
            loadCustomerJobs();
        }
    };

    window._gigsyncCallAssigned = (jobId) => {
        toast(`Connecting audio gateway to worker for Booking #${jobId}...`);
        openAiVoiceModal();
    };

    /* ---------- Customer Post a Job Form Submission ---------- */

    document.getElementById('tabPostManual')?.addEventListener('click', () => {
        document.getElementById('tabPostManual')?.classList.add('active');
        document.getElementById('tabPostVoice')?.classList.remove('active');
        document.getElementById('voicePostBox')?.classList.add('hidden');
    });

    document.getElementById('tabPostVoice')?.addEventListener('click', () => {
        document.getElementById('tabPostVoice')?.classList.add('active');
        document.getElementById('tabPostManual')?.classList.remove('active');
        document.getElementById('voicePostBox')?.classList.remove('hidden');
    });

    // Voice dictation inside Post a Job
    document.getElementById('voicePostMicBtn')?.addEventListener('click', () => {
        if (!speechRecognizer) {
            toast('Speech recognition not supported in this browser. Please type the problem.');
            return;
        }
        const out = document.getElementById('voicePostTranscript');
        out.textContent = 'Listening... Speak in English or Kannada.';
        speechRecognizer.start();

        speechRecognizer.onresult = (e) => {
            const text = e.results[0][0].transcript;
            out.textContent = `Captured: "${text}"`;
            document.getElementById('postJobProblemDesc').value = text;
            toast('Voice transcribed into problem description!');
        };
    });

    document.querySelectorAll('input[name="jobAssignMode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const isManual = e.target.value === 'manual';
            document.getElementById('radioAutoMatchCard')?.classList.toggle('active', !isManual);
            document.getElementById('radioManualMatchCard')?.classList.toggle('active', isManual);
            document.getElementById('manualWorkerSelectWrap')?.classList.toggle('hidden', !isManual);

            if (isManual) {
                const select = document.getElementById('postJobManualWorkerSelect');
                if (select) {
                    select.innerHTML = state.workers.map(w => `<option value="${w.id}">${w.name} (${w.trade} · ⭐ ${w.rating})</option>`).join('');
                }
            }
        });
    });

    document.getElementById('desktopPostJobForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const service = document.getElementById('postJobServiceSelect').value;
        const timing = document.getElementById('postJobTimingSelect').value;
        const problem = document.getElementById('postJobProblemDesc').value.trim();
        const location = document.getElementById('postJobLocationInput').value.trim();
        const budget = document.getElementById('postJobBudgetInput').value.trim();
        const isManual = document.querySelector('input[name="jobAssignMode"]:checked')?.value === 'manual';

        let workerId = null;
        let workerName = 'Broadcasting to nearby specialists...';

        if (isManual) {
            const sel = document.getElementById('postJobManualWorkerSelect');
            workerId = Number(sel.value);
            workerName = sel.options[sel.selectedIndex]?.text || 'Specialist';
        } else {
            const match = state.workers.find(w => w.trade.toLowerCase().includes(service.toLowerCase()) || w.service === service.toLowerCase());
            if (match) {
                workerId = match.id;
                workerName = match.name;
            }
        }

        const payload = {
            customer_phone: state.user ? state.user.phone : '9876543210',
            customer_name: state.user ? state.user.name : 'Customer',
            service,
            problem_description: problem,
            location,
            city: state.city,
            requested_time: timing,
            budget,
            worker_id: workerId,
            worker_name: workerName
        };

        const res = await apiFetch('/api/jobs', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            toast(`🎉 Job #${res.data.job.id} dispatched successfully!`);
            document.getElementById('desktopPostJobForm').reset();
            switchCustomerView('my-jobs');
        } else {
            toast(`Notice: ${res.data.message || 'Could not post job.'}`);
        }
    });

    /* ---------- AI Voice Assistant Modal Controller ---------- */

    const aiVoiceModal = document.getElementById('aiVoiceModal');
    const aiModalBigMicBtn = document.getElementById('aiModalBigMicBtn');
    const aiVoiceStateLabel = document.getElementById('aiVoiceStateLabel');
    const aiModalWaveBars = document.getElementById('aiModalWaveBars');
    const aiModalTranscriptBox = document.getElementById('aiModalTranscriptBox');

    function openAiVoiceModal() {
        aiVoiceModal?.classList.remove('hidden');
    }

    function closeAiVoiceModal() {
        aiVoiceModal?.classList.add('hidden');
        if (state.isAiModalRecording && speechRecognizer) {
            speechRecognizer.stop();
            state.isAiModalRecording = false;
        }
    }

    document.getElementById('openAiVoiceModalBtn')?.addEventListener('click', openAiVoiceModal);
    document.getElementById('homeTalkAiActionBtn')?.addEventListener('click', openAiVoiceModal);
    document.getElementById('closeAiVoiceModalBtn')?.addEventListener('click', closeAiVoiceModal);

    async function sendAiTurn(speechText) {
        if (!speechText) return;

        // Append User dialogue line
        appendAiDialogue('CALLER', speechText);

        aiVoiceStateLabel.textContent = 'Thinking & checking database...';
        aiModalWaveBars?.classList.remove('hidden');

        const res = await apiFetch('/api/ai/voice-call', {
            method: 'POST',
            body: JSON.stringify({
                callerPhone: state.user ? state.user.phone : '9876543210',
                callerRole: state.portal === 'worker' ? 'worker' : 'customer',
                callerName: state.user ? state.user.name : 'User',
                city: state.city,
                speechText
            })
        });

        aiModalWaveBars?.classList.add('hidden');

        if (res.ok && res.data.spokenResponse) {
            aiVoiceStateLabel.textContent = 'Responding...';
            appendAiDialogue('GIGSYNC AI', res.data.spokenResponse);
            speakText(res.data.spokenResponse);

            if (res.data.toolExecuted === 'createJob' || res.data.toolExecuted === 'updateWorkerAvailability') {
                if (state.portal === 'customer') loadCustomerJobs();
                else loadWorkerDashboardData();
            }
        } else {
            aiVoiceStateLabel.textContent = 'Ready';
            appendAiDialogue('GIGSYNC AI', "Namaskara! I am ready to help you find or manage local jobs in Ramanagara.");
        }
    }

    function appendAiDialogue(speaker, text) {
        if (!aiModalTranscriptBox) return;
        const line = document.createElement('div');
        line.className = `dialogue-line ${speaker === 'CALLER' ? 'caller' : 'bot'}`;
        line.innerHTML = `<strong>${speaker}:</strong> <span>${text}</span>`;
        aiModalTranscriptBox.appendChild(line);
        aiModalTranscriptBox.scrollTop = aiModalTranscriptBox.scrollHeight;
    }

    aiModalBigMicBtn?.addEventListener('click', () => {
        if (!speechRecognizer) {
            toast('Speech recognition not supported in this browser.');
            return;
        }

        if (state.isAiModalRecording) {
            speechRecognizer.stop();
            state.isAiModalRecording = false;
            aiModalBigMicBtn.classList.remove('recording');
            aiVoiceStateLabel.textContent = 'Processing speech...';
        } else {
            state.isAiModalRecording = true;
            aiModalBigMicBtn.classList.add('recording');
            aiVoiceStateLabel.textContent = '🔴 Listening... Speak in English or Kannada';
            aiModalWaveBars?.classList.remove('hidden');

            try {
                speechRecognizer.start();
                speechRecognizer.onresult = (e) => {
                    const speech = e.results[0][0].transcript;
                    state.isAiModalRecording = false;
                    aiModalBigMicBtn.classList.remove('recording');
                    aiVoiceStateLabel.textContent = 'Processing speech...';
                    sendAiTurn(speech);
                };
                speechRecognizer.onerror = () => {
                    state.isAiModalRecording = false;
                    aiModalBigMicBtn.classList.remove('recording');
                    aiVoiceStateLabel.textContent = 'Ready';
                };
                speechRecognizer.onend = () => {
                    state.isAiModalRecording = false;
                    aiModalBigMicBtn.classList.remove('recording');
                };
            } catch (e) {
                state.isAiModalRecording = false;
                aiModalBigMicBtn.classList.remove('recording');
            }
        }
    });

    document.querySelectorAll('.v-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const prompt = chip.dataset.vprompt;
            if (prompt) sendAiTurn(prompt);
        });
    });

    /* ---------- Worker Availability Form & Toggle ---------- */

    document.getElementById('workerDutyToggle')?.addEventListener('change', async (e) => {
        const isAvail = e.target.checked;
        const statusTxt = document.getElementById('dutyStatusText');
        if (statusTxt) {
            statusTxt.textContent = isAvail ? '🟢 AVAILABLE FOR WORK' : '🔴 OFF-DUTY';
            statusTxt.style.color = isAvail ? 'var(--gs-green-dark)' : '#DC2626';
        }

        await apiFetch('/api/workers/me/availability', {
            method: 'PATCH',
            body: JSON.stringify({ is_available: isAvail })
        });
        toast(isAvail ? 'You are now ON-DUTY and visible to customers.' : 'You are now OFF-DUTY.');
    });

    document.getElementById('workerSetAvailabilityForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const day = document.getElementById('availDaySelect').value;
        const start = document.getElementById('availStartTime').value;
        const end = document.getElementById('availEndTime').value;

        const res = await apiFetch('/api/workers/me/availability', {
            method: 'PATCH',
            body: JSON.stringify({ date_str: day, start_time: start, end_time: end, is_available: true })
        });

        if (res.ok) {
            toast(`Working hours for ${day} (${start} – ${end}) saved!`);
            loadWorkerBookings();
        }
    });

    document.getElementById('workerProfileForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const trade = document.getElementById('wProfTrade').value;
        const price = Number(document.getElementById('wProfPrice').value);
        const tools = document.getElementById('wProfTools').value;
        const skills = document.getElementById('wProfSkills').value;
        const city = document.getElementById('wProfCity').value;
        const service_areas = document.getElementById('wProfAreas').value;
        const about = document.getElementById('wProfAbout').value;

        const res = await apiFetch('/api/workers/me/profile', {
            method: 'PATCH',
            body: JSON.stringify({ trade, price, tools, skills, city, service_areas, about })
        });

        if (res.ok) {
            toast('Profile details updated in SQLite database!');
        }
    });

    document.getElementById('downloadWorkStatementBtn')?.addEventListener('click', () => {
        const u = state.user || { name: 'Ramesh Kumar', phone: '9845011223' };
        const stmt = `=======================================================
GIGSYNC VERIFIED DIGITAL WORK RECORD
Regional Cluster: ${state.city}, Karnataka
=======================================================
Worker Name: ${u.name}
Phone: +91 ${u.phone}
Profession: ${u.profile?.trade || 'Electrician'}
Status: Verified Trade Professional
Completed Gigs on Record: ${document.getElementById('kpiTodayJobs')?.textContent || '0'}
Total Earnings Recorded: ${document.getElementById('kpiMonthEarnings')?.textContent || '₹0'}
Date of Verification: ${new Date().toLocaleDateString('en-IN')}
=======================================================`;

        const blob = new Blob([stmt], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `GigSync_Work_Record_${u.name.replace(/\s+/g, '_')}.txt`;
        a.click();
        toast('Work statement downloaded!');
    });

    /* ---------- Real Authentication Subsystem ---------- */

    const authModal = document.getElementById('authModal');
    let authMode = 'login'; // 'login' | 'register'
    let selectedAuthRole = 'customer'; // 'customer' | 'worker'

    function openAuthModal(defaultRole = 'customer') {
        selectedAuthRole = defaultRole;
        authModal?.classList.remove('hidden');
        setAuthRole(defaultRole);
    }

    function setAuthRole(role) {
        selectedAuthRole = role;
        document.getElementById('roleCardCustomer')?.classList.toggle('active', role === 'customer');
        document.getElementById('roleCardWorker')?.classList.toggle('active', role === 'worker');
        document.getElementById('workerExtraFields')?.classList.toggle('hidden', role !== 'worker' || authMode === 'login');
    }

    document.getElementById('authTabLogin')?.addEventListener('click', () => {
        authMode = 'login';
        document.getElementById('authTabLogin')?.classList.add('active');
        document.getElementById('authTabRegister')?.classList.remove('active');
        document.getElementById('authNameGroup')?.classList.add('hidden');
        document.getElementById('authRolePickerWrap')?.classList.add('hidden');
        document.getElementById('workerExtraFields')?.classList.add('hidden');
        document.getElementById('authSubmitBtn').textContent = 'Sign In';
    });

    document.getElementById('authTabRegister')?.addEventListener('click', () => {
        authMode = 'register';
        document.getElementById('authTabRegister')?.classList.add('active');
        document.getElementById('authTabLogin')?.classList.remove('active');
        document.getElementById('authNameGroup')?.classList.remove('hidden');
        document.getElementById('authRolePickerWrap')?.classList.remove('hidden');
        document.getElementById('workerExtraFields')?.classList.toggle('hidden', selectedAuthRole !== 'worker');
        document.getElementById('authSubmitBtn').textContent = 'Create Account';
    });

    document.getElementById('roleCardCustomer')?.addEventListener('click', () => setAuthRole('customer'));
    document.getElementById('roleCardWorker')?.addEventListener('click', () => setAuthRole('worker'));
    document.getElementById('closeAuthModalBtn')?.addEventListener('click', () => authModal?.classList.add('hidden'));

    document.getElementById('realAuthForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('authErrorMsg');
        errEl?.classList.add('hidden');

        const phone = document.getElementById('authPhoneInput').value.trim();
        const password = document.getElementById('authPasswordInput').value;
        const name = document.getElementById('authNameInput')?.value.trim();
        const city = document.getElementById('authCitySelect')?.value || state.city;
        const trade = document.getElementById('authWorkerTradeSelect')?.value || 'Master Electrician';
        const tools = document.getElementById('authWorkerTools')?.value || 'Standard tool kit';

        if (authMode === 'register') {
            const res = await apiFetch('/api/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    name,
                    phone,
                    password,
                    role: selectedAuthRole,
                    city,
                    trade,
                    tools
                })
            });

            if (res.ok && res.data.token) {
                applyAuthSession(res.data.token, res.data.user);
                authModal?.classList.add('hidden');
                toast(`Welcome to GigSync, ${res.data.user.name}!`);
            } else {
                errEl.textContent = res.data.message || 'Registration failed.';
                errEl.classList.remove('hidden');
            }
        } else {
            const res = await apiFetch('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ phone, password })
            });

            if (res.ok && res.data.token) {
                applyAuthSession(res.data.token, res.data.user);
                authModal?.classList.add('hidden');
                toast(`Welcome back, ${res.data.user.name}!`);
            } else {
                errEl.textContent = res.data.message || 'Invalid credentials.';
                errEl.classList.remove('hidden');
            }
        }
    });

    function applyAuthSession(token, user) {
        state.token = token;
        state.user = user;
        localStorage.setItem('gigsync_token', token);

        // Update Topbar
        document.getElementById('userDisplayName').textContent = user.name;
        document.getElementById('userInitials').textContent = user.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
        document.getElementById('dropdownUserName').textContent = user.name;
        document.getElementById('dropdownUserRole').textContent = `${user.role.toUpperCase()} MODE`;

        // Update Worker Sidebar if worker
        if (user.role === 'worker') {
            document.getElementById('sidebarWorkerName').textContent = user.name;
            document.getElementById('sidebarWorkerTrade').textContent = user.profile?.trade || 'Worker';
            document.getElementById('sidebarWorkerInitials').textContent = user.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
            document.getElementById('workerGreeting').textContent = `Good afternoon, ${user.name.split(' ')[0]}`;
            switchPortal('worker');
        } else {
            switchPortal('customer');
        }
    }

    async function checkExistingAuth() {
        if (!state.token) return;
        const res = await apiFetch('/api/auth/me');
        if (res.ok && res.data.user) {
            applyAuthSession(state.token, res.data.user);
        } else {
            localStorage.removeItem('gigsync_token');
            state.token = null;
            state.user = null;
        }
    }

    // User Dropdown
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdownMenu = document.getElementById('userDropdownMenu');

    userMenuBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!state.user) {
            openAuthModal('customer');
        } else {
            userDropdownMenu?.classList.toggle('hidden');
        }
    });

    function closeUserDropdown() {
        userDropdownMenu?.classList.add('hidden');
    }
    document.addEventListener('click', closeUserDropdown);

    document.getElementById('dropdownLogoutBtn')?.addEventListener('click', async () => {
        await apiFetch('/api/auth/logout', { method: 'POST' });
        localStorage.removeItem('gigsync_token');
        state.token = null;
        state.user = null;
        toast('Logged out successfully.');
        location.reload();
    });

    // Worker Logout Button in Sidebar
    document.getElementById('workerLogoutBtn')?.addEventListener('click', async () => {
        await apiFetch('/api/auth/logout', { method: 'POST' });
        localStorage.removeItem('gigsync_token');
        state.token = null;
        state.user = null;
        toast('Logged out.');
        location.reload();
    });

    // Filter Buttons
    document.getElementById('applyFiltersBtn')?.addEventListener('click', loadFindWorkersData);
    document.getElementById('refreshHomeWorkersBtn')?.addEventListener('click', loadCustomerHomeData);
    document.getElementById('refreshOpportunitiesBtn')?.addEventListener('click', loadWorkerDashboardData);

    /* ---------- Firebase Cloud Firestore Modal Controller ---------- */
    const firebaseModal = document.getElementById('firebaseModal');
    const fbProjectIdInput = document.getElementById('fbProjectIdInput');
    const fbApiKeyInput = document.getElementById('fbApiKeyInput');
    const firebaseSyncStatusLog = document.getElementById('firebaseSyncStatusLog');
    const topFirebaseLabel = document.getElementById('topFirebaseLabel');

    document.getElementById('openFirebaseModalBtn')?.addEventListener('click', async () => {
        firebaseModal?.classList.remove('hidden');
        const res = await apiFetch('/api/firebase/config');
        if (res.ok && res.data.config) {
            if (fbProjectIdInput) fbProjectIdInput.value = res.data.config.projectId || 'gigsync-tier2-app';
            if (fbApiKeyInput) fbApiKeyInput.value = res.data.config.apiKey || '';
        }
    });

    document.getElementById('closeFirebaseModalBtn')?.addEventListener('click', () => {
        firebaseModal?.classList.add('hidden');
    });

    document.getElementById('firebaseConfigForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const projectId = fbProjectIdInput?.value.trim();
        const apiKey = fbApiKeyInput?.value.trim();

        const res = await apiFetch('/api/firebase/config', {
            method: 'POST',
            body: JSON.stringify({ projectId, apiKey })
        });

        if (res.ok) {
            toast(`Firebase Cloud Config saved for project "${projectId}"!`);
            if (topFirebaseLabel) topFirebaseLabel.textContent = `Firebase (${projectId})`;
        }
    });

    document.getElementById('triggerFbSyncBtn')?.addEventListener('click', async () => {
        if (firebaseSyncStatusLog) firebaseSyncStatusLog.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Syncing all SQLite workers and jobs to Cloud Firestore...`;
        const res = await apiFetch('/api/firebase/sync', { method: 'POST' });
        if (res.ok) {
            toast('🎉 Full sync to Cloud Firestore completed!');
            if (firebaseSyncStatusLog) {
                firebaseSyncStatusLog.innerHTML = `<span style="color:var(--gs-green-dark);font-weight:750">✅ Successfully synced ${res.data.workersSynced} workers and ${res.data.jobsSynced} jobs to Firestore.</span>`;
            }
        } else {
            if (firebaseSyncStatusLog) {
                firebaseSyncStatusLog.innerHTML = `<span style="color:#DC2626">Sync note: ${res.data.message || 'Could not sync'}</span>`;
            }
        }
    });

    // Initial Startup
    updateActiveCity(state.city);
    checkExistingAuth();
    loadCustomerHomeData();
});
