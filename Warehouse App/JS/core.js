class WarehouseApp {
    constructor() {
        this.user = null;
        this.firebaseService = new FirebaseService();
        this.uiRenderer = new UIRenderer(this);
        this.modalManager = new ModalManager(this);
        this.fleetManager = new FleetManager(this);
        this.equipmentManager = new EquipmentManager(this);
        this.teamManager = new TeamManager(this);
        this.calendarManager = new CalendarManager(this);
        this.toolManager = new ToolManager(this);
    }

    async initialize() {
        this.user = await authManager.checkAuth();
        if (!this.user) {
            if (!window.location.pathname.endsWith('login.html')) {
                window.location.href = '../index.html';
            }
            return;
        }

        const loadingOverlay = document.getElementById('loading-overlay');
        const progressBar = document.getElementById('loading-progress-bar');
        const percentageText = document.getElementById('loading-percentage');
        let progress = 0;

        const updateProgress = (increment) => {
            // FIX: Check if all loading elements exist before trying to manipulate them.
            // This prevents the script from crashing on pages without a loading bar.
            if (!loadingOverlay || !progressBar || !percentageText) {
                return;
            }
            progress += increment;
            progressBar.style.width = `${progress}%`;
            percentageText.textContent = `${Math.round(progress)}%`;
        };
        
        if (loadingOverlay) {
            loadingOverlay.style.display = 'flex';
        }

        try {
            await this.uiRenderer.buildNavigation(this.user);
            updateProgress(15);
            
            await this.fleetManager.loadFleetData();
            updateProgress(15);
            
            await this.equipmentManager.loadEquipmentData();
            updateProgress(15);
            
            await this.teamManager.loadStaffingData();
            updateProgress(15);
            
            await this.calendarManager.initialize();
            updateProgress(15);

            const currentPath = window.location.pathname;

            if (currentPath.includes('fleet.html')) {
                await this.fleetManager.initialize();
            } else if (currentPath.includes('equipment.html')) {
                await this.equipmentManager.initialize();
            } else if (currentPath.includes('team.html')) {
                await this.teamManager.initialize();
            } else if (currentPath.includes('calendar.html')) {
                // Already initialized
            } else if (currentPath.includes('tools.html')) {
                await this.toolManager.initialize();
            } else {
                await this.uiRenderer.renderDashboard();
            }
            
            this.setupEventListeners();
            updateProgress(25); 

        } catch (error) {
            console.error("A critical error occurred during initialization:", error);
        } finally {
            if (loadingOverlay) {
                setTimeout(() => {
                    loadingOverlay.style.display = 'none';
                }, 200);
            }
        }
    }

    setupEventListeners() {
        document.getElementById('nav-placeholder')?.addEventListener('click', (e) => {
            const navBtn = e.target.closest('.nav-btn');
            const logoutBtn = e.target.closest('#logout-btn');

            if (navBtn) {
                this.switchTab(navBtn.dataset.tab);
            } else if (logoutBtn) {
                authManager.logout();
            }
        });

        document.querySelector('.hamburger-menu')?.addEventListener('click', () => {
            document.getElementById('main-nav-container')?.classList.toggle('is-open');
        });
    }

    switchTab(tabName) {
        const pageMap = {
            'dashboard': 'index.html',
            'fleet': 'fleet.html',
            'equipment': 'equipment.html',
            'team': 'team.html',
            'calendar': 'calendar.html',
            'tools': 'tools.html'
        };
        const targetPage = pageMap[tabName];
        if (targetPage && !window.location.pathname.includes(targetPage)) {
            window.location.href = targetPage;
        }
    }

    showError(message) {
        alert(message);
    }

    showSuccess(message) {
        alert(message);
    }
}

var warehouseApp;

function startApp() {
    if (!window.warehouseApp) {
        window.warehouseApp = new WarehouseApp();
        window.warehouseApp.initialize();
    }
}