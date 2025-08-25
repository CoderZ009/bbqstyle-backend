document.addEventListener('DOMContentLoaded', function () {
  // Initialize slider
  initializeTowelSlider();
  
  // Fetch products filtered by "Women's Collection" and store in global variable
  axios.get(`${API_BASE_URL}/api/public/productshd/tw`)
    .then(response => {
      window.products = response.data;
      // Optionally, you can dispatch an event or call a function here to notify headerwomen.js that products are ready
      document.dispatchEvent(new Event('productsLoaded'));
    })
    .catch(error => {
      console.error('Error fetching products:', error);
    });
});

// Initialize towel slider functionality
function initializeTowelSlider() {
  // CSS animation handles the sliding, no JavaScript needed
  console.log('Towel slider initialized with CSS animation');
}
