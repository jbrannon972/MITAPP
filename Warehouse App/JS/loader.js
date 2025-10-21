document.addEventListener('DOMContentLoaded', async () => {
    const appContainer = document.querySelector('.app-container');
    if (appContainer) {
        appContainer.classList.add('nav-loading');
    }

    const loadScript = (src) => {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.async = false;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
            document.head.appendChild(script);
        });
    };
    
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
        const localScripts = [
            'JS/firebase-service.js',
            'JS/firebase-auth.js',
            'JS/modal-manager.js',
            'JS/ui-renderer.js',
            'JS/fleet-manager.js',
            'JS/equipment-manager.js',
            'JS/team-manager.js',
            'JS/calendar-manager.js',
            'JS/tool-manager.js',
            'JS/core.js'
        ];

        for (const src of localScripts) {
            await loadScript(src);
        }

        await loadComponent('nav.html', 'nav-placeholder');
        
        startApp(); 

    } catch (error) {
        console.error("A fatal error occurred during application loading:", error);
    } finally {
        if (appContainer) {
            setTimeout(() => {
                appContainer.classList.remove('nav-loading');
            }, 50);
        }
    }
});