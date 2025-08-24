document.addEventListener('DOMContentLoaded', () => {
    console.log('API_BASE_URL:', API_BASE_URL);
    
    // Force API_BASE_URL if not defined
    if (typeof API_BASE_URL === 'undefined') {
        window.API_BASE_URL = 'https://bbqstyle-backend.onrender.com';
    }
    
    // Ensure API_BASE_URL is set for subdomain access
    if (!window.API_BASE_URL) {
        window.API_BASE_URL = 'https://bbqstyle-backend.onrender.com';
    }
    // Initialize Quill editor for product description
    let quillEditor;
    
    function initializeQuillEditor() {
        if (document.getElementById('product-description') && !quillEditor) {
            quillEditor = new Quill('#product-description', {
                theme: 'snow',
                modules: {
                    toolbar: [
                        ['bold', 'italic', 'underline'],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        ['link'],
                        ['clean']
                    ]
                }
            });
        }
    }
    const loginContainer = document.getElementById('login-container');
    const dashboard = document.getElementById('dashboard');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const logoutBtn = document.getElementById('logout-btn');
    
    // Loading bar utility functions
    function showLoading(sectionId) {
        const loadingBar = document.getElementById(sectionId + '-loading');
        if (loadingBar) loadingBar.style.display = 'block';
    }
    
    function hideLoading(sectionId) {
        const loadingBar = document.getElementById(sectionId + '-loading');
        if (loadingBar) loadingBar.style.display = 'none';
    }
    
    // Load dashboard stats
    async function loadDashboard() {
        showLoading('dashboards');
        
        try {
            // Fetch all dashboard data
            const [visitorsRes, salesRes, ordersRes, productsRes] = await Promise.all([
                clientAuthFetch(`https://bbqstyle-backend.onrender.com/api/dashboard/visitors`),
                clientAuthFetch(`https://bbqstyle-backend.onrender.com/api/dashboard/sales/today`),
                clientAuthFetch(`https://bbqstyle-backend.onrender.com/api/dashboard/orders/pending`),
                clientAuthFetch(`https://bbqstyle-backend.onrender.com/api/dashboard/products/count`)
            ]);
            
            const visitors = await visitorsRes.json();
            const sales = await salesRes.json();
            const orders = await ordersRes.json();
            const products = await productsRes.json();
            
            // Update dashboard stats
            document.getElementById('live-visitors').textContent = visitors.count || 0;
            document.getElementById('today-sales').textContent = '₹' + (sales.total || 0);
            document.getElementById('pending-orders').textContent = orders.count || 0;
            document.getElementById('total-products').textContent = products.count || 0;
            
            // Load pending orders table
            loadPendingOrdersTable();
            
            hideLoading('dashboard');
        } catch (error) {
            hideLoading('dashboard');
            console.error('Error loading dashboard:', error);
            // Set default values on error
            document.getElementById('live-visitors').textContent = '0';
            document.getElementById('today-sales').textContent = '₹0';
            document.getElementById('pending-orders').textContent = '0';
            document.getElementById('total-products').textContent = '0';
        }
    }
    
    // Load pending orders table for dashboard
    async function loadPendingOrdersTable() {
        const loadingBar = document.getElementById('pending-orders-loading');
        if (loadingBar) loadingBar.style.display = 'block';
        
        try {
            const res = await clientAuthFetch(`https://bbqstyle-backend.onrender.com/api/admin/orders?status=pending`);
            if (!res.ok) throw new Error('Failed to load pending orders');
            const orders = await res.json();
            
            const tableBody = document.querySelector('#pending-orders-table tbody');
            tableBody.innerHTML = '';
            
            if (orders.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #666;">No pending orders</td></tr>';
            } else {
                orders.slice(0, 10).forEach(order => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${order.order_id}</td>
                        <td>${order.customer_name || order.first_name + ' ' + order.last_name}</td>
                        <td>₹${order.total_amount}</td>
                        <td>${new Date(order.order_date).toLocaleDateString()}</td>
                        <td>
                            <button onclick="acceptOrder(${order.order_id})" style="background: #28a745; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Accept</button>
                            <button onclick="viewOrderDetails(${order.order_id})" style="background: #007bff; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">View</button>
                        </td>
                    `;
                    tableBody.appendChild(tr);
                });
            }
            
            if (loadingBar) loadingBar.style.display = 'none';
        } catch (error) {
            if (loadingBar) loadingBar.style.display = 'none';
            console.error('Error loading pending orders:', error);
            const tableBody = document.querySelector('#pending-orders-table tbody');
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #ff6f61;">Error loading orders</td></tr>';
        }
    }
    
    // Global functions for pending orders actions
    window.acceptOrder = async function(orderId) {
        try {
            const response = await clientAuthFetch(`${API_BASE_URL}/api/admin/orders/${orderId}/accept`, { method: 'POST' });
            const data = await response.json();
            if (data.success) {
                loadPendingOrdersTable();
                loadDashboard();
            }
        } catch (error) {
            console.error('Error accepting order:', error);
        }
    }
    
    window.viewOrderDetails = function(orderId) {
        showTab('orders');
        loadOrders();
    }
    
    // Mobile menu functionality
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    
    if (mobileMenuBtn && sidebar && sidebarOverlay) {
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            sidebarOverlay.classList.toggle('active');
        });
        
        sidebarOverlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
        });
        
        // Close mobile menu when clicking on a tab
        const tabLinks = document.querySelectorAll('#tabs li[data-tab]');
        tabLinks.forEach(tab => {
            tab.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('active');
                    sidebarOverlay.classList.remove('active');
                }
            });
        });
    }

    // Pagination helper function
    function createPagination(containerId, currentPage, totalPages, onPageChange) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';

        const prevBtn = document.createElement('button');
        prevBtn.textContent = '←';
        prevBtn.disabled = currentPage === 1;
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1) onPageChange(currentPage - 1);
        });

        const nextBtn = document.createElement('button');
        nextBtn.textContent = '→';
        nextBtn.disabled = currentPage === totalPages;
        nextBtn.addEventListener('click', () => {
            if (currentPage < totalPages) onPageChange(currentPage + 1);
        });

        const pageInfo = document.createElement('span');
        pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
        pageInfo.style.margin = '0 10px';
        pageInfo.style.fontWeight = '600';

        container.appendChild(prevBtn);
        container.appendChild(pageInfo);
        container.appendChild(nextBtn);
    }

    // Tabs
    const tabs = document.querySelectorAll('#tabs li[data-tab]');
    const tabContents = document.querySelectorAll('.tab-content');

    function showTab(tabName) {
        tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        tabContents.forEach(content => {
            content.classList.toggle('active', content.id === tabName);
        });
        
        // Update URL with tab name
        const url = new URL(window.location);
        url.searchParams.set('tab', tabName);
        window.history.pushState({}, '', url);
    }

    // Check session on page load to stay logged in
    async function checkSession() {
        try {
            const token = localStorage.getItem('adminToken');
            if (!token) {
                throw new Error('No token');
            }
            const res = await clientAuthFetch(`https://bbqstyle-backend.onrender.com/api/session`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                loginContainer.style.display = 'none';
                dashboard.style.display = 'block';
                
                // Check URL for tab parameter
                const urlParams = new URLSearchParams(window.location.search);
                const tabFromUrl = urlParams.get('tab');
                const defaultTab = tabFromUrl || 'dashboardd';
                
                showTab(defaultTab);
                if (defaultTab === 'dashboardd') {
                    loadDashboard();
                } else {
                    loadCategories();
                    loadProducts();
                }
            } else {
                loginContainer.style.display = 'block';
                dashboard.style.display = 'none';
            }
        } catch (err) {
            loginContainer.style.display = 'block';
            dashboard.style.display = 'none';
        }
    }

    checkSession();

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            showTab(tab.dataset.tab);
            if (tab.dataset.tab === 'dashboardd') {
                loadDashboard();
            } else if (tab.dataset.tab === 'products') {
                loadProducts();
                loadCollections();
            } else if (tab.dataset.tab === 'categories') {
                loadCategories();
            } else if (tab.dataset.tab === 'collections') {
                loadCollections();
            } else if (tab.dataset.tab === 'orders') {
                loadOrders();
            } else if (tab.dataset.tab === 'users') {
                loadUsers();
            } else if (tab.dataset.tab === 'reviews') {
                loadReviews();
            } else if (tab.dataset.tab === 'offers') {
                loadOffers();
            } else if (tab.dataset.tab === 'subscribers') {
                loadSubscribers();
            }
        });
    });

    // Load subscribers
    async function loadSubscribers() {
        showLoading('subscribers');
        
        // clientAuthFetch subscribers data from backend API
        const res = await clientAuthFetch(`${API_BASE_URL}/api/subscribers`);
        if (!res.ok) {
            hideLoading('subscribers');
            alert('Failed to load subscribers');
            return;
        }
        const subscribers = await res.json();
        
        hideLoading('subscribers');

        // Pagination variables
        let currentPage = 1;
        const pageSize = 20;
        let filteredSubscribers = subscribers;

        const subscribersTableBody = document.querySelector('#subscribers-table tbody');

        function renderSubscribersPage(page) {
            subscribersTableBody.innerHTML = '';
            const start = (page - 1) * pageSize;
            const end = start + pageSize;
            const pageItems = filteredSubscribers.slice(start, end);
            pageItems.forEach((subscriber, index) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${start + index + 1}</td>
                    <td>${subscriber.customer_name}</td>
                    <td>${subscriber.email_id}</td>
                `;
                subscribersTableBody.appendChild(tr);
            });
            createPagination('subscribers-pagination', page, Math.ceil(filteredSubscribers.length / pageSize), (newPage) => {
                currentPage = newPage;
                renderSubscribersPage(currentPage);
            });
        }

        renderSubscribersPage(currentPage);

        // Search subscribers by customer name or email
        document.getElementById('subscriber-search').addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            filteredSubscribers = subscribers.filter(subscriber =>
                subscriber.customer_name.toLowerCase().includes(searchTerm) ||
                subscriber.email_id.toLowerCase().includes(searchTerm)
            );
            currentPage = 1;
            renderSubscribersPage(currentPage);
        });
    }
    /*
    // Tabsm
    const tabsm = document.querySelectorAll('#tabsm li[data-tab]');

    function showTab(tabName) {
        tabsm.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        tabContents.forEach(content => {
            content.classList.toggle('active', content.id === tabName);
        });
    }

    tabsm.forEach(tab => {
        tab.addEventListener('click', () => {
            showTab(tab.dataset.tab);
            if (tab.dataset.tab === 'products') {
                loadProducts();
            } else if (tab.dataset.tab === 'categories') {
                loadCategories();
            } else if (tab.dataset.tab === 'orders') {
                loadOrders();
            } else if (tab.dataset.tab === 'customers') {
                loadCustomers();
            } else if (tab.dataset.tab === 'reviews') {
                loadReviews();
            } else if (tab.dataset.tab === 'subscribers') {
                loadSubscribers();
            }
        });

    // Load subscribers
    async function loadSubscribers() {
        // clientAuthFetch subscribers data from backend API
        const res = await clientAuthFetch(`${API_BASE_URL}/api/subscribers`);
        if (!res.ok) {
            alert('Failed to load subscribers');
            return;
        }
        const subscribers = await res.json();

        const subscribersTableBody = document.querySelector('#subscribers-table tbody');
        subscribersTableBody.innerHTML = '';
        subscribers.forEach((subscriber, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${index + 1}</td>
                <td>${subscriber.customer_name}</td>
                <td>${subscriber.email_id}</td>
            `;
            subscribersTableBody.appendChild(tr);
        });

        // Search subscribers by customer name or email
        document.getElementById('subscriber-search').addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const rows = subscribersTableBody.querySelectorAll('tr');
            rows.forEach(row => {
                const name = row.cells[1].textContent.toLowerCase();
                const email = row.cells[2].textContent.toLowerCase();
                if (name.includes(searchTerm) || email.includes(searchTerm)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    }
    });
    */
    // Login
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.style.display = 'none';
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            const res = await clientAuthFetch(`${API_BASE_URL}/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Login failed');
            }
            
            localStorage.setItem('adminToken', data.token);
            loginContainer.style.display = 'none';
            dashboard.style.display = 'block';
            
            // Check URL for tab parameter
            const urlParams = new URLSearchParams(window.location.search);
            const tabFromUrl = urlParams.get('tab');
            const defaultTab = tabFromUrl || 'dashboardd';
            
            showTab(defaultTab);
            if (defaultTab === 'dashboardd') {
                loadDashboard();
            } else {
                loadCategories();
                loadProducts();
            }
        } catch (err) {
            loginError.textContent = err.message;
            loginError.style.display = 'block';
        }
    });

    // Logout
    logoutBtn.addEventListener('click', async () => {
        localStorage.removeItem('adminToken');
        dashboard.style.display = 'none';
        loginContainer.style.display = 'block';
    });

    // Load categories for filter and category tab
    async function loadCategories(collectionFilter = '') {
        showLoading('categories');
        
        let url = `${API_BASE_URL}/api/categories`;
        if (collectionFilter) {
            url += `?collection_id=${collectionFilter}`;
        }
        const res = await clientAuthFetch(url);
        const categories = await res.json();
        
        hideLoading('categories');

        // Populate category filter in products tab
        const categoryFilter = document.getElementById('product-category-filter');
        categoryFilter.innerHTML = '<option value="">All Categories</option>';
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.category_id;
            option.textContent = cat.category_name;
            categoryFilter.appendChild(option);
        });

        // Populate category select in product form
        const productCategorySelect = document.getElementById('product-category');
        productCategorySelect.innerHTML = '<option value="">Select Category</option>';
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.category_id;
            option.textContent = cat.category_name;
            productCategorySelect.appendChild(option);
        });

        // Populate collection select in product form
        const productCollectionSelect = document.getElementById('product-collection');
        if (productCollectionSelect) {
            productCollectionSelect.innerHTML = '<option value="">Select Collection</option>';
            const resCollections = await clientAuthFetch(`${API_BASE_URL}/api/collections`);
            const collections = await resCollections.json();
            collections.forEach(col => {
                const option = document.createElement('option');
                option.value = col.collection_id;
                option.textContent = col.collection_name;
                productCollectionSelect.appendChild(option);
            });
        }

        // Populate collection select in category form (new)
        const categoryCollectionSelect = document.getElementById('category-collection');
        if (categoryCollectionSelect) {
            categoryCollectionSelect.innerHTML = '<option value="">Select Collection</option>';
            const resCollections2 = await clientAuthFetch(`${API_BASE_URL}/api/collections`);
            const collections2 = await resCollections2.json();
            collections2.forEach(col => {
                const option = document.createElement('option');
                option.value = col.collection_id;
                option.textContent = col.collection_name;
                categoryCollectionSelect.appendChild(option);
            });
        }

        // Populate categories table
        const categoriesTableBody = document.querySelector('#categories-table tbody');
        categoriesTableBody.innerHTML = '';
        categories.forEach(cat => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${cat.category_name}</td>
                <td>${cat.category_description || ''}</td>
                <td>${cat.category_image ? '<img src="https://bbqstyle.in' + cat.category_image + '" alt="Category Image" width="50">' : ''}</td>
                <td>${cat.collection_name || ''}</td>
                <td>
                    <button class="edit-category" data-id="${cat.category_id}">Edit</button>
                    <button class="delete-category" data-id="${cat.category_id}">Delete</button>
                </td>
            `;
            categoriesTableBody.appendChild(tr);
        });

        // Add event listeners for edit and delete
        document.querySelectorAll('.edit-category').forEach(btn => {
            btn.addEventListener('click', () => {
                editCategory(btn.dataset.id);
            });
        });
        document.querySelectorAll('.delete-category').forEach(btn => {
            btn.addEventListener('click', () => {
                deleteCategory(btn.dataset.id);
            });
        });

        // Search categories by name or description
        document.getElementById('category-search').addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            filteredCategories = categories.filter(cat =>
                cat.category_name.toLowerCase().includes(searchTerm) ||
                (cat.category_description && cat.category_description.toLowerCase().includes(searchTerm))
            );
            currentPage = 1;
            renderCategoriesPage(currentPage);
        });

        // Pagination variables and functions for categories
        let currentPage = 1;
        const pageSize = 20;
        let filteredCategories = categories;

        function renderCategoriesPage(page) {
            const categoriesTableBody = document.querySelector('#categories-table tbody');
            categoriesTableBody.innerHTML = '';
            const start = (page - 1) * pageSize;
            const end = start + pageSize;
            const pageItems = filteredCategories.slice(start, end);
            pageItems.forEach(cat => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${cat.category_name}</td>
                    <td>${cat.category_description || ''}</td>
                    <td>${cat.category_image ? '<img src="https://bbqstyle.in' + cat.category_image + '" alt="Category Image" width="50">' : ''}</td>
                    <td>${cat.collection_name || ''}</td>
                    <td>
                        <button class="edit-category" data-id="${cat.category_id}">Edit</button>
                        <button class="delete-category" data-id="${cat.category_id}">Delete</button>
                    </td>
                `;
                categoriesTableBody.appendChild(tr);
            });

            // Add event listeners for edit and delete
            document.querySelectorAll('.edit-category').forEach(btn => {
                btn.addEventListener('click', () => {
                    editCategory(btn.dataset.id);
                });
            });
            document.querySelectorAll('.delete-category').forEach(btn => {
                btn.addEventListener('click', () => {
                    deleteCategory(btn.dataset.id);
                });
            });

            createPagination('categories-pagination', page, Math.ceil(filteredCategories.length / pageSize), (newPage) => {
                currentPage = newPage;
                renderCategoriesPage(currentPage);
            });
        }

        // Initial render
        renderCategoriesPage(currentPage);
    }

    // Add event listener for collection filter in category tab
    const categoryCollectionFilter = document.getElementById('category-collection-filter');
    if (categoryCollectionFilter) {
        // Populate collection filter dropdown
        clientAuthFetch(`${API_BASE_URL}/api/collections`)
            .then(res => res.json())
            .then(collections => {
                collections.forEach(col => {
                    const option = document.createElement('option');
                    option.value = col.collection_id;
                    option.textContent = col.collection_name;
                    categoryCollectionFilter.appendChild(option);
                });
            })
            .catch(err => {
                console.error('Failed to load collections for category filter:', err);
            });

        categoryCollectionFilter.addEventListener('change', () => {
            const selectedCollection = categoryCollectionFilter.value;
            loadCategories(selectedCollection);
        });
    }

    // Load collections for filter and collection tab
    async function loadCollections() {
        showLoading('collections');
        
        const res = await clientAuthFetch(`${API_BASE_URL}/api/collections`);
        const collections = await res.json();
        
        hideLoading('collections');

        // Pagination variables and functions for collections
        let currentPage = 1;
        const pageSize = 20;
        let filteredCollections = collections;

        // Populate collection filter in products tab
        const collectionFilter = document.getElementById('product-collection-filter');
        collectionFilter.innerHTML = '<option value="">All Collections</option>';
        collections.forEach(col => {
            const option = document.createElement('option');
            option.value = col.collection_id;
            option.textContent = col.collection_name;
            collectionFilter.appendChild(option);
        });

        // Populate collection select in product form
        const productCollectionSelect = document.getElementById('product-collection');
        productCollectionSelect.innerHTML = '<option value="">Select Collection</option>';
        collections.forEach(col => {
            const option = document.createElement('option');
            option.value = col.collection_id;
            option.textContent = col.collection_name;
            productCollectionSelect.appendChild(option);
        });

        // Populate collections table
        const collectionsTableBody = document.querySelector('#collections-table tbody');

        function renderCollectionsPage(page) {
            collectionsTableBody.innerHTML = '';
            const start = (page - 1) * pageSize;
            const end = start + pageSize;
            const pageItems = filteredCollections.slice(start, end);
            pageItems.forEach(col => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${col.collection_name}</td>
                    <td>${col.collection_description || ''}</td>
                    <td>${col.collection_image ? '<img src="https://bbqstyle.in/src/collections/' + col.collection_image + '" alt="Collection Image" width="50">' : ''}</td>
                    <td>
                        <button class="edit-collection" data-id="${col.collection_id}">Edit</button>
                        <button class="delete-collection" data-id="${col.collection_id}">Delete</button>
                    </td>
                `;
                collectionsTableBody.appendChild(tr);
            });

            // Add event listeners for edit and delete
            document.querySelectorAll('.edit-collection').forEach(btn => {
                btn.addEventListener('click', () => {
                    editCollection(btn.dataset.id);
                });
            });
            document.querySelectorAll('.delete-collection').forEach(btn => {
                btn.addEventListener('click', () => {
                    deleteCollection(btn.dataset.id);
                });
            });

            createPagination('collections-pagination', page, Math.ceil(filteredCollections.length / pageSize), (newPage) => {
                currentPage = newPage;
                renderCollectionsPage(currentPage);
            });
        }

        // Search collections by name or description
        document.getElementById('collection-search').addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            filteredCollections = collections.filter(col =>
                col.collection_name.toLowerCase().includes(searchTerm) ||
                (col.collection_description && col.collection_description.toLowerCase().includes(searchTerm))
            );
            currentPage = 1;
            renderCollectionsPage(currentPage);
        });

        // Initial render
        renderCollectionsPage(currentPage);
    }

    // New code for review tab functionality

    // Load reviews
    async function loadReviews() {
        showLoading('reviews');
        
        const starFilter = document.getElementById('review-star-filter').value;
        const searchTerm = document.getElementById('review-search').value.trim();

        let url = `${API_BASE_URL}/api/reviews`;
        const params = [];
        if (starFilter) params.push(`stars=${starFilter}`);
        if (searchTerm) params.push(`search=${encodeURIComponent(searchTerm)}`);
        if (params.length > 0) url += '?' + params.join('&');

        try {
            const res = await clientAuthFetch(url);
            if (!res.ok) throw new Error('Failed to load reviews');
            const reviews = await res.json();
            
            hideLoading('reviews');

            // Pagination variables
            let currentPage = 1;
            const pageSize = 20;
            let filteredReviews = reviews;

            const reviewsTableBody = document.querySelector('#reviews-table tbody');

            function renderReviewsPage(page) {
                reviewsTableBody.innerHTML = '';
                const start = (page - 1) * pageSize;
                const end = start + pageSize;
                const pageItems = filteredReviews.slice(start, end);
                pageItems.forEach(review => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${review.customer_name}</td>
                        <td>${review.product_id}</td>
                        <td>${review.review_text}</td>
                        <td>${'★'.repeat(review.star_rating)}${'☆'.repeat(5 - review.star_rating)}</td>
                        <td>${review.publish_status ? 'Published' : 'Unpublished'}</td>
                        <td>
                            <button class="edit-review" data-id="${review.review_id}">Edit</button>
                            <button class="delete-review" data-id="${review.review_id}">Delete</button>
                            <button class="toggle-publish" data-id="${review.review_id}" data-publish="${review.publish_status}">
                                ${review.publish_status ? 'Unpublish' : 'Publish'}
                            </button>
                        </td>
                    `;
                    reviewsTableBody.appendChild(tr);
                });

                // Add event listeners for edit, delete, publish toggle
                document.querySelectorAll('.edit-review').forEach(btn => {
                    btn.addEventListener('click', () => {
                        editReview(btn.dataset.id);
                    });
                });
                document.querySelectorAll('.delete-review').forEach(btn => {
                    btn.addEventListener('click', () => {
                        deleteReview(btn.dataset.id);
                    });
                });
                document.querySelectorAll('.toggle-publish').forEach(btn => {
                    btn.addEventListener('click', () => {
                        togglePublish(btn.dataset.id, btn.dataset.publish === '1');
                    });
                });

                createPagination('reviews-pagination', page, Math.ceil(filteredReviews.length / pageSize), (newPage) => {
                    currentPage = newPage;
                    renderReviewsPage(currentPage);
                });
            }

            renderReviewsPage(currentPage);
        } catch (err) {
            hideLoading('reviews');
            alert(err.message);
        }
    }

    // Filter and search reviews
    document.getElementById('review-star-filter').addEventListener('change', loadReviews);
    document.getElementById('review-search').addEventListener('input', loadReviews);

    // Review form handling
    const reviewFormContainer = document.getElementById('review-form-container');
    const reviewForm = document.getElementById('review-form');
    const addReviewBtn = document.getElementById('add-review-btn');
    const cancelReviewBtn = document.getElementById('cancel-review-btn');

    addReviewBtn.addEventListener('click', () => {
        reviewForm.reset();
        document.getElementById('review-id').value = '';
        document.getElementById('review-form-title').textContent = 'Add Review';
        reviewFormContainer.style.display = 'block';
    });

    cancelReviewBtn.addEventListener('click', () => {
        reviewFormContainer.style.display = 'none';
    });

    reviewForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const reviewId = document.getElementById('review-id').value;
        const customer_name = document.getElementById('review-customer-name').value.trim();
        const product_id = document.getElementById('review-product-id').value.trim();
        const review_text = document.getElementById('review-text').value.trim();
        const star_rating = parseInt(document.getElementById('review-stars').value);
        const publish_status = document.getElementById('review-publish').checked;

        if (!customer_name || !product_id || !review_text || !star_rating) {
            alert('Please fill all required fields');
            return;
        }

        const payload = { customer_name, product_id, review_text, star_rating, publish_status };
        let url = `${API_BASE_URL}/api/reviews`;
        let method = 'POST';
        if (reviewId) {
            url += '/' + reviewId;
            method = 'PUT';
        }

        try {
            const res = await clientAuthFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to save review');
            }
            alert('Review saved successfully');
            reviewFormContainer.style.display = 'none';
            loadReviews();
        } catch (err) {
            alert(err.message);
        }
    });

    // Edit review
    async function editReview(id) {
        try {
            const res = await clientAuthFetch(`${API_BASE_URL}/api/reviews`);
            if (!res.ok) throw new Error('Failed to load reviews');
            const reviews = await res.json();
            const review = reviews.find(r => r.review_id == id);
            if (!review) return alert('Review not found');

            document.getElementById('review-id').value = review.review_id;
            document.getElementById('review-customer-name').value = review.customer_name;
            document.getElementById('review-product-id').value = review.product_id;
            document.getElementById('review-text').value = review.review_text;
            document.getElementById('review-stars').value = review.star_rating;
            document.getElementById('review-publish').checked = review.publish_status ? true : false;
            document.getElementById('review-form-title').textContent = 'Edit Review';
            reviewFormContainer.style.display = 'block';
        } catch (err) {
            alert(err.message);
        }
    }

    // Delete review
    async function deleteReview(id) {
        if (!confirm('Are you sure you want to delete this review?')) return;
        try {
            const res = await clientAuthFetch(`${API_BASE_URL}/api/reviews/` + id, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to delete review');
            }
            alert('Review deleted');
            loadReviews();
        } catch (err) {
            alert(err.message);
        }
    }

    // Toggle publish/unpublish
    async function togglePublish(id, currentStatus) {
        try {
            const res = await clientAuthFetch(`${API_BASE_URL}/api/reviews/` + id + '/publish', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ publish_status: !currentStatus })
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to update publish status');
            }
            alert('Publish status updated');
            loadReviews();
        } catch (err) {
            alert(err.message);
        }
    }

    // Filter products by category
    let currentCategoryFilter = '';
    let currentCollectionFilter = '';

    document.getElementById('product-category-filter').addEventListener('change', (e) => {
        currentCategoryFilter = e.target.value;
        loadProducts(currentCategoryFilter, currentCollectionFilter);
    });

    // Load products with optional category and collection filters
    async function loadProducts(categoryId = '', collectionId = '') {
        showLoading('products');

        let url = `${API_BASE_URL}/api/products`;
        const params = [];
        if (categoryId) params.push('category=' + categoryId);
        if (collectionId) params.push('collection=' + collectionId);
        if (params.length > 0) url += '?' + params.join('&');

        const res = await clientAuthFetch(url);
        const products = await res.json();
        
        hideLoading('products');

        // Check if products is an array, if not initialize it as an empty array
        const productsArray = Array.isArray(products) ? products : [];

        // Pagination variables
        let currentPage = 1;
        const pageSize = 20;
        let filteredProducts = productsArray;

        const productsTableBody = document.querySelector('#products-table tbody');

        function renderProductsPage(page) {
            productsTableBody.innerHTML = '';
            const start = (page - 1) * pageSize;
            const end = start + pageSize;
            const pageItems = filteredProducts.slice(start, end);
            pageItems.forEach((prod) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${prod.title}</td>
                    <td>${prod.sku}</td>
                    <td>${prod.price}</td>
                    <td>${prod.mrp || ''}</td>
                    <td style="max-width: 150px; height: 40px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 40px;" title="${prod.description ? prod.description.replace(/<[^>]*>/g, '') : ''}">${prod.description ? (prod.description.replace(/<[^>]*>/g, '').length > 50 ? prod.description.replace(/<[^>]*>/g, '').substring(0, 50) + '...' : prod.description.replace(/<[^>]*>/g, '')) : ''}</td>
                    <td>${prod.variant_details && Array.isArray(prod.variant_details) && prod.variant_details.length > 0 ? prod.variant_details[0] : ''}</td>
                    <td>${prod.variant_details && Array.isArray(prod.variant_details) && prod.variant_details.length > 1 ? prod.variant_details[1] : ''}</td>
                    <td>${prod.category_name || ''}</td>
                    <td>${prod.collection_name || ''}</td>
                    <td>
                        <button class="edit-product" data-id="${prod.product_id}">Edit</button>
                        <button class="delete-product" data-id="${prod.product_id}">Delete</button>
                    </td>
                `;
                productsTableBody.appendChild(tr);
            });
            createPagination('products-pagination', page, Math.ceil(filteredProducts.length / pageSize), (newPage) => {
                currentPage = newPage;
                renderProductsPage(currentPage);
            });
        }

        renderProductsPage(currentPage);

        // Add event listeners for edit and delete
        document.querySelectorAll('.edit-product').forEach(btn => {
            btn.removeEventListener('click', () => {
                editProduct(btn.dataset.id);
            });
            btn.addEventListener('click', () => {
                editProduct(btn.dataset.id);
            });
        });
        document.querySelectorAll('.delete-product').forEach(btn => {
            btn.removeEventListener('click', () => {
                deleteProduct(btn.dataset.id);
            });
            btn.addEventListener('click', () => {
                deleteProduct(btn.dataset.id);
            });
        });
    }

    // Filter products by collection
    document.getElementById('product-collection-filter').addEventListener('change', (e) => {
        currentCollectionFilter = e.target.value;
        loadProducts(currentCategoryFilter, currentCollectionFilter);
    });

    // Search products by title, SKU, or description
    document.getElementById('product-search').addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const productsTableBody = document.querySelector('#products-table tbody');
        const rows = productsTableBody.querySelectorAll('tr');
        rows.forEach(row => {
            const title = row.cells[0].textContent.toLowerCase();
            const sku = row.cells[1].textContent.toLowerCase();
            const description = row.cells[4].textContent.toLowerCase();
            if (title.includes(searchTerm) || sku.includes(searchTerm) || description.includes(searchTerm)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    });

    // Product form handling
    const productFormContainer = document.getElementById('product-form-container');
    const productForm = document.getElementById('product-form');
    const addProductBtn = document.getElementById('add-product-btn');
    const cancelProductBtn = document.getElementById('cancel-product-btn');

    addProductBtn.addEventListener('click', () => {
        productForm.reset();
        document.getElementById('product-id').value = '';
        document.getElementById('product-form-title').textContent = 'Add Product';
        clearVariants();
        initializeQuillEditor();
        if (quillEditor) {
            quillEditor.root.innerHTML = '';
        }
        productFormContainer.style.display = 'block';
    });

    // Variant adding system
    const variantContainer = document.getElementById('variant-container');

    function clearVariants() {
        // Clear all inputs
        const elements = [
            'product-colors', 'product-sizes', 'product-colors-only', 'product-sizes-only',
            'product-stock', 'product-images', 'size-images'
        ];
        elements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        
        // Clear containers
        const containers = [
            'color-variant-fields', 'color-only-fields', 'size-only-fields'
        ];
        containers.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });
        
        // Reset selects
        const selects = document.querySelectorAll('#has-variants, #color-variant, #size-variant');
        selects.forEach(select => {
            if (select) select.value = 'no';
        });
        
        // Reset visibility
        const hideContainers = [
            'variant-type-container', 'color-only-container', 'size-only-container', 'color-size-container'
        ];
        hideContainers.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        
        const showContainer = document.getElementById('no-variant-container');
        if (showContainer) showContainer.style.display = 'block';
    }

    // Function to generate color variant image fields and stock inputs
    function generateColorVariantFields(existingImages = []) {
        const colorsInput = document.getElementById('product-colors');
        const colorFieldsContainer = document.getElementById('color-variant-fields');
        const sizesInput = document.getElementById('product-sizes');
        
        if (!colorsInput || !colorFieldsContainer || !sizesInput) return;
        
        const colors = colorsInput.value.split(',').map(color => color.trim()).filter(color => color);
        const sizes = sizesInput.value.split(',').map(size => size.trim()).filter(size => size);
        
        // Clear existing fields
        colorFieldsContainer.innerHTML = '';
        
        // Create image upload field for each color and stock input for each color-size combination
        colors.forEach((color, colorIndex) => {
            const colorDiv = document.createElement('div');
            colorDiv.className = 'color-variant-field';
            colorDiv.style.border = '1px solid #ccc';
            colorDiv.style.padding = '10px';
            colorDiv.style.margin = '10px 0';

            // Find existing images for this color
            const existingImagesForColor = existingImages.filter(img => 
                img.variant_detail && img.variant_detail.toLowerCase().includes(color.toLowerCase())
            );

            let imagesHtml = '';
            const uniqueColorImages = [...new Set(existingImagesForColor.filter(img => img.image_path).map(img => img.image_path))];
            uniqueColorImages.forEach(imagePath => {
                imagesHtml += `<img src="https://bbqstyle.in/uploads/${imagePath}" alt="${color}" width="50" height="50" style="margin-right: 10px;">`;
                imagesHtml += `<input type="hidden" class="existing-color-image-path" value="${imagePath}" data-color="${color}" />`;
            });

            let sizeStockFields = '';
            sizes.forEach((size, sizeIndex) => {
                const variantDetail = `${color}-${size}`;
                const existingStock = existingImages.find(img => img.variant_detail === variantDetail)?.stock || 0;
                
                sizeStockFields += `
                    <div style="display: inline-block; margin: 5px;">
                        <label>${size}:</label>
                        <input type="number" class="size-stock-input" data-color="${color}" data-size="${size}" data-variant-detail="${variantDetail}" min="0" value="${existingStock}" style="width: fit-content;" />
                    </div>
                `;
            });

            colorDiv.innerHTML = `
                <h4 style="font-weight: bold; margin-bottom: 10px;">${color}</h4>
                <div>
                    <label>Images for ${color}:</label><br>
                    ${imagesHtml}
                    <input type="file" class="color-image-input" data-color="${color}" multiple accept="image/*" />
                </div>
                <div style="margin-top: 10px;">
                    <label>Stock by Size:</label><br>
                    ${sizeStockFields}
                </div>
            `;
            colorFieldsContainer.appendChild(colorDiv);
        });
    }

    // Add event listener for variant toggle
    document.getElementById('has-variants').addEventListener('change', function() {
        const variantTypeContainer = document.getElementById('variant-type-container');
        const noVariantContainer = document.getElementById('no-variant-container');
        const colorOnlyContainer = document.getElementById('color-only-container');
        const sizeOnlyContainer = document.getElementById('size-only-container');
        const colorSizeContainer = document.getElementById('color-size-container');
        
        if (this.value === 'yes') {
            variantTypeContainer.style.display = 'contents';
            noVariantContainer.style.display = 'none';
        } else {
            variantTypeContainer.style.display = 'none';
            noVariantContainer.style.display = 'block';
            colorOnlyContainer.style.display = 'none';
            sizeOnlyContainer.style.display = 'none';
            colorSizeContainer.style.display = 'none';
        }
    });
    
    // Add event listeners for color and size variant toggles
    function updateVariantContainers() {
        const colorVariant = document.getElementById('color-variant').value;
        const sizeVariant = document.getElementById('size-variant').value;
        const colorOnlyContainer = document.getElementById('color-only-container');
        const sizeOnlyContainer = document.getElementById('size-only-container');
        const colorSizeContainer = document.getElementById('color-size-container');
        
        // Hide all containers first
        colorOnlyContainer.style.display = 'none';
        sizeOnlyContainer.style.display = 'none';
        colorSizeContainer.style.display = 'none';
        
        if (colorVariant === 'yes' && sizeVariant === 'yes') {
            colorSizeContainer.style.display = 'block';
        } else if (colorVariant === 'yes') {
            colorOnlyContainer.style.display = 'block';
        } else if (sizeVariant === 'yes') {
            sizeOnlyContainer.style.display = 'block';
        }
    }
    
    document.getElementById('color-variant').addEventListener('change', updateVariantContainers);
    document.getElementById('size-variant').addEventListener('change', updateVariantContainers);

    // Add event listeners for color-only input
    document.getElementById('product-colors-only').addEventListener('input', function() {
        const colors = this.value.split(',').map(c => c.trim()).filter(c => c);
        const container = document.getElementById('color-only-fields');
        container.innerHTML = '';
        
        colors.forEach(color => {
            const div = document.createElement('div');
            div.style.marginBottom = '10px';
            div.innerHTML = `
                <label>${color}:</label>
                <input type="file" class="color-only-image" data-color="${color}" multiple accept="image/*" />
                <input type="number" class="color-only-stock" data-color="${color}" min="0" placeholder="Stock" style="width: fit-content; margin-left: 10px;" />
            `;
            container.appendChild(div);
        });
    });
    
    // Add event listeners for size-only input
    document.getElementById('product-sizes-only').addEventListener('input', function() {
        const sizes = this.value.split(',').map(s => s.trim()).filter(s => s);
        const container = document.getElementById('size-only-fields');
        container.innerHTML = '';
        
        sizes.forEach(size => {
            const div = document.createElement('div');
            div.style.marginBottom = '10px';
            div.innerHTML = `
                <label>${size}:</label>
                <input type="number" class="size-only-stock" data-size="${size}" min="0" placeholder="Stock" style="width: fit-content;" />
            `;
            container.appendChild(div);
        });
    });

    // Add event listeners for color and size inputs (color-size combination)
    document.getElementById('product-colors').addEventListener('input', () => {
        generateColorVariantFields();
    });
    
    document.getElementById('product-sizes').addEventListener('input', () => {
        generateColorVariantFields();
    });

    // Remove the old variant container event listeners as we're using a different structure now

    // Remove addVariantItem function as we're using color-size structure

    // Edit product
    async function editProduct(id) {
        const res = await clientAuthFetch(`${API_BASE_URL}/api/products/` + id);
        const product = await res.json();
        if (!product) return alert('Product not found');
        document.getElementById('product-id').value = product.product_id;
        document.getElementById('product-title').value = product.title;
        document.getElementById('product-sku').value = product.sku;
        document.getElementById('product-price').value = product.price;
        document.getElementById('product-mrp').value = product.mrp || '';
        document.getElementById('product-hsn').value = product.hsn || '';
        document.getElementById('product-weight').value = product.weight || '';
        
        // Initialize Quill editor first, then set description
        initializeQuillEditor();
        if (quillEditor) {
            quillEditor.root.innerHTML = product.description || '';
        }

        // Load variants based on product data
        clearVariants();
        if (product.variant_type && product.variant_details) {
            document.getElementById('has-variants').value = 'yes';
            document.getElementById('variant-type-container').style.display = 'contents';
            document.getElementById('no-variant-container').style.display = 'none';
            
            try {
                let types = Array.isArray(product.variant_type) ? product.variant_type : JSON.parse(product.variant_type);
                let details = Array.isArray(product.variant_details) ? product.variant_details : JSON.parse(product.variant_details);
                
                if (types.length >= 2) {
                    document.getElementById('color-variant').value = 'yes';
                    document.getElementById('size-variant').value = 'yes';
                    document.getElementById('product-colors').value = details[0] || '';
                    document.getElementById('product-sizes').value = details[1] || '';
                    updateVariantContainers();
                    generateColorVariantFields(product.images);
                } else if (types[0] === 'Color') {
                    document.getElementById('color-variant').value = 'yes';
                    document.getElementById('product-colors-only').value = details[0] || '';
                    updateVariantContainers();
                    
                    // Show color-only images and stock
                    const colors = details[0].split(',').map(c => c.trim()).filter(c => c);
                    const container = document.getElementById('color-only-fields');
                    container.innerHTML = '';
                    
                    colors.forEach(color => {
                        const colorImages = product.images.filter(img => img.variant_detail === color);
                        const stock = colorImages.length > 0 ? colorImages[0].stock : 0;
                        
                        const div = document.createElement('div');
                        div.style.marginBottom = '10px';
                        
                        let imagesHtml = '';
                        const uniqueColorImages = [...new Set(colorImages.filter(img => img.image_path).map(img => img.image_path))];
                        uniqueColorImages.forEach(imagePath => {
                            imagesHtml += `<img src="https://bbqstyle.in/uploads/${imagePath}" alt="${color}" width="50" height="50" style="margin-right: 10px; border: 1px solid #ccc; border-radius: 4px;" />`;
                        });
                        
                        div.innerHTML = `
                            <label>${color}:</label><br>
                            ${imagesHtml ? `<div style="margin: 5px 0;">${imagesHtml}</div>` : ''}
                            <input type="file" class="color-only-image" data-color="${color}" multiple accept="image/*" />
                            <input type="number" class="color-only-stock" data-color="${color}" min="0" placeholder="Stock" value="${stock}" style="width: fit-content; margin-left: 10px;" />
                        `;
                        container.appendChild(div);
                    });
                } else if (types[0] === 'Size') {
                    document.getElementById('size-variant').value = 'yes';
                    document.getElementById('product-sizes-only').value = details[0] || '';
                    updateVariantContainers();
                    
                    // Show size-only images and stock
                    const sizes = details[0].split(',').map(s => s.trim()).filter(s => s);
                    const container = document.getElementById('size-only-fields');
                    container.innerHTML = '';
                    
                    sizes.forEach(size => {
                        const sizeImages = product.images.filter(img => img.variant_detail === size);
                        const stock = sizeImages.length > 0 ? sizeImages[0].stock : 0;
                        
                        const div = document.createElement('div');
                        div.style.marginBottom = '10px';
                        
                        let imagesHtml = '';
                        const uniqueSizeImages = [...new Set(sizeImages.filter(img => img.image_path).map(img => img.image_path))];
                        uniqueSizeImages.forEach(imagePath => {
                            imagesHtml += `<img src="https://bbqstyle.in/uploads/${imagePath}" alt="${size}" width="50" height="50" style="margin-right: 10px; border: 1px solid #ccc; border-radius: 4px;" />`;
                        });
                        
                        div.innerHTML = `
                            <label>${size}:</label><br>
                            ${imagesHtml ? `<div style="margin: 5px 0;">${imagesHtml}</div>` : ''}
                            <input type="file" class="size-image-input" data-size="${size}" multiple accept="image/*" />
                            <input type="number" class="size-only-stock" data-size="${size}" min="0" placeholder="Stock" value="${stock}" style="width: fit-content; margin-left: 10px;" />
                        `;
                        container.appendChild(div);
                    });
                }
            } catch (e) {
                console.error('Error parsing variant data:', e);
            }
        } else {
            // No variants - load stock and images
            if (product.images && product.images.length > 0) {
                const stockValue = product.images[0].stock || 0;
                document.getElementById('product-stock').value = stockValue;
                
                // Show existing images as thumbnails
                const noVariantContainer = document.getElementById('no-variant-container');
                let existingImagesDiv = noVariantContainer.querySelector('.existing-images');
                if (!existingImagesDiv) {
                    existingImagesDiv = document.createElement('div');
                    existingImagesDiv.className = 'existing-images';
                    noVariantContainer.appendChild(existingImagesDiv);
                }
                existingImagesDiv.innerHTML = `
                    <label>Existing Images:</label><br>
                    <div style="display: flex; gap: 10px; margin: 10px 0; flex-wrap: wrap;">
                        ${product.images.filter(img => img.image_path).map(img => 
                            `<img src="https://bbqstyle.in/uploads/${img.image_path}" alt="Product" width="50" height="50" style="border: 1px solid #ccc; border-radius: 4px;" />`
                        ).join('')}
                    </div>
                `;
            }
        }

        // Load categories and collections first, then set values
        await loadCategories();
        await loadCollections();
        
        document.getElementById('product-category').value = product.category_id || '';
        document.getElementById('product-collection').value = product.collection_id || '';
        document.getElementById('product-form-title').textContent = 'Edit Product';
        productFormContainer.style.display = 'block';
    }

    cancelProductBtn.addEventListener('click', () => {
        productFormContainer.style.display = 'none';
    });

    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Basic validation
        const title = document.getElementById('product-title').value.trim();
        const sku = document.getElementById('product-sku').value.trim();
        const price = document.getElementById('product-price').value.trim();
        const categoryId = document.getElementById('product-category').value;
        
        if (!title || !sku || !price || !categoryId) {
            alert('Please fill in all required fields: Title, SKU, Price, and Category');
            return;
        }
        
        const formData = new FormData();
        const productId = document.getElementById('product-id').value;
        
        formData.append('title', title);
        formData.append('sku', sku);
        formData.append('price', price);
        formData.append('mrp', document.getElementById('product-mrp').value || '');
        formData.append('hsn', document.getElementById('product-hsn').value || '');
        formData.append('weight', document.getElementById('product-weight').value || '');
        // Get HTML content from Quill editor
        const description = quillEditor ? quillEditor.root.innerHTML : '';
        formData.append('description', description);
        formData.append('category_id', document.getElementById('product-category').value);
        formData.append('collection_id', document.getElementById('product-collection').value);

        // Handle variants based on selection
        const hasVariants = document.getElementById('has-variants').value;
        
        if (hasVariants === 'yes') {
            const colorVariant = document.getElementById('color-variant').value;
            const sizeVariant = document.getElementById('size-variant').value;
            
            if (colorVariant === 'yes' && sizeVariant === 'yes') {
                // Color + Size variants
                const colorsInput = document.getElementById('product-colors');
                const sizesInput = document.getElementById('product-sizes');
                const colors = colorsInput.value.split(',').map(c => c.trim()).filter(c => c);
                const sizes = sizesInput.value.split(',').map(s => s.trim()).filter(s => s);
                
                if (colors.length > 0 && sizes.length > 0) {
                    formData.append('variant_type', JSON.stringify(['Color', 'Size']));
                    formData.append('variant_details', JSON.stringify([colors.join(', '), sizes.join(', ')]));
                    
                    // Handle color images and stocks
                    const colorImageInputs = document.querySelectorAll('.color-image-input');
                    const sizeStockInputs = document.querySelectorAll('.size-stock-input');
                    
                    colorImageInputs.forEach((input, i) => {
                        const color = input.getAttribute('data-color');
                        const files = input.files;
                        if (files.length > 0) {
                            for (let j = 0; j < files.length; j++) {
                                formData.append(`colorImages_${i}_${j}`, files[j]);
                                formData.append(`colorImageDetail_${i}_${j}`, color);
                            }
                        }
                    });
                    
                    sizeStockInputs.forEach((input, i) => {
                        formData.append(`variantStock_${i}`, input.value);
                        formData.append(`variantStockDetail_${i}`, input.getAttribute('data-variant-detail'));
                    });
                }
            } else if (colorVariant === 'yes') {
                // Color only variants
                const colorsInput = document.getElementById('product-colors-only');
                const colors = colorsInput.value.split(',').map(c => c.trim()).filter(c => c);
                
                if (colors.length > 0) {
                    formData.append('variant_type', JSON.stringify(['Color']));
                    formData.append('variant_details', JSON.stringify([colors.join(', ')]));
                    
                    const colorOnlyImages = document.querySelectorAll('.color-only-image');
                    const colorOnlyStocks = document.querySelectorAll('.color-only-stock');
                    
                    colorOnlyImages.forEach((input, i) => {
                        const files = input.files;
                        if (files.length > 0) {
                            for (let j = 0; j < files.length; j++) {
                                formData.append(`colorImages_${i}_${j}`, files[j]);
                                formData.append(`colorImageDetail_${i}_${j}`, input.getAttribute('data-color'));
                            }
                        }
                    });
                    
                    colorOnlyStocks.forEach((input, i) => {
                        formData.append(`variantStock_${i}`, input.value);
                        formData.append(`variantStockDetail_${i}`, input.getAttribute('data-color'));
                    });
                }
            } else if (sizeVariant === 'yes') {
                // Size only variants
                const sizesInput = document.getElementById('product-sizes-only');
                const sizes = sizesInput.value.split(',').map(s => s.trim()).filter(s => s);
                
                if (sizes.length > 0) {
                    formData.append('variant_type', JSON.stringify(['Size']));
                    formData.append('variant_details', JSON.stringify([sizes.join(', ')]));
                    
                    const sizeImages = document.getElementById('size-images').files;
                    const sizeOnlyStocks = document.querySelectorAll('.size-only-stock');
                    
                    if (sizeImages.length > 0) {
                        for (let i = 0; i < sizeImages.length; i++) {
                            formData.append(`productImages_${i}`, sizeImages[i]);
                        }
                    }
                    
                    sizeOnlyStocks.forEach((input, i) => {
                        formData.append(`variantStock_${i}`, input.value);
                        formData.append(`variantStockDetail_${i}`, input.getAttribute('data-size'));
                    });
                }
            }
        } else {
            // No variants - simple product
            const productStock = document.getElementById('product-stock').value;
            const productImages = document.getElementById('product-images').files;
            
            formData.append('stock', productStock);
            
            if (productImages.length > 0) {
                for (let i = 0; i < productImages.length; i++) {
                    formData.append(`productImages_${i}`, productImages[i]);
                }
            }
        }

        let url = `${API_BASE_URL}/api/products`;
        let method = 'POST';
        if (productId) {
            url += '/' + productId;
            method = 'PUT';
        }
        try {
            const res = await clientAuthFetch(url, {
                method,
                body: formData
            });
            if (!res.ok) {
                const responseText = await res.text();
                console.error('Server response:', res.status, responseText);
                let errorData;
                try {
                    errorData = JSON.parse(responseText);
                } catch {
                    errorData = { error: `Server error ${res.status}: ${responseText}` };
                }
                throw new Error(errorData.error || `Server error (${res.status}). Please check server logs.`);
            }
            alert('Product saved successfully');
            productFormContainer.style.display = 'none';
            loadProducts();
        } catch (err) {
            console.error('Product save error:', err);
            console.error('Error details:', {
                message: err.message,
                stack: err.stack,
                name: err.name
            });
            alert(err.message || 'Failed to save product');
        }
    });

    // Delete product
    async function deleteProduct(id) {
        if (!confirm('Are you sure you want to delete this product?')) return;
        try {
            const res = await clientAuthFetch(`${API_BASE_URL}/api/products/` + id, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to delete product');
            }
            alert('Product deleted');
            loadProducts();
        } catch (err) {
            alert(err.message);
        }
    }

    // Category form handling
    const categoryFormContainer = document.getElementById('category-form-container');
    const categoryForm = document.getElementById('category-form');
    const addCategoryBtn = document.getElementById('add-category-btn');
    const cancelCategoryBtn = document.getElementById('cancel-category-btn');

    addCategoryBtn.addEventListener('click', () => {
        categoryForm.reset();
        document.getElementById('category-id').value = '';
        document.getElementById('category-form-title').textContent = 'Add Category';
        categoryFormContainer.style.display = 'block';
    });

    cancelCategoryBtn.addEventListener('click', () => {
        categoryFormContainer.style.display = 'none';
    });

    categoryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData();

        const categoryId = document.getElementById('category-id').value;
        formData.append('categoryName', document.getElementById('category-name').value);
        formData.append('categoryDescription', document.getElementById('category-description').value);
        formData.append('collectionId', document.getElementById('category-collection').value);

        const categoryImage = document.getElementById('category-image').files[0];
        if (categoryImage) {
            formData.append('categoryImage', categoryImage);
        }

        let url = `${API_BASE_URL}/api/categories`;
        let method = 'POST';
        if (categoryId) {
            url += '/' + categoryId;
            method = 'PUT';
        }
        try {
            const res = await clientAuthFetch(url, {
                method,
                body: formData
            });
            if (!res.ok) throw new Error('Failed to save category');
            alert('Category saved successfully');
            categoryFormContainer.style.display = 'none';
            loadCategories();
        } catch (err) {
            alert(err.message);
        }
    });

    // Edit category
    async function editCategory(id) {
        const res = await clientAuthFetch(`${API_BASE_URL}/api/categories`);
        const categories = await res.json();
        const category = categories.find(c => c.category_id == id);
        if (!category) return alert('Category not found');
        document.getElementById('category-id').value = category.category_id;
        document.getElementById('category-name').value = category.category_name;
        document.getElementById('category-description').value = category.category_description || '';
        document.getElementById('category-form-title').textContent = 'Edit Category';
        categoryFormContainer.style.display = 'block';
    }

    // Delete category
    async function deleteCategory(id) {
        if (!confirm('Are you sure you want to delete this category?')) return;
        const res = await clientAuthFetch(`${API_BASE_URL}/api/categories/` + id, { method: 'DELETE' });
        if (!res.ok) return alert('Failed to delete category');
        alert('Category deleted');
        loadCategories();
    }

    // Collection form handling
    const collectionFormContainer = document.getElementById('collection-form-container');
    const collectionForm = document.getElementById('collection-form');
    const addCollectionBtn = document.getElementById('add-collection-btn');
    const cancelCollectionBtn = document.getElementById('cancel-collection-btn');

    addCollectionBtn.addEventListener('click', () => {
        collectionForm.reset();
        document.getElementById('collection-id').value = '';
        document.getElementById('collection-form-title').textContent = 'Add Collection';
        collectionFormContainer.style.display = 'block';
    });

    cancelCollectionBtn.addEventListener('click', () => {
        collectionFormContainer.style.display = 'none';
    });

    collectionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData();

        const collectionId = document.getElementById('collection-id').value;
        formData.append('collectionName', document.getElementById('collection-name').value);
        formData.append('collectionDescription', document.getElementById('collection-description').value);

        const collectionImage = document.getElementById('collection-image').files[0];
        if (collectionImage) {
            formData.append('collectionImage', collectionImage);
        }

        let url = `${API_BASE_URL}/api/collections`;
        let method = 'POST';
        if (collectionId) {
            url += '/' + collectionId;
            method = 'PUT';
        }
        try {
            const res = await clientAuthFetch(url, {
                method,
                body: formData
            });
            if (!res.ok) throw new Error('Failed to save collection');
            alert('Collection saved successfully');
            collectionFormContainer.style.display = 'none';
            loadCollections();
        } catch (err) {
            alert(err.message);
        }
    });

    // Edit collection
    async function editCollection(id) {
        const res = await clientAuthFetch(`${API_BASE_URL}/api/collections`);
        const collections = await res.json();
        const collection = collections.find(c => c.collection_id == id);
        if (!collection) return alert('Collection not found');
        document.getElementById('collection-id').value = collection.collection_id;
        document.getElementById('collection-name').value = collection.collection_name;
        document.getElementById('collection-description').value = collection.collection_description || '';
        document.getElementById('collection-form-title').textContent = 'Edit Collection';
        collectionFormContainer.style.display = 'block';
    }

    // Delete collection
    async function deleteCollection(id) {
        if (!confirm('Are you sure you want to delete this collection?')) return;
        const res = await clientAuthFetch(`${API_BASE_URL}/api/collections/` + id, { method: 'DELETE' });
        if (!res.ok) return alert('Failed to delete collection');
        alert('Collection deleted');
        loadCollections();
    }

    // Load orders
    async function loadOrders() {
        showLoading('orders');
        
        const statusFilter = document.getElementById('order-status-filter')?.value || '';
        const dateFilter = document.getElementById('order-date-filter')?.value || '';
        const paymentFilter = document.getElementById('order-payment-filter')?.value || '';
        const search = document.getElementById('order-search').value.trim();
        
        let url = `${API_BASE_URL}/api/admin/orders`;
        const params = [];
        if (statusFilter) params.push('status=' + statusFilter);
        if (dateFilter) params.push('date=' + dateFilter);
        if (paymentFilter) params.push('payment=' + paymentFilter);
        if (search) params.push('search=' + encodeURIComponent(search));
        if (params.length > 0) url += '?' + params.join('&');
        
        const res = await clientAuthFetch(url);
        let orders = await res.json();
        
        hideLoading('orders');

        // Pagination variables
        let currentPage = 1;
        const pageSize = 20;
        let filteredOrders = orders;

        const ordersTableBody = document.querySelector('#orders-table tbody');

        function renderOrdersPage(page) {
            ordersTableBody.innerHTML = '';
            const start = (page - 1) * pageSize;
            const end = start + pageSize;
            const pageItems = filteredOrders.slice(start, end);
            pageItems.forEach(order => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${order.order_id}</td>
                    <td>${order.customer_name || order.first_name + ' ' + order.last_name}</td>
                    <td>${order.address_line1}, ${order.city}, ${order.state} - ${order.pincode}</td>
                    <td>₹${order.total_amount}</td>
                    <td>${order.payment_mode}</td>
                    <td>${order.status}</td>
                    <td>${new Date(order.order_date).toLocaleString()}</td>
                    <td>
                        <button class="view-order-items" data-order-id="${order.order_id}" data-customer="${order.customer_name || order.first_name + ' ' + order.last_name}">View Items</button>
                        <button class="view-customer" data-order-id="${order.order_id}">View Customer</button>
                        <button class="edit-order" data-order-id="${order.order_id}">Edit</button>
                    </td>
                    <td>
                        ${getOrderActionButtons(order)}
                    </td>
                `;
                ordersTableBody.appendChild(tr);
            });

            // Add event listeners for view items
            document.querySelectorAll('.view-order-items').forEach(btn => {
                btn.addEventListener('click', () => {
                    showOrderItems(btn.dataset.orderId, btn.dataset.customer);
                });
            });
            
            // Add event listeners for edit order
            document.querySelectorAll('.edit-order').forEach(btn => {
                btn.addEventListener('click', () => {
                    editOrder(btn.dataset.orderId);
                });
            });

            createPagination('orders-pagination', page, Math.ceil(filteredOrders.length / pageSize), (newPage) => {
                currentPage = newPage;
                renderOrdersPage(currentPage);
            });
            
            // Add event listeners for order actions
            addOrderActionListeners();
        }

        renderOrdersPage(currentPage);
    }

    // Show order items modal
    const orderItemsContainer = document.getElementById('order-items-container');
    const orderItemsCustomer = document.getElementById('order-items-customer');
    const orderItemsTableBody = document.querySelector('#order-items-table tbody');
    const closeOrderItemsBtn = document.getElementById('close-order-items-btn');

    async function showOrderItems(orderId, customerName) {
        try {
            const res = await clientAuthFetch(`${API_BASE_URL}/api/admin/orders/` + orderId + '/items');
            if (!res.ok) throw new Error('Failed to load order items');
            const items = await res.json();

            orderItemsCustomer.textContent = customerName;
            orderItemsTableBody.innerHTML = '';
            
            if (items.length === 0) {
                orderItemsTableBody.innerHTML = '<tr><td colspan="6">No items found for this order</td></tr>';
            } else {
                items.forEach(item => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>
                            ${item.image_path ? `<img src="https://bbqstyle.in/uploads/${item.image_path}" alt="${item.title}" width="50" height="50" style="border-radius: 4px;">` : 'No Image'}
                        </td>
                        <td>${item.title}</td>
                        <td>${item.variant_type || 'No Type'}</td>
                        <td>${item.variant_detail || 'No Detail'}</td>
                        <td>${item.quantity}</td>
                        <td>₹${item.price}</td>
                    `;
                    tr.style.backgroundColor = 'white';
                    orderItemsTableBody.appendChild(tr);
                });
            }

            orderItemsContainer.style.display = 'block';
        } catch (err) {
            alert(err.message);
        }
    }

    closeOrderItemsBtn.addEventListener('click', () => {
        orderItemsContainer.style.display = 'none';
    });

    // Order action functions
    function getOrderActionButtons(order) {
        const status = order.status;
        const orderId = order.order_id;
        
        if (status === 'pending') {
            return `
                <button class="accept-order" data-order-id="${orderId}">Accept</button>
                <button class="cancel-order" data-order-id="${orderId}">Cancel</button>
            `;
        } else if (status === 'processing') {
            return `
                <button class="cancel-order" data-order-id="${orderId}">Cancel</button>
                <button class="add-tracking" data-order-id="${orderId}">Add Tracking</button>
            `;
        } else if (status === 'ready') {
            return `
                <button class="edit-tracking" data-order-id="${orderId}" data-tracking-id="${order.tracking_id || ''}" data-tracking-link="${order.tracking_link || ''}" data-carrier="${order.carrier || ''}">Edit Tracking</button>
                <button class="update-status" data-order-id="${orderId}">Update Status</button>
            `;
        } else if (status === 'shipped' || status === 'out_for_delivery') {
            return `
                <button class="edit-tracking" data-order-id="${orderId}" data-tracking-id="${order.tracking_id || ''}" data-tracking-link="${order.tracking_link || ''}" data-carrier="${order.carrier || ''}">Edit Tracking</button>
            `;
        }
        return '';
    }

    // Add event listeners for order actions
    function addOrderActionListeners() {
        document.querySelectorAll('.accept-order').forEach(btn => {
            btn.addEventListener('click', () => acceptOrder(btn.dataset.orderId));
        });
        document.querySelectorAll('.cancel-order').forEach(btn => {
            btn.addEventListener('click', () => cancelOrder(btn.dataset.orderId));
        });
        document.querySelectorAll('.add-tracking').forEach(btn => {
            btn.addEventListener('click', () => addTracking(btn.dataset.orderId));
        });
        document.querySelectorAll('.edit-tracking').forEach(btn => {
            btn.addEventListener('click', () => editTracking(btn.dataset.orderId, btn.dataset.trackingId, btn.dataset.trackingLink, btn.dataset.carrier));
        });
        document.querySelectorAll('.update-status').forEach(btn => {
            btn.addEventListener('click', () => updateTrackingStatus(btn.dataset.orderId));
        });
    }

    async function acceptOrder(orderId) {
        try {
            const response = await clientAuthFetch(`${API_BASE_URL}/api/admin/orders/${orderId}/accept`, { method: 'POST' });
            const data = await response.json();
            if (data.success) {
                loadOrders();
            }
        } catch (error) {
            console.error('Error accepting order');
        }
    };

    async function cancelOrder(orderId) {
        if (confirm('Are you sure you want to cancel this order?')) {
            try {
                const response = await clientAuthFetch(`${API_BASE_URL}/api/admin/orders/${orderId}/cancel`, { method: 'POST' });
                const data = await response.json();
                if (data.success) {
                    loadOrders();
                }
            } catch (error) {
                console.error('Error cancelling order');
            }
        }
    };

    function addTracking(orderId) {
        document.getElementById('tracking-form-title').textContent = 'Add Tracking';
        document.getElementById('tracking-order-id').value = orderId;
        document.getElementById('tracking-id').value = '';
        document.getElementById('tracking-link').value = '';
        document.getElementById('tracking-form-container').style.display = 'block';
    };

    function editTracking(orderId, trackingId = '', trackingLink = '', carrier = '') {
        document.getElementById('tracking-form-title').textContent = 'Edit Tracking';
        document.getElementById('tracking-order-id').value = orderId;
        document.getElementById('tracking-id').value = trackingId;
        document.getElementById('tracking-link').value = trackingLink;
        document.getElementById('tracking-carrier').value = carrier;
        document.getElementById('tracking-form-container').style.display = 'block';
    };

    // Tracking form handlers
    document.getElementById('tracking-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const orderId = document.getElementById('tracking-order-id').value;
        const trackingId = document.getElementById('tracking-id').value;
        const trackingLink = document.getElementById('tracking-link').value;
        const carrier = document.getElementById('tracking-carrier').value;
        
        try {
            const response = await clientAuthFetch(`${API_BASE_URL}/api/admin/orders/${orderId}/tracking`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ trackingId, trackingLink, carrier })
            });
            const data = await response.json();
            if (data.success) {
                alert('Tracking saved');
                document.getElementById('tracking-form-container').style.display = 'none';
                loadOrders();
            } else {
                alert('Failed to save tracking');
            }
        } catch (error) {
            alert('Error saving tracking');
        }
    });

    document.getElementById('cancel-tracking-btn').addEventListener('click', () => {
        document.getElementById('tracking-form-container').style.display = 'none';
    });

    // Customer address modal handlers
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('view-customer')) {
            const orderId = e.target.dataset.orderId;
            viewCustomerAddress(orderId);
        }
    });

    document.getElementById('close-address-btn').addEventListener('click', () => {
        document.getElementById('customer-address-container').style.display = 'none';
    });

    async function viewCustomerAddress(orderId) {
        try {
            const response = await clientAuthFetch(`${API_BASE_URL}/api/admin/orders/${orderId}/address`);
            const address = await response.json();
            
            if (address) {
                const addressFields = document.getElementById('address-fields');
                addressFields.innerHTML = `
                    <div class="address-field">
                        <label>Full Name:</label>
                        <span>${address.full_name || 'N/A'}</span>
                        <button onclick="copyToClipboard('${address.full_name || ''}')">📋</button>
                    </div>
                    <div class="address-field">
                        <label>Mobile:</label>
                        <span>${address.mobile_no || 'N/A'}</span>
                        <button onclick="copyToClipboard('${address.mobile_no || ''}')">📋</button>
                    </div>
                    <div class="address-field">
                        <label>Address Line 1:</label>
                        <span>${address.address_line1 || 'N/A'}</span>
                        <button onclick="copyToClipboard('${address.address_line1 || ''}')">📋</button>
                    </div>
                    <div class="address-field">
                        <label>Address Line 2:</label>
                        <span>${address.address_line2 || 'N/A'}</span>
                        <button onclick="copyToClipboard('${address.address_line2 || ''}')">📋</button>
                    </div>
                    <div class="address-field">
                        <label>City:</label>
                        <span>${address.city || 'N/A'}</span>
                        <button onclick="copyToClipboard('${address.city || ''}')">📋</button>
                    </div>
                    <div class="address-field">
                        <label>State:</label>
                        <span>${address.state || 'N/A'}</span>
                        <button onclick="copyToClipboard('${address.state || ''}')">📋</button>
                    </div>
                    <div class="address-field">
                        <label>Pincode:</label>
                        <span>${address.pincode || 'N/A'}</span>
                        <button onclick="copyToClipboard('${address.pincode || ''}')">📋</button>
                    </div>
                `;
                document.getElementById('customer-address-container').style.display = 'block';
            }
        } catch (error) {
            console.error('Error clientAuthFetching customer address:', error);
        }
    }

    window.copyToClipboard = function(text) {
        navigator.clipboard.writeText(text).then(() => {
            console.log('Copied to clipboard:', text);
        });
    };
    
    // Update tracking status function
    async function updateTrackingStatus(orderId) {
        try {
            // Get order details first
            const ordersRes = await clientAuthFetch(`${API_BASE_URL}/api/admin/orders`);
            const orders = await ordersRes.json();
            const order = orders.find(o => o.order_id == orderId);
            
            if (!order || !order.tracking_id || !order.carrier) {
                alert('Order must have tracking ID and carrier to update status');
                return;
            }
            
            const response = await clientAuthFetch(`${API_BASE_URL}/api/track-carrier`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    trackingId: order.tracking_id, 
                    carrier: order.carrier 
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                alert(`Status updated to: ${result.status}`);
                loadOrders();
            } else {
                alert('Failed to update status: ' + (result.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error updating tracking status:', error);
            alert('Error updating tracking status');
        }
    }
    
    // Edit order function
    async function editOrder(orderId) {
        try {
            const res = await clientAuthFetch(`${API_BASE_URL}/api/admin/orders`);
            if (!res.ok) throw new Error('Failed to load orders');
            const orders = await res.json();
            const order = orders.find(o => o.order_id == orderId);
            
            if (!order) {
                alert('Order not found');
                return;
            }
            
            // Create edit form modal
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div id="edit-order-form-container" class="modal-content">
                    <div class="modalbody">
                        <form id="edit-order-form">
                            <h2>Edit Order #${order.order_id}<span class="close-modal">&times;</span></h2>
                            
                            <div class="form-group">
                                <label>Customer:</label>
                                <input type="text" value="${order.customer_name || (order.first_name + ' ' + order.last_name)}" readonly>
                            </div>
                            <div class="form-group">
                                <label>Total Amount:</label>
                                <input type="number" id="edit-total-amount" value="${order.total_amount}" step="0.01" required>
                            </div>
                            <div class="form-group">
                                <label>Payment Mode:</label>
                                <select id="edit-payment-mode" required>
                                    <option value="COD" ${order.payment_mode === 'COD' ? 'selected' : ''}>COD</option>
                                    <option value="Online" ${order.payment_mode === 'Online' ? 'selected' : ''}>Online</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Status:</label>
                                <select id="edit-order-status" required>
                                    <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Pending</option>
                                    <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>Processing</option>
                                    <option value="ready" ${order.status === 'ready' ? 'selected' : ''}>Ready</option>
                                    <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>Delivered</option>
                                    <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                                </select>
                            </div>

                            <button type="submit">Update Order</button>
                        </form>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // Close modal
            modal.querySelector('.close-modal').onclick = () => modal.remove();
            modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
            
            // Handle form submission
            modal.querySelector('#edit-order-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const orderData = {
                    total_amount: document.getElementById('edit-total-amount').value,
                    payment_mode: document.getElementById('edit-payment-mode').value,
                    status: document.getElementById('edit-order-status').value
                };
                
                try {
                    const response = await clientAuthFetch(`${API_BASE_URL}/api/admin/orders/${orderId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(orderData)
                    });
                    
                    const data = await response.json();
                    
                    if (response.ok) {
                        alert('Order updated successfully');
                        modal.remove();
                        loadOrders();
                    } else {
                        alert(data.error || 'Failed to update order');
                    }
                } catch (error) {
                    alert('Error updating order');
                }
            });
            
        } catch (error) {
            console.error('Error loading order details:', error);
            alert('Error loading order details');
        }
    }


    // Make sure to call addOrderActionListeners after rendering orders
    window.getOrderActionButtons = getOrderActionButtons;
    window.addOrderActionListeners = addOrderActionListeners;
    window.showOrderItems = showOrderItems;

    // Add event listeners for order filters
    if (document.getElementById('order-status-filter')) {
        document.getElementById('order-status-filter').addEventListener('change', loadOrders);
    }
    if (document.getElementById('order-date-filter')) {
        document.getElementById('order-date-filter').addEventListener('change', loadOrders);
    }
    if (document.getElementById('order-payment-filter')) {
        document.getElementById('order-payment-filter').addEventListener('change', loadOrders);
    }
    if (document.getElementById('order-search')) {
        document.getElementById('order-search').addEventListener('input', loadOrders);
    }

    // Load users
    async function loadUsers() {
        showLoading('users');
        
        const filter = document.getElementById('user-filter')?.value || '';
        let url = `${API_BASE_URL}/api/users`;
        if (filter) url += '?filter=' + filter;
        
        const res = await clientAuthFetch(url);
        const users = await res.json();
        
        hideLoading('users');

        // Pagination variables
        let currentPage = 1;
        const pageSize = 20;
        let filteredUsers = users;

        const usersTableBody = document.querySelector('#users-table tbody');

        function renderUsersPage(page) {
            usersTableBody.innerHTML = '';
            const start = (page - 1) * pageSize;
            const end = start + pageSize;
            const pageItems = filteredUsers.slice(start, end);
            pageItems.forEach(user => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${user.user_id}</td>
                    <td>${user.name}</td>
                    <td>${user.email}</td>
                    <td>${user.mobile || ''}</td>
                    <td><button class="view-orders" data-id="${user.user_id}" data-name="${user.name}">View Orders</button></td>
                `;
                usersTableBody.appendChild(tr);
            });

            // Add event listeners for view orders
            document.querySelectorAll('.view-orders').forEach(btn => {
                btn.addEventListener('click', () => {
                    showUserOrders(btn.dataset.id, btn.dataset.name);
                });
            });

            createPagination('users-pagination', page, Math.ceil(filteredUsers.length / pageSize), (newPage) => {
                currentPage = newPage;
                renderUsersPage(currentPage);
            });
        }

        renderUsersPage(currentPage);
    }

    // Search users by name, email, or phone
    if (document.getElementById('user-search')) {
        document.getElementById('user-search').addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const usersTableBody = document.querySelector('#users-table tbody');
            const rows = usersTableBody.querySelectorAll('tr');
            rows.forEach(row => {
                const name = row.cells[1].textContent.toLowerCase();
                const email = row.cells[2].textContent.toLowerCase();
                const mobile = row.cells[3].textContent.toLowerCase();
                if (name.includes(searchTerm) || email.includes(searchTerm) || mobile.includes(searchTerm)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    }
    
    // Add filter event listener
    if (document.getElementById('user-filter')) {
        document.getElementById('user-filter').addEventListener('change', loadUsers);
    }

    // Show user orders
    const userOrdersContainer = document.getElementById('user-orders-container');
    const userOrdersName = document.getElementById('user-orders-name');
    const userOrdersTableBody = document.querySelector('#user-orders-table tbody');
    const closeUserOrdersBtn = document.getElementById('close-user-orders-btn');

    async function showUserOrders(userId, userName) {
        const res = await clientAuthFetch(`${API_BASE_URL}/api/users/` + userId + '/orders');
        const orders = await res.json();

        userOrdersName.textContent = userName;
        userOrdersTableBody.innerHTML = '';
        orders.forEach(order => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${order.order_id}</td>
                <td>${new Date(order.order_date).toLocaleString()}</td>
                <td>₹${order.amount}</td>
                <td>${order.status || ''}</td>
                <td><button class="view-order-items" data-order-id="${order.order_id}" data-customer="${userName}">View Items</button></td>
            `;
            userOrdersTableBody.appendChild(tr);
        });
        
        // Add event listeners for view items
        document.querySelectorAll('.view-order-items').forEach(btn => {
            btn.addEventListener('click', () => {
                showUserOrderItems(btn.dataset.orderId, btn.dataset.customer);
            });
        });

        userOrdersContainer.style.display = 'block';
    }

    if (closeUserOrdersBtn) {
        closeUserOrdersBtn.addEventListener('click', () => {
            userOrdersContainer.style.display = 'none';
        });
    }

    // Show user order items function
    async function showUserOrderItems(orderId, customerName) {
        try {
            const res = await clientAuthFetch(`${API_BASE_URL}/api/users/orders/` + orderId + '/items');
            if (!res.ok) throw new Error('Failed to load order items');
            const items = await res.json();

            const userOrderItemsContainer = document.getElementById('user-order-items-container');
            const userOrderItemsCustomer = document.getElementById('user-order-items-customer');
            const userOrderItemsTableBody = document.querySelector('#user-order-items-table tbody');
            
            userOrderItemsCustomer.textContent = customerName;
            userOrderItemsTableBody.innerHTML = '';
            
            if (items.length === 0) {
                userOrderItemsTableBody.innerHTML = '<tr><td colspan="6">No items found for this order</td></tr>';
            } else {
                items.forEach(item => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>
                            ${item.image_path ? `<img src="https://bbqstyle.in/uploads/${item.image_path}" alt="${item.title}" width="50" height="50" style="border-radius: 4px;">` : 'No Image'}
                        </td>
                        <td>${item.title}</td>
                        <td>${item.variant_type || 'No Type'}</td>
                        <td>${item.variant_detail || 'No Detail'}</td>
                        <td>${item.quantity}</td>
                        <td>₹${item.price}</td>
                    `;
                    userOrderItemsTableBody.appendChild(tr);
                });
            }

            userOrderItemsContainer.style.display = 'block';
        } catch (err) {
            alert('Failed to load order items: ' + err.message);
        }
    }

    // Close user order items modal
    const closeUserOrderItemsBtn = document.getElementById('close-user-order-items-btn');
    if (closeUserOrderItemsBtn) {
        closeUserOrderItemsBtn.addEventListener('click', () => {
            document.getElementById('user-order-items-container').style.display = 'none';
        });
    }

    // Settings form
    const settingsForm = document.getElementById('settings-form');
    const faviconInput = document.getElementById('favicon-input');
    const currentFaviconPreview = document.getElementById('current-favicon-preview');

    // Load current favicon on page load
    function loadCurrentFavicon() {
        const timestamp = new Date().getTime();
        currentFaviconPreview.src = `https://bbqstyle.in/src/favicon.ico?t=${timestamp}`;
        currentFaviconPreview.onerror = function() {
            // Create a simple placeholder if favicon doesn't exist
            this.style.backgroundColor = '#ff6f61';
            this.style.color = 'white';
            this.style.display = 'flex';
            this.style.alignItems = 'center';
            this.style.justifyContent = 'center';
            this.style.fontSize = '12px';
            this.style.fontWeight = 'bold';
            this.alt = 'No Favicon';
            this.title = 'No favicon found - upload one below';
        };
    }

    // Preview selected favicon
    faviconInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                currentFaviconPreview.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (faviconInput.files.length === 0) {
            alert('Please select a favicon file');
            return;
        }
        
        const formData = new FormData();
        formData.append('favicon', faviconInput.files[0]);

        try {
            const res = await clientAuthFetch(`${API_BASE_URL}/api/settings/favicon`, {
                method: 'POST',
                body: formData
            });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Failed to update favicon');
            }
            alert('Favicon updated successfully! The new favicon will appear after page refresh.');
            
            // Reset form and reload current favicon
            faviconInput.value = '';
            setTimeout(() => {
                loadCurrentFavicon();
                // Update the actual page favicon
                const existingLink = document.querySelector("link[rel*='icon']");
                if (existingLink) {
                    existingLink.href = `https://bbqstyle.in/src/favicon.ico?t=${new Date().getTime()}`;
                } else {
                    const link = document.createElement('link');
                    link.type = 'image/x-icon';
                    link.rel = 'shortcut icon';
                    link.href = `https://bbqstyle.in/src/favicon.ico?t=${new Date().getTime()}`;
                    document.getElementsByTagName('head')[0].appendChild(link);
                }
            }, 1000);
        } catch (err) {
            alert(err.message);
            loadCurrentFavicon(); // Reset preview on error
        }
    });

    // Load current favicon when settings tab is opened
    const settingsTab = document.querySelector('[data-tab="settings"]');
    if (settingsTab) {
        settingsTab.addEventListener('click', () => {
            loadCurrentFavicon();
            loadSlideshow();
        });
    }
    
    // Load favicon on initial page load if on settings tab
    if (window.location.hash === '#settings' || document.querySelector('[data-tab="settings"]').classList.contains('active')) {
        loadCurrentFavicon();
    }

    // Slideshow management
    async function loadSlideshow() {
        showLoading('slideshow');
        
        try {
            const response = await clientAuthFetch(`${API_BASE_URL}/api/slideshow`);
            const slides = await response.json();
            
            hideLoading('slideshow');
            
            const tbody = document.querySelector('#slideshow-table tbody');
            tbody.innerHTML = '';
            
            slides.forEach(slide => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${slide.order}</td>
                    <td>${slide.heading}</td>
                    <td>${slide.description}</td>
                    <td>${slide.image ? `<img src="https://bbqstyle.in${slide.image}" width="50">` : 'No image'}</td>
                    <td>${slide.status ? 'Published' : 'Draft'}</td>
                    <td>
                        <button onclick="editSlide(${slide.id})">Edit</button>
                        <button onclick="deleteSlide(${slide.id})">Delete</button>
                    </td>
                `;
                tbody.appendChild(row);
            });
        } catch (error) {
            hideLoading('slideshow');
            console.error('Error loading slideshow:', error);
        }
    }

    document.getElementById('add-slide-btn').addEventListener('click', () => {
        document.getElementById('slide-form-title').textContent = 'Add Slide';
        document.getElementById('slide-form').reset();
        document.getElementById('slide-id').value = '';
        document.getElementById('slide-form-container').style.display = 'block';
    });

    document.getElementById('slide-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData();
        const slideId = document.getElementById('slide-id').value;
        
        formData.append('heading', document.getElementById('slide-heading').value);
        formData.append('description', document.getElementById('slide-description').value);
        formData.append('order', document.getElementById('slide-order').value);
        formData.append('status', document.getElementById('slide-status').value);
        
        const imageFile = document.getElementById('slide-image').files[0];
        if (imageFile) {
            formData.append('image', imageFile);
        }

        try {
            const url = slideId ? `${API_BASE_URL}/api/slideshow/${slideId}` : `${API_BASE_URL}/api/slideshow`;
            const method = slideId ? 'PUT' : 'POST';
            
            const response = await clientAuthFetch(url, {
                method: method,
                body: formData
            });
            
            const result = await response.json();
            if (result.success) {
                alert('Slide saved successfully!');
                document.getElementById('slide-form-container').style.display = 'none';
                loadSlideshow();
            } else {
                alert('Error saving slide');
            }
        } catch (error) {
            console.error('Error saving slide:', error);
            alert('Error saving slide');
        }
    });

    document.getElementById('cancel-slide-btn').addEventListener('click', () => {
        document.getElementById('slide-form-container').style.display = 'none';
    });

    window.editSlide = async (id) => {
        try {
            const response = await clientAuthFetch(`${API_BASE_URL}/api/slideshow`);
            const slides = await response.json();
            const slide = slides.find(s => s.id === id);
            
            if (slide) {
                document.getElementById('slide-form-title').textContent = 'Edit Slide';
                document.getElementById('slide-id').value = slide.id;
                document.getElementById('slide-heading').value = slide.heading;
                document.getElementById('slide-description').value = slide.description;
                document.getElementById('slide-order').value = slide.order;
                document.getElementById('slide-status').value = slide.status;
                
                // Show current image thumbnail
                const imageLabel = document.querySelector('label[for="slide-image"], label:has(#slide-image)');
                let existingThumbnail = imageLabel.querySelector('.current-image-thumbnail');
                if (existingThumbnail) {
                    existingThumbnail.remove();
                }
                
                if (slide.image) {
                    const thumbnail = document.createElement('div');
                    thumbnail.className = 'current-image-thumbnail';
                    thumbnail.innerHTML = `<br><small>Current image:</small><br><img src="https://bbqstyle.in${slide.image}" width="100" style="border: 1px solid #ccc; border-radius: 4px; margin: 5px 0;">`;
                    imageLabel.appendChild(thumbnail);
                }
                
                document.getElementById('slide-form-container').style.display = 'block';
            }
        } catch (error) {
            console.error('Error loading slide:', error);
        }
    };

    window.deleteSlide = async (id) => {
        if (confirm('Are you sure you want to delete this slide?')) {
            try {
                const response = await clientAuthFetch(`${API_BASE_URL}/api/slideshow/${id}`, {
                    method: 'DELETE'
                });
                
                const result = await response.json();
                if (result.success) {
                    alert('Slide deleted successfully!');
                    loadSlideshow();
                } else {
                    alert('Error deleting slide');
                }
            } catch (error) {
                console.error('Error deleting slide:', error);
                alert('Error deleting slide');
            }
        }
    };

    // Load slideshow when settings tab is active
    const settingsTabForSlideshow = document.querySelector('[data-tab="settings"]');
    if (settingsTabForSlideshow) {
        settingsTabForSlideshow.addEventListener('click', loadSlideshow);
    }

    // Load offers
    async function loadOffers() {
        const loadingBar = document.getElementById('offers-loading');
        if (loadingBar) loadingBar.style.display = 'block';
        
        const search = document.getElementById('offer-search').value.trim();
        let url = `${API_BASE_URL}/admin/offers`;
        if (search) url += '?search=' + encodeURIComponent(search);
        
        try {
            const res = await clientAuthFetch(url);
            if (!res.ok) throw new Error('Failed to load offers');
            const offers = await res.json();
            
            if (loadingBar) loadingBar.style.display = 'none';

            const offersTableBody = document.querySelector('#offers-table tbody');
            offersTableBody.innerHTML = '';
            
            offers.forEach(offer => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${offer.code}</td>
                    <td>${offer.discount_type === 'percentage' ? 'Percentage' : 'Fixed Value'}</td>
                    <td>${offer.discount_type === 'percentage' ? offer.discount_value + '%' : '₹' + offer.discount_value}</td>
                    <td>${offer.used}</td>
                    <td>${offer.offer_limit}</td>
                    <td>
                        <label class="toggle-switch">
                            <input type="checkbox" class="offer-toggle" data-id="${offer.offer_id}" ${offer.is_enabled ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </td>
                    <td>${new Date(offer.created_at).toLocaleDateString()}</td>
                    <td>
                        <button class="edit-offer" data-id="${offer.offer_id}">Edit</button>
                        <button class="delete-offer" data-id="${offer.offer_id}">Delete</button>
                        <button class="view-offer-users" data-id="${offer.offer_id}" data-code="${offer.code}">Users</button>
                    </td>
                `;
                offersTableBody.appendChild(tr);
            });

            // Add event listeners
            document.querySelectorAll('.edit-offer').forEach(btn => {
                btn.addEventListener('click', () => editOffer(btn.dataset.id));
            });
            document.querySelectorAll('.delete-offer').forEach(btn => {
                btn.addEventListener('click', () => deleteOffer(btn.dataset.id));
            });
            document.querySelectorAll('.view-offer-users').forEach(btn => {
                btn.addEventListener('click', () => showOfferUsers(btn.dataset.id, btn.dataset.code));
            });
            document.querySelectorAll('.offer-toggle').forEach(toggle => {
                toggle.addEventListener('change', (e) => toggleOfferStatus(e.target.dataset.id, e.target.checked));
            });
        } catch (err) {
            alert(err.message);
        }
    }

    // Offer form handling
    const offerFormContainer = document.getElementById('offer-form-container');
    const offerForm = document.getElementById('offer-form');
    const addOfferBtn = document.getElementById('add-offer-btn');
    const cancelOfferBtn = document.getElementById('cancel-offer-btn');

    if (addOfferBtn) {
        addOfferBtn.addEventListener('click', () => {
            if (offerForm) offerForm.reset();
            const offerIdInput = document.getElementById('offer-id');
            const offerFormTitle = document.getElementById('offer-form-title');
            if (offerIdInput) offerIdInput.value = '';
            if (offerFormTitle) offerFormTitle.textContent = 'Add Offer';
            if (offerFormContainer) offerFormContainer.style.display = 'block';
        });
    }

    if (cancelOfferBtn) {
        cancelOfferBtn.addEventListener('click', () => {
            if (offerFormContainer) offerFormContainer.style.display = 'none';
        });
    }

    if (offerForm) {
        offerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const offerId = document.getElementById('offer-id').value;
            const code = document.getElementById('offer-code').value.trim();
            const discount_type = document.getElementById('offer-discount-type').value;
            const discount_value = parseFloat(document.getElementById('offer-discount-value').value);
            const offer_limit = parseInt(document.getElementById('offer-limit').value);
            const is_enabled = document.getElementById('offer-status').value === 'true';

            if (!code || !discount_type || !discount_value || !offer_limit) {
                alert('Please fill all required fields');
                return;
            }

            const payload = { code, discount_type, discount_value, offer_limit, is_enabled };
            let url = `${API_BASE_URL}/admin/offers`;
            let method = 'POST';
            if (offerId) {
                url += '/' + offerId;
                method = 'PUT';
            }

            try {
                const res = await clientAuthFetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || 'Failed to save offer');
                }
                alert('Offer saved successfully');
                if (offerFormContainer) offerFormContainer.style.display = 'none';
                loadOffers();
            } catch (err) {
                alert(err.message);
            }
        });
    }

    // Edit offer
    async function editOffer(id) {
        try {
            const res = await clientAuthFetch(`${API_BASE_URL}/admin/offers`);
            if (!res.ok) throw new Error('Failed to load offers');
            const offers = await res.json();
            const offer = offers.find(o => o.offer_id == id);
            if (!offer) return alert('Offer not found');

            document.getElementById('offer-id').value = offer.offer_id;
            document.getElementById('offer-code').value = offer.code;
            document.getElementById('offer-discount-type').value = offer.discount_type;
            document.getElementById('offer-discount-value').value = offer.discount_value;
            document.getElementById('offer-limit').value = offer.offer_limit;
            document.getElementById('offer-status').value = offer.is_enabled ? 'true' : 'false';
            document.getElementById('offer-form-title').textContent = 'Edit Offer';
            offerFormContainer.style.display = 'block';
        } catch (err) {
            alert(err.message);
        }
    }

    // Delete offer
    async function deleteOffer(id) {
        if (!confirm('Are you sure you want to delete this offer?')) return;
        try {
            const res = await clientAuthFetch(`${API_BASE_URL}/admin/offers/` + id, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to delete offer');
            }
            alert('Offer deleted');
            loadOffers();
        } catch (err) {
            alert(err.message);
        }
    }

    // Toggle offer status
    async function toggleOfferStatus(offerId, isEnabled) {
        try {
            const res = await clientAuthFetch(`${API_BASE_URL}/admin/offers/` + offerId + '/toggle', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_enabled: isEnabled })
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to toggle offer status');
            }
        } catch (err) {
            alert(err.message);
            const toggle = document.querySelector(`[data-id="${offerId}"]`);
            if (toggle) toggle.checked = !isEnabled;
        }
    }

    // Show offer users
    const offerUsersContainer = document.getElementById('offer-users-container');
    const offerUsersCode = document.getElementById('offer-users-code');
    const offerUsersTableBody = document.querySelector('#offer-users-table tbody');
    const closeOfferUsersBtn = document.getElementById('close-offer-users-btn');

    async function showOfferUsers(offerId, code) {
        try {
            const res = await clientAuthFetch(`${API_BASE_URL}/admin/offers/` + offerId + '/users');
            if (!res.ok) throw new Error('Failed to load users');
            const users = await res.json();

            if (offerUsersCode) offerUsersCode.textContent = code;
            if (offerUsersTableBody) offerUsersTableBody.innerHTML = '';
            
            if (users.length === 0) {
                if (offerUsersTableBody) offerUsersTableBody.innerHTML = '<tr><td colspan="3">No users have used this offer yet</td></tr>';
            } else {
                users.forEach(user => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${user.first_name} ${user.last_name}</td>
                        <td>${user.email}</td>
                        <td>${new Date(user.used_at).toLocaleString()}</td>
                    `;
                    if (offerUsersTableBody) offerUsersTableBody.appendChild(tr);
                });
            }

            if (offerUsersContainer) offerUsersContainer.style.display = 'block';
        } catch (err) {
            alert(err.message);
        }
    }

    if (closeOfferUsersBtn) {
        closeOfferUsersBtn.addEventListener('click', () => {
            if (offerUsersContainer) offerUsersContainer.style.display = 'none';
        });
    }

    // Search offers
    const offerSearchInput = document.getElementById('offer-search');
    if (offerSearchInput) {
        offerSearchInput.addEventListener('input', loadOffers);
    }
});
