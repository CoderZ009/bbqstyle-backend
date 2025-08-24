document.addEventListener('DOMContentLoaded', () => {
    const collectionContainer = document.querySelector('.grid.grid-cols-1.md\\:grid-cols-3');
    if (collectionContainer) {
        axios.get(`${API_BASE_URL}/api/public/collections`)
            .then(response => {
                const collections = response.data;
                collectionContainer.innerHTML = ''; // Clear existing content
                collections.forEach(collection => {
                    const collectionCard = createCollectionCard(collection);
                    collectionContainer.appendChild(collectionCard);
                });
            })
            .catch(error => {
                console.error('Error fetching collections:', error);
            });
    }
    function createCollectionCard(collection) {
        const a = document.createElement('a');
        // Set href based on collection name
        if (collection.collection_name === "Women's Collection") {
            a.href = 'women\'s.html';
        } else if (collection.collection_name === "Men's Collection") {
            a.href = 'men\'s.html';
        } else if (collection.collection_name === "Home Decor") {
            a.href = 'home-decor.html';
        } else {
            a.href = `${collection.collection_name.toLowerCase().replace(/\s+/g, '-')}.html`;
        }
        const div = document.createElement('div');
        div.className = 'product-card bg-white p-6 rounded-lg shadow-md transition-all';
        const imgContainer = document.createElement('div');
        imgContainer.className = 'mb-4 overflow-hidden rounded-lg';
        const img = document.createElement('img');
        img.src = collection.collection_image || '';
        img.alt = collection.collection_name;
        img.className = 'cl-img h-64';
        const h6 = document.createElement('h6');
        h6.className = 'text-xl font-bold mb-2';
        h6.textContent = collection.collection_name;
        const p = document.createElement('p');
        p.textContent = collection.collection_description;
        imgContainer.appendChild(img);
        div.appendChild(imgContainer);
        div.appendChild(h6);
        div.appendChild(p);
        a.appendChild(div);
        return a;
    }
});
