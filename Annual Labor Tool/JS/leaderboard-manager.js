class LeaderboardManager {
    constructor(app) {
        this.app = app;
        this.eventKey = [];
        this.isAdmin = false; // To track admin login state
    }

    initialize() {
        this.loadEventKey();
        this.checkAdminStatus();
        this.renderLeaderboard();
        this.updateAdminUI();
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('leaderboardLoginBtn')?.addEventListener('click', () => this.openAdminModal());
        document.getElementById('leaderboardLogoutBtn')?.addEventListener('click', () => this.logout());
        document.getElementById('leaderboardSubmitLogin')?.addEventListener('click', () => this.login());

        const adminModal = document.getElementById('leaderboardAdminModal');
        adminModal?.querySelector('.close').addEventListener('click', () => {
            adminModal.style.display = 'none';
        });

        window.addEventListener('click', (event) => {
            if (event.target === adminModal) {
                adminModal.style.display = 'none';
            }
        });
    }

    checkAdminStatus() {
        this.isAdmin = localStorage.getItem('leaderboardAdmin') === 'true';
    }

    updateAdminUI() {
        const loginBtn = document.getElementById('leaderboardLoginBtn');
        const logoutBtn = document.getElementById('leaderboardLogoutBtn');
        if (loginBtn) loginBtn.style.display = this.isAdmin ? 'none' : 'inline-flex';
        if (logoutBtn) logoutBtn.style.display = this.isAdmin ? 'inline-flex' : 'none';
        this.renderLeaderboard(); // Re-render to show/hide edit buttons
    }

    openAdminModal() {
        const modal = document.getElementById('leaderboardAdminModal');
        if (modal) modal.style.display = 'flex';
    }

    login() {
        const passwordInput = document.getElementById('leaderboardPassword');
        if (passwordInput.value === 'Safety1') {
            this.isAdmin = true;
            localStorage.setItem('leaderboardAdmin', 'true');
            this.updateAdminUI();
            const modal = document.getElementById('leaderboardAdminModal');
            if (modal) modal.style.display = 'none';
            passwordInput.value = '';
        } else {
            alert('Incorrect password');
        }
    }

    logout() {
        this.isAdmin = false;
        localStorage.removeItem('leaderboardAdmin');
        this.updateAdminUI();
    }

    loadEventKey() {
        this.eventKey = [
            { "event": "Rolling Stop", "rating": 3 },
            { "event": "Following Too Close", "rating": 3 },
            { "event": "Hard Brake", "rating": 3 },
            { "event": "Speeding Above 15mph", "rating": 5 },
            { "event": "Smoking / Vaping", "rating": 5 },
            { "event": "Critical Distance", "rating": 10 },
            { "event": "No Seatbelt", "rating": 10 },
            { "event": "Cornering (hard turn)", "rating": 10 },
            { "event": "Rough / Uneven Surface", "rating": 10 },
            { "event": "Incident (small)", "rating": 50 },
            { "event": "Accident (large)", "rating": 100 }
        ];
    }

    getSafetyRating(rate) {
        if (rate <= 9) return { label: 'Safe', className: 'rating-safe' };
        if (rate <= 29) return { label: 'Well', className: 'rating-well' };
        if (rate <= 79) return { label: 'Risky', className: 'rating-risky' };
        return { label: 'Danger', className: 'rating-danger' };
    }

    renderLeaderboard() {
        const container = document.getElementById('leaderboard-view');
        if (!container) return;

        const allDrivers = this.app.teamManager.getAllTechnicians()
            .filter(tech => tech.driverScore && tech.driverScore.miles > 0) // **FIX**: Only include techs with miles
            .map(tech => {
                const { alerts, eventScore, miles } = tech.driverScore;
                const totalScore = (alerts || 0) + (eventScore || 0);
                const rate = miles > 0 ? (totalScore / miles) * 1000 : 0;
                return { ...tech, rate };
            })
            .sort((a, b) => a.rate - b.rate); // Sort by rate ascending

        const adminHeader = this.isAdmin ? '<th>Edit</th>' : '';

        let tableRows = '';
        if (allDrivers.length > 0) {
            tableRows = allDrivers.map((driver, index) => {
                const rating = this.getSafetyRating(driver.rate);
                const adminControls = this.isAdmin ? `<td data-label="Edit"><button class="btn btn-secondary btn-small" onclick="laborTool.leaderboardManager.editDriver('${driver.id}')">Edit</button></td>` : '';
                
                return `
                    <tr class="${rating.className}">
                        <td data-label="Rank" class="rank-cell">
                            <span class="rank-badge rank-${index + 1}">${index + 1}</span>
                        </td>
                        <td data-label="Driver">${driver.name}</td>
                        <td data-label="Alerts">${driver.driverScore.alerts || 0}</td>
                        <td data-label="Event Score">${driver.driverScore.eventScore || 0}</td>
                        <td data-label="Miles">${driver.driverScore.miles ? driver.driverScore.miles.toLocaleString() : 0}</td>
                        <td data-label="Rate (1k mi)">${driver.rate.toFixed(2)}</td>
                        ${adminControls}
                    </tr>
                `;
            }).join('');
        } else {
            const colspan = this.isAdmin ? 7 : 6;
            tableRows = `<tr><td colspan="${colspan}" style="text-align: center; padding: 20px;">No drivers have recorded scores yet.</td></tr>`;
        }


        const keyItems = this.eventKey.map(item => `
            <div class="key-item">
                <span class="key-event">${item.event}</span>
                <span class="key-rating">${item.rating} pts</span>
            </div>
        `).join('');

        const leaderboardHtml = `
            <div class="leaderboard-grid">
                <div class="leaderboard-main">
                    <div class="card">
                         <div class="card-header">
                            <h3><i class="fas fa-trophy"></i> Safe Driver Rankings</h3>
                        </div>
                        <div class="table-container">
                            <table class="data-table leaderboard-table">
                                <thead>
                                    <tr>
                                        <th>Rank</th>
                                        <th>Driver</th>
                                        <th>Alerts</th>
                                        <th>Event Score</th>
                                        <th>Miles</th>
                                        <th>Rate (1k mi)</th>
                                        ${adminHeader}
                                    </tr>
                                </thead>
                                <tbody>
                                    ${tableRows}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                <div class="leaderboard-sidebar">
                    <div class="card">
                        <div class="card-header">
                            <h3><i class="fas fa-key"></i> Event Key</h3>
                        </div>
                        <div class="key-list">
                            ${keyItems}
                        </div>
                    </div>
                    <div class="card">
                        <div class="card-header">
                            <h3><i class="fas fa-tachometer-alt"></i> Rating Key</h3>
                        </div>
                        <div class="rating-key-list">
                            <div class="rating-key-item rating-safe"><strong>0-9:</strong> Safe</div>
                            <div class="rating-key-item rating-well"><strong>10-29:</strong> Well</div>
                            <div class="rating-key-item rating-risky"><strong>30-79:</strong> Risky</div>
                            <div class="rating-key-item rating-danger"><strong>80+:</strong> Danger</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = leaderboardHtml;
    }

    editDriver(personId) {
        const driver = this.app.teamManager.findPersonById(personId);
        if (!driver || !driver.driverScore) return;

        const modalBody = `
            <div class="form-grid">
                <div class="form-group">
                    <label>Alerts</label>
                    <input type="number" id="editAlerts" class="form-input" value="${driver.driverScore.alerts || 0}">
                </div>
                <div class="form-group">
                    <label>Event Score</label>
                    <input type="number" id="editEventScore" class="form-input" value="${driver.driverScore.eventScore || 0}">
                </div>
                 <div class="form-group">
                    <label>Miles</label>
                    <input type="number" id="editMiles" class="form-input" value="${driver.driverScore.miles || 0}">
                </div>
            </div>`;
        
        const footerButtons = [
            { text: 'Cancel', class: 'btn-secondary', onclick: 'laborTool.closeModal()' },
            { text: 'Save', class: 'btn-primary', onclick: `laborTool.leaderboardManager.saveDriver('${personId}')` }
        ];

        this.app.modalManager.showModal(`Edit Scores for ${driver.name}`, modalBody, footerButtons);
    }

    async saveDriver(personId) {
        const driver = this.app.teamManager.findPersonById(personId);
        if (!driver) return;

        driver.driverScore.alerts = parseInt(document.getElementById('editAlerts').value) || 0;
        driver.driverScore.eventScore = parseInt(document.getElementById('editEventScore').value) || 0;
        driver.driverScore.miles = parseInt(document.getElementById('editMiles').value) || 0;

        this.app.modalManager.closeModal();
        
        await this.app.teamManager.saveStaffingData();
        
        this.renderLeaderboard();
        this.app.showSuccess(`${driver.name}'s scores updated.`);
    }
}
