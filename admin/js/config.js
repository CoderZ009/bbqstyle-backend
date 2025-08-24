// Admin API Configuration
const API_BASE_URL = 'https://bbqstyle-backend.onrender.com';

console.log('Admin API Base URL:', API_BASE_URL);

// Admin authentication helper
function getAdminAuthHeaders() {
    const token = localStorage.getItem('adminToken');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// Helper function to make authenticated requests for admin
function clientAuthFetch(url, options = {}) {
    const headers = {
        ...getAdminAuthHeaders(),
        ...options.headers
    };
    
    return fetch(url, {
        ...options,
        headers,
        credentials: 'include'
    });
}

// Check if admin is logged in
function isAdminLoggedIn() {
    return !!localStorage.getItem('adminToken');
}

// Logout admin
function logoutAdmin() {
    localStorage.removeItem('adminToken');
    window.location.reload();
}