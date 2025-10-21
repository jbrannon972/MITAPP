class TeamManager {
    constructor(app) {
        this.app = app;
        this.db = app.firebaseService.db;
    }

    initialize() {
        this.renderTeamManagement();
        this.setupEventListeners();
    }

    setupEventListeners() {
        const container = document.getElementById('team-tab');
        if(!container) return;

        container.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            const zoneTitle = e.target.closest('.zone-title');
            const zoneLead = e.target.closest('.zone-lead');
            const memberCard = e.target.closest('.member-card');
            const userRole = this.app.user.role;
            const isSupervisorOrLead = userRole === 'Supervisor' || userRole === 'MIT Lead';

            if (button) {
                const { view, action, zoneIndex, memberIndex } = button.dataset;
                if(view) this.switchTeamView(view);
                if (action === 'add-zone') this.addNewZone();
                else if (action === 'add-member') this.addMemberToZone(parseInt(zoneIndex));
                else if (action === 'remove-member') {
                    e.stopPropagation();
                    this.removeMember(parseInt(zoneIndex), parseInt(memberIndex));
                }
            } else if (zoneTitle && userRole === 'Manager') {
                this.showZoneAveragesModal(parseInt(zoneTitle.dataset.zoneIndex));
            } else {
                const targetElement = zoneLead || memberCard;
                if (targetElement) {
                    // Prevent click event during drag operation
                    if (targetElement.classList.contains('dragging')) return;
                    
                    const personId = targetElement.dataset.personId;
                    const person = this.findPersonById(personId);
                    if (!person) return;

                    const canClick = userRole === 'Manager' || (isSupervisorOrLead && person.role !== 'Supervisor' && person.role !== 'MIT Lead');
                    
                    if (canClick) {
                        this.editPersonProfile(personId);
                    }
                }
            }
        });

        this.app.modalManager.modalOverlay.addEventListener('click', async (e) => {
            const button = e.target.closest('button');
            if (button && button.dataset.action === 'edit-recurring') {
                const personId = button.dataset.personId;
                this.app.modalManager.closeModal(); // Close the profile modal first
                await this.app.calendarManager.openEditRecurringForTechModal(personId);
            }
        });
        
        // Add drag and drop event listeners
        const teamManagementContainer = document.getElementById('teamManagementContainer');
        if (teamManagementContainer) {
            teamManagementContainer.addEventListener('dragstart', this.handleDragStart.bind(this));
            teamManagementContainer.addEventListener('dragover', this.handleDragOver.bind(this));
            teamManagementContainer.addEventListener('drop', this.handleDrop.bind(this));
            teamManagementContainer.addEventListener('dragenter', this.handleDragEnter.bind(this));
            teamManagementContainer.addEventListener('dragleave', this.handleDragLeave.bind(this));
            teamManagementContainer.addEventListener('dragend', this.handleDragEnd.bind(this));
        }
    }

    handleDragStart(e) {
        if (e.target.classList.contains('member-card') || e.target.classList.contains('zone-lead')) {
            const canManage = ['Manager', 'Supervisor', 'MIT Lead'].includes(this.app.user.role);
            if (!canManage) {
                e.preventDefault();
                return;
            }
            e.dataTransfer.setData('text/plain', e.target.dataset.personId);
            setTimeout(() => e.target.classList.add('dragging'), 0);
        }
    }

    handleDragOver(e) {
        e.preventDefault();
        const dropZone = e.target.closest('.zone-card');
        if (dropZone) {
            dropZone.classList.add('drag-over');
        }
    }
    
    handleDragEnter(e) {
        e.preventDefault();
        const dropZone = e.target.closest('.zone-card');
        if (dropZone) {
            dropZone.classList.add('drag-over');
        }
    }

    handleDragLeave(e) {
        const dropZone = e.target.closest('.zone-card');
        if (dropZone) {
            dropZone.classList.remove('drag-over');
        }
    }
    
    handleDragEnd(e) {
        const draggingElement = document.querySelector('.dragging');
        if (draggingElement) {
            draggingElement.classList.remove('dragging');
        }
    }

    async handleDrop(e) {
        e.preventDefault();
        const dropZoneEl = e.target.closest('.zone-card');
        if (dropZoneEl) {
            dropZoneEl.classList.remove('drag-over');
            const personId = e.dataTransfer.getData('text/plain');
            const newZoneIndex = parseInt(dropZoneEl.dataset.zoneIndex);
            
            // Call the new unified move logic
            await this.movePerson(personId, newZoneIndex);
        }
    }
    
    async movePerson(personId, newZoneIndex) {
        const person = this.findPersonById(personId);
        if (!person) return;
    
        const newZone = this.app.staffingData.zones[newZoneIndex];
        if (!newZone) return;
    
        // Find original zone details
        let originalZone = null;
        let originalZoneIndex = -1;
        let originalMemberIndex = -1;
    
        for (let i = 0; i < this.app.staffingData.zones.length; i++) {
            const zone = this.app.staffingData.zones[i];
            if (zone.lead && zone.lead.id === personId) {
                originalZone = zone;
                originalZoneIndex = i;
                break;
            }
            const memberIndex = zone.members.findIndex(m => m.id === personId);
            if (memberIndex > -1) {
                originalZone = zone;
                originalZoneIndex = i;
                originalMemberIndex = memberIndex;
                break;
            }
        }
    
        if (!originalZone || originalZoneIndex === newZoneIndex) {
            return; // No move needed
        }
    
        // --- LOGIC FOR MOVING ---
        if (person.role === 'MIT Lead') {
            // This handles both swapping and moving to an empty lead slot.
            const targetLead = newZone.lead;
            newZone.lead = person;
            originalZone.lead = targetLead;
        } else { // It's a member (MIT Tech or Demo Tech)
            // Move member to new zone
            const [movedMember] = originalZone.members.splice(originalMemberIndex, 1);
            newZone.members.push(movedMember);
        }
        
        // Save and re-render
        await this.saveStaffingData();
        this.renderTeamManagement();
    }


    switchTeamView(viewName) {
        document.querySelectorAll('.team-view').forEach(v => {
            v.classList.remove('active');
            v.style.display = 'none';
        });
        document.querySelectorAll('#team-tab .sub-nav-btn').forEach(b => b.classList.remove('active'));
        
        const viewEl = document.getElementById(`${viewName}-view`);
        if (viewEl) {
            viewEl.classList.add('active');
            viewEl.style.display = 'block';
        }
        
        const btnEl = document.querySelector(`.sub-nav-btn[data-view="${viewName}"]`);
        if(btnEl) {
            btnEl.classList.add('active');
        }
    }

    formatName(fullName) {
        if (!fullName || typeof fullName !== 'string') return '';
        const cleanedName = fullName.replace(/\s*\(.*\)\s*/, '').trim();
        const parts = cleanedName.split(' ');
        if (parts.length === 1) return parts[0];
        const firstName = parts[0];
        const lastName = parts[parts.length - 1];
        if (lastName.length === 1 && lastName.match(/[A-Z]/)) {
            return `${firstName} ${lastName}.`;
        }
        const lastInitial = lastName.charAt(0).toUpperCase();
        return `${firstName} ${lastInitial}.`;
    }

    getAllTechnicians() {
        const techs = [];
        if (this.app.staffingData.zones) {
            this.app.staffingData.zones.forEach(zone => {
                if(zone.lead) techs.push(zone.lead);
                if(zone.members) zone.members.forEach(member => techs.push(member));
            });
        }
        if (this.app.staffingData.management) {
             this.app.staffingData.management.forEach(member => techs.push(member));
        }
        return techs.filter(Boolean);
    }
    
    renderTeamManagement() {
        const container = document.getElementById('teamManagementContainer');
        if (!container) return;
        const userRole = this.app.user.role;
        const canManage = ['Manager', 'Supervisor', 'MIT Lead'].includes(userRole);

        const addZoneButtonHtml = canManage ? `
            <div class="team-actions">
                <button class="btn btn-primary" data-action="add-zone"><i class="fas fa-plus"></i> Add New Zone</button>
            </div>` : '';

        let managementHtml = '';
        if (this.app.staffingData.management && this.app.staffingData.management.length > 0) {
            managementHtml = `
                <div class="zone-card">
                    <div class="zone-header">
                        <h3>Management</h3>
                    </div>
                    <div class="zone-members">
                        ${this.app.staffingData.management.map((member, memberIndex) => this.renderMemberCard(member, memberIndex, 'management')).join('')}
                    </div>
                </div>
            `;
        }

        let html = `
            <div class="team-overview">
                <div class="team-stats">
                    <div class="stat-card"><h3>Total Staff</h3><span class="stat-number">${this.app.calculator.getTotalStaff()}</span></div>
                    <div class="stat-card"><h3>MIT Techs</h3><span class="stat-number">${this.app.calculator.getMITTechCount()}</span></div>
                    <div class="stat-card"><h3>Demo Techs</h3><span class="stat-number">${this.app.calculator.getDemoTechCount()}</span></div>
                    <div class="stat-card"><h3>MIT Leads</h3><span class="stat-number">${this.app.staffingData.zones ? this.app.staffingData.zones.length : 0}</span></div>
                </div>
                
                ${addZoneButtonHtml}
                
                <div class="zones-container">
                    ${managementHtml}
        `;

        if (this.app.staffingData.zones) {
            this.app.staffingData.zones.forEach((zone, zoneIndex) => {
                html += this.renderZoneCard(zone, zoneIndex);
            });
        }

        html += `
                </div>
            </div>
        `;
        container.innerHTML = html;
    }

    renderZoneCard(zone, zoneIndex) {
        const userRole = this.app.user.role;
        const isSupervisorOrLead = userRole === 'Supervisor' || userRole === 'MIT Lead';
        const canManage = ['Manager', 'Supervisor', 'MIT Lead'].includes(userRole);
        const leadName = zone.lead ? zone.lead.name : 'N/A';
        const leadId = zone.lead ? zone.lead.id : '';
        
        const canClickProfile = (person) => {
            if (!person) return false;
            if (userRole === 'Manager') return true;
            if (isSupervisorOrLead && person.role !== 'Supervisor' && person.role !== 'MIT Lead') return true;
            return false;
        };
        const canClickLead = canClickProfile(zone.lead);

        const addMemberButtonHtml = canManage ? `
            <div class="add-member-section">
                <button class="btn btn-outline" data-action="add-member" data-zone-index="${zoneIndex}"><i class="fas fa-plus"></i> Add Member</button>
            </div>` : '';
        
        const draggableAttr = canManage ? 'draggable="true"' : 'draggable="false"';

        return `
            <div class="zone-card zone-${zoneIndex + 1}" data-zone-index="${zoneIndex}">
                <div class="zone-header">
                    <h3 class="zone-title ${userRole !== 'Manager' ? 'no-click' : ''}" data-zone-index="${zoneIndex}">${zone.name} ${userRole === 'Manager' ? '<i class="fas fa-info-circle"></i>' : ''}</h3>
                    <div class="zone-lead ${!canClickLead ? 'no-click' : ''}" data-person-id="${leadId}" ${draggableAttr}>
                        <i class="fas fa-star"></i>
                        <span>${leadName}</span>
                    </div>
                </div>
                <div class="zone-members">
                    ${zone.members.map((member, memberIndex) => this.renderMemberCard(member, memberIndex, zoneIndex)).join('')}
                    ${addMemberButtonHtml}
                </div>
                <div class="zone-stats">
                    <span>MIT Techs: ${this.countTechsInArray(zone.members, 'MIT Tech')}</span>
                    <span>Demo Techs: ${this.countTechsInArray(zone.members, 'Demo Tech')}</span>
                </div>
            </div>
        `;
    }

    renderMemberCard(member, memberIndex, zoneIndex) {
        const roleClass = (member.role || '').toLowerCase().replace(' ', '-');
        const userRole = this.app.user.role;
        const isSupervisorOrLead = userRole === 'Supervisor' || userRole === 'MIT Lead';
        const canManage = ['Manager', 'Supervisor', 'MIT Lead'].includes(userRole);
        
        const canClickProfile = (person) => {
            if (userRole === 'Manager') return true;
            if (isSupervisorOrLead && person.role !== 'Supervisor' && person.role !== 'MIT Lead') return true;
            return false;
        };
        
        const removeButtonHtml = canManage && zoneIndex !== 'management' ? 
            `<button class="btn btn-remove" data-action="remove-member" data-zone-index="${zoneIndex}" data-member-index="${memberIndex}" title="Remove Member"><i class="fas fa-times"></i></button>` : '';
        
        const draggableAttr = canManage ? 'draggable="true"' : 'draggable="false"';

        return `
            <div class="member-card ${roleClass} ${!canClickProfile(member) ? 'no-click' : ''}" data-person-id="${member.id}" ${draggableAttr}>
                ${removeButtonHtml}
                <div class="member-details ${!canManage ? 'no-controls' : ''}">
                    <span class="member-name">${this.formatName(member.name)}</span>
                    <span class="member-role">${member.role}</span>
                </div>
            </div>
        `;
    }
    
    countTechsInArray(array, role) {
        if (!array) return 0;
        return array.filter(m => m.role === role).length;
    }

    async getZoneAverages(zoneIndex) {
        const zone = this.app.staffingData.zones[zoneIndex];
        if (!zone) return null;

        const zoneMembers = [zone.lead, ...zone.members].filter(Boolean);
        let totalDriverRate = 0;
        let driverCount = 0;
        let evalScores = [];
        
        for (const member of zoneMembers) {
            if (member.driverScore && member.driverScore.miles > 0) {
                const { alerts, eventScore, miles } = member.driverScore;
                totalDriverRate += ((alerts || 0) + (eventScore || 0)) / miles * 1000;
                driverCount++;
            }
            try {
                const querySnapshot = await this.db.collection('technician-evaluations')
                    .where('technicianId', '==', member.id).orderBy('createdAt', 'desc').limit(1).get();
                if (!querySnapshot.empty) {
                    const latestEval = querySnapshot.docs[0].data();
                    if (latestEval.ratings && Object.keys(latestEval.ratings).length === 8) {
                        const total = Object.values(latestEval.ratings).reduce((sum, val) => sum + parseInt(val || 0), 0);
                        evalScores.push(total / 8);
                    }
                }
            } catch (e) {
                console.error(`Could not fetch eval for ${member.name}`, e);
            }
        }

        const avgDriverScore = driverCount > 0 ? (totalDriverRate / driverCount) : 0;
        let categoryCounts = { '10': 0, '70': 0, '20': 0 };
        evalScores.forEach(score => {
            if (score >= 3.2) categoryCounts['20']++;
            else if (score >= 2.0) categoryCounts['70']++;
            else categoryCounts['10']++;
        });

        return { avgDriverScore, categoryCounts };
    }

    async showZoneAveragesModal(zoneIndex) {
        const zone = this.app.staffingData.zones[zoneIndex];
        const averages = await this.getZoneAverages(zoneIndex);

        if (!averages) return;

        const { avgDriverScore, categoryCounts } = averages;
        const driverRating = this.app.leaderboardManager.getSafetyRating(avgDriverScore);

        const modalBody = `
            <div class="zone-averages-grid">
                <div class="stat-card">
                    <h3>Avg. Driver Score</h3>
                    <span class="stat-number ${driverRating.className}">${avgDriverScore.toFixed(2)}</span>
                    <p class="stat-label">${driverRating.label}</p>
                </div>
                <div class="stat-card">
                    <h3>70/20/10 Distribution</h3>
                    <div class="category-breakdown">
                        <div class="category-item category-20"><strong>20:</strong> ${categoryCounts['20']} techs</div>
                        <div class="category-item category-70"><strong>70:</strong> ${categoryCounts['70']} techs</div>
                        <div class="category-item category-10"><strong>10:</strong> ${categoryCounts['10']} techs</div>
                    </div>
                </div>
            </div>
        `;

        this.app.modalManager.showModal(`Averages for ${zone.name}`, modalBody, [
            { text: 'Close', class: 'btn-secondary', onclick: 'laborTool.modalManager.closeModal()' }
        ]);
    }

    async editPersonProfile(personId) {
        const person = this.findPersonById(personId);
        if (!person) return;

        const querySnapshot = await this.db.collection('technician-evaluations')
            .where('technicianId', '==', person.id).orderBy('createdAt', 'desc').limit(1).get();
        const latestEval = querySnapshot.empty ? null : querySnapshot.docs[0].data();
        let summaryHtml = '<div class="summary-box summary-no-data"><p>No evaluation found.</p></div>';

        if (latestEval) {
            const { ratings, createdAt } = latestEval;
            let averageScore = 'N/A', category = 'N/A', categoryClass = 'default';
            if (ratings && Object.keys(ratings).length === 8) {
                const total = Object.values(ratings).reduce((sum, val) => sum + parseInt(val || 0), 0);
                averageScore = (total / 8).toFixed(2);
                if (averageScore >= 3.2) { category = '20'; categoryClass = 'success'; }
                else if (averageScore >= 2.0) { category = '70'; categoryClass = 'warning'; }
                else { category = '10'; categoryClass = 'danger'; }
            }
            summaryHtml = `<div class="summary-box summary-${categoryClass}"><div class="summary-score">${averageScore}</div><div class="summary-details"><div class="summary-category">Category: <strong>${category}</strong></div><div class="summary-date">Last Eval: ${createdAt.toDate().toLocaleDateString()}</div></div></div>`;
        }

        const { driverScore } = person;
        let driverScoreHtml = '<div class="summary-box summary-no-data"><p>N/A</p></div>';
        if (driverScore && driverScore.miles > 0) {
            const rate = ((driverScore.alerts || 0) + (driverScore.eventScore || 0)) / driverScore.miles * 1000;
            const rating = this.app.leaderboardManager.getSafetyRating(rate);
            const ratingClassMap = {
                'rating-safe': 'summary-success',
                'rating-well': 'summary-warning',
                'rating-risky': 'summary-danger',
                'rating-danger': 'summary-danger'
            };
            const summaryClass = ratingClassMap[rating.className] || 'summary-no-data';
            driverScoreHtml = `<div class="summary-box ${summaryClass}"><div class="summary-score">${rate.toFixed(2)}</div><div class="summary-details"><div class="summary-category">Rating: <strong>${rating.label}</strong></div><div class="summary-date">Rate per 1k miles</div></div></div>`;
        }
        
        const vehicle = this.app.fleetManager.getVehicleByTechnician(person.id);
        const vehicleInfoHtml = `<h4><i class="fas fa-car"></i> Assigned Vehicle</h4><p>${vehicle ? `<strong>Truck #:</strong> ${vehicle.truckNumber} (${vehicle.type})` : 'No vehicle assigned.'}</p>`;

        const roleOptions = [
            'Manager', 'Supervisor', 'MIT Lead', 'MIT Tech', 'Demo Tech', 
            'Fleet', 'Fleet Safety', 'Auditor', 'Warehouse'
        ].map(role => `<option value="${role}" ${person.role === role ? 'selected' : ''}>${role}</option>`).join('');

        const modalBody = `
            <style>
                .profile-modal-summaries { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
                .profile-main-content h4, .summary-box-container h4 { font-size: 16px; margin-top: 20px; margin-bottom: 12px; color: var(--primary-color); border-bottom: 1px solid var(--border-color); padding-bottom: 8px;}
                .profile-main-content h4:first-child { margin-top: 0; }
                .summary-box-container h4 { margin-top: 0; }
                .summary-box { display: flex; align-items: center; gap: 16px; padding: 12px; border-radius: var(--radius-md); }
                .summary-score { font-size: 2em; font-weight: 700; }
                .summary-category { font-weight: 600; }
                .summary-date { font-size: 0.9em; color: var(--text-secondary); }
                .summary-success { background-color: #f0fdf4; color: #15803d; }
                .summary-warning { background-color: #fffbeb; color: #b45309; }
                .summary-danger { background-color: #fef2f2; color: #b91c1c; }
                .summary-no-data { background-color: #f8fafc; }
                @media (max-width: 768px) { .profile-modal-summaries { grid-template-columns: 1fr; } }
            </style>
            <div>
                <div class="profile-modal-summaries">
                    <div class="summary-box-container">
                        <h4><i class="fas fa-chart-bar"></i> 70/20/10 Score</h4>
                        ${summaryHtml}
                    </div>
                    <div class="summary-box-container">
                        <h4><i class="fas fa-tachometer-alt"></i> Driver Score</h4>
                        ${driverScoreHtml}
                    </div>
                </div>
                <div class="profile-main-content">
                    <h4><i class="fas fa-user-circle"></i> Core Details</h4>
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Full Name</label>
                            <input type="text" id="profileName" class="form-input" value="${person.name}">
                        </div>
                        <div class="form-group">
                            <label>Role</label>
                            <select id="profileRole" class="form-input">${roleOptions}</select>
                        </div>
                        <div class="form-group">
                            <label>Hire Date</label>
                            <input type="date" id="profileHireDate" class="form-input" value="${person.hireDate || ''}">
                        </div>
                        <div class="form-group">
                            <label>End Date</label>
                            <input type="date" id="endDate" class="form-input" value="${person.endDate || ''}">
                        </div>
                    </div>
                     <h4><i class="fas fa-tasks"></i> Status & Training</h4>
                     <div class="form-grid">
                         <div class="form-group" style="flex-direction: row; align-items: center;">
                            <input type="checkbox" id="inTraining" ${person.inTraining ? 'checked' : ''} style="width: auto; margin-right: 8px;">
                            <label for="inTraining" style="margin-bottom: 0;">In Training?</label>
                        </div>
                        <div class="form-group">
                            <label>Training End Date</label>
                            <input type="date" id="trainingEndDate" class="form-input" value="${person.trainingEndDate || ''}">
                        </div>
                     </div>
                     <h4><i class="fab fa-slack"></i> Slack Integration</h4>
                     <div class="form-group">
                         <label>Slack User ID</label>
                         <input type="text" id="profileSlackId" class="form-input" value="${person.slackId || ''}" placeholder="e.g., U040LUK4ZFW">
                     </div>
                     ${vehicleInfoHtml}
                     <h4><i class="fas fa-sync-alt"></i> Custom Recurring Schedule</h4>
                     <p style="font-size: 0.9em; color: var(--text-secondary);">Create advanced rules like "Off every other Monday".</p>
                     <button class="btn btn-secondary" data-action="edit-recurring" data-person-id="${person.id}"><i class="fas fa-edit"></i> Edit Custom Rules</button>
                </div>
            </div>`;
        
        this.app.modalManager.showModal(`Edit Profile: ${person.name}`, modalBody, [
            { text: 'Cancel', class: 'btn-secondary', onclick: 'laborTool.modalManager.closeModal()' },
            { text: 'Save Profile', class: 'btn-primary', onclick: `laborTool.teamManager.savePersonProfile('${person.id}')` }
        ]);
    }

    async savePersonProfile(personId) {
        const person = this.findPersonById(personId);
        if (!person) return;
        
        person.name = document.getElementById('profileName').value.trim();
        person.role = document.getElementById('profileRole').value;
        person.hireDate = document.getElementById('profileHireDate').value;
        person.endDate = document.getElementById('endDate').value;
        person.inTraining = document.getElementById('inTraining').checked;
        person.trainingEndDate = document.getElementById('trainingEndDate').value;
        person.slackId = document.getElementById('profileSlackId').value.trim();

        await this.saveStaffingData();
        this.app.modalManager.closeModal();
        this.renderTeamManagement();
    }

    findPersonById(personId) {
        return this.getAllTechnicians().find(p => p.id === personId);
    }

    addMemberToZone(zoneIndex) {
        const modalBody = `<div class="form-grid"><div class="form-group"><label>Member Name</label><input type="text" id="newMemberName" class="form-input" placeholder="Enter full name"></div><div class="form-group"><label>Role</label><select id="newMemberRole" class="form-input"><option value="MIT Tech">MIT Tech</option><option value="Demo Tech">Demo Tech</option></select></div></div>`;
        this.app.modalManager.showModal('Add New Team Member', modalBody, [{ text: 'Cancel', class: 'btn-secondary', onclick: 'laborTool.modalManager.closeModal()' },{ text: 'Add Member', class: 'btn-primary', onclick: `laborTool.teamManager.confirmAddMember(${zoneIndex})` }]);
    }

    async confirmAddMember(zoneIndex) {
        const name = document.getElementById('newMemberName').value.trim();
        if (!name) return;
        this.app.staffingData.zones[zoneIndex].members.push({ 
            id: this.app.dataManager.generatePersonId(), 
            name, 
            role: document.getElementById('newMemberRole').value, 
            driverScore: { alerts: 0, eventScore: 0, miles: 0 }
        });
        await this.saveStaffingData();
        this.app.modalManager.closeModal();
        this.renderTeamManagement();
    }

    removeMember(zoneIndex, memberIndex) {
        const memberName = this.app.staffingData.zones[zoneIndex].members[memberIndex].name;
        this.app.modalManager.showConfirmDialog('Remove Team Member', `Are you sure you want to remove ${memberName}?`,
            `laborTool.teamManager.confirmRemoveMember(${zoneIndex}, ${memberIndex})`
        );
    }

    async confirmRemoveMember(zoneIndex, memberIndex) {
        this.app.staffingData.zones[zoneIndex].members.splice(memberIndex, 1);
        await this.saveStaffingData();
        this.renderTeamManagement();
    }

    addNewZone() {
        const modalBody = `<div class="form-grid"><div class="form-group"><label>Zone Name</label><input type="text" id="newZoneName" class="form-input"></div><div class="form-group"><label>Zone Lead Name</label><input type="text" id="newZoneLeadName" class="form-input"></div></div>`;
        this.app.modalManager.showModal('Add New Zone', modalBody, [{ text: 'Cancel', class: 'btn-secondary', onclick: 'laborTool.modalManager.closeModal()' },{ text: 'Create Zone', class: 'btn-primary', onclick: 'laborTool.teamManager.confirmAddZone()' }]);
    }

    async confirmAddZone() {
        const zoneName = document.getElementById('newZoneName').value.trim();
        const leadName = document.getElementById('newZoneLeadName').value.trim();
        if (!zoneName || !leadName) return;
        const newLead = { 
            id: this.app.dataManager.generatePersonId(), 
            name: leadName, 
            role: 'MIT Lead', 
            driverScore: { alerts: 0, eventScore: 0, miles: 0 }
        };
        const newZone = { 
            name: zoneName, 
            lead: newLead, 
            members: [] 
        };
        this.app.staffingData.zones.push(newZone);

        await this.saveStaffingData();
        this.app.modalManager.closeModal();
        this.renderTeamManagement();
    }

    async saveStaffingData() {
        try {
            await this.app.firebaseService.saveStaffingData(this.app.staffingData);
            this.app.showSuccess('Team data saved successfully!');
        } catch (error) {
            console.error('Error auto-saving staffing data:', error);
            this.app.showError('Failed to save changes.');
        }
    }
}