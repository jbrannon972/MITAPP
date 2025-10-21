// MIT APP/Tech App/JS/core.js
class TechApp {
    constructor() {
        this.user = null;
        this.firebaseService = new FirebaseService();
        this.modalManager = new ModalManager(this);
        this.teamManager = new TeamManager(this);
        this.calendarManager = new CalendarManager(this);
        this.fleetManager = new FleetManager(this);
        this.reportManager = new ReportManager(this);
        this.toolManager = new ToolManager(this); // Add this line
        this.ui = new TechAppUI(this);
    }

    async initialize() {
        this.user = await authManager.checkAuth();
        if (!this.user) {
            if (!window.location.pathname.endsWith('login.html')) {
                window.location.href = '../index.html';
            }
            return;
        }

        try {
            // Step 1: Load and sanitize the core staffing data first.
            let rawStaffingData = await this.firebaseService.loadStaffingData();
            this.teamManager.staffingData = this.teamManager.sanitizeStaffingData(rawStaffingData);

            // Step 2: Pre-load any other necessary data.
            await this.fleetManager.loadFleetData();
            await this.toolManager.initialize(); // Add this line

            // Step 3: Initialize all UI managers now that data is ready.
            await this.ui.buildNavigation();
            await this.calendarManager.initialize();
            await this.teamManager.initialize();
            await this.reportManager.initialize();
            
            // Step 4: Setup event listeners and show the default view.
            this.setupEventListeners();
            this.ui.showTab('calendar-tab');

        } catch (error) {
            console.error("Critical error during initialization:", error);
            document.body.innerHTML = "<p>Error: Could not load required application data. Please refresh.</p>";
        }
    }

    setupEventListeners() {
        document.getElementById('nav-placeholder')?.addEventListener('click', (e) => {
            const navBtn = e.target.closest('.nav-btn');
            if (navBtn) {
                this.ui.showTab(navBtn.dataset.tab + '-tab');
            }
        });
        document.querySelector('.hamburger-menu')?.addEventListener('click', () => {
            document.getElementById('main-nav-container')?.classList.toggle('is-open');
        });
    }
}

class TechAppUI {
    constructor(app) {
        this.app = app;
    }

    async buildNavigation() {
        const navContent = document.querySelector('.nav-content');
        if (!navContent) return;

        const buttons = [
            { tab: 'calendar', icon: 'fa-calendar-alt', text: 'Calendar' },
            { tab: 'team', icon: 'fa-users', text: 'Team' },
            { tab: 'report', icon: 'fa-flag', text: 'Report' }
        ];

        navContent.innerHTML = buttons.map(btn => `
            <button class="nav-btn" data-tab="${btn.tab}">
                <i class="fas ${btn.icon}"></i><span>${btn.text}</span>
            </button>
        `).join('');

        document.getElementById('logout-btn')?.addEventListener('click', () => authManager.logout());
    }

    showTab(tabId) {
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        document.getElementById(tabId)?.classList.add('active');
        
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab + '-tab' === tabId);
        });
    }
}

// Start the application
var techApp;

function startApp() {
    if (!window.techApp) {
        window.techApp = new TechApp();
        window.techApp.initialize();
    }
}