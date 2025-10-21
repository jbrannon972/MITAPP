// report-manager.js

class ReportManager {
    constructor(app) {
        this.app = app;
        this.db = app.firebaseService.db;
        this.allTimeStatsCache = null; 
        this.activeReport = null;
        this.chartInstance = null;
        this.map = null;
        this.selectedZipCodes = [];
        this.zipCodeJobs = {}; 
        this.totalJobsInReport = 0;
    }

    initialize() {
        if (document.getElementById('reports-view')) {
            this.setupEventListeners();
            this.loadDataCache();
        }
    }

    setupEventListeners() {
        document.getElementById('report-list')?.addEventListener('click', (e) => {
            if (e.target.tagName === 'LI') {
                const reportName = e.target.dataset.report;
                this.setActiveReport(e.target);
                this.generateReport(reportName);
            }
        });

        // Use event delegation for the dynamically added run button
        document.getElementById('report-filters')?.addEventListener('click', e => {
            if (e.target.id === 'run-report-btn') {
                if (this.activeReport) {
                    this.generateReport(this.activeReport);
                }
            }
        });
        document.getElementById('report-output')?.addEventListener('click', e => {
            if (e.target.id === 'print-hotspot-report-btn') {
                this.printHotspotReport();
            }
        });
    }

    async loadDataCache() {
        if (!this.app.analyzerManager.allTimeStatsCache) {
            this.app.analyzerManager.allTimeStatsCache = await this.app.firebaseService.getDashboardData();
        }
        this.allTimeStatsCache = this.app.analyzerManager.allTimeStatsCache;
    }

    setActiveReport(selectedLi) {
        document.querySelectorAll('#report-list li').forEach(li => li.classList.remove('active'));
        selectedLi.classList.add('active');
    }

    _renderFilters(filterTypes = ['dateRange']) {
        const container = document.getElementById('report-filters');
        
        // Preserve existing values before clearing
        const oldStartDate = document.getElementById('reportStartDate')?.value;
        const oldEndDate = document.getElementById('reportEndDate')?.value;
        const oldYear = document.getElementById('reportYear')?.value;

        let filtersHtml = '<div class="filter-controls">';

        if (filterTypes.includes('dateRange')) {
            filtersHtml += `
                <div class="filter-group">
                    <label for="reportStartDate">Start:</label>
                    <input type="date" id="reportStartDate" class="date-input">
                </div>
                <div class="filter-group">
                    <label for="reportEndDate">End:</label>
                    <input type="date" id="reportEndDate" class="date-input">
                </div>
            `;
        }

        if (filterTypes.includes('year')) {
             filtersHtml += `
                <div class="filter-group">
                    <label for="reportYear">Year:</label>
                    <select id="reportYear" class="sub-input">${this._getYearOptions()}</select>
                </div>
            `;
        }

        filtersHtml += `<button id="run-report-btn" class="load-date-btn">Run Report</button></div>`;
        container.innerHTML = filtersHtml;

        // Restore old values or set defaults
        const startDateInput = document.getElementById('reportStartDate');
        const endDateInput = document.getElementById('reportEndDate');
        const yearInput = document.getElementById('reportYear');
        
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const formatDate = (date) => date.toISOString().split('T')[0];

        if (startDateInput) {
            startDateInput.value = oldStartDate || formatDate(firstDayOfMonth);
        }
        if (endDateInput) {
            endDateInput.value = oldEndDate || formatDate(today);
        }
        if (yearInput) {
            yearInput.value = oldYear || today.getFullYear();
        }
    }


    _getYearOptions() {
        const currentYear = new Date().getFullYear();
        let options = '';
        for (let i = currentYear; i >= currentYear - 5; i--) {
            options += `<option value="${i}">${i}</option>`;
        }
        return options;
    }

    _getFilteredData() {
        const startDate = document.getElementById('reportStartDate')?.value;
        const endDate = document.getElementById('reportEndDate')?.value;
        
        if (!this.allTimeStatsCache || !this.allTimeStatsCache.dailyStats) {
            return [];
        }

        return this.allTimeStatsCache.dailyStats.filter(stat => {
            return (!startDate || stat.date >= startDate) && (!endDate || stat.date <= endDate);
        });
    }

    generateReport(reportName) {
        this.activeReport = reportName;
        // Destroy previous map or chart instances to prevent memory leaks
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
        if (this.chartInstance) {
            this.chartInstance.destroy();
            this.chartInstance = null;
        }

        const reportFunction = this[reportName];
        if (typeof reportFunction === 'function') {
            reportFunction.call(this);
        } else {
            console.error(`Report function "${reportName}" not found.`);
            document.getElementById('report-output').innerHTML = `<p class="text-danger">Could not generate report: ${reportName}</p>`;
        }
    }
    
    // --- REPORT GENERATION FUNCTIONS ---
    
