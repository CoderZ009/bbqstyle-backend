document.addEventListener('DOMContentLoaded', function () {
  let slides = [];
  let dots = [];
  const prevBtn = document.querySelector('.prev');
  const nextBtn = document.querySelector('.next');
  const slidesContainer = document.querySelector('.slides');
  const dotsContainer = document.getElementById('dots-container');
  let currentIndex = 0;
  let slideInterval;
  const slideDuration = 5000; // 5 seconds per slide
  // Fetch and load slideshow data
  async function loadSlideshow() {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/public/slideshow`);
      const slideshowData = response.data;
      // Clear existing content
      if (slidesContainer) slidesContainer.innerHTML = '';
      if (dotsContainer) dotsContainer.innerHTML = '';
      // Create slides
      slideshowData.forEach((slide, index) => {
        const slideElement = document.createElement('div');
        slideElement.className = `slide ${index === 0 ? 'active' : ''}`;
        slideElement.innerHTML = `
          <img src="${slide.image}" alt="${slide.heading}" class="slide-img">
          <div class="slide-content">
            <h2 class="slide-title">${slide.heading}</h2>
            <p class="slide-desc">${slide.description}</p>
          </div>
        `;
        if (slidesContainer) slidesContainer.appendChild(slideElement);
        // Create dots
        const dot = document.createElement('div');
        dot.className = `dot ${index === 0 ? 'active' : ''}`;
        dot.addEventListener('click', () => {
          goToSlide(index);
          pauseSlideShow();
          startSlideShow();
        });
        if (dotsContainer) dotsContainer.appendChild(dot);
      });
      // Update references
      slides = document.querySelectorAll('.slide');
      dots = document.querySelectorAll('.dot');
      // Initialize slideshow
      if (slides.length > 0) {
        startSlideShow();
      }
    } catch (error) {
      console.error('Error loading slideshow:', error);
    }
  }
  function goToSlide(index) {
    slides.forEach(slide => slide.classList.remove('active'));
    dots.forEach(dot => dot.classList.remove('active'));
    if (slidesContainer) slidesContainer.style.transform = `translateX(-${index * 100}%)`;
    if (slides[index]) slides[index].classList.add('active');
    if (dots[index]) dots[index].classList.add('active');
    currentIndex = index;
  }
  function nextSlide() {
    if (slides.length === 0) return;
    let newIndex = (currentIndex + 1) % slides.length;
    goToSlide(newIndex);
  }
  function prevSlide() {
    if (slides.length === 0) return;
    let newIndex = (currentIndex - 1 + slides.length) % slides.length;
    goToSlide(newIndex);
  }
  function startSlideShow() {
    if (slides.length > 1) {
      slideInterval = setInterval(nextSlide, slideDuration);
    }
  }
  function pauseSlideShow() {
    clearInterval(slideInterval);
  }
  // Navigation events
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      nextSlide();
      pauseSlideShow();
      startSlideShow();
    });
  }
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      prevSlide();
      pauseSlideShow();
      startSlideShow();
    });
  }
  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') {
      nextSlide();
      pauseSlideShow();
      startSlideShow();
    } else if (e.key === 'ArrowLeft') {
      prevSlide();
      pauseSlideShow();
      startSlideShow();
    }
  });
  // Pause on hover
  const slideshow = document.querySelector('.slideshow-container');
  if (slideshow) {
    slideshow.addEventListener('mouseenter', pauseSlideShow);
    slideshow.addEventListener('mouseleave', startSlideShow);
  }
  // Load slideshow data
  loadSlideshow();
  //infinity slider collection
  // Pause animation on hover
  const track = document.querySelector('.slidei-track');
  if (track) {
    track.addEventListener('mouseenter', () => {
      track.style.animationPlayState = 'paused';
    });
    track.addEventListener('mouseleave', () => {
      track.style.animationPlayState = 'running';
    });
  }
  // Reset animation when it ends to create infinite loop
  if (track) {
    track.addEventListener('animationiteration', () => {
      track.style.animation = 'none';
      track.offsetHeight; // trigger reflow
      track.style.animation = 'scroll 40s linear infinite';
    });
  }
  // Mobile menu toggle
  const mobileMenuButton = document.getElementById('mobile-menu-button');
  const mobileMenu = document.getElementById('mobile-menu');
  const navLinks = document.getElementById('nav-links');
  const womenMobileToggle = document.getElementById('women-mobile-toggle');
  const womenMobileMenu = document.getElementById('women-mobile-menu');
  const menMobileToggle = document.getElementById('men-mobile-toggle');
  const menMobileMenu = document.getElementById('men-mobile-menu');
  const hdMobileToggle = document.getElementById('hd-mobile-toggle');
  const hdMobileMenu = document.getElementById('hd-mobile-menu');
  if (mobileMenuButton && mobileMenu) {
    mobileMenuButton.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
    });
  }
  if (womenMobileToggle && womenMobileMenu) {
    womenMobileToggle.addEventListener('click', () => {
      womenMobileMenu.classList.toggle('hidden');
    });
  }
  if (menMobileToggle && menMobileMenu) {
    menMobileToggle.addEventListener('click', () => {
      menMobileMenu.classList.toggle('hidden');
    });
  }
  if (hdMobileToggle && hdMobileMenu) {
    hdMobileToggle.addEventListener('click', () => {
      hdMobileMenu.classList.toggle('hidden');
    });
  }
  // Sticky navbar on scroll
  window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (navbar) {
      if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    }
  });
  // Existing slideshow and menu code here (unchanged) ...
  // (Omitted for brevity, keep existing code as is)
  // Set axios to send cookies with requests
  axios.defaults.withCredentials = true;
  // Toast notification function
  function showToast(message, link = null) {
    const toast = document.getElementById('toast');
    if (toast) {
      toast.innerHTML = message + (link ? ` <a href="${link.url}">${link.text}</a>` : '');
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 4000);
    }
  }
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
  function createProductCardHtml(product, isWishlistPage = false, userWishlist = []) {
    const imageUrl = product.image_path ? `/uploads/${product.image_path}` : 'src/placeholder.png';
    const priceDisplay = product.mrp ? `<span class="text-gray-500 text-sm line-through ml-2">₹${product.mrp}</span> <span class="text-pink-600 font-bold text-xl">₹${product.price}</span>` : `<span class="text-pink-600 font-bold text-xl">₹${product.price}</span>`;
    const isInWishlist = userWishlist.includes(product.product_id);
    const wishlistButtonIcon = isWishlistPage || isInWishlist ? 'fas fa-heart' : 'far fa-heart';
    const wishlistButtonClass = isWishlistPage || isInWishlist ? 'remove-from-wishlist-btn' : 'wishlist-btn';
    const wishlistButtonAriaLabel = isWishlistPage || isInWishlist ? 'Remove from wishlist' : 'Add to wishlist';
    return `
      <a href="product-detail.html?product_id=${product.product_id}">
        <div class="relative">
          <img src="${imageUrl}" alt="${product.title}" class="piku object-cover">
          <div class="absolute top-0 right-0 bg-pink-600 text-white text-sm px-2 py-1">New</div>
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
            <span class="cart-btn-text">Add to Cart</span> <i class="t fas fa-shopping-cart text-white"></i>
        </button>
        <button class="${wishlistButtonClass}" aria-label="${wishlistButtonAriaLabel}" data-product-id="${product.product_id}">
            <i class="${wishlistButtonIcon}"></i>
        </button>
      </div>
    `;
  }
  // Function to update UI based on login status
  // Fetch and render new arrival products
  async function fetchNewArrivals() {
    try {
      const productsResponse = await axios.get(`${API_BASE_URL}/api/public/new-arrivals`);
      const products = productsResponse.data;
      // Get wishlist from localStorage
      const localWishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
      const userWishlist = localWishlist.map(item => item.id);
      const container = document.getElementById('new-arrivals-container');
      if (!container) return;
      container.innerHTML = ''; // Clear existing content
      if (products.length === 0) {
        container.innerHTML = '<p>No new arrivals found.</p>';
        return;
      }
      products.forEach(product => {
        const productCard = document.createElement('div');
        productCard.className = 'cm';
        // Pass userWishlist to createProductCardHtml
        productCard.innerHTML = createProductCardHtml(product, false, userWishlist);
        container.appendChild(productCard);
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
      // Check cart status and update buttons
      for (const product of products) {
        const inCart = checkProductInCart(product.product_id);
        const button = container.querySelector(`[data-product-id="${product.product_id}"].cart-btn`);
        if (button) {
          const textElement = button.querySelector('.cart-btn-text');
          textElement.textContent = inCart ? 'Remove from Cart' : 'Add to Cart';
        }
      }
      // Add event listeners for wishlist and cart buttons
      container.addEventListener('click', (event) => {
        if (event.target.closest('.wishlist-btn, .remove-from-wishlist-btn')) {
          event.stopPropagation();
          event.preventDefault();
          const button = event.target.closest('.wishlist-btn, .remove-from-wishlist-btn');
          const productId = parseInt(button.dataset.productId);
          const product = products.find(p => p.product_id === productId);
          const currentlyInWishlist = isProductInWishlist(productId);
          if (currentlyInWishlist) {
            removeFromWishlist(productId);
            button.className = 'wishlist-btn';
            button.querySelector('i').className = 'far fa-heart';
            button.setAttribute('aria-label', 'Add to wishlist');
            showToast('Removed from wishlist!');
          } else {
            addToWishlist(product);
            button.className = 'remove-from-wishlist-btn';
            button.querySelector('i').className = 'fas fa-heart';
            button.setAttribute('aria-label', 'Remove from wishlist');
            showToast('Added to wishlist!', { url: 'wishlist.html', text: 'View Wishlist' });
          }
        }
        if (event.target.closest('.cart-btn')) {
          event.stopPropagation();
          event.preventDefault();
          const button = event.target.closest('.cart-btn');
          const productId = parseInt(button.dataset.productId);
          const productTitle = button.dataset.productTitle;
          const textElement = button.querySelector('.cart-btn-text');
          const inCart = checkProductInCart(productId);
          if (inCart) {
            removeFromCartFromListing(productId, productTitle);
            showToast('Removed from cart!');
          } else {
            addToCartFromListing(productId, productTitle);
            showToast('Added to cart!', { url: 'cart.html', text: 'View Cart' });
          }
        }
      });
    } catch (error) {
      console.error('Error fetching new arrivals or wishlist:', error);
    }
  }
  // Fetch and render customer reviews as slideshow
  function fetchReviews() {
    axios.get(`${API_BASE_URL}/api/public/reviews`)
      .then(response => {
        const reviews = response.data;
        const container = document.getElementById('reviews-container');
        if (!container) return;
        container.innerHTML = ''; // Clear existing content
        if (reviews.length === 0) {
          container.innerHTML = '<p class="text-center text-gray-500">No reviews available.</p>';
          return;
        }
        // Create slider structure
        const sliderWrapper = document.createElement('div');
        sliderWrapper.className = 'reviews-slider-wrapper';
        sliderWrapper.innerHTML = `
          <div class="reviews-slider">
            <div class="reviews-track" id="reviews-track"></div>
            <div class="reviews-controls">
              <button class="review-prev-btn" id="review-prev">&larr;</button>
              <button class="review-next-btn" id="review-next">&rarr;</button>
            </div>
          </div>
        `;
        container.appendChild(sliderWrapper);
        const trackContainer = document.getElementById('reviews-track');
        if (!trackContainer) return;
        reviews.forEach((review, index) => {
          // Generate star rating HTML
          let starsHtml = '';
          for (let i = 0; i < 5; i++) {
            if (i < review.star_rating) {
              starsHtml += '<i class="fas fa-star"></i>';
            } else {
              starsHtml += '<i class="far fa-star"></i>';
            }
          }
          const reviewCard = document.createElement('div');
          reviewCard.className = 'review-card';
          reviewCard.innerHTML = `
            <div class="review-header">
              <div class="review-avatar">
                <i class="fas fa-user"></i>
              </div>
              <div class="review-info">
                <h4 class="review-name">${review.first_name || 'Anonymous'}</h4>
                <div class="review-rating">
                  ${starsHtml}
                </div>
              </div>
            </div>
            <div class="review-content">
              <p class="review-text">"${review.review_text}"</p>
            </div>
          `;
          trackContainer.appendChild(reviewCard);
        });
        // Initialize slider controls
        let currentPosition = 0;
        const cardWidth = 350;
        const visibleCards = window.innerWidth > 768 ? 3 : 1;
        const maxPosition = Math.max(0, (reviews.length - visibleCards) * cardWidth);
        function slideNext() {
          if (currentPosition < maxPosition) {
            currentPosition += cardWidth;
            trackContainer.style.transform = `translateX(-${currentPosition}px)`;
          }
        }
        function slidePrev() {
          if (currentPosition > 0) {
            currentPosition -= cardWidth;
            trackContainer.style.transform = `translateX(-${currentPosition}px)`;
          }
        }
        const nextBtn = document.getElementById('review-next');
        const prevBtn = document.getElementById('review-prev');
        if (nextBtn) nextBtn.addEventListener('click', slideNext);
        if (prevBtn) prevBtn.addEventListener('click', slidePrev);
      })
      .catch(error => {
        console.error('Error fetching reviews:', error);
      });
  };
  // Newsletter form submission handler
  const newsletterForm = document.getElementById('newsletter-form');
  if (newsletterForm) {
    newsletterForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const fullNameInput = document.getElementById('full-name');
      const emailInput = document.getElementById('email');
      if (!fullNameInput || !emailInput) return;
      const fullName = fullNameInput.value.trim();
      const email = emailInput.value.trim();
      if (!fullName) {
        alert('Please enter your full name.');
        fullNameInput.focus();
        return;
      }
      if (!email) {
        alert('Please enter your email address.');
        emailInput.focus();
        return;
      }
      // Simple email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        alert('Please enter a valid email address.');
        emailInput.focus();
        return;
      }
      const errorElement = document.getElementById('newsletter-error');
      const successElement = document.getElementById('newsletter-success');
      if (errorElement) errorElement.style.display = 'none';
      if (successElement) successElement.style.display = 'none';
      // Send POST request to backend API to add subscriber
      axios.post(`${API_BASE_URL}/api/subscribers`, {
        customer_name: fullName,
        email_id: email
      })
        .then(response => {
          if (successElement) {
            successElement.textContent = 'Thank you for subscribing to our newsletter!';
            successElement.style.display = 'block';
          }
          newsletterForm.reset();
        })
        .catch(error => {
          console.error('Error subscribing:', error);
          if (error.response && error.response.status === 409) {
            if (errorElement) {
              errorElement.textContent = 'Email already subscribed';
              errorElement.style.display = 'block';
            }
          } else {
            alert('There was an error subscribing. Please try again later.');
          }
        });
    });
  }
  // Update cart count
  function updateCartCount() {
    const localCart = JSON.parse(localStorage.getItem('cart') || '[]');
    const totalItems = localCart.reduce((sum, item) => sum + item.quantity, 0);
    const cartCountElements = document.querySelectorAll('.cart-count, #cart-count');
    cartCountElements.forEach(el => {
      if (el) {
        el.textContent = totalItems;
        el.style.display = totalItems > 0 ? 'inline-block' : 'none';
      }
    });
  }
  // Fetch and render categories dynamically
  async function fetchCategories() {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/public/categories`);
      const categories = response.data;
      const track = document.getElementById('category-slideshow');
      if (!track) return;
      track.innerHTML = ''; // Clear existing content
      // Create slides for categories (first set)
      categories.forEach(category => {
        const slide = createCategorySlide(category);
        track.appendChild(slide);
      });
      // Duplicate categories for infinite scroll effect
      categories.forEach(category => {
        const slide = createCategorySlide(category);
        track.appendChild(slide);
      });
      // Initialize manual scroll controls
      initializeCategoryControls();
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  }
  // Create category slide element
  function createCategorySlide(category) {
    const slide = document.createElement('div');
    slide.className = 'slidei';
    slide.innerHTML = `
      <div class="slidei-inner">
        <a href="${category.category_link}">
          <div class="slidei-front">
            <img id="pika" src="${category.category_image}" 
                 alt="${category.category_name} collection" 
                 class="collection-image">
            <h3 class="collection-title">${category.category_name}</h3>
            <p class="collection-description">${category.collection_name}</p>
          </div>
          <div class="slidei-back">
            <h3>${category.category_name}</h3>
            <p>Explore Collection</p>
            <p>${category.collection_name}</p>
            <button class="view-btn">View Collection</button>
          </div>
        </a>
      </div>
    `;
    return slide;
  }
  // Initialize manual scroll controls for categories
  function initializeCategoryControls() {
    const track = document.getElementById('category-slideshow');
    const prevBtn = document.getElementById('prev-category');
    const nextBtn = document.getElementById('next-category');
    if (!track || !prevBtn || !nextBtn) return;
    let scrollPosition = 0;
    const slideWidth = 300; // Approximate slide width
    nextBtn.addEventListener('click', () => {
      scrollPosition += slideWidth;
      track.style.transform = `translateX(-${scrollPosition}px)`;
      track.style.animationPlayState = 'paused';
    });
    prevBtn.addEventListener('click', () => {
      scrollPosition = Math.max(0, scrollPosition - slideWidth);
      track.style.transform = `translateX(-${scrollPosition}px)`;
      track.style.animationPlayState = 'paused';
    });
    // Resume animation on mouse leave
    track.addEventListener('mouseleave', () => {
      track.style.animationPlayState = 'running';
    });
  }
  // Initial fetch calls
  fetchNewArrivals();
  fetchReviews();
  fetchCategories();
  updateCartCount();
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
    updateCartCount();
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
    updateCartCount();
  }
  // Check if product is in cart
  function checkProductInCart(productId) {
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    return cart.some(item => item.product_id == productId);
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
    if (button.parentNode) button.parentNode.replaceChild(newButton, button);
    newButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      addToCartFromListing(productId, productTitle);
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
  // Fetch and render categories dynamically
  async function fetchCategories() {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/public/categories`);
      const categories = response.data;
      const track = document.getElementById('category-slideshow');
      if (!track) return;
      track.innerHTML = ''; // Clear existing content
      // Create slides for categories (first set)
      categories.forEach(category => {
        const slide = createCategorySlide(category);
        track.appendChild(slide);
      });
      // Duplicate categories for infinite scroll effect
      categories.forEach(category => {
        const slide = createCategorySlide(category);
        track.appendChild(slide);
      });
      // Initialize manual scroll controls
      initializeCategoryControls();
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  }
  // Create category slide element
  function createCategorySlide(category) {
    const slide = document.createElement('div');
    slide.className = 'slidei';
    slide.innerHTML = `
      <div class="slidei-inner">
        <a href="${category.category_link}">
          <div class="slidei-front">
            <img id="pika" src="${category.category_image}" 
                 alt="${category.category_name} collection" 
                 class="collection-image">
            <h3 class="collection-title">${category.category_name}</h3>
            <p class="collection-description">${category.collection_name}</p>
          </div>
          <div class="slidei-back">
            <h3>${category.category_name}</h3>
            <p>Explore Collection</p>
            <p>${category.collection_name}</p>
            <button class="view-btn">View Collection</button>
          </div>
        </a>
      </div>
    `;
    return slide;
  }
  // Initialize manual scroll controls for categories
  function initializeCategoryControls() {
    const track = document.getElementById('category-slideshow');
    const prevBtn = document.getElementById('prev-category');
    const nextBtn = document.getElementById('next-category');
    if (!track || !prevBtn || !nextBtn) return;
    let scrollPosition = 0;
    const slideWidth = 300; // Approximate slide width
    nextBtn.addEventListener('click', () => {
      scrollPosition += slideWidth;
      track.style.transform = `translateX(-${scrollPosition}px)`;
      track.style.animationPlayState = 'paused';
    });
    prevBtn.addEventListener('click', () => {
      scrollPosition = Math.max(0, scrollPosition - slideWidth);
      track.style.transform = `translateX(-${scrollPosition}px)`;
      track.style.animationPlayState = 'paused';
    });
    // Resume animation on mouse leave
    track.addEventListener('mouseleave', () => {
      track.style.animationPlayState = 'running';
    });
  }
  // Initial fetch calls
  fetchNewArrivals();
  fetchReviews();
  fetchCategories();
  updateCartCount();
  // Auto-initialize on DOM content loaded
  document.addEventListener('DOMContentLoaded', () => {
    initializeCartButtons();
  })
  // Category arrow fix
  // Category arrow fix - immediate execution
  const ctrack = document.getElementById('category-slideshow');
  const cprevBtn = document.getElementById('prev-category');
  const cnextBtn = document.getElementById('next-category');
  if (ctrack && cprevBtn && cnextBtn) {
    let scrollPosition = 0;
    const slideWidth = 300;
    const newNextBtn = cnextBtn.cloneNode(true);
    const newPrevBtn = cprevBtn.cloneNode(true);
    cnextBtn.parentNode.replaceChild(newNextBtn, cnextBtn);
    cprevBtn.parentNode.replaceChild(newPrevBtn, cprevBtn);
    newNextBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      track.style.animation = 'none';
      const currentTransform = getComputedStyle(track).transform;
      const matrix = new DOMMatrix(currentTransform);
      const currentX = matrix.m41;
      const newX = currentX - slideWidth;
      track.style.transform = `translateX(${newX}px)`;
      track.style.transition = 'transform 0.3s ease';
    });
    newPrevBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      track.style.animation = 'none';
      const currentTransform = getComputedStyle(track).transform;
      const matrix = new DOMMatrix(currentTransform);
      const currentX = matrix.m41;
      const newX = currentX + slideWidth;
      track.style.transform = `translateX(${newX}px)`;
      track.style.transition = 'transform 0.3s ease';
    });
    // Pause animation on hover
    track.addEventListener('mouseenter', () => {
      track.style.animationPlayState = 'paused';
    });
    track.addEventListener('mouseleave', () => {
      track.style.animation = 'scroll 40s linear infinite';
      track.style.animationPlayState = 'running';
    });
  }
  // Category links fix
  // Category links fix - immediate execution
  const categorySlides = document.querySelectorAll('.slidei a');
  categorySlides.forEach(link => {
    const titleElement = link.querySelector('.collection-title');
    const descElement = link.querySelector('.collection-description');
    if (titleElement && descElement) {
      const title = titleElement.textContent.toLowerCase();
      const collection = descElement.textContent.toLowerCase();
      if (collection === "men's collection" && title === 'fabrics') {
        link.href = 'fabricsm.html';
      } else if (collection === "men's collection" && title === 'accessories') {
        link.href = 'accessoriesm.html';
      } else if (collection === "women's collection" && title === 'fabrics') {
        link.href = 'fabrics.html';
      } else if (collection === "women's collection" && title === 'accessories') {
        link.href = 'accessories.html';
      }
    }
  });
})
