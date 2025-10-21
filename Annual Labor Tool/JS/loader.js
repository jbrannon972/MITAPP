document.addEventListener('DOMContentLoaded', async () => {
    // Hide the application to prevent flashing while scripts load
    const appContainer = document.querySelector('.app-container');
    if (appContainer) {
        appContainer.classList.add('nav-loading');
    }

    // Utility function to dynamically load a script and wait for it to be ready
    const loadScript = (src) => {
        return new Promise((resolve, reject) => {
            // Check if a script with the same src already exists to avoid duplicates
            if (document.querySelector(`script[src="${src}"]`)) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.async = false; // Load scripts sequentially
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
            document.head.appendChild(script);
        });
    };
    
    // Utility function to load the nav.html component
    const loadComponent = async (url, placeholderId) => {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Could not fetch ${url}`);
            const html = await response.text();
            const placeholder = document.getElementById(placeholderId);
            if (placeholder) {
                placeholder.innerHTML = html;
            }
        } catch (error) {
            console.error(`Failed to load component: ${error}`);
            const placeholder = document.getElementById(placeholderId);
            if (placeholder) {
                placeholder.innerHTML = '<p class="text-danger">Error: Could not load navigation.</p>';
            }
        }
    };

    try {
        // Step 1: Ensure all necessary Firebase libraries are loaded first.
        if (typeof firebase.firestore === 'undefined') {
            await loadScript('https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js');
        }

        // Step 2: Define all local application scripts that need to be loaded in order.
        const scriptsToLoad = [
            'https://cdnjs.cloudflare.com/ajax/libs/ical.js/1.4.0/ical.min.js',
            'JS/firebase-service.js',
            'JS/firebase-auth.js',
            'JS/modal-manager.js',
            'JS/calculations.js',
            'JS/charts.js',
            'JS/ui-renderer.js',
            'JS/data-manager.js',
            'JS/leaderboard-manager.js',
            'JS/team-manager.js',
            'JS/evaluation-manager.js',
            'JS/calendar-manager.js',
            'JS/fleet-manager.js',
            'JS/equipment-manager.js',
            'JS/tool-manager.js',
            'JS/report-manager.js',
            'JS/analyzer-manager.js',
            'JS/install-dpt-manager.js',
            'JS/damages-manager.js',
            // ADD THIS LINE
            'JS/slack-manager.js',
            'JS/core.js'
        ];

        // Step 3: Load all scripts sequentially.
        for (const src of scriptsToLoad) {
            await loadScript(src);
        }

        // Step 4: Now that all scripts are loaded, proceed with initializing the application.
        await loadComponent('nav.html', 'nav-placeholder');
        
        startApp(); 

    } catch (error) {
        console.error("A fatal error occurred during application loading:", error);
        document.body.innerHTML = `<div style="padding: 40px; text-align: center;"><h2>Application failed to load</h2><p>A critical script could not be loaded. Please check the browser console (F12) for errors and contact support.</p><p>Error: ${error.message}</p></div>`;
    } finally {
        // Step 5: Make the application visible.
        if (appContainer) {
            setTimeout(() => {
                appContainer.classList.remove('nav-loading');
            }, 50);
        }
    }
});