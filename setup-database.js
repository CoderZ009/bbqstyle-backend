const mysql = require('mysql');

// MySQL Connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'bbqstyle'
});

// Function to execute SQL queries with promises
function executeQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        db.query(query, params, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

// Create database if not exists
async function createDatabase() {
    const dbConnection = mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: ''
    });

    return new Promise((resolve, reject) => {
        dbConnection.query('CREATE DATABASE IF NOT EXISTS bbqstyle', (err, result) => {
            if (err) {
                reject(err);
            } else {
                console.log('Database bbqstyle created or already exists');
                dbConnection.end();
                resolve(result);
            }
        });
    });
}

// Initialize all database tables
async function setupDatabase() {
    try {
        console.log('Setting up database...');
        
        // Create database first
        await createDatabase();
        
        // Connect to the database
        db.connect((err) => {
            if (err) {
                console.error('Error connecting to database:', err);
                return;
            }
            console.log('Connected to MySQL database');
        });

        console.log('Creating database tables...');

        // Users table (must be first due to foreign key dependencies)
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS users (
                user_id INT AUTO_INCREMENT PRIMARY KEY,
                first_name VARCHAR(255) NOT NULL,
                last_name VARCHAR(255) NOT NULL,
                email VARCHAR(255),
                mobile VARCHAR(20) NOT NULL UNIQUE,
                password VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Collections table
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS collections (
                collection_id INT AUTO_INCREMENT PRIMARY KEY,
                collection_name VARCHAR(255) NOT NULL,
                collection_description TEXT,
                collection_image VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Categories table
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS categories (
                category_id INT AUTO_INCREMENT PRIMARY KEY,
                category_name VARCHAR(255) NOT NULL,
                category_description TEXT,
                category_image VARCHAR(255),
                collection_id INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (collection_id) REFERENCES collections(collection_id) ON DELETE SET NULL
            )
        `);

        // Products table
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS products (
                product_id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                sku VARCHAR(100) UNIQUE NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                mrp DECIMAL(10,2),
                hsn VARCHAR(20) NULL,
                weight DECIMAL(8,2) NULL,
                description TEXT,
                variant_type TEXT,
                variant_details TEXT,
                category_id INT,
                collection_id INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE SET NULL,
                FOREIGN KEY (collection_id) REFERENCES collections(collection_id) ON DELETE SET NULL
            )
        `);

        // Product images table
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS product_images (
                image_id INT AUTO_INCREMENT PRIMARY KEY,
                product_id INT NOT NULL,
                variant_detail VARCHAR(255),
                image_path VARCHAR(255),
                stock INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
            )
        `);

        // Addresses table
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS addresses (
                address_id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                full_name VARCHAR(255) NOT NULL,
                mobile_no VARCHAR(20) NOT NULL,
                address_line1 VARCHAR(255) NOT NULL,
                address_line2 VARCHAR(255),
                city VARCHAR(100) NOT NULL,
                district VARCHAR(100),
                state VARCHAR(100) NOT NULL,
                pincode VARCHAR(10) NOT NULL,
                is_default BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )
        `);

        // Orders table
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS orders (
                order_id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                address_id INT,
                subtotal DECIMAL(10,2),
                discount DECIMAL(10,2) DEFAULT 0,
                order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                total_amount DECIMAL(10,2) NOT NULL,
                weight DECIMAL(8,2) NULL,
                status VARCHAR(50) DEFAULT 'pending',
                payment_mode VARCHAR(50),
                tracking_id VARCHAR(100),
                tracking_link TEXT,
                carrier VARCHAR(50) NULL,
                offer_code VARCHAR(50) DEFAULT NULL,
                delivery_date TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (address_id) REFERENCES addresses(address_id) ON DELETE SET NULL
            )
        `);

        // Order items table
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS order_items (
                order_item_id INT AUTO_INCREMENT PRIMARY KEY,
                order_id INT NOT NULL,
                product_id INT NOT NULL,
                variant_type VARCHAR(255),
                variant_detail VARCHAR(255),
                quantity INT NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
            )
        `);

        // Cart table
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS cart (
                cart_id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                product_id INT NOT NULL,
                quantity INT NOT NULL DEFAULT 1,
                variant_detail VARCHAR(255),
                stock INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE(user_id, product_id, variant_detail),
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
            )
        `);

        // Wishlist table
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS wishlist (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                product_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, product_id),
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
            )
        `);

        // Reviews table
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS reviews (
                review_id INT AUTO_INCREMENT PRIMARY KEY,
                product_id INT NOT NULL,
                review_text TEXT NOT NULL,
                star_rating INT NOT NULL CHECK (star_rating >= 1 AND star_rating <= 5),
                publish_status TINYINT(1) DEFAULT 0,
                user_id INT,
                order_item_id INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
                FOREIGN KEY (order_item_id) REFERENCES order_items(order_item_id) ON DELETE SET NULL
            )
        `);

        // Offers table
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS offers (
                offer_id INT AUTO_INCREMENT PRIMARY KEY,
                code VARCHAR(50) UNIQUE NOT NULL,
                discount_type ENUM('percentage', 'value') NOT NULL,
                discount_value DECIMAL(10,2) NOT NULL,
                used INT DEFAULT 0,
                offer_limit INT NOT NULL,
                is_enabled BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Offer usage table
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS offer_usage (
                id INT AUTO_INCREMENT PRIMARY KEY,
                offer_id INT NOT NULL,
                user_id INT NOT NULL,
                used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (offer_id) REFERENCES offers(offer_id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )
        `);

        // Subscribers table
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS subscribers (
                sr_no INT AUTO_INCREMENT PRIMARY KEY,
                customer_name VARCHAR(255) NOT NULL,
                email_id VARCHAR(255) NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Sessions table
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS sessions (
                sid VARCHAR(36) NOT NULL PRIMARY KEY,
                expires DATETIME,
                data TEXT,
                createdAt DATETIME NOT NULL,
                updatedAt DATETIME NOT NULL
            )
        `);

        // Temp orders table for payment processing
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS temp_orders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_id VARCHAR(100) NOT NULL UNIQUE,
                user_id INT NOT NULL,
                address_id INT NOT NULL,
                total_amount DECIMAL(10,2) NOT NULL,
                items_data TEXT NOT NULL,
                payment_session_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )
        `);

        // OTP verifications table
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS otp_verifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                mobile VARCHAR(20) NOT NULL,
                otp VARCHAR(6) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                verified BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tracking history table
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS tracking_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_id INT NOT NULL,
                tracking_id VARCHAR(100) NOT NULL,
                carrier VARCHAR(50) NOT NULL,
                status VARCHAR(50) NOT NULL,
                location VARCHAR(255),
                timestamp DATETIME NOT NULL,
                raw_data JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
            )
        `);

        // Tracking update logs table
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS tracking_update_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                update_type ENUM('manual', 'webhook', 'scheduled') NOT NULL,
                orders_checked INT DEFAULT 0,
                orders_updated INT DEFAULT 0,
                success_count INT DEFAULT 0,
                error_count INT DEFAULT 0,
                errors JSON,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP NULL
            )
        `);

        // Create indexes for better performance
        await executeQuery(`CREATE INDEX IF NOT EXISTS idx_orders_tracking ON orders(tracking_id, carrier)`);
        await executeQuery(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`);
        await executeQuery(`CREATE INDEX IF NOT EXISTS idx_tracking_history_order ON tracking_history(order_id)`);
        await executeQuery(`CREATE INDEX IF NOT EXISTS idx_tracking_history_tracking ON tracking_history(tracking_id, carrier)`);
        await executeQuery(`CREATE INDEX IF NOT EXISTS idx_tracking_logs_date ON tracking_update_logs(started_at)`);

        console.log('✅ All database tables created successfully!');
        console.log('Database setup complete. You can now run your application.');
        
        db.end();
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error setting up database:', error);
        process.exit(1);
    }
}

// Run setup
setupDatabase();