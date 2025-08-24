// Product cards localStorage functionality for non-logged in users
// Check if user is logged in
async function checkAuthStatus() {
    try {
        const response = await clientAuthFetch(`${API_BASE_URL}/api/check-auth`);
        const data = await response.json();
        return data.loggedIn;
    } catch (error) {
        return false;
    }
}
// Handle localStorage cart for product cards
function handleProductCardCart(productId, title, price, imagePath) {
    let cart = JSON.parse(localStorage.getItem('cart') || '[]');
    const itemKey = `${productId}_no-variant`;
    const existingItemIndex = cart.findIndex(item => item.key === itemKey);
    if (existingItemIndex > -1) {
        cart.splice(existingItemIndex, 1);
        localStorage.setItem('cart', JSON.stringify(cart));
        return false; // removed
    } else {
        cart.push({
            key: itemKey,
            product_id: productId,
            title: title,
            price: price,
            variant_detail: null,
            quantity: 1,
            image: imagePath
        });
        localStorage.setItem('cart', JSON.stringify(cart));
        return true; // added
    }
}
// Handle localStorage wishlist for product cards
function handleProductCardWishlist(productId) {
    let wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
    const itemIndex = wishlist.findIndex(item => item.id === parseInt(productId));
    if (itemIndex > -1) {
        wishlist.splice(itemIndex, 1);
        localStorage.setItem('wishlist', JSON.stringify(wishlist));
        return false; // removed
    } else {
        wishlist.push({ id: parseInt(productId) });
        localStorage.setItem('wishlist', JSON.stringify(wishlist));
        return true; // added
    }
}
// Check if product is in localStorage cart
function checkProductCardInCart(productId) {
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    const itemKey = `${productId}_no-variant`;
    return cart.some(item => item.key === itemKey);
}
// Check if product is in localStorage wishlist
function checkProductCardInWishlist(productId) {
    const wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
    return wishlist.some(item => item.id === parseInt(productId));
}
// Initialize product card buttons
async function initializeProductCardButtons() {
    const isLoggedIn = await checkAuthStatus();
    // Handle cart buttons
    document.querySelectorAll('.add-to-cart-btn').forEach(button => {
        const productId = button.dataset.productId;
        const title = button.dataset.productTitle;
        const price = button.dataset.productPrice;
        const imagePath = button.dataset.productImage;
        if (!isLoggedIn) {
            // Update button state based on localStorage
            const inCart = checkProductCardInCart(productId);
            button.textContent = inCart ? 'Remove from Cart' : 'Add to Cart';
        }
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!isLoggedIn) {
                // Handle with localStorage
                const added = handleProductCardCart(productId, title, price, imagePath);
                button.textContent = added ? 'Remove from Cart' : 'Add to Cart';
                alert(added ? 'Item added to cart!' : 'Item removed from cart!');
            } else {
                // Handle with server (existing functionality)
                try {
                    const response = await clientAuthFetch(`${API_BASE_URL}/api/cart/add`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            productId: productId,
                            quantity: 1
                        })
                    });
                    if (response.ok) {
                        alert('Item added to cart!');
                    } else {
                        alert('Failed to add to cart');
                    }
                } catch (error) {
                    alert('Error adding to cart');
                }
            }
        });
    });
    // Handle wishlist buttons
    document.querySelectorAll('.wishlist-btn').forEach(button => {
        const productId = button.dataset.productId;
        if (!isLoggedIn) {
            // Update button state based on localStorage
            const inWishlist = checkProductCardInWishlist(productId);
            const icon = button.querySelector('i');
            if (icon) {
                icon.className = inWishlist ? 'fas fa-heart' : 'far fa-heart';
            }
        }
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!isLoggedIn) {
                // Handle with localStorage
                const added = handleProductCardWishlist(productId);
                const icon = button.querySelector('i');
                if (icon) {
                    icon.className = added ? 'fas fa-heart' : 'far fa-heart';
                }
                alert(added ? 'Item added to wishlist!' : 'Item removed from wishlist!');
            } else {
                // Handle with server (existing functionality)
                try {
                    const response = await clientAuthFetch(`${API_BASE_URL}/api/wishlist/add`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ productId: parseInt(productId) })
                    });
                    if (response.ok) {
                        const icon = button.querySelector('i');
                        if (icon) {
                            icon.className = 'fas fa-heart';
                        }
                        alert('Item added to wishlist!');
                    } else {
                        alert('Failed to add to wishlist');
                    }
                } catch (error) {
                    alert('Error adding to wishlist');
                }
            }
        });
    });
}
// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeProductCardButtons();
});
