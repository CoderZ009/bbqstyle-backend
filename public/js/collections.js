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
async function loadCategories(tabName) {
    const grid = document.querySelector(`#${tabName} #grid`);
    if (!grid) return;
    
    // Add spinner CSS if not exists
    if (!document.getElementById('spinner-styles')) {
        const style = document.createElement('style');
        style.id = 'spinner-styles';
        style.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
        document.head.appendChild(style);
    }
    
    // Show loading spinner
    grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px;">
            <div style="display: inline-block; width: 32px; height: 32px; border: 4px solid #f3f4f6; border-top: 4px solid #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
            <p style="margin-top: 15px; color: #6b7280; font-size: 14px;">Loading categories...</p>
        </div>
    `;
    
    // Map tabName to collectionName expected by API
    const collectionNameMap = {
        'women': "women's collection",
        'men': "men's collection",
        'hd': "home decor"
    };
    const collectionName = collectionNameMap[tabName] || tabName;
    
    try {
        // Fetch categories from API
        const response = await axios.get(`${API_BASE_URL}/api/public/categories/${encodeURIComponent(collectionName)}`);
        const categories = response.data;
        
        // Clear loading spinner
        grid.innerHTML = '';
        
        // Load categories one by one
        for (let i = 0; i < categories.length; i++) {
            const category = categories[i];
            const card = createCategoryCard(category, tabName);
            grid.appendChild(card);
            
            // Small delay between cards
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    } catch (error) {
        console.error('Error fetching categories:', error);
        grid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: #6b7280;">Error loading categories.</p>';
    }
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
async function showTab(tabName) {
    // Hide all tab contents and remove active class from buttons
    document.querySelectorAll('.tab-content, .tab-button').forEach(element => {
        element.classList.remove('active');
    });
    // Show selected tab content
    document.getElementById(tabName).classList.add('active');
    // Mark clicked button as active
    event.target.classList.add('active');
    // Load categories for selected tab
    await loadCategories(tabName);
}
