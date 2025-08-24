// Helper function to get auth headers
function getAuthHeaders() {
    const token = localStorage.getItem('userToken');
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
// Login function
async function login(email, password) {
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
async function register(userData) {
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
// Logout function
function logout() {
    localStorage.removeItem('userToken');
    window.location.href = '/public/index.html';
}
// Check session validity
async function checkSession() {
    const token = localStorage.getItem('userToken');
    if (!token) return false;
    try {
        const response = await authFetch(`${API_BASE_URL}/api/session`);
        return response.ok;
    } catch (error) {
        return false;
    }
}
// Update UI based on auth state
function updateAuthUI() {
    const isAuth = isLoggedIn();
    const user = getCurrentUser();
    // Update login/logout buttons
    const loginBtns = document.querySelectorAll('.login-btn');
    const logoutBtns = document.querySelectorAll('.logout-btn');
    const userInfo = document.querySelectorAll('.user-info');
    loginBtns.forEach(btn => {
        btn.style.display = isAuth ? 'none' : 'block';
    });
    logoutBtns.forEach(btn => {
        btn.style.display = isAuth ? 'block' : 'none';
        btn.addEventListener('click', logout);
    });
    userInfo.forEach(info => {
        if (isAuth && user) {
            info.textContent = `Welcome, ${user.first_name || user.name}`;
            info.style.display = 'block';
        } else {
            info.style.display = 'none';
        }
    });
}
// Initialize auth on page load
document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();
});
