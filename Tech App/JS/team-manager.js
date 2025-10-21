// MIT APP/Tech App/JS/team-manager.js
class TeamManager {
    constructor(app) {
        this.app = app;
        this.staffingData = null; // This will be populated by core.js
    }

    async initialize() {
        const container = document.getElementById('team-tab');
        container.innerHTML = `
            <div class="tab-header"><h2>Team & Zones</h2></div>
            <div id="zones-container" class="zones-container"></div>
        `;
        // The data is pre-loaded by core.js, so we can render immediately.
        this.renderTeamView();
    }

    generatePersonId() {
        return 'person_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    sanitizeStaffingData(staffingData) {
        if (!staffingData) return null;
        if (staffingData.zones) {
            staffingData.zones.forEach(zone => {
                if (zone.lead && !zone.lead.id) {
                    zone.lead.id = this.generatePersonId();
                }
                if (zone.members) {
                    zone.members.forEach(member => {
                        if (member && !member.id) {
                            member.id = this.generatePersonId();
                        }
                    });
                }
            });
        }
        return staffingData;
    }

    getAllTechnicians() {
        if (!this.staffingData) {
            return [];
        }
        const allStaff = [];
        if (this.staffingData.zones) {
            this.staffingData.zones.forEach(zone => {
                if (zone.lead) allStaff.push(zone.lead);
                if (zone.members) allStaff.push(...zone.members);
            });
        }
        if (this.staffingData.management) {
            allStaff.push(...this.staffingData.management);
        }
        return allStaff.filter(Boolean); // Filter out any null/undefined entries
    }

    renderTeamView() {
        const container = document.getElementById('zones-container');
        if (!this.staffingData || !this.staffingData.zones) {
            container.innerHTML = '<p>Could not load team data.</p>';
            return;
        }

        container.innerHTML = this.staffingData.zones.map(zone => {
            const leadName = zone.lead ? zone.lead.name : 'N/A';

            return `
            <div class="zone-card">
                <div class="zone-header">
                    <h3>${zone.name}</h3>
                    <div class="zone-lead">${leadName}</div>
                </div>
                <div class="zone-members">
                    ${zone.members.map(member => `
                        <div class="member-card">
                            <div class="member-details">
                                <span class="member-name">${member.name}</span>
                                <span class="member-role">${member.role}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `}).join('');
    }
}