// Preloader to ensure all scripts load before page interaction
(function() {
    let scriptsLoaded = 0;
    let totalScripts = 0;
    // Count all script tags
    const scripts = document.querySelectorAll('script[src]');
    totalScripts = scripts.length;
    // Add loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'page-loader';
    loadingDiv.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255,255,255,0.9); z-index: 99999; display: flex; align-items: center; justify-content: center; flex-direction: column;">
            <div style="width: 50px; height: 50px; border: 3px solid #f3f3f3; border-top: 3px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <p style="margin-top: 20px; color: #666;">Loading...</p>
        </div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    `;
    document.body.appendChild(loadingDiv);
    // Function to check if all scripts are loaded
    function checkAllLoaded() {
        scriptsLoaded++;
        if (scriptsLoaded >= totalScripts) {
            // Small delay to ensure DOM is ready
            setTimeout(() => {
                const loader = document.getElementById('page-loader');
                if (loader) {
                    loader.remove();
                }
            }, 500);
        }
    }
    // Add load event listeners to all scripts
    scripts.forEach(script => {
        if (script.src) {
            script.addEventListener('load', checkAllLoaded);
            script.addEventListener('error', checkAllLoaded);
        }
    });
    // Fallback timeout
    setTimeout(() => {
        const loader = document.getElementById('page-loader');
        if (loader) {
            loader.remove();
        }
    }, 5000);
})();
