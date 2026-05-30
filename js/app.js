/**
 * Glenthorpe Cattleitics - Core Application Controller (app.js)
 * Manages Single Page App routing, views rendering, dynamic calculations, form validation, 
 * pedigree trees, pasture relocation logs, and CSV/JSON backups.
 */

// Initialize Database Instance globally
const db = new CattleiticsDB();
let currentCattleList = [];
let currentTaskList = [];
let currentPaddockList = [];
let activeTargetCowTag = null; // For modal context

// GIS Satellite Map & Interactive Boundary Drawing State
let farmMap = null;
let paddockPolygons = {}; // Map of paddock.id -> Leaflet polygon layer
let selectedPaddockId = null; // Currently selected paddock ID in Pastures view
let drawingMode = false;
let currentDrawingCoords = [];
let drawingPolyline = null;
let drawingMarkers = [];
let activeDrawingPaddockId = null;


// Page load initialization
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await db.init();

        // If we're in a cloud-capable environment (not local server), handle auth
        if (db.mode !== 'server' && window.supabase) {
            // Initialize Supabase client for auth checks even if not yet signed in
            if (!db.supabase) {
                db.supabase = window.supabase.createClient(
                    'https://pgerylvrwlyhviptwtym.supabase.co',
                    'sb_publishable_s-Ckau-hOE1wxEbQaiTziw_URHdCODa'
                );
            }

            // Check for existing session
            const { data: { session } } = await db.supabase.auth.getSession();
            if (session) {
                db.user = session.user;
                db.mode = 'supabase';
                db.storageMode = 'Cloud Sync (Supabase)';
            } else {
                // Show auth screen and wait for login
                showAuthScreen();
                bindAuthHandlers();
                return; // Don't load app until authenticated
            }

            // Listen for auth changes (logout, session expiry)
            db.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_OUT') {
                    showAuthScreen();
                }
            });
        }

        // Continue with normal app initialization
        await initializeApp();

    } catch (err) {
        console.error("Critical error starting Cattleitics:", err);
        alert("Failed to initialize database. Please reload the browser.");
    }
});

/**
 * Shows the authentication screen overlay.
 */
function showAuthScreen() {
    const authScreen = document.getElementById('auth-screen');
    if (authScreen) authScreen.style.display = 'flex';
    document.querySelector('.app-container').style.display = 'none';
}

/**
 * Hides auth screen and shows the main app.
 */
function hideAuthScreen() {
    const authScreen = document.getElementById('auth-screen');
    if (authScreen) authScreen.style.display = 'none';
    document.querySelector('.app-container').style.display = '';
}

/**
 * Binds login/signup form handlers.
 */
function bindAuthHandlers() {
    // Toggle between login and signup
    document.getElementById('show-signup').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('auth-login-box').style.display = 'none';
        document.getElementById('auth-signup-box').style.display = 'block';
    });

    document.getElementById('show-login').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('auth-signup-box').style.display = 'none';
        document.getElementById('auth-login-box').style.display = 'block';
    });

    // Login form
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const errorEl = document.getElementById('login-error');
        errorEl.style.display = 'none';

        try {
            await db.signIn(email, password);
            hideAuthScreen();
            await initializeApp();
        } catch (err) {
            errorEl.textContent = err.message || 'Sign in failed. Check your credentials.';
            errorEl.style.display = 'block';
        }
    });

    // Signup form
    document.getElementById('signup-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const farm = document.getElementById('signup-farm').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value;
        const confirm = document.getElementById('signup-password-confirm').value;
        const errorEl = document.getElementById('signup-error');
        errorEl.style.display = 'none';

        if (password !== confirm) {
            errorEl.textContent = 'Passwords do not match.';
            errorEl.style.display = 'block';
            return;
        }

        try {
            const result = await db.signUp(email, password, farm);
            
            // If email confirmation is required, show a message
            if (!result.session) {
                errorEl.textContent = 'Check your email to confirm your account, then sign in.';
                errorEl.style.display = 'block';
                errorEl.style.borderColor = 'var(--success)';
                errorEl.style.color = 'var(--success)';
                errorEl.style.background = 'rgba(40, 167, 69, 0.1)';
                return;
            }

            // Session is active - save farm name and proceed
            try {
                await db.saveSetting('farm_name', farm);
            } catch (settingsErr) {
                console.warn("Could not save farm name setting immediately:", settingsErr.message);
            }
            hideAuthScreen();
            await initializeApp();
        } catch (err) {
            errorEl.textContent = err.message || 'Sign up failed. Please try again.';
            errorEl.style.display = 'block';
        }
    });
}

/**
 * Core app initialization (called after auth is confirmed or in local/offline mode).
 */
async function initializeApp() {
        // Show storage mode status badge in the sidebar
        const statusBadge = document.getElementById('storage-status-badge');
        if (statusBadge) {
            const isCloud = db.mode === 'supabase';
            const isServer = db.mode === 'server';
            const color = (isCloud || isServer) ? 'var(--success)' : 'var(--warning)';
            statusBadge.innerHTML = `<i class="fa-solid fa-circle" style="color: ${color}; font-size: 0.55rem; margin-right: 0.25rem;"></i> ${db.storageMode}`;
        }

        // Hide shutdown button in cloud mode (not relevant)
        if (db.mode === 'supabase') {
            const shutdownBtn = document.getElementById('btn-shutdown-server');
            if (shutdownBtn) shutdownBtn.style.display = 'none';

            // Add sign out option
            addSignOutButton();

            // Check if this is a new user (no cattle yet) - show onboarding
            const cattle = await db.getAllCattle();
            const hasCompletedOnboarding = await db.getSetting('onboarding_complete').catch(() => null);
            if (cattle.length === 0 && !hasCompletedOnboarding) {
                showOnboardingScreen();
                // Pre-fill farm name from signup if available
                const savedFarm = await db.getSetting('farm_name').catch(() => null);
                if (savedFarm) {
                    const nameInput = document.getElementById('onboarding-farm-name');
                    if (nameInput) nameInput.value = savedFarm;
                }
                bindOnboardingHandlers();
                return;
            }
        }

        await initializeDatabaseIfEmpty(db);
        
        // Load initial state from Database
        await loadAppState();

        // Bind core application event listeners
        bindViewRouting();
        bindFiltering();
        bindFormHandlers();
        bindModals();
        bindDataOperations();
        
        // Initial render
        renderDashboard();
        renderCattleHerd();
        renderPasturesView();
        renderTasks();

        console.log("Cattleitics Application fully loaded in storage mode: " + db.storageMode);
}

/**
 * Shows the onboarding screen for new users.
 */
function showOnboardingScreen() {
    document.getElementById('onboarding-screen').style.display = 'flex';
    document.querySelector('.app-container').style.display = 'none';

    // Initialize the onboarding map after a brief delay (DOM needs to be visible)
    setTimeout(() => {
        initOnboardingMap();
    }, 200);
}

/** Onboarding map instance and marker */
let onboardingMap = null;
let onboardingMarker = null;
let onboardingCoords = { lat: -31.5, lng: 26.5 }; // Default: central Eastern Cape

/**
 * Initializes the Leaflet map on the onboarding screen.
 */
