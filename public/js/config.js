// API Configuration

// Client authentication helper
function getClientAuthHeaders() {
    const token = localStorage.getItem('userToken');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}
// Helper function to make authenticated requests for client
function clientAuthFetch(url, options = {}) {
    const headers = {
        ...getClientAuthHeaders(),
        ...options.headers
    };
    return fetch(url, {
        ...options,
        headers
    });
}
// Check if user is logged in
function isLoggedIn() {
    return !!localStorage.getItem('userToken');
}
// Logout user
function logoutUser() {
    localStorage.removeItem('userToken');
    window.location.reload();
}
