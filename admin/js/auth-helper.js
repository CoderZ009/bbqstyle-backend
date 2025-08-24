// Helper function to get auth headers
function getAuthHeaders() {
    const token = localStorage.getItem('adminToken');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// Helper function to make authenticated requests
function authFetch(url, options = {}) {
    const headers = {
        ...getAuthHeaders(),
        ...options.headers
    };
    
    return fetch(url, {
        ...options,
        headers
    });
}

// Alias for compatibility
function clientAuthFetch(url, options = {}) {
    return authFetch(url, options);
}