function initOnboardingMap() {
    if (onboardingMap) return; // Already initialized

    onboardingMap = L.map('onboarding-map').setView([onboardingCoords.lat, onboardingCoords.lng], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 18
    }).addTo(onboardingMap);

    // Click to place marker
    onboardingMap.on('click', (e) => {
        onboardingCoords = { lat: e.latlng.lat, lng: e.latlng.lng };

        if (onboardingMarker) {
            onboardingMarker.setLatLng(e.latlng);
        } else {
            onboardingMarker = L.marker(e.latlng, { draggable: true }).addTo(onboardingMap);
            onboardingMarker.on('dragend', (ev) => {
                const pos = ev.target.getLatLng();
                onboardingCoords = { lat: pos.lat, lng: pos.lng };
                document.getElementById('onboarding-coords').textContent = `📍 ${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`;
            });
        }

        document.getElementById('onboarding-coords').textContent = `📍 ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
    });
}

/**
 * Hides onboarding and launches the main app.
 */
async function finishOnboarding() {
    // Save farm name
    const farmNameInput = document.getElementById('onboarding-farm-name');
    const farmName = farmNameInput ? farmNameInput.value.trim() : '';
    if (farmName) {
        try { await db.saveSetting('farm_name', farmName); } catch (e) { console.warn(e); }
    }

    // Save farm location coordinates
    if (onboardingCoords) {
        try { await db.saveSetting('farm_location', onboardingCoords); } catch (e) { console.warn(e); }
    }

    // Mark onboarding complete
    try { await db.saveSetting('onboarding_complete', true); } catch (e) { console.warn(e); }

    // Clean up onboarding map
    if (onboardingMap) {
        onboardingMap.remove();
        onboardingMap = null;
        onboardingMarker = null;
    }

    document.getElementById('onboarding-screen').style.display = 'none';
    document.querySelector('.app-container').style.display = '';

    await initializeDatabaseIfEmpty(db);
    await loadAppState();
    bindViewRouting();
    bindFiltering();
    bindFormHandlers();
    bindModals();
    bindDataOperations();
    renderDashboard();
    renderCattleHerd();
    renderPasturesView();
    renderTasks();
}

/**
 * Binds onboarding screen event handlers.
 */
function bindOnboardingHandlers() {
    // Download CSV template
    document.getElementById('btn-download-template').addEventListener('click', () => {
        const headers = [
            'Tag ID', 'Name', 'Breed', 'Gender', 'Date of Birth', 'Status',
            'Current Pasture', 'Is Pregnant (TRUE/FALSE)', 'Expected Calving Date',
            'Insemination Method', 'Dam Tag', 'Sire Tag', 'Purchase Date',
            'Purchase Price (ZAR)', 'Supplier', 'Sale Date', 'Sale Price (ZAR)', 'Buyer'
        ];
        const exampleRow = [
            'NGU-001', 'Bessie', 'Nguni', 'Cow', '2019-05-15', 'Active',
            'House Paddock', 'TRUE', '2025-11-01', 'Bull (Themba)',
            '', '', '2020-03-10', '12000', 'Local Auction', '', '', ''
        ];
        const csv = headers.join(',') + '\n' + exampleRow.join(',') + '\n';
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', 'cattleitics_herd_template.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // Upload CSV file
    const uploadBox = document.getElementById('onboarding-upload-box');
    const fileInput = document.getElementById('onboarding-import-file');
    const statusEl = document.getElementById('onboarding-upload-status');

    uploadBox.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        statusEl.style.display = 'block';
        statusEl.style.color = 'var(--text-muted)';
        statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing file...';

        try {
            const text = await file.text();
            let cattleList = [];

            if (file.name.endsWith('.json')) {
                cattleList = JSON.parse(text);
            } else {
                cattleList = parseCSVImport(text);
            }

            if (cattleList.length === 0) {
                statusEl.style.color = 'var(--danger)';
                statusEl.textContent = 'No valid cattle records found in file.';
                return;
            }

            await db.bulkSaveCattle(cattleList);
            statusEl.style.color = 'var(--success)';
            statusEl.innerHTML = `<i class="fa-solid fa-check-circle"></i> Successfully imported ${cattleList.length} cattle records!`;
        } catch (err) {
            statusEl.style.color = 'var(--danger)';
            statusEl.textContent = 'Error: ' + (err.message || 'Could not process file.');
        }
    });

    // Finish onboarding
    document.getElementById('btn-onboarding-finish').addEventListener('click', async () => {
        await finishOnboarding();
    });
}

/**
 * Parses a CSV file into cattle objects for import.
 */
function parseCSVImport(csvText) {
    const lines = csvText.split(/\r?\n/);
    if (lines.length < 2) return [];

    const results = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = parseCSVRow(line);
        if (cols.length < 4) continue;

        const tagId = (cols[0] || '').trim();
        if (!tagId) continue;

        results.push({
            tagId: tagId,
            name: cols[1] || '',
            breed: cols[2] || 'Nguni',
            gender: cols[3] || 'Cow',
            dob: cols[4] || '',
            status: cols[5] || 'Active',
            pasture: cols[6] || '',
            pregnant: cols[7] ? cols[7].toUpperCase() === 'TRUE' : false,
            expectedCalvingDate: cols[8] || null,
            inseminationMethod: cols[9] || null,
            dam: cols[10] || '',
            sire: cols[11] || '',
            purchaseDate: cols[12] || '',
            purchasePrice: Number(cols[13]) || 0,
            supplier: cols[14] || '',
            saleDate: cols[15] || null,
            salePrice: cols[16] ? Number(cols[16]) : null,
            buyer: cols[17] || null,
            image: '',
            history: []
        });
    }
    return results;
}

/**
 * Simple CSV row parser handling quoted fields.
 */
function parseCSVRow(text) {
    let p = '', r = [], q = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') { q = !q; }
        else if (c === ',' && !q) { r.push(p); p = ''; }
        else { p += c; }
    }
    r.push(p);
    return r;
}

/**
 * Adds a sign-out button to the sidebar for cloud users.
 */
function addSignOutButton() {
    const nav = document.querySelector('.nav-links');
    if (!nav || document.getElementById('btn-signout')) return;

    const li = document.createElement('li');
    li.className = 'nav-item signout-item';
    li.id = 'btn-signout';
    li.style.marginTop = '1rem';
    li.style.borderTop = '1px dashed rgba(255,255,255,0.1)';
    li.innerHTML = `<a href="#"><i class="fa-solid fa-arrow-right-from-bracket"></i> <span>Sign Out</span></a>`;
    li.addEventListener('click', async (e) => {
        e.preventDefault();
        await db.signOut();
        window.location.reload();
    });
    nav.appendChild(li);
}

/**
 * Loads list values from IndexedDB into memory.
 */
async function loadAppState() {
    currentCattleList = await db.getAllCattle();
    currentTaskList = await db.getAllTasks();
    
    // Load Paddocks using dedicated method supporting server API or offline fallback
    const paddocksSetting = await db.getAllPaddocks();
    if (db.mode === 'supabase') {
        // Cloud users: use whatever they have (empty for new users)
        currentPaddockList = paddocksSetting || [];
    } else {
        // Local/offline: fall back to mock paddocks if empty
        currentPaddockList = (paddocksSetting && paddocksSetting.length > 0) ? paddocksSetting : MOCK_PADDOCKS;
    }

    // Load farm name setup
    let farmName = 'My Farm';
    try {
        farmName = await db.getSetting('farm_name') || (db.mode === 'supabase' ? 'My Farm' : 'Glenthorpe Farm');
    } catch (err) {
        console.warn("Could not load farm name:", err.message);
    }
    document.querySelector('.logo-text span').textContent = farmName;
    const farmNameLabel = document.getElementById('farm-name-label');
    if (farmNameLabel) farmNameLabel.textContent = farmName;
    document.getElementById('settings-farm-name').value = farmName;
    
    // Populate form pasture and parent selectors
    populateFormSelectors();
}

/**
 * Handles view switching in the Single Page Application.
 */
function bindViewRouting() {
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.app-view');
    const viewTitle = document.getElementById('view-title');
    const viewSubtitle = document.getElementById('view-subtitle');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const target = item.dataset.target;

            // Update navigation active status
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // Show appropriate panel
            views.forEach(v => {
                if (v.id === target) {
                    v.classList.add('active');
                } else {
                    v.classList.remove('active');
                }
            });

            // Set Header context text
            switch(target) {
                case 'dashboard-view':
                    viewTitle.textContent = "Dashboard Overview";
                    viewSubtitle.textContent = "Real-time agricultural telemetry & herd metrics";
                    renderDashboard();
                    break;
                case 'cattle-view':
                    viewTitle.textContent = "Cattle Herd Register";
                    viewSubtitle.textContent = "Comprehensive inventory, biological profiles & pedigree tracking";
                    renderCattleHerd();
                    break;
                case 'pastures-view':
                    viewTitle.textContent = "Pasture Rotations";
                    viewSubtitle.textContent = "Manage paddock density, movement logs, and grazing load";
                    renderPasturesView();
                    if (farmMap) {
                        setTimeout(() => farmMap.invalidateSize(), 100);
                    }
                    break;
                case 'tasks-view':
                    viewTitle.textContent = "Task & Vaccination Scheduler";
                    viewSubtitle.textContent = "Plan veterinary procedures, dipping cycles, and supplements";
                    renderTasks();
                    break;
                case 'settings-view':
                    viewTitle.textContent = "Data & Configuration Control";
                    viewSubtitle.textContent = "Spreadsheet CSV import/export, backup data, and paddock adjustments";
                    break;
                case 'readme-view':
                    viewTitle.textContent = "Cattleitics User Manual & Guide";
                    viewSubtitle.textContent = "Complete project documentation, workflows, and server operations";
                    loadAndRenderReadme();
                    break;
            }
        });
    });
}

/**
 * Computes metrics and populates the Dashboard view.
 */
function renderDashboard() {
    // 1. Calculations
    const activeCattle = currentCattleList.filter(c => c.status === 'Active');
    const totalHerdCount = activeCattle.length;
    
    // Valuation - Sum of purchase prices for active cows
    const totalValuation = activeCattle.reduce((sum, c) => sum + (Number(c.purchasePrice) || 0), 0);
    
    // Active pregnancies
    const activePregnancies = activeCattle.filter(c => c.pregnant === true).length;

    // Upcoming urgent tasks
    const urgentTasks = currentTaskList.filter(t => t.status === 'Urgent').length;

    // 2. Set stats values in header block
    document.getElementById('stat-total-count').textContent = currentCattleList.length;
    document.getElementById('stat-active-count').textContent = `${totalHerdCount} active cattle`;
    document.getElementById('stat-herd-value').textContent = formatCurrencyZAR(totalValuation);
    document.getElementById('stat-pregnancy-count').textContent = activePregnancies;
    document.getElementById('stat-tasks-count').textContent = urgentTasks;

    // 3. Render Pasture load grid
    const pastureGrid = document.getElementById('dashboard-pasture-grid');
    pastureGrid.innerHTML = '';

    currentPaddockList.forEach(paddock => {
        // Count active cattle in this paddock
        const paddockCows = activeCattle.filter(c => c.pasture === paddock.id);
        const count = paddockCows.length;

        const cell = document.createElement('div');
        cell.className = `paddock-cell category-${(paddock.category || 'Grassland').toLowerCase()}`;
        cell.dataset.id = paddock.id;
        
        // Build mini scrollable thumbnails of cows currently in this paddock
        let thumbsHTML = '';
        if (count > 0) {
            thumbsHTML = '<div class="paddock-thumbs-scroll">';
            paddockCows.slice(0, 5).forEach(cow => {
                thumbsHTML += `<img src="${cow.image || 'assets/images/nguni_cow.png'}" class="paddock-mini-thumb" title="${cow.tagId} - ${cow.name || 'Unnamed'}" onclick="event.stopPropagation(); openCattleDetailsModal('${cow.tagId}');">`;
            });
            if (count > 5) {
                thumbsHTML += `<span style="font-size: 0.6rem; color: var(--text-muted); align-self: center; margin-left: 0.15rem;">+${count - 5}</span>`;
            }
            thumbsHTML += '</div>';
        }

        cell.innerHTML = `
            <div class="paddock-icon"><i class="fa-solid ${getPaddockIcon(paddock.category)}"></i></div>
            <div>
                <div class="paddock-name">${paddock.name}</div>
                <div class="paddock-type">${paddock.type} • ${paddock.size}</div>
                ${thumbsHTML}
            </div>
            <div class="paddock-count">${count} <span style="font-size: 0.75rem; font-weight: normal; color: var(--text-muted);">head</span></div>
        `;

        cell.addEventListener('click', () => {
            // Select paddock cell visually
            document.querySelectorAll('.paddock-cell').forEach(c => c.classList.remove('selected'));
            cell.classList.add('selected');
            
            // Show Mini Drawer for this paddock
            renderMiniPaddockDrawer(paddock);
        });

        pastureGrid.appendChild(cell);
    });

    // 4. Render Upcoming Tasks (Limit to top 4)
    const taskContainer = document.getElementById('dashboard-task-list');
    taskContainer.innerHTML = '';

    const activeTasks = currentTaskList
        .filter(t => t.status !== 'Completed')
        .sort((a, b) => (a.status === 'Urgent' ? -1 : 1))
        .slice(0, 4);

    if (activeTasks.length === 0) {
        taskContainer.innerHTML = `<div class="pasture-desc" style="text-align: center; padding: 2rem;">No pending farm chores or vaccinations.</div>`;
    } else {
        activeTasks.forEach(task => {
            const item = document.createElement('div');
            item.className = `task-item ${task.status.toLowerCase()}`;
            item.innerHTML = `
                <div class="task-content">
                    <div class="task-title">${task.title}</div>
                    <div class="task-meta"><i class="fa-regular fa-calendar-days"></i> Due: ${task.dueDate} • Target: ${task.targetCattle}</div>
                </div>
                <div class="task-checkbox" data-id="${task.id}"></div>
            `;

            // Complete Task Checkmark Handler
            item.querySelector('.task-checkbox').addEventListener('click', async (e) => {
                e.stopPropagation();
                await toggleTaskComplete(task.id);
            });

            taskContainer.appendChild(item);
        });
    }
}

/**
 * Renders the mini Paddock detail drawer on the dashboard.
 */
function renderMiniPaddockDrawer(paddock) {
    const drawer = document.getElementById('mini-paddock-drawer');
    const title = document.getElementById('mini-paddock-title');
    const container = document.getElementById('mini-paddock-list');

    title.textContent = `Cattle in ${paddock.name}:`;
    container.innerHTML = '';

    const paddockCattle = currentCattleList.filter(c => c.status === 'Active' && c.pasture === paddock.id);

    if (paddockCattle.length === 0) {
        container.innerHTML = `<div class="pasture-desc">No cattle currently grazing here.</div>`;
    } else {
        paddockCattle.forEach(cow => {
            const pill = document.createElement('div');
            pill.className = 'pasture-cow-pill';
            pill.innerHTML = `
                <img src="${cow.image || 'assets/images/nguni_cow.png'}" class="pasture-cow-thumb" alt="">
                <div class="pasture-cow-info">
                    <span class="pasture-cow-tag">${cow.tagId}</span>
                    <span class="pasture-cow-name">${cow.name || 'Unnamed'}</span>
                </div>
            `;
            pill.addEventListener('click', () => openCattleDetailsModal(cow.tagId));
            container.appendChild(pill);
        });
    }

    drawer.style.display = 'block';
}

/**
 * Toggles a task status to completed in the database.
 */
async function toggleTaskComplete(taskId) {
    const task = currentTaskList.find(t => t.id === taskId);
    if (task) {
        task.status = task.status === 'Completed' ? 'Pending' : 'Completed';
        await db.saveTask(task);
        
        // Log event for target cattle if it is associated with a specific cow
        if (task.status === 'Completed' && task.targetCattle && task.targetCattle !== 'All Active' && task.targetCattle !== 'All') {
            const cow = currentCattleList.find(c => c.tagId === task.targetCattle);
            if (cow) {
                const event = {
                    id: Date.now(),
                    date: new Date().toISOString().split('T')[0],
                    type: 'Health',
                    description: `Completed task: ${task.title}. ${task.description || ''}`,
                    performer: 'Toast Seagers'
                };
                cow.history.push(event);
                await db.saveCow(cow);
            }
        }

        await loadAppState();
        renderDashboard();
        renderTasks();
    }
}

/**
 * Renders the filterable Cattle Herd inventory card grid.
 */
function renderCattleHerd() {
    const container = document.getElementById('cattle-cards-grid');
    container.innerHTML = '';

    // Filter values
    const searchVal = document.getElementById('search-cattle').value.toLowerCase().trim();
    const breedVal = document.getElementById('filter-breed').value;
    const genderVal = document.getElementById('filter-gender').value;
    const pregVal = document.getElementById('filter-pregnancy').value;
    const statusVal = document.getElementById('filter-status').value;

    const filtered = currentCattleList.filter(cow => {
        // Search matches Name, Tag, Breed
        const matchesSearch = !searchVal || 
            cow.tagId.toLowerCase().includes(searchVal) || 
            (cow.name && cow.name.toLowerCase().includes(searchVal)) || 
            cow.breed.toLowerCase().includes(searchVal);

        const matchesBreed = !breedVal || cow.breed === breedVal;
        
        // Gender match (Heifers/Cows mapped to female, Bulls/Steers mapped to male)
        let matchesGender = true;
        if (genderVal) {
            if (genderVal === 'Calf') {
                matchesGender = cow.gender === 'Calf' || computeAgeMonths(cow.dob) <= 8;
            } else {
                matchesGender = cow.gender === genderVal;
            }
        }

        // Pregnancy match
        let matchesPregnancy = true;
        if (pregVal === 'pregnant') {
            matchesPregnancy = cow.pregnant === true;
        } else if (pregVal === 'not_pregnant') {
            matchesPregnancy = !cow.pregnant;
        }

        const matchesStatus = !statusVal || cow.status === statusVal;

        return matchesSearch && matchesBreed && matchesGender && matchesPregnancy && matchesStatus;
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div class="settings-card span-2" style="text-align: center; width: 100%; grid-column: span 3; padding: 3rem;">
            <i class="fa-solid fa-cow" style="font-size: 3rem; color: var(--text-muted); margin-bottom: 1rem;"></i>
            <h3>No matching cattle found</h3>
            <p>Try clearing your filters or add a new cattle record to your herd register.</p>
        </div>`;
        return;
    }

    filtered.forEach(cow => {
        const card = document.createElement('div');
        card.className = 'cow-card';
        card.innerHTML = `
            <div class="cow-image-wrapper">
                <img src="${cow.image || 'assets/images/nguni_cow.png'}" class="cow-image" alt="${cow.name}">
                <div class="cow-tag-badge">${cow.tagId}</div>
                <div class="cow-status-badge cow-status-${cow.status.toLowerCase()}">${cow.status}</div>
            </div>
            <div class="cow-card-content">
                <div class="cow-card-header">
                    <div>
                        <div class="cow-name">${cow.name || 'Unnamed'}</div>
                        <div class="cow-breed">${cow.breed}</div>
                    </div>
                    <div class="cow-indicators">
                        ${cow.pregnant ? '<div class="indicator-badge pregnant" title="Pregnant Cow"><i class="fa-solid fa-baby-carriage"></i></div>' : ''}
                        <div class="indicator-badge" title="${cow.gender}">
                            <i class="fa-solid ${cow.gender === 'Bull' ? 'fa-mars' : cow.gender === 'Cow' || cow.gender === 'Heifer' ? 'fa-venus' : 'fa-genderless'}"></i>
                        </div>
                    </div>
                </div>
                
                <div class="cow-details-row">
                    <div class="detail-item">
                        <span class="detail-label">Location</span>
                        <span class="detail-val">${getPaddockName(cow.pasture)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Age</span>
                        <span class="detail-val">${formatAgeString(cow.dob)}</span>
                    </div>
                </div>
            </div>
        `;

        card.addEventListener('click', () => openCattleDetailsModal(cow.tagId));
        container.appendChild(card);
    });
}

