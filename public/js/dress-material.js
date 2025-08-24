document.addEventListener('DOMContentLoaded', function () {
  // Fetch products filtered by "Women's Collection" and store in global variable
  axios.get(`${API_BASE_URL}/api/public/product/dm`)
    .then(response => {
      window.products = response.data;
      // Check if products array is empty
      if (!window.products || window.products.length === 0) {
        console.warn('No products found for dress materials');
      }
      // Dispatch event to notify headerwomen.js that products are ready
      const event = new Event('productsLoaded');
      document.dispatchEvent(event);
    })
    .catch(error => {
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        response: error.response,
        request: error.request
      });
      // Even if there's an error, we should still dispatch the event to avoid hanging the UI
      const event = new Event('productsLoaded');
      document.dispatchEvent(event);
    });
  })
