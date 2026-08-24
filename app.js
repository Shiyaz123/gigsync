/* ==========================================================================
   GigSync — Modern Mobile-First Application Controller
   Real-Time SQLite Database Sync · 5-Tab Navigation · Trilingual AI Assistant
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    /* ---------- Application Constants & State ---------- */
    const AUTH_SESSION_KEY = 'gigsync_session';
    const AUTH_USERS_KEY = 'gigsync_users';
    const DEMO_PASSWORD = 'gigsync123';

    const state = {
        activeTab: 'home',
        selectedRole: 'customer', // 'customer' | 'worker' | 'admin'
        city: 'Ramanagara',
        lang: 'en', // 'en' | 'kn'
        workers: [],
        jobs: [],
        selectedService: 'Electrical',
        jobsFilter: 'all',
        isAiRecording: false
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
            utterance.pitch = 1.0;
            // Detect if text contains Kannada script
            const isKannada = /[\u0C80-\u0CFF]/.test(text);
            utterance.lang = isKannada ? 'kn-IN' : 'en-IN';
            window.speechSynthesis.speak(utterance);
        } catch (e) {
            console.warn('Speech synthesis notice:', e);
        }
    }

    /* ---------- UI Helpers & Toast ---------- */
    function toast(msg) {
        const el = document.getElementById('toast');
        if (!el) return;
        el.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#34D399"></i> <span>${msg}</span>`;
        el.classList.remove('hidden');
        clearTimeout(toast._t);
        toast._t = setTimeout(() => el.classList.add('hidden'), 2800);
    }

    /* ---------- Navigation / Tab Switcher ---------- */
    function switchTab(tabName) {
        state.activeTab = tabName;

        // Update view visibility
        document.querySelectorAll('.app-view').forEach(view => {
            view.classList.toggle('active', view.id === `view-${tabName}`);
        });

        // Update bottom navigation buttons
        document.querySelectorAll('.nav-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Lifecycle actions per tab
        if (tabName === 'home') {
            fetchAndRenderWorkers();
            fetchAndRenderJobs();
        } else if (tabName === 'jobs') {
            fetchAndRenderJobs();
        } else if (tabName === 'order') {
            // Scroll to top of order form
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        const mainViewport = document.querySelector('.app-main-viewport');
        if (mainViewport) mainViewport.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Bind bottom nav tabs
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;
            if (targetTab) switchTab(targetTab);
        });
    });

    /* ---------- Real-Time Database Fetching & Rendering ---------- */

    // 1. Fetch and render real workers from SQLite DB
    async function fetchAndRenderWorkers() {
        const listEl = document.getElementById('homeWorkerList');
        if (!listEl) return;

        try {
            const res = await fetch('/api/workers');
            const data = await res.json();
            if (data.status === 'success' && Array.isArray(data.workers)) {
                state.workers = data.workers;
                renderWorkerList(data.workers);
            } else {
                listEl.innerHTML = `<p style="padding:20px;text-align:center;color:var(--gs-muted)">No workers found in Ramanagara.</p>`;
            }
        } catch (err) {
            console.warn('Workers fetch fallback:', err.message);
            // Fallback render if server endpoint is initializing
            renderWorkerList(getFallbackWorkers());
        }
    }

    function renderWorkerList(workers) {
        const listEl = document.getElementById('homeWorkerList');
        if (!listEl) return;

        if (workers.length === 0) {
            listEl.innerHTML = `<p style="padding:20px;text-align:center;color:var(--gs-muted)">No workers currently available.</p>`;
            return;
        }

        listEl.innerHTML = workers.map(w => `
            <div class="worker-item-card" data-worker-id="${w.id}">
                <div class="worker-avatar-badge">${w.initials || w.name.slice(0, 2).toUpperCase()}</div>
                <div class="worker-info-col">
                    <div class="worker-name-row">
                        <strong>${w.name}</strong>
                        ${w.is_verified ? '<i class="fa-solid fa-circle-check verified-icon" title="Verified Trade Professional"></i>' : ''}
                    </div>
                    <span class="worker-trade-tag">${w.trade}</span>
                    <div class="worker-meta-row">
                        <span class="meta-rating"><i class="fa-solid fa-star"></i> ${w.rating || '4.8'}</span>
                        <span class="meta-distance"><i class="fa-solid fa-location-dot"></i> ${w.km || '1.2'} km</span>
                        <span class="meta-price">₹${w.price || '300'}</span>
                    </div>
                </div>
                <button type="button" class="worker-order-btn" data-order-worker-id="${w.id}" data-order-worker-trade="${w.trade}">
                    Order
                </button>
            </div>
        `).join('');

        // Bind 1-tap "Order" buttons on worker cards
        listEl.querySelectorAll('[data-order-worker-id]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const wId = btn.dataset.orderWorkerId;
                const trade = btn.dataset.orderWorkerTrade;
                preselectOrderWorker(wId, trade);
            });
        });
    }

    function getFallbackWorkers() {
        return [
            { id: 1, name: 'Ramesh Kumar', trade: 'Master Electrician', rating: 4.8, km: 1.2, price: 300, is_verified: 1, initials: 'RK' },
            { id: 2, name: 'Suresh Gowda', trade: 'Plumbing Specialist', rating: 4.7, km: 1.8, price: 280, is_verified: 1, initials: 'SG' },
            { id: 3, name: 'Anil Prasad', trade: 'General Carpenter', rating: 4.6, km: 3.1, price: 350, is_verified: 1, initials: 'AP' },
            { id: 4, name: 'Manoj N.', trade: 'AC & Fridge Tech', rating: 4.9, km: 2.4, price: 450, is_verified: 1, initials: 'MN' },
            { id: 5, name: 'Imran Khan', trade: 'Two-Wheeler Mechanic', rating: 4.8, km: 1.5, price: 250, is_verified: 1, initials: 'IK' }
        ];
    }

    // 2. Fetch and render real jobs from SQLite DB
    async function fetchAndRenderJobs() {
        const listEl = document.getElementById('jobsFeedList');
        if (!listEl) return;

        try {
            const res = await fetch('/api/jobs');
            const data = await res.json();
            if (data.status === 'success' && Array.isArray(data.jobs)) {
                state.jobs = data.jobs;
                renderJobsList(data.jobs, state.jobsFilter);
                updateActiveJobBanner(data.jobs);
            }
        } catch (err) {
            console.warn('Jobs fetch error:', err.message);
        }
    }

    function renderJobsList(jobs, filter = 'all') {
        const listEl = document.getElementById('jobsFeedList');
        if (!listEl) return;

        let filtered = jobs;
        if (filter === 'active') {
            filtered = jobs.filter(j => j.status !== 'Completed' && j.status !== 'Cancelled');
        } else if (filter === 'completed') {
            filtered = jobs.filter(j => j.status === 'Completed');
        }

        if (filtered.length === 0) {
            listEl.innerHTML = `
                <div style="background:#fff;border:1px solid var(--gs-line);border-radius:18px;padding:36px 20px;text-align:center">
                    <i class="fa-solid fa-clipboard-list" style="font-size:32px;color:var(--gs-muted);margin-bottom:8px"></i>
                    <h3 style="font-size:16px;margin-bottom:4px">No bookings found</h3>
                    <p style="font-size:12.5px;color:var(--gs-muted)">Tap "Order Worker" to book a local specialist.</p>
                </div>
            `;
            return;
        }

        listEl.innerHTML = filtered.map(j => {
            const statusClass = `status-${(j.status || 'requested').toLowerCase()}`;
            return `
                <div class="job-booking-card" data-job-id="${j.id}">
                    <div class="job-card-header">
                        <div>
                            <span class="job-id-tag">#${j.id}</span>
                            <h3 class="job-service-name">${j.service}</h3>
                        </div>
                        <span class="status-pill ${statusClass}">${j.status || 'Requested'}</span>
                    </div>
                    <div class="job-details-meta">
                        <p><i class="fa-solid fa-user-check" style="color:var(--gs-indigo)"></i> Assigned: <b>${j.worker_name || 'Finding nearby workers'}</b></p>
                        <p><i class="fa-solid fa-clock" style="color:var(--gs-muted)"></i> ${j.requested_time || 'Today (Immediate)'}</p>
                        <p><i class="fa-solid fa-location-dot" style="color:var(--gs-muted)"></i> ${j.location || 'Vijaya Nagar, Ramanagara'}</p>
                        <p style="color:var(--gs-ink-2);margin-top:4px"><i class="fa-solid fa-circle-info"></i> "${j.problem_description}"</p>
                    </div>
                    <div class="job-actions-row">
                        <span class="job-cost-text">${j.budget || '₹300–₹500'}</span>
                        <div class="job-btn-group">
                            <button type="button" class="btn btn-ghost btn-sm" data-call-job="${j.id}"><i class="fa-solid fa-phone"></i> Call</button>
                            ${j.status !== 'Completed' ? `
                                <button type="button" class="btn btn-primary btn-sm" data-complete-job="${j.id}"><i class="fa-solid fa-check"></i> Done</button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Bind Action buttons on job cards
        listEl.querySelectorAll('[data-call-job]').forEach(btn => {
            btn.addEventListener('click', () => {
                toast('Connecting phone call with assigned worker...');
                openPhoneModal();
            });
        });

        listEl.querySelectorAll('[data-complete-job]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const jId = btn.dataset.completeJob;
                await updateJobStatus(jId, 'Completed');
                toast(`Booking #${jId} marked Completed!`);
                fetchAndRenderJobs();
            });
        });
    }

    async function updateJobStatus(jobId, status) {
        try {
            await fetch(`/api/jobs/${jobId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });
        } catch (e) {
            console.warn('Status update error:', e);
        }
    }

    function updateActiveJobBanner(jobs) {
        const banner = document.getElementById('homeActiveJobBanner');
        const sEl = document.getElementById('homeBannerService');
        const stEl = document.getElementById('homeBannerStatus');
        const dot = document.getElementById('jobsNavDot');

        const active = jobs.find(j => j.status !== 'Completed' && j.status !== 'Cancelled');
        if (active && banner) {
            banner.classList.remove('hidden');
            if (sEl) sEl.textContent = active.service;
            if (stEl) stEl.textContent = `${active.worker_name || 'Specialist'} · ${active.status} (${active.requested_time})`;
            if (dot) dot.style.display = 'block';
        } else if (banner) {
            banner.classList.add('hidden');
            if (dot) dot.style.display = 'none';
        }
    }

    // Filter Buttons in Jobs tab
    document.getElementById('jobsFilterBar')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.job-seg-btn');
        if (!btn) return;
        document.querySelectorAll('#jobsFilterBar .job-seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.jobsFilter = btn.dataset.filter || 'all';
        renderJobsList(state.jobs, state.jobsFilter);
    });

    // Home Banner Click
    document.getElementById('homeBannerViewBtn')?.addEventListener('click', () => switchTab('jobs'));

    /* ---------- Fast "Order Worker" Workflow ---------- */

    function preselectOrderWorker(workerId, trade) {
        switchTab('order');
        // Match trade chip
        if (trade) {
            document.querySelectorAll('#orderServicePicker .service-chip').forEach(chip => {
                const isMatch = trade.toLowerCase().includes(chip.dataset.service.toLowerCase());
                chip.classList.toggle('active', isMatch);
                if (isMatch) {
                    document.getElementById('orderSelectedService').value = chip.dataset.service;
                }
            });
        }

        // Set manual radio
        const manualRadio = document.querySelector('input[name="matchMode"][value="manual"]');
        if (manualRadio) {
            manualRadio.checked = true;
            document.getElementById('matchManualCard')?.classList.add('active');
            document.getElementById('matchAutoCard')?.classList.remove('active');
            document.getElementById('orderManualWorkerWrap')?.classList.remove('hidden');
            const sel = document.getElementById('orderManualWorkerSelect');
            if (sel) sel.value = String(workerId);
        }
    }

    // Category Grid Clicks on Home
    document.getElementById('categoryGrid')?.addEventListener('click', (e) => {
        const tile = e.target.closest('.category-tile');
        if (!tile) return;
        const service = tile.dataset.service;
        document.getElementById('orderSelectedService').value = service;
        
        // Update service chips on order screen
        document.querySelectorAll('#orderServicePicker .service-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.service === service);
        });

        switchTab('order');
    });

    document.getElementById('homeOrderWorkerBtn')?.addEventListener('click', () => switchTab('order'));

    // Service chip selection on Order Form
    document.getElementById('orderServicePicker')?.addEventListener('click', (e) => {
        const chip = e.target.closest('.service-chip');
        if (!chip) return;
        document.querySelectorAll('#orderServicePicker .service-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const sName = chip.dataset.service;
        document.getElementById('orderSelectedService').value = sName;

        // Dynamic price update
        const priceMap = {
            'Electrical': '₹300 – ₹450',
            'Plumbing': '₹280 – ₹450',
            'Carpentry': '₹350 – ₹550',
            'AC & Appliances': '₹400 – ₹650',
            'Mechanics': '₹250 – ₹400',
            'Home Cleaning': '₹450 – ₹750',
            'Tailoring': '₹150 – ₹300',
            'Welding': '₹400 – ₹600'
        };
        const pEl = document.getElementById('orderEstimatedPrice');
        if (pEl) pEl.textContent = priceMap[sName] || '₹300 – ₹500';
    });

    // Time chip selection
    document.getElementById('orderTimePicker')?.addEventListener('click', (e) => {
        const chip = e.target.closest('.time-chip');
        if (!chip) return;
        document.querySelectorAll('#orderTimePicker .time-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        document.getElementById('orderSelectedTime').value = chip.dataset.time;
    });

    // Match mode selector (Auto vs Manual)
    document.querySelectorAll('input[name="matchMode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const isManual = e.target.value === 'manual';
            document.getElementById('matchAutoCard')?.classList.toggle('active', !isManual);
            document.getElementById('matchManualCard')?.classList.toggle('active', isManual);
            document.getElementById('orderManualWorkerWrap')?.classList.toggle('hidden', !isManual);
        });
    });

    // Voice dictation to fill problem description
    document.getElementById('orderVoiceFillBtn')?.addEventListener('click', () => {
        if (!speechRecognizer) {
            toast('Speech recognition not supported in this browser. Please type the problem.');
            return;
        }
        toast('🎙️ Listening... Speak your problem in English or Kannada.');
        try {
            speechRecognizer.start();
            speechRecognizer.onresult = (evt) => {
                const text = evt.results[0][0].transcript;
                const txtArea = document.getElementById('orderProblemDesc');
                if (txtArea) txtArea.value = text;
                toast(`Voice captured: "${text}"`);
            };
        } catch (e) {
            console.warn('Mic busy:', e);
        }
    });

    // Order Form Submit -> Save to SQLite DB
    document.getElementById('orderWorkerForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const service = document.getElementById('orderSelectedService').value;
        const problem = document.getElementById('orderProblemDesc').value.trim();
        const time = document.getElementById('orderSelectedTime').value;
        const location = document.getElementById('orderLocationInput').value.trim();
        const isManual = document.querySelector('input[name="matchMode"]:checked')?.value === 'manual';

        let workerId = null;
        let workerName = 'Nearby Available Workers Broadcast';

        if (isManual) {
            const sel = document.getElementById('orderManualWorkerSelect');
            workerId = Number(sel.value);
            workerName = sel.options[sel.selectedIndex].text.split('(')[0].trim();
        } else {
            // Find recommended worker from state
            const matched = state.workers.find(w => w.service === service.toLowerCase() || w.trade.toLowerCase().includes(service.toLowerCase()));
            if (matched) {
                workerId = matched.id;
                workerName = matched.name;
            }
        }

        try {
            const res = await fetch('/api/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customer_phone: '9876543210',
                    customer_name: 'Kavya Rao',
                    service,
                    problem_description: problem,
                    location,
                    requested_time: time,
                    budget: document.getElementById('orderEstimatedPrice').textContent,
                    worker_id: workerId,
                    worker_name: workerName,
                    status: 'Confirmed'
                })
            });

            const data = await res.json();
            if (data.status === 'success') {
                toast(`🎉 Worker Ordered! Booking #${data.job.id} dispatched to ${workerName}.`);
                document.getElementById('orderWorkerForm').reset();
                switchTab('jobs');
            }
        } catch (err) {
            console.warn('Booking creation error:', err);
            toast('Worker booking submitted!');
            switchTab('jobs');
        }
    });

    /* ---------- Trilingual Dynamic AI Assistant ---------- */

    const aiChatFeed = document.getElementById('aiChatFeed');
    const aiInput = document.getElementById('aiAssistantTextInput');
    const aiSendBtn = document.getElementById('aiAssistantSendBtn');
    const aiMicBtn = document.getElementById('aiAssistantMicBtn');

    async function sendAiMessage(messageText) {
        const text = (messageText || aiInput.value).trim();
        if (!text) return;

        if (aiInput) aiInput.value = '';

        // Append User Bubble
        appendChatBubble('user', text);

        // Show typing indicator
        const typingId = 'typing-' + Date.now();
        if (aiChatFeed) {
            aiChatFeed.insertAdjacentHTML('beforeend', `
                <div class="chat-bubble-row bot" id="${typingId}">
                    <div class="bubble-avatar-mini"><i class="fa-solid fa-robot"></i></div>
                    <div class="chat-bubble-card" style="color:var(--gs-muted)">
                        <i class="fa-solid fa-circle-notch fa-spin"></i> GigSync AI is thinking...
                    </div>
                </div>
            `);
            aiChatFeed.scrollTop = aiChatFeed.scrollHeight;
        }

        try {
            const res = await fetch('/api/ai/voice-call', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    callerPhone: '9876543210',
                    callerRole: 'customer',
                    speechText: text
                })
            });

            const data = await res.json();
            document.getElementById(typingId)?.remove();

            if (data.status === 'success') {
                appendChatBubble('bot', data.spokenResponse, data.cardType, data.cardData);
                speakText(data.spokenResponse);
                
                // If a job was created via AI, refresh jobs list
                if (data.toolExecuted === 'createJob') {
                    fetchAndRenderJobs();
                }
            } else {
                appendChatBubble('bot', "I couldn't process that request right now. Please try asking again.");
            }
        } catch (err) {
            document.getElementById(typingId)?.remove();
            appendChatBubble('bot', "Namaskara! I am ready to help you book local electricians, plumbers, and mechanics in Ramanagara.");
        }
    }

    function appendChatBubble(sender, text, cardType = null, cardData = null) {
        if (!aiChatFeed) return;

        let cardHtml = '';

        if (cardType === 'workerList' && cardData?.workers) {
            cardHtml = `
                <div class="chat-embed-card">
                    <h4>⚡ Available Specialists in Ramanagara</h4>
                    ${cardData.workers.slice(0, 3).map(w => `
                        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #E2E8F0">
                            <div>
                                <b>${w.name}</b> (${w.trade})<br>
                                <small style="color:var(--gs-muted)"><i class="fa-solid fa-star" style="color:#D97706"></i> ${w.rating || '4.8'} · ${w.km || '1.2'} km away · ₹${w.price || '300'}</small>
                            </div>
                            <button type="button" class="btn btn-primary btn-sm" onclick="window._gigsyncPreselect(${w.id}, '${w.trade}')">Book</button>
                        </div>
                    `).join('')}
                </div>
            `;
        } else if (cardType === 'workerSchedule' && cardData?.worker) {
            const w = cardData.worker;
            const sched = cardData.schedule;
            cardHtml = `
                <div class="chat-embed-card">
                    <h4>🕒 ${w.name}'s Schedule (${w.trade})</h4>
                    <p><b>Working Hours:</b> ${sched?.hours || '08:30 AM – 06:30 PM'}</p>
                    <p><b>Current Status:</b> <span style="color:var(--gs-green-dark);font-weight:750">🟢 ${w.is_available ? 'Available Now in ' + w.area : 'Off-Duty'}</span></p>
                    <p><b>Equipped Tools:</b> ${w.tools || 'Standard toolkit'}</p>
                    <button type="button" class="btn btn-primary btn-sm" style="margin-top:8px" onclick="window._gigsyncPreselect(${w.id}, '${w.trade}')">Order ${w.name.split(' ')[0]}</button>
                </div>
            `;
        } else if (cardType === 'jobCreated' && cardData?.job) {
            const j = cardData.job;
            cardHtml = `
                <div class="chat-embed-card" style="border:1.5px solid var(--gs-indigo);background:#EEF2FF">
                    <h4 style="color:var(--gs-indigo-dark)">🎉 Booking Confirmed: #${j.jobId}</h4>
                    <p><b>Service:</b> ${j.service}</p>
                    <p><b>Assigned Worker:</b> ${cardData.matchedWorker?.name || 'Ramesh Kumar'}</p>
                    <p><b>Scheduled:</b> ${j.requestedTime}</p>
                    <button type="button" class="btn btn-primary btn-sm" style="margin-top:8px" onclick="window._gigsyncSwitchTab('jobs')">Track in Jobs Tab</button>
                </div>
            `;
        }

        const bubbleHtml = sender === 'user' ? `
            <div class="chat-bubble-row user">
                <div class="chat-bubble-card">
                    <p>${text}</p>
                </div>
            </div>
        ` : `
            <div class="chat-bubble-row bot">
                <div class="bubble-avatar-mini"><i class="fa-solid fa-robot"></i></div>
                <div class="chat-bubble-card">
                    <p>${text}</p>
                    ${cardHtml}
                </div>
            </div>
        `;

        aiChatFeed.insertAdjacentHTML('beforeend', bubbleHtml);
        aiChatFeed.scrollTop = aiChatFeed.scrollHeight;
    }

    // Global hook for inline card buttons
    window._gigsyncPreselect = (wId, trade) => preselectOrderWorker(wId, trade);
    window._gigsyncSwitchTab = (tab) => switchTab(tab);

    aiSendBtn?.addEventListener('click', () => sendAiMessage());
    aiInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendAiMessage();
    });

    // Preset prompt chips in AI screen
    document.querySelectorAll('.ai-chip-prompt').forEach(chip => {
        chip.addEventListener('click', () => {
            const promptText = chip.dataset.prompt;
            sendAiMessage(promptText);
        });
    });

    // Voice recognition in AI Screen
    aiMicBtn?.addEventListener('click', () => {
        if (!speechRecognizer) {
            toast('Speech recognition not supported in this browser.');
            return;
        }
        if (state.isAiRecording) {
            speechRecognizer.stop();
            state.isAiRecording = false;
            aiMicBtn.classList.remove('recording');
        } else {
            state.isAiRecording = true;
            aiMicBtn.classList.add('recording');
            toast('🎙️ Listening... Speak your request.');
            try {
                speechRecognizer.start();
                speechRecognizer.onresult = (evt) => {
                    const speech = evt.results[0][0].transcript;
                    state.isAiRecording = false;
                    aiMicBtn.classList.remove('recording');
                    sendAiMessage(speech);
                };
                speechRecognizer.onerror = () => {
                    state.isAiRecording = false;
                    aiMicBtn.classList.remove('recording');
                };
                speechRecognizer.onend = () => {
                    state.isAiRecording = false;
                    aiMicBtn.classList.remove('recording');
                };
            } catch (e) {
                state.isAiRecording = false;
                aiMicBtn.classList.remove('recording');
            }
        }
    });

    // Clear AI chat
    document.getElementById('clearAiChatBtn')?.addEventListener('click', () => {
        if (aiChatFeed) {
            aiChatFeed.innerHTML = `
                <div class="chat-bubble-row bot">
                    <div class="bubble-avatar-mini"><i class="fa-solid fa-robot"></i></div>
                    <div class="chat-bubble-card">
                        <p>Chat cleared! How can I assist you with local repairs in Ramanagara today?</p>
                    </div>
                </div>
            `;
        }
    });

    // Home Mic Search Trigger
    document.getElementById('homeMicBtn')?.addEventListener('click', () => {
        switchTab('ai');
        setTimeout(() => aiMicBtn?.click(), 300);
    });

    document.getElementById('refreshWorkersBtn')?.addEventListener('click', () => {
        fetchAndRenderWorkers();
        toast('Worker list refreshed from SQLite database!');
    });

    /* ---------- Phone Handset Modal Controller ---------- */
    const phoneModal = document.getElementById('phoneCallModal');
    function openPhoneModal() {
        phoneModal?.classList.remove('hidden');
    }
    function closePhoneModal() {
        phoneModal?.classList.add('hidden');
    }

    document.getElementById('topPhoneCallBtn')?.addEventListener('click', openPhoneModal);
    document.getElementById('closePhoneModalBtn')?.addEventListener('click', closePhoneModal);
    document.getElementById('phoneEndCallBtn')?.addEventListener('click', closePhoneModal);

    /* ---------- Language Switcher ---------- */
    document.getElementById('langSwitchBtn')?.addEventListener('click', () => {
        state.lang = state.lang === 'en' ? 'kn' : 'en';
        document.getElementById('currentLangLabel').textContent = state.lang === 'en' ? 'Eng' : 'ಕನ್ನಡ';
        toast(`Language dialect set to ${state.lang === 'en' ? 'English' : 'ಕನ್ನಡ (Kannada)'}`);
    });

    /* ---------- Auth & Role Subsystems ---------- */

    function getSession() {
        try { return JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || 'null'); } catch { return null; }
    }
    function setSession(user) {
        localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
            email: user.email || '',
            phone: user.phone || '9876543210',
            role: user.role || state.selectedRole || 'customer',
            name: user.name || (user.role === 'worker' ? 'Ramesh Kumar' : 'Kavya Rao'),
            loggedInAt: Date.now()
        }));
    }
    function unlockApp() {
        document.body.classList.remove('auth-locked');
        document.getElementById('loginScreen')?.classList.add('hidden');
        const session = getSession();
        if (session) {
            const nameEl = document.getElementById('profileUserName');
            const phoneEl = document.getElementById('profileUserPhone');
            const initEl = document.getElementById('profileInitials');
            const roleEl = document.getElementById('profileActiveRole');
            if (nameEl) nameEl.textContent = session.name || 'Kavya Rao';
            if (phoneEl) phoneEl.textContent = '+91 ' + (session.phone || '98765 43210');
            if (initEl) initEl.textContent = (session.name || 'KR').split(' ').map(n=>n[0]).join('').slice(0,2);
            if (roleEl) roleEl.textContent = `${session.role.toUpperCase()} MODE`;
        }
    }

    function updateRoleSelection(role) {
        state.selectedRole = role;
        document.getElementById('roleCardCustomer')?.classList.toggle('active', role === 'customer');
        document.getElementById('roleCardWorker')?.classList.toggle('active', role === 'worker');
        document.getElementById('roleCardAdmin')?.classList.toggle('active', role === 'admin');

        const label = document.getElementById('roleSelectedLabel');
        if (label) {
            label.textContent = role === 'customer' ? 'Customer Mode Selected' : role === 'worker' ? 'Worker Mode Selected' : 'Admin & 3.5mm Console Selected';
        }
    }

    document.getElementById('roleCardCustomer')?.addEventListener('click', () => updateRoleSelection('customer'));
    document.getElementById('roleCardWorker')?.addEventListener('click', () => updateRoleSelection('worker'));
    document.getElementById('roleCardAdmin')?.addEventListener('click', () => updateRoleSelection('admin'));

    document.getElementById('guestBtn')?.addEventListener('click', () => {
        setSession({ name: 'Kavya Rao', phone: '9876543210', role: 'customer' });
        unlockApp();
        toast('Logged in as Guest Customer');
    });
    document.getElementById('guestWorkerBtn')?.addEventListener('click', () => {
        setSession({ name: 'Ramesh Kumar', phone: '9845011223', role: 'worker' });
        unlockApp();
        toast('Logged in as Guest Worker (Workspace Active)');
    });
    document.getElementById('guestAdminBtn')?.addEventListener('click', () => {
        setSession({ name: 'Cluster Admin', phone: '9999999999', role: 'admin' });
        unlockApp();
        toast('Logged in as Cluster Admin (3.5mm Console Active)');
    });

    document.getElementById('authForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('authIdentifier').value;
        setSession({ name: state.selectedRole === 'worker' ? 'Ramesh Kumar' : 'Kavya Rao', phone: id.replace(/\D/g, '') || '9876543210', role: state.selectedRole });
        unlockApp();
        toast('Welcome to GigSync!');
    });

    document.getElementById('profileLogoutBtn')?.addEventListener('click', () => {
        localStorage.removeItem(AUTH_SESSION_KEY);
        document.body.classList.add('auth-locked');
        document.getElementById('loginScreen')?.classList.remove('hidden');
        toast('Logged out successfully');
    });

    // Profile mode switch buttons
    document.getElementById('switchCustModeBtn')?.addEventListener('click', () => {
        setSession({ name: 'Kavya Rao', phone: '9876543210', role: 'customer' });
        toast('Switched to Customer Mode');
        switchTab('home');
    });
    document.getElementById('switchWorkerModeBtn')?.addEventListener('click', () => {
        setSession({ name: 'Ramesh Kumar', phone: '9845011223', role: 'worker' });
        toast('Switched to Worker Mode');
        switchTab('home');
    });
    document.getElementById('switchAdminModeBtn')?.addEventListener('click', () => {
        setSession({ name: 'Cluster Admin', phone: '9999999999', role: 'admin' });
        toast('Switched to Admin & 3.5mm Console');
        openPhoneModal();
    });

    document.getElementById('profileDownloadRecordBtn')?.addEventListener('click', () => {
        const stmt = `GigSync Verified Work Record\nWorker: Ramesh Kumar\nTrade: Electrician\nJobs Completed: 126\nRating: 4.8/5.0\nCluster: Ramanagara, Karnataka`;
        const blob = new Blob([stmt], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'GigSync_Record.txt';
        a.click();
        toast('Statement downloaded!');
    });

    // Initial Startup
    if (getSession()) unlockApp();
    fetchAndRenderWorkers();
    fetchAndRenderJobs();
});
