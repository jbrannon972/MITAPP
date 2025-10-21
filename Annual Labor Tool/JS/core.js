class HouMitigationLaborTool {
    constructor() {
        this.user = null;
        this.currentYear = new Date().getFullYear();
        this.currentMonth = new Date().getMonth();
        this.monthlyData = {};
        this.wageSettings = {};
        this.staffingData = {};
        this.charts = {};
        this.isLoading = false;

        this.firebaseService = new FirebaseService();
        this.dataManager = new DataManager(this);
        this.calculator = new Calculator(this);
        this.teamManager = new TeamManager(this);
        this.uiRenderer = new UIRenderer(this);
        this.chartRenderer = new ChartRenderer(this);
        this.modalManager = new ModalManager(this);
        this.calendarManager = new CalendarManager(this);
        this.fleetManager = new FleetManager(this);
        this.equipmentManager = new EquipmentManager(this);
        this.leaderboardManager = new LeaderboardManager(this);
        this.evaluationManager = new EvaluationManager(this);
        this.analyzerManager = new AnalyzerManager(this);
        this.damagesManager = new DamagesManager(this);
        this.toolManager = new ToolManager(this);
        this.slackManager = new SlackManager(this);
    }

    async initialize() {
        this.user = await authManager.checkAuth();
        if (!this.user) {
            // If checkAuth fails, redirect to the main login portal
            if (!window.location.pathname.endsWith('login.html')) {
                window.location.href = '../index.html';
            }
            return;
        }

        if (!(await this.checkPagePermission())) return;

        try {
            this.isLoading = true;
            this.uiRenderer.showLoadingState(true);

            await this.uiRenderer.buildNavigation(this.user);

            const currentPath = window.location.pathname;

            // Load all essential data managers first
            await this.dataManager.loadAllData();
           
            this.uiRenderer.applyRoleRestrictions();

            // Now run page-specific initializations
            if (currentPath.includes('labor-forecasting.html')) {
                this.uiRenderer.initializeForecastingPage();
            } else if (currentPath.includes('team.html')) {
                this.teamManager.initialize();
                this.leaderboardManager.initialize();
                this.evaluationManager.initialize();
            } else if (currentPath.includes('calendar.html')) {
                await this.calendarManager.initialize();
            } else if (currentPath.includes('analyzer.html')) {
                await this.analyzerManager.initialize();
            } else if (currentPath.includes('install-dpt.html')) {
                this.installDptManager = new InstallDptManager(this);
                await this.installDptManager.initialize();
            } else if (currentPath.includes('damages.html')) {
                await this.damagesManager.initialize();
            } else if (currentPath.includes('slack_mentions.html')) {
                await this.slackManager.initialize();
            } else if (currentPath.includes('warehouse.html')) {
                 await this.fleetManager.initialize();
                 await this.equipmentManager.initialize();
                 await this.toolManager.initialize();
            } else if (currentPath.includes('index.html') || currentPath.endsWith('/Annual%20Labor%20Tool/')) {
                this.uiRenderer.renderDashboard();
            }

            this.setupEventListeners();
            console.log('Tool initialized successfully.');
        } catch (error) {
            console.error('Critical initialization error:', error);
            this.showError('A critical error occurred during startup. Please refresh the page.');
        } finally {
            this.isLoading = false;
            this.uiRenderer.showLoadingState(false);
        }
    }

    async checkPagePermission() {
        const pageMap = {
            'dashboard': 'index.html',
            'forecasting': 'labor-forecasting.html',
            'team': 'team.html',
            'warehouse': 'warehouse.html',
            'calendar': 'calendar.html',
            'analyzer': 'analyzer.html',
            'install-dpt': 'install-dpt.html',
            'damages': 'damages.html',
            'slack_mentions': 'slack_mentions.html'
        };

        const permissions = {
            'Manager': ['dashboard', 'forecasting', 'team', 'warehouse', 'calendar', 'analyzer', 'install-dpt', 'damages', 'slack_mentions'],
            'Supervisor': ['dashboard', 'team', 'warehouse', 'calendar', 'analyzer', 'damages', 'slack_mentions'],
            'MIT Lead': ['dashboard', 'team', 'warehouse', 'calendar', 'analyzer', 'damages', 'slack_mentions'],
            'Fleet': ['team', 'warehouse', 'calendar'],
            'Fleet Safety': ['team'],
            'Auditor': ['dashboard', 'forecasting', 'team', 'warehouse', 'calendar', 'analyzer']
        };

        const currentPath = window.location.pathname;
        const currentTab = Object.keys(pageMap).find(key => currentPath.includes(pageMap[key]));

        if (!currentTab) return true; // Failsafe for unknown pages

        const userRole = this.user.role;
        let userPermissions = permissions[userRole] || [];
        
        // ** THIS IS THE CORRECTED LINE **
        const secondShiftLeadName = await this.firebaseService.getSecondShiftLeadName();
        const secondShiftLeadUsername = secondShiftLeadName ? `${secondShiftLeadName.toLowerCase().replace(' ', '.')}@entrusted.com` : '';

        if (this.user.email === secondShiftLeadUsername) {
            if (!userPermissions.includes('install-dpt')) {
                userPermissions.push('install-dpt');
            }
        }

        if (!userPermissions.includes(currentTab)) {
            console.warn(`Access Denied: Role '${userRole}' cannot access '${currentTab}'. Redirecting.`);
            window.location.href = 'index.html';
            return false;
        }

        return true;
    }

    setupEventListeners() {
        document.querySelector('.hamburger-menu')?.addEventListener('click', () => {
            document.getElementById('main-nav-container')?.classList.toggle('is-open');
        });

        document.getElementById('nav-placeholder')?.addEventListener('click', (e) => {
            const navBtn = e.target.closest('.nav-btn');
            const logoutBtn = e.target.closest('#logout-btn');
            const adminBtn = e.target.closest('#admin-panel-btn');

            if (navBtn) this.switchTab(navBtn.dataset.tab);
            else if (logoutBtn) authManager.logout();
            else if (adminBtn && this.user.role === 'Manager') window.location.href = 'admin.html';
        });

        // Event listener for the new dashboard sub-nav
        document.getElementById('dashboard-tab')?.addEventListener('click', (e) => {
            const subNavBtn = e.target.closest('.sub-nav-btn');
            if (subNavBtn) {
                this.uiRenderer.switchDashboardView(subNavBtn.dataset.view);
            }
        });
        
        // Event listener for the WAREHOUSE sub-nav
        document.getElementById('warehouse-main-subnav')?.addEventListener('click', (e) => {
            const subNavBtn = e.target.closest('.sub-nav-btn');
            if (subNavBtn) {
                const viewId = subNavBtn.dataset.view;
                document.querySelectorAll('.warehouse-view').forEach(v => v.style.display = 'none');
                document.querySelectorAll('#warehouse-main-subnav .sub-nav-btn').forEach(b => b.classList.remove('active'));
                
                const viewElement = document.getElementById(viewId);
                if (viewElement) {
                    viewElement.style.display = 'block';
                }
                
                subNavBtn.classList.add('active');
            }
        });

        const modal = document.getElementById('modalOverlay');
        if (modal) {
            const closeButton = modal.querySelector('.modal-close');
            if (closeButton) {
                closeButton.addEventListener('click', () => this.closeModal());
            }
        }
    }

    async switchTab(tabName) {
        const pageMap = {
            'dashboard': 'index.html',
            'forecasting': 'labor-forecasting.html',
            'team': 'team.html',
            'warehouse': 'warehouse.html',
            'calendar': 'calendar.html',
            'analyzer': 'analyzer.html',
            'install-dpt': 'install-dpt.html',
            'damages': 'damages.html',
            'slack_mentions': 'slack_mentions.html'
        };
        const targetPage = pageMap[tabName];

        if (targetPage && !window.location.pathname.includes(targetPage)) {
            window.location.href = targetPage;
        }
    }

    showError(message) {
        console.error(message);
        alert(message);
    }

    showSuccess(message) {
        alert(message);
    }

    closeModal() { this.modalManager.closeModal(); }
}

var laborTool;

function startApp() {
    if (!window.laborTool) {
        window.laborTool = new HouMitigationLaborTool();
        window.laborTool.initialize();
    }
}