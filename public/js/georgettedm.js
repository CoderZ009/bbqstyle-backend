document.addEventListener('DOMContentLoaded', function () {
  // Fetch products filtered by "Women's Collection" and store in global variable
  axios.get(`${API_BASE_URL}/api/public/products/dm/gdm`)
    .then(response => {
      window.products = response.data;
      // Optionally, you can dispatch an event or call a function here to notify headerwomen.js that products are ready
      document.dispatchEvent(new Event('productsLoaded'));
    })
    .catch(error => {
      console.error('Error fetching products:', error);
    });
});
