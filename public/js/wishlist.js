
document.addEventListener('DOMContentLoaded', function () {
    const wishlistContent = document.querySelector('.wishlist-content');
    const wishlistItems = document.getElementById('wishlist-items-container');
    const wishlistItemCount = document.getElementById('wishlist-item-count');
    const clearAllWishlistBtn = document.getElementById('clear-all-wishlist');
    // Always show wishlist content and load from localStorage
    if (wishlistContent) wishlistContent.style.display = 'block';
    loadWishlistFromStorage();
    // Load wishlist from localStorage only
    function loadWishlistFromStorage() {
        const localWishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
        if (localWishlist.length === 0) {
            if (wishlistItemCount) wishlistItemCount.textContent = '0 items';
            if (wishlistItems) {
                wishlistItems.classList.add('empty');
                wishlistItems.innerHTML = `
                <div class="empty-state">
                    <div class="text-6xl text-gray-300 mb-4">💝</div>
                    <h3 class="text-xl font-semibold text-gray-600 mb-2">Your wishlist is empty</h3>
                    <p class="text-gray-500 mb-6">Add some products to save for later!</p>
                    <a href="/collections.html" class="bg-blue-600 text-white py-2 px-6 rounded-lg hover:bg-blue-700 transition-all cs">
                    Continue Shopping
                    </a>
                </div>
            `;
            }
            return;
        }
        if (wishlistItemCount) wishlistItemCount.textContent = `${localWishlist.length} items`;
        if (wishlistItems) wishlistItems.innerHTML = '';
        // Create placeholder cards then fetch product details
        localWishlist.forEach((item) => {
            const productCard = document.createElement('div');
            productCard.className = 'cm';
            productCard.id = `wishlist-item-${item.id}`;
            productCard.innerHTML = `
                <div class="relative">
                    <img src="/uploads/placeholder.jpg" alt="Loading..." class="piku object-cover">
                </div>
                <div class="py-2 px-1">
                    <h3 class="font-semibold text-lg mb-1">Loading...</h3>
                    <div>
                        <div id="ecf">
                            <span class="text-pink-600 font-bold text-xl">₹0</span>
                        </div>
                    </div>
                </div>
                <div class="sc">
                    <button class="cart-btn" data-product-id="${item.id}" data-product-title="Loading...">
                        <span class="cart-btn-text">Add to Cart</span> 
                        <i class="crt fas fa-shopping-cart text-white"></i>
                    </button>
                    <button class="remove-from-wishlist-btn" data-product-id="${item.id}">
                        <i class="tr fas fa-trash"></i>
                    </button>
                </div>
            `;
            if (wishlistItems) wishlistItems.appendChild(productCard);
            // Fetch product details directly without any auth
            fetch(`/api/public/products/${item.id}`)
                .then(response => response.json())
                .then(product => {
                    const existingCard = document.getElementById(`wishlist-item-${item.id}`);
                    if (existingCard && product) {
                        const imageUrl = product.images && product.images.length > 0 ? `/uploads/${product.images[0].image_path}` : '/uploads/placeholder.jpg';
                        const priceDisplay = product.mrp ? `<span class="text-gray-500 text-sm line-through ml-2">₹${product.mrp}</span> <span class="text-pink-600 font-bold text-xl">₹${product.price}</span>` : `<span class="text-pink-600 font-bold text-xl">₹${product.price}</span>`;
                        existingCard.innerHTML = `
                            <a href="product-detail.html?product_id=${product.product_id}">
                                <div class="relative">
                                    <img src="${imageUrl}" alt="${product.title}" class="piku object-cover">
                                </div>
                                <div class="py-2 px-1">
                                    <h3 class="font-semibold text-lg mb-1">${product.title}</h3>
                                    <div>
                                        <div id="ecf">
                                            ${priceDisplay}
                                        </div>
                                    </div>
                                </div>
                            </a>
                            <div class="sc">
                                <button class="cart-btn" data-product-id="${product.product_id}" data-product-title="${product.title}">
                                    <span class="cart-btn-text">Add to Cart</span> 
                                    <i class="crt fas fa-shopping-cart text-white"></i>
                                </button>
                                <button class="remove-from-wishlist-btn" data-product-id="${product.product_id}">
                                    <i class="tr fas fa-trash"></i>
                                </button>
                            </div>
                        `;
                        // Initialize cart button
                        const cartButton = existingCard.querySelector('.cart-btn');
                        if (cartButton) {
                            const inCart = checkProductInCart(product.product_id);
                            updateAddToCartButton(cartButton, inCart);
                            cartButton.addEventListener('click', (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const currentlyInCart = checkProductInCart(product.product_id);
                                if (currentlyInCart) {
                                    removeFromCartFromListing(product.product_id, product.title);
                                    showToast('Removed from cart!');
                                } else {
                                    addToCartFromListing(product.product_id, product.title);
                                }
                            });
                        }
                    }
                })
                .catch(error => {
                    console.error('Product fetch error:', error);
                });
        });
    }
    if (clearAllWishlistBtn) {
        clearAllWishlistBtn.addEventListener('click', () => {
            localStorage.removeItem('wishlist');
            loadWishlistFromStorage();
        });
    }
    // Handle remove from wishlist button click (using event delegation)
    document.addEventListener('click', function (event) {
        if (event.target.classList.contains('remove-from-wishlist-btn') || event.target.closest('.remove-from-wishlist-btn')) {
            const button = event.target.classList.contains('remove-from-wishlist-btn') ? event.target : event.target.closest('.remove-from-wishlist-btn');
            const productId = parseInt(button.dataset.productId);
            let wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
            wishlist = wishlist.filter(item => item.id !== productId);
            localStorage.setItem('wishlist', JSON.stringify(wishlist));
            loadWishlistFromStorage();
            showToast('Removed from wishlist!');
        }
    });
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
    // Add to cart from product listing
    function addToCartFromListing(productId, productTitle) {
        let cart = JSON.parse(localStorage.getItem('cart') || '[]');
        const existingItemIndex = cart.findIndex(item => item.product_id === productId);
        const button = document.querySelector(`[data-product-id="${productId}"]`);
        if (existingItemIndex > -1) {
            cart.splice(existingItemIndex, 1);
            if (button) updateAddToCartButton(button, false);
        } else {
            cart.push({
                key: `${productId}_no-variant`,
                product_id: productId,
                title: productTitle,
                price: 0,
                variant_detail: null,
                quantity: 1,
                image: null
            });
            if (button) updateAddToCartButton(button, true);
            showToast('Added to cart!', { url: 'cart.html', text: 'View Cart' });
        }
        localStorage.setItem('cart', JSON.stringify(cart));
    }
    // Remove from cart from product listing
    function removeFromCartFromListing(productId, productTitle) {
        let cart = JSON.parse(localStorage.getItem('cart') || '[]');
        cart = cart.filter(item => item.product_id !== productId);
        localStorage.setItem('cart', JSON.stringify(cart));
        const button = document.querySelector(`[data-product-id="${productId}"]`);
        if (button) {
            updateAddToCartButton(button, false);
        }
    }
    // Check if product is in cart
    function checkProductInCart(productId) {
        const localCart = JSON.parse(localStorage.getItem('cart') || '[]');
        return localCart.some(item => item.product_id === productId);
    }
    // Update add to cart button appearance
    function updateAddToCartButton(button, inCart) {
        const textElement = button.querySelector('.cart-btn-text') || button;
        if (inCart) {
            textElement.textContent = 'Remove from Cart';
        } else {
            textElement.textContent = 'Add to Cart';
        }
    }
    // Export functions for global use
    window.cartUtils = {
        addToCartFromListing,
        removeFromCartFromListing,
        checkProductInCart,
        updateAddToCartButton
    };
});
