// Auth helper functions
function getClientAuthHeaders() {
    const token = localStorage.getItem('userToken');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}
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
class CheckoutManager {
    constructor() {
        this.currentStep = 1;
        this.selectedAddress = null;
        this.cartItems = [];
        this.orderSummary = {
            subtotal: 0,
            discount: 0,
            total: 0
        };
        this.appliedOfferCode = null;
        this.orderPlaced = false;
        this.init();
    }
    async init() {
        await this.checkAuth();
        await this.loadAddresses();
        await this.loadCartItems();
        this.setupEventListeners();
        this.updateOrderSummary();
    }
    async checkAuth() {
        const token = localStorage.getItem('userToken');
        if (!token) {
            this.isLoggedIn = false;
            this.userId = null;
            return;
        }
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const currentTime = Date.now() / 1000;
            if (payload.exp && payload.exp < currentTime) {
                localStorage.removeItem('userToken');
                this.isLoggedIn = false;
                this.userId = null;
                return;
            }
            this.isLoggedIn = true;
            this.userId = payload.userId || payload.id;
        } catch (error) {
            console.error('Invalid token:', error);
            localStorage.removeItem('userToken');
            this.isLoggedIn = false;
            this.userId = null;
        }
    }
    async loadAddresses() {
        try {
            let addresses = [];
            if (this.isLoggedIn && this.userId) {
                const response = await clientAuthFetch(`${API_BASE_URL}/api/addresses`);
                const data = await response.json();
                addresses = data.success ? data.addresses : [];
            } else {
                // Load from localStorage for guest users
                const localAddresses = JSON.parse(localStorage.getItem('addresses') || '[]');
                addresses = localAddresses;
            }
            this.populateAddressDropdown(addresses);
        } catch (error) {
            console.error('Failed to load addresses:', error);
            // Fallback to localStorage if API fails
            const localAddresses = JSON.parse(localStorage.getItem('addresses') || '[]');
            this.populateAddressDropdown(localAddresses);
        }
    }
    populateAddressDropdown(addresses) {
        const select = document.getElementById('addressSelect');
        // Clear existing options except the first two
        while (select.children.length > 2) {
            select.removeChild(select.lastChild);
        }
        addresses.forEach(address => {
            const option = document.createElement('option');
            const addressId = address.address_id || address.addressId;
            const fullName = address.full_name || address.fullName;
            const addressLine1 = address.address_line1 || address.addressLine1;
            const city = address.city;
            const pincode = address.pincode;
            const isDefault = address.is_default || address.isDefault;
            option.value = addressId;
            option.textContent = `${fullName}, ${addressLine1}, ${city} - ${pincode}`;
            if (isDefault) {
                option.selected = true;
                this.selectedAddress = addressId;
                this.updateNextButton();
            }
            select.appendChild(option);
        });
    }
    async loadCartItems() {
        try {
            if (this.userId) {
                const response = await clientAuthFetch(`${API_BASE_URL}/api/cart`);
                const data = await response.json();
                if (data.success) {
                    this.cartItems = data.cart;
                    this.orderSummary.subtotal = data.subtotal;
                    this.orderSummary.total = data.subtotal;
                    this.updateOrderSummary();
                } else {
                    alert('Failed to load cart items');
                    window.location.href = '/cart.html';
                }
            } else {
                // Load from localStorage for guest users
                const localCart = JSON.parse(localStorage.getItem('cart') || '[]');
                if (localCart.length === 0) {
                    alert('Your cart is empty');
                    window.location.href = '/cart.html';
                    return;
                }
                // Transform localStorage cart format
                this.cartItems = localCart.map(item => ({
                    product_id: item.product_id,
                    title: item.title,
                    price: item.price,
                    quantity: item.quantity,
                    variant_detail: item.variant_detail
                }));
                this.orderSummary.subtotal = localCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                this.orderSummary.total = this.orderSummary.subtotal;
                this.updateOrderSummary();
            }
        } catch (error) {
            console.error('Failed to load cart:', error);
            alert('Failed to load cart items');
            window.location.href = '/cart.html';
        }
    }
    setupEventListeners() {
        // Address selection
        document.getElementById('addressSelect').addEventListener('change', (e) => {
            if (e.target.value === 'add-new') {
                this.showAddressForm();
                this.selectedAddress = null;
                this.updateNextButton();
            } else if (e.target.value === '') {
                this.selectedAddress = null;
                this.hideAddressForm();
                this.updateNextButton();
            } else {
                this.selectedAddress = e.target.value;
                this.hideAddressForm();
                this.updateNextButton();
            }
        });
        // Address form
        document.getElementById('newAddressForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveNewAddress();
        });
        // Pincode auto-fill
        document.getElementById('pincode').addEventListener('input', (e) => {
            const pincode = e.target.value;
            if (pincode.length === 6) {
                this.fetchLocationFromPincode(pincode);
            }
        });
        document.getElementById('cancelAddress').addEventListener('click', () => {
            this.hideAddressForm();
            document.getElementById('addressSelect').value = '';
        });
        // Navigation buttons
        document.getElementById('nextToPayment').addEventListener('click', async () => {
            const addressSelect = document.getElementById('addressSelect');
            // If add-new is selected, save address first
            if (addressSelect.value === 'add-new') {
                await this.saveNewAddress();
                if (!this.selectedAddress) {
                    return; // Don't proceed if address save failed
                }
            }
            if (!this.userId) {
                await this.verifyGuestUser();
            } else {
                this.goToStep(2);
            }
        });
        document.getElementById('backToAddress').addEventListener('click', () => {
            this.goToStep(1);
        });
        // Payment method
        const paymentRadios = document.querySelectorAll('input[name="paymentMethod"]');
        paymentRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.handlePaymentMethodChange(e.target.value);
            });
        });
        // Initialize payment method display
        const checkedRadio = document.querySelector('input[name="paymentMethod"]:checked');
        if (checkedRadio) {
            this.handlePaymentMethodChange(checkedRadio.value);
        }
        // Order confirmation
        document.getElementById('confirmOrder').addEventListener('click', () => {
            this.showConfirmModal();
        });
        document.getElementById('cancelConfirm').addEventListener('click', () => {
            this.hideConfirmModal();
        });
        document.getElementById('finalConfirm').addEventListener('click', () => {
            this.placeOrder();
        });
        // Promo code
        document.getElementById('applyPromoBtn').addEventListener('click', () => {
            this.applyPromoCode();
        });
    }
    showAddressForm() {
        const form = document.getElementById('addressForm');
        if (form) {
            form.classList.remove('hidden');
        }
    }
    hideAddressForm() {
        const form = document.getElementById('addressForm');
        if (form) {
            form.classList.add('hidden');
            document.getElementById('newAddressForm').reset();
        }
    }
    updateNextButton() {
        const nextBtn = document.getElementById('nextToPayment');
        const addressSelect = document.getElementById('addressSelect');
        const isAddNewSelected = addressSelect.value === 'add-new';
        // Enable next button if address is selected OR if add-new form is visible
        nextBtn.disabled = !this.selectedAddress && !isAddNewSelected;
    }
    async saveNewAddress() {
        const formData = new FormData(document.getElementById('newAddressForm'));
        const addressData = {
            fullName: formData.get('fullName'),
            mobileNo: formData.get('mobileNo'),
            addressLine1: formData.get('addressLine1'),
            addressLine2: formData.get('addressLine2'),
            city: formData.get('city'),
            district: formData.get('district'),
            state: formData.get('state'),
            pincode: formData.get('pincode'),
            isDefault: formData.get('isDefault') === 'on',
            isGuest: !this.userId
        };
        try {
            if (this.isLoggedIn && this.userId) {
                // Save to database for logged-in users
                const response = await clientAuthFetch(`${API_BASE_URL}/api/addresses`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(addressData)
                });
                const data = await response.json();
                if (data.success) {
                    this.selectedAddress = data.addressId;
                } else {
                    alert(data.message || 'Failed to save address');
                    return;
                }
            } else {
                // Save to localStorage only for guest users
                const addressId = Date.now().toString();
                const localAddresses = JSON.parse(localStorage.getItem('addresses') || '[]');
                localAddresses.push({
                    addressId: addressId,
                    ...addressData
                });
                localStorage.setItem('addresses', JSON.stringify(localAddresses));
                this.selectedAddress = addressId;
            }
            await this.loadAddresses();
            this.hideAddressForm();
            this.updateNextButton();
            document.getElementById('addressSelect').value = this.selectedAddress;
        } catch (error) {
            console.error('Failed to save address:', error);
            alert('Failed to save address');
        }
    }
    goToStep(step) {
        document.getElementById(`step${this.currentStep}`).classList.remove('active');
        document.getElementById(`step${this.currentStep}`).classList.add('hidden');
        document.getElementById(`step${step}`).classList.remove('hidden');
        document.getElementById(`step${step}`).classList.add('active');
        this.currentStep = step;
    }
    handlePaymentMethodChange(method) {
        const cashfreeSection = document.getElementById('cashfreeSection');
        if (cashfreeSection) {
            if (method === 'Online') {
                cashfreeSection.classList.remove('hidden');
            } else {
                cashfreeSection.classList.add('hidden');
            }
        }
    }
    updateOrderSummary() {
        const orderItemsContainer = document.getElementById('orderItems');
        orderItemsContainer.innerHTML = '';
        this.cartItems.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'order-item';
            itemDiv.innerHTML = `
                <div class="item-details">
                    <div class="item-name">${item.title}</div>
                    ${item.variant_detail ? `<div class="item-variant">${item.variant_detail}</div>` : ''}
                </div>
                <div class="item-quantity">Qty: ${item.quantity}</div>
                <div class="item-price">₹${(item.price * item.quantity).toFixed(2)}</div>
            `;
            orderItemsContainer.appendChild(itemDiv);
        });
        document.getElementById('subtotalAmount').textContent = `₹${this.orderSummary.subtotal.toFixed(2)}`;
        document.getElementById('discountAmount').textContent = `-₹${this.orderSummary.discount.toFixed(2)}`;
        document.getElementById('totalAmount').textContent = `₹${this.orderSummary.total.toFixed(2)}`;
    }
    showConfirmModal() {
        document.getElementById('confirmModal').classList.remove('hidden');
    }
    hideConfirmModal() {
        document.getElementById('confirmModal').classList.add('hidden');
    }
    async verifyGuestUser() {
        const selectedAddressId = this.selectedAddress;
        if (!selectedAddressId) {
            alert('Please select an address first');
            return;
        }
        // Get mobile number from selected address
        const mobileInput = document.getElementById('mobileNo');
        let mobile = null;
        if (selectedAddressId === 'add-new' || !selectedAddressId) {
            // New address form
            mobile = mobileInput.value;
        } else {
            // Get mobile from existing address
            mobile = await this.getMobileFromAddress(selectedAddressId);
        }
        if (!mobile) {
            alert('Mobile number is required for verification');
            return;
        }
        // Send OTP and show form
        const otpVerified = await this.verifyGuestOTP(mobile);
        if (otpVerified) {
            this.goToStep(2);
        }
    }
    async getMobileFromAddress(addressId) {
        try {
            if (!this.isLoggedIn) {
                // Check localStorage for guest addresses
                const localAddresses = JSON.parse(localStorage.getItem('addresses') || '[]');
                const address = localAddresses.find(addr => (addr.addressId || addr.address_id) == addressId);
                return address ? (address.mobileNo || address.mobile_no) : null;
            }
            const response = await clientAuthFetch(`${API_BASE_URL}/api/addresses/${addressId}`);
            const data = await response.json();
            return data.success ? data.address.mobile_no : null;
        } catch (error) {
            console.error('Failed to get address details:', error);
            return null;
        }
    }
    async verifyGuestOTP(mobile) {
        return new Promise((resolve) => {
            // Create OTP modal
            const otpModal = document.createElement('div');
            otpModal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
            otpModal.innerHTML = `
                <div class="bg-white p-6 rounded-lg max-w-md w-full mx-4">
                    <h3 class="text-lg font-semibold mb-4">Verify Your Mobile Number</h3>
                    <p class="text-gray-600 mb-4">Enter the OTP sent to ${mobile}</p>
                    <input type="text" id="otpInput" class="w-full border border-gray-300 rounded px-3 py-2 mb-4" placeholder="Enter 6-digit OTP" maxlength="6">
                    <div class="text-red-600 text-sm mb-4 hidden" id="otpError"></div>
                    <div class="flex gap-3">
                        <button id="verifyOtpBtn" class="flex-1 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700">Verify</button>
                        <button id="cancelOtpBtn" class="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded hover:bg-gray-400">Cancel</button>
                    </div>
                    <button id="resendOtpBtn" class="w-full mt-3 text-gray-400 text-sm cursor-not-allowed" disabled>Resend OTP (60s)</button>
                </div>
            `;
            document.body.appendChild(otpModal);
            const otpInput = otpModal.querySelector('#otpInput');
            const verifyBtn = otpModal.querySelector('#verifyOtpBtn');
            const cancelBtn = otpModal.querySelector('#cancelOtpBtn');
            const resendBtn = otpModal.querySelector('#resendOtpBtn');
            const errorDiv = otpModal.querySelector('#otpError');
            // Focus on input
            otpInput.focus();
            // Send initial OTP
            this.sendOTP(mobile);
            // Start resend timer
            this.startResendTimer(resendBtn);
            // Event listeners
            verifyBtn.addEventListener('click', async () => {
                const otp = otpInput.value.trim();
                if (!otp) {
                    this.showOtpError(errorDiv, 'Please enter OTP');
                    return;
                }
                const verified = await this.verifyOTP(mobile, otp, errorDiv);
                if (verified) {
                    // If user doesn't exist, create account
                    if (!this.isLoggedIn) {
                        await this.createGuestAccount(mobile);
                    }
                    document.body.removeChild(otpModal);
                    resolve(true);
                }
            });
            cancelBtn.addEventListener('click', () => {
                document.body.removeChild(otpModal);
                resolve(false);
            });
            resendBtn.addEventListener('click', () => {
                if (!resendBtn.disabled) {
                    this.sendOTP(mobile);
                    this.showOtpError(errorDiv, 'OTP resent successfully', 'text-green-600');
                    this.startResendTimer(resendBtn);
                }
            });
            // Enter key to verify
            otpInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    verifyBtn.click();
                }
            });
        });
    }
    async sendOTP(mobile) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/send-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mobile })
            });
            return await response.json();
        } catch (error) {
            console.error('Failed to send OTP:', error);
            return { success: false };
        }
    }
    async verifyOTP(mobile, otp, errorDiv) {
        try {
            // First verify OTP
            const otpResponse = await fetch(`${API_BASE_URL}/api/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mobile, otp })
            });
            const otpData = await otpResponse.json();
            if (!otpData.success) {
                this.showOtpError(errorDiv, 'Invalid or expired OTP');
                return false;
            }
            // OTP verified, now check if user exists
            const userCheckResponse = await fetch(`${API_BASE_URL}/api/mobile-login-check`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mobile })
            });
            const userCheckData = await userCheckResponse.json();
            if (userCheckData.success) {
                // User exists, login directly
                const loginResponse = await fetch(`${API_BASE_URL}/api/mobile-login-direct`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mobile })
                });
                const loginData = await loginResponse.json();
                if (loginData.success && loginData.token) {
                    localStorage.setItem('userToken', loginData.token);
                    this.isLoggedIn = true;
                    await this.checkAuth();
                    return true;
                }
            }
            // User doesn't exist, return true to indicate OTP verified
            // Account creation will be handled in verifyGuestOTP
            return true;
        } catch (error) {
            console.error('OTP verification failed:', error);
            this.showOtpError(errorDiv, 'Verification failed');
            return false;
        }
    }
    showOtpError(errorDiv, message, className = 'text-red-600') {
        errorDiv.textContent = message;
        errorDiv.className = `text-sm mb-4 ${className}`;
        errorDiv.classList.remove('hidden');
        setTimeout(() => {
            if (className === 'text-green-600') {
                errorDiv.classList.add('hidden');
            }
        }, 3000);
    }
    async createGuestAccount(mobile) {
        try {
            // Get address details for account creation
            const selectedAddressId = this.selectedAddress;
            let addressData = null;
            if (!this.isLoggedIn) {
                const localAddresses = JSON.parse(localStorage.getItem('addresses') || '[]');
                addressData = localAddresses.find(addr => (addr.addressId || addr.address_id) == selectedAddressId);
            }
            if (!addressData) {
                // Get from form if new address
                const fullName = document.getElementById('fullName')?.value || '';
                addressData = { fullName, mobileNo: mobile };
            }
            // Parse name
            const fullName = addressData.fullName || addressData.full_name || '';
            const nameParts = fullName.trim().split(' ');
            const firstName = nameParts[0] || 'User';
            const lastName = nameParts.slice(1).join(' ') || 'Name';
            // Create account
            const response = await fetch(`${API_BASE_URL}/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    first_name: firstName,
                    last_name: lastName,
                    mobile
                })
            });
            const data = await response.json();
            if (data.success && data.token) {
                localStorage.setItem('userToken', data.token);
                this.isLoggedIn = true;
                await this.checkAuth();
                // Migrate localStorage addresses to database
                await this.migrateLocalAddresses();
                await this.loadAddresses();
            }
        } catch (error) {
            console.error('Failed to create guest account:', error);
        }
    }
    async fetchLocationFromPincode(pincode) {
        try {
            const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
            const data = await response.json();
            if (data[0].Status === 'Success' && data[0].PostOffice.length > 0) {
                const location = data[0].PostOffice[0];
                document.getElementById('district').value = location.District;
                document.getElementById('state').value = location.State;
            }
        } catch (error) {
            console.error('Error fetching location:', error);
        }
    }
    async migrateLocalAddresses() {
        try {
            const localAddresses = JSON.parse(localStorage.getItem('addresses') || '[]');
            const addressMapping = {};
            for (const address of localAddresses) {
                const addressData = {
                    fullName: address.fullName,
                    mobileNo: address.mobileNo,
                    addressLine1: address.addressLine1,
                    addressLine2: address.addressLine2,
                    city: address.city,
                    district: address.district,
                    state: address.state,
                    pincode: address.pincode,
                    isDefault: address.isDefault || false
                };
                const response = await clientAuthFetch(`${API_BASE_URL}/api/addresses`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(addressData)
                });
                const result = await response.json();
                if (result.success) {
                    const oldId = address.addressId || address.address_id;
                    addressMapping[oldId] = result.addressId;
                    // Update selected address if it matches
                    if (this.selectedAddress == oldId) {
                        this.selectedAddress = result.addressId;
                    }
                }
            }
            // Clear localStorage addresses after migration
            localStorage.removeItem('addresses');
        } catch (error) {
            console.error('Error migrating addresses:', error);
        }
    }
    startResendTimer(resendBtn) {
        let timeLeft = 60;
        resendBtn.disabled = true;
        resendBtn.className = 'w-full mt-3 text-gray-400 text-sm cursor-not-allowed';
        const timer = setInterval(() => {
            timeLeft--;
            resendBtn.textContent = `Resend OTP (${timeLeft}s)`;
            if (timeLeft <= 0) {
                clearInterval(timer);
                resendBtn.disabled = false;
                resendBtn.className = 'w-full mt-3 text-blue-600 hover:text-blue-800 text-sm cursor-pointer';
                resendBtn.textContent = 'Resend OTP';
            }
        }, 1000);
    }
    async applyPromoCode() {
        const promoInput = document.getElementById('promoCodeInput');
        const promoMessage = document.getElementById('promoMessage');
        const promoCode = promoInput.value.trim();
        if (!promoCode) {
            return;
        }
        try {
            const response = await fetch(`${API_BASE_URL}/api/apply-promo`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ promoCode })
            });
            const data = await response.json();
            if (data.success) {
                this.appliedOfferCode = promoCode;
                this.orderSummary.discount = data.discountAmount;
                this.orderSummary.total = this.orderSummary.subtotal - data.discountAmount;
                promoMessage.textContent = `Promo code applied! You saved ₹${data.discountAmount}`;
                promoMessage.className = 'mt-2 text-sm text-green-600';
                promoMessage.classList.remove('hidden');
                this.updateOrderSummary();
                promoInput.value = '';
            } else {
                promoMessage.textContent = data.message || 'Invalid promo code';
                promoMessage.className = 'mt-2 text-sm text-red-600';
                promoMessage.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Error applying promo code:', error);
            promoMessage.textContent = 'Failed to apply promo code';
            promoMessage.className = 'mt-2 text-sm text-red-600';
            promoMessage.classList.remove('hidden');
        }
    }
    async placeOrder() {
        // Prevent multiple orders from single session
        if (this.orderPlaced) {
            return;
        }
        this.orderPlaced = true;
        const confirmBtn = document.getElementById('finalConfirm');
        confirmBtn.textContent = 'Processing...';
        confirmBtn.disabled = true;
        const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
        // Get variant types for each item
        const itemsWithVariants = await Promise.all(
            this.cartItems.map(async (item) => {
                let variantType = null;
                try {
                    const response = await fetch(`${API_BASE_URL}/api/public/products/${item.product_id}`);
                    if (response.ok) {
                        const product = await response.json();
                        if (product.variant_type) {
                            variantType = Array.isArray(product.variant_type) ? product.variant_type.join(',') : product.variant_type;
                        }
                    }
                } catch (error) {
                    console.error('Error fetching product variant type:', error);
                }
                return {
                    productId: item.product_id,
                    quantity: item.quantity,
                    price: item.price,
                    variantType: variantType,
                    variantDetail: item.variant_detail || null
                };
            })
        );
        const orderData = {
            addressId: this.selectedAddress,
            paymentMode: paymentMethod,
            subtotal: this.orderSummary.subtotal,
            discount: this.orderSummary.discount,
            totalAmount: this.orderSummary.total,
            items: itemsWithVariants,
            offerCode: this.appliedOfferCode || null
        };
        try {
            if (paymentMethod === 'Online') {
                // Create payment session for online payment
                const paymentResponse = await clientAuthFetch(`${API_BASE_URL}/api/create-payment-session`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(orderData)
                });
                const paymentData = await paymentResponse.json();
                if (paymentData.success) {
                    // Initialize Cashfree payment
                    const cashfree = Cashfree({
                        mode: window.location.protocol === 'https:' ? 'production' : 'sandbox'
                    });
                    const checkoutOptions = {
                        paymentSessionId: paymentData.paymentSessionId,
                        redirectTarget: '_self'
                    };
                    cashfree.checkout(checkoutOptions);
                } else {
                    alert(paymentData.message || 'Failed to create payment session');
                }
            } else {
                // Validate address exists before placing order
                const addressResponse = await clientAuthFetch(`${API_BASE_URL}/api/addresses`);
                const addressData = await addressResponse.json();
                if (!addressData.success) {
                    alert('Failed to verify address. Please try again.');
                    this.orderPlaced = false;
                    confirmBtn.textContent = 'Yes, Place Order';
                    confirmBtn.disabled = false;
                    return;
                }
                const addressExists = addressData.addresses.some(addr => 
                    (addr.address_id || addr.addressId) == this.selectedAddress
                );
                if (!addressExists) {
                    alert('Selected address is invalid. Please select a valid address.');
                    await this.loadAddresses();
                    this.orderPlaced = false;
                    confirmBtn.textContent = 'Yes, Place Order';
                    confirmBtn.disabled = false;
                    return;
                }
                // Process COD order
                const response = await clientAuthFetch(`${API_BASE_URL}/api/orders`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(orderData)
                });
                const data = await response.json();
                if (data.success) {
                    // Update offer usage for COD orders
                    if (this.appliedOfferCode) {
                        await fetch(`${API_BASE_URL}/api/update-offer-usage`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ offerCode: this.appliedOfferCode })
                        });
                    }
                    alert('Order placed successfully!');
                    if (this.isLoggedIn) {
                        await clientAuthFetch(`${API_BASE_URL}/api/cart/clear`, { method: 'POST' });
                    } else {
                        localStorage.removeItem('cart');
                    }
                    window.location.href = '/order-success.html?orderId=' + data.orderId;
                } else {
                    alert(data.message || 'Failed to place order');
                    // Reset flag on failure to allow retry
                    this.orderPlaced = false;
                    const confirmBtn = document.getElementById('finalConfirm');
                    confirmBtn.textContent = 'Yes, Place Order';
                    confirmBtn.disabled = false;
                }
            }
        } catch (error) {
            console.error('Failed to place order:', error);
            alert('Failed to place order');
            // Reset flag on error to allow retry
            this.orderPlaced = false;
            const confirmBtn = document.getElementById('finalConfirm');
            confirmBtn.textContent = 'Yes, Place Order';
            confirmBtn.disabled = false;
        } finally {
            this.hideConfirmModal();
        }
    }
}
// Initialize checkout when page loads
document.addEventListener('DOMContentLoaded', () => {
    new CheckoutManager();
});
