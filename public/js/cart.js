

// Add toast CSS if not exists
if (!document.getElementById('toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
        .toast {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: #dc3545;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 10000;
            opacity: 0;
            visibility: hidden;
            transition: all 0.3s ease;
            max-width: 90%;
            text-align: center;
        }
        .toast.show {
            opacity: 1;
            visibility: visible;
        }
    `;
    document.head.appendChild(style);
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

let cartData = {
    items: [],
    totalItems: 0,
    subtotal: 0
};

// Load cart data from localStorage
function loadCart() {
    loadCartFromLocalStorage();
}

// Render cart items
function renderCart() {
    const cartContainer = document.querySelector('.md\\:w-2\\/3 .bg-white');
    const totalItemsSpan = document.querySelector('.flex.items-center.space-x-4 span');

    if (!cartContainer) return;

    if (!cartData.cart || cartData.cart.length === 0) {
        showEmptyCart();
        return;
    }

    // Update total items count
    if (totalItemsSpan) {
        totalItemsSpan.textContent = `${cartData.totalItems} items`;
    }

    // Clear existing items
    cartContainer.innerHTML = '';

    cartData.cart.forEach(item => {
        const cartItemElement = createCartItemElement(item);
        cartContainer.appendChild(cartItemElement);
    });

    updateOrderSummary();
}

// Create cart item element
function createCartItemElement(item) {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'border-b border-gray-200 last:border-b-0';
    itemDiv.dataset.cartId = item.cart_id;
    itemDiv.dataset.productId = item.product_id;
    itemDiv.dataset.variantDetail = item.variant_detail || '';

    const imageUrl = item.image_path ? `/uploads/${item.image_path}` : 'https://placehold.co/200x200?text=No+Image';
    const displayPrice = item.price;
    const originalPrice = item.mrp && item.mrp > item.price ? item.mrp : null;

    itemDiv.innerHTML = `
        <div class="flex p-4">
            <div class="w-20 h-20 flex-shrink-0 mr-4 ">
                <a href="product-detail.html?product_id=${item.product_id}" class="block">
                    <img src="${imageUrl}" alt="${item.title}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px;" />
                </a>
            </div>
            <div class="flex-grow">
                <div class="flex justify-between">
                    <h3 class="font-medium text-gray-900">${item.title}</h3>
                    <div class="text-right">
                        ${originalPrice ? `<span class="text-sm text-gray-500 line-through">₹${originalPrice}</span><br>` : ''}
                        <span class="font-bold">₹${displayPrice}</span>
                    </div>
                </div>
                <div class="variant-dropdown-container mb-2"></div>
                <div class="flex justify-between items-center">
                    <div class="flex items-center border border-gray-200 rounded">
                        <button class="quantity-btn decrease-btn text-gray-500 hover:bg-gray-100 w-8 h-8 flex items-center justify-center" ${item.quantity <= 1 || item.stock === 0 ? 'disabled' : ''}>−</button>
                        <span class="px-4 quantity-display">${item.stock === 0 ? 0 : item.quantity}</span>
                        <button class="quantity-btn increase-btn text-gray-500 hover:bg-gray-100 w-8 h-8 flex items-center justify-center" ${item.quantity >= item.stock || item.stock === 0 ? 'disabled' : ''}>+</button>
                    </div>
                    <div class="hidden text-sm text-gray-500 mt-1">
                        ${item.stock === 0 ? 'Out of Stock' : `Stock: ${item.stock}`}
                    </div>
                </div>
                <div class="flex justify-between items-center">
                    <button class="remove-btn text-gray-500 hover:text-red-500 flex items-center text-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Remove
                    </button>
                </div>
            </div>
        </div>
    `;

    // Add event listeners
    addCartItemEventListeners(itemDiv, item);

    // Load variant dropdown
    loadVariantDropdown(itemDiv, item);

    return itemDiv;
}

// Add event listeners to cart item
function addCartItemEventListeners(itemElement, item) {
    const decreaseBtn = itemElement.querySelector('.decrease-btn');
    const increaseBtn = itemElement.querySelector('.increase-btn');
    const removeBtn = itemElement.querySelector('.remove-btn');

    decreaseBtn.addEventListener('click', () => updateQuantity(item, item.quantity - 1));
    increaseBtn.addEventListener('click', () => updateQuantity(item, item.quantity + 1));
    removeBtn.addEventListener('click', () => removeFromCart(item));
}

// Update quantity
function updateQuantity(item, newQuantity) {
    if (newQuantity < 1) return;
    
    // Validate against stock
    if (newQuantity > item.stock) {
        showToast(`Only ${item.stock} items available in stock`);
        return;
    }

    const cartItem = cartData.cart.find(cartItem => cartItem.cart_id === item.cart_id);
    if (cartItem) {
        cartItem.quantity = newQuantity;
        cartData.totalItems = cartData.cart.reduce((sum, item) => sum + item.quantity, 0);
        cartData.subtotal = cartData.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        updateLocalStorageCart();
        
        // Update quantity display and button states in real-time
        const itemElement = document.querySelector(`[data-cart-id="${item.cart_id}"]`);
        if (itemElement) {
            const quantityDisplay = itemElement.querySelector('.quantity-display');
            const increaseBtn = itemElement.querySelector('.increase-btn');
            const decreaseBtn = itemElement.querySelector('.decrease-btn');
            
            if (quantityDisplay) quantityDisplay.textContent = newQuantity;
            if (increaseBtn) increaseBtn.disabled = newQuantity >= item.stock;
            if (decreaseBtn) decreaseBtn.disabled = newQuantity <= 1;
        }
        
        // Update item reference for event listeners
        item.quantity = newQuantity;
        
        updateOrderSummary();
    }
}

// Remove item from cart
function removeFromCart(item) {
    cartData.cart = cartData.cart.filter(cartItem => cartItem.cart_id !== item.cart_id);
    cartData.totalItems = cartData.cart.reduce((sum, item) => sum + item.quantity, 0);
    cartData.subtotal = cartData.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    updateLocalStorageCart();
    renderCart();
    showToast(`${item.title} removed from cart`);
}

// Clear entire cart
function clearCart() {
    localStorage.removeItem('cart');
    cartData = { cart: [], totalItems: 0, subtotal: 0 };
    showEmptyCart();
}

// Show empty cart state
function showEmptyCart(message = 'Your cart is empty') {
    const cartContainer = document.querySelector('.md\\:w-2\\/3 .bg-white');
    const totalItemsSpan = document.querySelector('.flex.items-center.space-x-4 span');

    if (totalItemsSpan) {
        totalItemsSpan.textContent = '0 items';
    }

    if (cartContainer) {
        cartContainer.innerHTML = `
            <div class="empty-state text-center py-12">
                <div class="text-6xl text-gray-300 mb-4">🛒</div>
                <h3 class="text-xl font-semibold text-gray-600 mb-2">${message}</h3>
                <p class="text-gray-500 mb-6">Add some products to get started!</p>
                <a href="/collections.html" class="cs bg-blue-600 text-white py-2 px-6 rounded-lg hover:bg-blue-700 transition-all">
                    Continue Shopping
                </a>
            </div>
        `;
    }

    updateOrderSummary(true);
}

// Validate cart for checkout
function validateCartForCheckout() {
    for (const item of cartData.cart) {
        if (!item.variant_detail || item.stock === 0) {
            return {
                valid: false,
                message: `Please select variant for "${item.title}" or remove items with zero stock`
            };
        }
    }
    return { valid: true };
}

// Update order summary
function updateOrderSummary(isEmpty = false) {
    const subtotalElement = document.querySelector('.cart-total .space-y-2 .flex:first-child span:last-child');
    const totalElement = document.querySelector('.cart-total .border-t span:last-child');
    const checkoutBtn = document.querySelector('.cart-total button');

    if (isEmpty) {
        if (subtotalElement) subtotalElement.textContent = '₹0.00';
        if (totalElement) totalElement.textContent = '₹0.00';
        if (checkoutBtn) {
            checkoutBtn.disabled = true;
            checkoutBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
        return;
    }

    const subtotal = cartData.subtotal || 0;
    const total = subtotal;

    if (subtotalElement) subtotalElement.textContent = `₹${subtotal.toFixed(2)}`;
    if (totalElement) totalElement.textContent = `₹${total.toFixed(2)}`;

    // Always keep checkout button enabled
    if (checkoutBtn) {
        checkoutBtn.disabled = false;
        checkoutBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

// Initialize cart page
document.addEventListener('DOMContentLoaded', () => {
    // Update page elements
    updateCartPageElements();
    // Load cart data
    loadCart();
    // Add event listeners for cart actions
    addCartPageEventListeners();
});

// Update cart page elements
function updateCartPageElements() {
    // Update tax text
    const taxElement = document.querySelector('.cart-total .space-y-2 .flex:nth-child(3) span:first-child');
    if (taxElement) {
        taxElement.textContent = 'Tax';
    }

    const taxValueElement = document.querySelector('.cart-total .space-y-2 .flex:nth-child(3) span:last-child');
    if (taxValueElement) {
        taxValueElement.textContent = 'All taxes are included in the prices';
    }

    // Update continue shopping button
    const continueShoppingBtn = document.querySelector('.flex.items-center.space-x-4 button');
    if (continueShoppingBtn) {
        continueShoppingBtn.textContent = 'Clear Cart';
    }
}

// Add cart page event listeners
function addCartPageEventListeners() {
    // Clear cart button
    const clearCartBtn = document.querySelector('.flex.items-center.space-x-4 button');
    if (clearCartBtn) {
        clearCartBtn.addEventListener('click', clearCart);
    }

    // Checkout button
    const checkoutBtn = document.querySelector('.cart-total button');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', handleCheckout);
    }
}

// Handle checkout button click
async function handleCheckout(event) {
    event.preventDefault();
    
    const checkoutBtn = event.target;
    const originalText = checkoutBtn.textContent;
    
    // Show loading spinner
    checkoutBtn.innerHTML = '<div style="display: inline-block; width: 16px; height: 16px; border: 2px solid #ffffff; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div> Validating...';
    checkoutBtn.disabled = true;
    
    // Add spinner animation if not exists
    if (!document.getElementById('spinner-styles')) {
        const style = document.createElement('style');
        style.id = 'spinner-styles';
        style.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
        document.head.appendChild(style);
    }
    
    try {
        const localCart = JSON.parse(localStorage.getItem('cart') || '[]');
        
        if (localCart.length === 0) {
            showToast('Your cart is empty');
            return;
        }

        // Simulate validation delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Always validate on checkout click
        const validation = validateCartForCheckout();
        if (!validation.valid) {
            showToast(validation.message);
            return;
        }

        window.location.href = '/checkout.html';
    } finally {
        // Reset button
        checkoutBtn.innerHTML = originalText;
        checkoutBtn.disabled = false;
    }
}

// Change variant for cart item
function changeVariant(item, newVariant, currentVariant) {
    const cartItem = cartData.cart.find(cartItem => cartItem.cart_id === item.cart_id);
    if (cartItem) {
        // Update variant without re-rendering entire cart
        cartItem.variant_detail = newVariant;
        cartItem.cart_id = `${item.product_id}_${newVariant || 'no-variant'}`;
        cartItem.quantity = 1;
        
        // Update localStorage
        updateLocalStorageCart();
        
        // Update only the quantity display and image for this item
        const itemElement = document.querySelector(`[data-cart-id="${item.cart_id}"]`);
        if (itemElement) {
            const quantityDisplay = itemElement.querySelector('.quantity-display');
            if (quantityDisplay) quantityDisplay.textContent = '1';
            
            // Update image immediately based on variant
            fetch(`${API_BASE_URL}/api/public/products/${item.product_id}`)
                .then(response => response.json())
                .then(productData => {
                    const variantImage = productData.images.find(img => img.variant_detail === newVariant);
                    if (variantImage) {
                        cartItem.image_path = variantImage.image_path;
                        cartItem.stock = variantImage.stock;
                        
                        // Update image src immediately
                        const img = itemElement.querySelector('img');
                        if (img) {
                            img.src = `/uploads/${variantImage.image_path}`;
                            img.alt = `${item.title} - ${newVariant}`;
                        }
                        
                        // Update dataset for future reference
                        itemElement.dataset.variantDetail = newVariant;
                        itemElement.dataset.cartId = cartItem.cart_id;
                    }
                    updateLocalStorageCart();
                })
                .catch(error => console.error('Error fetching variant details:', error));
        }
        
        // Update totals
        cartData.totalItems = cartData.cart.reduce((sum, item) => sum + item.quantity, 0);
        cartData.subtotal = cartData.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        updateOrderSummary();
    }
}

// Load variant dropdown
function loadVariantDropdown(itemElement, item) {
    fetch(`${API_BASE_URL}/api/public/products/${item.product_id}`)
        .then(response => response.json())
        .then(product => {
            const container = itemElement.querySelector('.variant-dropdown-container');
            if (!container || !product.variant_type || !product.variant_details) return;
            
            let variantTypes = Array.isArray(product.variant_type) ? product.variant_type : [product.variant_type];
            let variantDetails = Array.isArray(product.variant_details) ? product.variant_details : [product.variant_details];
            
            // Handle single variant (Color or Size only)
            if (variantTypes.length === 1 && variantDetails.length === 1) {
                const variantType = variantTypes[0];
                const variants = variantDetails[0].split(',').map(v => v.trim()).filter(v => v);
                
                container.innerHTML = `
                    <div class="mb-2">
                        <label class="text-sm font-medium text-gray-700">${variantType}:</label>
                        <select class="variant-selector text-sm border border-gray-300 rounded px-2 py-1 ml-2">
                            <option value="">Select ${variantType}</option>
                            ${variants.map(variant => {
                                const selected = variant === item.variant_detail ? 'selected' : '';
                                const variantImage = product.images.find(img => img.variant_detail === variant);
                                const stock = variantImage ? variantImage.stock : 0;
                                const disabled = stock === 0 ? 'disabled' : '';
                                return `<option value="${variant}" ${selected} ${disabled}>${variant}${stock === 0 ? ' (Out of Stock)' : ''}</option>`;
                            }).join('')}
                        </select>
                    </div>
                `;
                
                const variantSelector = container.querySelector('.variant-selector');
                if (variantSelector) {
                    variantSelector.addEventListener('change', () => {
                        const selectedVariant = variantSelector.value;
                        const originalVariant = item.variant_detail;
                        if (selectedVariant && selectedVariant !== originalVariant) {
                            variantSelector.disabled = true;
                            
                            // Update stock and reset quantity to 1
                            const variantImage = product.images.find(img => img.variant_detail === selectedVariant);
                            if (variantImage) {
                                item.stock = variantImage.stock;
                                item.quantity = 1;
                                
                                const quantityDisplay = itemElement.querySelector('.quantity-display');
                                if (quantityDisplay) quantityDisplay.textContent = '1';
                                
                                const increaseBtn = itemElement.querySelector('.increase-btn');
                                const decreaseBtn = itemElement.querySelector('.decrease-btn');
                                
                                if (increaseBtn) {
                                    increaseBtn.disabled = variantImage.stock <= 1;
                                }
                                if (decreaseBtn) {
                                    decreaseBtn.disabled = true; // Always disabled when quantity is 1
                                }
                                
                                // Update cart data
                                const cartItem = cartData.cart.find(ci => ci.cart_id === item.cart_id);
                                if (cartItem) {
                                    cartItem.stock = variantImage.stock;
                                    cartItem.quantity = 1;
                                }
                            }
                            
                            changeVariant(item, selectedVariant, originalVariant);
                            variantSelector.disabled = false;
                        }
                    });
                }
            }
            // Handle multiple variants (Color-Size combinations)
            else if (variantTypes.length >= 2 && variantDetails.length >= 2) {
                const colors = variantDetails[0].split(',').map(c => c.trim()).filter(c => c);
                const sizes = variantDetails[1].split(',').map(s => s.trim()).filter(s => s);
                
                // Parse current variant (e.g., "Red-M" -> color: "Red", size: "M")
                const currentVariantParts = item.variant_detail ? item.variant_detail.split('-') : ['', ''];
                const currentColor = currentVariantParts[0] || '';
                const currentSize = currentVariantParts[1] || '';
                
                // Check stock for each color-size combination
                const colorStockMap = {};
                colors.forEach(color => {
                    const availableSizes = sizes.filter(size => {
                        const variantDetail = `${color}-${size}`;
                        const variantImage = product.images.find(img => img.variant_detail === variantDetail);
                        return variantImage && variantImage.stock > 0;
                    });
                    colorStockMap[color] = availableSizes.length > 0;
                });
                
                container.innerHTML = `
                    <div class="mb-2 flex gap-2">
                        <div>
                            <label class="text-sm font-medium text-gray-700">Color:</label>
                            <select class="color-selector text-sm border border-gray-300 rounded px-2 py-1 ml-1">
                                <option value="">Select Color</option>
                                ${colors.map(color => {
                                    const selected = color === currentColor ? 'selected' : '';
                                    const hasStock = colorStockMap[color];
                                    const disabled = !hasStock ? 'disabled' : '';
                                    const stockText = !hasStock ? ' (Out of Stock)' : '';
                                    return `<option value="${color}" ${selected} ${disabled}>${color}${stockText}</option>`;
                                }).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="text-sm font-medium text-gray-700">Size:</label>
                            <select class="size-selector text-sm border border-gray-300 rounded px-2 py-1 ml-1">
                                <option value="">Select Size</option>
                                ${sizes.map(size => {
                                    const selected = size === currentSize ? 'selected' : '';
                                    const variantDetail = currentColor ? `${currentColor}-${size}` : `${colors[0]}-${size}`;
                                    const variantImage = product.images.find(img => img.variant_detail === variantDetail);
                                    const hasStock = variantImage && variantImage.stock > 0;
                                    const disabled = !hasStock ? 'disabled' : '';
                                    const stockText = !hasStock ? ' (Out of Stock)' : '';
                                    return `<option value="${size}" ${selected} ${disabled}>${size}${stockText}</option>`;
                                }).join('')}
                            </select>
                        </div>
                    </div>
                `;
                
                const colorSelector = container.querySelector('.color-selector');
                const sizeSelector = container.querySelector('.size-selector');
                
                function updateSizeOptions() {
                    const selectedColor = colorSelector.value;
                    sizeSelector.innerHTML = '<option value="">Select Size</option>';
                    
                    if (selectedColor) {
                        sizes.forEach(size => {
                            const variantDetail = `${selectedColor}-${size}`;
                            const variantImage = product.images.find(img => img.variant_detail === variantDetail);
                            const hasStock = variantImage && variantImage.stock > 0;
                            const disabled = !hasStock ? 'disabled' : '';
                            const stockText = !hasStock ? ' (Out of Stock)' : '';
                            const selected = size === currentSize && selectedColor === currentColor ? 'selected' : '';
                            
                            const option = document.createElement('option');
                            option.value = size;
                            option.textContent = `${size}${stockText}`;
                            option.disabled = !hasStock;
                            option.selected = selected;
                            sizeSelector.appendChild(option);
                        });
                    }
                }
                
                function updateVariant() {
                    const selectedColor = colorSelector.value;
                    const selectedSize = sizeSelector.value;
                    
                    if (selectedColor && selectedSize) {
                        const newVariant = `${selectedColor}-${selectedSize}`;
                        if (newVariant !== item.variant_detail) {
                            const variantImage = product.images.find(img => img.variant_detail === newVariant);
                            if (variantImage) {
                                const img = itemElement.querySelector('img');
                                if (img) {
                                    img.src = `/uploads/${variantImage.image_path}`;
                                    img.alt = `${item.title} - ${newVariant}`;
                                }
                                
                                item.stock = variantImage.stock;
                                item.quantity = 1;
                                
                                const quantityDisplay = itemElement.querySelector('.quantity-display');
                                if (quantityDisplay) quantityDisplay.textContent = '1';
                                
                                const increaseBtn = itemElement.querySelector('.increase-btn');
                                const decreaseBtn = itemElement.querySelector('.decrease-btn');
                                
                                if (increaseBtn) {
                                    increaseBtn.disabled = variantImage.stock <= 1;
                                }
                                if (decreaseBtn) {
                                    decreaseBtn.disabled = true;
                                }
                                
                                const cartItem = cartData.cart.find(ci => ci.cart_id === item.cart_id);
                                if (cartItem) {
                                    cartItem.stock = variantImage.stock;
                                    cartItem.quantity = 1;
                                }
                            }
                            changeVariant(item, newVariant, item.variant_detail);
                        }
                    }
                }
                
                colorSelector.addEventListener('change', () => {
                    updateSizeOptions();
                    if (sizeSelector.value) updateVariant();
                });
                
                if (sizeSelector) sizeSelector.addEventListener('change', updateVariant);
                
                // Initialize size options
                updateSizeOptions();
            }
        })
        .catch(error => {
            console.error('Error loading variant dropdown:', error);
        });
}

// Show loading bar
function showLoadingBar() {
    const cartContainer = document.querySelector('.md\\:w-2\\/3 .bg-white');
    if (cartContainer) {
        cartContainer.innerHTML = `
            <div class="loading-container text-center py-12">
                <div class="loading-bar-container" style="width: 300px; margin: 0 auto; background: #f3f4f6; border-radius: 10px; overflow: hidden;">
                    <div class="loading-bar" style="height: 8px; background: linear-gradient(90deg, #3b82f6, #1d4ed8); width: 0%; transition: width 0.3s ease;"></div>
                </div>
                <p class="mt-4 text-gray-600">Loading cart items...</p>
            </div>
        `;
    }
}

// Update loading progress
function updateLoadingProgress(current, total) {
    const loadingBar = document.querySelector('.loading-bar');
    if (loadingBar) {
        const progress = (current / total) * 100;
        loadingBar.style.width = `${progress}%`;
    }
}

// Add spinner animation CSS
if (!document.getElementById('spinner-animation')) {
    const style = document.createElement('style');
    style.id = 'spinner-animation';
    style.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
    document.head.appendChild(style);
}

// Show loading spinner
function showLoadingSpinner() {
    const cartContainer = document.querySelector('.md\\:w-2\\/3 .bg-white');
    if (cartContainer) {
        const spinner = document.createElement('div');
        spinner.id = 'cart-loading-spinner';
        spinner.innerHTML = `
            <div style="text-align: center; padding: 15px;">
                <div style="display: inline-block; width: 20px; height: 20px; border: 2px solid #e5e7eb; border-top: 2px solid #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
                <p style="margin-top: 8px; color: #6b7280; font-size: 13px;">Loading...</p>
            </div>
        `;
        cartContainer.appendChild(spinner);
    }
}

// Remove loading spinner
function removeLoadingSpinner() {
    const spinner = document.getElementById('cart-loading-spinner');
    if (spinner) spinner.remove();
}

// Load cart from localStorage
async function loadCartFromLocalStorage() {
    const localCart = JSON.parse(localStorage.getItem('cart') || '[]');
    
    if (localCart.length === 0) {
        showEmptyCart();
        return;
    }

    const cartContainer = document.querySelector('.md\\:w-2\\/3 .bg-white');
    if (cartContainer) cartContainer.innerHTML = '';
    
    cartData = { cart: [], totalItems: 0, subtotal: 0 };
    
    // Show initial loading spinner
    showLoadingSpinner();
    
    // Load items one by one and display immediately
    for (let i = 0; i < localCart.length; i++) {
        const item = localCart[i];
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/public/products/${item.product_id}`);
            if (response.ok) {
                const product = await response.json();
                let actualStock = 999;
                
                if (item.variant_detail && product.images) {
                    const variantImage = product.images.find(img => img.variant_detail === item.variant_detail);
                    actualStock = variantImage ? variantImage.stock : 0;
                }
                
                // If no variant selected, use first available variant image
                let imagePath = item.image;
                if (!item.variant_detail && product.images) {
                    const firstAvailableImage = product.images.find(img => img.stock > 0);
                    if (firstAvailableImage) {
                        imagePath = firstAvailableImage.image_path;
                    }
                }
                
                const cartItem = {
                    cart_id: `${item.product_id}_${item.variant_detail || 'no-variant'}`,
                    product_id: item.product_id,
                    title: product.title || item.title,
                    price: parseFloat(product.price) || parseFloat(item.price) || 0,
                    mrp: parseFloat(product.mrp) || (item.mrp ? parseFloat(item.mrp) : null),
                    quantity: Math.min(parseInt(item.quantity) || 1, actualStock),
                    variant_detail: item.variant_detail,
                    image_path: imagePath,
                    stock: actualStock
                };
                
                // Add to cart data and display immediately
                cartData.cart.push(cartItem);
                cartData.totalItems = cartData.cart.reduce((sum, item) => sum + item.quantity, 0);
                cartData.subtotal = cartData.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                
                // Remove spinner and add item
                removeLoadingSpinner();
                const cartItemElement = createCartItemElement(cartItem);
                if (cartContainer) cartContainer.appendChild(cartItemElement);
                
                // Show spinner again if more items to load
                if (i < localCart.length - 1) {
                    showLoadingSpinner();
                }
                
                // Update order summary and item count
                updateOrderSummary();
                
                // Update total items count in header
                const totalItemsSpan = document.querySelector('.flex.items-center.space-x-4 span');
                if (totalItemsSpan) {
                    totalItemsSpan.textContent = `${cartData.totalItems} items`;
                }
            }
        } catch (error) {
            // Fallback to stored data if API fails
            const cartItem = {
                cart_id: `${item.product_id}_${item.variant_detail || 'no-variant'}`,
                product_id: item.product_id,
                title: item.title,
                price: parseFloat(item.price) || 0,
                mrp: item.mrp ? parseFloat(item.mrp) : null,
                quantity: parseInt(item.quantity) || 1,
                variant_detail: item.variant_detail,
                image_path: item.image,
                stock: parseInt(item.stock) || 999
            };
            
            cartData.cart.push(cartItem);
            cartData.totalItems = cartData.cart.reduce((sum, item) => sum + item.quantity, 0);
            cartData.subtotal = cartData.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            
            // Remove spinner and add item
            removeLoadingSpinner();
            const cartItemElement = createCartItemElement(cartItem);
            if (cartContainer) cartContainer.appendChild(cartItemElement);
            
            // Show spinner again if more items to load
            if (i < localCart.length - 1) {
                showLoadingSpinner();
            }
            
            updateOrderSummary();
            
            // Update total items count in header
            const totalItemsSpan = document.querySelector('.flex.items-center.space-x-4 span');
            if (totalItemsSpan) {
                totalItemsSpan.textContent = `${cartData.totalItems} items`;
            }
        }
        
        // Faster loading with minimal delay
        await new Promise(resolve => setTimeout(resolve, 50));
    }
}

// Update localStorage cart
function updateLocalStorageCart() {
    const localCart = cartData.cart.map(item => ({
        key: `${item.product_id}_${item.variant_detail || 'no-variant'}`,
        product_id: item.product_id,
        title: item.title,
        price: item.price,
        quantity: item.quantity,
        variant_detail: item.variant_detail,
        image: item.image_path
    }));
    localStorage.setItem('cart', JSON.stringify(localCart));
}

// Export functions for use in other scripts
window.cartFunctions = {
    loadCart
};