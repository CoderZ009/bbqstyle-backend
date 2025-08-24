document.addEventListener('DOMContentLoaded', () => {
    // Load categories for default active tab on page load
    let defaultTab = document.querySelector('.tab-button.active').textContent.toLowerCase();
    // Map tab button text to tabName keys
    if (defaultTab.includes("women")) {
        defaultTab = "women";
    } else if (defaultTab.includes("men")) {
        defaultTab = "men";
    } else if (defaultTab.includes("home")) {
        defaultTab = "hd";
    } else {
        defaultTab = defaultTab.replace(/[^a-z]/g, '');
    }
    loadCategories(defaultTab);
});
// Function to fetch categories from API and render cards
function loadCategories(tabName) {
    const grid = document.querySelector(`#${tabName} #grid`);
    if (!grid) return;
    // Clear existing content
    grid.innerHTML = '';
    // Map tabName to collectionName expected by API
    const collectionNameMap = {
        'women': "women's collection",
        'men': "men's collection",
        'hd': "home decor"
    };
    const collectionName = collectionNameMap[tabName] || tabName;
    // Fetch categories from API
    axios.get(`${API_BASE_URL}/api/public/categories/${encodeURIComponent(collectionName)}`)
        .then(response => {
            const categories = response.data;
            categories.forEach(category => {
                const card = createCategoryCard(category, tabName);
                grid.appendChild(card);
            });
        })
        .catch(error => {
            console.error('Error fetching categories:', error);
        });
}
// Function to create a category card element
function createCategoryCard(category, tabName) {
    const a = document.createElement('a');
    // Mapping for women's tab category names to href links
    const womenCategoryLinks = {
        'dress materials': 'dress-material.html',
        'dupattas': 'dupattas.html',
        'stitched garments': 'stitched-garments.html',
        'accessories': 'accessories.html',
        'fabrics': 'fabrics.html'
    };
    // Mapping for men's tab category names to href links
    const menCategoryLinks = {
        'formal shirts': 'shirts.html',
        't-shirts': 'tshirts.html',
        'fabrics': 'fabricsm.html',
        'accessories': 'accessoriesm.html'
    };
    let hrefLink = category.category_link; // default
    if (tabName === 'women') {
        const key = category.category_name.toLowerCase();
        if (womenCategoryLinks.hasOwnProperty(key)) {
            hrefLink = womenCategoryLinks[key];
        }
    } else if (tabName === 'men') {
        const key = category.category_name.toLowerCase();
        if (menCategoryLinks.hasOwnProperty(key)) {
            hrefLink = menCategoryLinks[key];
        }
    }
    a.href = hrefLink;
    a.className = 'category-card bg-white rounded-lg overflow-hidden shadow-md hover:transition duration-300 text-center';
    const div = document.createElement('div');
    div.className = 'p-4';
    const img = document.createElement('img');
    img.src = category.category_image || '';
    img.alt = category.category_name;
    img.className = 'w-full h-48 object-cover mb-4 rounded-lg';
    const h3 = document.createElement('h3');
    h3.className = 'text-lg font-semibold';
    h3.textContent = category.category_name;
    div.appendChild(img);
    div.appendChild(h3);
    a.appendChild(div);
    return a;
}
// Modified tab switching functionality to load categories dynamically
function showTab(tabName) {
    // Hide all tab contents and remove active class from buttons
    document.querySelectorAll('.tab-content, .tab-button').forEach(element => {
        element.classList.remove('active');
    });
    // Show selected tab content
    document.getElementById(tabName).classList.add('active');
    // Mark clicked button as active
    event.target.classList.add('active');
    // Load categories for selected tab
    loadCategories(tabName);
}
