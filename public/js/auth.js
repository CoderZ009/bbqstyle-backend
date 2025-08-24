// Client authentication helper - Updated for JWT

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
// Get current user info from token
function getCurrentUser() {
    const token = localStorage.getItem('userToken');
    if (!token) return null;
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload;
    } catch (e) {
        return null;
    }
}
// Logout user
function logoutUser() {
    localStorage.removeItem('userToken');
    window.location.href = '/public/index.html';
}
// Login function
async function loginUser(email, password) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('userToken', data.token);
            return { success: true, user: data.user };
        } else {
            return { success: false, error: data.error };
        }
    } catch (error) {
        return { success: false, error: 'Network error' };
    }
}
// Register function
async function registerUser(userData) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('userToken', data.token);
            return { success: true, user: data.user };
        } else {
            return { success: false, error: data.error };
        }
    } catch (error) {
        return { success: false, error: 'Network error' };
    }
}