    jobReturnFrequency() {
        this._renderFilters(['dateRange']);
        const filteredData = this._getFilteredData();
        const output = document.getElementById('report-output');

        const jobVisits = {};
        const jobDetails = {};

        filteredData.forEach(day => {
            (day.jobNumbers || []).forEach(jobId => {
                if(jobId && jobId !== 'N/A') {
                    jobVisits[jobId] = (jobVisits[jobId] || 0) + 1;
                    if(!jobDetails[jobId]) {
                        const jobData = (day.jobsData || []).find(j => j.id === jobId);
                        if(jobData) {
                            jobDetails[jobId] = { name: jobData.name, address: jobData.address };
                        }
                    }
                }
            });
        });

        const jobsWithReturns = Object.entries(jobVisits)
            .map(([jobId, count]) => ({
                jobId,
                count,
                ...jobDetails[jobId]
            }))
            .filter(job => job.count > 1)
            .sort((a, b) => b.count - a.count);

        let tableHtml = `<h2 class="report-title">Job Return Frequency Report</h2>`;

        if (jobsWithReturns.length === 0) {
            tableHtml += '<p>No jobs with return visits found in the selected date range.</p>';
        } else {
            tableHtml += `
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Job Name</th>
                                <th>Address</th>
                                <th>Total Visits</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${jobsWithReturns.map(job => `
                                <tr>
                                    <td>${job.name || 'N/A'}</td>
                                    <td>${job.address || 'N/A'}</td>
                                    <td>${job.count}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
        output.innerHTML = tableHtml;
    }

    async sickDayReport() {
        const isAdmin = localStorage.getItem('calendarAdmin') === 'true';
        const output = document.getElementById('report-output');

        if (!isAdmin) {
            output.innerHTML = `
                <div class="report-placeholder">
                    <i class="fas fa-lock"></i>
                    <p>Access Denied</p>
                    <p style="font-size: 1rem; color: var(--text-secondary);">You must be logged in as a Calendar Admin to view this report.</p>
                </div>`;
            document.getElementById('report-filters').innerHTML = ''; // Clear filters
            return;
        }

        this._renderFilters(['dateRange']);
        const startDate = document.getElementById('reportStartDate')?.value;
        const endDate = document.getElementById('reportEndDate')?.value;
        
        if (!startDate || !endDate) {
             output.innerHTML = `<h2 class="report-title">Sick Day Report</h2><p>Please select a start and end date and run the report.</p>`;
             return;
        }

        output.innerHTML = `<div class="loading"><i class="fas fa-spinner fa-spin"></i> Generating sick day report...</div>`;
        
        try {
            const schedules = await this.app.firebaseService.getSchedulesForDateRange(startDate, endDate);
            const sickDaysByEmployee = {};
            const allStaff = this.app.teamManager.getAllTechnicians();
            const staffMap = new Map(allStaff.map(s => [s.id, s.name]));

            schedules.forEach(schedule => {
                const date = schedule.date.toDate().toLocaleDateString();
                (schedule.staff || []).forEach(staffEntry => {
                    if (staffEntry.status === 'sick') {
                        const employeeName = staffMap.get(staffEntry.id) || `Unknown (${staffEntry.id})`;
                        if (!sickDaysByEmployee[employeeName]) {
                            sickDaysByEmployee[employeeName] = [];
                        }
                        sickDaysByEmployee[employeeName].push(date);
                    }
                });
            });

            let tableHtml = `<h2 class="report-title">Sick Day Report (${startDate} to ${endDate})</h2>`;

            if (Object.keys(sickDaysByEmployee).length === 0) {
                tableHtml += '<p>No sick days were recorded in the selected date range.</p>';
            } else {
                tableHtml += `
                    <div class="table-container">
                        <table class="data-table">
                            <thead><tr><th>Employee</th><th>Total Days</th><th>Sick Dates</th></tr></thead>
                            <tbody>
                                ${Object.entries(sickDaysByEmployee).sort((a,b) => a[0].localeCompare(b[0])).map(([name, dates]) => `
                                    <tr>
                                        <td>${name}</td>
                                        <td>${dates.length}</td>
                                        <td>${dates.join(', ')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            }
            output.innerHTML = tableHtml;

        } catch (error) {
            console.error("Error generating sick day report:", error);
            output.innerHTML = `<p class="text-danger">An error occurred while generating the report.</p>`;
        }
    }
    jobHotspot() {
        this._renderFilters(['dateRange']);
        const filteredData = this._getFilteredData();
        const output = document.getElementById('report-output');
    
        this.zipCodeJobs = {};
        this.selectedZipCodes = [];
    
        (filteredData || []).forEach(day => {
            (day.jobsData || []).forEach(job => {
                if (job.address && job.id && job.id !== 'N/A') {
                    const zipMatch = job.address.match(/(\d{5})$/);
                    if (zipMatch) {
                        const zip = zipMatch[1];
                        if (!this.zipCodeJobs[zip]) {
                            this.zipCodeJobs[zip] = new Set();
                        }
                        this.zipCodeJobs[zip].add(job.id);
                    }
                }
            });
        });
    
        const allUniqueJobs = new Set();
        for (const zip in this.zipCodeJobs) {
            this.zipCodeJobs[zip].forEach(jobId => {
                allUniqueJobs.add(jobId);
            });
        }
        this.totalJobsInReport = allUniqueJobs.size;
    
        const zipCodeCounts = {};
        for (const zip in this.zipCodeJobs) {
            zipCodeCounts[zip] = this.zipCodeJobs[zip].size;
        }
    
        const sortedZipCodes = Object.entries(zipCodeCounts)
            .sort(([, countA], [, countB]) => countB - countA)
            .slice(0, 10);
    
        let contentHtml = `<h2 class="report-title">Job Hotspot Report</h2>
            <div class="hotspot-container">
                <div id="hotspot-map-container" style="position: relative; background-color: #f0f2f5;">
                    <div id="map-loading-overlay" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255,255,255,0.9); z-index: 10; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;">
                        <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary-color); margin-bottom: 1rem;"></i>
                        <p style="font-weight: 500; margin-bottom: 0.5rem;">Processing map data...</p>
                        <div id="map-progress-bar-container" style="width: 80%; max-width: 300px; height: 20px; background: #e0e0e0; border-radius: 10px; overflow: hidden;">
                            <div id="map-progress-bar" style="width: 0%; height: 100%; background: var(--primary-color); transition: width 0.2s ease;"></div>
                        </div>
                        <p id="map-progress-text" style="margin-top: 0.5rem; font-size: 0.9rem; color: var(--text-secondary);">0%</p>
                    </div>
                </div>
                <div class="hotspot-list">
                    <h4>Top 10 Zip Codes</h4>
        `;
    
        if (sortedZipCodes.length > 0) {
            contentHtml += `
                <div class="table-container">
                    <table class="data-table">
                        <thead><tr><th>Zip Code</th><th>Job Count</th></tr></thead>
                        <tbody>
                            ${sortedZipCodes.map(([zip, count]) => `
                                <tr><td>${zip}</td><td>${count}</td></tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>`;
        } else {
            contentHtml += "<p>No job data with valid zip codes found in this date range.</p>";
        }
    
        contentHtml += `<div id="zip-percentage-display" style="margin-top: 1rem; padding: 1rem; background-color: #f8f9fa; border-radius: 8px; text-align: center;">
                            <p style="margin: 0; font-weight: bold;">Click on the map to select zip codes and see the percentage of jobs.</p>
                        </div>
                        <div class="report-actions" style="margin-top: 1rem;">
                            <button id="print-hotspot-report-btn" class="btn btn-primary"><i class="fas fa-print"></i> Print Report</button>
                        </div>
                    </div>
                </div>`;
        output.innerHTML = contentHtml;
    
        if (typeof mapboxgl !== 'undefined') {
            this.renderHotspotMap(zipCodeCounts);
        } else {
            document.getElementById('map-loading-overlay').innerHTML = '<p class="text-danger">Map library could not be loaded.</p>';
        }
    }
    
    updateZipCodePercentage() {
        const display = document.getElementById('zip-percentage-display');
        if (this.selectedZipCodes.length === 0) {
            display.innerHTML = `<p style="margin: 0; font-weight: bold;">Click on the map to select zip codes and see the percentage of jobs.</p>`;
            return;
        }
    
        let selectedJobsCount = 0;
        this.selectedZipCodes.forEach(zip => {
            if (this.zipCodeJobs[zip]) {
                selectedJobsCount += this.zipCodeJobs[zip].size;
            }
        });
    
        const percentage = this.totalJobsInReport > 0 ? (selectedJobsCount / this.totalJobsInReport) * 100 : 0;
    
        display.innerHTML = `
            <p style="margin: 0; font-weight: bold;">Selected Zip Codes:</p>
            <p style="margin: 0.5rem 0;">${this.selectedZipCodes.join(', ')}</p>
            <p style="margin: 0; font-weight: bold;">Jobs in selected areas: ${selectedJobsCount}</p>
            <p style="margin: 0.5rem 0; font-size: 1.2rem; color: var(--primary-color);">${percentage.toFixed(2)}% of total jobs</p>
        `;
    }
    
    renderHotspotMap(zipCodeCounts) {
        mapboxgl.accessToken = 'pk.eyJ1IjoiamJyYW5ub245NzIiLCJhIjoiY204NXN2Z2w2Mms4ODJrb2tvemV2ZnlicyJ9.84JYhRSUAF5_-vvdebw-TA';
    
        const mapContainer = document.getElementById('hotspot-map-container');
        const loadingOverlay = document.getElementById('map-loading-overlay');
        const progressBar = document.getElementById('map-progress-bar');
        const progressText = document.getElementById('map-progress-text');
    
        if (!mapboxgl.supported()) {
            loadingOverlay.innerHTML = '<p class="text-danger">Your browser does not support Mapbox GL.</p>';
            return;
        }
    
        this.map = new mapboxgl.Map({
            container: mapContainer,
            style: 'mapbox://styles/mapbox/light-v10',
            center: [-95.36, 29.76],
            zoom: 8.5,
            preserveDrawingBuffer: true
        });
    
        const map = this.map;
    
        map.on('load', () => {
            map.addSource('houston-zips', {
                type: 'geojson',
                data: 'https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/tx_texas_zip_codes_geo.min.json',
                promoteId: 'ZCTA5CE10'
            });
    
            map.addLayer({
                id: 'zips-fill',
                type: 'fill',
                source: 'houston-zips',
                paint: {
                    'fill-color': [
                        'case',
                        ['boolean', ['feature-state', 'selected'], false], '#f87b4d', 
                        [
                            'interpolate', ['linear'], ['coalesce', ['feature-state', 'jobCount'], 0],
                            0, 'transparent', 1, '#ffffcc', 5, '#fed976', 10, '#feb24c', 20, '#fd8d3c', 40, '#fc4e2a', 60, '#e31a1c', 100, '#800026'
                        ]
                    ],
                    'fill-opacity': [
                        'case',
                        ['boolean', ['feature-state', 'selected'], false], 0.7,
                        ['boolean', ['feature-state', 'hover'], false], 0.9,
                        ['==', ['coalesce', ['feature-state', 'jobCount'], 0], 0], 0.0,
                        0.75
                    ],
                    'fill-outline-color': [
                        'case',
                        ['boolean', ['feature-state', 'hover'], false], '#000',
                        '#a4a4a5'
                    ]
                }
            });
    
            const processSourceData = (e) => {
                if (e.sourceId === 'houston-zips' && e.isSourceLoaded) {
                    const zipsWithJobs = Object.keys(zipCodeCounts);
                    const totalZipsToProcess = zipsWithJobs.length;
                    let processedCount = 0;
    
                    const processChunk = () => {
                        const chunkSize = 50; 
                        const chunk = zipsWithJobs.slice(processedCount, processedCount + chunkSize);
                        
                        chunk.forEach(zip => {
                            map.setFeatureState({ source: 'houston-zips', id: zip }, { jobCount: zipCodeCounts[zip] });
                        });
    
                        processedCount += chunk.length;
                        const percentage = totalZipsToProcess > 0 ? Math.round((processedCount / totalZipsToProcess) * 100) : 100;
                        progressBar.style.width = `${percentage}%`;
                        progressText.textContent = `${percentage}%`;
    
                        if (processedCount < totalZipsToProcess) {
                            requestAnimationFrame(processChunk);
                        } else {
                             setTimeout(() => {
                                loadingOverlay.style.opacity = '0';
                                setTimeout(() => loadingOverlay.style.display = 'none', 300);
                            }, 250);
                        }
                    };
                    
                    requestAnimationFrame(processChunk);
                    map.off('sourcedata', processSourceData);
                }
            };
            
            map.on('sourcedata', processSourceData);
    
            let hoveredZipId = null;
            const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });
    
            map.on('mousemove', 'zips-fill', (e) => {
                map.getCanvas().style.cursor = 'pointer';
                if (e.features.length > 0) {
                    const currentZipId = e.features[0].id;
                    if (hoveredZipId !== currentZipId) {
                        if (hoveredZipId !== null) map.setFeatureState({ source: 'houston-zips', id: hoveredZipId }, { hover: false });
                        hoveredZipId = currentZipId;
                        map.setFeatureState({ source: 'houston-zips', id: hoveredZipId }, { hover: true });
                    }
                    const count = zipCodeCounts[hoveredZipId] || 0;
                    popup.setLngLat(e.lngLat).setHTML(`<strong>Zip: ${hoveredZipId}</strong><br>${count} Jobs`).addTo(map);
                }
            });
    
            map.on('mouseleave', 'zips-fill', () => {
                map.getCanvas().style.cursor = '';
                if (hoveredZipId !== null) map.setFeatureState({ source: 'houston-zips', id: hoveredZipId }, { hover: false });
                hoveredZipId = null;
                popup.remove();
            });
    
            map.on('click', 'zips-fill', (e) => {
                if (e.features.length > 0) {
                    const clickedZipId = e.features[0].id.toString();
                    const index = this.selectedZipCodes.indexOf(clickedZipId);
    
                    if (index > -1) {
                        this.selectedZipCodes.splice(index, 1);
                        map.setFeatureState({ source: 'houston-zips', id: clickedZipId }, { selected: false });
                    } else {
                        this.selectedZipCodes.push(clickedZipId);
                        map.setFeatureState({ source: 'houston-zips', id: clickedZipId }, { selected: true });
                    }
                    this.updateZipCodePercentage();
                }
            });
        });
    }

    async officeLocationAnalysis() {
        this._renderFilters([]); // No filters needed for this report
        const output = document.getElementById('report-output');
        output.innerHTML = `<div class="loading"><i class="fas fa-spinner fa-spin"></i> Analyzing all historical job locations... This may take several moments.</div>`;
    
        try {
            const allJobLocations = await this.app.analyzerManager.getAllJobLocations();
            if (allJobLocations.length === 0) {
                output.innerHTML = `<h2 class="report-title">Office Location Analysis</h2><p>No job locations with addresses could be found in the database.</p>`;
                return;
            }
    
            const katyOfficeCoords = [-95.8233, 29.7858]; // Lon, Lat for Katy office
            const conroeOfficeCoords = [-95.4533, 30.2238]; // Lon, Lat for Conroe office
            const accessToken = 'pk.eyJ1IjoiamJyYW5ub245NzIiLCJhIjoiY204NXN2Z2w2Mms4ODJrb2tvemV2ZnlicyJ9.84JYhRSUAF5_-vvdebw-TA';
    
            output.innerHTML = `
                <h2 class="report-title">Office Location Analysis</h2>
                <div id="office-analysis-progress">
                    <p>Analyzing job locations... <span id="progress-text">0 / ${allJobLocations.length}</span></p>
                    <div class="progress-bar-container"><div id="progress-bar" class="progress-bar" style="width: 0%;"></div></div>
                </div>
                <div id="analysis-results" style="display: none;"></div>
            `;
            const progressBar = document.getElementById('progress-bar');
            const progressText = document.getElementById('progress-text');
    
            const remoteJobs = [];
            let totalJobsAnalyzed = 0;
    
            for (const job of allJobLocations) {
                try {
                    // Simple straight-line distance calculation (Haversine formula)
                    const R = 6371; // Radius of the Earth in km
                    const dLatKaty = (katyOfficeCoords[1] - job.coords[1]) * Math.PI / 180;
                    const dLonKaty = (katyOfficeCoords[0] - job.coords[0]) * Math.PI / 180;
                    const aKaty = Math.sin(dLatKaty / 2) * Math.sin(dLatKaty / 2) +
                                Math.cos(job.coords[1] * Math.PI / 180) * Math.cos(katyOfficeCoords[1] * Math.PI / 180) *
                                Math.sin(dLonKaty / 2) * Math.sin(dLonKaty / 2);
                    const cKaty = 2 * Math.atan2(Math.sqrt(aKaty), Math.sqrt(1 - aKaty));
                    const distanceToKaty = R * cKaty * 0.621371; // Convert to miles

                    const dLatConroe = (conroeOfficeCoords[1] - job.coords[1]) * Math.PI / 180;
                    const dLonConroe = (conroeOfficeCoords[0] - job.coords[0]) * Math.PI / 180;
                    const aConroe = Math.sin(dLatConroe / 2) * Math.sin(dLatConroe / 2) +
                                  Math.cos(job.coords[1] * Math.PI / 180) * Math.cos(conroeOfficeCoords[1] * Math.PI / 180) *
                                  Math.sin(dLonConroe / 2) * Math.sin(dLonConroe / 2);
                    const cConroe = 2 * Math.atan2(Math.sqrt(aConroe), Math.sqrt(1 - aConroe));
                    const distanceToConroe = R * cConroe * 0.621371; // Convert to miles
    
                    if (distanceToKaty > 30 && distanceToConroe > 30) { // Using 30 miles as the threshold
                        remoteJobs.push(job);
                    }
    
                } catch (error) {
                    console.warn(`Could not process address: ${job.address}`, error);
                }
    
                totalJobsAnalyzed++;
                const progressPercentage = (totalJobsAnalyzed / allJobLocations.length) * 100;
                progressBar.style.width = `${progressPercentage}%`;
                progressText.textContent = `${totalJobsAnalyzed} / ${allJobLocations.length}`;
            }
    
            let centerLat = 0, centerLon = 0;
            if (remoteJobs.length > 0) {
                centerLat = remoteJobs.reduce((sum, job) => sum + job.coords[1], 0) / remoteJobs.length;
                centerLon = remoteJobs.reduce((sum, job) => sum + job.coords[0], 0) / remoteJobs.length;
            }
    
            const percentage = allJobLocations.length > 0 ? ((remoteJobs.length / allJobLocations.length) * 100).toFixed(2) : 0;
    
            document.getElementById('office-analysis-progress').style.display = 'none';
            const resultsContainer = document.getElementById('analysis-results');
            resultsContainer.style.display = 'block';
    
            resultsContainer.innerHTML = `
                <div class="dashboard-grid">
                     <div class="metric-card">
                        <div class="metric-header"><h3>Remote Jobs</h3></div>
                        <div class="metric-content">
                            <div class="big-number">${remoteJobs.length}</div>
                            <div class="metric-description">Jobs >30 miles from both offices</div>
                        </div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-header"><h3>Percentage of Total</h3></div>
                        <div class="metric-content">
                            <div class="big-number">${percentage}%</div>
                            <div class="metric-description">of all jobs analyzed</div>
                        </div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-header"><h3>Suggested New Office Center</h3></div>
                        <div class="metric-content">
                            <div class="big-number" style="font-size: 1.8rem;">${centerLat.toFixed(4)}, ${centerLon.toFixed(4)}</div>
                            <div class="metric-description"><a href="https://www.google.com/maps/search/?api=1&query=${centerLat},${centerLon}" target="_blank">View on Google Maps</a></div>
                        </div>
                    </div>
                </div>
            `;
    
        } catch (error) {
            console.error('Error in office location analysis:', error);
            output.innerHTML = `<p class="text-danger">An error occurred during analysis: ${error.message}</p>`;
        }
    }
    
    // --- (The rest of your report functions remain below) ---

    subContractorFinancialSummary() {
        this._renderFilters(['dateRange']);
        const filteredData = this._getFilteredData();
        const output = document.getElementById('report-output');

        const subsData = {};

        filteredData.forEach(day => {
            (day.subContractorJobs || []).forEach(job => {
                if (!subsData[job.crew]) {
                    subsData[job.crew] = { jobs: 0, totalPaid: 0 };
                }
                subsData[job.crew].jobs++;
                subsData[job.crew].totalPaid += job.price;
            });
        });

        let tableHtml = `<h2 class="report-title">Sub-Contractor Financial Summary</h2>`;
        if (Object.keys(subsData).length === 0) {
            tableHtml += '<p>No sub-contractor data found for the selected date range.</p>';
        } else {
            tableHtml += `
                <div class="table-container">
                    <table class="data-table">
                        <thead><tr><th>Sub-Contractor</th><th>Total Jobs</th><th>Total Paid</th><th>Avg. Cost per Job</th></tr></thead>
                        <tbody>
                            ${Object.entries(subsData).map(([crew, data]) => `
                                <tr>
                                    <td>${crew}</td>
                                    <td>${data.jobs}</td>
                                    <td>${this.app.fleetManager.formatCurrency(data.totalPaid)}</td>
                                    <td>${this.app.fleetManager.formatCurrency(data.totalPaid / data.jobs)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
        output.innerHTML = tableHtml;
    }

    specialServicesSpending() {
        this._renderFilters(['dateRange']);
        const filteredData = this._getFilteredData();
        const output = document.getElementById('report-output');
        
        const servicesData = {};
        filteredData.forEach(day => {
            (day.subContractorJobs || []).forEach(job => {
                if (job.specialService && job.specialService !== 'None') {
                    servicesData[job.specialService] = (servicesData[job.specialService] || 0) + job.price;
                }
            });
        });

        let contentHtml = `<h2 class="report-title">Special Services Spending Report</h2>`;
        if (Object.keys(servicesData).length === 0) {
            contentHtml += '<p>No special service spending found for the selected date range.</p>';
        } else {
            contentHtml += `
                <div class="table-container">
                     <table class="data-table">
                        <thead><tr><th>Service Type</th><th>Total Spending</th></tr></thead>
                        <tbody>
                            ${Object.entries(servicesData).map(([service, total]) => `
                                <tr><td>${service}</td><td>${this.app.fleetManager.formatCurrency(total)}</td></tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
        output.innerHTML = contentHtml;
    }
    
    subContractorEfficiency() {
        this._renderFilters(['dateRange']);
        const filteredData = this._getFilteredData();
        const output = document.getElementById('report-output');

        const subsData = {};
        filteredData.forEach(day => {
            (day.subContractorJobs || []).forEach(job => {
                if (job.specialService === 'None' && job.demoHours > 0) {
                    if (!subsData[job.crew]) {
                        subsData[job.crew] = { totalHours: 0, totalPaid: 0 };
                    }
                    subsData[job.crew].totalHours += job.demoHours;
                    subsData[job.crew].totalPaid += job.price;
                }
            });
        });

        let tableHtml = `<h2 class="report-title">Sub-Contractor Efficiency Report</h2>`;
        if (Object.keys(subsData).length === 0) {
            tableHtml += '<p>No relevant sub-contractor demo jobs found for efficiency calculation.</p>';
        } else {
            tableHtml += `
                <div class="table-container">
                    <table class="data-table">
                        <thead><tr><th>Sub-Contractor</th><th>Total Demo Hours</th><th>Total Paid</th><th>Effective Cost per Hour</th></tr></thead>
                        <tbody>
                            ${Object.entries(subsData).map(([crew, data]) => `
                                <tr>
                                    <td>${crew}</td>
                                    <td>${data.totalHours.toFixed(2)}</td>
                                    <td>${this.app.fleetManager.formatCurrency(data.totalPaid)}</td>
                                    <td>${data.totalHours > 0 ? this.app.fleetManager.formatCurrency(data.totalPaid / data.totalHours) : 'N/A'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
        output.innerHTML = tableHtml;
    }

    zoneWorkloadDistribution() {
        this._renderFilters(['dateRange']);
        const filteredData = this._getFilteredData();
        const output = document.getElementById('report-output');

        const zoneData = {};
        filteredData.forEach(day => {
            Object.entries(day.zoneCounts || {}).forEach(([zone, data]) => {
                if (!zoneData[zone]) {
                    zoneData[zone] = { totalJobs: 0, totalTechHours: 0, dtJobs: 0 };
                }
                zoneData[zone].totalJobs += data.jobs;
                zoneData[zone].totalTechHours += data.hours;
            });
            zoneData['Z_Overall'] = (zoneData['Z_Overall'] || { totalJobs: 0, totalTechHours: 0, dtJobs: 0 });
            zoneData['Z_Overall'].dtJobs += day.dtTrueCount;

        });

        let tableHtml = `<h2 class="report-title">Zone Workload Distribution</h2>
            <div class="table-container">
                <table class="data-table">
                    <thead><tr><th>Zone</th><th>Total Jobs</th><th>Total Tech Hours</th></tr></thead>
                    <tbody>
                        ${Object.entries(zoneData).filter(([key]) => key !== 'Z_Overall').sort().map(([zone, data]) => `
                            <tr>
                                <td>${zone}</td>
                                <td>${data.totalJobs}</td>
                                <td>${data.totalTechHours.toFixed(2)}</td>
                            </tr>
                        `).join('')}
                         <tr>
                            <td><strong>Total DT Jobs (All Zones)</strong></td>
                            <td colspan="2">${zoneData['Z_Overall'] ? zoneData['Z_Overall'].dtJobs : 0}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
        output.innerHTML = tableHtml;
    }

    dailyJobLoad() {
        this._renderFilters(['dateRange']);
        const filteredData = this._getFilteredData();
        const output = document.getElementById('report-output');

        const dayData = { Monday: {c:0,t:0}, Tuesday: {c:0,t:0}, Wednesday: {c:0,t:0}, Thursday: {c:0,t:0}, Friday: {c:0,t:0}, Saturday: {c:0,t:0}, Sunday: {c:0,t:0} };
        filteredData.forEach(day => {
            if (day.dayOfWeek && dayData[day.dayOfWeek]) {
                dayData[day.dayOfWeek].c++;
                dayData[day.dayOfWeek].t += day.totalJobs;
            }
        });
        
        const labels = Object.keys(dayData);
        const avgData = labels.map(day => dayData[day].c > 0 ? (dayData[day].t / dayData[day].c) : 0);

        output.innerHTML = `<h2 class="report-title">Daily Job Load & Trend</h2><div class="chart-container" style="height: 400px;"><canvas id="dailyJobLoadChart"></canvas></div>`;
        
        if(this.chartInstance) this.chartInstance.destroy();
        this.chartInstance = new Chart(document.getElementById('dailyJobLoadChart'), {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: 'Average Jobs per Day', data: avgData, backgroundColor: 'rgba(248, 123, 77, 0.7)' }]
            },
            options: { scales: { y: { beginAtZero: true, title: { display: true, text: 'Avg. Number of Jobs' } } } }
        });
    }

    subContractorJobDetails() {
         this._renderFilters(['dateRange']);
        const filteredData = this._getFilteredData();
        const output = document.getElementById('report-output');
        
        const allSubJobs = [];
        filteredData.forEach(day => {
            (day.subContractorJobs || []).forEach(job => {
                allSubJobs.push({ date: day.date, ...job });
            });
        });
        
        allSubJobs.sort((a,b) => b.date.localeCompare(a.date));

        let tableHtml = `<h2 class="report-title">Sub-Contractor Job Details</h2>`;
        if (allSubJobs.length === 0) {
            tableHtml += '<p>No sub-contractor jobs found for this period.</p>';
        } else {
            tableHtml += `
                <div class="table-container">
                    <table class="data-table">
                        <thead><tr><th>Date</th><th>Crew</th><th>Job Name</th><th>Price</th><th>Demo Hours</th><th>Service</th></tr></thead>
                        <tbody>
                            ${allSubJobs.map(job => `
                                <tr>
                                    <td>${job.date}</td>
                                    <td>${job.crew}</td>
                                    <td>${job.jobName}</td>
                                    <td>${this.app.fleetManager.formatCurrency(job.price)}</td>
                                    <td>${job.demoHours || 0}</td>
                                    <td>${job.specialService || 'N/A'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
        output.innerHTML = tableHtml;
    }

    techHourDistribution() {
         this._renderFilters(['dateRange']);
        const filteredData = this._getFilteredData();
        const output = document.getElementById('report-output');
        
        const jobTypeHours = {};
        let totalHours = 0;

        filteredData.forEach(day => {
            Object.entries(day.jobTypeTechHours || {}).forEach(([type, hours]) => {
                jobTypeHours[type] = (jobTypeHours[type] || 0) + hours;
                totalHours += hours;
            });
        });

        const labels = Object.keys(jobTypeHours);
        const data = Object.values(jobTypeHours);

        output.innerHTML = `<h2 class="report-title">Tech Hour Distribution by Job Type</h2><div class="chart-container" style="height: 400px; max-width: 500px; margin: auto;"><canvas id="techHourChart"></canvas></div>`;
        
        if(this.chartInstance) this.chartInstance.destroy();
        this.chartInstance = new Chart(document.getElementById('techHourChart'), {
            type: 'pie',
            data: { labels, datasets: [{ label: 'Tech Hours', data, backgroundColor: ['#f87b4d', '#a4a4a5', '#10b981', '#3b82f6', '#f59e0b'] }] },
            options: { plugins: { legend: { position: 'bottom' } } }
        });
    }

    monthlyPerformance() {
         this._renderFilters(['year']);
        const year = document.getElementById('reportYear')?.value || new Date().getFullYear();
        const output = document.getElementById('report-output');
        
        const monthlyData = Array(12).fill(0).map(() => ({ totalJobs: 0, totalTechHours: 0, subSpending: 0 }));
        this.allTimeStatsCache.dailyStats.forEach(day => {
            const date = new Date(day.date + 'T12:00:00Z');
            if (date.getFullYear() == year) {
                const month = date.getMonth();
                monthlyData[month].totalJobs += day.totalJobs;
                monthlyData[month].totalTechHours += day.totalTechHours;
                monthlyData[month].subSpending += (day.subContractorJobs || []).reduce((acc, job) => acc + job.price, 0);
            }
        });

        const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        output.innerHTML = `<h2 class="report-title">${year} Monthly Performance Dashboard</h2><div class="chart-container" style="height: 400px;"><canvas id="monthlyPerfChart"></canvas></div>`;

        if(this.chartInstance) this.chartInstance.destroy();
        this.chartInstance = new Chart(document.getElementById('monthlyPerfChart'), {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Total Jobs', data: monthlyData.map(m => m.totalJobs), yAxisID: 'yJobs', backgroundColor: '#f87b4d' },
                    { label: 'Sub Spending', data: monthlyData.map(m => m.subSpending), yAxisID: 'yMoney', type: 'line', borderColor: '#10b981', tension: 0.2 }
                ]
            },
            options: { scales: { yJobs: { position: 'left', title: {display: true, text: 'Total Jobs'} }, yMoney: { position: 'right', title: {display: true, text: 'Sub Spending ($)'} } } }
        });
    }

    weekdayVsWeekend() {
         this._renderFilters(['dateRange']);
        const filteredData = this._getFilteredData();
        const output = document.getElementById('report-output');
        
        const analysis = { weekday: { jobs: 0, jobTypes: {} }, weekend: { jobs: 0, jobTypes: {} }};
        
        filteredData.forEach(day => {
            const date = new Date(day.date + 'T12:00:00Z');
            const dayIndex = date.getDay();
            const category = (dayIndex === 0 || dayIndex === 6) ? 'weekend' : 'weekday';
            
            analysis[category].jobs += day.totalJobs;
            Object.entries(day.jobTypeCounts || {}).forEach(([type, count]) => {
                analysis[category].jobTypes[type] = (analysis[category].jobTypes[type] || 0) + count;
            });
        });

        const renderTable = (title, data) => `
            <h4>${title}</h4>
            <p><strong>Total Jobs:</strong> ${data.jobs}</p>
            <ul>
                ${Object.entries(data.jobTypes).map(([type, count]) => `<li><strong>${type}:</strong> ${count} jobs</li>`).join('')}
            </ul>
        `;
        
        output.innerHTML = `<h2 class="report-title">Weekday vs. Weekend Analysis</h2>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
                <div>${renderTable('Weekdays (Mon-Fri)', analysis.weekday)}</div>
                <div>${renderTable('Weekends (Sat-Sun)', analysis.weekend)}</div>
            </div>`;
    }

    subContractorUsageTrend() {
         this._renderFilters(['year']);
        const year = document.getElementById('reportYear')?.value || new Date().getFullYear();
        const output = document.getElementById('report-output');
        
        const monthlyData = Array(12).fill(0);
        this.allTimeStatsCache.dailyStats.forEach(day => {
            const date = new Date(day.date + 'T12:00:00Z');
            if (date.getFullYear() == year && day.subContractorJobs) {
                const month = date.getMonth();
                monthlyData[month] += day.subContractorJobs.length;
            }
        });

        const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        output.innerHTML = `<h2 class="report-title">${year} Sub-Contractor Usage Trend</h2><div class="chart-container" style="height: 400px;"><canvas id="subUsageChart"></canvas></div>`;

        if(this.chartInstance) this.chartInstance.destroy();
        this.chartInstance = new Chart(document.getElementById('subUsageChart'), {
            type: 'line',
            data: { labels, datasets: [{ label: '# of Jobs Subbed Out', data: monthlyData, borderColor: '#f87b4d', tension: 0.2, fill: true }] },
            options: { scales: { y: { beginAtZero: true, title: {display: true, text: 'Number of Jobs'} } } }
        });
    }
    
    async secondShiftReport() {
        this._renderFilters(['dateRange']);
        const startDate = document.getElementById('reportStartDate')?.value;
        const endDate = document.getElementById('reportEndDate')?.value;
        const output = document.getElementById('report-output');
    
        if (!startDate || !endDate) {
            output.innerHTML = `<h2 class="report-title">Second Shift Reports</h2><p>Please select a start and end date.</p>`;
            return;
        }
    
        const reports = await this.app.firebaseService.getSecondShiftReportsByDateRange(startDate, endDate);
    
        let contentHtml = `<h2 class="report-title">Second Shift Reports (${startDate} to ${endDate})</h2>`;
    
        if (reports.length === 0) {
            contentHtml += '<p>No reports found in the selected date range.</p>';
        } else {
            contentHtml += reports.map(report => {
                // FIX: Check if the properties are arrays before using .map()
                const nuancesHtml = Array.isArray(report.nuances) ? report.nuances.map(j => `<li><strong>${j.jobName}:</strong> ${j.notes}</li>`).join('') : '';
                const cancelledHtml = Array.isArray(report.cancelledJobs) ? report.cancelledJobs.map(j => `<li><strong>${j.jobName}:</strong> ${j.notes}</li>`).join('') : '';
                const afterHoursHtml = Array.isArray(report.afterHoursJobs) ? report.afterHoursJobs.map(j => `<li><strong>${j.jobName}:</strong> ${j.reason} <em>(Who: ${j.who})</em></li>`).join('') : '';
    
                return `
                    <div class="card second-shift-summary" style="margin-bottom: 1.5rem;">
                        <div class="card-header">
                            <h3><i class="fas fa-moon"></i> Report for ${report.date}</h3>
                            <span>By: ${report.submittedBy}</span>
                        </div>
                        <div class="summary-grid">
                           <div><h4>Jobs to Know About</h4><ul>${nuancesHtml || '<li>None</li>'}</ul></div>
                            <div><h4>Cancelled/Rescheduled</h4><ul>${cancelledHtml || '<li>None</li>'}</ul></div>
                            <div><h4>After Hours Jobs</h4><ul>${afterHoursHtml || '<li>None</li>'}</ul></div>
                            <div><h4>Tech Shoutouts</h4><p>${report.techShoutouts || 'None'}</p></div>
                            <div><h4>Tech Concerns</h4><p>${report.techConcerns || 'None'}</p></div>
                            <div><h4>Dept. Shoutouts</h4><p>${report.deptShoutouts || 'None'}</p></div>
                            <div><h4>Dept. Concerns</h4><p>${report.deptConcerns || 'None'}</p></div>
                        </div>
                    </div>`;
            }).join('');
        }
        output.innerHTML = contentHtml;
    }

    async secondShiftInstallReport() {
        const output = document.getElementById('report-output');
        this._renderFilters(['dateRange']);
        const startDate = document.getElementById('reportStartDate')?.value;
        const endDate = document.getElementById('reportEndDate')?.value;

        if (!startDate || !endDate) {
            output.innerHTML = `<h2 class="report-title">Second Shift Install Report</h2><p>Please select a start and end date and run the report.</p>`;
            return;
        }

        output.innerHTML = `<div class="loading"><i class="fas fa-spinner fa-spin"></i> Generating Second Shift Install Report...</div>`;

        try {
            const installs = await this.app.firebaseService.getSecondShiftInstallsByDateRange(startDate, endDate);
            
            const jobHistorySnapshot = await this.app.firebaseService.db.collection('analyzer_job_history').get();
            const jobHistoryMap = new Map();
            jobHistorySnapshot.forEach(doc => {
                jobHistoryMap.set(doc.id, doc.data().name || 'Unknown Name');
            });


            let tableHtml = `<h2 class="report-title">Second Shift Install Report (${startDate} to ${endDate})</h2>`;

            if (installs.length === 0) {
                tableHtml += '<p>No second shift installs were recorded in the selected date range.</p>';
            } else {
                tableHtml += `
                    <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Install Date</th>
                                    <th>Job Name</th>
                                    <th>Demo Type</th>
                                    <th>Duration</th>
                                    <th>Two Man?</th>
                                    <th>Installer Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${installs.map(install => `
                                    <tr>
                                        <td>${install.installedDate}</td>
                                        <td>${jobHistoryMap.get(install.id) || install.id}</td>
                                        <td>${install.demoType || 'N/A'}</td>
                                        <td>${install.duration || 0} hrs</td>
                                        <td>${install.isTwoMan ? 'Yes' : 'No'}</td>
                                        <td>${install.installerNotes || ''}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            }
            output.innerHTML = tableHtml;

        } catch (error) {
            console.error("Error generating Second Shift Install report:", error);
            output.innerHTML = `<p class="text-danger">An error occurred while generating the report.</p>`;
        }
    }
    async printHotspotReport() {
        if (!this.map || this.selectedZipCodes.length === 0) {
            alert("Please select at least one zip code on the map to print a report.");
            return;
        }
    
        // Wait for the map to be fully idle before capturing the image
        this.map.once('idle', () => {
            const mapImage = this.map.getCanvas().toDataURL();
    
            const startDate = document.getElementById('reportStartDate')?.value;
            const endDate = document.getElementById('reportEndDate')?.value;
            const dateRange = `${startDate} to ${endDate}`;
    
            let selectedJobsCount = 0;
            this.selectedZipCodes.forEach(zip => {
                if (this.zipCodeJobs[zip]) {
                    selectedJobsCount += this.zipCodeJobs[zip].size;
                }
            });
            const percentage = this.totalJobsInReport > 0 ? (selectedJobsCount / this.totalJobsInReport) * 100 : 0;
    
            const printableReport = document.createElement('div');
            printableReport.id = 'printable-report';
            printableReport.innerHTML = `
                <div class="report-container">
                    <div class="report-header">
                        <h1>Job Hotspot Report</h1>
                        <p><strong>Date Range:</strong> ${dateRange}</p>
                    </div>
                    <div class="print-content">
                        <div class="map-container">
                            <img src="${mapImage}" alt="Map of selected zip codes" style="width: 100%; max-width: 600px; border: 1px solid #ccc; border-radius: 8px;" />
                        </div>
                        <div class="data-container">
                            <h2>Selected Zip Codes</h2>
                            <p>${this.selectedZipCodes.join(', ')}</p>
                            <h2>Summary</h2>
                            <p><strong>Jobs in selected areas:</strong> ${selectedJobsCount}</p>
                            <p><strong>Percentage of total jobs:</strong> ${percentage.toFixed(2)}%</p>
                        </div>
                    </div>
                </div>
            `;
    
            document.body.appendChild(printableReport);
            
            // A small delay to ensure the image is in the DOM before printing
            setTimeout(() => {
                window.print();
                document.body.removeChild(printableReport);
            }, 500);
        });
    
        // If the map is already idle, the event won't fire, so we trigger a repaint
        this.map.triggerRepaint();
    }
}