/**
 * Helper to style paddock polygon colors based on landscape category
 */
function getCategoryColor(category) {
    switch (category) {
        case 'Homestead': return '#d4af37'; // gold
        case 'Riverine': return '#00b4d8'; // blue
        case 'Ridge': return '#8fa89b'; // sage/gray
        case 'Wooded': return '#52b788'; // forest green
        case 'Grassland': return '#f77f00'; // warm orange
        default: return '#70e000';
    }
}

/**
 * Renders the detailed GIS Pastures Satellite Map and overlays.
 */
async function renderPasturesView() {
    const mapContainer = document.getElementById('farm-gis-map');
    if (!mapContainer) return;
    
    // Clear any previous polygon layers
    for (const pid in paddockPolygons) {
        if (paddockPolygons[pid]) {
            paddockPolygons[pid].remove();
        }
    }
    paddockPolygons = {};

    // 1. Initialize Map once if not already done
    if (!farmMap) {
        // Use saved farm location or default to Eastern Cape
        const savedLocation = await db.getSetting('farm_location').catch(() => null);
        const mapCenter = savedLocation ? [savedLocation.lat, savedLocation.lng] : [-33.362718, 26.503312];
        const mapZoom = savedLocation ? 15 : 16;

        farmMap = L.map('farm-gis-map', {
            zoomControl: false
        }).setView(mapCenter, mapZoom);

        L.control.zoom({
            position: 'topleft'
        }).addTo(farmMap);

        // Esri high-res satellite tile server (free & zero-dependency)
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
        }).addTo(farmMap);

        // Bind map clicks for drawing coordinates
        farmMap.on('click', (e) => {
            if (drawingMode) {
                addPointToDrawing(e.latlng);
            }
        });
    }

    // 2. Draw all paddock polygons on the Leaflet map
    const activeCattle = currentCattleList.filter(c => c.status === 'Active');
    
    currentPaddockList.forEach(paddock => {
        if (paddock.coordinates && paddock.coordinates.length > 0) {
            const color = getCategoryColor(paddock.category);
            const polygon = L.polygon(paddock.coordinates, {
                color: color,
                fillColor: color,
                fillOpacity: 0.25,
                weight: 2
            }).addTo(farmMap);

            const paddockCattle = activeCattle.filter(c => c.pasture === paddock.id);
            const count = paddockCattle.length;

            // Permanent text tooltips showing pasture names
            polygon.bindTooltip(`<strong>${paddock.name}</strong>`, {
                permanent: true,
                direction: 'center',
                className: 'leaflet-tooltip'
            });

            // Interactive popup telemetries list
            let popupHTML = `<h4>${paddock.name} Telemetries</h4>`;
            popupHTML += `<p style="margin: 0.2rem 0;"><strong>Veld Class:</strong> ${paddock.type}</p>`;
            popupHTML += `<p style="margin: 0.2rem 0;"><strong>Hectares:</strong> ${paddock.size}</p>`;
            popupHTML += `<p style="margin: 0.2rem 0;"><strong>Headcount:</strong> ${count} active stock</p>`;
            if (count > 0) {
                popupHTML += `<div style="border-top: 1px dashed var(--border-color); padding-top: 0.5rem; margin-top: 0.5rem; max-height: 120px; overflow-y: auto;">`;
                paddockCattle.forEach(cow => {
                    popupHTML += `
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; cursor: pointer;" onclick="openCattleDetailsModal('${cow.tagId}')">
                            <img src="${cow.image || 'assets/images/nguni_cow.png'}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;" alt=""/>
                            <strong style="color: var(--gold);">${cow.tagId}</strong> - ${cow.name || 'Unnamed'}
                        </div>
                    `;
                });
                popupHTML += `</div>`;
            } else {
                popupHTML += `<p style="font-style: italic; color: var(--text-muted); margin: 0.5rem 0 0 0;">No stock currently grazing here.</p>`;
            }

            polygon.bindPopup(popupHTML, {
                maxWidth: 240
            });

            polygon.on('click', () => {
                if (drawingMode) return;
                
                // Set active select visual class on list cards
                document.querySelectorAll('#map-pasture-grid .paddock-cell').forEach(c => c.classList.remove('selected'));
                const cardEl = document.querySelector(`#map-pasture-grid .paddock-cell[data-id="${paddock.id}"]`);
                if (cardEl) cardEl.classList.add('selected');

                selectedPaddockId = paddock.id;
                renderPaddockDetailsPanel(paddock, paddockCattle);
                farmMap.panTo(polygon.getBounds().getCenter());
            });

            paddockPolygons[paddock.id] = polygon;
        }
    });

    // 3. Populate Paddock Directory List below the map
    const grid = document.getElementById('map-pasture-grid');
    if (grid) {
        grid.innerHTML = '';
        currentPaddockList.forEach(paddock => {
            const paddockCattle = activeCattle.filter(c => c.pasture === paddock.id);
            const count = paddockCattle.length;

            const cell = document.createElement('div');
            cell.className = `paddock-cell category-${(paddock.category || 'Grassland').toLowerCase()}`;
            cell.dataset.id = paddock.id;

            if (selectedPaddockId === paddock.id) {
                cell.classList.add('selected');
            }

            // Build mini scrollable thumbnails of cows currently in this paddock
            let thumbsHTML = '';
            if (count > 0) {
                thumbsHTML = '<div class="paddock-thumbs-scroll">';
                paddockCows = paddockCattle;
                paddockCows.slice(0, 5).forEach(cow => {
                    thumbsHTML += `<img src="${cow.image || 'assets/images/nguni_cow.png'}" class="paddock-mini-thumb" title="${cow.tagId} - ${cow.name || 'Unnamed'}" onclick="event.stopPropagation(); openCattleDetailsModal('${cow.tagId}');">`;
                });
                if (count > 5) {
                    thumbsHTML += `<span style="font-size: 0.6rem; color: var(--text-muted); align-self: center; margin-left: 0.15rem;">+${count - 5}</span>`;
                }
                thumbsHTML += '</div>';
            }

            // Boundary drawn check badge for clear UX guidance
            const hasCoords = paddock.coordinates && paddock.coordinates.length > 0;
            const coordStatusHTML = hasCoords 
                ? `<span style="color: var(--success); font-size: 0.75rem; font-weight: 500; display: inline-flex; align-items: center; gap: 0.25rem; margin-top: 0.2rem;"><i class="fa-solid fa-square-check"></i> GPS Boundary Saved</span>`
                : `<span style="color: var(--warning); font-size: 0.75rem; font-weight: 500; display: inline-flex; align-items: center; gap: 0.25rem; margin-top: 0.2rem;"><i class="fa-solid fa-draw-polygon"></i> Boundary needed</span>`;

            cell.innerHTML = `
                <div class="paddock-icon"><i class="fa-solid ${getPaddockIcon(paddock.category)}"></i></div>
                <div>
                    <div class="paddock-name">${paddock.name}</div>
                    <div class="paddock-type">${paddock.type} • ${paddock.size}</div>
                    <div style="margin-bottom: 0.25rem;">${coordStatusHTML}</div>
                    ${thumbsHTML}
                </div>
                <div class="paddock-count">${count} <span style="font-size: 0.75rem; font-weight: normal; color: var(--text-muted);">head</span></div>
            `;

            cell.addEventListener('click', () => {
                document.querySelectorAll('#map-pasture-grid .paddock-cell').forEach(c => c.classList.remove('selected'));
                cell.classList.add('selected');
                
                selectedPaddockId = paddock.id;
                renderPaddockDetailsPanel(paddock, paddockCattle);
                
                // Sync visual centering & zoom on map if boundaries exist
                if (paddockPolygons[paddock.id]) {
                    const poly = paddockPolygons[paddock.id];
                    farmMap.panTo(poly.getBounds().getCenter());
                    poly.openPopup();
                } else {
                    // Fallback centering for paddocks without map points defined yet
                    farmMap.setView([-33.362718, 26.503312], 16);
                }
            });

            grid.appendChild(cell);
        });
    }

    // If a paddock was previously selected, refresh its details panel automatically
    if (selectedPaddockId) {
        const selPaddock = currentPaddockList.find(p => p.id === selectedPaddockId);
        if (selPaddock) {
            const selCattle = activeCattle.filter(c => c.pasture === selectedPaddockId);
            renderPaddockDetailsPanel(selPaddock, selCattle);
        }
    }
}

/**
 * Populates the detailed pasture animals sub-sheet.
 */
function renderPaddockDetailsPanel(paddock, paddockCattle) {
    const panel = document.getElementById('pasture-details-panel');
    const name = document.getElementById('paddock-detail-name');
    const meta = document.getElementById('paddock-detail-meta');
    const desc = document.getElementById('paddock-detail-desc');
    const list = document.getElementById('paddock-cows-list');

    name.textContent = paddock.name;
    meta.textContent = `${paddock.size} | ${paddock.type}`;
    desc.textContent = paddock.description;
    list.innerHTML = '';

    if (paddockCattle.length === 0) {
        list.innerHTML = `<div class="pasture-desc">No cattle currently grazing here. Select another pasture.</div>`;
    } else {
        paddockCattle.forEach(cow => {
            const pill = document.createElement('div');
            pill.className = 'pasture-cow-pill';
            pill.innerHTML = `
                <img src="${cow.image || 'assets/images/nguni_cow.png'}" class="pasture-cow-thumb" alt="">
                <div class="pasture-cow-info">
                    <span class="pasture-cow-tag">${cow.tagId}</span>
                    <span class="pasture-cow-name">${cow.name || 'Unnamed'}</span>
                </div>
            `;
            pill.addEventListener('click', () => openCattleDetailsModal(cow.tagId));
            list.appendChild(pill);
        });
    }

    panel.style.display = 'block';
}

/**
 * Renders full task list with priority filters.
 */
