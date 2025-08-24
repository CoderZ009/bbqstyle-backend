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
    }, 4000);
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
    if (decreaseBtn) decreaseBtn.addEventListener('click', () => updateQuantity(item, item.quantity - 1));
    if (increaseBtn) increaseBtn.addEventListener('click', () => updateQuantity(item, item.quantity + 1));
    if (removeBtn) removeBtn.addEventListener('click', () => removeFromCart(item));
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
        renderCart();
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
function handleCheckout() {
    const localCart = JSON.parse(localStorage.getItem('cart') || '[]');
    if (localCart.length === 0) {
        showToast('Your cart is empty');
        return;
    }
    // Redirect to checkout page
    window.location.href = '/checkout.html';
}
// Change variant for cart item
function changeVariant(item, newVariant, currentVariant) {
    const cartItem = cartData.cart.find(cartItem => cartItem.cart_id === item.cart_id);
    if (cartItem) {
        // Fetch product details to get new variant image and stock
        fetch(`${API_BASE_URL}/api/public/products/${item.product_id}`)
            .then(response => response.json())
            .then(product => {
                const variantImage = product.images.find(img => img.variant_detail === newVariant);
                cartItem.variant_detail = newVariant;
                cartItem.cart_id = `${item.product_id}_${newVariant || 'no-variant'}`;
                cartItem.image_path = variantImage ? variantImage.image_path : cartItem.image_path;
                cartItem.stock = variantImage ? variantImage.stock : 999;
                cartItem.quantity = 1;
                updateLocalStorageCart();
                renderCart();
            })
            .catch(error => {
                console.error('Error fetching variant details:', error);
                cartItem.variant_detail = newVariant;
                cartItem.cart_id = `${item.product_id}_${newVariant || 'no-variant'}`;
                updateLocalStorageCart();
                renderCart();
            });
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
            // Check if we have single variant (Color or Size only)
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
                            changeVariant(item, selectedVariant, originalVariant);
                            variantSelector.disabled = false;
                        }
                    });
                }
            }
        })
        .catch(error => {
            console.error('Error loading variant dropdown:', error);
        });
}
// Load cart from localStorage
function loadCartFromLocalStorage() {
    const localCart = JSON.parse(localStorage.getItem('cart') || '[]');
    
    if (localCart.length === 0) {
        showEmptyCart();
        return;
    }

    // Convert localStorage cart to display format
    const cartItems = localCart.map(item => ({
        cart_id: `${item.product_id}_${item.variant_detail || 'no-variant'}`,
        product_id: item.product_id,
        title: item.title,
        price: item.price,
        mrp: item.mrp || null,
        quantity: item.quantity,
        variant_detail: item.variant_detail,
        image_path: item.image,
        stock: 999
    }));

    cartData = {
        cart: cartItems,
        totalItems: cartItems.reduce((sum, item) => sum + item.quantity, 0),
        subtotal: cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    };
    renderCart();
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
