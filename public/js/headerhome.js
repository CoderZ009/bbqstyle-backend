document.addEventListener('DOMContentLoaded', function () {
    // Load headerhome.html content into #header div
    fetch('headerhome.html')
        .then(response => response.text())
        .then(data => {
            document.getElementById('header').innerHTML = data;
            // Update cart count after header is loaded
            updateCartCount();
            // After loading header, get searchBtn by id from loaded content
            const headerElement = document.getElementById('header');
            const mobileMenuButton = headerElement.querySelector('#mobile-menu-button');
            const mobileMenu = document.getElementById('mobilehc');
            if (mobileMenuButton) {
                mobileMenuButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    // Create and show mobile menu directly in body
                    let existingMenu = document.getElementById('mobile-menu-overlay');
                    if (existingMenu) {
                        existingMenu.remove();
                    } else {
                        const menuOverlay = document.createElement('div');
                        menuOverlay.id = 'mobile-menu-overlay';
                        menuOverlay.style.cssText = 'position: fixed; top: 82px; left: 0; width: 100%; z-index: 9999; background-color: #3e39d5cb; padding: 8px 16px;';
                        menuOverlay.innerHTML = `
                            <button style="display: block; padding: 8px; color: burlywood; background: none; border: none; text-align: left;">Home Decor <i class="fas fa-chevron-down"></i></button>
                            <a href="towel.html" style="display: block; padding: 8px 16px; color: black;">Towels</a>
                            <a href="bedsheet.html" style="display: block; padding: 8px 16px; color: black;">Bedsheets</a>
                            <a href="soft-toy.html" style="display: block; padding: 8px 16px; color: black;">Soft Toys</a>
                            <a href="kitchen-utility.html" style="display: block; padding: 8px 16px; color: black;">Kitchen Utility</a>
                            <a href="index.html" style="display: block; padding: 8px 16px; color: burlywood;">Home</a>
                            <a href="collections.html" style="display: block; padding: 8px 16px; color: burlywood;">Collections</a>
                            <a href="about-us.html" style="display: block; padding: 8px 16px; color: burlywood;">About Us</a>
                            <a href="contact-us.html" style="display: block; padding: 8px 16px; color: burlywood;">Contact Us</a>
                        `;
                        document.body.appendChild(menuOverlay);
                    }
                });
            }
            // Highlight active menu item based on current URL by appending 'a' to className without extra space
            const currentPath = window.location.pathname.split('/').pop().toLowerCase();
            const navLinks = headerElement.querySelectorAll('.nav-link, .navsub a, #mobilehc a');
            navLinks.forEach(link => {
                const href = link.getAttribute('href');
                if (href && href.toLowerCase() === currentPath) {
                    if (!link.className.includes('a')) {
                        link.className += 'a';
                    }
                }
            });
            // DOM Elements
            const searchBtn = document.getElementById('searchBtn');
            const searchBtnDesktop = document.getElementById('searchBtnDesktop');
            const searchContainer = document.getElementById('searchContainer');
            const closeSearch = document.getElementById('closeSearch');
            const searchInput = document.getElementById('searchInput');
            const searchIcon = document.getElementById('searchIcon');
            const bgOverlay = document.getElementById('bgOverlay');
            const filterOptions = document.querySelectorAll('.filter-option');
            const searchResults = document.getElementById('searchResults');
            const paginationControls = document.getElementById('pagination-controls');
            if (!searchResults) return;
            // Pagination state
            let currentPage = 1;
            const productsPerPage = 40;
            let currentProducts = [];
            // Helper function to add product to wishlist
            function addToWishlist(product) {
                let wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
                if (!wishlist.some(item => item.id === product.product_id)) {
                    wishlist.push({ id: product.product_id });
                    localStorage.setItem('wishlist', JSON.stringify(wishlist));
                }
            }
            // Helper function to remove product from wishlist
            function removeFromWishlist(productId) {
                let wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
                wishlist = wishlist.filter(item => item.id !== productId);
                localStorage.setItem('wishlist', JSON.stringify(wishlist));
            }
            // Check if product is in wishlist
            function isProductInWishlist(productId) {
                const localWishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
                return localWishlist.some(item => item.id === productId);
            }
            // Helper function to create product card HTML
            function createProductCardHtml(product, userWishlist = []) {
                const imageUrl = product.image_path ? `/uploads/${product.image_path}` : '/uploads/1753715285993.jpg';
                const priceDisplay = product.mrp ? `<span class="text-gray-500 text-sm line-through ml-2">₹${product.mrp}</span> <span class="text-pink-600 font-bold text-xl">₹${product.price}</span>` : `<span class="text-pink-600 font-bold text-xl">₹${product.price}</span>`;
                const isInWishlist = userWishlist.includes(product.product_id);
                const wishlistButtonIcon = isInWishlist ? 'fas fa-heart' : 'far fa-heart';
                const wishlistButtonClass = isInWishlist ? 'remove-from-wishlist-btn' : 'wishlist-btn';
                const wishlistButtonAriaLabel = isInWishlist ? 'Remove from wishlist' : 'Add to wishlist';
                return `
                    <a href="product-detail.html?product_id=${product.product_id}">
                        <div class="relative">
                            <img src="${imageUrl}"
                                alt="Fabulous designer latest bedsheet home living item fashion by BBQSTYLE women men trend sale ${product.title}"
                                class="piku object-cover">
                        </div>
                        <div class="py-2 px-1">
                            <h3 class="font-semibold text-lg mb-1">${product.title}</h3>
                            <div class="">
                                <div id="ecf">
                                    ${priceDisplay}
                                </div>
                            </div>
                        </div>
                    </a>
                    <div class="sc">
                        <button class="cart-btn" data-product-id="${product.product_id}" data-product-title="${product.title}">
                            <span class="cart-btn-text">Add to Cart</span> <i class="t fas fa-shopping-cart text-white"></i>
                        </button>
                        <button class="${wishlistButtonClass}" aria-label="${wishlistButtonAriaLabel}" data-product-id="${product.product_id}">
                            <i class="${wishlistButtonIcon}"></i>
                        </button>
                    </div>
                `;
            }
            // Initialize with all products
            document.addEventListener('productsLoaded', () => {
                currentProducts = window.products;
                currentPage = 1;
                renderPage();
            });
            // Toggle search overlay
            searchBtn.addEventListener('click', () => {
                searchContainer.classList.add('active');
                bgOverlay.classList.add('active');
                searchInput.focus();
            });
            // Desktop search button
            if (searchBtnDesktop) {
                searchBtnDesktop.addEventListener('click', () => {
                    searchContainer.classList.add('active');
                    bgOverlay.classList.add('active');
                    searchInput.focus();
                });
            }
            // Close search overlay
            closeSearch.addEventListener('click', () => {
                searchContainer.classList.remove('active');
                bgOverlay.classList.remove('active');
            });
            bgOverlay.addEventListener('click', () => {
                searchContainer.classList.remove('active');
                bgOverlay.classList.remove('active');
            });
            // Close search overlay on ESC key press
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    searchContainer.classList.remove('active');
                    bgOverlay.classList.remove('active');
                }
            });
            // Handle search functionality
            searchIcon.addEventListener('click', performSearch);
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    performSearch();
                }
            });
            function performSearch() {
                const searchTerm = searchInput.value.toLowerCase();
                const activeFilter = document.querySelector('.filter-option.active').textContent;
                let filteredProducts = window.products;
                // Filter by category if not "All"
                if (activeFilter !== 'All') {
                    filteredProducts = window.products.filter(product =>
                        product.category === activeFilter
                    );
                }
                // Further filter by search term if one exists
                if (searchTerm.trim() !== '') {
                    filteredProducts = filteredProducts.filter(product =>
                        product.title.toLowerCase().includes(searchTerm)
                    );
                }
                currentProducts = filteredProducts;
                currentPage = 1;
                renderPage();
                searchContainer.classList.remove('active');
                bgOverlay.classList.remove('active');
            }
            function renderPage() {
                displayProducts(currentProducts.slice((currentPage - 1) * productsPerPage, currentPage * productsPerPage));
                renderPaginationControls();
            }
            function displayProducts(productsToDisplay) {
                if (!searchResults) return;
                searchResults.innerHTML = '';
                if (productsToDisplay.length === 0) {
                    searchResults.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">No products found matching your search.</p>';
                    return;
                }
                // Get wishlist from localStorage
                const localWishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
                const userWishlist = localWishlist.map(item => item.id);
                productsToDisplay.forEach(product => {
                    const productCard = document.createElement('div');
                    productCard.className = 'cm';
                    productCard.innerHTML = createProductCardHtml(product, userWishlist);
                    searchResults.appendChild(productCard);
                    // Add direct event listeners to buttons
                    const cartBtn = productCard.querySelector('.cart-btn');
                    const wishlistBtn = productCard.querySelector('.wishlist-btn, .remove-from-wishlist-btn');
                    if (cartBtn) {
                        cartBtn.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const productId = parseInt(cartBtn.dataset.productId);
                            const productTitle = cartBtn.dataset.productTitle;
                            const inCart = checkProductInCart(productId);
                            if (inCart) {
                                removeFromCartFromListing(productId, productTitle);
                                updateAddToCartButton(cartBtn, false);
                                showToast('Removed from cart!');
                            } else {
                                addToCartFromListing(productId, productTitle);
                                updateAddToCartButton(cartBtn, true);
                                showToast('Added to cart!', { url: 'cart.html', text: 'View Cart' });
                            }
                        });
                    }
                    if (wishlistBtn) {
                        wishlistBtn.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const productId = parseInt(wishlistBtn.dataset.productId);
                            const currentlyInWishlist = isProductInWishlist(productId);
                            if (currentlyInWishlist) {
                                removeFromWishlist(productId);
                                wishlistBtn.className = 'wishlist-btn';
                                wishlistBtn.querySelector('i').className = 'far fa-heart';
                                wishlistBtn.setAttribute('aria-label', 'Add to wishlist');
                                showToast('Removed from wishlist!');
                            } else {
                                addToWishlist(product);
                                wishlistBtn.className = 'remove-from-wishlist-btn';
                                wishlistBtn.querySelector('i').className = 'fas fa-heart';
                                wishlistBtn.setAttribute('aria-label', 'Remove from wishlist');
                                showToast('Added to wishlist!', { url: 'wishlist.html', text: 'View Wishlist' });
                            }
                        });
                    }
                });
                // Update cart button states
                productsToDisplay.forEach(product => {
                    const inCart = checkProductInCart(product.product_id);
                    const button = searchResults.querySelector(`[data-product-id="${product.product_id}"].cart-btn`);
                    if (button) {
                        updateAddToCartButton(button, inCart);
                    }
                });
            }
            function renderPaginationControls() {
                if (!paginationControls) return;
                paginationControls.innerHTML = '';
                const totalPages = Math.ceil(currentProducts.length / productsPerPage);
                // Previous arrow
                const prevButton = document.createElement('button');
                prevButton.innerHTML = '&#8592;'; // Left arrow
                prevButton.className = 'pagination-arrow';
                prevButton.disabled = currentPage === 1;
                prevButton.addEventListener('click', () => {
                    if (currentPage > 1) {
                        currentPage--;
                        renderPage();
                    }
                });
                paginationControls.appendChild(prevButton);
                // Page indicator
                const pageIndicator = document.createElement('span');
                pageIndicator.className = 'pagination-page-indicator';
                pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
                pageIndicator.style.alignSelf = 'center';
                pageIndicator.style.margin = '0 10px';
                paginationControls.appendChild(pageIndicator);
                // Next arrow
                const nextButton = document.createElement('button');
                nextButton.innerHTML = '&#8594;'; // Right arrow
                nextButton.className = 'pagination-arrow';
                nextButton.disabled = currentPage === totalPages;
                nextButton.addEventListener('click', () => {
                    if (currentPage < totalPages) {
                        currentPage++;
                        renderPage();
                    }
                });
                paginationControls.appendChild(nextButton);
            }
            // Cart utility functions for product listing pages
            // Add to cart from product listing
            function addToCartFromListing(productId, productTitle) {
                let cart = JSON.parse(localStorage.getItem('cart') || '[]');
                // Check if already in cart
                if (!cart.some(item => item.product_id == productId)) {
                    cart.push({
                        key: `${productId}_no-variant`,
                        product_id: productId,
                        title: productTitle,
                        price: 0,
                        variant_detail: null,
                        quantity: 1,
                        image: null
                    });
                    localStorage.setItem('cart', JSON.stringify(cart));
                }
                const button = document.querySelector(`[data-product-id="${productId}"].cart-btn`);
                if (button) updateAddToCartButton(button, true);
            }
            // Remove from cart from product listing
            function removeFromCartFromListing(productId, productTitle) {
                let cart = JSON.parse(localStorage.getItem('cart') || '[]');
                cart = cart.filter(item => item.product_id != productId);
                localStorage.setItem('cart', JSON.stringify(cart));
                const button = document.querySelector(`[data-product-id="${productId}"].cart-btn`);
                if (button) {
                    updateAddToCartButton(button, false);
                }
            }
            // Check if product is in cart
            function checkProductInCart(productId) {
                const cart = JSON.parse(localStorage.getItem('cart') || '[]');
                return cart.some(item => item.product_id == productId);
            }
            // Update add to cart button appearance
            function updateAddToCartButton(button, inCart) {
                const textElement = button.querySelector('.cart-btn-text') || button;
                const cartIcon = button.querySelector('.t');
                if (inCart) {
                    textElement.textContent = 'Remove from Cart';
                    textElement.classList.add('remove-text');
                    if (cartIcon) cartIcon.classList.add('remove-cart-icon');
                } else {
                    textElement.textContent = 'Add to Cart';
                    textElement.classList.remove('remove-text');
                    if (cartIcon) cartIcon.classList.remove('remove-cart-icon');
                }
            }
            // Initialize cart buttons for product listing page
            function initializeCartButtons() {
                const cartButtons = document.querySelectorAll('.cart-btn[data-product-id]');
                const wishlistButtons = document.querySelectorAll('.wishlist-btn[data-product-id], .remove-from-wishlist-btn[data-product-id]');
                // Initialize cart buttons
                for (const button of cartButtons) {
                    const productId = button.dataset.productId;
                    const productTitle = button.dataset.productTitle || 'Product';
                    // Check if product is in cart and update button
                    const inCart = checkProductInCart(productId);
                    updateAddToCartButton(button, inCart);
                    // Add click event listener
                    button.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const currentlyInCart = checkProductInCart(productId);
                        if (currentlyInCart) {
                            removeFromCartFromListing(productId, productTitle);
                            showToast('Removed from cart!');
                        } else {
                            addToCartFromListing(productId, productTitle);
                            showToast('Added to cart!', { url: 'cart.html', text: 'View Cart' });
                        }
                    });
                }
                // Initialize wishlist buttons
                for (const button of wishlistButtons) {
                    const productId = parseInt(button.dataset.productId);
                    const isInWishlist = isProductInWishlist(productId);
                    // Update wishlist button appearance
                    if (isInWishlist) {
                        button.className = 'remove-from-wishlist-btn';
                        const icon = button.querySelector('i');
                        if (icon) icon.className = 'fas fa-heart';
                        button.setAttribute('aria-label', 'Remove from wishlist');
                    } else {
                        button.className = 'wishlist-btn';
                        const icon = button.querySelector('i');
                        if (icon) icon.className = 'far fa-heart';
                        button.setAttribute('aria-label', 'Add to wishlist');
                    }
                    // Add click event listener
                    button.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const currentlyInWishlist = isProductInWishlist(productId);
                        if (currentlyInWishlist) {
                            removeFromWishlist(productId);
                            button.className = 'wishlist-btn';
                            const icon = button.querySelector('i');
                            if (icon) icon.className = 'far fa-heart';
                            button.setAttribute('aria-label', 'Add to wishlist');
                            showToast('Removed from wishlist!');
                        } else {
                            addToWishlist({ product_id: productId });
                            button.className = 'remove-from-wishlist-btn';
                            const icon = button.querySelector('i');
                            if (icon) icon.className = 'fas fa-heart';
                            button.setAttribute('aria-label', 'Remove from wishlist');
                            showToast('Added to wishlist!', { url: 'wishlist.html', text: 'View Wishlist' });
                        }
                    });
                }
            }
            // Add cart button to product card (for dynamic content)
            function addCartButtonToProductCard(productCard, product) {
                // Check if button already exists
                if (productCard.querySelector('[data-product-id]')) {
                    return;
                }
                const cartButton = document.createElement('button');
                cartButton.className = 'w-full bg-black text-white py-2 px-4 rounded hover:bg-gray-800 transition-all mt-2';
                cartButton.dataset.productId = product.product_id || product.id;
                cartButton.dataset.productTitle = product.title || product.name;
                cartButton.innerHTML = '<span class="cart-btn-text">Add to Cart</span>';
                // Find a good place to insert the button (usually after price or in a button container)
                const priceElement = productCard.querySelector('.price, .text-lg, .font-bold');
                if (priceElement) {
                    priceElement.parentNode.insertBefore(cartButton, priceElement.nextSibling);
                } else {
                    productCard.appendChild(cartButton);
                }
                // Initialize this specific button
                initializeSingleCartButton(cartButton);
            }
            // Initialize a single cart button
            function initializeSingleCartButton(button) {
                const productId = button.dataset.productId;
                const productTitle = button.dataset.productTitle || 'Product';
                // Check if product is in cart and update button
                const inCart = checkProductInCart(productId);
                updateAddToCartButton(button, inCart);
                // Add click event listener (remove existing ones first)
                const newButton = button.cloneNode(true);
                button.parentNode.replaceChild(newButton, button);
                newButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const currentlyInCart = checkProductInCart(productId);
                    if (currentlyInCart) {
                        removeFromCartFromListing(productId, productTitle);
                        showToast('Removed from cart!');
                    } else {
                        addToCartFromListing(productId, productTitle);
                        showToast('Added to cart!', { url: 'cart.html', text: 'View Cart' });
                    }
                });
            }
            // Export functions for global use
            window.cartUtils = {
                addToCartFromListing,
                removeFromCartFromListing,
                checkProductInCart,
                updateAddToCartButton,
                initializeCartButtons,
                addCartButtonToProductCard,
                initializeSingleCartButton
            };
            // Auto-initialize on DOM content loaded
            document.addEventListener('DOMContentLoaded', () => {
                initializeCartButtons();
            })
        })
        .catch(error => {
            console.error('Error loading headerhome:', error);
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
    // Make showToast globally available
    window.showToast = showToast;
});
function updateCartCount() {
    const localCart = JSON.parse(localStorage.getItem('cart') || '[]');
    const count = localCart.reduce((sum, item) => sum + item.quantity, 0);
    updateCartDisplay(count);
}
function updateCartDisplay(count) {
    const cartCountElements = document.querySelectorAll('#cart-count');
    cartCountElements.forEach(element => {
        element.textContent = count;
        element.style.display = count > 0 ? 'flex' : 'none';
    });
}
