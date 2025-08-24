document.addEventListener('DOMContentLoaded', function () {
    // Load headerwomen.html content into #header div
    fetch('headerall.html')
        .then(response => response.text())
        .then(async data => {
            document.getElementById('header').innerHTML = data;
            // Add active class to nav-links based on current page
            const currentPage = window.location.pathname.split('/').pop();
            const navLinks = document.querySelectorAll('.nav-links a');
            navLinks.forEach(link => {
                if (link.getAttribute('href') === currentPage) {
                    link.classList.add('active');
                }
            });
            // Simple mobile menu toggle
            const mobileMenuButton = document.getElementById('mobile-menu-button');
            const mobileMenu = document.getElementById('mobile-menu');
            if (mobileMenuButton && mobileMenu) {
                mobileMenuButton.addEventListener('click', () => {
                    mobileMenu.classList.toggle('hidden');
                });
            }
            // Update cart count
            updateCartCount();
            try {
            } catch (error) {
                // User is not logged in
            }
        })
        .catch(error => {
            console.error('Error loading headerall:', error);
        });
});
// Function to update cart count
async function updateCartCount() {
    try {
        const authResponse = await clientAuthFetch(`${API_BASE_URL}/api/check-auth`);
        if (authResponse.ok) {
            const authData = await authResponse.json();
            if (authData.loggedIn) {
                const cartResponse = await clientAuthFetch(`${API_BASE_URL}/api/cart`);
                if (cartResponse.ok) {
                    const cartData = await cartResponse.json();
                    const count = cartData.success ? cartData.cart.reduce((sum, item) => sum + item.quantity, 0) : 0;
                    updateCartDisplay(count);
                } else {
                    updateCartDisplay(0);
                }
            } else {
                const localCart = JSON.parse(localStorage.getItem('cart') || '[]');
                const count = localCart.reduce((sum, item) => sum + item.quantity, 0);
                updateCartDisplay(count);
            }
        } else {
            const localCart = JSON.parse(localStorage.getItem('cart') || '[]');
            const count = localCart.reduce((sum, item) => sum + item.quantity, 0);
            updateCartDisplay(count);
        }
    } catch (error) {
        const localCart = JSON.parse(localStorage.getItem('cart') || '[]');
        const count = localCart.reduce((sum, item) => sum + item.quantity, 0);
        updateCartDisplay(count);
    }
}
function updateCartDisplay(count) {
    const cartCountElements = document.querySelectorAll('#cart-count');
    cartCountElements.forEach(element => {
        element.textContent = count;
        element.style.display = count > 0 ? 'flex' : 'none';
    });
}
