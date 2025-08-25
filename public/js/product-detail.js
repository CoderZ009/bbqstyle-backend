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
// Utility function to get query parameter by name
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
};
// Function to fetch product data by product_id from API
async function fetchProductData(productId) {
    try {
        const product = await fetch(`${API_BASE_URL}/api/public/products/${productId}`).then(r => r.json());
        product.reviews = await fetch(`${API_BASE_URL}/api/public/reviews?product_id=${productId}`).then(r => r.ok ? r.json() : []).catch(() => []);
        return product;
    } catch (error) {
        return null;
    }
};
// Function to populate product detail page with product data
function populateProductDetail(product) {
    if (!product) {
        document.querySelector('.product-details h1').textContent = 'Product not found';
        return;
    }
    // Set product title
    const titleElement = document.querySelector('.product-details h1');
    if (titleElement) titleElement.textContent = product.title || 'No title available';
    // Set breadcrumb product name
    const breadcrumbProductNameElement = document.querySelector('#product-name.text-gray-500');
    if (breadcrumbProductNameElement) breadcrumbProductNameElement.textContent = product.title || 'Product Name';
    // Set breadcrumb
    // Set price with MRP if available
    const priceElement = document.querySelector('.product-details .text-2xl.font-bold');
    if (priceElement) {
        if (product.mrp && product.mrp > product.price) {
            priceElement.innerHTML = `<span class="line-through text-gray-500 mr-2">₹${product.mrp}</span> <span>₹${product.price}</span>`;
        } else if (product.price) {
            priceElement.textContent = `₹${product.price}`;
        } else {
            priceElement.textContent = 'Price not available';
        }
    }
    // Set product meta information
    const skuElement = document.getElementById('product-sku');
    if (skuElement) skuElement.textContent = product.sku || 'N/A';
    const brandElement = document.getElementById('product-brand');
    if (brandElement) brandElement.textContent = product.brand || 'N/A';
    const categoryElement = document.getElementById('product-category');
    if (categoryElement) {
        categoryElement.textContent = product.category_name || 'N/A';
    }
    const breadcrumbCollectionElement = document.querySelector('#product-collection');
    if (breadcrumbCollectionElement) {
        breadcrumbCollectionElement.textContent = product.collection_name || 'N/A';
        if (product.collection_name === "Women's Collection") {
            breadcrumbCollectionElement.href = "women's.html";
        } else if (product.collection_name === "Men's Collection") {
            breadcrumbCollectionElement.href = "men's.html";
        } else if (product.collection_name === "Home Decor") {
            breadcrumbCollectionElement.href = "home-decor.html";
        } else {
            breadcrumbCollectionElement.href = `/collections.html?collection=${encodeURIComponent(product.collection_name || '')}`;
        }
    }
    const metaCollectionElement = document.getElementById('product-meta-collection');
    if (metaCollectionElement) {
        metaCollectionElement.textContent = product.collection_name || 'N/A';
        if (product.collection_name === "Women's Collection") {
            metaCollectionElement.href = "women's.html";
        } else if (product.collection_name === "Men's Collection") {
            metaCollectionElement.href = "men's.html";
        } else if (product.collection_name === "Home Decor") {
            metaCollectionElement.href = "home-decor.html";
        } else {
            metaCollectionElement.href = `/collections.html?collection=${encodeURIComponent(product.collection_name || '')}`;
        }
    }
    // Set description
    const descriptionParagraph = document.getElementById('product-description-text');
    if (descriptionParagraph) descriptionParagraph.innerHTML = product.description || 'No description available';
    // Set main image
    const mainImage = document.querySelector('.main-image');
    if (mainImage && product.images && product.images.length > 0) {
        const firstImage = product.images[0];
        if (firstImage.image_path) {
            mainImage.src = `/uploads/${firstImage.image_path}`;
            mainImage.alt = product.title || 'Product image';
        }
    }
    // Update review summary
    const reviewSummary = document.getElementById('review-summary');
    if (reviewSummary && product.reviews) {
        const totalReviews = product.reviews.length;
        const avgRating = totalReviews > 0 ? (product.reviews.reduce((sum, r) => sum + r.star_rating, 0) / totalReviews).toFixed(1) : 0;
        const starCounts = {
            5: product.reviews.filter(r => r.star_rating === 5).length,
            4: product.reviews.filter(r => r.star_rating === 4).length,
            3: product.reviews.filter(r => r.star_rating === 3).length,
            2: product.reviews.filter(r => r.star_rating === 2).length,
            1: product.reviews.filter(r => r.star_rating === 1).length
        };
        const roundedRating = Math.round(avgRating * 2) / 2;
        const fullStars = Math.floor(roundedRating);
        const halfStar = roundedRating % 1 !== 0;
        const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);
        reviewSummary.innerHTML = `
            <div class="star-rating mr-2">
                ${'<i class="fas fa-star"></i>'.repeat(fullStars)}
                ${'<i class="fas fa-star-half-alt"></i>'.repeat(halfStar ? 1 : 0)}
                ${'<i class="far fa-star"></i>'.repeat(emptyStars)}
            </div>
            <span class="text-gray-600">(${totalReviews} reviews)</span>
        `;
    }
    // Load reviews for this product
    loadReviews(product.product_id, product.title);
    // Update color and size options or show all images for no-variant products
    const variantContainer = document.getElementById('variant-options-container');
    const sizeContainer = document.getElementById('size-selection-container');
    if (!product.variant_type || !product.variant_details) {
        // No variants - show all product images
        const mainImage = document.querySelector('.main-image');
        const thumbnailsContainer = document.querySelector('.thumbnails');
        if (thumbnailsContainer) thumbnailsContainer.innerHTML = '';
        const productImages = product.images.filter(img => img.image_path);
        if (productImages.length > 0) {
            if (mainImage) mainImage.src = `/uploads/${productImages[0].image_path}`;
            productImages.forEach((image, index) => {
                if (thumbnailsContainer) {
                    const thumbnailDiv = document.createElement('div');
                    thumbnailDiv.className = `thumbnail ${index === 0 ? 'active' : 'cursor-pointer'}`;
                    const img = document.createElement('img');
                    img.src = `/uploads/${image.image_path}`;
                    img.alt = `${product.title} ${index + 1}`;
                    img.className = 'imgt';
                    thumbnailDiv.appendChild(img);
                    thumbnailsContainer.appendChild(thumbnailDiv);
                    thumbnailDiv.addEventListener('click', () => {
                        document.querySelectorAll('.thumbnail').forEach(t => t.classList.remove('active'));
                        thumbnailDiv.classList.add('active');
                        if (mainImage) mainImage.src = img.src;
                    });
                }
            });
        }
        // Update stock and quantity for no-variant products
        const stock = productImages.length > 0 ? productImages[0].stock : 0;
        updateQuantitySelector(product, null, stock);
    } else if (variantContainer && product.variant_type && product.variant_details) {
        let variantTypes = Array.isArray(product.variant_type) ? product.variant_type : [product.variant_type];
        let variantDetails = Array.isArray(product.variant_details) ? product.variant_details : [product.variant_details];
        // Check if we have single variant (Color or Size only)
        if (variantTypes.length === 1 && variantDetails.length === 1) {
            const variantType = variantTypes[0];
            const variants = variantDetails[0].split(',').map(v => v.trim()).filter(v => v);
            // Create variant selection
            variantContainer.innerHTML = `
                <h3 class="font-bold mb-2">${variantType}</h3>
                <div class="flex flex-wrap gap-2 mb-6" id="variant-options"></div>
            `;
            const variantOptionsDiv = document.getElementById('variant-options');
            variants.forEach(variant => {
                const variantElement = document.createElement('span');
                // Check stock for this variant
                const variantImage = product.images.find(img => 
                    img.variant_detail && img.variant_detail.toLowerCase() === variant.toLowerCase()
                );
                const stock = variantImage ? variantImage.stock : 0;
                const isOutOfStock = stock === 0;
                variantElement.className = `variant-option inline-block px-3 py-1 mr-2 mb-2 border border-gray-300 rounded w-fit ${
                    isOutOfStock ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-gray-100'
                }`;
                variantElement.innerHTML = isOutOfStock ? 
                    `<span style="text-decoration: line-through;">${variant}</span> (Out of Stock)` : 
                    variant;
                variantElement.dataset.variant = variant;
                variantElement.addEventListener('click', function() {
                    // Don't allow selection of out of stock variants
                    if (isOutOfStock) return;
                    // Update selected variant styling
                    variantOptionsDiv.querySelectorAll('.variant-option').forEach(opt => {
                        opt.classList.remove('bg-gray-200', 'font-bold');
                    });
                    this.classList.add('bg-gray-200', 'font-bold');
                    // Update images for selected variant
                    if (variantType === 'Color') {
                        updateColorImages(product, variant);
                    } else {
                        updateVariantImages(product, variant);
                    }
                    // Update quantity selector
                    updateQuantitySelector(product, variant);
                    // Update cart button
                    updateCartButton(product);
                });
                variantOptionsDiv.appendChild(variantElement);
            });
            // Set first available variant as default
            if (variants.length > 0) {
                const firstAvailableVariant = variants.find(variant => {
                    const variantImage = product.images.find(img => 
                        img.variant_detail && img.variant_detail.toLowerCase() === variant.toLowerCase()
                    );
                    return variantImage && variantImage.stock > 0;
                });
                if (firstAvailableVariant) {
                    const firstVariantElement = variantOptionsDiv.querySelector(`[data-variant="${firstAvailableVariant}"]`);
                    if (firstVariantElement) {
                        firstVariantElement.classList.add('bg-gray-200', 'font-bold');
                        if (variantType === 'Color') {
                            updateColorImages(product, firstAvailableVariant);
                        } else {
                            updateVariantImages(product, firstAvailableVariant);
                        }
                        updateQuantitySelector(product, firstAvailableVariant);
                    }
                }
            }
        }
        // Check if we have Color and Size variants
        else if (variantTypes.length >= 2 && variantDetails.length >= 2) {
            const colors = variantDetails[0].split(',').map(c => c.trim()).filter(c => c);
            const sizes = variantDetails[1].split(',').map(s => s.trim()).filter(s => s);
            // Create color selection
            variantContainer.innerHTML = `
                <h3 class="font-bold mb-2">Color</h3>
                <div class="flex flex-wrap gap-2 mb-6" id="color-options"></div>
            `;
            const colorOptionsDiv = document.getElementById('color-options');
            colors.forEach(color => {
                const colorElement = document.createElement('span');
                // Check if all sizes for this color are out of stock
                const allSizesOutOfStock = sizes.every(size => {
                    const variantDetail = `${color}-${size}`;
                    const variantImage = product.images.find(img => img.variant_detail === variantDetail);
                    return !variantImage || variantImage.stock === 0;
                });
                colorElement.className = `color-option inline-block px-3 py-1 mr-2 mb-2 border border-gray-300 rounded w-fit ${
                    allSizesOutOfStock ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-gray-100'
                }`;
                colorElement.innerHTML = allSizesOutOfStock ? 
                    `<span style="text-decoration: line-through;">${color}</span> (Out of Stock)` : 
                    color;
                colorElement.dataset.color = color;
                colorElement.addEventListener('click', function() {
                    // Don't allow selection of out of stock colors
                    if (allSizesOutOfStock) return;
                    // Update selected color styling
                    colorOptionsDiv.querySelectorAll('.color-option').forEach(opt => {
                        opt.classList.remove('bg-gray-200', 'font-bold');
                    });
                    this.classList.add('bg-gray-200', 'font-bold');
                    // Update images for selected color
                    updateColorImages(product, color);
                    // Show size selector and populate with available sizes for this color
                    updateSizeOptions(product, color, sizes);
                });
                colorOptionsDiv.appendChild(colorElement);
            });
            // Show size container
            if (sizeContainer) sizeContainer.style.display = 'block';
            // Set first available color as default
            if (colors.length > 0) {
                const firstAvailableColor = colors.find(color => {
                    return sizes.some(size => {
                        const variantDetail = `${color}-${size}`;
                        const variantImage = product.images.find(img => img.variant_detail === variantDetail);
                        return variantImage && variantImage.stock > 0;
                    });
                });
                if (firstAvailableColor) {
                    const firstColorElement = colorOptionsDiv.querySelector(`[data-color="${firstAvailableColor}"]`);
                    if (firstColorElement) {
                        firstColorElement.classList.add('bg-gray-200', 'font-bold');
                        updateColorImages(product, firstAvailableColor);
                        updateSizeOptions(product, firstAvailableColor, sizes);
                    }
                }
            }
        }
    }
};
async function loadReviews(productId, productName) {
    const reviewsListContainer = document.getElementById('reviews-list');
    const reviewSummaryContainer = document.querySelector('.review-summary');
    const reviewFiltersContainer = document.getElementById('review-filters');
    if (!reviewsListContainer || !reviewSummaryContainer || !reviewFiltersContainer) return;
    try {
        const reviews = await fetch(`${API_BASE_URL}/api/public/reviews?product_id=${productId}`).then(r => r.json()).catch(() => []);
        // Calculate average rating and star counts
        const totalReviews = reviews.length;
        const avgRating = totalReviews > 0 ? (reviews.reduce((sum, r) => sum + r.star_rating, 0) / totalReviews).toFixed(1) : 0;
        const starCounts = {
            5: reviews.filter(r => r.star_rating === 5).length,
            4: reviews.filter(r => r.star_rating === 4).length,
            3: reviews.filter(r => r.star_rating === 3).length,
            2: reviews.filter(r => r.star_rating === 2).length,
            1: reviews.filter(r => r.star_rating === 1).length
        };
        const roundedRating = Math.round(avgRating * 2) / 2;
        const fullStars = Math.floor(roundedRating);
        const halfStar = roundedRating % 1 !== 0;
        const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);
        reviewSummaryContainer.innerHTML = `
            <div class="flex items-center mb-4 md:mb-0">
                <div class="mr-4 text-4xl font-bold">${avgRating}</div>
                <div>
                    <div class="star-rating mb-1">
                        ${'<i class="fas fa-star"></i>'.repeat(fullStars)}
                        ${'<i class="fas fa-star-half-alt"></i>'.repeat(halfStar ? 1 : 0)}
                        ${'<i class="far fa-star"></i>'.repeat(emptyStars)}
                    </div>
                    <div class="text-sm text-gray-600">Based on ${totalReviews} reviews</div>
                </div>
            </div>
        `;
        // Update review filters
        reviewFiltersContainer.innerHTML = `
            <button class="bg-gray-200 hover:bg-gray-300 py-1 px-3 rounded-full text-sm" data-star-filter="all">All Reviews</button>
            <button class="bg-gray-100 hover:bg-gray-200 py-1 px-3 rounded-full text-sm" data-star-filter="5">5 Stars (${starCounts[5]})</button>
            <button class="bg-gray-100 hover:bg-gray-200 py-1 px-3 rounded-full text-sm" data-star-filter="4">4 Stars (${starCounts[4]})</button>
            <button class="bg-gray-100 hover:bg-gray-200 py-1 px-3 rounded-full text-sm" data-star-filter="3">3 Stars (${starCounts[3]})</button>
            <button class="bg-gray-100 hover:bg-gray-200 py-1 px-3 rounded-full text-sm" data-star-filter="2">2 Stars (${starCounts[2]})</button>
            <button class="bg-gray-100 hover:bg-gray-200 py-1 px-3 rounded-full text-sm" data-star-filter="1">1 Star (${starCounts[1]})</button>
        `;
        // Add event listeners to filter buttons
        reviewFiltersContainer.querySelectorAll('button').forEach(button => {
            button.addEventListener('click', () => {
                const filter = button.dataset.starFilter;
                const filteredReviews = filter === 'all' ? reviews : reviews.filter(r => r.star_rating.toString() === filter);
                renderReviews(filteredReviews);
            });
        });
        // Initial render of all reviews
        renderReviews(reviews);
    } catch (error) {
        console.error('Error loading reviews:', error);
        reviewsListContainer.innerHTML = '<p class="text-red-500">Failed to load reviews.</p>';
    }
}
function renderReviews(reviews, page = 1, reviewsPerPage = 5) {
    const reviewsListContainer = document.getElementById('reviews-list');
    const paginationContainer = document.getElementById('reviews-pagination');
    reviewsListContainer.innerHTML = '';
    paginationContainer.innerHTML = '';
    if (reviews.length === 0) {
        reviewsListContainer.innerHTML = '<p class="text-gray-600">No reviews for this filter.</p>';
        return;
    }
    const totalPages = Math.ceil(reviews.length / reviewsPerPage);
    const startIndex = (page - 1) * reviewsPerPage;
    const endIndex = startIndex + reviewsPerPage;
    const paginatedReviews = reviews.slice(startIndex, endIndex);
    paginatedReviews.forEach(review => {
        const reviewCard = document.createElement('div');
        reviewCard.className = 'review-card pb-6 border-b border-gray-200 last:border-b-0';
        reviewCard.innerHTML = `
            <div class="flex items-start mb-2">
                <div class="star-rating mr-2">
                    ${'<i class="fas fa-star"></i>'.repeat(review.star_rating)}
                    ${'<i class="far fa-star"></i>'.repeat(5 - review.star_rating)}
                </div>
                <h3 class="font-bold">${review.review_title || ''}</h3>
            </div>
            <div class="text-sm text-gray-500 mb-3">By ${review.first_name || 'Anonymous'} on ${new Date(review.created_at).toLocaleDateString()}</div>
            <p class="text-gray-700 mb-2">${review.review_text}</p>
        `;
        reviewsListContainer.appendChild(reviewCard);
    });
    if (totalPages > 1) {
        for (let i = 1; i <= totalPages; i++) {
            const pageButton = document.createElement('button');
            pageButton.className = `px-3 py-1 border rounded ${i === page ? 'bg-black text-white' : 'bg-white'}`;
            pageButton.textContent = i;
            pageButton.addEventListener('click', () => {
                renderReviews(reviews, i, reviewsPerPage);
            });
            paginationContainer.appendChild(pageButton);
        }
    }
}
// Function to update images based on selected variant
function updateVariantImages(product, selectedVariant) {
    const mainImage = document.querySelector('.main-image');
    const thumbnailsContainer = document.querySelector('.thumbnails');
    if (thumbnailsContainer) thumbnailsContainer.innerHTML = '';
    const variantImages = product.images.filter(image =>
        image.variant_detail && image.variant_detail.toLowerCase() === selectedVariant.toLowerCase()
    );
    if (variantImages.length > 0) {
        if (mainImage && variantImages[0].image_path) {
            mainImage.src = `/uploads/${variantImages[0].image_path}`;
        }
        // Get unique images for this variant
        const uniqueImages = [];
        const seenPaths = new Set();
        variantImages.forEach(image => {
            if (image.image_path && !seenPaths.has(image.image_path)) {
                uniqueImages.push(image);
                seenPaths.add(image.image_path);
            }
        });
        uniqueImages.forEach((image, index) => {
            if (thumbnailsContainer) {
                const thumbnailDiv = document.createElement('div');
                thumbnailDiv.className = `thumbnail ${index === 0 ? 'active' : 'cursor-pointer'}`;
                const img = document.createElement('img');
                img.src = `/uploads/${image.image_path}`;
                img.alt = `${product.title} - ${selectedVariant} ${index + 1}`;
                img.className = 'imgt';
                thumbnailDiv.appendChild(img);
                thumbnailsContainer.appendChild(thumbnailDiv);
                thumbnailDiv.addEventListener('click', () => {
                    document.querySelectorAll('.thumbnail').forEach(t => t.classList.remove('active'));
                    thumbnailDiv.classList.add('active');
                    if (mainImage) mainImage.src = img.src;
                });
            }
        });
    } else {
        if (mainImage) mainImage.src = 'https://via.placeholder.com/400x400?text=No+Image+Available';
    }
}
// Function to update images based on selected color
function updateColorImages(product, selectedColor) {
    const mainImage = document.querySelector('.main-image');
    const thumbnailsContainer = document.querySelector('.thumbnails');
    if (thumbnailsContainer) thumbnailsContainer.innerHTML = '';
    const colorImages = product.images.filter(image =>
        image.variant_detail && image.variant_detail.toLowerCase().includes(selectedColor.toLowerCase())
    );
    if (colorImages.length > 0) {
        if (mainImage && colorImages[0].image_path) {
            mainImage.src = `/uploads/${colorImages[0].image_path}`;
        }
        // Get unique images for this color
        const uniqueImages = [];
        const seenPaths = new Set();
        colorImages.forEach(image => {
            if (image.image_path && !seenPaths.has(image.image_path)) {
                uniqueImages.push(image);
                seenPaths.add(image.image_path);
            }
        });
        uniqueImages.forEach((image, index) => {
            if (thumbnailsContainer) {
                const thumbnailDiv = document.createElement('div');
                thumbnailDiv.className = `thumbnail ${index === 0 ? 'active' : 'cursor-pointer'}`;
                const img = document.createElement('img');
                img.src = `/uploads/${image.image_path}`;
                img.alt = `${product.title} - ${selectedColor} ${index + 1}`;
                img.className = 'imgt';
                thumbnailDiv.appendChild(img);
                thumbnailsContainer.appendChild(thumbnailDiv);
                thumbnailDiv.addEventListener('click', () => {
                    document.querySelectorAll('.thumbnail').forEach(t => t.classList.remove('active'));
                    thumbnailDiv.classList.add('active');
                    if (mainImage) mainImage.src = img.src;
                });
            }
        });
    } else {
        if (mainImage) mainImage.src = 'https://via.placeholder.com/400x400?text=No+Image+Available';
    }
}
// Function to update size options based on selected color
function updateSizeOptions(product, selectedColor, allSizes) {
    const sizeSelector = document.getElementById('size-selector');
    if (!sizeSelector) return;
    sizeSelector.innerHTML = '<option value="">Select Size</option>';
    allSizes.forEach(size => {
        const variantDetail = `${selectedColor}-${size}`;
        const variantImage = product.images.find(img => img.variant_detail === variantDetail);
        const stock = variantImage ? variantImage.stock : 0;
        const option = document.createElement('option');
        option.value = size;
        option.textContent = stock > 0 ? size : `${size} (Out of Stock)`;
        option.disabled = stock === 0;
        sizeSelector.appendChild(option);
    });
    // Add event listener for size selection
    sizeSelector.addEventListener('change', function() {
        const selectedSize = this.value;
        if (selectedSize) {
            const variantDetail = `${selectedColor}-${selectedSize}`;
            updateQuantitySelector(product, variantDetail);
            updateCartButton(product);
        }
    });
    // Auto-select first available size
    const firstAvailableSize = allSizes.find(size => {
        const variantDetail = `${selectedColor}-${size}`;
        const variantImage = product.images.find(img => img.variant_detail === variantDetail);
        return variantImage && variantImage.stock > 0;
    });
    if (firstAvailableSize) {
        sizeSelector.value = firstAvailableSize;
        const variantDetail = `${selectedColor}-${firstAvailableSize}`;
        updateQuantitySelector(product, variantDetail);
        updateCartButton(product);
    }
}
// Function to update quantity selector based on stock
function updateQuantitySelector(product, selectedVariant, customStock = null) {
    let stock = customStock !== null ? customStock : 0; // Use custom stock if provided
    if (stock === 0 && selectedVariant) {
        // Find the stock for the selected variant from the product.images array
        const imageWithStock = product.images.find(image =>
            image.variant_detail && image.variant_detail.toLowerCase() === selectedVariant.toLowerCase() &&
            typeof image.stock === 'number'
        );
        if (imageWithStock) {
            stock = imageWithStock.stock;
        } else if (product.variants) { // Fallback to product.variants if images don't have stock
            const selectedVariantData = product.variants.find(variant =>
                variant.detail && variant.detail.toLowerCase() === selectedVariant.toLowerCase() &&
                typeof variant.stock === 'number'
            );
            if (selectedVariantData) {
                stock = selectedVariantData.stock;
            }
        }
    }
    // Ensure stock is a non-negative integer
    stock = Math.max(0, Math.floor(stock));
    const availabilityElement = document.getElementById('product-availability');
    if (availabilityElement) {
        availabilityElement.textContent = stock > 0 ? 'In Stock' : 'Out of Stock';
        availabilityElement.className = stock > 0 ? 'font-medium text-green-600' : 'font-medium text-red-600';
    }
    let quantitySpan = document.getElementById('quantity');
    let decreaseBtn = document.getElementById('decrease-qty');
    let increaseBtn = document.getElementById('increase-qty');
    let currentQuantity = stock > 0 ? 1 : 0;
    // Remove existing event listeners first (if any) to prevent multiple bindings
    // We need to store references to the *actual* functions passed to addEventListener
    // to correctly remove them. For simplicity, we'll re-create the buttons.
    const newDecreaseBtn = decreaseBtn.cloneNode(true);
    const newIncreaseBtn = increaseBtn.cloneNode(true);
    decreaseBtn.parentNode.replaceChild(newDecreaseBtn, decreaseBtn);
    increaseBtn.parentNode.replaceChild(newIncreaseBtn, increaseBtn);
    // Update references to the new buttons
    decreaseBtn = newDecreaseBtn;
    increaseBtn = newIncreaseBtn;
    if (quantitySpan && decreaseBtn && increaseBtn) {
        // Set the maximum stock
        quantitySpan.dataset.maxStock = stock;
        if (currentQuantity > stock) {
            currentQuantity = stock; // Adjust if current quantity exceeds new stock
        }
        if (currentQuantity < 1 && stock >= 1) {
            currentQuantity = 1;
        } else if (stock < 1) {
            currentQuantity = 0;
        }
        quantitySpan.textContent = currentQuantity;
        // Disable/enable buttons based on current quantity and stock
        decreaseBtn.disabled = currentQuantity <= 1 || stock === 0;
        increaseBtn.disabled = currentQuantity >= stock;
        // Add new event listeners
        decreaseBtn.addEventListener('click', () => {
            if (currentQuantity > 1) {
                currentQuantity--;
                quantitySpan.textContent = currentQuantity;
                increaseBtn.disabled = false;
            }
            decreaseBtn.disabled = currentQuantity <= 1 || stock === 0;
        });
        increaseBtn.addEventListener('click', () => {
            let maxStock = parseInt(quantitySpan.dataset.maxStock);
            if (currentQuantity < maxStock) {
                currentQuantity++;
                quantitySpan.textContent = currentQuantity;
                decreaseBtn.disabled = false;
            }
            increaseBtn.disabled = currentQuantity >= maxStock;
        });
    };
};
// Main execution
document.addEventListener('DOMContentLoaded', async () => {
    const productId = getQueryParam('product_id');
    if (!productId) {
        document.querySelector('.product-details h1').textContent = 'No product specified';
        return;
    }
    const product = await fetchProductData(productId);
    populateProductDetail(product);

    // Add to cart functionality and set product data
    const addToCartBtn = document.getElementById('add-to-cart-btn');
    if (addToCartBtn && product) {
        addToCartBtn.dataset.productId = product.product_id;
        addToCartBtn.dataset.productTitle = product.title;
        addToCartBtn.addEventListener('click', () => {
            handleAddToCart(product);
        });
    }
    // Buy Now functionality
    const buyNowBtn = document.getElementById('buy-now-btn');
    if (buyNowBtn && product) {
        buyNowBtn.addEventListener('click', () => {
            handleBuyNow(product);
        });
    }
    // Initialize wishlist button
    const wishlistBtn = document.getElementById('add-to-wishlist-btn');
    if (wishlistBtn && product) {
        wishlistBtn.dataset.productId = product.product_id;
        initializeWishlistButton(wishlistBtn);
    }
    // Check if product is already in cart and update button
    setTimeout(() => updateCartButton(product), 500);
});
// Handle add to cart
function handleAddToCart(product) {
    // Always handle cart using localStorage
    return handleLocalStorageCart(product);
}

