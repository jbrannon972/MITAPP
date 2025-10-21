class TeamManager {
    constructor(app) {
        this.app = app;
        this.staffingData = {};
    }

    async initialize() {
        if(document.getElementById('team-tab')) {
             this.renderTeamManagement();
        }
    }

    async loadStaffingData() {
        this.staffingData = await this.app.firebaseService.loadStaffingData();
    }
    
    renderTeamManagement() {
        const container = document.getElementById('teamManagementContainer');
        if (!container) return;

        let html = '<div class="team-overview"><div class="zones-container">';
        if (this.staffingData.zones) {
            this.staffingData.zones.forEach((zone, zoneIndex) => {
                html += this.renderZoneCard(zone, zoneIndex);
            });
        }
        html += '</div></div>';
        container.innerHTML = html;
    }

    renderZoneCard(zone, zoneIndex) {
        // ** FIX START **
        // Added a check to ensure zone.lead exists before trying to access its properties.
        const leadName = zone.lead ? zone.lead.name : 'N/A';
        // ** FIX END **

        return `
            <div class="zone-card">
                <div class="zone-header">
                    <h3 class="zone-title no-click">${zone.name}</h3>
                    <div class="zone-lead no-click">
                        <i class="fas fa-star"></i>
                        <span>${leadName}</span>
                    </div>
                </div>
                <div class="zone-members">
                    ${zone.members.map((member) => this.renderMemberCard(member)).join('')}
                </div>
            </div>
        `;
    }

    renderMemberCard(member) {
        const roleClass = member.role.toLowerCase().replace(' ', '-');
        return `
            <div class="member-card ${roleClass} no-click">
                <div class="member-details no-controls">
                    <span class="member-name">${member.name}</span>
                    <span class="member-role">${member.role}</span>
                </div>
            </div>
        `;
    }
}