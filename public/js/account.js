// Helper function to make authenticated requests
function clientAuthFetch(url, options = {}) {
    const token = localStorage.getItem('userToken');
    if (!token) {
        return Promise.reject(new Error('No authentication token'));
    }
    
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    return fetch(url, {
        ...options,
        headers
    });
}

// Toast notification function
function showToast(message, link = null) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.innerHTML = message + (link ? ` <a href="${link.url}">${link.text}</a>` : '');
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Loading state utility functions
function setButtonLoading(button, loading = true) {
    if (loading) {
        button.dataset.originalText = button.textContent;
        button.innerHTML = '<div class="loading-spinner"></div>' + button.textContent;
        button.disabled = true;
    } else {
        button.innerHTML = button.dataset.originalText || button.textContent.replace(/^.*?([A-Z])/, '$1');
        button.disabled = false;
    }
}

// Add CSS for loading spinner
if (!document.getElementById('loading-styles')) {
    const style = document.createElement('style');
    style.id = 'loading-styles';
    style.textContent = `
        .loading-spinner {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid #f3f3f3;
            border-top: 2px solid #3498db;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-right: 8px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
}

// Universal button loading handler for account page buttons
function addUniversalButtonLoading() {
    document.addEventListener('click', function(e) {
        const button = e.target.closest('button');
        if (!button) return;
        
        // Skip if button is already handled or is a close/cancel button
        if (button.disabled || 
            button.classList.contains('close-modal') ||
            button.textContent.toLowerCase().includes('cancel') ||
            button.textContent.toLowerCase().includes('close') ||
            button.type === 'button' && !button.onclick) return;
            
        // Check if button is in account dashboard
        const accountDashboard = document.getElementById('account-dashboard');
        if (accountDashboard && accountDashboard.contains(button)) {
            // Add loading for buttons that make API calls
            if (button.classList.contains('btn-primary') ||
                button.classList.contains('btn-secondary') ||
                button.classList.contains('btn-danger') ||
                button.type === 'submit') {
                
                setButtonLoading(button, true);
                
                // Auto-remove loading after 3 seconds as fallback
                setTimeout(() => {
                    if (button.disabled) {
                        setButtonLoading(button, false);
                    }
                }, 3000);
            }
        }
    });
}
document.addEventListener('DOMContentLoaded', function () {
    // Set axios to send cookies with requests
    axios.defaults.withCredentials = true;
    
    // Initialize universal button loading
    addUniversalButtonLoading();
    // DOM Elements
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const loginError = document.getElementById('loginError');
    const registerError = document.getElementById('registerError');
    const registerSuccess = document.getElementById('registerSuccess');
    const loginContainer = document.getElementById('login-container');
    const registerContainer = document.getElementById('register-container');
    const accountDashboard = document.getElementById('account-dashboard');
    const authToggle = document.querySelector('.auth-toggle');
    const loginBtn = document.getElementById('login-btn');
    const registerBtn = document.getElementById('register-btn');
    const switchToRegisterLink = document.getElementById('switch-to-register');
    const switchToLoginLink = document.getElementById('switch-to-login');
    const logoutBtn = document.getElementById('logout-btn');
    // Tab elements
    const menuItems = document.querySelectorAll('.menu-item');
    const tabContents = document.querySelectorAll('.tab-content');
    // Function to show login form and hide register form
    function showLoginForm() {
        loginContainer.style.display = 'block';
        registerContainer.style.display = 'none';
        loginBtn.classList.add('active');
        registerBtn.classList.remove('active');
    }
    // Function to show register form and hide login form
    function showRegisterForm() {
        loginContainer.style.display = 'none';
        registerContainer.style.display = 'block';
        registerBtn.classList.add('active');
        loginBtn.classList.remove('active');
    }
    // Event listeners for toggle buttons
    if (loginBtn) loginBtn.addEventListener('click', showLoginForm);
    if (registerBtn) registerBtn.addEventListener('click', showRegisterForm);
    // Event listeners for switch links
    if (switchToRegisterLink) {
        switchToRegisterLink.addEventListener('click', function (e) {
            e.preventDefault();
            showRegisterForm();
        });
    }
    if (switchToLoginLink) {
        switchToLoginLink.addEventListener('click', function (e) {
            e.preventDefault();
            showLoginForm();
        });
    }
    // Function to check login status
    function checkLoginStatus() {
        const token = localStorage.getItem('userToken');
        if (!token) {
            showLoginForm();
            if (authToggle) authToggle.style.display = 'flex';
            if (accountDashboard) accountDashboard.style.display = 'none';
            return;
        }
        try {
            // Decode JWT token
            const payload = JSON.parse(atob(token.split('.')[1]));
            const currentTime = Date.now() / 1000;
            // Check if token is expired
            if (payload.exp && payload.exp < currentTime) {
                localStorage.removeItem('userToken');
                showLoginForm();
                if (authToggle) authToggle.style.display = 'flex';
                if (accountDashboard) accountDashboard.style.display = 'none';
                return;
            }
            // Token is valid, show dashboard
            if (authToggle) authToggle.style.display = 'none';
            if (loginContainer) loginContainer.style.display = 'none';
            if (registerContainer) registerContainer.style.display = 'none';
            if (accountDashboard) accountDashboard.style.display = 'block';
            // Set user name from token - fetch from API since JWT only has userId
            const userNameElement = document.getElementById('user-name');
            if (userNameElement && payload.userId) {
                clientAuthFetch(`${API_BASE_URL}/api/user-profile`)
                    .then(response => response.json())
                    .then(data => {
                        if (data.success && data.user && data.user.first_name) {
                            userNameElement.textContent = data.user.first_name;
                        }
                    })
                    .catch(() => userNameElement.textContent = 'User');
            }
            // Show appropriate tab
            const urlParams = new URLSearchParams(window.location.search);
            const defaultTab = urlParams.get('tab') || 'dashboard';
            setTimeout(() => showTab(defaultTab), 100);
            loadDashboardData();
            setTimeout(() => loadAccountDetails(), 500);
        } catch (error) {
            console.error('Invalid token:', error);
            localStorage.removeItem('userToken');
            showLoginForm();
            if (authToggle) authToggle.style.display = 'flex';
            if (accountDashboard) accountDashboard.style.display = 'none';
        }
    }
    // Initial check on page load
    checkLoginStatus();
    // URL tab parameter is now handled in checkLoginStatus function
    // Mobile Login Functionality
    let currentMobile = '';
    let resendTimer = null;
    // Verify Mobile Button
    const verifyMobileBtn = document.getElementById('verify-mobile-btn');
    if (verifyMobileBtn) {
        verifyMobileBtn.addEventListener('click', function() {
            const mobile = document.getElementById('login-mobile').value.trim();
            const mobileError = document.getElementById('mobileError');
            if (!mobile || mobile.length !== 10 || !/^[0-9]+$/.test(mobile))  {
                mobileError.textContent = 'Please enter a valid 10-digit mobile number';
                return;
            }
            mobileError.textContent = '';
            currentMobile = mobile;
            setButtonLoading(this, true);
            // Check if user exists with this mobile number
            fetch(`${API_BASE_URL}/api/mobile-login-check`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ mobile })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Show verification options
                    document.getElementById('mobile-input-section').style.display = 'none';
                    document.getElementById('verification-options').style.display = 'block';
                    // Show/hide options based on user's password status
                    const otpBtn = document.getElementById('verify-with-otp');
                    const passwordBtn = document.getElementById('verify-with-password');
                    if (data.hasPassword) {
                        // User has password - hide OTP option, show password option
                        otpBtn.style.display = 'none';
                        passwordBtn.style.display = 'inline-block';
                        // Auto-proceed to password verification
                        setTimeout(() => {
                            document.getElementById('verification-options').style.display = 'none';
                            document.getElementById('password-verification-form').style.display = 'block';
                        }, 100);
                    } else {
                        // User has no password - show OTP option, hide password option
                        otpBtn.style.display = 'inline-block';
                        passwordBtn.style.display = 'none';
                        // Auto-proceed to OTP verification
                        setTimeout(() => {
                            sendOTP(currentMobile);
                            document.getElementById('verification-options').style.display = 'none';
                            document.getElementById('otp-verification-form').style.display = 'block';
                            startResendTimer();
                        }, 100);
                    }
                } else {
                    mobileError.textContent = data.message;
                }
            })
            .catch(error => {
                console.error('Error checking mobile:', error);
                mobileError.textContent = 'An error occurred. Please try again.';
            })
            .finally(() => {
                setButtonLoading(this, false);
            });
        });
    }
    // Verify with OTP Button
    const verifyWithOtpBtn = document.getElementById('verify-with-otp');
    if (verifyWithOtpBtn) {
        verifyWithOtpBtn.addEventListener('click', function() {
            // Send OTP
            sendOTP(currentMobile);
            // Show OTP form
            document.getElementById('verification-options').style.display = 'none';
            document.getElementById('otp-verification-form').style.display = 'block';
            // Start resend timer
            startResendTimer();
        });
    }
    // Verify with Password Button
    const verifyWithPasswordBtn = document.getElementById('verify-with-password');
    if (verifyWithPasswordBtn) {
        verifyWithPasswordBtn.addEventListener('click', function() {
            // Show password form
            document.getElementById('verification-options').style.display = 'none';
            document.getElementById('password-verification-form').style.display = 'block';
        });
    }
    // Verify OTP Button
    const verifyOtpBtn = document.getElementById('verify-otp-btn');
    if (verifyOtpBtn) {
        verifyOtpBtn.addEventListener('click', function() {
            const otp = document.getElementById('login-otp').value.trim();
            const otpError = document.getElementById('otpError');
            if (!otp || otp.length !== 6) {
                otpError.textContent = 'Please enter a valid 6-digit OTP';
                return;
            }
            otpError.textContent = '';
            setButtonLoading(this, true);
            fetch(`${API_BASE_URL}/api/mobile-login-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ mobile: currentMobile, otp })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success && data.token) {
                    localStorage.setItem('userToken', data.token);
                    checkLoginStatus();
                } else {
                    otpError.textContent = data.message;
                }
            })
            .catch(error => {
                console.error('Error verifying OTP:', error);
                otpError.textContent = 'An error occurred. Please try again.';
            })
            .finally(() => {
                setButtonLoading(this, false);
            });
        });
    }
    // Verify Password Button
    const verifyPasswordBtn = document.getElementById('verify-password-btn');
    if (verifyPasswordBtn) {
        verifyPasswordBtn.addEventListener('click', function() {
            const password = document.getElementById('login-password').value.trim();
            const passwordError = document.getElementById('passwordError');
            if (!password) {
                passwordError.textContent = 'Please enter your password';
                return;
            }
            passwordError.textContent = '';
            setButtonLoading(this, true);
            fetch(`${API_BASE_URL}/api/mobile-login-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ mobile: currentMobile, password })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success && data.token) {
                    localStorage.setItem('userToken', data.token);
                    checkLoginStatus();
                } else {
                    passwordError.textContent = data.message;
                }
            })
            .catch(error => {
                console.error('Error verifying password:', error);
                passwordError.textContent = 'An error occurred. Please try again.';
            })
            .finally(() => {
                setButtonLoading(this, false);
            });
        });
    }
    // Resend OTP Button
    const resendOtpBtn = document.getElementById('resend-otp-btn');
    if (resendOtpBtn) {
        resendOtpBtn.addEventListener('click', function() {
            if (!resendOtpBtn.disabled) {
                sendOTP(currentMobile);
                startResendTimer();
                document.getElementById('otpError').textContent = 'OTP resent successfully';
                document.getElementById('otpError').style.color = 'green';
                setTimeout(() => {
                    document.getElementById('otpError').textContent = '';
                    document.getElementById('otpError').style.color = 'red';
                }, 3000);
            }
        });
    }
    // Back to options buttons
    const backToOptionsBtn = document.getElementById('back-to-options');
    if (backToOptionsBtn) {
        backToOptionsBtn.addEventListener('click', function() {
            document.getElementById('otp-verification-form').style.display = 'none';
            document.getElementById('verification-options').style.display = 'block';
            document.getElementById('login-otp').value = '';
            document.getElementById('otpError').textContent = '';
            if (resendTimer) {
                clearInterval(resendTimer);
            }
        });
    }
    const backToOptionsPasswordBtn = document.getElementById('back-to-options-password');
    if (backToOptionsPasswordBtn) {
        backToOptionsPasswordBtn.addEventListener('click', function() {
            document.getElementById('password-verification-form').style.display = 'none';
            document.getElementById('verification-options').style.display = 'block';
            document.getElementById('login-password').value = '';
            document.getElementById('passwordError').textContent = '';
        });
    }
    // Helper Functions
    function sendOTP(mobile) {
        fetch(`${API_BASE_URL}/api/send-otp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ mobile })
        })
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                document.getElementById('otpError').textContent = data.message || 'Failed to send OTP';
            }
        })
        .catch(error => {
            console.error('Error sending OTP:', error);
            document.getElementById('otpError').textContent = 'Failed to send OTP';
        });
    }
    function startResendTimer() {
        let timeLeft = 60;
        const resendBtn = document.getElementById('resend-otp-btn');
        resendBtn.disabled = true;
        resendBtn.textContent = `Resend OTP (${timeLeft}s)`;
        resendTimer = setInterval(() => {
            timeLeft--;
            resendBtn.textContent = `Resend OTP (${timeLeft}s)`;
            if (timeLeft <= 0) {
                clearInterval(resendTimer);
                resendBtn.disabled = false;
                resendBtn.textContent = 'Resend OTP';
            }
        }, 1000);
    }
    // Password field is now mandatory, so confirm password is always visible
    // Handle Register Form Submission
    if (registerForm) {
        registerForm.addEventListener('submit', function (e) {
            e.preventDefault();
            registerError.textContent = '';
            registerSuccess.textContent = '';
            const first_name = document.getElementById('first-name').value.trim();
            const last_name = document.getElementById('last-name').value.trim();
            const email = document.getElementById('register-email').value.trim();
            const mobile = document.getElementById('register-mobile').value.trim();
            const password = document.getElementById('register-password').value.trim();
            const confirmPassword = document.getElementById('confirm-password').value.trim();
            // Validate mobile number
            if (!mobile || mobile.length !== 10 || !/^[0-9]+$/.test(mobile)) {
                registerError.textContent = 'Please enter a valid 10-digit mobile number';
                return;
            }
            // Validate password is provided
            if (!password) {
                registerError.textContent = 'Password is required';
                return;
            }
            // Validate password confirmation
            if (password !== confirmPassword) {
                registerError.textContent = 'Passwords do not match';
                return;
            }
            const requestData = {
                first_name,
                last_name,
                mobile,
                password
            };
            // Add optional fields if provided
            if (email) requestData.email = email;
            const submitBtn = this.querySelector('button[type="submit"]');
            setButtonLoading(submitBtn, true);
            fetch(`${API_BASE_URL}/api/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success && data.token) {
                        localStorage.setItem('userToken', data.token);
                        registerSuccess.textContent = data.message;
                        registerForm.reset();
                        checkLoginStatus();
                    } else {
                        registerError.textContent = data.message;
                    }
                })
                .catch(error => {
                    console.error('Error during registration:', error);
                    registerError.textContent = 'An error occurred during registration.';
                })
                .finally(() => {
                    setButtonLoading(submitBtn, false);
                });
        });
    }
    // Handle Logout
    document.addEventListener('click', function (e) {
        if (e.target.id === 'logout-btn' || e.target.closest('#logout-btn')) {
            e.preventDefault();
            localStorage.removeItem('userToken');
            Promise.resolve({ json: () => ({ success: true }) })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        window.location.reload();
                    }
                })
                .catch(error => {
                    console.error('Error during logout:', error);
                    window.location.reload();
                });
        }
    });
    // Show Tab Function
    function showTab(tabId) {
        // Remove active class from all menu items and tab contents
        menuItems.forEach(mi => mi.classList.remove('active'));
        tabContents.forEach(tc => tc.classList.remove('active'));
        // Add active class to corresponding menu item and tab
        const menuItem = document.querySelector(`[data-tab="${tabId}"]`);
        const targetTab = document.getElementById(tabId + '-tab');
        if (menuItem) menuItem.classList.add('active');
        if (targetTab) {
            targetTab.classList.add('active');
            loadTabContent(tabId);
        } else {
            console.error('Target tab not found:', tabId + '-tab');
        }
        // Update URL with tab name
        const url = new URL(window.location);
        url.searchParams.set('tab', tabId);
        window.history.pushState({}, '', url);
    }
    // Tab Navigation
    menuItems.forEach(item => {
        item.addEventListener('click', function (e) {
            e.preventDefault();
            const tabId = this.dataset.tab;
            if (tabId) {
                showTab(tabId);
            }
        });
    });
    // Load Dashboard Data
    function loadDashboardData() {
        // Load all orders count
        clientAuthFetch(`${API_BASE_URL}/api/orders`)
            .then(response => response.json())
            .then(data => {
                const totalOrders = (data.success && data.orders) ? data.orders.length : 0;
                const pendingOrders = (data.success && data.orders) ?
                    data.orders.filter(order => order.status !== 'delivered' && order.status !== 'cancelled').length : 0;
                document.getElementById('total-orders').textContent = totalOrders;
                document.getElementById('pending-orders').textContent = pendingOrders;
            })
            .catch(error => {
                console.error('Error loading orders:', error);
                document.getElementById('total-orders').textContent = '0';
                document.getElementById('pending-orders').textContent = '0';
            });
        // Load wishlist count
        clientAuthFetch(`${API_BASE_URL}/api/wishlist`)
            .then(response => response.json())
            .then(data => {
                const wishlistCount = (data.success && data.wishlist) ? data.wishlist.length : 0;
                document.getElementById('wishlist-count').textContent = wishlistCount;
            })
            .catch(error => {
                console.error('Error loading wishlist:', error);
                document.getElementById('wishlist-count').textContent = '0';
            });
        // Load recent orders
        loadRecentOrders();
    }
    // Load Recent Orders
    function loadRecentOrders() {
        clientAuthFetch(`${API_BASE_URL}/api/orders`)
            .then(response => response.json())
            .then(data => {
                const tbody = document.getElementById('recent-orders-tbody');
                if (data.success && data.orders.length > 0) {
                    // Sort by order_date desc and take first 5
                    const recentOrders = data.orders
                        .sort((a, b) => new Date(b.order_date) - new Date(a.order_date))
                        .slice(0, 5);
                    tbody.innerHTML = recentOrders.map(order => `
                        <tr>
                            <td>#${order.order_id}</td>
                            <td>${new Date(order.order_date).toLocaleDateString()}</td>
                            <td><span class="order-status status-${order.status}">${order.status}</span></td>
                            <td>₹${order.total_amount}</td>
                            <td><a href="#" class="view-order" data-order-id="${order.order_id}">View</a></td>
                        </tr>
                    `).join('');
                } else {
                    tbody.innerHTML = '<tr><td colspan="5" class="text-center">No orders found</td></tr>';
                }
            })
            .catch(error => {
                console.error('Error loading recent orders:', error);
                document.getElementById('recent-orders-tbody').innerHTML = '<tr><td colspan="5" class="text-center">Error loading orders</td></tr>';
            });
    }
    // Load Tab Content
    function loadTabContent(tabId) {
        switch (tabId) {
            case 'orders':
                loadAllOrders();
                // Set up filter event listener
                const orderFilter = document.getElementById('order-status-filter');
                if (orderFilter) {
                    orderFilter.addEventListener('change', function() {
                        loadAllOrders(this.value);
                    });
                }
                break;
            case 'addresses':
                loadAddresses();
                break;
            case 'account-details':
                loadAccountDetails();
                break;
            case 'dashboard':
                loadDashboardData();
                break;
            default:
                break;
        }
    }
    // Load All Orders
    function loadAllOrders(statusFilter = '') {
        const container = document.getElementById('all-orders-container');
        container.innerHTML = '<p class="text-center">Loading orders...</p>';
        clientAuthFetch(`${API_BASE_URL}/api/orders`)
            .then(response => response.json())
            .then(data => {
                if (data.success && data.orders.length > 0) {
                    let filteredOrders = data.orders;
                    // Apply status filter if provided
                    if (statusFilter) {
                        filteredOrders = data.orders.filter(order => order.status === statusFilter);
                    }
                    if (filteredOrders.length === 0) {
                        container.innerHTML = '<div class="empty-state"><p>No orders found for the selected filter</p></div>';
                        return;
                    }
                    container.innerHTML = filteredOrders.map(order => `
                        <div class="order-card-elongated" style="width: 100%;">
                            <div class="order-card-header">
                                <div class="order-info">
                                    <h3 class="order-number">#${order.order_id}</h3>
                                    <p class="order-date">Placed on ${new Date(order.order_date).toLocaleDateString()}</p>
                                    ${order.status === 'delivered' && order.delivery_date ? `<p class="delivery-date">Delivered on ${new Date(order.delivery_date).toLocaleDateString()}</p>` : ''}
                                </div>
                                <div class="order-status-badge status-${order.status}">${order.status}</div>
                            </div>
                            <div class="order-card-body">
                                <div class="order-summary">
                                    <div class="summary-row total">
                                        <span>Total:</span>
                                        <span>₹${order.total_amount}</span>
                                    </div>
                                </div>
                                <button class="btn-view-items" data-order-id="${order.order_id}">View Order Items</button>
                            </div>
                            <div class="order-card-footer">
                                ${(order.status !== 'pending' && order.status !== 'processing' && order.status !== 'cancelled') ? `<button class="btn-track" data-order-id="${order.order_id}" data-tracking-link="${order.tracking_link || ''}">Track Order</button>` : ''}
                                <button class="btn-details view-order-details" data-order-id="${order.order_id}">View Details</button>
                                ${(order.status === 'pending' || order.status === 'processing') ? `<button class="btn-cancel" data-order-id="${order.order_id}">Cancel Order</button>` : ''}
                                ${order.status === 'cancelled' ? `<button class="btn-view-reason" data-order-id="${order.order_id}" style="background: #dc3545; color: white; border: 1px solid #dc3545; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 14px; margin: 5px;">View Reason</button>` : ''}
                                ${console.log('Order status:', order.status, 'Order ID:', order.order_id) || ''}
                                ${order.status === 'delivered' ? `<button class="btn-review" data-order-id="${order.order_id}">Write Review</button>` : ''}
                                ${order.status === 'delivered' ? `<button class="btn-return" data-order-id="${order.order_id}" style="background-color: #dc3545; border-color: #dc3545;">Return Order</button>` : ''}
                                ${(order.status === 'delivered' || order.status === 'cancelled') ? `<button class="btn-reorder" data-order-id="${order.order_id}">Reorder</button>` : ''}
                            </div>
                        </div>
                    `).join('');
                } else {
                    container.innerHTML = '<div class="empty-state"><p>No orders found</p></div>';
                }
            })
            .catch(error => {
                console.error('Error loading orders:', error);
                container.innerHTML = '<div class="error-state"><p>Error loading orders</p></div>';
            });
    }
    // Show Order Items Modal
    function showOrderItems(orderId) {
        clientAuthFetch(`${API_BASE_URL}/api/admin/orders/${orderId}/items`)
            .then(response => response.json())
            .then(items => {
                if (items && items.length > 0) {
                    const modal = document.createElement('div');
                    modal.className = 'order-modal';
                    modal.innerHTML = `
                    <div class="modal-content">
                        <div class="modal-header">
                            <h2>Order Items #${orderId}</h2>
                            <span class="close-modal">&times;</span>
                        </div>
                        <div class="modal-body">
                            ${items.map(item => {
                        const productId = item.product_id || item.id || 'unknown';
                        return `
                                <div class="order-item-detail">
                                    <a href="/product-detail.html?product_id=${item.product_id}">
                                        <img src="/uploads/${item.image_path || 'placeholder.jpg'}" alt="${item.title}" class="item-detail-image">
                                    </a>
                                    <div class="item-info">
                                        <h4><a href="/product-detail.html?product_id=${item.product_id}">${item.title}</a></h4>
                                        <p>Variant: ${item.variant_type || 'No Type'}</p>
                                        <p>Detail: ${item.variant_detail || 'No Detail'}</p>
                                        <p>Quantity: ${item.quantity}</p>
                                        <p class="item-price">₹${item.price}</p>
                                    </div>
                                </div>
                                `;
                    }).join('')}
                        </div>
                    </div>
                `;
                    document.body.appendChild(modal);
                    modal.querySelector('.close-modal').onclick = () => modal.remove();
                    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
                } else {
                    showToast('No items found for this order');
                }
            })
            .catch(error => {
                console.error('Error loading order items:', error);
                showToast('Error loading order items');
            });
    }
    // Event delegation for dynamic content
    document.addEventListener('click', function (e) {
        // View order items
        if (e.target.classList.contains('btn-view-items')) {
            e.preventDefault();
            const orderId = e.target.dataset.orderId;
            showOrderItems(orderId);
        }
        // View order details
        if (e.target.classList.contains('view-order') || e.target.classList.contains('view-order-details')) {
            e.preventDefault();
            const orderId = e.target.dataset.orderId;
            showOrderDetails(orderId);
        }
        
        // View cancellation reason
        if (e.target.classList.contains('btn-view-reason')) {
            e.preventDefault();
            const orderId = e.target.dataset.orderId;
            showCancellationReason(orderId);
        }
        // Track order
        if (e.target.classList.contains('btn-track')) {
            e.preventDefault();
            let trackingLink = e.target.dataset.trackingLink;
            if (trackingLink && trackingLink !== '') {
                if (!trackingLink.startsWith('http://') && !trackingLink.startsWith('https://')) {
                    trackingLink = 'https://' + trackingLink;
                }
                window.open(trackingLink, '_blank');
            } else {
                alert('Tracking information not available for this order');
            }
        }
        // Edit address
        if (e.target.classList.contains('btn-edit-address')) {
            e.preventDefault();
            const addressId = e.target.dataset.addressId;
            showEditAddressModal(addressId);
        }
        // Add new address
        if (e.target.id === 'add-address-btn') {
            e.preventDefault();
            showAddAddressModal();
        }
        // Cancel order
        if (e.target.classList.contains('btn-cancel')) {
            e.preventDefault();
            const orderId = e.target.dataset.orderId;
            showCancelOrderModal(orderId);
        }
        // Write review
        if (e.target.classList.contains('btn-review')) {
            e.preventDefault();
            const orderId = e.target.dataset.orderId;
            window.showReviewModal(orderId);
        }
        // Reorder
        if (e.target.classList.contains('btn-reorder')) {
            e.preventDefault();
            const orderId = e.target.dataset.orderId;
            reorderItems(orderId);
        }
        // Return order
        if (e.target.classList.contains('btn-return')) {
            e.preventDefault();
            const orderId = e.target.dataset.orderId;
            showReturnModal(orderId);
        }
    });
    // Show Order Details Modal
    function showOrderDetails(orderId) {
        clientAuthFetch(`${API_BASE_URL}/api/orders`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    const order = data.orders.find(o => o.order_id == orderId);
                    if (order) {
                        const modal = document.createElement('div');
                        modal.className = 'order-modal';
                        modal.innerHTML = `
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h2>Order Details #${order.order_id}</h2>
                                    <span class="close-modal">&times;</span>
                                </div>
                                <div class="modal-body">
                                    <div class="order-grid">
                                         <div class="order-card-item">
                                            <div class="order-label">Tracking ID</div>
                                            <div class="order-value">${order.tracking_id || 'N/A'}</div>
                                        </div>
                                        <div class="order-card-item">
                                            <div class="order-label">Order ID</div>
                                            <div class="order-value">#${order.order_id}</div>
                                        </div>
                                        <div class="order-card-item">
                                            <div class="order-label">Order Date</div>
                                            <div class="order-value">${new Date(order.order_date).toLocaleDateString()}</div>
                                        </div>
                                        <div class="order-card-item">
                                            <div class="order-label">Status</div>
                                            <div class="order-value"><span class="order-status status-${order.status}">${order.status}</span></div>
                                        </div>
                                        <div class="order-card-item">
                                            <div class="order-label">Total Amount</div>
                                            <div class="order-value">₹${order.total_amount}</div>
                                        </div>
                                        <div class="order-card-item">
                                            <div class="order-label">Payment Mode</div>
                                            <div class="order-value">${order.payment_mode || 'N/A'}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                        document.body.appendChild(modal);
                        // Close modal functionality
                        modal.querySelector('.close-modal').onclick = () => modal.remove();
                        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
                    }
                }
            })
            .catch(error => console.error('Error loading order details:', error));
    }
    // Load Account Details
    function loadAccountDetails() {
        clientAuthFetch(`${API_BASE_URL}/api/user-profile`)
        .then(response => response.json())
        .then(data => {
            if (data.success && data.user) {
                const user = data.user;
                const firstNameField = document.getElementById('account-first-name');
                const lastNameField = document.getElementById('account-last-name');
                const emailField = document.getElementById('account-email');
                const mobileField = document.getElementById('account-mobile');
                if (firstNameField) firstNameField.value = user.first_name || '';
                if (lastNameField) lastNameField.value = user.last_name || '';
                if (emailField) emailField.value = user.email || '';
                if (mobileField) mobileField.value = user.mobile || '';
            }
        })
        .catch(error => console.error('Error loading account details:', error));
    }
    // Update Account Details and Review Form
    document.addEventListener('submit', function(e) {
        if (e.target.id === 'account-details-form') {
            e.preventDefault();
            const formData = {
                first_name: document.getElementById('account-first-name').value,
                last_name: document.getElementById('account-last-name').value,
                email: document.getElementById('account-email').value,
                mobile: document.getElementById('account-mobile').value
            };
            const submitBtn = e.target.querySelector('button[type="submit"]');
            setButtonLoading(submitBtn, true);
            clientAuthFetch(`${API_BASE_URL}/api/update-profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('Account details updated successfully');
                    // Update the user name in the sidebar
                    document.getElementById('user-name').textContent = formData.first_name;
                } else {
                    showToast('Error updating account details: ' + (data.message || 'Unknown error'));
                }
            })
            .catch(error => {
                console.error('Error updating account details:', error);
                showToast('Error updating account details');
            })
            .finally(() => {
                setButtonLoading(submitBtn, false);
            });
        }
        // Change Password Form
        if (e.target.id === 'change-password-form') {
            e.preventDefault();
            const currentPassword = document.getElementById('current-password').value;
            const newPassword = document.getElementById('new-password').value;
            const confirmPassword = document.getElementById('confirm-new-password').value;
            if (!newPassword) {
                showToast('New password is required');
                return;
            }
            if (newPassword !== confirmPassword) {
                showToast('New password and confirm password do not match');
                return;
            }
            const submitBtn = e.target.querySelector('button[type="submit"]');
            setButtonLoading(submitBtn, true);
            clientAuthFetch(`${API_BASE_URL}/api/change-password`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    currentPassword: currentPassword || null,
                    newPassword
                }),
                credentials: 'include'
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast(data.message || 'Password updated successfully');
                    document.getElementById('change-password-form').reset();
                } else {
                    showToast('Error changing password: ' + (data.message || 'Unknown error'));
                }
            })
            .catch(error => {
                console.error('Error changing password:', error);
                showToast('Error changing password');
            })
            .finally(() => {
                setButtonLoading(submitBtn, false);
            });
        }
    });
    // Load Addresses
    function loadAddresses() {
        clientAuthFetch(`${API_BASE_URL}/api/addresses`)
        .then(response => {
            return response.json();
        })
        .then(data => {
            const container = document.getElementById('addresses-container');
            if (data.success && data.addresses && data.addresses.length > 0) {
                container.innerHTML = data.addresses.map(address => `
                    <div class="address-card">
                        <div class="address-header">
                            <h4>${address.full_name}</h4>
                            ${address.is_default ? '<span class="default-badge">Default</span>' : ''}
                        </div>
                        <div class="address-body">
                            <p>${address.address_line1}</p>
                            ${address.address_line2 ? `<p>${address.address_line2}</p>` : ''}
                            <p>${address.city}, ${address.state} - ${address.pincode}</p>
                            <p>Mobile: ${address.mobile_no}</p>
                        </div>
                        <div class="address-footer">
                            <button class="btn-edit-address" data-address-id="${address.address_id}">Edit</button>
                        </div>
                    </div>
                `).join('');
            } else {
                container.innerHTML = '<div class="empty-state"><p>No addresses found</p></div>';
            }
        })
        .catch(error => {
            console.error('Error loading addresses:', error);
            document.getElementById('addresses-container').innerHTML = '<div class="error-state"><p>Error loading addresses</p></div>';
        });
    }
    // Show Edit Address Modal
    function showEditAddressModal(addressId) {
        // First fetch the address data
        clientAuthFetch(`${API_BASE_URL}/api/addresses`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const address = data.addresses.find(addr => addr.address_id == addressId);
                if (address) {
                    const modal = document.createElement('div');
                    modal.className = 'address-modal';
                    modal.innerHTML = `
                        <div class="modal-content">
                            <div class="modal-header">
                                <h2>Edit Address</h2>
                                <span class="close-modal">&times;</span>
                            </div>
                            <div class="modal-body">
                                <form id="edit-address-form">
                                    <input type="hidden" id="edit-address-id" value="${address.address_id}">
                                    <div class="form-group">
                                        <label for="edit-full-name">Full Name</label>
                                        <input type="text" id="edit-full-name" class="form-control" value="${address.full_name}" required>
                                    </div>
                                    <div class="form-group">
                                        <label for="edit-mobile-no">Mobile Number</label>
                                        <input type="tel" id="edit-mobile-no" class="form-control" value="${address.mobile_no}" maxlength="10" pattern="[0-9]{10}" autocomplete="tel" required>
                                    </div>
                                    <div class="form-group">
                                        <label for="edit-address-line1">Address Line 1</label>
                                        <input type="text" id="edit-address-line1" class="form-control" value="${address.address_line1}" required>
                                    </div>
                                    <div class="form-group">
                                        <label for="edit-address-line2">Address Line 2</label>
                                        <input type="text" id="edit-address-line2" class="form-control" value="${address.address_line2 || ''}">
                                    </div>
                                    <div class="form-group">
                                        <label for="edit-city">City</label>
                                        <input type="text" id="edit-city" class="form-control" value="${address.city}" required>
                                    </div>
                                    <div class="form-group">
                                        <label for="edit-pincode">Pincode</label>
                                        <input type="text" id="edit-pincode" class="form-control" value="${address.pincode}" required maxlength="6">
                                        <small class="text-gray-500">District and state will be auto-filled</small>
                                    </div>
                                    <div class="form-group">
                                        <label for="edit-district">District</label>
                                        <input type="text" id="edit-district" class="form-control" value="${address.state}" required readonly>
                                    </div>
                                    <div class="form-group">
                                        <label for="edit-state">State</label>
                                        <input type="text" id="edit-state" class="form-control" value="${address.state}" required readonly>
                                    </div>
                                    <div class="form-group">
                                        <label>
                                            <input type="checkbox" id="edit-is-default" ${address.is_default ? 'checked' : ''}>
                                            Set as default address
                                        </label>
                                    </div>
                                    <button type="submit" class="btn-primary">Update Address</button>
                                </form>
                            </div>
                        </div>
                    `;
                    document.body.appendChild(modal);
                    // Close modal functionality
                    modal.querySelector('.close-modal').onclick = () => modal.remove();
                    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
                    // Add pincode auto-fill functionality for edit form
                    const editPincodeInput = modal.querySelector('#edit-pincode');
                    editPincodeInput.addEventListener('input', async function() {
                        const pincode = this.value;
                        if (pincode.length === 6) {
                            try {
                                const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
                                const data = await response.json();
                                if (data[0].Status === 'Success') {
                                    const postOffice = data[0].PostOffice[0];
                                    document.getElementById('edit-district').value = postOffice.District;
                                    document.getElementById('edit-state').value = postOffice.State;
                                }
                            } catch (error) {
                                console.error('Error fetching pincode data:', error);
                            }
                        }
                    });
                    // Handle form submission
                    modal.querySelector('#edit-address-form').addEventListener('submit', function(e) {
                        e.preventDefault();
                        const formData = {
                            fullName: document.getElementById('edit-full-name').value,
                            mobileNo: document.getElementById('edit-mobile-no').value,
                            addressLine1: document.getElementById('edit-address-line1').value,
                            addressLine2: document.getElementById('edit-address-line2').value,
                            city: document.getElementById('edit-city').value,
                            district: document.getElementById('edit-district').value,
                            state: document.getElementById('edit-state').value,
                            pincode: document.getElementById('edit-pincode').value,
                            isDefault: document.getElementById('edit-is-default').checked
                        };
                        const submitBtn = this.querySelector('button[type="submit"]');
                        setButtonLoading(submitBtn, true);
                        clientAuthFetch(`${API_BASE_URL}/api/addresses/${addressId}`, { method: 'PUT', headers: {
                                'Content-Type': 'application/json'
                            }, body: JSON.stringify(formData) })
                        .then(response => response.json())
                        .then(data => {
                            if (data.success) {
                                showToast('Address updated successfully');
                                modal.remove();
                                loadAddresses(); // Reload addresses
                            } else {
                                showToast('Error updating address: ' + (data.message || 'Unknown error'));
                            }
                        })
                        .catch(error => {
                            console.error('Error updating address:', error);
                            showToast('Error updating address');
                        })
                        .finally(() => {
                            setButtonLoading(submitBtn, false);
                        });
                    });
                }
            }
        })
        .catch(error => console.error('Error fetching address:', error));
    }
    // Cancel Order Function
    async function cancelOrder(orderId, cancellationData = {}, cancelBtn = null) {
        if (cancelBtn) setButtonLoading(cancelBtn, true);
        try {
            const response = await clientAuthFetch(`${API_BASE_URL}/api/orders/${orderId}/cancel`, { method: 'POST', headers: {
                    'Content-Type': 'application/json'
                }, body: JSON.stringify(cancellationData) });
            const data = await response.json();
            if (data.success) {
                showToast('Order cancelled successfully. Refund will be processed within 5-7 business days.');
                loadAllOrders(); // Reload orders
            } else {
                showToast('Error cancelling order: ' + (data.message || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error cancelling order:', error);
            showToast('Error cancelling order');
        } finally {
            if (cancelBtn) setButtonLoading(cancelBtn, false);
        }
    }
    // Show Review Modal
    window.showReviewModal = async function(orderId) {
        // First fetch order items
        try {
            const response = await clientAuthFetch(`${API_BASE_URL}/api/admin/orders/${orderId}/items`);
            const items = await response.json();
            const modal = document.createElement('div');
            modal.className = 'address-modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>Write Review for Order #${orderId}</h2>
                        <span class="close-modal">&times;</span>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label for="product-select">Select Product to Review</label>
                            <select id="product-select" class="form-control" required>
                                <option value="">Select a product</option>
                                ${items.map(item => `
                                    <option value="${item.product_id}" data-item='${JSON.stringify(item)}' data-order-item-id="${item.order_item_id}">
                                        ${item.title} ${item.variant_detail ? `(${item.variant_detail})` : ''}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div id="selected-product-card" style="display: none; margin: 15px 0; padding: 15px; border: 1px solid #eee; border-radius: 8px;">
                            <!-- Product card will be populated here -->
                        </div>
                        <form id="review-form">
                            <div class="form-group">
                                <label for="review-rating">Rating (1-5 stars)</label>
                                <select id="review-rating" class="form-control" required>
                                    <option value="">Select Rating</option>
                                    <option value="5">5 Stars - Excellent</option>
                                    <option value="4">4 Stars - Good</option>
                                    <option value="3">3 Stars - Average</option>
                                    <option value="2">2 Stars - Poor</option>
                                    <option value="1">1 Star - Very Poor</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="review-comment">Review Comment</label>
                                <textarea id="review-comment" class="form-control" rows="4" placeholder="Share your experience with this product..." required style="resize: vertical; min-height: 100px;"></textarea>
                            </div>
                            <button type="submit" class="btn-primary" id="submit-review-btn">Submit Review</button>
                        </form>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            // Close modal functionality
            modal.querySelector('.close-modal').onclick = () => modal.remove();
            modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
            // Handle product selection
            const productSelect = document.getElementById('product-select');
            const productCard = document.getElementById('selected-product-card');
            const reviewForm = document.getElementById('review-form');
            const submitBtn = document.getElementById('submit-review-btn');
            productSelect.addEventListener('change', async function() {
                const selectedOption = this.options[this.selectedIndex];
                if (selectedOption.value) {
                    const item = JSON.parse(selectedOption.dataset.item);
                    // Show product card
                    productCard.innerHTML = `
                        <div class="order-item-detail">
                            <a href="/product-detail.html?product_id=${item.product_id}" target="_blank">
                                <img src="/uploads/${item.image_path || 'placeholder.jpg'}" alt="${item.title}" class="item-detail-image" style="cursor: pointer;">
                            </a>
                            <div class="item-info">
                                <h4><a href="/product-detail.html?product_id=${item.product_id}" target="_blank">${item.title}</a></h4>
                                <p>Variant: ${item.variant_type || 'No Type'}</p>
                                <p>Detail: ${item.variant_detail || 'No Detail'}</p>
                                <p>Quantity: ${item.quantity}</p>
                                <p class="item-price">₹${item.price}</p>
                            </div>
                        </div>
                    `;
                    productCard.style.display = 'block';
                    // Check for existing review to allow editing
                    const ratingSelect = modal.querySelector('#review-rating');
                    const commentTextarea = modal.querySelector('#review-comment');
                    
                    try {
                        const reviewResponse = await fetch(`${API_BASE_URL}/api/public/reviews?product_id=${item.product_id}`);
                        if (reviewResponse.ok) {
                            const reviews = await reviewResponse.json();
                            const existingReview = reviews.find(r => r.order_item_id == item.order_item_id);
                            if (existingReview) {
                                // Populate form with existing review
                                ratingSelect.value = existingReview.star_rating;
                                commentTextarea.value = existingReview.review_text;
                                submitBtn.textContent = 'Update Review';
                                console.log('Found existing review:', existingReview);
                            } else {
                                // Reset form for new review
                                ratingSelect.value = '';
                                commentTextarea.value = '';
                                submitBtn.textContent = 'Submit Review';
                                console.log('No existing review found');
                            }
                        } else {
                            // Reset form for new review
                            ratingSelect.value = '';
                            commentTextarea.value = '';
                            submitBtn.textContent = 'Submit Review';
                        }
                    } catch (error) {
                        console.error('Error checking review:', error);
                        // Reset form for new review
                        ratingSelect.value = '';
                        commentTextarea.value = '';
                        submitBtn.textContent = 'Submit Review';
                    }
                } else {
                    productCard.style.display = 'none';
                    reviewForm.reset();
                }
            });
            // Handle form submission
            reviewForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                const selectedProductId = productSelect.value;
                const star_rating = parseInt(modal.querySelector('#review-rating').value);
                const review_text = modal.querySelector('#review-comment').value;
                if (!selectedProductId || !star_rating || !review_text) {
                    showToast('Please select a product and fill in all required fields.');
                    return;
                }
                setButtonLoading(submitBtn, true);
                try {
                    // Validate product exists
                    const productCheckResponse = await clientAuthFetch(`${API_BASE_URL}/api/public/products/${selectedProductId}`);
                    if (!productCheckResponse.ok) {
                        throw new Error('Product not found. Cannot submit review for non-existent product.');
                    }
                    // Check for existing review to determine if update or create
                    let reviewData = { exists: false, review: null };
                    try {
                        const reviewResponse = await fetch(`${API_BASE_URL}/api/public/reviews?product_id=${selectedProductId}`);
                        if (reviewResponse.ok) {
                            const reviews = await reviewResponse.json();
                            const existingReview = reviews.find(r => r.order_item_id == productSelect.options[productSelect.selectedIndex].dataset.orderItemId);
                            reviewData = { exists: !!existingReview, review: existingReview };
                        }
                    } catch (error) {
                        console.log('Could not check existing review');
                    }
                    const url = reviewData.exists ? `${API_BASE_URL}/api/reviews/${reviewData.review.review_id}` : `${API_BASE_URL}/api/reviews`;
                    const method = reviewData.exists ? 'PUT' : 'POST';
                    const token = localStorage.getItem('userToken');
                    if (!token) {
                        throw new Error('Authentication required. Please log in again.');
                    }
                    
                    // Get customer name from profile
                    let customerName = 'Customer';
                    try {
                        const profileResponse = await clientAuthFetch(`${API_BASE_URL}/api/user-profile`);
                        const profileData = await profileResponse.json();
                        if (profileData.success && profileData.user) {
                            customerName = `${profileData.user.first_name || ''} ${profileData.user.last_name || ''}`.trim() || 'Customer';
                        }
                    } catch (error) {
                        console.log('Could not fetch customer name, using default');
                    }
                    
                    const response = await fetch(url, {
                        method: method,
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            star_rating,
                            review_text,
                            product_id: parseInt(selectedProductId),
                            order_item_id: parseInt(productSelect.options[productSelect.selectedIndex].dataset.orderItemId) || null,
                            publish_status: 0,
                            customer_name: customerName
                        })
                    });
                    const data = await response.json();
                    if (response.ok) {
                        showToast(reviewData.exists ? 'Review updated successfully!' : 'Review submitted successfully! It will be visible after moderation.');
                        modal.remove();
                    } else {
                        throw new Error(data.error || 'Failed to submit review.');
                    }
                } catch (error) {
                    console.error('Error submitting review:', error);
                    showToast(error.message || 'Error submitting review');
                } finally {
                    setButtonLoading(submitBtn, false);
                }
            });
        } catch (error) {
            console.error('Error loading order items:', error);
            showToast('Error loading order items');
        }
    }
    // Reorder Items Function
    async function reorderItems(orderId, reorderBtn = null) {
        if (reorderBtn) setButtonLoading(reorderBtn, true);
        try {
            // Get order items
            const response = await clientAuthFetch(`${API_BASE_URL}/api/admin/orders/${orderId}/items`);
            const items = await response.json();
            if (!items || items.length === 0) {
                showToast('No items found in this order');
                return;
            }
            // Clear current cart
            await clientAuthFetch(`${API_BASE_URL}/api/cart/clear`, { method: 'POST' });
            // Add each item to cart
            for (const item of items) {
                await clientAuthFetch(`${API_BASE_URL}/api/cart/add`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        productId: item.product_id,
                        variantDetail: item.variant_detail,
                        quantity: item.quantity
                    }),
                    credentials: 'include'
                });
            }
            showToast('Items added to cart successfully!');
            window.location.href = '/cart.html';
        } catch (error) {
            console.error('Error reordering items:', error);
            showToast('Error reordering items');
        } finally {
            if (reorderBtn) setButtonLoading(reorderBtn, false);
        }
    }
    // Show Cancel Order Modal
    function showCancelOrderModal(orderId) {
        const modal = document.createElement('div');
        modal.className = 'address-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Cancel Order #${orderId}</h2>
                    <span class="close-modal">&times;</span>
                </div>
                <div class="modal-body">
                    <form id="cancel-order-form">
                        <div class="form-group">
                            <label for="cancel-reason">Reason for Cancellation *</label>
                            <select id="cancel-reason" class="form-control" required>
                                <option value="">Select a reason</option>
                                <option value="changed-mind">Changed my mind</option>
                                <option value="found-better-price">Found better price elsewhere</option>
                                <option value="ordered-by-mistake">Ordered by mistake</option>
                                <option value="delivery-delay">Delivery taking too long</option>
                                <option value="product-not-needed">Product no longer needed</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                        <div class="form-group" id="other-reason-group" style="display: none;">
                            <label for="other-reason">Please specify *</label>
                            <textarea id="other-reason" class="form-control" rows="3" placeholder="Please provide details..."></textarea>
                        </div>
                        <div class="form-group">
                            <label for="additional-comments">Additional Comments (Optional)</label>
                            <textarea id="additional-comments" class="form-control" rows="3" placeholder="Any additional information..."></textarea>
                        </div>
                        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #dc3545;">
                            <h4 style="margin: 0 0 10px 0; color: #dc3545;">Important Information:</h4>
                            <ul style="margin: 0; padding-left: 20px; color: #666;">
                                <li>Order cancellation is subject to our cancellation policy</li>
                                <li>Refund will be processed within 5-7 business days</li>
                                <li>Once cancelled, this action cannot be undone</li>
                            </ul>
                        </div>
                        <div class="form-actions" style="display: flex; gap: 10px; margin-top: 20px;">
                            <button type="button" class="btn-secondary" onclick="this.closest('.address-modal').remove()">Keep Order</button>
                            <button type="submit" class="btn-danger" style="background: #dc3545; border-color: #dc3545;">Cancel Order</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        // Close modal functionality
        modal.querySelector('.close-modal').onclick = () => modal.remove();
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        // Show/hide other reason field
        const reasonSelect = modal.querySelector('#cancel-reason');
        const otherReasonGroup = modal.querySelector('#other-reason-group');
        const otherReasonField = modal.querySelector('#other-reason');
        reasonSelect.addEventListener('change', function() {
            if (this.value === 'other') {
                otherReasonGroup.style.display = 'block';
                otherReasonField.required = true;
            } else {
                otherReasonGroup.style.display = 'none';
                otherReasonField.required = false;
                otherReasonField.value = '';
            }
        });
        // Handle form submission
        modal.querySelector('#cancel-order-form').addEventListener('submit', function(e) {
            e.preventDefault();
            const reason = reasonSelect.value;
            const otherReason = otherReasonField.value;
            const additionalComments = modal.querySelector('#additional-comments').value;
            if (!reason) {
                showToast('Please select a reason for cancellation');
                return;
            }
            if (reason === 'other' && !otherReason.trim()) {
                showToast('Please specify the reason for cancellation');
                return;
            }
            // Prepare cancellation data
            const cancellationData = {
                reason: reason === 'other' ? otherReason : reason,
                additionalComments: additionalComments
            };
            const submitBtn = this.querySelector('button[type="submit"]');
            setButtonLoading(submitBtn, true);
            modal.remove();
            cancelOrder(orderId, cancellationData, submitBtn);
        });
    }
    // Show Return Modal
    function showReturnModal(orderId) {
        clientAuthFetch(`${API_BASE_URL}/api/orders`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    const order = data.orders.find(o => o.order_id == orderId);
                    const trackingId = order ? (order.tracking_id || 'N/A') : 'N/A';
                    const modal = document.createElement('div');
                    modal.className = 'address-modal';
                    modal.innerHTML = `
                        <div class="modal-content" style="border: 3px solid #dc3545;">
                            <div class="modal-header" style="background-color: #dc3545; color: white; padding: 15px;">
                                <h2 style="color: white; margin: 0;">Return Your Order</h2>
                                <span class="close-modal" style="color: white;">&times;</span>
                            </div>
                            <div class="modal-body">
                                <p style="margin: 15px 0;">We're sorry to hear that you'd like to return your order. To process your return request efficiently, please contact our customer support team.</p>
                                <p style="margin: 15px 0;">Our team will guide you through the return process and provide you with all necessary instructions.</p>
                                <p style="margin: 15px 0;"><a href="/shipping-returns.html" target="_blank" style="color: #dc3545; text-decoration: underline;">View our return policy</a></p>
                                <button class="btn-primary contact-support-btn" onclick="setButtonLoading(this, true); window.open('https://wa.me/918901551059?text=Hi, I would like to return my order. Order ID: ${orderId}, Tracking ID: ${trackingId}. Please assist me with the return process.', '_blank'); setTimeout(() => setButtonLoading(this, false), 1000);" style="background-color: #25d366; border-color: #25d366;">Contact Support on WhatsApp</button>
                            </div>
                        </div>
                    `;
                    document.body.appendChild(modal);
                    modal.querySelector('.close-modal').onclick = () => modal.remove();
                    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
                }
            })
            .catch(error => console.error('Error fetching order details:', error));
    }
    // Show Cancellation Reason Modal
    function showCancellationReason(orderId) {
        const modal = document.createElement('div');
        modal.className = 'address-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Cancellation Details - Order #${orderId}</h2>
                    <span class="close-modal">&times;</span>
                </div>
                <div class="modal-body">
                    <div id="reason-loading" style="text-align: center; padding: 1rem;"><div class="loading-spinner" style="display: inline-block; margin-right: 8px;"></div>Loading...</div>
                    <div id="reason-content" style="display: none;">
                        <div class="form-group">
                            <label>Cancellation Reason:</label>
                            <div id="cancel-reason" class="form-control" style="background: #f5f5f5; padding: 1rem; border-radius: 8px;"></div>
                        </div>
                        <div class="form-group">
                            <label>Additional Comments:</label>
                            <div id="cancel-comments" class="form-control" style="background: #f5f5f5; padding: 1rem; border-radius: 8px; min-height: 80px;"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('.close-modal').onclick = () => modal.remove();
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        
        // Fetch cancellation details
        clientAuthFetch(`${API_BASE_URL}/api/orders/${orderId}/cancellation`)
            .then(response => response.json())
            .then(data => {
                document.getElementById('reason-loading').style.display = 'none';
                document.getElementById('reason-content').style.display = 'block';
                document.getElementById('cancel-reason').textContent = data.reason || 'N/A';
                document.getElementById('cancel-comments').textContent = data.comments || 'N/A';
            })
            .catch(error => {
                document.getElementById('reason-loading').innerHTML = 'Error loading cancellation details';
            });
    }

    // Show Add Address Modal
    function showAddAddressModal() {
        const modal = document.createElement('div');
        modal.className = 'address-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Add New Address</h2>
                    <span class="close-modal">&times;</span>
                </div>
                <div class="modal-body">
                    <form id="add-address-form">
                        <div class="form-group">
                            <label for="add-full-name">Full Name</label>
                            <input type="text" id="add-full-name" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label for="add-mobile-no">Mobile Number</label>
                            <input type="tel" id="add-mobile-no" class="form-control" maxlength="10" pattern="[0-9]{10}" autocomplete="tel" required>
                        </div>
                        <div class="form-group">
                            <label for="add-address-line1">Address Line 1</label>
                            <input type="text" id="add-address-line1" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label for="add-address-line2">Address Line 2</label>
                            <input type="text" id="add-address-line2" class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="add-city">City</label>
                            <input type="text" id="add-city" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label for="add-pincode">Pincode</label>
                            <input type="text" id="add-pincode" class="form-control" required maxlength="6">
                            <small class="text-gray-500">District and state will be auto-filled</small>
                        </div>
                        <div class="form-group">
                            <label for="add-district">District</label>
                            <input type="text" id="add-district" class="form-control" required readonly>
                        </div>
                        <div class="form-group">
                            <label for="add-state">State</label>
                            <input type="text" id="add-state" class="form-control" required readonly>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="add-is-default">
                                Set as default address
                            </label>
                        </div>
                        <button type="submit" class="btn-primary">Add Address</button>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        // Close modal functionality
        modal.querySelector('.close-modal').onclick = () => modal.remove();
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        // Add pincode auto-fill functionality
        const addPincodeInput = modal.querySelector('#add-pincode');
        addPincodeInput.addEventListener('input', async function() {
            const pincode = this.value;
            if (pincode.length === 6) {
                try {
                    const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
                    const data = await response.json();
                    if (data[0].Status === 'Success') {
                        const postOffice = data[0].PostOffice[0];
                        document.getElementById('add-district').value = postOffice.District;
                        document.getElementById('add-state').value = postOffice.State;
                    }
                } catch (error) {
                    console.error('Error fetching pincode data:', error);
                }
            }
        });
        // Handle form submission
        modal.querySelector('#add-address-form').addEventListener('submit', function(e) {
            e.preventDefault();
            const formData = {
                fullName: document.getElementById('add-full-name').value,
                mobileNo: document.getElementById('add-mobile-no').value,
                addressLine1: document.getElementById('add-address-line1').value,
                addressLine2: document.getElementById('add-address-line2').value,
                city: document.getElementById('add-city').value,
                district: document.getElementById('add-district').value,
                state: document.getElementById('add-state').value,
                pincode: document.getElementById('add-pincode').value,
                isDefault: document.getElementById('add-is-default').checked
            };
            const submitBtn = this.querySelector('button[type="submit"]');
            setButtonLoading(submitBtn, true);
            clientAuthFetch(`${API_BASE_URL}/api/addresses`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('Address added successfully');
                    modal.remove();
                    loadAddresses();
                } else {
                    showToast('Error adding address: ' + (data.message || 'Unknown error'));
                }
            })
            .catch(error => {
                console.error('Error adding address:', error);
                showToast('Error adding address');
            })
            .finally(() => {
                setButtonLoading(submitBtn, false);
            });
        });
    }
});