async function handleAddToCart(product) {
    try {
        // Check if user is logged in
        const authResponse = await fetch('/api/check-auth', {
            credentials: 'include'
        });
        
        const isLoggedIn = authResponse.ok && (await authResponse.json()).loggedIn;
        
        if (!isLoggedIn) {
            // Handle cart for non-logged in users using localStorage
            return handleLocalStorageCart(product);
        }
        // Get selected variants
        const selectedColorElement = document.querySelector('.color-option.bg-gray-200');
        const selectedSizeElement = document.getElementById('size-selector');
        const selectedVariantElement = document.querySelector('.variant-option.bg-gray-200');
        const selectedColor = selectedColorElement ? selectedColorElement.dataset.color : null;
        const selectedSize = selectedSizeElement ? selectedSizeElement.value : null;
        const selectedSingleVariant = selectedVariantElement ? selectedVariantElement.dataset.variant : null;
        let selectedVariant = null;
        // Check if product has variants
        const hasVariants = product.variant_type && product.variant_details;
        if (hasVariants) {
            const variantTypes = Array.isArray(product.variant_type) ? product.variant_type : [product.variant_type];
            if (variantTypes.length >= 2) {
                // Color + Size variants
                selectedVariant = (selectedColor && selectedSize) ? `${selectedColor}-${selectedSize}` : null;
                if (!selectedVariant) {
                    showToast('Please select both color and size.');
                    return;
                }
            } else if (variantTypes.length === 1) {
                // Single variant (color-only or size-only)
                selectedVariant = selectedSingleVariant;
                if (!selectedVariant) {
                    showToast(`Please select ${variantTypes[0].toLowerCase()}.`);
                    return;
                }
            }
        }
        // Get quantity
        const quantityElement = document.getElementById('quantity');
        const quantity = quantityElement ? parseInt(quantityElement.textContent) : 1;
        const button = document.getElementById('add-to-cart-btn');
        const currentlyInCart = await checkProductInCart(product.product_id, selectedVariant);

    } catch (error) {
        console.error('Error handling cart action:', error);
        showToast(error.message || 'Failed to update cart. Please try again.');
    }
}
// Update cart button based on current state
function updateCartButton(product) {
    const selectedColorElement = document.querySelector('.color-option.bg-gray-200');
    const selectedSizeElement = document.getElementById('size-selector');
    const selectedVariantElement = document.querySelector('.variant-option.bg-gray-200');
    const selectedColor = selectedColorElement ? selectedColorElement.dataset.color : null;
    const selectedSize = selectedSizeElement ? selectedSizeElement.value : null;
    const selectedSingleVariant = selectedVariantElement ? selectedVariantElement.dataset.variant : null;
    let selectedVariant = null;
    const hasVariants = product.variant_type && product.variant_details;
    if (hasVariants) {
        const variantTypes = Array.isArray(product.variant_type) ? product.variant_type : [product.variant_type];
        if (variantTypes.length >= 2) {
            selectedVariant = (selectedColor && selectedSize) ? `${selectedColor}-${selectedSize}` : null;
        } else if (variantTypes.length === 1) {
            selectedVariant = selectedSingleVariant;
        }
    }
    const inCart = checkLocalStorageCart(product.product_id, selectedVariant);
    updateCartButtonText(inCart ? 'Remove from Cart' : 'Add to Cart');
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
// Check if product is in wishlist
function checkProductInWishlist(productId) {
    return checkLocalStorageWishlist(productId);
}
// Update wishlist button appearance
function updateWishlistButton(button, inWishlist) {
    const icon = button.querySelector('i');
    const textElement = button.querySelector('span');
    if (inWishlist) {
        icon.className = 'fas fa-heart mr-2';
        textElement.textContent = 'Remove from Wishlist';
    } else {
        icon.className = 'far fa-heart mr-2';
        textElement.textContent = 'Add to Wishlist';
    }
}
// Add to wishlist
function addToWishlist(productId) {
    let wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
    if (!wishlist.some(item => item.id === parseInt(productId))) {
        wishlist.push({ id: parseInt(productId) });
        localStorage.setItem('wishlist', JSON.stringify(wishlist));
    }
    return true;
}
// Remove from wishlist
function removeFromWishlist(productId) {
    let wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
    wishlist = wishlist.filter(item => item.id !== parseInt(productId));
    localStorage.setItem('wishlist', JSON.stringify(wishlist));
    return true;
}
// Initialize wishlist button
function initializeWishlistButton(button) {
    const productId = button.dataset.productId;
    // Check if product is in wishlist and update button
    const inWishlist = checkProductInWishlist(productId);
    updateWishlistButton(button, inWishlist);
    // Add click event listener
    button.addEventListener('click', (e) => {
        e.preventDefault();
        const currentlyInWishlist = checkProductInWishlist(productId);
        if (currentlyInWishlist) {
            const success = removeFromWishlist(productId);
            if (success) {
                updateWishlistButton(button, false);
                showToast('Removed from wishlist!');
            }
        } else {
            const success = addToWishlist(productId);
            if (success) {
                updateWishlistButton(button, true);
                showToast('Added to wishlist!', { url: 'wishlist.html', text: 'View Wishlist' });
            }
        }
    });
}
// Update cart button text (legacy function)
function updateCartButtonText(text) {
    const button = document.getElementById('add-to-cart-btn');
    updateAddToCartButton(button, text === 'Remove from Cart');
}
// Update cart button when variant changes
function updateVariantCartButton(product, selectedVariant) {
    // Update cart button status when variant changes
    updateCartButton(product);
}
// Handle localStorage cart for non-logged in users
function handleLocalStorageCart(product) {
    const selectedColorElement = document.querySelector('.color-option.bg-gray-200');
    const selectedSizeElement = document.getElementById('size-selector');
    const selectedVariantElement = document.querySelector('.variant-option.bg-gray-200');
    const selectedColor = selectedColorElement ? selectedColorElement.dataset.color : null;
    const selectedSize = selectedSizeElement ? selectedSizeElement.value : null;
    const selectedSingleVariant = selectedVariantElement ? selectedVariantElement.dataset.variant : null;
    let selectedVariant = null;
    const hasVariants = product.variant_type && product.variant_details;
    if (hasVariants) {
        const variantTypes = Array.isArray(product.variant_type) ? product.variant_type : [product.variant_type];
        if (variantTypes.length >= 2) {
            selectedVariant = (selectedColor && selectedSize) ? `${selectedColor}-${selectedSize}` : null;
            if (!selectedVariant) {
                showToast('Please select both color and size.');
                return;
            }
        } else if (variantTypes.length === 1) {
            selectedVariant = selectedSingleVariant;
            if (!selectedVariant) {
                alert(`Please select ${variantTypes[0].toLowerCase()}.`);
                return;
            }
        }
    }
    const quantityElement = document.getElementById('quantity');
    const quantity = quantityElement ? parseInt(quantityElement.textContent) : 1;
    let cart = JSON.parse(localStorage.getItem('cart') || '[]');
    const itemKey = `${product.product_id}_${selectedVariant || 'no-variant'}`;
    const existingItemIndex = cart.findIndex(item => item.key === itemKey);
    const button = document.getElementById('add-to-cart-btn');
    if (existingItemIndex > -1) {
        cart.splice(existingItemIndex, 1);
        updateAddToCartButton(button, false);
        showToast('Item removed from cart!');
    } else {
        if (!cart.some(item => item.key === itemKey)) {
            cart.push({
                key: itemKey,
                product_id: product.product_id,
                title: product.title,
                price: product.price,
                variant_detail: selectedVariant,
                quantity: quantity,
                image: product.images && product.images.length > 0 ? product.images[0].image_path : null
            });
        }
        updateAddToCartButton(button, true);
        showToast('Item added to cart!', { url: 'cart.html', text: 'View Cart' });
    }
    localStorage.setItem('cart', JSON.stringify(cart));
}
// Handle localStorage wishlist for non-logged in users
function handleLocalStorageWishlist(productId) {
    let wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
    const itemIndex = wishlist.findIndex(item => item.id === parseInt(productId));
    if (itemIndex > -1) {
        wishlist.splice(itemIndex, 1);
        localStorage.setItem('wishlist', JSON.stringify(wishlist));
        return false; // removed
    } else {
        if (!wishlist.some(item => item.id === parseInt(productId))) {
            wishlist.push({ id: parseInt(productId) });
            localStorage.setItem('wishlist', JSON.stringify(wishlist));
        }
        return true; // added
    }
}
// Check localStorage cart
function checkLocalStorageCart(productId, variantDetail) {
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    const itemKey = `${productId}_${variantDetail || 'no-variant'}`;
    return cart.some(item => item.key === itemKey);
}
// Check localStorage wishlist
function checkLocalStorageWishlist(productId) {
    const wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
    return wishlist.some(item => item.id === parseInt(productId));
}
// Handle Buy Now functionality
function handleBuyNow(product) {
    // Get selected variants
    const selectedColorElement = document.querySelector('.color-option.bg-gray-200');
    const selectedSizeElement = document.getElementById('size-selector');
    const selectedVariantElement = document.querySelector('.variant-option.bg-gray-200');
    const selectedColor = selectedColorElement ? selectedColorElement.dataset.color : null;
    const selectedSize = selectedSizeElement ? selectedSizeElement.value : null;
    const selectedSingleVariant = selectedVariantElement ? selectedVariantElement.dataset.variant : null;
    let selectedVariant = null;
    // Check if product has variants
    const hasVariants = product.variant_type && product.variant_details;
    if (hasVariants) {
        const variantTypes = Array.isArray(product.variant_type) ? product.variant_type : [product.variant_type];
        if (variantTypes.length >= 2) {
            // Color + Size variants - check both are selected
            if (!selectedColor) {
                showToast('Please select a color.');
                return;
            }
            if (!selectedSize) {
                showToast('Please select a size.');
                return;
            }
            selectedVariant = `${selectedColor}-${selectedSize}`;
        } else if (variantTypes.length === 1) {
            // Single variant (color-only or size-only)
            if (!selectedSingleVariant) {
                showToast(`Please select ${variantTypes[0].toLowerCase()}.`);
                return;
            }
            selectedVariant = selectedSingleVariant;
        }
    }
    // Get quantity
    const quantityElement = document.getElementById('quantity');
    const quantity = quantityElement ? parseInt(quantityElement.textContent) : 1;
    // Clear existing cart and add new item
    localStorage.removeItem('cart');
    const cartItem = {
        key: `${product.product_id}_${selectedVariant || 'no-variant'}`,
        product_id: product.product_id,
        title: product.title,
        price: product.price,
        variant_detail: selectedVariant,
        quantity: quantity,
        image: product.images && product.images.length > 0 ? product.images[0].image_path : null
    };
    localStorage.setItem('cart', JSON.stringify([cartItem]));
    // Redirect to checkout page directly
    window.location.href = '/checkout.html';
}