function renderTasks() {
    const listContainer = document.getElementById('full-task-list');
    listContainer.innerHTML = '';

    const filterBtn = document.querySelector('.filter-task-btn.active');
    const filter = filterBtn ? filterBtn.dataset.filter : 'All';

    const filteredTasks = currentTaskList.filter(task => {
        if (filter === 'All') return true;
        if (filter === 'Completed') return task.status === 'Completed';
        if (filter === 'Pending') return task.status === 'Pending';
        if (filter === 'Urgent') return task.status === 'Urgent';
        return true;
    });

    if (filteredTasks.length === 0) {
        listContainer.innerHTML = `<div class="pasture-desc" style="text-align: center; padding: 3rem;">No chores found in this category. Click 'Add New Task' to schedule one.</div>`;
        return;
    }

    filteredTasks.forEach(task => {
        const item = document.createElement('div');
        item.className = `task-item ${task.status.toLowerCase()}`;
        item.innerHTML = `
            <div style="display: flex; gap: 1rem; align-items: center; width: 100%;">
                <div class="task-checkbox ${task.status === 'Completed' ? 'checked' : ''}" data-id="${task.id}"></div>
                <div class="task-content" style="flex-grow: 1;">
                    <div class="task-title" style="font-size: 1.1rem;">${task.title}</div>
                    <div class="task-meta" style="margin-top: 0.15rem;">
                        <span style="color: var(--gold); font-weight: 600;">Category:</span> ${task.category} &nbsp;•&nbsp; 
                        <span style="color: var(--gold); font-weight: 600;">Due:</span> ${task.dueDate} &nbsp;•&nbsp; 
                        <span style="color: var(--gold); font-weight: 600;">Target:</span> ${task.targetCattle}
                    </div>
                    <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.35rem; line-height: 1.3;">${task.description || ''}</p>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn btn-secondary btn-sm edit-task-btn" data-id="${task.id}" style="padding: 0.4rem 0.6rem;"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-secondary btn-sm delete-task-btn" data-id="${task.id}" style="padding: 0.4rem 0.6rem; color: var(--danger); border-color: rgba(217, 4, 41, 0.2);"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `;

        // Checkbox click
        item.querySelector('.task-checkbox').addEventListener('click', async (e) => {
            e.stopPropagation();
            await toggleTaskComplete(task.id);
        });

        // Edit button click
        item.querySelector('.edit-task-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openTaskFormModal(task.id);
        });

        // Delete button click
        item.querySelector('.delete-task-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm(`Delete chore task: "${task.title}"?`)) {
                await db.deleteTask(task.id);
                await loadAppState();
                renderTasks();
                renderDashboard();
            }
        });

        listContainer.appendChild(item);
    });
}

/**
 * Filter bindings (search inputs, task buttons).
 */
function bindFiltering() {
    // Cattle Inventory Filter events
    document.getElementById('search-cattle').addEventListener('input', renderCattleHerd);
    document.getElementById('filter-breed').addEventListener('change', renderCattleHerd);
    document.getElementById('filter-gender').addEventListener('change', renderCattleHerd);
    document.getElementById('filter-pregnancy').addEventListener('change', renderCattleHerd);
    document.getElementById('filter-status').addEventListener('change', renderCattleHerd);

    // Task view filter tabs buttons
    const filterBtns = document.querySelectorAll('.filter-task-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderTasks();
        });
    });
}

/**
 * Pre-populates the Parent and Pasture selector dropdowns in Forms.
 */
function populateFormSelectors() {
    const paddockSelect = document.getElementById('form-pasture');
    const movePastureSelect = document.getElementById('move-target-pasture');
    const damSelect = document.getElementById('form-dam');
    const sireSelect = document.getElementById('form-sire');

    paddockSelect.innerHTML = '';
    movePastureSelect.innerHTML = '';
    currentPaddockList.forEach(p => {
        paddockSelect.innerHTML += `<option value="${p.id}">${p.name}</option>`;
        movePastureSelect.innerHTML += `<option value="${p.id}">${p.name}</option>`;
    });

    damSelect.innerHTML = '<option value="">Unknown / None</option>';
    sireSelect.innerHTML = '<option value="">Unknown / None</option>';

    // Filter dams (female Cows/Heifers) and sires (male Bulls)
    currentCattleList.forEach(c => {
        if (c.gender === 'Cow' || c.gender === 'Heifer') {
            damSelect.innerHTML += `<option value="${c.tagId}">${c.tagId} - ${c.name || 'Unnamed'}</option>`;
        } else if (c.gender === 'Bull') {
            sireSelect.innerHTML += `<option value="${c.tagId}">${c.tagId} - ${c.name || 'Unnamed'}</option>`;
        }
    });
}

/**
 * Form Submit Handlers (Cattle adding/editing, Vet logging, Task creating).
 */
function bindFormHandlers() {
    const cowForm = document.getElementById('cattle-add-edit-form');
    const eventForm = document.getElementById('timeline-event-form');
    const taskForm = document.getElementById('task-add-edit-form');
    const movementForm = document.getElementById('pasture-movement-form');

    // 1. Cattle Profile Add/Edit Submit
    cowForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const tagId = document.getElementById('form-tag-id').value.toUpperCase().trim();
        const originalTag = cowForm.dataset.editingTag;
        
        // Validation: Unique tag ID checking
        if (!originalTag && currentCattleList.some(c => c.tagId === tagId)) {
            alert(`Cattle record with Tag ID "${tagId}" already exists! Please use a unique ear tag.`);
            return;
        }

        // Get file/photo preview source
        const photoPreviewBox = document.getElementById('form-photo-preview');
        const imgStyle = photoPreviewBox.style.backgroundImage;
        let base64Image = null;
        if (imgStyle && imgStyle.includes('data:image')) {
            base64Image = imgStyle.replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
        } else if (originalTag) {
            const originalCow = currentCattleList.find(c => c.tagId === originalTag);
            if (originalCow) base64Image = originalCow.image;
        }

        const isPregChecked = document.getElementById('form-pregnant').checked;
        const newCow = {
            tagId: tagId,
            name: document.getElementById('form-name').value.trim(),
            breed: document.getElementById('form-breed').value,
            gender: document.getElementById('form-gender').value,
            dob: document.getElementById('form-dob').value,
            status: document.getElementById('form-status').value,
            pasture: document.getElementById('form-pasture').value,
            pregnant: isPregChecked,
            expectedCalvingDate: isPregChecked ? document.getElementById('form-calving-date').value : null,
            inseminationMethod: isPregChecked ? document.getElementById('form-insemination').value : null,
            purchaseDate: document.getElementById('form-purchase-date').value || null,
            purchasePrice: Number(document.getElementById('form-purchase-price').value) || 0,
            supplier: document.getElementById('form-supplier').value.trim() || null,
            saleDate: document.getElementById('form-status').value === 'Sold' ? document.getElementById('form-sale-date').value : null,
            salePrice: document.getElementById('form-status').value === 'Sold' ? Number(document.getElementById('form-sale-price').value) : null,
            buyer: document.getElementById('form-status').value === 'Sold' ? document.getElementById('form-buyer').value.trim() : null,
            dam: document.getElementById('form-dam').value || '',
            sire: document.getElementById('form-sire').value || '',
            image: base64Image,
            history: originalTag ? (currentCattleList.find(c => c.tagId === originalTag).history || []) : [
                { id: Date.now(), date: new Date().toISOString().split('T')[0], type: 'Financial', description: 'Cattle profile initial registration.', performer: '' }
            ]
        };

        // If editing a tag ID itself, delete the old record first
        if (originalTag && originalTag !== tagId) {
            await db.deleteCow(originalTag);
        }

        await db.saveCow(newCow);
        await loadAppState();
        
        // Hide Modal
        document.getElementById('cow-form-modal').classList.remove('active');
        
        // Refresh views
        renderCattleHerd();
        renderDashboard();
        renderPasturesView();

        alert(`Cattle "${tagId}" saved successfully.`);
    });

    // 2. Timeline Vet/Health Event logging submit
    eventForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const cowTag = document.getElementById('event-cow-tag').value;
        const cow = currentCattleList.find(c => c.tagId === cowTag);
        
        if (cow) {
            const event = {
                id: Date.now(),
                date: document.getElementById('event-date').value,
                type: document.getElementById('event-type').value,
                description: document.getElementById('event-desc').value.trim(),
                performer: document.getElementById('event-performer').value.trim() || 'Toast Seagers'
            };

            cow.history.push(event);
            
            // Reproductive pregnancy integration from diagnostic
            if (event.type === 'Pregnancy') {
                if (event.description.toLowerCase().includes('confirmed pregnant') || event.description.toLowerCase().includes('inseminated')) {
                    cow.pregnant = true;
                } else if (event.description.toLowerCase().includes('calved') || event.description.toLowerCase().includes('gave birth')) {
                    cow.pregnant = false;
                    cow.expectedCalvingDate = null;
                }
            }

            await db.saveCow(cow);
            await loadAppState();

            // Refresh modal tabs and UI
            document.getElementById('event-form-modal').classList.remove('active');
            openCattleDetailsModal(cowTag);
            renderDashboard();
        }
    });

    // 3. Task schedule creation/edit submit
    taskForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const taskId = document.getElementById('task-id-field').value;
        const taskData = {
            title: document.getElementById('task-title-field').value.trim(),
            description: document.getElementById('task-desc-field').value.trim(),
            dueDate: document.getElementById('task-date-field').value,
            category: document.getElementById('task-category-field').value,
            targetCattle: document.getElementById('task-cattle-field').value.trim() || 'All Active',
            status: document.getElementById('task-status-field').value
        };

        if (taskId) {
            taskData.id = Number(taskId);
        }

        await db.saveTask(taskData);
        await loadAppState();

        document.getElementById('task-form-modal').classList.remove('active');
        renderTasks();
        renderDashboard();
    });

    // 4. Relocation Movement logs submit
    movementForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const cowTag = document.getElementById('move-cow-tag').value;
        const newPasture = document.getElementById('move-target-pasture').value;
        const reason = document.getElementById('move-reason').value.trim() || 'Pasture rotation';

        const cow = currentCattleList.find(c => c.tagId === cowTag);
        if (cow) {
            const oldPastureName = getPaddockName(cow.pasture);
            const newPastureName = getPaddockName(newPasture);

            cow.pasture = newPasture;
            
            // Automatically log movement in historical timeline
            cow.history.push({
                id: Date.now(),
                date: new Date().toISOString().split('T')[0],
                type: 'Move',
                description: `Relocated from ${oldPastureName} to ${newPastureName}. Reason: ${reason}.`,
                performer: 'Toast Seagers'
            });

            await db.saveCow(cow);
            await loadAppState();

            document.getElementById('movement-form-modal').classList.remove('active');
            
            // Reload context details if details modal is active
            const detailModal = document.getElementById('cow-details-modal');
            if (detailModal.classList.contains('active')) {
                openCattleDetailsModal(cowTag);
            }

            renderDashboard();
            renderPasturesView();
            renderCattleHerd();
        }
    });

    // Photo input picker logic
    const photoFileInput = document.getElementById('form-file-photo');
    photoFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                // Compress and Preview immediately
                const compressedBase64 = await compressImage(file, 600, 0.7);
                const previewBox = document.getElementById('form-photo-preview');
                previewBox.style.backgroundImage = `url('${compressedBase64}')`;
                previewBox.innerHTML = ''; // Clear icon
            } catch (err) {
                console.error("Image compression error:", err);
                alert("Failed to process image. Try a smaller file.");
            }
        }
    });

    // Toggle reproduction fields based on Gender
    const genderSelect = document.getElementById('form-gender');
    genderSelect.addEventListener('change', () => {
        const val = genderSelect.value;
        const reproFields = document.querySelectorAll('.reproduction-field');
        if (val === 'Cow' || val === 'Heifer') {
            reproFields.forEach(f => f.style.display = 'block');
        } else {
            reproFields.forEach(f => f.style.display = 'none');
            document.getElementById('form-pregnant').checked = false;
            document.querySelector('.pregnancy-details-group').style.display = 'none';
        }
    });

    // Toggle pregnancy sub-fields
    const pregCheckbox = document.getElementById('form-pregnant');
    pregCheckbox.addEventListener('change', () => {
        const pregGroups = document.querySelectorAll('.pregnancy-details-group');
        if (pregCheckbox.checked) {
            pregGroups.forEach(g => g.style.display = 'block');
        } else {
            pregGroups.forEach(g => g.style.display = 'none');
        }
    });

    // Toggle sales fields based on Status
    const statusSelect = document.getElementById('form-status');
    statusSelect.addEventListener('change', () => {
        const val = statusSelect.value;
        const saleFields = document.querySelectorAll('.form-sale-group');
        if (val === 'Sold') {
            saleFields.forEach(f => f.style.display = 'block');
        } else {
            saleFields.forEach(f => f.style.display = 'none');
        }
    });

    document.getElementById('paddock-add-edit-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const idField = document.getElementById('paddock-id-field').value;
        const nameVal = document.getElementById('paddock-name-field').value.trim();
        const sizeVal = document.getElementById('paddock-size-field').value.trim();
        const typeVal = document.getElementById('paddock-type-field').value;
        const catVal = document.getElementById('paddock-category-field').value;
        const descVal = document.getElementById('paddock-desc-field').value.trim();

        const coordsFieldVal = document.getElementById('paddock-coordinates-field').value;
        let coordsParsed = null;
        if (coordsFieldVal) {
            try {
                coordsParsed = JSON.parse(coordsFieldVal);
            } catch (err) {
                console.error("Error parsing paddock coordinates:", err);
            }
        }

        // Size Formatting - auto-append 'ha' if they only typed a number
        let sizeFormatted = sizeVal;
        if (/^\d+(\.\d+)?$/.test(sizeVal)) {
            sizeFormatted += 'ha';
        }

        const paddockData = {
            id: idField ? idField : nameVal.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_+|_+$)/g, ''),
            name: nameVal,
            size: sizeFormatted,
            type: typeVal,
            category: catVal,
            description: descVal,
            coordinates: coordsParsed
        };

        if (idField) {
            // Edit existing
            const index = currentPaddockList.findIndex(p => p.id === idField);
            if (index > -1) currentPaddockList[index] = paddockData;
        } else {
            // Check for duplicate ID
            if (currentPaddockList.some(p => p.id === paddockData.id)) {
                alert(`Pasture name "${nameVal}" is already registered. Please choose a unique name.`);
                return;
            }
            currentPaddockList.push(paddockData);
        }

        await db.savePaddocks(currentPaddockList);
        await loadAppState();

        document.getElementById('paddock-form-modal').classList.remove('active');
        
        // Refresh views
        renderDashboard();
        renderPasturesView();
        
        // Select newly saved paddock visual cell if in Pastures tab
        const newlyCreatedCell = document.querySelector(`#map-pasture-grid .paddock-cell[data-id="${paddockData.id}"]`);
        if (newlyCreatedCell) newlyCreatedCell.click();

        alert(`Paddock "${nameVal}" saved successfully.`);
    });
}

