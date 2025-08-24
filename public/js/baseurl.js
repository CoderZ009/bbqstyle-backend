const API_BASE_URL = 'https://bbqstyle-backend.onrender.com';
// Cache API responses for 5 minutes
const API_CACHE = {
    get: (key) => {
        const cached = localStorage.getItem(`api_cache_${key}`);
        if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < 300000) { // 5 minutes
                return data;
            }
            localStorage.removeItem(`api_cache_${key}`);
        }
        return null;
    },
    set: (key, data) => {
        localStorage.setItem(`api_cache_${key}`, JSON.stringify({
            data,
            timestamp: Date.now()
        }));
    }
};
// Track unique visitors only once per session
document.addEventListener('DOMContentLoaded', function() {
    const hasVisited = localStorage.getItem('bbq_visitor_tracked');
    if (!hasVisited) {
        fetch('/api/track-visitor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page: window.location.pathname })
        })
        .then(() => {
            localStorage.setItem('bbq_visitor_tracked', 'true');
        })
        .catch(err => console.error('Visitor tracking failed:', err))
    }
});
