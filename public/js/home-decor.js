document.addEventListener('DOMContentLoaded', function () {
  // Fetch products filtered by "Home Decor" and store in global variable
  axios.get(`${API_BASE_URL}/api/public/productshd`)
    .then(response => {
      window.products = response.data;
      document.dispatchEvent(new Event('productsLoaded'));
    })
    .catch(error => {
      console.error('Error fetching products:', error);
    });
  // Helper function to add product to wishlist
  async function addToWishlist(product) {
    try {
      const authResponse = await axios.get(`${API_BASE_URL}/api/check-auth`);
      if (!authResponse.data.loggedIn) {
        let wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
        if (!wishlist.some(item => item.id === product.product_id)) {
          wishlist.push({ id: product.product_id });
          localStorage.setItem('wishlist', JSON.stringify(wishlist));
        }
        return;
      }
      const response = await axios.post(`${API_BASE_URL}/api/wishlist/add`, { productId: product.product_id });
      if (response.data.success) {
      } else {
        alert(response.data.message);
      }
    } catch (error) {
      if (error.response && error.response.status === 401) {
        let wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
        if (!wishlist.some(item => item.id === product.product_id)) {
          wishlist.push({ id: product.product_id });
          localStorage.setItem('wishlist', JSON.stringify(wishlist));
        }
      } else {
        console.error('Error adding product to wishlist:', error);
        alert('Error adding product to wishlist');
      }
    }
  }
  // Helper function to remove product from wishlist
  async function removeFromWishlist(productId) {
    try {
      const authResponse = await axios.get(`${API_BASE_URL}/api/check-auth`);
      if (!authResponse.data.loggedIn) {
        let wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
        wishlist = wishlist.filter(item => item.id !== productId);
        localStorage.setItem('wishlist', JSON.stringify(wishlist));
        return;
      }
      const response = await axios.post(`${API_BASE_URL}/api/wishlist/remove`, { productId: productId });
      if (response.data.success) {
      } else {
        alert(response.data.message);
      }
    } catch (error) {
      if (error.response && error.response.status === 401) {
        let wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
        wishlist = wishlist.filter(item => item.id !== productId);
        localStorage.setItem('wishlist', JSON.stringify(wishlist));
      } else {
        console.error('Error removing product from wishlist:', error);
        alert('Error removing product from wishlist');
      }
    }
  }
  // Check if user is authenticated
  async function checkAuthStatus() {
    try {
      const response = await clientAuthFetch(`${API_BASE_URL}/api/check-auth`);
      const data = await response.json();
      return data.loggedIn;
    } catch (error) {
      console.error('Error checking auth status:', error);
      return false;
    }
  }
  // Check if product is in cart
  async function checkProductInCart(productId) {
    try {
      const isLoggedIn = await checkAuthStatus();
      if (!isLoggedIn) {
        const cart = JSON.parse(localStorage.getItem('cart') || '[]');
        return cart.some(item => item.product_id === productId);
      }
      const response = await clientAuthFetch(`/api/cart/check/${productId}?variantDetail=`);
      if (!response.ok) {
        return false;
      }
      const data = await response.json();
      return data.inCart;
    } catch (error) {
      console.error('Error checking cart status:', error);
      return false;
    }
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
  // Make functions globally available
  window.addToWishlist = addToWishlist;
  window.removeFromWishlist = removeFromWishlist;
  window.checkAuthStatus = checkAuthStatus;
  window.checkProductInCart = checkProductInCart;
  window.showToast = showToast;
});