/**
 * Binds generic details view modals overlays and closures.
 */
function bindModals() {
    // Dashboard Stat Card Clicks
    const totalHerdCard = document.getElementById('card-total-herd');
    if (totalHerdCard) {
        totalHerdCard.addEventListener('click', () => {
            // Reset filters to show entire active herd
            document.getElementById('search-cattle').value = '';
            document.getElementById('filter-breed').value = '';
            document.getElementById('filter-gender').value = '';
            document.getElementById('filter-pregnancy').value = '';
            document.getElementById('filter-status').value = 'Active';
            
            renderCattleHerd();
            document.querySelector('[data-target=cattle-view]').click();
        });
    }

    const pregnanciesCard = document.getElementById('card-pregnancies');
    if (pregnanciesCard) {
        pregnanciesCard.addEventListener('click', () => {
            // Filter to only show pregnant cows
            document.getElementById('search-cattle').value = '';
            document.getElementById('filter-breed').value = '';
            document.getElementById('filter-gender').value = '';
            document.getElementById('filter-pregnancy').value = 'pregnant';
            document.getElementById('filter-status').value = 'Active';
            
            renderCattleHerd();
            document.querySelector('[data-target=cattle-view]').click();
        });
    }

    const urgentTasksCard = document.getElementById('card-urgent-tasks');
    if (urgentTasksCard) {
        urgentTasksCard.addEventListener('click', () => {
            // Select the Urgent tasks filter tab button
            const urgentBtn = document.querySelector('.filter-task-btn[data-filter=Urgent]');
            if (urgentBtn) {
                document.querySelectorAll('.filter-task-btn').forEach(b => b.classList.remove('active'));
                urgentBtn.classList.add('active');
            }
            
            renderTasks();
            document.querySelector('[data-target=tasks-view]').click();
        });
    }

    // Global add cow shortcut button
    document.getElementById('btn-add-cow-shortcut').addEventListener('click', () => openCattleFormModal());

    // 1. Cattle detail modal tab triggers
    const tabBtns = document.querySelectorAll('.profile-tabs .tab-btn');
    const tabPanels = document.querySelectorAll('.profile-main-content .tab-panel');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const targetTab = btn.dataset.tab;
            tabPanels.forEach(panel => {
                if (panel.id === targetTab) {
                    panel.classList.add('active');
                } else {
                    panel.classList.remove('active');
                }
            });
        });
    });

    // 2. Modals Close triggers
    const overlays = document.querySelectorAll('.modal-overlay');
    overlays.forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
            }
        });
    });

    document.getElementById('btn-close-details').addEventListener('click', () => {
        document.getElementById('cow-details-modal').classList.remove('active');
    });

    document.getElementById('btn-close-form').addEventListener('click', () => {
        document.getElementById('cow-form-modal').classList.remove('active');
    });

    document.getElementById('btn-cancel-form').addEventListener('click', () => {
        document.getElementById('cow-form-modal').classList.remove('active');
    });

    document.getElementById('btn-close-event-form').addEventListener('click', () => {
        document.getElementById('event-form-modal').classList.remove('active');
    });

    document.getElementById('btn-cancel-event-form').addEventListener('click', () => {
        document.getElementById('event-form-modal').classList.remove('active');
    });

    document.getElementById('btn-close-task-modal').addEventListener('click', () => {
        document.getElementById('task-form-modal').classList.remove('active');
    });

    document.getElementById('btn-cancel-task-form').addEventListener('click', () => {
        document.getElementById('task-form-modal').classList.remove('active');
    });

    document.getElementById('btn-close-movement-form').addEventListener('click', () => {
        document.getElementById('movement-form-modal').classList.remove('active');
    });

    document.getElementById('btn-cancel-movement-form').addEventListener('click', () => {
        document.getElementById('movement-form-modal').classList.remove('active');
    });

    // Profile detail shortcuts
    document.getElementById('btn-profile-edit').addEventListener('click', () => {
        if (activeTargetCowTag) {
            document.getElementById('cow-details-modal').classList.remove('active');
            openCattleFormModal(activeTargetCowTag);
        }
    });

    document.getElementById('btn-profile-move').addEventListener('click', () => {
        if (activeTargetCowTag) {
            openRelocationModal(activeTargetCowTag);
        }
    });

    document.getElementById('btn-profile-log-event').addEventListener('click', () => {
        if (activeTargetCowTag) {
            openEventLoggerModal(activeTargetCowTag);
        }
    });

    document.getElementById('btn-add-timeline-event-shortcut').addEventListener('click', () => {
        if (activeTargetCowTag) {
            openEventLoggerModal(activeTargetCowTag);
        }
    });

    document.getElementById('btn-profile-delete').addEventListener('click', async () => {
        if (activeTargetCowTag) {
            if (confirm(`Permanently delete cattle record: "${activeTargetCowTag}" from your herd register?`)) {
                await db.deleteCow(activeTargetCowTag);
                await loadAppState();
                document.getElementById('cow-details-modal').classList.remove('active');
                renderCattleHerd();
                renderDashboard();
                renderPasturesView();
            }
        }
    });

    // Chore Tasks shortcuts
    document.getElementById('btn-add-task').addEventListener('click', () => openTaskFormModal());

    // Paddock shortcuts
    document.getElementById('btn-add-paddock').addEventListener('click', () => openPaddockFormModal());
    
    document.getElementById('btn-close-paddock-modal').addEventListener('click', () => {
        document.getElementById('paddock-form-modal').classList.remove('active');
    });
    
    document.getElementById('btn-cancel-paddock-form').addEventListener('click', () => {
        document.getElementById('paddock-form-modal').classList.remove('active');
    });

    // Paddock Boundaries visual drawer click
    document.getElementById('btn-draw-paddock-boundaries').addEventListener('click', () => {
        // Hide the paddock form modal temporarily
        document.getElementById('paddock-form-modal').classList.remove('active');
        
        // Start visual drawing mode
        const idField = document.getElementById('paddock-id-field').value;
        const coordsFieldVal = document.getElementById('paddock-coordinates-field').value;
        
        let existingCoords = [];
        if (coordsFieldVal) {
            try {
                existingCoords = JSON.parse(coordsFieldVal);
            } catch (err) {}
        }
        
        startPaddockDrawingMode(idField || 'new_paddock', existingCoords);
    });

    // Paddock Edit shortcut click
    document.getElementById('btn-edit-paddock-shortcut').addEventListener('click', () => {
        if (selectedPaddockId) {
            openPaddockFormModal(selectedPaddockId);
        }
    });

    // Paddock Delete shortcut click
    document.getElementById('btn-delete-paddock-shortcut').addEventListener('click', async () => {
        if (!selectedPaddockId) return;
        const paddockId = selectedPaddockId;
        
        // Safeguard: Check if any active cattle are grazing here!
        const activeCattle = currentCattleList.filter(c => c.status === 'Active' && c.pasture === paddockId);
        if (activeCattle.length > 0) {
            alert(`BLOCKED: There are currently ${activeCattle.length} cattle grazing in this paddock! You must transfer/rotate them to another paddock before deleting this pasture.`);
            return;
        }

        const paddock = currentPaddockList.find(p => p.id === paddockId);
        if (confirm(`Are you absolutely sure you want to permanently delete the pasture paddock: "${paddock.name}"? This cannot be undone.`)) {
            // Delete pasture
            const updatedPaddocks = currentPaddockList.filter(p => p.id !== paddockId);
            await db.savePaddocks(updatedPaddocks);
            await loadAppState();
            
            // Close detail drawer
            document.getElementById('pasture-details-panel').style.display = 'none';
            selectedPaddockId = null;
            
            // Refresh views
            renderDashboard();
            renderPasturesView();
            alert("Paddock deleted successfully.");
        }
    });

    // Refresh Manual Guide click
    const reloadReadmeBtn = document.getElementById('btn-reload-readme');
    if (reloadReadmeBtn) {
        reloadReadmeBtn.addEventListener('click', () => loadAndRenderReadme());
    }

    // 3. Shutdown Server click listener
    const shutdownBtn = document.getElementById('btn-shutdown-server');
    if (shutdownBtn) {
        if (!db.isServerMode) {
            // Hide if not in server mode (offline cache mode)
            shutdownBtn.style.display = 'none';
        } else {
            shutdownBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                if (confirm("Are you sure you want to save all data and shutdown the Cattleitics server? This browser tab will be closed automatically.")) {
                    try {
                        const response = await fetch('/api/shutdown', { method: 'POST' });
                        if (response.ok) {
                            // Show premium shutdown confirmation overlay
                            document.body.innerHTML = `
                                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #060a07; color: var(--text-main); font-family: 'Outfit', sans-serif; text-align: center; padding: 2rem;">
                                    <div style="width: 80px; height: 80px; border-radius: 50%; background-color: rgba(217, 4, 41, 0.1); border: 2px solid var(--danger); display: flex; align-items: center; justify-content: center; color: var(--danger); font-size: 2.5rem; margin-bottom: 1.5rem; animation: pulse 2s infinite;"><i class="fa-solid fa-power-off"></i></div>
                                    <h1 style="color: var(--gold); margin-bottom: 0.5rem; font-size: 2rem;">Server Shutdown Successful</h1>
                                    <p style="color: var(--text-muted); max-width: 450px; line-height: 1.5; font-size: 1rem;">Cattleitics database has been physically synchronized and saved. The local Node.js server process was terminated successfully. You can now close this tab safely.</p>
                                </div>
                            `;
                            // Try to auto-close browser tab
                            setTimeout(() => {
                                window.close();
                            }, 3000);
                        } else {
                            alert("Failed to send shutdown command to server.");
                        }
                    } catch (err) {
                        console.error("Shutdown failed:", err);
                        alert("Failed to communicate with server. It may have already been shut down.");
                    }
                }
            });
        }
    }
}

/**
 * Core dynamic profile detail popup module.
 */
