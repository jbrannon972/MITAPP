document.addEventListener('DOMContentLoaded', async () => {
    // Utility function to dynamically load a script and wait for it to be ready
    const loadScript = (src) => {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.async = false; // Ensures scripts are loaded and executed in order
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
        }
    };

    try {
        // Define all scripts in the precise order they need to be loaded.
        // Dependencies must come before the files that use them.
        const localScripts = [
            'JS/firebase-auth.js',
            'JS/firebase-service.js',
            'JS/modal-manager.js',
            'JS/calendar-manager.js',
            'JS/team-manager.js',
            'JS/fleet-manager.js',
            'JS/report-manager.js',
            'JS/tool-manager.js', // This is now guaranteed to load before core.js
            'JS/core.js'
        ];

        // Load all scripts sequentially
        for (const src of localScripts) {
            await loadScript(src);
        }

        // Load HTML components after scripts are ready
        await loadComponent('nav.html', 'nav-placeholder');
        
        // Start the application
        startApp(); 

    } catch (error) {
        console.error("A fatal error occurred during application loading:", error);
        document.body.innerHTML = `<div style="padding: 40px; text-align: center;"><h2>Application failed to load</h2><p>A critical script could not be loaded. Please check the browser console (F12) for errors.</p><p>Error: ${error.message}</p></div>`;
    }
});