function openCattleDetailsModal(tagId) {
    const cow = currentCattleList.find(c => c.tagId === tagId);
    if (!cow) return;

    activeTargetCowTag = tagId;

    // Reset default active tabs
    document.querySelectorAll('.profile-tabs .tab-btn').forEach((b, idx) => {
        if (idx === 0) b.classList.add('active');
        else b.classList.remove('active');
    });
    document.querySelectorAll('.profile-main-content .tab-panel').forEach((panel, idx) => {
        if (idx === 0) panel.classList.add('active');
        else panel.classList.remove('active');
    });

    // 1. Populate main sidebar details
    document.getElementById('profile-image').src = cow.image || 'assets/images/nguni_cow.png';
    document.getElementById('profile-tag-id').textContent = cow.tagId;
    document.getElementById('profile-cow-name').textContent = cow.name || 'Unnamed';
    document.getElementById('profile-cow-breed').textContent = cow.breed;
    
    document.getElementById('profile-stat-gender').textContent = cow.gender;
    
    const statusVal = document.getElementById('profile-stat-status');
    statusVal.textContent = cow.status;
    statusVal.style.color = cow.status === 'Active' ? 'var(--success)' : cow.status === 'Sold' ? 'var(--info)' : 'var(--danger)';
    
    document.getElementById('profile-stat-location').textContent = getPaddockName(cow.pasture);
    document.getElementById('profile-stat-age').textContent = formatAgeString(cow.dob);

    // 2. Populate Bio Tab
    document.getElementById('bio-tag').textContent = cow.tagId;
    document.getElementById('bio-name').textContent = cow.name || 'Unnamed';
    document.getElementById('bio-breed').textContent = cow.breed;
    document.getElementById('bio-dob').textContent = cow.dob;

    // Repro logs
    const reproBox = document.getElementById('pregnancy-details-box');
    reproBox.innerHTML = '';
    if (cow.gender === 'Cow' || cow.gender === 'Heifer') {
        reproBox.innerHTML = `
            <p style="margin-bottom: 0.4rem;"><strong class="text-muted">Pregnancy Status:</strong> 
                <span class="btn btn-sm" style="font-size: 0.75rem; padding: 0.15rem 0.5rem; pointer-events: none; background: ${cow.pregnant ? 'rgba(247, 127, 0, 0.2); color: var(--warning); border: 1px solid var(--warning);' : 'rgba(255,255,255,0.05)'}">
                    ${cow.pregnant ? 'Pregnant' : 'Not Pregnant'}
                </span>
            </p>
            ${cow.pregnant ? `
                <p style="margin-bottom: 0.4rem;"><strong class="text-muted">Calving Due Date:</strong> <span>${cow.expectedCalvingDate || 'Not specified'}</span></p>
                <p style="margin-bottom: 0.4rem;"><strong class="text-muted">Insemination:</strong> <span>${cow.inseminationMethod || 'Bull-run'}</span></p>
            ` : ''}
        `;
    } else {
        reproBox.innerHTML = `<p class="pasture-desc" style="font-style: italic;">Not applicable for male animals.</p>`;
    }

    // Financial logs
    document.getElementById('fin-purchase-date').textContent = cow.purchaseDate || '-';
    document.getElementById('fin-purchase-price').textContent = formatCurrencyZAR(cow.purchasePrice);
    document.getElementById('fin-supplier').textContent = cow.supplier || '-';

    document.getElementById('fin-sale-date').textContent = cow.saleDate || '-';
    document.getElementById('fin-sale-price').textContent = formatCurrencyZAR(cow.salePrice);
    document.getElementById('fin-buyer').textContent = cow.buyer || '-';

    // 3. Populate Pedigree Tree Tab
    renderPedigreeTree(cow);

    // 4. Populate timeline
    const timeline = document.getElementById('profile-timeline');
    timeline.innerHTML = '';

    const sortedHistory = (cow.history || []).sort((a, b) => new Date(b.date) - new Date(a.date));

    if (sortedHistory.length === 0) {
        timeline.innerHTML = `<div class="pasture-desc">No veterinary records logged. Click 'Log Vet/Event' to record a treatment.</div>`;
    } else {
        sortedHistory.forEach(event => {
            const node = document.createElement('div');
            node.className = `timeline-event event-${event.type.toLowerCase()}`;
            node.innerHTML = `
                <div class="timeline-meta">
                    <strong>${event.date}</strong> &nbsp;•&nbsp; 
                    <span style="color: var(--gold); text-transform: uppercase; font-size: 0.7rem;">${event.type}</span>
                </div>
                <div class="timeline-desc">${event.description}</div>
                <div class="timeline-perf">Recorded by: ${event.performer}</div>
            `;
            timeline.appendChild(node);
        });
    }

    // Toggle display details overlay
    document.getElementById('cow-details-modal').classList.add('active');
}

/**
 * Builds and draws pedigree charts.
 */
function renderPedigreeTree(cow) {
    const container = document.getElementById('pedigree-content');
    container.innerHTML = '';

    // Nodes retrieval
    const damObj = cow.dam ? currentCattleList.find(c => c.tagId === cow.dam) : null;
    const sireObj = cow.sire ? currentCattleList.find(c => c.tagId === cow.sire) : null;
    
    // Offspring retrieval
    const offsprings = currentCattleList.filter(c => c.dam === cow.tagId || c.sire === cow.tagId);

    // Tree Structure HTML generator
    container.innerHTML = `
        <!-- Parents Row -->
        <div class="pedigree-parents-row">
            <!-- Dam (Mother) -->
            <div class="pedigree-node" id="pedigree-node-dam">
                <span class="pedigree-role">Dam (Mother)</span>
                ${damObj ? `
                    <div class="pedigree-tag">${damObj.tagId}</div>
                    <div class="pedigree-name">${damObj.name || 'Unnamed'}</div>
                ` : '<div class="pedigree-name" style="color: var(--text-muted);">Not linked</div>'}
            </div>

            <!-- Sire (Father) -->
            <div class="pedigree-node" id="pedigree-node-sire">
                <span class="pedigree-role">Sire (Father)</span>
                ${sireObj ? `
                    <div class="pedigree-tag">${sireObj.tagId}</div>
                    <div class="pedigree-name">${sireObj.name || 'Unnamed'}</div>
                ` : '<div class="pedigree-name" style="color: var(--text-muted);">Not linked</div>'}
            </div>
        </div>

        <!-- Focus Node -->
        <div class="pedigree-node active-focus">
            <span class="pedigree-role">Active Focus</span>
            <div class="pedigree-tag">${cow.tagId}</div>
            <div class="pedigree-name">${cow.name || 'Unnamed'}</div>
        </div>

        <!-- Offsprings Row -->
        <div style="width: 100%; border-top: 1px dashed var(--border-color); padding-top: 1rem; margin-top: 0.5rem; text-align: center;">
            <span class="pedigree-role" style="margin-bottom: 0.75rem;">Offsprings</span>
            <div class="pedigree-offspring-row" id="pedigree-offsprings-container">
                <!-- Loaded dynamically -->
            </div>
        </div>
    `;

    // Click nodes listeners to switch focus
    if (damObj) {
        document.getElementById('pedigree-node-dam').addEventListener('click', () => openCattleDetailsModal(damObj.tagId));
    }
    if (sireObj) {
        document.getElementById('pedigree-node-sire').addEventListener('click', () => openCattleDetailsModal(sireObj.tagId));
    }

    const offspringContainer = document.getElementById('pedigree-offsprings-container');
    if (offsprings.length === 0) {
        offspringContainer.innerHTML = `<div class="pasture-desc" style="width:100%;">No offspring registered.</div>`;
    } else {
        offsprings.forEach(off => {
            const node = document.createElement('div');
            node.className = 'pedigree-node';
            node.innerHTML = `
                <span class="pedigree-role">${off.gender}</span>
                <div class="pedigree-tag">${off.tagId}</div>
                <div class="pedigree-name">${off.name || 'Unnamed'}</div>
            `;
            node.addEventListener('click', () => openCattleDetailsModal(off.tagId));
            offspringContainer.appendChild(node);
        });
    }
}

/**
 * Pre-populates and reveals the Add/Edit cow form modal.
 */
function openCattleFormModal(tagId = null) {
    const form = document.getElementById('cattle-add-edit-form');
    const title = document.getElementById('form-modal-title');
    const tagInput = document.getElementById('form-tag-id');
    const photoPreviewBox = document.getElementById('form-photo-preview');

    form.reset();
    populateFormSelectors();

    // Default form setup state
    photoPreviewBox.style.backgroundImage = 'none';
    photoPreviewBox.innerHTML = '<i class="fa-solid fa-image"></i>';
    document.querySelectorAll('.reproduction-field').forEach(f => f.style.display = 'block'); // Default Cow/Heifer
    document.querySelectorAll('.pregnancy-details-group').forEach(g => g.style.display = 'none');
    document.querySelectorAll('.form-sale-group').forEach(f => f.style.display = 'none');
    document.getElementById('form-file-photo').value = '';

    if (tagId) {
        // EDIT MODE
        const cow = currentCattleList.find(c => c.tagId === tagId);
        if (!cow) return;

        title.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Edit Cattle Record: ${tagId}`;
        form.dataset.editingTag = tagId;
        tagInput.value = cow.tagId;

        document.getElementById('form-name').value = cow.name || '';
        document.getElementById('form-breed').value = cow.breed;
        document.getElementById('form-gender').value = cow.gender;
        document.getElementById('form-dob').value = cow.dob;
        document.getElementById('form-status').value = cow.status;
        document.getElementById('form-pasture').value = cow.pasture;

        // Photo loading
        if (cow.image) {
            photoPreviewBox.style.backgroundImage = `url('${cow.image}')`;
            photoPreviewBox.innerHTML = '';
        }

        // Gender toggling checks
        if (cow.gender === 'Cow' || cow.gender === 'Heifer') {
            document.querySelectorAll('.reproduction-field').forEach(f => f.style.display = 'block');
            document.getElementById('form-pregnant').checked = cow.pregnant;
            if (cow.pregnant) {
                document.querySelectorAll('.pregnancy-details-group').forEach(g => g.style.display = 'block');
                document.getElementById('form-calving-date').value = cow.expectedCalvingDate || '';
                document.getElementById('form-insemination').value = cow.inseminationMethod || '';
            }
        } else {
            document.querySelectorAll('.reproduction-field').forEach(f => f.style.display = 'none');
        }

        // Financial checks
        document.getElementById('form-purchase-date').value = cow.purchaseDate || '';
        document.getElementById('form-purchase-price').value = cow.purchasePrice || '';
        document.getElementById('form-supplier').value = cow.supplier || '';

        // Status checks
        if (cow.status === 'Sold') {
            document.querySelectorAll('.form-sale-group').forEach(f => f.style.display = 'block');
            document.getElementById('form-sale-date').value = cow.saleDate || '';
            document.getElementById('form-sale-price').value = cow.salePrice || '';
            document.getElementById('form-buyer').value = cow.buyer || '';
        }

        // Pedigree values
        document.getElementById('form-dam').value = cow.dam || '';
        document.getElementById('form-sire').value = cow.sire || '';

    } else {
        // ADD NEW MODE
        title.innerHTML = `<i class="fa-solid fa-cow"></i> Add Cattle Record`;
        delete form.dataset.editingTag;
        
        // Defaults
        document.getElementById('form-status').value = 'Active';
        document.getElementById('form-breed').value = 'Nguni';
        document.getElementById('form-gender').value = 'Cow';
        document.getElementById('form-dob').value = new Date().toISOString().split('T')[0];
    }

    document.getElementById('cow-form-modal').classList.add('active');
}

/**
 * Event Logger Modal.
 */
function openEventLoggerModal(tagId) {
    document.getElementById('timeline-event-form').reset();
    document.getElementById('event-cow-tag').value = tagId;
    document.getElementById('event-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('event-performer').value = 'Toast Seagers';

    document.getElementById('event-form-modal').classList.add('active');
}

/**
 * Task Creation Modal.
 */
function openTaskFormModal(taskId = null) {
    const form = document.getElementById('task-add-edit-form');
    const title = document.getElementById('task-modal-title');
    const idField = document.getElementById('task-id-field');

    form.reset();
    idField.value = '';

    if (taskId) {
        const task = currentTaskList.find(t => t.id === taskId);
        if (task) {
            title.innerHTML = `<i class="fa-solid fa-pen"></i> Edit Schedule Task`;
            idField.value = task.id;
            document.getElementById('task-title-field').value = task.title;
            document.getElementById('task-desc-field').value = task.description || '';
            document.getElementById('task-date-field').value = task.dueDate;
            document.getElementById('task-category-field').value = task.category;
            document.getElementById('task-cattle-field').value = task.targetCattle;
            document.getElementById('task-status-field').value = task.status === 'Completed' ? 'Pending' : task.status;
        }
    } else {
        title.innerHTML = `<i class="fa-solid fa-list-check"></i> Add Schedule Task`;
        document.getElementById('task-date-field').value = new Date().toISOString().split('T')[0];
        document.getElementById('task-status-field').value = 'Pending';
        document.getElementById('task-category-field').value = 'Vaccination';
    }

    document.getElementById('task-form-modal').classList.add('active');
}

/**
 * Relocation pastures movement modal.
 */
function openRelocationModal(tagId) {
    const cow = currentCattleList.find(c => c.tagId === tagId);
    if (!cow) return;

    document.getElementById('pasture-movement-form').reset();
    document.getElementById('move-cow-tag').value = tagId;
    document.getElementById('move-cow-info-text').textContent = `${cow.tagId} - ${cow.name || 'Unnamed'}`;
    
    // Select current pasture
    document.getElementById('move-target-pasture').value = cow.pasture;
    document.getElementById('move-reason').value = 'Pasture rotation';

    document.getElementById('movement-form-modal').classList.add('active');
}

/**
 * Bind CSV import/export database buttons and handlers.
 */
function bindDataOperations() {
    // 1. Export CSV File trigger
    document.getElementById('btn-export-csv').addEventListener('click', () => {
        exportHerdToCSV();
    });

    // 2. Export JSON File trigger
    document.getElementById('btn-export-json').addEventListener('click', () => {
        exportHerdToJSON();
    });

    // 3. Trigger file click
    const importBox = document.getElementById('csv-import-box');
    const importInput = document.getElementById('settings-import-file');
    
    importBox.addEventListener('click', () => {
        importInput.click();
    });

    importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            importDataFile(file);
        }
    });

    // 4. Save Setup settings
    document.getElementById('btn-save-farm-settings').addEventListener('click', async () => {
        const farmName = document.getElementById('settings-farm-name').value.trim();
        if (farmName) {
            await db.saveSetting('farm_name', farmName);
            await loadAppState();
            alert(`Farm name changed successfully to: ${farmName}`);
        }
    });

    // 5. Database Wipe
    document.getElementById('btn-clear-db').addEventListener('click', async () => {
        if (confirm("WARNING: Are you absolutely sure you want to delete all Cattle profiles and history? This cannot be undone! Make sure you have downloaded a CSV backup first.")) {
            await db.clearAllCattle();
            await loadAppState();
            renderDashboard();
            renderCattleHerd();
            renderPasturesView();
            alert("Database cleared completely.");
        }
    });

    // 6. Reload Mock data
    document.getElementById('btn-reload-mocks').addEventListener('click', async () => {
        if (confirm("This will load demo cattle data into your account. Proceed?")) {
            await db.clearAllCattle();
            // Clear tasks to re-initialize them
            const tasks = await db.getAllTasks();
            for (const t of tasks) {
                await db.deleteTask(t.id);
            }

            // Load mock data regardless of mode
            console.log("Loading demo data...");
            await db.bulkSaveCattle(MOCK_CATTLE);
            for (const task of MOCK_TASKS) {
                await db.saveTask(task);
            }
            await db.savePaddocks(MOCK_PADDOCKS);
            
            await loadAppState();
            renderDashboard();
            renderCattleHerd();
            renderPasturesView();
            renderTasks();
            alert("Demo data loaded successfully (" + MOCK_CATTLE.length + " cattle records).");
        }
    });
}

/**
 * CSV Exporter Engine
 * Combines all core cattle fields (excluding photos to prevent enormous CSV files)
 * into a downloadable Excel-compatible CSV file.
 */
function exportHerdToCSV() {
    if (currentCattleList.length === 0) {
        alert("No cattle records found to export!");
        return;
    }

    const headers = [
        'Tag ID', 'Name', 'Breed', 'Gender', 'Date of Birth', 'Status', 'Current Pasture', 
        'Is Pregnant', 'Expected Calving Date', 'Insemination Method', 
        'Dam Tag', 'Sire Tag', 'Purchase Date', 'Purchase Price (ZAR)', 'Supplier',
        'Sale Date', 'Sale Price (ZAR)', 'Buyer'
    ];

    let csvContent = headers.join(',') + '\n';

    currentCattleList.forEach(c => {
        const row = [
            escapeCSV(c.tagId),
            escapeCSV(c.name || ''),
            escapeCSV(c.breed),
            escapeCSV(c.gender),
            escapeCSV(c.dob),
            escapeCSV(c.status),
            escapeCSV(c.pasture),
            c.pregnant ? 'TRUE' : 'FALSE',
            escapeCSV(c.expectedCalvingDate || ''),
            escapeCSV(c.inseminationMethod || ''),
            escapeCSV(c.dam || ''),
            escapeCSV(c.sire || ''),
            escapeCSV(c.purchaseDate || ''),
            c.purchasePrice || 0,
            escapeCSV(c.supplier || ''),
            escapeCSV(c.saleDate || ''),
            c.salePrice || '',
            escapeCSV(c.buyer || '')
        ];
        csvContent += row.join(',') + '\n';
    });

    // Initiate file download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `cattleitics_backup_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * JSON Exporter (Includes pictures and full histories!)
 */
function exportHerdToJSON() {
    if (currentCattleList.length === 0) {
        alert("No cattle records found to export!");
        return;
    }

    const backupData = {
        farmName: document.querySelector('.logo-text span').textContent,
        exportDate: new Date().toISOString(),
        cattle: currentCattleList,
        tasks: currentTaskList
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `cattleitics_backup_${dateStr}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * General parser for file inputs (JSON/CSV).
 */
function importDataFile(file) {
    const reader = new FileReader();

    if (file.name.endsWith('.json')) {
        reader.onload = async (event) => {
            try {
                const parsed = JSON.parse(event.target.result);
                if (parsed.cattle && Array.isArray(parsed.cattle)) {
                    await db.bulkSaveCattle(parsed.cattle);
                    if (parsed.tasks && Array.isArray(parsed.tasks)) {
                        for (const t of parsed.tasks) {
                            // Ensure task gets written
                            await db.saveTask(t);
                        }
                    }
                    if (parsed.farmName) {
                        await db.saveSetting('farm_name', parsed.farmName);
                    }

                    await loadAppState();
                    renderDashboard();
                    renderCattleHerd();
                    renderPasturesView();
                    renderTasks();

                    alert(`Imported successfully: ${parsed.cattle.length} cattle profiles loaded.`);
                } else {
                    alert("Invalid JSON layout. Missing cattle array.");
                }
            } catch (err) {
                console.error("JSON Import Error:", err);
                alert("Failed to parse JSON file. Ensure it is a valid backup.");
            }
        };
        reader.readAsText(file);

    } else if (file.name.endsWith('.csv')) {
        reader.onload = async (event) => {
            try {
                const lines = event.target.result.split('\n');
                if (lines.length < 2) {
                    alert("Empty CSV file.");
                    return;
                }

                const parsedCattle = [];
                // Simple CSV row parser (handles quotation marks)
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;

                    const cols = parseCSVRow(line);
                    if (cols.length < 6) continue; // Minimum columns check

                    const tagId = cols[0].toUpperCase().trim();
                    if (!tagId) continue;

                    parsedCattle.push({
                        tagId: tagId,
                        name: cols[1] || '',
                        breed: cols[2] || 'Nguni',
                        gender: cols[3] || 'Cow',
                        dob: cols[4] || new Date().toISOString().split('T')[0],
                        status: cols[5] || 'Active',
                        pasture: cols[6] || 'house_paddock',
                        pregnant: cols[7] ? cols[7].toUpperCase() === 'TRUE' : false,
                        expectedCalvingDate: cols[8] || null,
                        inseminationMethod: cols[9] || null,
                        dam: cols[10] || '',
                        sire: cols[11] || '',
                        purchaseDate: cols[12] || null,
                        purchasePrice: Number(cols[13]) || 0,
                        supplier: cols[14] || null,
                        saleDate: cols[15] || null,
                        salePrice: cols[16] ? Number(cols[16]) : null,
                        buyer: cols[17] || null,
                        image: null, // Photos cannot import from flat CSV
                        history: [
                            { id: Date.now() + i, date: new Date().toISOString().split('T')[0], type: 'Financial', description: 'Profile imported via CSV spreadsheet.', performer: 'Toast Seagers' }
                        ]
                    });
                }

                if (parsedCattle.length > 0) {
                    await db.bulkSaveCattle(parsedCattle);
                    await loadAppState();
                    
                    renderDashboard();
                    renderCattleHerd();
                    renderPasturesView();
                    
                    alert(`Imported ${parsedCattle.length} cattle from CSV successfully! Photos have been reset to default profiles.`);
                } else {
                    alert("No valid cattle rows found in CSV.");
                }
            } catch (err) {
                console.error("CSV Import Error:", err);
                alert("Failed to parse CSV spreadsheet. Ensure standard headers are present.");
            }
        };
        reader.readAsText(file);
    }
}

/**
 * ==================== HELPER UTILITIES ====================
 */

function formatCurrencyZAR(value) {
    if (value === null || value === undefined || isNaN(value)) return 'R0';
    return 'R' + Number(value).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function getPaddockName(paddockId) {
    const paddock = currentPaddockList.find(p => p.id === paddockId);
    return paddock ? paddock.name : 'Unknown Pasture';
}

function getPaddockIcon(category) {
    switch (category) {
        case 'Homestead': return 'fa-house-chimney';
        case 'Riverine': return 'fa-water';
        case 'Ridge': return 'fa-mountain';
        case 'Wooded': return 'fa-tree';
        case 'Grassland': return 'fa-wheat-awn';
        default: return 'fa-compass';
    }
}

function computeAgeMonths(dobString) {
    if (!dobString) return 0;
    const dob = new Date(dobString);
    const diffMs = Date.now() - dob.getTime();
    const ageDate = new Date(diffMs);
    const years = Math.abs(ageDate.getUTCFullYear() - 1970);
    const months = ageDate.getUTCMonth();
    return (years * 12) + months;
}

function formatAgeString(dobString) {
    if (!dobString) return 'Age unknown';
    const totalMonths = computeAgeMonths(dobString);
    
    if (totalMonths < 1) {
        return 'Calf (<1 mo)';
    } else if (totalMonths < 12) {
        return `${totalMonths} month${totalMonths > 1 ? 's' : ''}`;
    } else {
        const years = Math.floor(totalMonths / 12);
        const remainingMonths = totalMonths % 12;
        if (remainingMonths === 0) {
            return `${years} year${years > 1 ? 's' : ''}`;
        }
        return `${years} yr ${remainingMonths} mo`;
    }
}

function escapeCSV(val) {
    if (val === null || val === undefined) return '';
    let stringVal = String(val);
    if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n')) {
        stringVal = stringVal.replace(/"/g, '""');
        return `"${stringVal}"`;
    }
    return stringVal;
}

function parseCSVRow(text) {
    let p = '', c = '', r = [];
    let q = false;
    for (let i = 0; i < text.length; i++) {
        c = text[i];
        if (c === '"') {
            q = !q;
        } else if (c === ',' && !q) {
            r.push(p);
            p = '';
        } else {
            p += c;
        }
    }
    r.push(p);
    return r;
}

/**
 * Pre-populates and opens the Paddock form modal overlay.
 */
/**
 * Pre-populates and opens the Paddock form modal overlay.
 */
function openPaddockFormModal(paddockId = null) {
    const form = document.getElementById('paddock-add-edit-form');
    const title = document.getElementById('paddock-modal-title');
    const idField = document.getElementById('paddock-id-field');
    const boundaryStatus = document.getElementById('paddock-boundary-status');

    form.reset();
    idField.value = '';
    document.getElementById('paddock-coordinates-field').value = '';
    boundaryStatus.textContent = 'No boundary drawn (0 points)';

    if (paddockId) {
        // EDIT MODE
        const paddock = currentPaddockList.find(p => p.id === paddockId);
        if (paddock) {
            title.innerHTML = `<i class="fa-solid fa-map-location-dot"></i> Edit Pasture: ${paddock.name}`;
            idField.value = paddock.id;
            document.getElementById('paddock-name-field').value = paddock.name;
            document.getElementById('paddock-size-field').value = paddock.size;
            document.getElementById('paddock-type-field').value = paddock.type;
            document.getElementById('paddock-category-field').value = paddock.category || 'Grassland';
            document.getElementById('paddock-desc-field').value = paddock.description || '';
            
            if (paddock.coordinates && paddock.coordinates.length > 0) {
                document.getElementById('paddock-coordinates-field').value = JSON.stringify(paddock.coordinates);
                boundaryStatus.textContent = `Boundary saved (${paddock.coordinates.length} points)`;
            }
        }
    } else {
        // ADD MODE
        title.innerHTML = `<i class="fa-solid fa-map-location-dot"></i> Add Pasture / Paddock`;
        document.getElementById('paddock-type-field').value = 'Sweetveld';
        document.getElementById('paddock-category-field').value = 'Grassland';
    }

    document.getElementById('paddock-form-modal').classList.add('active');
}

/**
 * Visual click-to-draw paddock drawing engine.
 */
function startPaddockDrawingMode(paddockId, existingCoords) {
    drawingMode = true;
    activeDrawingPaddockId = paddockId;
    currentDrawingCoords = [];
    drawingMarkers = [];
    drawingPolyline = null;

    // Show floating active banner in map
    let banner = document.getElementById('map-drawing-active-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'map-drawing-active-banner';
        banner.className = 'map-drawing-banner';
        document.getElementById('farm-gis-map').appendChild(banner);
    }
    banner.style.display = 'flex';
    banner.innerHTML = `
        <span>
            <i class="fa-solid fa-draw-polygon" style="color: var(--gold); margin-right: 0.5rem;"></i> 
            Drawing <strong>${document.getElementById('paddock-name-field').value || 'New Pasture'}</strong> boundary
            <span id="map-drawing-size-status" style="margin-left: 0.5rem; color: var(--gold); font-weight: bold;"></span>
        </span>
        <div class="map-drawing-actions">
            <button type="button" class="btn btn-gold btn-sm" id="btn-finish-drawing" style="padding: 0.3rem 0.75rem; font-size: 0.75rem; color: #060a07; font-weight: bold;"><i class="fa-solid fa-check"></i> Finish</button>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-clear-drawing" style="padding: 0.3rem 0.75rem; font-size: 0.75rem; background-color: var(--danger); border-color: var(--danger); color: white;"><i class="fa-solid fa-trash-can"></i> Clear</button>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-drawing" style="padding: 0.3rem 0.75rem; font-size: 0.75rem;"><i class="fa-solid fa-xmark"></i> Cancel</button>
        </div>
    `;

    // Bind event listeners for drawing action buttons
    document.getElementById('btn-finish-drawing').addEventListener('click', finishPaddockDrawing);
    document.getElementById('btn-clear-drawing').addEventListener('click', clearPaddockDrawing);
    document.getElementById('btn-cancel-drawing').addEventListener('click', cancelPaddockDrawing);

    // Shift screen view context straight to the map area
    document.getElementById('farm-gis-map').scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Load existing coordinates if editing
    if (existingCoords && existingCoords.length > 0) {
        existingCoords.forEach(coords => {
            addPointToDrawing(L.latLng(coords[0], coords[1]));
        });
        
        // Pan/Fit bounds to existing coords
        if (farmMap && existingCoords.length > 1) {
            farmMap.fitBounds(L.polyline(existingCoords).getBounds());
        }
    }
}

function addPointToDrawing(latlng) {
    const coords = [latlng.lat, latlng.lng];
    currentDrawingCoords.push(coords);
    
    // Create node marker
    const marker = L.marker(latlng, {
        draggable: true,
        icon: L.divIcon({
            className: 'drawing-node-marker',
            iconSize: [12, 12]
        })
    }).addTo(farmMap);
    
    drawingMarkers.push(marker);
    const index = drawingMarkers.length - 1;
    
    // Drag node support!
    marker.on('drag', (e) => {
        const newPos = e.target.getLatLng();
        currentDrawingCoords[index] = [newPos.lat, newPos.lng];
        updateDrawingPolyline();
    });
    
    updateDrawingPolyline();
}

function updateDrawingPolyline() {
    if (currentDrawingCoords.length < 2) return;
    
    if (!drawingPolyline) {
        drawingPolyline = L.polyline(currentDrawingCoords, {
            color: '#d4af37',
            weight: 3,
            dashArray: '5, 10'
        }).addTo(farmMap);
    } else {
        drawingPolyline.setLatLngs(currentDrawingCoords);
    }

    // Dynamic real-time area calculation
    const sizeSpan = document.getElementById('map-drawing-size-status');
    if (sizeSpan) {
        if (currentDrawingCoords.length >= 3) {
            const hectares = calculatePolygonAreaHectares(currentDrawingCoords);
            sizeSpan.innerHTML = `(${hectares.toFixed(2)} ha)`;
        } else {
            sizeSpan.innerHTML = '';
        }
    }
}

function clearPaddockDrawing() {
    drawingMarkers.forEach(m => m.remove());
    if (drawingPolyline) drawingPolyline.remove();
    drawingMarkers = [];
    currentDrawingCoords = [];
    drawingPolyline = null;
    
    const sizeSpan = document.getElementById('map-drawing-size-status');
    if (sizeSpan) sizeSpan.innerHTML = '';
}

function finishPaddockDrawing() {
    if (currentDrawingCoords.length < 3) {
        alert("A pasture boundary polygon must have at least 3 points! Please click on the map to define the field nodes.");
        return;
    }

    // Save coords to form field
    document.getElementById('paddock-coordinates-field').value = JSON.stringify(currentDrawingCoords);
    document.getElementById('paddock-boundary-status').textContent = `Boundary saved (${currentDrawingCoords.length} points)`;

    // Auto-calculate pasture size!
    const hectares = calculatePolygonAreaHectares(currentDrawingCoords);
    document.getElementById('paddock-size-field').value = `${hectares.toFixed(1)}ha`;

    stopPaddockDrawingMode();
    
    // Show paddock form modal again
    document.getElementById('paddock-form-modal').classList.add('active');
}

function cancelPaddockDrawing() {
    stopPaddockDrawingMode();
    document.getElementById('paddock-form-modal').classList.add('active');
}

function stopPaddockDrawingMode() {
    drawingMode = false;
    activeDrawingPaddockId = null;
    clearPaddockDrawing();
    
    const banner = document.getElementById('map-drawing-active-banner');
    if (banner) {
        banner.style.display = 'none';
    }
}

/**
 * Calculates the geographical area of a polygon coordinates array in hectares
 * using the Shoelace formula on meter-scaled lat/lng projection relative offsets.
 */
function calculatePolygonAreaHectares(coords) {
    if (!coords || coords.length < 3) return 0;
    
    // Average latitude to adjust longitude scaling relative to Earth circumference
    let latSum = 0;
    coords.forEach(c => latSum += c[0]);
    const avgLat = latSum / coords.length;
    
    const latToMeters = 111132;
    const lngToMeters = 111320 * Math.cos(avgLat * Math.PI / 180);
    
    // Convert geographic coordinates to flat meters relative to origin
    const points = coords.map(c => {
        return {
            x: (c[1] - coords[0][1]) * lngToMeters,
            y: (c[0] - coords[0][0]) * latToMeters
        };
    });
    
    // Shoelace Formula for planar polygon area
    let area = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    area = Math.abs(area) / 2; // Area in square meters
    
    // 1 Hectare = 10,000 square meters
    const hectares = area / 10000;
    return hectares;
}

/**
 * Loads the project README.md from the local server and renders it as styled HTML.
 * Includes a robust styled offline guide fallback in case of connection failure.
 */
async function loadAndRenderReadme() {
    const container = document.getElementById('readme-content-area');
    if (!container) return;
    
    container.innerHTML = `
        <div class="pasture-desc" style="text-align: center; padding: 3rem;">
            <i class="fa-solid fa-spinner fa-spin" style="font-size: 1.8rem; margin-bottom: 0.75rem; color: var(--gold)"></i>
            <p>Loading Cattleitics User Manual...</p>
        </div>
    `;

    try {
        const response = await fetch('/README.md');
        if (response.ok) {
            const mdContent = await response.text();
            container.innerHTML = parseMarkdownToHTML(mdContent);
            return;
        }
    } catch (err) {
        console.warn("Local server README load failed. Presenting portable offline guide manual.");
    }

    // Portable Offline User Manual HTML fallback
    container.innerHTML = `
        <h1>Cattleitics User Manual</h1>
        <p>Your herd records are currently operating in <strong>${db.storageMode}</strong> mode.</p>
        
        <h2>Getting Started</h2>
        <p>Use the <strong>+ Add Cattle</strong> button to register animals one by one, or go to <strong>Data Settings</strong> to import a CSV spreadsheet with your full herd.</p>

        <h2>Primary Farm Workflows</h2>
        
        <h3>1. Relocating Cattle</h3>
        <p>Go to the <strong>Pasture Map</strong>, click on a paddock cell, select any animal grazing inside, and click <strong>Move Pasture</strong>. Movements are automatically logged in the cow's history.</p>
        
        <h3>2. Dosing & Vaccination Tasks</h3>
        <p>Review active vet tasks on the <strong>Task Board</strong>. Checking off a task marks it complete and automatically records the treatment in the animal's history.</p>

        <h3>3. Defining Pasture Boundaries</h3>
        <p>Create paddocks by clicking <strong>Add Pasture</strong> in the map tab. Specify sizes and veld types. You cannot delete a pasture until all cattle have been moved out of it.</p>

        <h2>Backing Up Your Data</h2>
        <p>Go to <strong>Data Settings</strong> and click <strong>Export to CSV</strong> or <strong>Export JSON</strong> to download a complete backup of your herd records. You can open the CSV in Excel or LibreOffice at any time.</p>

        <h2>Importing Data</h2>
        <p>In <strong>Data Settings</strong>, click the import box to upload a CSV or JSON file. The CSV should have columns: Tag ID, Name, Breed, Gender, Date of Birth, Status, Current Pasture, Is Pregnant, Expected Calving Date, Insemination Method, Dam Tag, Sire Tag, Purchase Date, Purchase Price, Supplier, Sale Date, Sale Price, Buyer.</p>
    `;
}

/**
 * Lightweight, zero-dependency client-side Markdown to HTML compiler.
 * Converts headings, bullet lists, inline code blocks, bold text, and blockquotes.
 */
function parseMarkdownToHTML(md) {
    let html = md;

    // 1. Double escape HTML to prevent styling injection
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // 2. Unescape specific tag entities we need
    html = html.replace(/&lt;pre&gt;/g, '<pre>').replace(/&lt;\/pre&gt;/g, '</pre>');
    html = html.replace(/&lt;code&gt;/g, '<code>').replace(/&lt;\/code&gt;/g, '</code>');
    html = html.replace(/&lt;i class=(.*?)&gt;&lt;\/i&gt;/g, '<i class=$1></i>');

    // 3. Match code blocks ```code```
    html = html.replace(/```([\s\S]*?)```/g, (match, codeText) => {
        // Strip leading language keyword if present
        const cleanCode = codeText.replace(/^(bash|powershell|javascript|json|html|css)\r?\n/, '');
        return `<pre><code>${cleanCode}</code></pre>`;
    });

    // 4. Match inline code `code`
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // 5. Match Headers
    html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');

    // 6. Match GitHub Alert blockquotes (Gfm alerts)
    html = html.replace(/^&gt; \[!IMPORTANT\]\s*\r?\n&gt; (.*?)$/gm, 
        '<blockquote style="border-left-color: var(--danger);"><p style="color: var(--danger); font-weight: bold; margin-bottom: 0.25rem;"><i class="fa-solid fa-circle-exclamation"></i> IMPORTANT</p><p>$1</p></blockquote>');
    html = html.replace(/^&gt; \[!WARNING\]\s*\r?\n&gt; (.*?)$/gm, 
        '<blockquote style="border-left-color: var(--warning);"><p style="color: var(--warning); font-weight: bold; margin-bottom: 0.25rem;"><i class="fa-solid fa-triangle-exclamation"></i> WARNING</p><p>$1</p></blockquote>');
    html = html.replace(/^&gt; \[!TIP\]\s*\r?\n&gt; (.*?)$/gm, 
        '<blockquote style="border-left-color: var(--gold);"><p style="color: var(--gold); font-weight: bold; margin-bottom: 0.25rem;"><i class="fa-solid fa-lightbulb"></i> TIP</p><p>$1</p></blockquote>');
    html = html.replace(/^&gt; \[!NOTE\]\s*\r?\n&gt; (.*?)$/gm, 
        '<blockquote style="border-left-color: var(--info);"><p style="color: var(--info); font-weight: bold; margin-bottom: 0.25rem;"><i class="fa-solid fa-circle-info"></i> NOTE</p><p>$1</p></blockquote>');
    
    // Regular blockquotes fallback
    html = html.replace(/^&gt; (.*?)$/gm, '<blockquote><p>$1</p></blockquote>');

    // 7. Bold text
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // 8. Bullet lists
    html = html.replace(/^\s*[\*\-]\s+(.*?)$/gm, '<li>$1</li>');
    html = html.replace(/((?:<li>.*?<\/li>\s*)+)/gs, '<ul>$1</ul>');

    // 9. Standard paragraphs
    const lines = html.split(/\r?\n/);
    const parsedLines = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return '';
        // Skip tags already formatted
        if (trimmed.startsWith('<h') || 
            trimmed.startsWith('<ul') || 
            trimmed.startsWith('</ul') || 
            trimmed.startsWith('<li') || 
            trimmed.startsWith('<pre') || 
            trimmed.startsWith('</pre') || 
            trimmed.startsWith('<block') || 
            trimmed.startsWith('</block')) {
            return trimmed;
        }
        return `<p>${trimmed}</p>`;
    });

    return parsedLines.join('\n');
}
