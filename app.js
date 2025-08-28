require('dotenv').config();
const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const ftp = require('basic-ftp');
const session = require('express-session');
const Sequelize = require('sequelize');
const SequelizeStore = require('connect-session-sequelize')(session.Store);

// Initialize Sequelize
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST,
    dialect: 'mysql',
    logging: false // Disable logging for cleaner console
});
const bcrypt = require('bcrypt');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const nodemailer = require('nodemailer');
const JWT_SECRET = process.env.JWT_SECRET;

// Bluehost SMTP Configuration
const smtpTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'mail.bbqstyle.in',
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: true,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    tls: {
        rejectUnauthorized: false
    },
    debug: true,
    logger: true
});

// Test SMTP connection on startup
smtpTransporter.verify((error, success) => {
    if (error) {
        console.error('SMTP connection failed:', error);
    } else {
        console.log('SMTP server is ready to send emails');
    }
});

// Email sending function
async function sendEmail(to, subject, html, text = null) {
    console.log('Attempting to send email:', { to, subject, from: process.env.SMTP_USER });
    
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.error('SMTP credentials not configured');
        return { success: false, error: 'SMTP credentials not configured' };
    }
    
    try {
        const mailOptions = {
            from: `"BBQSTYLE" <${process.env.SMTP_USER}>`,
            to: to,
            subject: subject,
            html: html,
            text: text || html.replace(/<[^>]*>/g, ''),
            headers: {
                'Message-ID': `<${Date.now()}-${Math.random()}@bbqstyle.in>`,
                'X-Entity-Ref-ID': `order-${subject.includes('#') ? subject.split('#')[1]?.split(' ')[0] : Date.now()}`
            }
        };

        console.log('Mail options:', mailOptions);
        const info = await smtpTransporter.sendMail(mailOptions);
        console.log('Email sent successfully:', info.messageId, info.response);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Email sending failed:', {
            error: error.message,
            code: error.code,
            command: error.command,
            response: error.response
        });
        return { success: false, error: error.message };
    }
}

console.log('Node.js server starting...'); // Added for debugging

const app = express();

// Health check endpoint
app.get('/health', (req, res) => {
    console.log('Health check called at:', new Date().toISOString());
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Test endpoint for debugging
app.get('/api/test-log', (req, res) => {
    console.log('TEST LOG ENDPOINT CALLED - Server is receiving requests');
    res.json({ message: 'Server is working', timestamp: new Date().toISOString() });
});

// Simple email test endpoint (no auth for debugging)
app.post('/api/test-email', async (req, res) => {
    console.log('Test email request body:', req.body);
    
    let to = 'hardevi143@gmail.com';
    if (req.body && req.body.to) {
        to = req.body.to;
    }
    
    try {
        const result = await sendEmail(
            to,
            'Test Email - BBQSTYLE',
'<h1>Test Email</h1><p>If you receive this, SMTP is working!</p>'
        );
        
        res.json({ success: result.success, message: result.success ? 'Email sent' : result.error });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// SMTP test endpoint (admin only)
app.post('/api/admin/test-smtp', isAuthenticated, async (req, res) => {
    try {
        const testEmailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #28a745;">SMTP Test Successful!</h2>
                <p>This is a test email to verify that the Bluehost SMTP configuration is working correctly.</p>
                <div style="background: #f8f9fa; padding: 15px; margin: 20px 0; border-radius: 5px;">
                    <p><strong>Server:</strong> ${process.env.SMTP_HOST}</p>
                    <p><strong>Port:</strong> ${process.env.SMTP_PORT}</p>
                    <p><strong>From:</strong> ${process.env.SMTP_USER}</p>
                    <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
                </div>
                <p>If you received this email, your SMTP configuration is working properly!</p>
                <hr style="margin: 30px 0;">
                <p style="color: #666; font-size: 12px;">BBQSTYLE - SMTP Test Email</p>
            </div>
        `;

        const result = await sendEmail(
            process.env.ADMIN_EMAIL || process.env.SMTP_USER,
            'SMTP Test - BBQSTYLE',
            testEmailHtml
        );

        if (result.success) {
            res.json({ 
                success: true, 
                message: 'Test email sent successfully', 
                messageId: result.messageId,
                config: {
                    host: process.env.SMTP_HOST,
                    port: process.env.SMTP_PORT,
                    user: process.env.SMTP_USER
                }
            });
        } else {
            res.status(500).json({ 
                success: false, 
                error: 'Failed to send test email', 
                details: result.error 
            });
        }
    } catch (error) {
        console.error('SMTP test error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'SMTP test failed', 
            details: error.message 
        });
    }
});

// Auto-send status update emails when order status changes
async function sendStatusUpdateEmail(orderId, newStatus, oldStatus) {
    if (newStatus === oldStatus) return; // No change
    
    try {
        const orderQuery = `
            SELECT o.*, u.first_name, u.last_name, u.email 
            FROM orders o 
            JOIN users u ON o.user_id = u.user_id 
            WHERE o.order_id = ?
        `;
        
        const orderResult = await new Promise((resolve, reject) => {
            db.query(orderQuery, [orderId], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });

        if (!orderResult || !orderResult.email) return;

        const statusMessages = {
            'processing': { title: 'Order Confirmed', message: 'Your order has been confirmed and is being prepared for packing.', color: '#28a745' },
            'ready': { title: 'Order Packed', message: 'Your order has been packed and is ready for shipment.', color: '#17a2b8' },
            'shipped': { title: 'Order Shipped', message: 'Your order is on its way to you!', color: '#6f42c1' },
            'out_for_delivery': { title: 'Out for Delivery', message: 'Your order is out for delivery and will reach you soon!', color: '#ff9500' },
            'delivered': { title: 'Order Delivered', message: 'Your order has been delivered successfully!', color: '#28a745' },
            'cancelled': { title: 'Order Cancelled', message: 'Your order has been cancelled.', color: '#dc3545' },
            'out_of_stock': { title: 'Order On Hold', message: 'Some items in your order are currently out of stock. We will notify you once they are available.', color: '#ffc107' }
        };

        const statusInfo = statusMessages[newStatus];
        if (!statusInfo) return;

        let statusEmailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: ${statusInfo.color};">${statusInfo.title} - BBQSTYLE</h2>
                <p>Dear ${orderResult?.first_name || 'Customer'} ${orderResult?.last_name || ''},</p>
                <p>${statusInfo.message}</p>
                <div style="background: #f8f9fa; padding: 15px; margin: 20px 0; border-radius: 5px; border-left: 4px solid ${statusInfo.color};">
                    <h3 style="margin: 0 0 10px 0;">Order Details:</h3>
                    <p><strong>Order ID:</strong> #${orderId}</p>
                    <p><strong>Status:</strong> ${newStatus.toUpperCase().replace('_', ' ')}</p>
                    <p><strong>Total Amount:</strong> ₹${orderResult.total_amount}</p>`;
        
        if (newStatus === 'shipped' && orderResult.tracking_link) {
            statusEmailHtml += `
                    <p><strong>Carrier:</strong> ${orderResult.carrier || 'Standard Delivery'}</p>
                    <p><strong>AWB Number:</strong> ${orderResult.tracking_id || 'N/A'}</p>
                </div>
                <div style="text-align: center; margin: 20px 0;">
                    <a href="${orderResult.tracking_link}" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Track Your Order</a>
                </div>`;
        } else if (newStatus === 'delivered') {
            statusEmailHtml += `
                </div>
                <div style="text-align: center; margin: 20px 0;">
                    <a href="https://bbqstyle.in/account?tab=orders" style="background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Write a Review</a>
                </div>`;
        } else if (newStatus === 'cancelled') {
            statusEmailHtml += `
                    <p><strong>Cancelled By:</strong> ${orderResult.cancelled_by || 'System'}</p>
                    <p><strong>Reason:</strong> ${orderResult.cancel_reason || 'Not specified'}</p>
                    ${orderResult.cancel_comment ? `<p><strong>Comment:</strong> ${orderResult.cancel_comment}</p>` : ''}
                </div>`;
        } else {
            statusEmailHtml += `</div>`;
        }
        
        statusEmailHtml += `
                <p>Thank you for shopping with BBQSTYLE!</p>
                <hr style="margin: 30px 0;">
                <p style="color: #666; font-size: 12px;">BBQSTYLE - India's Premium Clothing Store</p>
            </div>
        `;

        await sendEmail(
            orderResult.email,
            `${statusInfo.title} - Order #${orderId}`,
            statusEmailHtml
        );
        
        console.log(`Status update email sent for order ${orderId}: ${newStatus}`);
    } catch (error) {
        console.error('Error sending auto status email:', error);
    }
}

// Monitor order status changes
setInterval(async () => {
    try {
        // Get orders that have status changes in last 2 minutes
        const query = `
            SELECT order_id, status, 
                   LAG(status) OVER (PARTITION BY order_id ORDER BY order_date) as prev_status
            FROM orders 
            WHERE order_date >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)
               OR status != 'pending'
        `;
        
        db.query(query, async (err, results) => {
            if (err) return;
            
            for (const order of results) {
                if (order.status !== order.prev_status && order.prev_status) {
                    await sendStatusUpdateEmail(order.order_id, order.status, order.prev_status);
                }
            }
        });
    } catch (error) {
        console.log('Status monitor error:', error.message);
    }
}, 60 * 1000); // Check every minute

// Keep Render server awake by pinging collections endpoint every 12 minutes
setInterval(async () => {
    try {
        const url = process.env.BASE_URL || 'https://bbqstyle-backend.onrender.com';
        const response = await axios.get(`${url}/api/public/collections`);
        console.log(`Keep-alive ping successful: ${response.status}`);
    } catch (error) {
        console.log('Keep-alive ping failed:', error.message);
    }
}, 12 * 60 * 1000); // 12 minutes

const port = process.env.PORT || 3000;

// MySQL Connection Pool
const db = mysql.createPool({
    connectionLimit: 10,
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true,
    ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: false
    } : false
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

// Test database connection
db.getConnection((err, connection) => {
    if (err) {
        console.error('MySQL connection error:', err);
        process.exit(1);
    }
    console.log('Connected to MySQL database');
    connection.release();
});

// Middleware
app.use(cors({
    origin: ['https://bbqstyle.in', 'https://admin.bbqstyle.in', 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Handle preflight requests
app.options('*', cors({
    origin: ['https://bbqstyle.in', 'https://admin.bbqstyle.in', 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Additional CORS middleware for admin routes
app.use('/api/*', (req, res, next) => {
    const allowedOrigins = ['https://bbqstyle.in', 'https://admin.bbqstyle.in', 'http://localhost:3000'];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
// Serve static files with CORS headers for admin subdomain
app.use('/uploads', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    if (req.get('host') && req.get('host').includes('admin.bbqstyle.in')) {
        return res.redirect(`https://bbqstyle.in${req.originalUrl}`);
    }
    next();
}, express.static(path.join(__dirname, 'public', 'uploads')));

app.use('/src', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    if (req.get('host') && req.get('host').includes('admin.bbqstyle.in')) {
        return res.redirect(`https://bbqstyle.in${req.originalUrl}`);
    }
    next();
}, express.static(path.join(__dirname, 'src')));

app.use('/src/categories', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    if (req.get('host') && req.get('host').includes('admin.bbqstyle.in')) {
        return res.redirect(`https://bbqstyle.in${req.originalUrl}`);
    }
    next();
}, express.static(path.join(__dirname, 'src', 'categories')));

app.use('/src/collections', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    if (req.get('host') && req.get('host').includes('admin.bbqstyle.in')) {
        return res.redirect(`https://bbqstyle.in${req.originalUrl}`);
    }
    next();
}, express.static(path.join(__dirname, 'src', 'collections')));

app.use('/src/slides', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    if (req.get('host') && req.get('host').includes('admin.bbqstyle.in')) {
        return res.redirect(`https://bbqstyle.in${req.originalUrl}`);
    }
    next();
}, express.static(path.join(__dirname, 'src', 'slides')));

// Serve favicon with proper headers
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'favicon.ico'), (err) => {
        if (err) {
            // If favicon doesn't exist, send a default response
            res.status(404).end();
        }
    });
});
// Block access to admin folder from main domain
app.get('/admin*', (req, res, next) => {
    if (!req.get('host') || !req.get('host').includes('admin.bbqstyle.in')) {
        return res.status(403).send('<!DOCTYPE html><html><head><title>Access Denied</title></head><body><h1>403 - Access Denied</h1><p>This page is not accessible from this domain.</p></body></html>');
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public')));



// Create visitor_sessions table if not exists
db.query(`CREATE TABLE IF NOT EXISTS visitor_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)`, (err) => {
    if (err) console.error('Error creating visitor_sessions table:', err);
});

// Visitor tracking middleware
app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/') || req.path.startsWith('/src/')) {
        return next();
    }

    const sessionId = req.cookies.session_token || req.sessionID || req.ip + '_' + Date.now();

    db.query('INSERT INTO visitor_sessions (session_id) VALUES (?) ON DUPLICATE KEY UPDATE last_activity = NOW()',
        [sessionId], (err) => {
            if (err) console.error('Visitor tracking error:', err);
        });

    next();
});

// Session setup
const Session = sequelize.define('Session', {
    sid: {
        type: Sequelize.DataTypes.STRING,
        primaryKey: true,
    },
    data: {
        type: Sequelize.DataTypes.TEXT,
    },
    expires: {
        type: Sequelize.DataTypes.DATE,
    },
});
app.use(session({
    secret: process.env.SESSION_SECRET,
    store: new SequelizeStore({
        db: sequelize,
        table: 'sessions',
    }),
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 12, // 12 hours
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
        secure: process.env.NODE_ENV === 'production', // Only secure in production
        domain: process.env.NODE_ENV === 'production' ? '.bbqstyle.in' : undefined // Allow subdomains in production
    }
}));
// Sync session store to create the sessions table if it doesn't exist
Session.sync()
    .then(() => '')
    .catch(err => console.error('Error synchronizing session table:', err));

// FTP upload function to Bluehost
async function uploadToBluehost(localPath, remotePath) {
    const client = new ftp.Client();
    try {
        await client.access({
            host: process.env.FTP_HOST,
            user: process.env.FTP_USER,
            password: process.env.FTP_PASSWORD,
            secure: false,
            port: 21,
            family: 4
        });
        client.ftp.timeout = 30000;
        await client.uploadFrom(localPath, remotePath);
        console.log('File uploaded to Bluehost:', remotePath);
    } catch (err) {
        console.error('FTP upload error:', err);
    }
    client.close();
}

// FTP delete function from Bluehost
async function deleteFromBluehost(remotePath) {
    const client = new ftp.Client();
    try {
        await client.access({
            host: process.env.FTP_HOST,
            user: process.env.FTP_USER,
            password: process.env.FTP_PASSWORD,
            secure: false,
            port: 21,
            family: 4
        });
        client.ftp.timeout = 30000;
        await client.remove(remotePath);
        console.log('File deleted from Bluehost:', remotePath);
    } catch (err) {
        console.error('FTP delete error:', err);
    }
    client.close();
}

// Ensure temp directory exists
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

// Multer setup for product images, slideshow, and favicon
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, tempDir);
    },
    filename: (req, file, cb) => {
        const filename = Date.now() + path.extname(file.originalname);
        cb(null, filename);
        
        // Upload to Bluehost after saving locally (non-blocking)
        setTimeout(async () => {
            try {
                const localPath = path.join(tempDir, filename);
                let remotePath;
                
                if (file.fieldname === 'favicon') {
                    remotePath = '/src/favicon.ico';
                } else if (file.fieldname === 'categoryImage') {
                    remotePath = `/src/categories/${filename}`;
                } else if (file.fieldname === 'collectionImage') {
                    remotePath = `/src/collections/${filename}`;
                } else if (file.fieldname === 'image' && req.route.path.includes('slideshow')) {
                    remotePath = `/src/slides/${filename}`;
                } else {
                    remotePath = `/uploads/${filename}`;
                }
                
                await uploadToBluehost(localPath, remotePath);
                
                // Delete local temp file
                fs.unlink(localPath, (err) => {
                    if (err) console.error('Error deleting temp file:', err);
                });
            } catch (error) {
                console.error('Background FTP upload failed:', error.message);
            }
        }, 1000);
    }
});
const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // limit in mb
    },
    fileFilter: (req, file, cb) => {
        if (file.fieldname === 'favicon') {
            // Allow common image formats for favicon
            const allowedMimeTypes = ['image/x-icon', 'image/vnd.microsoft.icon', 'image/png', 'image/jpeg', 'image/jpg'];
            if (allowedMimeTypes.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error('Invalid file format for favicon. Please upload .ico, .png, .jpg, or .jpeg files.'));
            }
        } else {
            // For other files, allow all image types
            if (file.mimetype.startsWith('image/')) {
                cb(null, true);
            } else {
                cb(new Error('Only image files are allowed.'));
            }
        }
    }
});

// Custom upload middleware for products that can handle multiple file types
const productUpload = multer({ storage: storage }).any();


// Authentication middleware (for admin users only)
function isAuthenticated(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.email === 'admin@bbqstyle.in' && decoded.isAdmin) {
            return next();
        } else {
            res.status(403).json({ error: 'Forbidden' });
        }
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
}

const { v4: uuidv4 } = require('uuid');

// Authentication middleware (for general users)
function authenticateToken(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
}

// User Registration Route
app.post('/api/register', (req, res) => {
    const { first_name, last_name, email, mobile, password } = req.body;

    if (!first_name || !last_name || !mobile) {
        return res.status(400).json({ success: false, message: 'First name, last name, and mobile number are required' });
    }

    // Check if user already exists (email or mobile)
    const checkQuery = email ? 'SELECT * FROM users WHERE email = ? OR mobile = ?' : 'SELECT * FROM users WHERE mobile = ?';
    const checkParams = email ? [email, mobile] : [mobile];

    db.query(checkQuery, checkParams, (err, results) => {
        if (err) {
            console.error('Database error during registration check:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        if (results.length > 0) {
            const existingUser = results[0];
            if (email && existingUser.email === email) {
                return res.status(409).json({ success: false, message: 'User with this email already exists' });
            }
            if (existingUser.mobile === mobile) {
                return res.status(409).json({ success: false, message: 'User with this mobile number already exists' });
            }
        }

        if (password) {
            // Hash password if provided
            bcrypt.hash(password, 10, (hashErr, hash) => {
                if (hashErr) {
                    console.error('Error hashing password:', hashErr);
                    return res.status(500).json({ success: false, message: 'Error registering user' });
                }

                db.query(
                    'INSERT INTO users (first_name, last_name, email, mobile, password) VALUES (?, ?, ?, ?, ?)',
                    [first_name, last_name, email || null, mobile, hash],
                    (insertErr, result) => {
                        if (insertErr) {
                            console.error('Database error during user insertion:', insertErr);
                            return res.status(500).json({ success: false, message: 'Database error' });
                        }
                        const token = jwt.sign({ userId: result.insertId, email: email || null, mobile: mobile }, JWT_SECRET, { expiresIn: '15d' });
                        res.status(201).json({ success: true, message: 'Registration successful', token, user: { first_name, last_name, email: email || null, mobile } });
                    }
                );
            });
        } else {
            // Create user without password (guest account)
            db.query(
                'INSERT INTO users (first_name, last_name, email, mobile, password) VALUES (?, ?, ?, ?, NULL)',
                [first_name, last_name, email || null, mobile],
                (insertErr, result) => {
                    if (insertErr) {
                        console.error('Database error during user insertion:', insertErr);
                        return res.status(500).json({ success: false, message: 'Database error' });
                    }
                    const token = jwt.sign({ userId: result.insertId, email: email || null, mobile: mobile }, JWT_SECRET, { expiresIn: '15d' });
                    res.status(201).json({ success: true, message: 'Registration successful', token, user: { first_name, last_name, email: email || null, mobile } });
                }
            );
        }
    });
});
// Update email only endpoint
app.post('/api/update-email', authenticateToken, async (req, res) => {
    const userId = req.userId;
    const { email, orderId } = req.body;

    if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required' });
    }

    try {
        // Check if email is already used by another user
        const existingUser = await new Promise((resolve, reject) => {
            db.query('SELECT user_id FROM users WHERE email = ? AND user_id != ?', [email, userId], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });
        
        if (existingUser) {
            return res.status(409).json({ success: false, message: 'Email is already in use by another account' });
        }

        // Update user email
        await new Promise((resolve, reject) => {
            db.query('UPDATE users SET email = ? WHERE user_id = ?', [email, userId], (err, result) => {
                if (err) reject(err);
                else if (result.affectedRows === 0) reject(new Error('User not found'));
                else resolve();
            });
        });

        // Get user details for email
        const userResult = await new Promise((resolve, reject) => {
            db.query('SELECT first_name, last_name FROM users WHERE user_id = ?', [userId], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });

        // Send professional email confirmation
        const emailUpdateHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: white; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-radius: 12px; overflow: hidden;">
                <div style="text-align: center; padding: 20px; background: #c3a4c6;">
                            <img src="https://bbqstyle.in/src/logos.png" alt="BBQSTYLE" style="max-width: 150px; height: auto;">
                </div>
                
                <div style="padding: 40px 30px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; box-shadow: 0 4px 12px rgba(40,167,69,0.3);">
                            <span style="color: white; font-size: 36px; font-weight: bold;">✓</span>
                        </div>
                        <h1 style="color: #28a745; margin: 0 0 10px 0; font-size: 28px; font-weight: 700;">Email Updated Successfully!</h1>
                        <p style="color: #6c757d; font-size: 16px; margin: 0; line-height: 1.5;">Your email address has been updated and verified</p>
                    </div>

                    <div style="background: linear-gradient(135deg, #e8f5e8 0%, #d4edda 100%); padding: 25px; margin: 25px 0; border-radius: 12px; border-left: 5px solid #28a745; box-shadow: 0 2px 8px rgba(40,167,69,0.1);">
                        <h2 style="margin: 0 0 15px 0; color: #155724; font-size: 20px; display: flex; align-items: center;">
                            <span style="background: #28a745; color: white; width: 30px; height: 30px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-right: 12px; font-size: 16px;">📧</span>
                            Email Update Confirmation
                        </h2>
                        <p style="margin: 0; color: #155724; line-height: 1.6;">
                            Hello <strong>${userResult?.first_name || 'Customer'} ${userResult?.last_name || ''}</strong>,<br><br>
                            Your email address has been successfully updated to: <strong style="color: #007bff;">${email}</strong>
                        </p>
                    </div>

                    <div style="background: linear-gradient(135deg, #e7f3ff 0%, #cce7ff 100%); padding: 20px; margin: 25px 0; border-radius: 12px; border-left: 5px solid #007bff;">
                        <h3 style="margin: 0 0 15px 0; color: #004085; font-size: 18px; display: flex; align-items: center;">
                            <span style="background: #007bff; color: white; width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-right: 10px; font-size: 14px;">ℹ️</span>
                            What This Means
                        </h3>
                        <ul style="margin: 0; padding-left: 20px; color: #004085; line-height: 1.6;">
                            <li>All future order confirmations will be sent to your new email</li>
                            <li>Account notifications and updates will use this email</li>
                            <li>You can use this email for password recovery</li>
                            <li>Newsletter and promotional emails will be sent here</li>
                        </ul>
                    </div>

                    <div style="text-align: center; margin: 35px 0;">
                        <a href="https://bbqstyle.in/account" style="background: linear-gradient(135deg, #007bff 0%, #0056b3 100%); color: white; padding: 18px 35px; text-decoration: none; border-radius: 30px; display: inline-block; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(0,123,255,0.3); transition: all 0.3s ease;">
                            👤 Manage Your Account
                        </a>
                    </div>

                    <div style="background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%); padding: 20px; margin: 25px 0; border-radius: 12px; border-left: 5px solid #ffc107; text-align: center;">
                        <p style="margin: 0; color: #856404; font-size: 14px; line-height: 1.5;">
                            <strong>🔒 Security Note:</strong> If you didn't make this change, please contact our support team immediately.
                        </p>
                    </div>

                    <div style="text-align: center; margin-top: 30px;">
                        <p style="color: #6c757d; font-size: 16px; line-height: 1.6; margin: 0;">
                            Thank you for keeping your account information up to date!<br>
                            <strong>Team BBQSTYLE</strong>
                        </p>
                    </div>
                </div>
                
                <div style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); padding: 30px 20px; text-align: center; border-top: 1px solid #dee2e6;">
                    <div style="margin-bottom: 20px;">
                        <h3 style="margin: 0 0 15px 0; color: #495057; font-size: 18px; font-weight: 600;">Need Help?</h3>
                        <p style="margin: 0 0 20px 0; color: #6c757d;">Our customer support team is here to assist you</p>
                    </div>
                    
                    <div style="display: flex; justify-content: center; gap: 30px; flex-wrap: wrap; margin-bottom: 25px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="background: #007bff; color: white; width: 35px; height: 35px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">📧</span>
                            <a href="mailto:support@bbqstyle.in" style="color: #007bff; text-decoration: none; font-weight: 600;">support@bbqstyle.in</a>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="background: #28a745; color: white; width: 35px; height: 35px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">📞</span>
                            <a href="tel:+918901551059" style="color: #28a745; text-decoration: none; font-weight: 600;">+91 8901551059</a>
                        </div>
                    </div>
                    
                    <div style="border-top: 1px solid #dee2e6; padding-top: 20px;">
                        <p style="margin: 0; color: #6c757d; font-size: 14px; font-weight: 600;">BBQSTYLE - India's Premium Clothing Store</p>
                        <p style="margin: 5px 0 0 0; color: #adb5bd; font-size: 12px;">Crafting Style, Delivering Excellence</p>
                    </div>
                </div>
            </div>
        `;

        await sendEmail(email, 'Email Address Updated Successfully - BBQSTYLE', emailUpdateHtml);

        res.json({ success: true, message: 'Email updated successfully' });
    } catch (error) {
        console.error('Error updating email:', error);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

// Update user profile endpoint
app.put('/api/update-profile', authenticateToken, (req, res) => {
    const userId = req.userId;
    const { first_name, last_name, email, mobile } = req.body;

    if (!first_name || !last_name) {
        return res.status(400).json({ success: false, message: 'First name and last name are required' });
    }

    // Check if email is already used by another user (only if email is provided)
    const checkEmailPromise = email ? 
        new Promise((resolve, reject) => {
            db.query('SELECT user_id FROM users WHERE email = ? AND user_id != ?', [email, userId], (err, results) => {
                if (err) reject(err);
                else if (results.length > 0) reject(new Error('Email is already in use by another account'));
                else resolve();
            });
        }) : Promise.resolve();
    
    checkEmailPromise.then(() => {

        // Update user profile
        db.query(
            'UPDATE users SET first_name = ?, last_name = ?, email = ?, mobile = ? WHERE user_id = ?',
            [first_name, last_name, email || null, mobile || null, userId],
            (updateErr, result) => {
                if (updateErr) {
                    console.error('Database error during profile update:', updateErr);
                    return res.status(500).json({ success: false, message: 'Database error' });
                }

                if (result.affectedRows === 0) {
                    return res.status(404).json({ success: false, message: 'User not found' });
                }

                res.json({ success: true, message: 'Profile updated successfully' });
            }
        );
    }).catch(err => {
        console.error('Database error during email check:', err);
        return res.status(500).json({ success: false, message: err.message || 'Database error' });
    });
});
// Mobile Login Route - Check if user exists
app.post('/api/mobile-login-check', (req, res) => {
    const { mobile } = req.body;

    if (!mobile) {
        return res.status(400).json({ success: false, message: 'Mobile number is required' });
    }

    db.query('SELECT user_id, first_name, last_name, email, mobile, password FROM users WHERE mobile = ?', [mobile], (err, results) => {
        if (err) {
            console.error('Database error during mobile check:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'No user exists with this mobile number' });
        }

        const user = results[0];
        const hasPassword = user.password !== null;

        res.json({
            success: true,
            hasPassword: hasPassword,
            message: hasPassword ? 'User found with password' : 'User found without password'
        });
    });
});

// Mobile Login with Password
app.post('/api/mobile-login-password', (req, res) => {
    const { mobile, password } = req.body;

    if (!mobile || !password) {
        return res.status(400).json({ success: false, message: 'Mobile number and password are required' });
    }

    db.query('SELECT * FROM users WHERE mobile = ?', [mobile], (err, results) => {
        if (err) {
            console.error('Database error during login:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        if (results.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid mobile number or password' });
        }

        const user = results[0];
        if (!user.password) {
            return res.status(401).json({ success: false, message: 'Password not set for this account' });
        }

        bcrypt.compare(password, user.password, (compareErr, isMatch) => {
            if (compareErr) {
                console.error('Error comparing passwords:', compareErr);
                return res.status(500).json({ success: false, message: 'Error logging in' });
            }
            if (!isMatch) {
                return res.status(401).json({ success: false, message: 'Invalid mobile number or password' });
            }

            const sessionToken = uuidv4();
            const sessionData = { userId: Number(user.user_id), mobile: user.mobile };

            Session.create({
                sid: sessionToken,
                data: JSON.stringify(sessionData),
                expires: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
            })
                .then(() => {
                    res.cookie('session_token', sessionToken, {
                        maxAge: 15 * 24 * 60 * 60 * 1000,
                        httpOnly: true,
                        sameSite: 'None',
                        secure: true
                    });
                    
                    req.session.user = { id: user.user_id, mobile: user.mobile, first_name: user.first_name, last_name: user.last_name };
                    req.session.loggedIn = true;
                    
                    const token = jwt.sign({ userId: user.user_id, mobile: user.mobile }, JWT_SECRET, { expiresIn: '12h' });
                    res.json({ success: true, message: 'Login successful', token });
                })
                .catch(err => {
                    console.error('Error creating session record:', err);
                    res.status(500).json({ success: false, message: 'Error logging in' });
                });
        });
    });
});

// Direct mobile login after OTP verification
app.post('/api/mobile-login-direct', async (req, res) => {
    const { mobile } = req.body;

    if (!mobile) {
        return res.status(400).json({ success: false, message: 'Mobile number is required' });
    }

    try {
        // Get user details
        const user = await new Promise((resolve, reject) => {
            db.query('SELECT * FROM users WHERE mobile = ?', [mobile], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Create session
        const sessionToken = uuidv4();
        const sessionData = { userId: Number(user.user_id), mobile: user.mobile };

        await Session.create({
            sid: sessionToken,
            data: JSON.stringify(sessionData),
            expires: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
        });

        res.cookie('session_token', sessionToken, {
            maxAge: 15 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            sameSite: 'Lax',
            secure: process.env.NODE_ENV === 'production'
        });

        const token = jwt.sign({ userId: user.user_id, mobile: user.mobile }, JWT_SECRET, { expiresIn: '15d' });
        res.json({ success: true, message: 'Login successful', token });
    } catch (error) {
        console.error('Error during direct login:', error);
        res.status(500).json({ success: false, message: 'Login failed' });
    }
});

// Mobile Login with OTP
app.post('/api/mobile-login-otp', async (req, res) => {
    const { mobile, otp } = req.body;

    if (!mobile || !otp) {
        return res.status(400).json({ success: false, message: 'Mobile and OTP are required' });
    }

    try {
        // Verify OTP
        const otpResult = await new Promise((resolve, reject) => {
            db.query('SELECT * FROM otp_verifications WHERE mobile = ? AND otp = ? AND expires_at > NOW() AND verified = FALSE ORDER BY created_at DESC LIMIT 1',
                [mobile, otp], (err, results) => {
                    if (err) reject(err);
                    else resolve(results[0]);
                });
        });

        if (!otpResult) {
            return res.json({ success: false, message: 'Invalid or expired OTP' });
        }

        // Mark OTP as verified
        await new Promise((resolve, reject) => {
            db.query('UPDATE otp_verifications SET verified = TRUE WHERE id = ?',
                [otpResult.id], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
        });

        // Get user details
        const user = await new Promise((resolve, reject) => {
            db.query('SELECT * FROM users WHERE mobile = ?', [mobile], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Create session
        const sessionToken = uuidv4();
        const sessionData = { userId: Number(user.user_id), mobile: user.mobile };

        await Session.create({
            sid: sessionToken,
            data: JSON.stringify(sessionData),
            expires: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
        });

        res.cookie('session_token', sessionToken, {
            maxAge: 15 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            sameSite: 'Lax',
            secure: process.env.NODE_ENV === 'production'
        });

        const token = jwt.sign({ userId: user.user_id, mobile: user.mobile }, JWT_SECRET, { expiresIn: '15d' });
        res.json({ success: true, message: 'Login successful', token });
    } catch (error) {
        console.error('Error during OTP login:', error);
        res.status(500).json({ success: false, message: 'Login failed' });
    }
});

// User Login Route (Email-based - kept for backward compatibility)
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) {
            console.error('Database error during login:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        if (results.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        const user = results[0];
        console.log('User ID from DB:', user.user_id); // Added log
        bcrypt.compare(password, user.password, (compareErr, isMatch) => {
            if (compareErr) {
                console.error('Error comparing passwords:', compareErr);
                return res.status(500).json({ success: false, message: 'Error logging in' });
            }
            if (!isMatch) {
                return res.status(401).json({ success: false, message: 'Invalid email or password' });
            }

            const sessionToken = uuidv4(); // Generate a unique session token
            const sessionData = { userId: Number(user.user_id), email: user.email };

            Session.create({
                sid: sessionToken,
                data: JSON.stringify(sessionData),
                expires: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) // 15 days from now
            })
                .then(() => {
                    res.cookie('session_token', sessionToken, {
                        maxAge: 15 * 24 * 60 * 60 * 1000, // 15 days
                        httpOnly: true,
                        sameSite: 'Lax',
                        secure: process.env.NODE_ENV === 'production'
                    });
                    
                    req.session.user = { id: user.user_id, email: user.email, first_name: user.first_name, last_name: user.last_name };
                    req.session.loggedIn = true;
                    
                    const token = jwt.sign({ userId: user.user_id, email: user.email }, JWT_SECRET, { expiresIn: '15d' });
                    console.log('User logged in. Session Token:', sessionToken, 'userId:', sessionData.userId);
                    res.json({ success: true, message: 'Login successful', token, user: { first_name: user.first_name, last_name: user.last_name, email: user.email } });
                })
                .catch(err => {
                    console.error('Error creating session record:', err);
                    res.status(500).json({ success: false, message: 'Error logging in' });
                });
        });
    });
});

// User Logout Route
app.post('/api/logout', async (req, res) => {
    const token = req.cookies.session_token;

    if (token) {
        try {
            await Session.destroy({ where: { sid: token } });
            res.clearCookie('session_token');
            res.json({ success: true, message: 'Logged out successfully' });
        } catch (error) {
            console.error('Error destroying session record:', error);
            res.status(500).json({ success: false, message: 'Error logging out' });
        }
    } else {
        res.json({ success: true, message: 'No active session to log out from' });
    }
});

// Check Authentication Status
app.get('/api/check-auth', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.json({ loggedIn: false });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Get user details
        db.query('SELECT first_name, last_name, email, mobile FROM users WHERE user_id = ?', [decoded.userId], (err, results) => {
            if (err) {
                console.error('Database error fetching user:', err);
                return res.json({ loggedIn: false });
            }
            if (results.length === 0) {
                return res.json({ loggedIn: false });
            }

            res.json({ loggedIn: true, userId: decoded.userId, user: results[0] });
        });
    } catch (error) {
        res.json({ loggedIn: false });
    }
});

// Get user profile
app.get('/api/user-profile', authenticateToken, (req, res) => {
    const userId = req.userId;

    db.query('SELECT first_name, last_name, email, mobile FROM users WHERE user_id = ?', [userId], (err, results) => {
        if (err) {
            console.error('Database error fetching user profile:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({ success: true, user: results[0] });
    });
});

// Invoice Template Management APIs

// Configure multer for signature image upload
const signatureStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, tempDir);
    },
    filename: (req, file, cb) => {
        // Template ID will be determined later, use temp name for now
        const tempFilename = 'temp-signature-' + Date.now() + '.png';
        cb(null, tempFilename);
    }
});

const signatureUpload = multer({ 
    storage: signatureStorage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Get all invoice templates
app.get('/api/admin/invoice-templates', isAuthenticated, (req, res) => {
    const query = 'SELECT id, company_name FROM invoice_template ORDER BY id DESC';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching invoice templates:', err);
            return res.status(500).json({ success: false, error: 'Database error' });
        }
        
        res.json({ success: true, templates: results });
    });
});

// Get specific invoice template
app.get('/api/admin/invoice-template/:id', isAuthenticated, (req, res) => {
    const templateId = req.params.id;
    const query = 'SELECT * FROM invoice_template WHERE id = ?';
    
    db.query(query, [templateId], (err, results) => {
        if (err) {
            console.error('Error fetching invoice template:', err);
            return res.status(500).json({ success: false, error: 'Database error' });
        }
        
        if (results.length > 0) {
            const template = results[0];
            if (template.signature_image) {
                template.signature_image_url = `https://bbqstyle.in/src/${template.signature_image}`;
            }
            res.json({ success: true, template: template });
        } else {
            res.json({ success: false, message: 'Template not found' });
        }
    });
});

// Save/Update invoice template
app.post('/api/admin/invoice-template/:id?', isAuthenticated, signatureUpload.single('signature_image'), async (req, res) => {
    const templateId = req.params.id;
    const {
        company_name,
        invoice_prefix,
        company_email,
        company_phone,
        company_gstin,
        company_address,
        invoice_footer,
        invoice_terms,
        invoice_theme
    } = req.body;

    try {
        let signature_image = null;
        
        if (templateId) {
            // Update existing template
            const existing = await new Promise((resolve, reject) => {
                db.query('SELECT id FROM invoice_template WHERE id = ?', [templateId], (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                });
            });
            
            if (existing.length === 0) {
                return res.status(404).json({ success: false, error: 'Template not found' });
            }
            // Handle signature image upload
            if (req.file) {
                const signatureFilename = `sign${templateId}.png`;
                const localPath = path.join(tempDir, req.file.filename);
                const remotePath = `/src/${signatureFilename}`;
                
                // Upload to Bluehost (replaces existing file)
                await uploadToBluehost(localPath, remotePath);
                
                // Delete local temp file
                fs.unlink(localPath, (err) => {
                    if (err) console.error('Error deleting temp signature file:', err);
                });
                
                signature_image = signatureFilename;
            }
            
            // Update existing template
            let updateQuery = `
                UPDATE invoice_template SET 
                company_name = ?, 
                invoice_prefix = ?, 
                company_email = ?, 
                company_phone = ?, 
                company_gstin = ?, 
                company_address = ?, 
                invoice_footer = ?, 
                invoice_terms = ?, 
                invoice_theme = ?
            `;
            let updateParams = [
                company_name, invoice_prefix, company_email, company_phone,
                company_gstin, company_address, invoice_footer, invoice_terms, invoice_theme
            ];
            
            if (signature_image) {
                updateQuery += ', signature_image = ?';
                updateParams.push(signature_image);
            }
            
            updateQuery += ' WHERE id = ?';
            updateParams.push(templateId);
            
            await new Promise((resolve, reject) => {
                db.query(updateQuery, updateParams, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            
            res.json({ success: true, message: 'Template updated successfully', templateId: templateId });
        } else {
            // Insert new template first to get ID
            const insertResult = await new Promise((resolve, reject) => {
                db.query(`
                    INSERT INTO invoice_template (
                        company_name, invoice_prefix, company_email, company_phone,
                        company_gstin, company_address, invoice_footer, invoice_terms,
                        invoice_theme
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    company_name, invoice_prefix, company_email, company_phone,
                    company_gstin, company_address, invoice_footer, invoice_terms,
                    invoice_theme
                ], (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
            
            templateId = insertResult.insertId;
            
            // Handle signature image upload
            if (req.file) {
                const signatureFilename = `sign${templateId}.png`;
                const localPath = path.join(tempDir, req.file.filename);
                const remotePath = `/src/${signatureFilename}`;
                
                // Upload to Bluehost
                await uploadToBluehost(localPath, remotePath);
                
                // Delete local temp file
                fs.unlink(localPath, (err) => {
                    if (err) console.error('Error deleting temp signature file:', err);
                });
                
                signature_image = signatureFilename;
                
                // Update template with signature filename
                await new Promise((resolve, reject) => {
                    db.query('UPDATE invoice_template SET signature_image = ? WHERE id = ?', 
                        [signature_image, templateId], (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                });
            }
            
            res.json({ success: true, message: 'Template created successfully', templateId: templateId });
        }
    } catch (error) {
        console.error('Error saving invoice template:', error);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// Get invoice data for order (public access for admin)
app.get('/api/orders/:orderId/invoice', (req, res) => {
    const orderId = req.params.orderId;

    // Get template first
    db.query('SELECT * FROM invoice_template ORDER BY id DESC LIMIT 1', (templateErr, templateResults) => {
        if (templateErr) {
            console.error('Database error fetching template:', templateErr);
            return res.status(500).json({ success: false, error: 'Template not found' });
        }
        
        if (templateResults.length === 0) {
            return res.status(404).json({ success: false, error: 'Invoice template not found' });
        }
        
        const template = templateResults[0];

        // Get order details with customer info
        const orderQuery = `
            SELECT o.*, a.full_name, a.mobile_no, a.address_line1, a.address_line2, 
                   a.city, a.state, a.pincode, u.email
            FROM orders o
            LEFT JOIN addresses a ON o.address_id = a.address_id
            LEFT JOIN users u ON o.user_id = u.user_id
            WHERE o.order_id = ?
        `;

        db.query(orderQuery, [orderId], (err, orderResults) => {
            if (err) {
                console.error('Database error fetching order:', err);
                return res.status(500).json({ success: false, message: 'Database error' });
            }
            if (orderResults.length === 0) {
                return res.status(404).json({ success: false, message: 'Order not found' });
            }

            const order = orderResults[0];

            // Get order items
            const itemsQuery = `
                SELECT oi.*, p.title, p.hsn, pi.image_path
                FROM order_items oi
                LEFT JOIN products p ON oi.product_id = p.product_id
                LEFT JOIN product_images pi ON oi.product_id = pi.product_id AND pi.variant_detail = oi.variant_detail
                WHERE oi.order_id = ?
                GROUP BY oi.order_item_id
            `;

            db.query(itemsQuery, [orderId], (itemsErr, itemsResults) => {
                if (itemsErr) {
                    console.error('Database error fetching order items:', itemsErr);
                    return res.status(500).json({ success: false, message: 'Database error' });
                }

                // Format template data with full signature URL
                const templateData = {
                    ...template,
                    signature_image: template.signature_image ? `https://bbqstyle.in/src/${template.signature_image}` : null
                };
                
                // Format response with template data
                const invoiceData = {
                    template: templateData,
                    order: {
                        order_id: order.order_id,
                        order_date: order.order_date,
                        payment_mode: order.payment_mode || 'COD',
                        subtotal: order.subtotal || order.total_amount,
                        discount: order.discount || 0,
                        total_amount: order.total_amount
                    },
                    customer: {
                        name: order.full_name || 'Customer',
                        email: order.email || 'N/A',
                        mobile: order.mobile_no || 'N/A',
                        address: {
                            line1: order.address_line1 || 'N/A',
                            line2: order.address_line2 || '',
                            city: order.city || 'N/A',
                            state: order.state || 'N/A',
                            pincode: order.pincode || 'N/A'
                        }
                    },
                    items: itemsResults.map(item => ({
                        title: item.title || 'Product',
                        hsn: item.hsn || '61091000',
                        quantity: item.quantity,
                        price: item.price,
                        total: item.quantity * item.price,
                        variant_detail: item.variant_detail
                    }))
                };

                res.json({ success: true, invoice: invoiceData });
            });
        });
    });
});

// Change password endpoint
app.put('/api/change-password', authenticateToken, (req, res) => {
    const userId = req.userId;
    const { currentPassword, newPassword } = req.body;

    if (!newPassword) {
        return res.status(400).json({ success: false, message: 'New password is required' });
    }

    // Get current password from database
    db.query('SELECT password FROM users WHERE user_id = ?', [userId], (err, results) => {
        if (err) {
            console.error('Database error fetching user password:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const user = results[0];

        // If user has no password (null), skip current password verification
        if (user.password === null) {
            // Hash new password directly
            bcrypt.hash(newPassword, 10, (hashErr, hashedPassword) => {
                if (hashErr) {
                    console.error('Error hashing new password:', hashErr);
                    return res.status(500).json({ success: false, message: 'Error updating password' });
                }

                // Update password in database
                db.query('UPDATE users SET password = ? WHERE user_id = ?', [hashedPassword, userId], (updateErr) => {
                    if (updateErr) {
                        console.error('Database error updating password:', updateErr);
                        return res.status(500).json({ success: false, message: 'Database error' });
                    }

                    res.json({ success: true, message: 'Password set successfully' });
                });
            });
        } else {
            // User has existing password, verify current password
            if (!currentPassword) {
                return res.status(400).json({ success: false, message: 'Current password is required' });
            }

            bcrypt.compare(currentPassword, user.password, (compareErr, isMatch) => {
                if (compareErr) {
                    console.error('Error comparing passwords:', compareErr);
                    return res.status(500).json({ success: false, message: 'Error verifying password' });
                }

                if (!isMatch) {
                    return res.status(401).json({ success: false, message: 'Current password is incorrect' });
                }

                // Hash new password
                bcrypt.hash(newPassword, 10, (hashErr, hashedPassword) => {
                    if (hashErr) {
                        console.error('Error hashing new password:', hashErr);
                        return res.status(500).json({ success: false, message: 'Error updating password' });
                    }

                    // Update password in database
                    db.query('UPDATE users SET password = ? WHERE user_id = ?', [hashedPassword, userId], (updateErr) => {
                        if (updateErr) {
                            console.error('Database error updating password:', updateErr);
                            return res.status(500).json({ success: false, message: 'Database error' });
                        }

                        res.json({ success: true, message: 'Password changed successfully' });
                    });
                });
            });
        }
    });
});

// Track order endpoint
app.post('/api/track-order', (req, res) => {
    const { trackingInput } = req.body;

    if (!trackingInput) {
        return res.status(400).json({ success: false, message: 'Tracking input is required' });
    }

    // Search by order_id or tracking_id
    const query = 'SELECT tracking_link FROM orders WHERE order_id = ? OR tracking_id = ?';

    db.query(query, [trackingInput, trackingInput], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        if (results.length === 0 || !results[0].tracking_link) {
            return res.json({ success: false, message: 'Order not found or tracking not available' });
        }

        res.json({ success: true, trackingLink: results[0].tracking_link });
    });
});

// Cashfree configuration
const axios = require('axios');
const CASHFREE_CLIENT_ID = process.env.CASHFREE_CLIENT_ID;
const CASHFREE_CLIENT_SECRET = process.env.CASHFREE_CLIENT_SECRET;
const CASHFREE_BASE_URL = process.env.NODE_ENV === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';

// Apply promo code endpoint
app.post('/api/apply-promo', authenticateToken, async (req, res) => {
    const { promoCode } = req.body;
    const userId = req.userId;

    if (!promoCode) {
        return res.status(400).json({ success: false, message: 'Promo code is required' });
    }

    try {
        // Check if offer exists and is enabled
        const offerQuery = 'SELECT * FROM offers WHERE code = ? AND is_enabled = 1';
        const offer = await new Promise((resolve, reject) => {
            db.query(offerQuery, [promoCode], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });

        if (!offer) {
            return res.json({ success: false, message: 'Invalid promo code' });
        }

        // Check if offer limit is reached
        if (offer.used >= offer.offer_limit) {
            return res.json({ success: false, message: 'Promo code usage limit reached' });
        }

        // Check if user has already used this offer
        const usageQuery = 'SELECT * FROM offer_usage WHERE offer_id = ? AND user_id = ?';
        const existingUsage = await new Promise((resolve, reject) => {
            db.query(usageQuery, [offer.offer_id, userId], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });

        if (existingUsage) {
            return res.json({ success: false, message: 'You have already used this promo code' });
        }

        // Get cart total for discount calculation
        const cartQuery = `
            SELECT SUM(p.price * c.quantity) as subtotal 
            FROM cart c 
            JOIN products p ON c.product_id = p.product_id 
            WHERE c.user_id = ?
        `;

        const cartTotal = await new Promise((resolve, reject) => {
            db.query(cartQuery, [userId], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]?.subtotal || 0);
            });
        });

        // Calculate discount amount
        let discountAmount = 0;
        if (offer.discount_type === 'percentage') {
            discountAmount = (cartTotal * offer.discount_value) / 100;
        } else {
            discountAmount = Math.min(offer.discount_value, cartTotal);
        }

        res.json({
            success: true,
            discountAmount: discountAmount,
            offerCode: promoCode,
            message: `Discount of ₹${discountAmount.toFixed(2)} applied successfully`
        });

    } catch (error) {
        console.error('Error applying promo code:', error);
        res.status(500).json({ success: false, message: 'Failed to apply promo code' });
    }
});

// Verify OTP without user check (for registration)
app.post('/api/verify-otp', async (req, res) => {
    const { mobile, otp } = req.body;

    if (!mobile || !otp) {
        return res.status(400).json({ success: false, message: 'Mobile and OTP are required' });
    }

    try {
        const result = await new Promise((resolve, reject) => {
            db.query('SELECT * FROM otp_verifications WHERE mobile = ? AND otp = ? AND expires_at > NOW() AND verified = FALSE ORDER BY created_at DESC LIMIT 1',
                [mobile, otp], (err, results) => {
                    if (err) reject(err);
                    else resolve(results[0]);
                });
        });

        if (!result) {
            return res.json({ success: false, message: 'Invalid or expired OTP' });
        }

        // Mark as verified
        await new Promise((resolve, reject) => {
            db.query('UPDATE otp_verifications SET verified = TRUE WHERE id = ?',
                [result.id], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
        });

        res.json({ success: true, message: 'OTP verified successfully' });
    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(500).json({ success: false, message: 'Failed to verify OTP' });
    }
});

// Send OTP for guest verification
app.post('/api/send-otp', async (req, res) => {
    const { mobile } = req.body;

    if (!mobile) {
        return res.status(400).json({ success: false, message: 'Mobile number is required' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes from now
    
    console.log('OTP Generation Debug:');
    console.log('Current time:', now.toISOString());
    console.log('Expires at:', expiresAt.toISOString());
    console.log('OTP:', otp);

    try {
        // Store OTP in database
        await new Promise((resolve, reject) => {
            db.query('INSERT INTO otp_verifications (mobile, otp, expires_at, created_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE), NOW())',
                [mobile, otp], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
        });

        // Send SMS using MSG91
        if (process.env.MSG91_AUTH_KEY) {
            try {
                const axios = require('axios');
                await axios.post('https://api.msg91.com/api/v5/otp', {
                    authkey: process.env.MSG91_AUTH_KEY,
                    template_id: process.env.MSG91_TEMPLATE_ID,
                    mobile: `91${mobile}`,
                    otp: otp
                });
                console.log(`OTP sent to ${mobile} via MSG91`);
            } catch (smsError) {
                console.error('SMS sending failed:', smsError);
                // Continue anyway - OTP is stored in DB
            }
        } else {
            console.log(`OTP for ${mobile}: ${otp}`);
        }

        res.json({ success: true, message: 'OTP sent successfully' });
    } catch (error) {
        console.error('Error sending OTP:', error);
        res.status(500).json({ success: false, message: 'Failed to send OTP' });
    }
});

// Create guest account after OTP verification
app.post('/api/create-guest-account', async (req, res) => {
    const { firstName, lastName, mobile, email } = req.body;

    if (!firstName || !mobile) {
        return res.status(400).json({ success: false, message: 'First name and mobile are required' });
    }

    try {
        // Check if user already exists
        const existingUser = await new Promise((resolve, reject) => {
            db.query('SELECT user_id FROM users WHERE mobile = ?', [mobile], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });

        let userId;

        if (existingUser) {
            userId = existingUser.user_id;
        } else {
            // Create new user without password
            const userResult = await new Promise((resolve, reject) => {
                db.query('INSERT INTO users (first_name, last_name, mobile, email, password) VALUES (?, ?, ?, ?, NULL)',
                    [firstName, lastName, mobile, email || null], (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    });
            });
            userId = userResult.insertId;
        }

        // Create session for the user
        const sessionToken = require('uuid').v4();
        const sessionData = { userId: userId, mobile: mobile };

        await Session.create({
            sid: sessionToken,
            data: JSON.stringify(sessionData),
            expires: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) // 15 days
        });

        res.cookie('session_token', sessionToken, {
            maxAge: 15 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            sameSite: 'Lax',
            secure: process.env.NODE_ENV === 'production'
        });

        res.json({ success: true, message: 'Account created and logged in', userId });
    } catch (error) {
        console.error('Error creating guest account:', error);
        res.status(500).json({ success: false, message: 'Failed to create account' });
    }
});

// Get single address details
app.get('/api/addresses/:id', (req, res) => {
    const addressId = req.params.id;

    const query = 'SELECT * FROM addresses WHERE address_id = ?';
    db.query(query, [addressId], (err, results) => {
        if (err) {
            console.error('Error fetching address:', err);
            return res.status(500).json({ success: false, message: 'Failed to fetch address' });
        }

        if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'Address not found' });
        }

        res.json({ success: true, address: results[0] });
    });
});



// Create payment session
app.post('/api/create-payment-session', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { addressId, totalAmount, items } = req.body;

        const userQuery = 'SELECT first_name, last_name, email, mobile FROM users WHERE user_id = ?';
        const userResult = await new Promise((resolve, reject) => {
            db.query(userQuery, [userId], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });

        const tempOrderQuery = 'INSERT INTO temp_orders (user_id, address_id, total_amount, items_data) VALUES (?, ?, ?, ?)';
        const itemsDataString = JSON.stringify({ ...req.body, items });

        const tempOrderResult = await new Promise((resolve, reject) => {
            db.query(tempOrderQuery, [userId, addressId, totalAmount, itemsDataString], (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        const dbOrderId = tempOrderResult.insertId;

        const request = {
            order_amount: totalAmount,
            order_currency: 'INR',
            order_id: dbOrderId.toString(),
            customer_details: {
                customer_id: userId.toString(),
                customer_name: `${userResult.first_name} ${userResult.last_name}`,
                customer_email: userResult.email,
                customer_phone: userResult.mobile
            },
            order_meta: {
                return_url: `${process.env.BASE_URL}/payment-success?order_id=${dbOrderId}`,
                notify_url: `${process.env.BASE_URL}/api/payment-webhook`
            }
        };

        const response = await axios.post(`${CASHFREE_BASE_URL}/orders`, request, {
            headers: {
                'x-client-id': CASHFREE_CLIENT_ID,
                'x-client-secret': CASHFREE_CLIENT_SECRET,
                'x-api-version': '2022-09-01',
                'Content-Type': 'application/json'
            }
        });

        await new Promise((resolve, reject) => {
            db.query('UPDATE temp_orders SET payment_session_id = ? WHERE id = ?',
                [response.data.payment_session_id, dbOrderId], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
        });

        res.json({
            success: true,
            paymentSessionId: response.data.payment_session_id,
            orderId: dbOrderId
        });

    } catch (error) {
        console.error('Payment session error:', error);
        res.status(500).json({
            success: false,
            message: 'Payment service unavailable',
            error: error.response?.data || error.message
        });
    }
});

// Payment webhook
app.post('/api/payment-webhook', async (req, res) => {
    try {
        const { order_id, order_status } = req.body;

        if (order_status === 'PAID') {
            const tempOrder = await new Promise((resolve, reject) => {
                db.query('SELECT * FROM temp_orders WHERE id = ?', [order_id], (err, results) => {
                    if (err) reject(err);
                    else resolve(results[0]);
                });
            });

            if (tempOrder) {
                const tempOrderData = JSON.parse(tempOrder.items_data);
                const orderResult = await new Promise((resolve, reject) => {
                    const offerCode = tempOrderData.offerCode || null;
                    const subtotal = tempOrderData.subtotal || tempOrder.total_amount;
                    const discount = tempOrderData.discount || 0;
                    db.query('INSERT INTO orders (user_id, address_id, subtotal, discount, total_amount, status, payment_mode, offer_code) VALUES (?, ?, ?, ?, ?, "pending", "Online", ?)',
                        [tempOrder.user_id, tempOrder.address_id, subtotal, discount, tempOrder.total_amount, offerCode], (err, result) => {
                            if (err) reject(err);
                            else resolve(result);
                        });
                });

                const actualOrderId = orderResult.insertId;

                for (const item of tempOrderData.items) {
                    await new Promise((resolve, reject) => {
                        db.query('INSERT INTO order_items (order_id, product_id, variant_type, variant_detail, quantity, price) VALUES (?, ?, ?, ?, ?, ?)',
                            [actualOrderId, item.productId, item.variantType, item.variantDetail, item.quantity, item.price], (err) => {
                                if (err) reject(err);
                                else resolve();
                            });
                    });

                    // Update stock
                    let stockQuery = 'UPDATE product_images SET stock = stock - ? WHERE product_id = ?';
                    let stockParams = [item.quantity, item.productId];

                    if (item.variantDetail) {
                        stockQuery += ' AND variant_detail = ?';
                        stockParams.push(item.variantDetail);
                    } else {
                        stockQuery += ' AND variant_detail IS NULL';
                    }

                    await new Promise((resolve, reject) => {
                        db.query(stockQuery, stockParams, (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                }

                if (tempOrderData.offerCode) {
                    const offer = await new Promise((resolve, reject) => {
                        db.query('SELECT offer_id FROM offers WHERE code = ?', [tempOrderData.offerCode], (err, results) => {
                            if (err) reject(err);
                            else resolve(results[0]);
                        });
                    });

                    if (offer) {
                        await new Promise((resolve, reject) => {
                            db.query('INSERT INTO offer_usage (offer_id, user_id) VALUES (?, ?)',
                                [offer.offer_id, tempOrder.user_id], (err) => {
                                    if (err) reject(err);
                                    else resolve();
                                });
                        });

                        await new Promise((resolve, reject) => {
                            db.query('UPDATE offers SET used = used + 1 WHERE offer_id = ?',
                                [offer.offer_id], (err) => {
                                    if (err) reject(err);
                                    else resolve();
                                });
                        });
                    }
                }

                await new Promise((resolve, reject) => {
                    db.query('DELETE FROM cart WHERE user_id = ?', [tempOrder.user_id], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });

                await new Promise((resolve, reject) => {
                    db.query('DELETE FROM temp_orders WHERE id = ?', [order_id], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            }
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).send('Error');
    }
});

// Update offer usage endpoint
app.post('/api/update-offer-usage', authenticateToken, async (req, res) => {
    try {
        const { offerCode } = req.body;
        const userId = req.userId;

        if (!offerCode) {
            return res.json({ success: true }); // No offer code to update
        }

        // Get offer details
        const offerQuery = 'SELECT offer_id FROM offers WHERE code = ?';
        const offer = await new Promise((resolve, reject) => {
            db.query(offerQuery, [offerCode], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });

        if (offer) {
            // Insert into offer_usage
            await new Promise((resolve, reject) => {
                db.query('INSERT INTO offer_usage (offer_id, user_id) VALUES (?, ?)',
                    [offer.offer_id, userId], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
            });

            // Update offer used count
            await new Promise((resolve, reject) => {
                db.query('UPDATE offers SET used = used + 1 WHERE offer_id = ?',
                    [offer.offer_id], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
            });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating offer usage:', error);
        res.status(500).json({ success: false, message: 'Failed to update offer usage' });
    }
});

// Create order endpoint
app.post('/api/orders', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { addressId, paymentMode, subtotal, discount, totalAmount, items, offerCode } = req.body;

        // Create order
        // Calculate total weight
        let totalWeight = 0;
        for (const item of items) {
            const productWeight = await new Promise((resolve, reject) => {
                db.query('SELECT weight FROM products WHERE product_id = ?', [item.productId], (err, results) => {
                    if (err) reject(err);
                    else resolve(results[0]?.weight || 0);
                });
            });
            totalWeight += (productWeight * item.quantity);
        }

        const orderQuery = `
            INSERT INTO orders (user_id, address_id, subtotal, discount, total_amount, weight, status, payment_mode, offer_code)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
        `;

        const orderResult = await new Promise((resolve, reject) => {
            db.query(orderQuery, [userId, addressId, subtotal, discount || 0, totalAmount, totalWeight, paymentMode, offerCode], (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        const orderId = orderResult.insertId;

        // Insert order items and update stock
        for (const item of items) {
            const itemQuery = `
                INSERT INTO order_items (order_id, product_id, variant_type, variant_detail, quantity, price)
                VALUES (?, ?, ?, ?, ?, ?)
            `;

            await new Promise((resolve, reject) => {
                db.query(itemQuery, [
                    orderId,
                    item.productId,
                    item.variantType,
                    item.variantDetail,
                    item.quantity,
                    item.price
                ], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Update stock
            let stockQuery = 'UPDATE product_images SET stock = stock - ? WHERE product_id = ?';
            let stockParams = [item.quantity, item.productId];

            if (item.variantDetail) {
                stockQuery += ' AND variant_detail = ?';
                stockParams.push(item.variantDetail);
            } else {
                stockQuery += ' AND variant_detail IS NULL';
            }

            await new Promise((resolve, reject) => {
                db.query(stockQuery, stockParams, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }

        // Send order confirmation email to customer
        try {
            const userQuery = 'SELECT first_name, last_name, email FROM users WHERE user_id = ?';
            const userResult = await new Promise((resolve, reject) => {
                db.query(userQuery, [userId], (err, results) => {
                    if (err) reject(err);
                    else resolve(results[0]);
                });
            });

            if (userResult && userResult.email) {
                // Get order items and address for customer email
                const customerOrderItems = await new Promise((resolve, reject) => {
                    const itemsQuery = `
                        SELECT oi.*, p.title, pi.image_path
                        FROM order_items oi
                        JOIN products p ON oi.product_id = p.product_id
                        LEFT JOIN product_images pi ON p.product_id = pi.product_id AND 
                            (pi.variant_detail = oi.variant_detail OR (pi.variant_detail IS NULL AND oi.variant_detail IS NULL))
                        WHERE oi.order_id = ?
                        GROUP BY oi.order_item_id
                    `;
                    db.query(itemsQuery, [orderId], (err, results) => {
                        if (err) reject(err);
                        else resolve(results);
                    });
                });

                const orderAddress = await new Promise((resolve, reject) => {
                    db.query('SELECT * FROM addresses WHERE address_id = ?', [addressId], (err, results) => {
                        if (err) reject(err);
                        else resolve(results[0]);
                    });
                });

                const customerItemsHtml = customerOrderItems.map(item => `
                    <tr>
                        <td style="padding: 10px; border: 1px solid #ddd;">
                            ${item.image_path ? `<img src="https://bbqstyle.in/uploads/${item.image_path}" style="width: 60px; height: 60px; object-fit: cover;">` : ''}
                        </td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${item.title}</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${item.variant_detail || 'Standard'}</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${item.quantity}</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">₹${item.price}</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">₹${item.price * item.quantity}</td>
                    </tr>
                `).join('');

                const orderEmailHtml = `
                    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; background: white;">
                        <div style="text-align: center; padding: 20px; background: #c3a4c6;">
                            <img src="https://bbqstyle.in/src/logos.png" alt="BBQSTYLE" style="max-width: 150px; height: auto;">
                        </div>
                        <div style="padding: 30px;">
                            <h2 style="color: #28a745; margin-bottom: 20px;">Order Received! 😊</h2>
                            <p>Dear ${userResult?.first_name || 'Customer'} ${userResult?.last_name || ''},</p>
                            <p>Thank you for your order! We have successfully received your order and it will be processed shortly. You'll receive a confirmation email once we begin processing.</p>
                            
                            <div style="background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #28a745;">
                                <h3 style="margin: 0 0 15px 0; color: #155724;">Order Summary:</h3>
                                <p><strong>Order ID:</strong> #${orderId}</p>
                                <p><strong>Order Date:</strong> ${new Date().toLocaleString()}</p>
                                <p><strong>Payment Mode:</strong> ${paymentMode}</p>
                                <p><strong>Subtotal:</strong> ₹${subtotal}</p>
                                ${discount > 0 ? `<p><strong>Discount:</strong> -₹${discount}</p>` : ''}
                                <p><strong>Total Amount:</strong> ₹${totalAmount}</p>
                            </div>

                        <h3>Order Items:</h3>
                        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                            <thead>
                                <tr style="background: #f8f9fa;">
                                    <th style="padding: 10px; border: 1px solid #ddd;">Image</th>
                                    <th style="padding: 10px; border: 1px solid #ddd;">Product</th>
                                    <th style="padding: 10px; border: 1px solid #ddd;">Variant</th>
                                    <th style="padding: 10px; border: 1px solid #ddd;">Qty</th>
                                    <th style="padding: 10px; border: 1px solid #ddd;">Price</th>
                                    <th style="padding: 10px; border: 1px solid #ddd;">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${customerItemsHtml}
                            </tbody>
                        </table>

                        ${orderAddress ? `
                        <div style="background: #f8f9fa; padding: 15px; margin: 20px 0; border-radius: 5px;">
                            <h3 style="margin: 0 0 10px 0;">Delivery Address:</h3>
                            <p><strong>${orderAddress.full_name}</strong></p>
                            <p>${orderAddress.address_line1}</p>
                            ${orderAddress.address_line2 ? `<p>${orderAddress.address_line2}</p>` : ''}
                            <p>${orderAddress.city}, ${orderAddress.state} - ${orderAddress.pincode}</p>
                            <p>Phone: ${orderAddress.mobile_no}</p>
                        </div>
                        ` : ''}

                            <div style="text-align: center; margin: 30px 0;">
                                <a href="https://bbqstyle.in/account?tab=orders" style="background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: 600;">📋 Download Invoice & Track Order</a>
                            </div>

                            <p>We will process your order and send you tracking details once it's shipped. Thank you for choosing BBQSTYLE!</p>
                        </div>
                        <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
                            <p style="margin: 0 0 10px 0; font-weight: 600;">Need Help?</p>
                            <p style="margin: 5px 0;">📧 <a href="mailto:support@bbqstyle.in" style="color: #007bff;">support@bbqstyle.in</a></p>
                            <p style="margin: 5px 0;">📞 <a href="tel:+918901551059" style="color: #007bff;">+91 8901551059</a></p>
                            <p style="margin: 15px 0 0 0; color: #666; font-size: 12px;">BBQSTYLE - India's Premium Clothing Store</p>
                        </div>
                    </div>
                `;

                await sendEmail(
                    userResult.email,
                    `Order Received - #${orderId}`,
                    orderEmailHtml
                );
            }
        } catch (emailError) {
            console.error('Error sending order confirmation email:', emailError);
        }

        // Get user details for admin notification
        const userResult = await new Promise((resolve, reject) => {
            db.query('SELECT first_name, last_name, email FROM users WHERE user_id = ?', [userId], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });

        // Get order items for admin email
        const orderItems = await new Promise((resolve, reject) => {
            const itemsQuery = `
                SELECT oi.*, p.title, pi.image_path
                FROM order_items oi
                JOIN products p ON oi.product_id = p.product_id
                LEFT JOIN product_images pi ON p.product_id = pi.product_id AND 
                    (pi.variant_detail = oi.variant_detail OR (pi.variant_detail IS NULL AND oi.variant_detail IS NULL))
                WHERE oi.order_id = ?
                GROUP BY oi.order_item_id
            `;
            db.query(itemsQuery, [orderId], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        // Send order received notification to admin
        try {
            const itemsHtml = orderItems.map(item => `
                <tr>
                    <td style="padding: 10px; border: 1px solid #ddd;">
                        ${item.image_path ? `<img src="https://bbqstyle.in/uploads/${item.image_path}" style="width: 50px; height: 50px; object-fit: cover;">` : ''}
                    </td>
                    <td style="padding: 10px; border: 1px solid #ddd;">${item.title}</td>
                    <td style="padding: 10px; border: 1px solid #ddd;">${item.variant_detail || 'Standard'}</td>
                    <td style="padding: 10px; border: 1px solid #ddd;">${item.quantity}</td>
                    <td style="padding: 10px; border: 1px solid #ddd;">₹${item.price}</td>
                    <td style="padding: 10px; border: 1px solid #ddd;">₹${item.price * item.quantity}</td>
                </tr>
            `).join('');

            const adminEmailHtml = `
                <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; background: white;">
                    <div style="text-align: center; padding: 20px; background: #c3a4c6;">
                        <img src="https://bbqstyle.in/src/logos.png" alt="BBQSTYLE" style="max-width: 150px; height: auto;">
                    </div>
                    <div style="padding: 30px;">
                        <h2 style="color: #007bff; margin-bottom: 20px;">🎉 New Order Received!</h2>
                        <p style="color: #495057; font-size: 16px; margin-bottom: 25px;">A new order has been placed and requires your attention.</p>
                        <div style="background: #e7f3ff; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #007bff;">
                            <h3 style="margin: 0 0 15px 0; color: #004085;">📋 Order Summary</h3>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                                <p><strong>Order ID:</strong> #${orderId}</p>
                                <p><strong>Total Amount:</strong> ₹${totalAmount}</p>
                                <p><strong>Payment Mode:</strong> ${paymentMode}</p>
                                <p><strong>Order Date:</strong> ${new Date().toLocaleString()}</p>
                            </div>
                        </div>

                        <div style="background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #28a745;">
                            <h3 style="margin: 0 0 15px 0; color: #155724;">👤 Customer Information</h3>
                            <p><strong>Name:</strong> ${userResult?.first_name || 'N/A'} ${userResult?.last_name || ''}</p>
                            <p><strong>Email:</strong> ${userResult?.email || 'N/A'}</p>
                        </div>

                        <div style="background: #fff3cd; padding: 15px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #ffc107;">
                            <h3 style="margin: 0 0 10px 0; color: #856404;">📦 Order Items</h3>
                        </div>
                        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                            <thead>
                                <tr style="background: #007bff; color: white;">
                                    <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Image</th>
                                    <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Product</th>
                                    <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Variant</th>
                                    <th style="padding: 12px; border: 1px solid #ddd; text-align: center;">Qty</th>
                                    <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">Price</th>
                                    <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsHtml}
                            </tbody>
                        </table>

                        <div style="text-align: center; margin: 30px 0;">
                            <a href="https://admin.bbqstyle.in" style="background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: 600; box-shadow: 0 2px 4px rgba(0,123,255,0.3);">🔧 Process Order in Admin Panel</a>
                        </div>
                        
                        <div style="background: #d1ecf1; padding: 15px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #17a2b8;">
                            <p style="margin: 0; color: #0c5460;"><strong>⚡ Action Required:</strong> Please review and process this order promptly to ensure customer satisfaction.</p>
                        </div>
                    </div>
                    
                    <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
                        <p style="margin: 0 0 10px 0; font-weight: 600; color: #495057;">BBQSTYLE Admin Panel</p>
                        <p style="margin: 5px 0; color: #6c757d;">📧 <a href="mailto:support@bbqstyle.in" style="color: #007bff;">support@bbqstyle.in</a></p>
                        <p style="margin: 5px 0; color: #6c757d;">📞 <a href="tel:+918901551059" style="color: #007bff;">+91 8901551059</a></p>
                        <p style="margin: 15px 0 0 0; color: #6c757d; font-size: 12px;">BBQSTYLE - India's Premium Clothing Store</p>
                    </div>
                </div>
            `;

            await sendEmail(
                'hardevi143@gmail.com',
                `New Order Received - #${orderId}`,
                adminEmailHtml
            );
            console.log('Admin order notification email sent');
        } catch (emailError) {
            console.error('Error sending admin notification email:', emailError);
        }

        res.json({ success: true, orderId: orderId });

    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ success: false, message: 'Failed to create order' });
    }
});

// Update address endpoint
app.put('/api/addresses/:id', authenticateToken, (req, res) => {
    const userId = req.userId;
    const addressId = req.params.id;
    const { fullName, mobileNo, addressLine1, addressLine2, city, district, state, pincode, isDefault } = req.body;

    if (!fullName || !mobileNo || !addressLine1 || !city || !state || !pincode) {
        return res.status(400).json({ success: false, message: 'Required fields missing' });
    }

    // If this is default address, unset other default addresses
    const updateAddress = () => {
        db.query(
            'UPDATE addresses SET full_name = ?, mobile_no = ?, address_line1 = ?, address_line2 = ?, city = ?, district = ?, state = ?, pincode = ?, is_default = ? WHERE address_id = ? AND user_id = ?',
            [fullName, mobileNo, addressLine1, addressLine2 || null, city, district, state, pincode, isDefault || false, addressId, userId],
            (err, result) => {
                if (err) {
                    console.error('Database error updating address:', err);
                    return res.status(500).json({ success: false, message: 'Database error' });
                }

                if (result.affectedRows === 0) {
                    return res.status(404).json({ success: false, message: 'Address not found' });
                }

                res.json({ success: true, message: 'Address updated successfully' });
            }
        );
    };

    if (isDefault) {
        db.query('UPDATE addresses SET is_default = FALSE WHERE user_id = ?', [userId], (err) => {
            if (err) {
                console.error('Error updating default addresses:', err);
                return res.status(500).json({ success: false, message: 'Database error' });
            }
            updateAddress();
        });
    } else {
        updateAddress();
    }
});

// Admin Login Route (retained for admin specific login)
app.post('/admin/login', (req, res) => {
    const { email, password } = req.body;
    if (email === 'admin@bbqstyle.in' && password === 'adminhere') {
        const token = jwt.sign({ email, isAdmin: true }, JWT_SECRET, { expiresIn: '12h' });
        res.json({ message: 'Admin login successful', token });
    } else {
        res.status(401).json({ error: 'Invalid admin credentials' });
    }
});

// Admin Logout Route (retained for admin specific logout)
app.post('/admin/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Admin logged out' });
});

// Admin Session Status Route (retained for admin specific session check)
app.get('/api/session', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.email === 'admin@bbqstyle.in' && decoded.isAdmin) {
            res.json({ email: decoded.email });
        } else {
            res.status(401).json({ error: 'Unauthorized' });
        }
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

// Admin endpoint to send custom emails
app.post('/api/admin/send-email', isAuthenticated, async (req, res) => {
    const { to, subject, message, type = 'custom' } = req.body;
    
    if (!to || !subject || !message) {
        return res.status(400).json({ error: 'To, subject, and message are required' });
    }

    try {
        let emailHtml;
        
        if (type === 'newsletter') {
            emailHtml = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: white;">
                    <div style="text-align: center; padding: 20px; background: #c3a4c6;">
                        <img src="https://bbqstyle.in/src/logos.png" alt="BBQSTYLE" style="max-width: 150px; height: auto;">
                    </div>
                    <div style="padding: 30px;">
                        <h2 style="color: #007bff; margin-bottom: 20px;">📧 BBQSTYLE Newsletter</h2>
                        <div style="background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #007bff;">
                            ${message.replace(/\n/g, '<br>')}
                        </div>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="https://bbqstyle.in" style="background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: 600;">🛒 Shop Now</a>
                        </div>
                    </div>
                    <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
                        <p style="margin: 0 0 10px 0; font-weight: 600;">Stay Connected</p>
                        <p style="margin: 5px 0;">📧 <a href="mailto:support@bbqstyle.in" style="color: #007bff;">support@bbqstyle.in</a></p>
                        <p style="margin: 5px 0;">📞 <a href="tel:+918901551059" style="color: #007bff;">+91 8901551059</a></p>
                        <p style="margin: 15px 0 0 0; color: #666; font-size: 12px;">BBQSTYLE - India's Premium Clothing Store</p>
                    </div>
                </div>
            `;
        } else {
            emailHtml = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">${subject}</h2>
                    <div style="background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 5px;">
                        ${message.replace(/\n/g, '<br>')}
                    </div>
                    <hr style="margin: 30px 0;">
                    <p style="color: #666; font-size: 12px;">BBQSTYLE - India's Premium Clothing Store</p>
                </div>
            `;
        }

        const result = await sendEmail(to, subject, emailHtml);
        
        if (result.success) {
            res.json({ success: true, message: 'Email sent successfully', messageId: result.messageId });
        } else {
            res.status(500).json({ error: 'Failed to send email', details: result.error });
        }
    } catch (error) {
        console.error('Error in admin send email:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

// Admin endpoint to send bulk emails to subscribers
app.post('/api/admin/send-newsletter', isAuthenticated, async (req, res) => {
    const { subject, message } = req.body;
    
    if (!subject || !message) {
        return res.status(400).json({ error: 'Subject and message are required' });
    }

    try {
        // Get all subscribers
        const subscribers = await new Promise((resolve, reject) => {
            db.query('SELECT customer_name, email_id FROM subscribers', (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        if (subscribers.length === 0) {
            return res.json({ success: true, message: 'No subscribers found', sent: 0 });
        }

        const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: white;">
                <div style="text-align: center; padding: 20px; background: #c3a4c6;">
                    <img src="https://bbqstyle.in/src/logos.png" alt="BBQSTYLE" style="max-width: 150px; height: auto;">
                </div>
                <div style="padding: 30px;">
                    <h2 style="color: #007bff; margin-bottom: 20px;">📧 BBQSTYLE Newsletter</h2>
                    <div style="background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #007bff;">
                        ${message.replace(/\n/g, '<br>')}
                    </div>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="https://bbqstyle.in" style="background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: 600;">🛒 Shop Now</a>
                    </div>
                </div>
                <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
                    <p style="margin: 0 0 10px 0; font-weight: 600;">Stay Connected</p>
                    <p style="margin: 5px 0;">📧 <a href="mailto:support@bbqstyle.in" style="color: #007bff;">support@bbqstyle.in</a></p>
                    <p style="margin: 5px 0;">📞 <a href="tel:+918901551059" style="color: #007bff;">+91 8901551059</a></p>
                    <p style="margin: 15px 0 0 0; color: #666; font-size: 12px;">BBQSTYLE - India's Premium Clothing Store</p>
                    <p style="margin: 10px 0 0 0; font-size: 10px; color: #999;">
                        <a href="#" style="color: #999;">Unsubscribe</a>
                    </p>
                </div>
            </div>
        `;

        let successCount = 0;
        let failCount = 0;

        // Send emails with delay to avoid rate limiting
        for (const subscriber of subscribers) {
            try {
                await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
                const result = await sendEmail(subscriber.email_id, subject, emailHtml);
                if (result.success) {
                    successCount++;
                } else {
                    failCount++;
                }
            } catch (error) {
                console.error(`Failed to send email to ${subscriber.email_id}:`, error);
                failCount++;
            }
        }

        res.json({ 
            success: true, 
            message: `Newsletter sent to ${successCount} subscribers`, 
            sent: successCount,
            failed: failCount,
            total: subscribers.length
        });
    } catch (error) {
        console.error('Error sending newsletter:', error);
        res.status(500).json({ error: 'Failed to send newsletter' });
    }
});


// Wishlist API Endpoints
app.post('/api/wishlist/add', authenticateToken, (req, res) => {
    const { productId } = req.body;
    const userId = req.userId; // Use req.userId from authenticateToken

    if (!productId) {
        return res.status(400).json({ success: false, message: 'Product ID is required' });
    }

    db.query(
        'INSERT INTO wishlist (user_id, product_id) VALUES (?, ?)',
        [userId, productId],
        (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(409).json({ success: false, message: 'Product already in wishlist' });
                }
                console.error('Database error adding to wishlist:', err);
                return res.status(500).json({ success: false, message: 'Database error' });
            }
            res.status(201).json({ success: true, message: 'Product added to wishlist' });
        }
    );
});

app.post('/api/wishlist/remove', authenticateToken, (req, res) => {
    const { productId } = req.body;
    const userId = req.userId;

    if (!productId) {
        return res.status(400).json({ success: false, message: 'Product ID is required' });
    }

    db.query(
        'DELETE FROM wishlist WHERE user_id = ? AND product_id = ?',
        [userId, productId],
        (err, result) => {
            if (err) {
                console.error('Database error removing from wishlist:', err);
                return res.status(500).json({ success: false, message: 'Database error' });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'Product not found in wishlist' });
            }
            res.json({ success: true, message: 'Product removed from wishlist' });
        }
    );
});

app.post('/api/wishlist/clear', authenticateToken, (req, res) => {
    const userId = req.userId;

    db.query(
        'DELETE FROM wishlist WHERE user_id = ?',
        [userId],
        (err, result) => {
            if (err) {
                console.error('Database error clearing wishlist:', err);
                return res.status(500).json({ success: false, message: 'Database error' });
            }
            res.json({ success: true, message: 'Wishlist cleared' });
        }
    );
});

app.get('/api/wishlist', authenticateToken, (req, res) => {
    const userId = req.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 40;
    const offset = (page - 1) * limit;

    console.log(`Fetching wishlist for userId: ${userId}, page: ${page}, limit: ${limit}`);

    const countQuery = 'SELECT COUNT(*) as count FROM wishlist WHERE user_id = ?';
    db.query(countQuery, [userId], (err, countResult) => {
        if (err) {
            console.error('Database error fetching wishlist count:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        const totalItems = countResult[0].count;
        const totalPages = Math.ceil(totalItems / limit);

        const query = `
            SELECT p.product_id AS id, p.title AS name, p.price, pi.image_path AS image
            FROM wishlist w
            JOIN products p ON w.product_id = p.product_id
            LEFT JOIN product_images pi ON p.product_id = pi.product_id
            WHERE w.user_id = ?
            GROUP BY p.product_id
            LIMIT ?
            OFFSET ?
        `;

        db.query(query, [userId, limit, offset], (err, results) => {
            if (err) {
                console.error('Database error fetching wishlist:', err);
                return res.status(500).json({ success: false, message: 'Database error' });
            }
            console.log('Wishlist fetched successfully. Results count:', results.length);
            res.json({
                success: true,
                wishlist: results,
                pagination: {
                    page,
                    limit,
                    totalItems,
                    totalPages
                }
            });
        });
    });
});

// Serve admin page (protected)
app.get('/admin', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

/* API Routes */
// Categories CRUD
app.get('/api/categories', (req, res) => {
    const query = `
        SELECT c.category_id, c.category_name, c.category_image, col.collection_name
        FROM categories c
        LEFT JOIN collections col ON c.collection_id = col.collection_id
        ORDER BY c.category_id
    `;
    db.query(query, (err, results) => {
        if (err) {
            console.error('Database error fetching public categories:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        const categories = results.map(cat => {
            if (cat.category_image) {
                cat.category_image = `/src/categories/${cat.category_image}`;
            }
            return cat;
        });
        res.json(categories);
    });
});

app.post('/api/categories', isAuthenticated, upload.single('categoryImage'), (req, res) => {
    console.log('POST /api/categories called');
    console.log('req.body:', req.body);
    console.log('req.file:', req.file);

    // Use req.body fields directly, multer parses multipart/form-data
    const categoryName = req.body.categoryName || req.body.category_name;
    const categoryDescription = req.body.categoryDescription || req.body.category_des;
    const categoryImage = req.file ? req.file.filename : null;
    const collectionId = req.body.collectionId || req.body.collection_id;

    if (!categoryName) return res.status(400).json({ error: 'Category name is required' });
    // collectionId can be null or undefined if not provided, so no strict check here

    db.query(
        'INSERT INTO categories (category_name, category_description, category_image, collection_id) VALUES (?, ?, ?, ?)',
        [categoryName, categoryDescription, categoryImage, collectionId || null],
        (err, result) => {
            if (err) {
                console.error('DB Insert Error:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.status(201).json({ message: 'Category created', categoryId: result.insertId });
        }
    );
});

app.put('/api/categories/:id', isAuthenticated, upload.single('categoryImage'), (req, res) => {
    const categoryId = req.params.id;

    const categoryName = req.body.categoryName || req.body.category_name;
    const categoryDescription = req.body.categoryDescription || req.body.category_des;
    const categoryImage = req.file ? req.file.filename : null;
    const collectionId = req.body.collectionId || req.body.collection_id;

    if (!categoryName) return res.status(400).json({ error: 'Category name is required' });

    let query = 'UPDATE categories SET category_name = ?, category_description = ?, collection_id = ?';
    const params = [categoryName, categoryDescription, collectionId];

    if (categoryImage) {
        query += ', category_image = ?';
        params.push(categoryImage);
    }
    query += ' WHERE category_id = ?';
    params.push(categoryId);

    db.query(query, params, (err, result) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Category not found' });
        res.json({ message: 'Category updated' });
    });
});

app.delete('/api/categories/:id', isAuthenticated, (req, res) => {
    const categoryId = req.params.id;
    db.query('DELETE FROM categories WHERE category_id = ?', [categoryId], (err, result) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Category not found' });
        res.json({ message: 'Category deleted' });
    });
});

// Products CRUD
app.get('/api/products', isAuthenticated, (req, res) => {
    const categoryFilter = req.query.category;
    const collectionFilter = req.query.collection;
    let query = `
        SELECT p.product_id, p.title, p.sku, p.price, p.mrp, p.description, p.variant_type, p.variant_details,
               c.category_id, c.category_name,
               col.collection_id, col.collection_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
    `;
    const params = [];
    const conditions = [];

    if (categoryFilter) {
        conditions.push('p.category_id = ?');
        params.push(categoryFilter);
    }
    if (collectionFilter) {
        conditions.push('p.collection_id = ?');
        params.push(collectionFilter);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY p.product_id DESC';
    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        try {
            // Parse variant_type and variant_details for each product
            const parsedResults = results.map(product => {
                try {
                    if (product.variant_type && typeof product.variant_type === 'string') {
                        // Check if it's already valid JSON before parsing
                        if (product.variant_type.startsWith('[') || product.variant_type.startsWith('{')) {
                            product.variant_type = JSON.parse(product.variant_type);
                        }
                    }
                    if (product.variant_details && typeof product.variant_details === 'string') {
                        // Check if it's already valid JSON before parsing
                        if (product.variant_details.startsWith('[') || product.variant_details.startsWith('{')) {
                            product.variant_details = JSON.parse(product.variant_details);
                        }
                    }
                } catch (e) {
                    console.error('Error parsing variant data for product:', product.product_id, e);
                }
                return product;
            });

            // Get images for all products
            const productIds = parsedResults.map(p => p.product_id);
            if (productIds.length === 0) {
                return res.json(parsedResults);
            }

            const placeholders = productIds.map(() => '?').join(',');
            db.query(
                `SELECT product_id, variant_detail, image_path, stock FROM product_images WHERE product_id IN (${placeholders})`,
                productIds,
                (imgErr, images) => {
                    if (imgErr) {
                        console.error('Error fetching product images:', imgErr);
                        return res.json(parsedResults); // Return products without images if there's an error
                    }

                    try {
                        // Group images by product_id
                        const imagesByProduct = {};
                        images.forEach(image => {
                            if (!imagesByProduct[image.product_id]) {
                                imagesByProduct[image.product_id] = [];
                            }
                            imagesByProduct[image.product_id].push(image);
                        });

                        // Add images to each product
                        const resultsWithImages = parsedResults.map(product => {
                            product.images = imagesByProduct[product.product_id] || [];
                            return product;
                        });

                        res.json(resultsWithImages);
                    } catch (e) {
                        console.error('Error processing product images:', e);
                        res.json(parsedResults);
                    }
                }
            );
        } catch (e) {
            console.error('Error processing products:', e);
            res.json([]); // Return empty array in case of error
        }
    });
});

// Get single product by id
app.get('/api/products/:id', isAuthenticated, (req, res) => {
    const productId = req.params.id;
    const query = `
        SELECT p.*, c.category_name, col.collection_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        WHERE p.product_id = ?
    `;
    db.query(query, [productId], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (results.length === 0) return res.status(404).json({ error: 'Product not found' });

        try {
            // Parse variant_type and variant_details for the product
            const product = results[0];
            try {
                if (product.variant_type && typeof product.variant_type === 'string') {
                    product.variant_type = JSON.parse(product.variant_type);
                }
                if (product.variant_details && typeof product.variant_details === 'string') {
                    product.variant_details = JSON.parse(product.variant_details);
                }
            } catch (e) {
                console.error('Error parsing variant data for product:', product.product_id, e);
            }

            // Get variant images and stock information
            db.query(
                'SELECT variant_detail, image_path, stock FROM product_images WHERE product_id = ?',
                [productId],
                (imgErr, images) => {
                    if (imgErr) {
                        console.error('Error fetching product images:', imgErr);
                        return res.json(product); // Return product without images if there's an error
                    }

                    try {
                        // Add images to product object
                        product.images = images;
                        console.log('Sending product data:', product);
                        res.setHeader('Content-Type', 'application/json');
                        console.log('Content-Type header set to application/json');
                        res.json(product);
                    } catch (e) {
                        console.error('Error processing product images:', e);
                        res.json(product);
                    }
                }
            );
        } catch (e) {
            console.error('Error processing product:', e);
            res.status(500).json({ error: 'Error processing product' });
        }
    });
});

app.post('/api/products', isAuthenticated, productUpload, (req, res) => {
    console.log('POST /api/products called');
    console.log('Request Body:', req.body);
    console.log('Request Files:', req.files);
    console.log('req.body:', req.body);
    console.log('req.files:', req.files);

    const title = req.body.title || req.body.product_title;
    const sku = req.body.sku || req.body.product_sku;
    const price = req.body.price || req.body.product_price;
    const mrp = req.body.mrp || req.body.product_mrp;
    const hsn = req.body.hsn || req.body.product_hsn;
    const weight = req.body.weight || req.body.product_weight;
    const description = req.body.description || req.body.product_description;
    let variant_type = req.body.variant_type;
    let variant_details = req.body.variant_details;
    const category_id = req.body.category_id || req.body.product_category;
    const collection_id = req.body.collection_id || req.body.product_collection;
    const stock = req.body.variantStocks || req.body.product_stock;

    console.log('Original variant_type:', variant_type);
    console.log('Original variant_details:', variant_details);

    // Parse variant_type and variant_details if they are JSON strings
    try {
        if (typeof variant_type === 'string' && variant_type.startsWith('[')) {
            variant_type = JSON.parse(variant_type);
            console.log('Parsed variant_type:', variant_type);
        }
        if (typeof variant_details === 'string' && variant_details.startsWith('[')) {
            variant_details = JSON.parse(variant_details);
            console.log('Parsed variant_details:', variant_details);
        }
    } catch (e) {
        console.error('Error parsing variant data:', e);
    }

    if (!title || !sku || !price || !category_id || !collection_id) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Convert variant_type and variant_details to JSON strings if they are arrays
    let variant_type_str = variant_type;
    let variant_details_str = variant_details;

    if (Array.isArray(variant_type)) {
        variant_type_str = JSON.stringify(variant_type);
        console.log('Stringified variant_type:', variant_type_str);
    }
    if (Array.isArray(variant_details)) {
        variant_details_str = JSON.stringify(variant_details);
        console.log('Stringified variant_details:', variant_details_str);
    }

    console.log('Final variant_type_str:', variant_type_str);
    console.log('Final variant_details_str:', variant_details_str);

    db.query(
        'INSERT INTO products (title, sku, price, mrp, hsn, weight, description, variant_type, variant_details,category_id, collection_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [title, sku, price, mrp, hsn, weight, description, variant_type_str, variant_details_str, category_id, collection_id],
        (err, result) => {
            if (err) {
                console.error('DB Insert Error:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            const productId = result.insertId;

            // Process color-size variant data and images
            const variantImages = [];
            const variantStocks = {};

            // First, collect all variant stock data
            Object.keys(req.body).forEach(key => {
                if (key.startsWith('variantStock_')) {
                    const stockValue = req.body[key];
                    const detailKey = key.replace('variantStock_', 'variantStockDetail_');
                    const variantDetail = req.body[detailKey];

                    if (variantDetail && stockValue !== undefined) {
                        variantStocks[variantDetail] = parseInt(stockValue) || 0;
                        console.log(`  Processing variant stock: ${variantDetail} = ${variantStocks[variantDetail]}`);
                    }
                }
            });
            console.log('Populated variantStocks:', variantStocks);

            // Process uploaded color images
            if (req.files && req.files.length > 0) {
                console.log('Processing uploaded files. Total files:', req.files.length);
                req.files.forEach(file => {
                    console.log('File fieldname:', file.fieldname);
                    // Handle color images (format: colorImages_i_j)
                    if (file.fieldname.startsWith('colorImages_')) {
                        const parts = file.fieldname.split('_');
                        if (parts.length >= 3) {
                            const i = parts[1]; // color index
                            const j = parts[2]; // image index

                            const detailKey = `colorImageDetail_${i}_${j}`;
                            const color = req.body[detailKey];

                            console.log(`  Extracted color for ${file.fieldname}: ${color}`);

                            if (color) {
                                // For each color image, we need to create entries for all color-size combinations
                                if (Array.isArray(variant_details) && variant_details.length >= 2) {
                                    const sizes = variant_details[1].split(',').map(s => s.trim()).filter(s => s);
                                    sizes.forEach(size => {
                                        const variantDetail = `${color}-${size}`;
                                        variantImages.push({
                                            product_id: productId,
                                            variant_detail: variantDetail,
                                            image_path: file.filename,
                                            stock: variantStocks[variantDetail] || 0
                                        });
                                    });
                                }
                            }
                        }
                    }
                });
            }

            // Handle retained color images
            Object.keys(req.body).forEach(key => {
                if (key.startsWith('retainedColorImage_')) {
                    const imagePath = req.body[key];
                    const detailKey = key.replace('retainedColorImage_', 'retainedColorImageDetail_');
                    const color = req.body[detailKey];

                    if (color && imagePath && Array.isArray(variant_details) && variant_details.length >= 2) {
                        const sizes = variant_details[1].split(',').map(s => s.trim()).filter(s => s);
                        sizes.forEach(size => {
                            const variantDetail = `${color}-${size}`;
                            variantImages.push({
                                product_id: productId,
                                variant_detail: variantDetail,
                                image_path: imagePath,
                                stock: variantStocks[variantDetail] || 0
                            });
                        });
                    }
                }
            });

            // Process all color-size combinations from the parsed data
            if (Array.isArray(variant_details) && variant_details.length >= 2) {
                const colors = variant_details[0].split(',').map(c => c.trim()).filter(c => c);
                const sizes = variant_details[1].split(',').map(s => s.trim()).filter(s => s);

                colors.forEach(color => {
                    sizes.forEach(size => {
                        const variantDetail = `${color}-${size}`;

                        // Check if this combination already has an image
                        const hasImage = variantImages.some(img => img.variant_detail === variantDetail);

                        // If no image for this combination, add it with null image_path
                        if (!hasImage) {
                            variantImages.push({
                                product_id: productId,
                                variant_detail: variantDetail,
                                image_path: null,
                                stock: variantStocks[variantDetail] || 0
                            });
                        }
                    });
                });
            }

            // Insert all variant data into product_images
            console.log('Final variantImages array before DB insert:', variantImages);
            if (variantImages.length > 0) {
                const inserts = variantImages.map(item => [
                    item.product_id,
                    item.variant_detail,
                    item.image_path,
                    item.stock
                ]);

                console.log('Inserts array for product_images table:', inserts);

                db.query(
                    'INSERT INTO product_images (product_id, variant_detail, image_path, stock) VALUES ?',
                    [inserts],
                    (imgErr) => {
                        if (imgErr) {
                            console.error('Product Images Insert Error:', imgErr);
                            return res.status(500).json({ error: 'Database error inserting product images' });
                        }
                        res.status(201).json({ message: 'Product created', productId });
                    }
                );
            } else {
                // Handle no-variant products
                const productImages = req.files ? req.files.filter(file => file.fieldname.startsWith('productImages_')) : [];
                const stock = req.body.stock || 0;

                console.log('No variant product - productImages:', productImages.length, 'stock:', stock);

                if (productImages.length > 0) {
                    const inserts = productImages.map(file => [
                        productId,
                        null,
                        file.filename,
                        parseInt(stock)
                    ]);

                    console.log('Inserting product images:', inserts);

                    db.query(
                        'INSERT INTO product_images (product_id, variant_detail, image_path, stock) VALUES ?',
                        [inserts],
                        (imgErr) => {
                            if (imgErr) {
                                console.error('Product Images Insert Error:', imgErr);
                                return res.status(500).json({ error: 'Database error' });
                            }
                            res.status(201).json({ message: 'Product created', productId });
                        }
                    );
                } else {
                    // No images, just stock
                    console.log('No images, inserting stock only:', stock);
                    db.query(
                        'INSERT INTO product_images (product_id, variant_detail, image_path, stock) VALUES (?, ?, ?, ?)',
                        [productId, null, null, parseInt(stock)],
                        (imgErr) => {
                            if (imgErr) {
                                console.error('Default Product Insert Error:', imgErr);
                                return res.status(500).json({ error: 'Database error' });
                            }
                            res.status(201).json({ message: 'Product created', productId });
                        }
                    );
                }
            }
        }
    );
});

app.put('/api/products/:id', isAuthenticated, productUpload, (req, res) => {
    console.log('PUT /api/products/:id called');
    console.log('Request Body:', req.body);
    console.log('Request Files:', req.files);
    const productId = req.params.id;

    const title = req.body.title || req.body.product_title;
    const sku = req.body.sku || req.body.product_sku;
    const price = req.body.price || req.body.product_price;
    const mrp = req.body.mrp || req.body.product_mrp;
    const hsn = req.body.hsn || req.body.product_hsn;
    const weight = req.body.weight || req.body.product_weight;
    const description = req.body.description || req.body.product_description;
    let variant_type = req.body.variant_type;
    let variant_details = req.body.variant_details;
    const stock = req.body.variantStocks || req.body.product_stock;
    const category_id = req.body.category_id || req.body.product_category;
    const collection_id = req.body.collection_id || req.body.product_collection;

    // Parse variant_type and variant_details if they are JSON strings
    try {
        if (typeof variant_type === 'string' && variant_type.startsWith('[')) {
            variant_type = JSON.parse(variant_type);
        }
        if (typeof variant_details === 'string' && variant_details.startsWith('[')) {
            variant_details = JSON.parse(variant_details);
        }
    } catch (e) {
        console.error('Error parsing variant data:', e);
    }

    if (!title || !sku || !price || !category_id || !collection_id) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Convert variant_type and variant_details to JSON strings if they are arrays
    let variant_type_str = variant_type;
    let variant_details_str = variant_details;

    if (Array.isArray(variant_type)) {
        variant_type_str = JSON.stringify(variant_type);
    }
    if (Array.isArray(variant_details)) {
        variant_details_str = JSON.stringify(variant_details);
    }

    db.query(
        'UPDATE products SET title = ?, sku = ?, price = ?, mrp = ?, hsn = ?, weight = ?, description = ?, variant_type = ?, variant_details = ?, category_id = ?, collection_id = ? WHERE product_id = ?',
        [title, sku, price, mrp, hsn, weight, description, variant_type_str, variant_details_str, category_id, collection_id, productId],
        (err, result) => {
            if (err) {
                console.error('Database error updating product:', err);
                return res.status(500).json({ error: 'Database error updating product' });
            }
            if (result.affectedRows === 0) return res.status(404).json({ error: 'Product not found' });

            // Selective image update - only update variants with new images
            const hasNewImages = req.files && req.files.length > 0;
            
            if (hasNewImages) {
                // Get variants that have new images
                const variantsWithNewImages = new Set();
                req.files.forEach(file => {
                    if (file.fieldname.startsWith('colorImages_')) {
                        const parts = file.fieldname.split('_');
                        const i = parts[1];
                        const detailKey = `colorImageDetail_${i}_${parts[2]}`;
                        const color = req.body[detailKey];
                        if (color) {
                            if (Array.isArray(variant_details) && variant_details.length >= 2) {
                                const sizes = variant_details[1].split(',').map(s => s.trim()).filter(s => s);
                                sizes.forEach(size => variantsWithNewImages.add(`${color}-${size}`));
                            } else {
                                variantsWithNewImages.add(color);
                            }
                        }
                    } else if (file.fieldname.startsWith('productImages_')) {
                        variantsWithNewImages.add('null');
                    }
                });
                
                // Delete only images for variants that have new uploads
                if (variantsWithNewImages.size > 0) {
                    // First get the old image paths to delete from FTP
                    const getOldImagesPromises = Array.from(variantsWithNewImages).map(variant => {
                        return new Promise((resolve, reject) => {
                            let query = 'SELECT image_path FROM product_images WHERE product_id = ? AND image_path IS NOT NULL';
                            let params = [productId];
                            
                            if (variant === 'null') {
                                query += ' AND variant_detail IS NULL';
                            } else {
                                query += ' AND variant_detail = ?';
                                params.push(variant);
                            }
                            
                            db.query(query, params, (err, results) => {
                                if (err) reject(err);
                                else resolve(results.map(row => row.image_path));
                            });
                        });
                    });
                    
                    Promise.all(getOldImagesPromises)
                        .then(imageArrays => {
                            // Flatten the array and get unique image paths
                            const oldImagePaths = [...new Set(imageArrays.flat())];
                            
                            // Delete old images from FTP in background
                            if (oldImagePaths.length > 0) {
                                setTimeout(async () => {
                                    for (const imagePath of oldImagePaths) {
                                        try {
                                            await deleteFromBluehost(`/uploads/${imagePath}`);
                                        } catch (error) {
                                            console.error('Error deleting old image from FTP:', error);
                                        }
                                    }
                                }, 2000);
                            }
                            
                            // Now delete from database
                            const deletePromises = Array.from(variantsWithNewImages).map(variant => {
                                return new Promise((resolve, reject) => {
                                    let query = 'DELETE FROM product_images WHERE product_id = ?';
                                    let params = [productId];
                                    
                                    if (variant === 'null') {
                                        query += ' AND variant_detail IS NULL';
                                    } else {
                                        query += ' AND variant_detail = ?';
                                        params.push(variant);
                                    }
                                    
                                    db.query(query, params, (err) => {
                                        if (err) reject(err);
                                        else resolve();
                                    });
                                });
                            });
                            
                            return Promise.all(deletePromises);
                        })
                        .then(() => insertProductImages())
                        .catch(err => {
                            console.error('Error deleting selective images:', err);
                            res.status(500).json({ error: 'Database error deleting images' });
                        });
                } else {
                    insertProductImages();
                }
            } else {
                // No new images, just update stock values
                updateStockOnly();
            }
            
            function insertProductImages() {
                const imageInserts = [];
                const variantStocks = {};

                // Collect retained images from the request body
                const retainedImages = [];
                Object.keys(req.body).forEach(key => {
                    if (key.startsWith('retainedImage_')) {
                        const imagePath = req.body[key];
                        const parts = key.split('_');
                        const i = parts[1];
                        const j = parts[2];
                        const variantDetailKey = `variantImageDetail_${i}_${j}_retained`;
                        const variantDetail = req.body[variantDetailKey];

                        if (imagePath && variantDetail) {
                            retainedImages.push({
                                product_id: productId,
                                variant_detail: variantDetail,
                                image_path: imagePath,
                                stock: 0 // Temporary stock, will be updated from variantStocks later
                            });
                        }
                    }
                });
                console.log('Collected Retained Images:', retainedImages);

                // First, collect all variant stock data
                Object.keys(req.body).forEach(key => {
                    if (key.startsWith('variantStock_')) {
                        const stockValue = req.body[key];
                        const detailKey = key.replace('variantStock_', 'variantStockDetail_');
                        const variantDetail = req.body[detailKey];

                        if (variantDetail && stockValue !== undefined) {
                            variantStocks[variantDetail] = parseInt(stockValue) || 0;
                            console.log(`  Processing variant stock (PUT): ${variantDetail} = ${variantStocks[variantDetail]}`);
                        }
                    }
                });
                console.log('Populated variantStocks (PUT):', variantStocks);

                // Process uploaded images
                if (req.files && req.files.length > 0) {
                    console.log('Processing uploaded files (PUT). Total files:', req.files.length);
                    req.files.forEach(file => {
                        console.log('File fieldname (PUT):', file.fieldname);

                        // Handle no-variant product images
                        if (file.fieldname.startsWith('productImages_')) {
                            const stock = req.body.stock || 0;
                            imageInserts.push({
                                product_id: productId,
                                variant_detail: null,
                                image_path: file.filename,
                                stock: parseInt(stock)
                            });
                        }
                        // Handle single variant images (color-only or size-only)
                        else if (file.fieldname.startsWith('colorImages_') && Array.isArray(variant_details) && variant_details.length === 1) {
                            const variants = variant_details[0].split(',').map(v => v.trim()).filter(v => v);

                            // Copy same image for all variants
                            variants.forEach(variant => {
                                imageInserts.push({
                                    product_id: productId,
                                    variant_detail: variant,
                                    image_path: file.filename,
                                    stock: variantStocks[variant] || 0
                                });
                            });
                        }
                        // Handle color images (format: colorImages_i_j)
                        else if (file.fieldname.startsWith('colorImages_')) {
                            const parts = file.fieldname.split('_');
                            if (parts.length >= 3) {
                                const i = parts[1]; // color index
                                const j = parts[2]; // image index

                                const detailKey = `colorImageDetail_${i}_${j}`;
                                const color = req.body[detailKey];

                                console.log(`  Extracted color for ${file.fieldname} (PUT): ${color}`);

                                if (color && Array.isArray(variant_details) && variant_details.length >= 2) {
                                    const sizes = variant_details[1].split(',').map(s => s.trim()).filter(s => s);
                                    sizes.forEach(size => {
                                        const variantDetail = `${color}-${size}`;
                                        imageInserts.push({
                                            product_id: productId,
                                            variant_detail: variantDetail,
                                            image_path: file.filename,
                                            stock: variantStocks[variantDetail] || 0
                                        });
                                    });
                                }
                            }
                        }
                    });
                }
                console.log('imageInserts after processing uploaded files (PUT):', imageInserts);

                // Handle retained color images
                Object.keys(req.body).forEach(key => {
                    if (key.startsWith('retainedColorImage_')) {
                        const imagePath = req.body[key];
                        const detailKey = key.replace('retainedColorImage_', 'retainedColorImageDetail_');
                        const color = req.body[detailKey];

                        if (color && imagePath && Array.isArray(variant_details) && variant_details.length >= 2) {
                            const sizes = variant_details[1].split(',').map(s => s.trim()).filter(s => s);
                            sizes.forEach(size => {
                                const variantDetail = `${color}-${size}`;
                                imageInserts.push({
                                    product_id: productId,
                                    variant_detail: variantDetail,
                                    image_path: imagePath,
                                    stock: variantStocks[variantDetail] || 0
                                });
                            });
                        }
                    }
                });
                console.log('imageInserts after adding retained images (PUT):', imageInserts);

                // Process single variant combinations (color-only or size-only)
                if (Array.isArray(variant_details) && variant_details.length === 1) {
                    const variants = variant_details[0].split(',').map(v => v.trim()).filter(v => v);

                    // Get uploaded images and copy to all variants
                    const uploadedImages = imageInserts.filter(img => img.image_path);
                    const uniqueImages = [...new Set(uploadedImages.map(img => img.image_path))];

                    // Clear existing image inserts for single variants
                    let filteredInserts = imageInserts.filter(img => !variants.includes(img.variant_detail));
                    imageInserts.length = 0;
                    imageInserts.push(...filteredInserts);

                    // Add each image to all variants
                    variants.forEach(variant => {
                        if (uniqueImages.length > 0) {
                            uniqueImages.forEach(imagePath => {
                                imageInserts.push({
                                    product_id: productId,
                                    variant_detail: variant,
                                    image_path: imagePath,
                                    stock: variantStocks[variant] || 0
                                });
                            });
                        } else {
                            imageInserts.push({
                                product_id: productId,
                                variant_detail: variant,
                                image_path: null,
                                stock: variantStocks[variant] || 0
                            });
                        }
                    });
                }
                // Process all color-size combinations from the parsed data
                else if (Array.isArray(variant_details) && variant_details.length >= 2) {
                    const colors = variant_details[0].split(',').map(c => c.trim()).filter(c => c);
                    const sizes = variant_details[1].split(',').map(s => s.trim()).filter(s => s);

                    colors.forEach(color => {
                        sizes.forEach(size => {
                            const variantDetail = `${color}-${size}`;

                            // Check if this combination already has an image
                            const hasImage = imageInserts.some(img => img.variant_detail === variantDetail);

                            // If no image for this combination, add it with null image_path
                            if (!hasImage) {
                                imageInserts.push({
                                    product_id: productId,
                                    variant_detail: variantDetail,
                                    image_path: null,
                                    stock: variantStocks[variantDetail] || 0
                                });
                            }
                        });
                    });
                }

                console.log('Final imageInserts array before DB insert (PUT):', imageInserts);

                if (imageInserts.length > 0) {
                    const inserts = imageInserts.map(item => [
                        item.product_id,
                        item.variant_detail,
                        item.image_path,
                        item.stock
                    ]);

                    console.log('Inserts array for product_images table (PUT):', inserts);

                    db.query(
                        'INSERT INTO product_images (product_id, variant_detail, image_path, stock) VALUES ?',
                        [inserts],
                        (imgErr) => {
                            if (imgErr) {
                                console.error('Image Insert Error (PUT):', imgErr);
                                return res.status(500).json({ error: 'Image upload error' });
                            }
                            console.log('Product images inserted successfully for product ID:', productId);
                            res.json({ message: 'Product updated' });
                        }
                    );
                } else {
                    // Handle no-variant products with just stock
                    const stock = req.body.stock;
                    if (stock !== undefined) {
                        db.query(
                            'INSERT INTO product_images (product_id, variant_detail, image_path, stock) VALUES (?, ?, ?, ?)',
                            [productId, null, null, parseInt(stock)],
                            (imgErr) => {
                                if (imgErr) {
                                    console.error('Stock Insert Error (PUT):', imgErr);
                                    return res.status(500).json({ error: 'Database error' });
                                }
                                res.json({ message: 'Product updated' });
                            }
                        );
                    } else {
                        res.json({ message: 'Product updated' });
                    }
                }
            }
            
            function updateStockOnly() {
                // Update stock values without changing images
                const variantStocks = {};
                Object.keys(req.body).forEach(key => {
                    if (key.startsWith('variantStock_')) {
                        const stockValue = req.body[key];
                        const detailKey = key.replace('variantStock_', 'variantStockDetail_');
                        const variantDetail = req.body[detailKey];
                        if (variantDetail && stockValue !== undefined) {
                            variantStocks[variantDetail] = parseInt(stockValue) || 0;
                        }
                    }
                });
                
                if (Object.keys(variantStocks).length > 0) {
                    const updatePromises = Object.entries(variantStocks).map(([variantDetail, stock]) => {
                        return new Promise((resolve, reject) => {
                            let query = 'UPDATE product_images SET stock = ? WHERE product_id = ?';
                            let params = [stock, productId];
                            
                            if (variantDetail && variantDetail !== 'null') {
                                query += ' AND variant_detail = ?';
                                params.push(variantDetail);
                            } else {
                                query += ' AND variant_detail IS NULL';
                            }
                            
                            db.query(query, params, (err) => {
                                if (err) reject(err);
                                else resolve();
                            });
                        });
                    });
                    
                    Promise.all(updatePromises)
                        .then(() => res.json({ message: 'Product updated' }))
                        .catch(err => {
                            console.error('Error updating stock:', err);
                            res.status(500).json({ error: 'Database error updating stock' });
                        });
                } else {
                    // Update simple product stock
                    const stock = req.body.stock;
                    if (stock !== undefined) {
                        db.query('UPDATE product_images SET stock = ? WHERE product_id = ? AND variant_detail IS NULL',
                            [parseInt(stock), productId], (err) => {
                                if (err) {
                                    console.error('Error updating simple product stock:', err);
                                    return res.status(500).json({ error: 'Database error' });
                                }
                                res.json({ message: 'Product updated' });
                            });
                    } else {
                        res.json({ message: 'Product updated' });
                    }
                }
            }
        });
});
app.delete('/api/products/:id', isAuthenticated, (req, res) => {
    const productId = req.params.id;

    // First get all image paths to delete from FTP
    db.query('SELECT image_path FROM product_images WHERE product_id = ? AND image_path IS NOT NULL', [productId], (getErr, imageResults) => {
        if (getErr) {
            console.error('Error getting product images for deletion:', getErr);
            return res.status(500).json({ error: 'Database error getting product images' });
        }

        const imagePaths = imageResults.map(row => row.image_path);

        // Delete related product images from database
        db.query('DELETE FROM product_images WHERE product_id = ?', [productId], (imgErr) => {
            if (imgErr) {
                console.error('Error deleting product images:', imgErr);
                return res.status(500).json({ error: 'Database error deleting product images' });
            }

            // Then delete the product
            db.query('DELETE FROM products WHERE product_id = ?', [productId], (err, result) => {
                if (err) {
                    console.error('Error deleting product:', err);
                    return res.status(500).json({ error: 'Database error deleting product' });
                }
                if (result.affectedRows === 0) return res.status(404).json({ error: 'Product not found' });
                
                // Delete images from FTP in background after successful database deletion
                if (imagePaths.length > 0) {
                    setTimeout(async () => {
                        for (const imagePath of imagePaths) {
                            try {
                                await deleteFromBluehost(`/uploads/${imagePath}`);
                            } catch (error) {
                                console.error('Error deleting image from FTP during product deletion:', error);
                            }
                        }
                    }, 1000);
                }
                
                res.json({ message: 'Product deleted' });
            });
        });
    });
});


// Orders CRUD
app.get('/api/orders', authenticateToken, (req, res) => {
    const userId = req.userId;
    const filter = req.query.filter;
    let query = 'SELECT * FROM orders WHERE user_id = ?';
    const params = [userId];
    if (filter === 'recent') {
        query += ' ORDER BY order_date DESC';
    } else if (filter === 'old') {
        query += ' ORDER BY order_date ASC';
    } else {
        query += ' ORDER BY order_date DESC';
    }
    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Orders query error:', err);
            return res.status(500).json({ error: 'Database error', success: false });
        }
        res.json({ success: true, orders: results || [] });
    });
});

// Get order items for admin
app.get('/api/admin/orders/:orderId/items', isAuthenticated, (req, res) => {
    const orderId = req.params.orderId;

    const query = `
        SELECT oi.*, p.title, pi.image_path
        FROM order_items oi
        JOIN products p ON oi.product_id = p.product_id
        LEFT JOIN product_images pi ON p.product_id = pi.product_id
        WHERE oi.order_id = ?
        GROUP BY oi.order_item_id
    `;

    db.query(query, [orderId], (err, results) => {
        if (err) {
            console.error('Database error fetching order items:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// Get order items for users
app.get('/api/orders/:orderId/items', authenticateToken, (req, res) => {
    const orderId = req.params.orderId;
    const userId = req.userId;

    // First verify the order belongs to the user
    const orderQuery = 'SELECT * FROM orders WHERE order_id = ? AND user_id = ?';
    db.query(orderQuery, [orderId, userId], (err, orderResults) => {
        if (err) {
            console.error('Database error checking order:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (orderResults.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Get order items
        const itemsQuery = `
            SELECT oi.*, p.title, pi.image_path
            FROM order_items oi
            JOIN products p ON oi.product_id = p.product_id
            LEFT JOIN product_images pi ON p.product_id = pi.product_id
            WHERE oi.order_id = ?
            GROUP BY oi.order_item_id
        `;

        db.query(itemsQuery, [orderId], (itemsErr, itemsResults) => {
            if (itemsErr) {
                console.error('Database error fetching order items:', itemsErr);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json(itemsResults);
        });
    });
});

// Cancel order by user
app.post('/api/orders/:orderId/cancel', authenticateToken, async (req, res) => {
    const orderId = req.params.orderId;
    const userId = req.userId;
    const { reason, additionalComments } = req.body;
    
    try {
        // First verify the order belongs to the user and can be cancelled
        const orderResult = await new Promise((resolve, reject) => {
            const query = `
                SELECT o.*, u.first_name, u.last_name, u.email 
                FROM orders o 
                JOIN users u ON o.user_id = u.user_id 
                WHERE o.order_id = ? AND o.user_id = ?
            `;
            db.query(query, [orderId, userId], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });
        
        if (!orderResult) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        
        // Check if order can be cancelled (only pending and processing orders)
        if (!['pending', 'processing'].includes(orderResult.status)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Order cannot be cancelled at this stage' 
            });
        }
        
        // Update order status to cancelled
        await new Promise((resolve, reject) => {
            db.query(
                'UPDATE orders SET status = "cancelled", cancelled_by = "Customer", cancellation_reason = ?, cancellation_comments = ? WHERE order_id = ?',
                [reason || 'Customer cancellation', additionalComments || '', orderId],
                (err, result) => {
                    if (err) reject(err);
                    else if (result.affectedRows === 0) reject(new Error('Failed to update order'));
                    else resolve();
                }
            );
        });
        
        // Send cancellation email to customer
        if (orderResult.email) {
            const customerEmailHtml = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: white; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-radius: 12px; overflow: hidden;">
                    <div style="text-align: center; padding: 20px; background: #c3a4c6;">
                        <img src="https://bbqstyle.in/src/logos.png" alt="BBQSTYLE" style="max-width: 150px; height: auto;">
                    </div>
                    
                    <div style="padding: 40px 30px;">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <div style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; box-shadow: 0 4px 12px rgba(220,53,69,0.3);">
                                <span style="color: white; font-size: 36px; font-weight: bold;">✕</span>
                            </div>
                            <h1 style="color: #dc3545; margin: 0 0 10px 0; font-size: 28px; font-weight: 700;">Order Cancelled</h1>
                            <p style="color: #6c757d; font-size: 16px; margin: 0; line-height: 1.5;">Your order has been successfully cancelled</p>
                        </div>

                        <div style="background: linear-gradient(135deg, #f8d7da 0%, #f5c6cb 100%); padding: 25px; margin: 25px 0; border-radius: 12px; border-left: 5px solid #dc3545; box-shadow: 0 2px 8px rgba(220,53,69,0.1);">
                            <h2 style="margin: 0 0 15px 0; color: #721c24; font-size: 20px; display: flex; align-items: center;">
                                <span style="background: #dc3545; color: white; width: 30px; height: 30px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-right: 12px; font-size: 16px;">📋</span>
                                Cancellation Details
                            </h2>
                            <div style="color: #721c24; line-height: 1.6;">
                                <p style="margin: 8px 0;"><strong>Order ID:</strong> #${orderId}</p>
                                <p style="margin: 8px 0;"><strong>Cancelled By:</strong> You</p>
                                <p style="margin: 8px 0;"><strong>Reason:</strong> ${reason || 'Customer cancellation'}</p>
                                ${additionalComments ? `<p style="margin: 8px 0;"><strong>Comments:</strong> ${additionalComments}</p>` : ''}
                                <p style="margin: 8px 0;"><strong>Cancellation Date:</strong> ${new Date().toLocaleString()}</p>
                            </div>
                        </div>

                        <div style="background: linear-gradient(135deg, #d1ecf1 0%, #bee5eb 100%); padding: 20px; margin: 25px 0; border-radius: 12px; border-left: 5px solid #17a2b8;">
                            <h3 style="margin: 0 0 15px 0; color: #0c5460; font-size: 18px; display: flex; align-items: center;">
                                <span style="background: #17a2b8; color: white; width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-right: 10px; font-size: 14px;">💰</span>
                                Refund Information
                            </h3>
                            <p style="margin: 0; color: #0c5460; line-height: 1.6;">
                                ${orderResult.payment_mode === 'COD' ? 
                                    'Since this was a Cash on Delivery order, no refund processing is required.' :
                                    'Your refund of ₹' + orderResult.total_amount + ' will be processed within 5-7 business days to your original payment method.'
                                }
                            </p>
                        </div>

                        <div style="text-align: center; margin: 35px 0;">
                            <a href="https://bbqstyle.in/account?tab=orders" style="background: linear-gradient(135deg, #007bff 0%, #0056b3 100%); color: white; padding: 18px 35px; text-decoration: none; border-radius: 30px; display: inline-block; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(0,123,255,0.3); margin-right: 15px;">📋 View Orders</a>
                            <a href="https://bbqstyle.in" style="background: linear-gradient(135deg, #28a745 0%, #1e7e34 100%); color: white; padding: 18px 35px; text-decoration: none; border-radius: 30px; display: inline-block; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(40,167,69,0.3);">🛒 Continue Shopping</a>
                        </div>

                        <div style="background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%); padding: 20px; margin: 25px 0; border-radius: 12px; border-left: 5px solid #ffc107; text-align: center;">
                            <p style="margin: 0; color: #856404; font-size: 14px; line-height: 1.5;">
                                <strong>💡 Changed your mind?</strong> You can always place a new order anytime!
                            </p>
                        </div>

                        <div style="text-align: center; margin-top: 30px;">
                            <p style="color: #6c757d; font-size: 16px; line-height: 1.6; margin: 0;">
                                We're sorry to see you cancel this order. We hope to serve you better next time!<br>
                                <strong>Team BBQSTYLE</strong>
                            </p>
                        </div>
                    </div>
                    
                    <div style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); padding: 30px 20px; text-align: center; border-top: 1px solid #dee2e6;">
                        <div style="margin-bottom: 20px;">
                            <h3 style="margin: 0 0 15px 0; color: #495057; font-size: 18px; font-weight: 600;">Need Help?</h3>
                            <p style="margin: 0 0 20px 0; color: #6c757d;">Our customer support team is here to assist you</p>
                        </div>
                        
                        <div style="display: flex; justify-content: center; gap: 30px; flex-wrap: wrap; margin-bottom: 25px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="background: #007bff; color: white; width: 35px; height: 35px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">📧</span>
                                <a href="mailto:support@bbqstyle.in" style="color: #007bff; text-decoration: none; font-weight: 600;">support@bbqstyle.in</a>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="background: #28a745; color: white; width: 35px; height: 35px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">📞</span>
                                <a href="tel:+918901551059" style="color: #28a745; text-decoration: none; font-weight: 600;">+91 8901551059</a>
                            </div>
                        </div>
                        
                        <div style="border-top: 1px solid #dee2e6; padding-top: 20px;">
                            <p style="margin: 0; color: #6c757d; font-size: 14px; font-weight: 600;">BBQSTYLE - India's Premium Clothing Store</p>
                            <p style="margin: 5px 0 0 0; color: #adb5bd; font-size: 12px;">Crafting Style, Delivering Excellence</p>
                        </div>
                    </div>
                </div>
            `;
            
            await sendEmail(
                orderResult.email,
                `Order Cancelled - #${orderId}`,
                customerEmailHtml
            );
        }
        
        // Send admin notification
        const adminEmailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: white;">
                <div style="text-align: center; padding: 20px; background: #c3a4c6;">
                    <img src="https://bbqstyle.in/src/logos.png" alt="BBQSTYLE" style="max-width: 150px; height: auto;">
                </div>
                <div style="padding: 30px;">
                    <h2 style="color: #dc3545; margin-bottom: 20px;">🚨 Customer Cancelled Order</h2>
                    <p>A customer has cancelled their order. Please review the details below:</p>
                    <div style="background: #f8d7da; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #dc3545;">
                        <h3 style="margin: 0 0 15px 0; color: #721c24;">Cancellation Details:</h3>
                        <p><strong>Order ID:</strong> #${orderId}</p>
                        <p><strong>Customer:</strong> ${orderResult.first_name} ${orderResult.last_name}</p>
                        <p><strong>Email:</strong> ${orderResult.email}</p>
                        <p><strong>Total Amount:</strong> ₹${orderResult.total_amount}</p>
                        <p><strong>Payment Mode:</strong> ${orderResult.payment_mode}</p>
                        <p><strong>Cancelled By:</strong> Customer</p>
                        <p><strong>Reason:</strong> ${reason || 'Customer cancellation'}</p>
                        ${additionalComments ? `<p><strong>Comments:</strong> ${additionalComments}</p>` : ''}
                        <p><strong>Cancellation Date:</strong> ${new Date().toLocaleString()}</p>
                    </div>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="https://admin.bbqstyle.in" style="background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: 600;">🔧 View in Admin Panel</a>
                    </div>
                    <p><strong>Action Required:</strong> ${orderResult.payment_mode !== 'COD' ? 'Process refund for this order.' : 'No refund processing required for COD order.'}</p>
                </div>
                <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
                    <p style="margin: 0 0 10px 0; font-weight: 600;">BBQSTYLE Admin Panel</p>
                    <p style="margin: 5px 0; color: #6c757d;">📧 <a href="mailto:support@bbqstyle.in" style="color: #007bff;">support@bbqstyle.in</a></p>
                    <p style="margin: 5px 0; color: #6c757d;">📞 <a href="tel:+918901551059" style="color: #007bff;">+91 8901551059</a></p>
                </div>
            </div>
        `;
        
        await sendEmail(
            'hardevi143@gmail.com',
            `Customer Cancelled Order - #${orderId}`,
            adminEmailHtml
        );
        
        res.json({ 
            success: true, 
            message: 'Order cancelled successfully. Refund will be processed within 5-7 business days.' 
        });
        
    } catch (error) {
        console.error('Error cancelling order:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to cancel order', 
            error: error.message 
        });
    }
});

// Get cancellation details for an order
app.get('/api/orders/:orderId/cancellation', authenticateToken, (req, res) => {
    const orderId = req.params.orderId;
    const userId = req.userId;
    
    const query = `
        SELECT cancellation_reason as reason, cancellation_comments as comments, cancelled_by
        FROM orders 
        WHERE order_id = ? AND user_id = ? AND status = 'cancelled'
    `;
    
    db.query(query, [orderId, userId], (err, results) => {
        if (err) {
            console.error('Database error fetching cancellation details:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'Cancellation details not found' });
        }
        
        res.json(results[0]);
    });
});

// Get all orders for admin
app.get('/api/admin/orders', isAuthenticated, (req, res) => {
    const query = `
        SELECT o.*, u.first_name, u.last_name, u.email, 
               a.full_name, a.mobile_no, a.address_line1, a.address_line2, 
               a.city, a.state, a.pincode
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.user_id
        LEFT JOIN addresses a ON o.address_id = a.address_id
        ORDER BY o.order_date DESC
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Database error fetching orders:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// Individual status update APIs with email triggers

// Update to Pending
app.put('/api/admin/orders/:orderId/pending', isAuthenticated, async (req, res) => {
    const orderId = req.params.orderId;
    
    try {
        await new Promise((resolve, reject) => {
            db.query('UPDATE orders SET status = "pending" WHERE order_id = ?', [orderId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        res.json({ success: true, message: 'Order status updated to pending' });
    } catch (error) {
        console.error('Error updating to pending:', error);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

// Update to Processing (sends confirmation email)
app.put('/api/admin/orders/:orderId/processing', isAuthenticated, async (req, res) => {
    const orderId = req.params.orderId;
    console.log(`Processing order ${orderId} - starting`);
    
    try {
        console.log('Fetching order details...');
        const orderResult = await new Promise((resolve, reject) => {
            const query = `SELECT o.*, u.first_name, u.last_name, u.email FROM orders o JOIN users u ON o.user_id = u.user_id WHERE o.order_id = ?`;
            db.query(query, [orderId], (err, results) => {
                if (err) {
                    console.error('DB error fetching order:', err);
                    reject(err);
                } else {
                    console.log('Order found:', results[0] ? 'Yes' : 'No');
                    if (results[0]) {
                        console.log('Customer email:', results[0].email);
                    }
                    resolve(results[0]);
                }
            });
        });
        
        console.log('Updating order status to processing...');
        await new Promise((resolve, reject) => {
            db.query('UPDATE orders SET status = "processing" WHERE order_id = ?', [orderId], (err) => {
                if (err) {
                    console.error('DB error updating status:', err);
                    reject(err);
                } else {
                    console.log('Order status updated successfully');
                    resolve();
                }
            });
        });
        
        if (orderResult && orderResult.email) {
            console.log(`Sending confirmation email to: ${orderResult.email}`);
            
            const emailHtml = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: white;">
                    <div style="text-align: center; padding: 20px; background: #c3a4c6;">
                        <img src="https://bbqstyle.in/src/logos.png" alt="BBQSTYLE" style="max-width: 150px; height: auto;">
                    </div>
                    <div style="padding: 30px;">
                        <h2 style="color: #28a745; margin-bottom: 20px;">Order Confirmed! ✅</h2>
                        <p>Dear ${orderResult.first_name} ${orderResult.last_name},</p>
                        <p>Excellent! Your order has been confirmed and we're now preparing it for packing. Our team is working diligently to ensure your items are carefully processed.</p>
                        <div style="background: #d4edda; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #28a745;">
                            <h3 style="margin: 0 0 15px 0; color: #155724;">Order Confirmation Details:</h3>
                            <p><strong>Order ID:</strong> #${orderId}</p>
                            <p><strong>Status:</strong> CONFIRMED & PROCESSING</p>
                            <p><strong>Total Amount:</strong> ₹${orderResult.total_amount}</p>
                            <p><strong>Payment Mode:</strong> ${orderResult.payment_mode}</p>
                            <p><strong>Confirmation Date:</strong> ${new Date().toLocaleString()}</p>
                        </div>
                        <div style="background: #e7f3ff; padding: 15px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #007bff;">
                            <p style="margin: 0; color: #004085;"><strong>📦 What's Next:</strong></p>
                            <p style="margin: 5px 0 0 0; color: #004085;">Your order is being prepared for packing. We'll send you another update once it's ready for shipment with tracking details.</p>
                        </div>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="https://bbqstyle.in/account?tab=orders" style="background: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: 600;">📋 View Order Details</a>
                        </div>
                        <p>Thank you for choosing BBQSTYLE. We appreciate your business and will keep you updated throughout the process!</p>
                    </div>
                    <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
                        <p style="margin: 0 0 10px 0; font-weight: 600;">Need Help?</p>
                        <p style="margin: 5px 0;">📧 <a href="mailto:support@bbqstyle.in" style="color: #007bff;">support@bbqstyle.in</a></p>
                        <p style="margin: 5px 0;">📞 <a href="tel:+918901551059" style="color: #007bff;">+91 8901551059</a></p>
                        <p style="margin: 15px 0 0 0; color: #666; font-size: 12px;">BBQSTYLE - India's Premium Clothing Store</p>
                    </div>
                </div>
            `;
            
            try {
                const emailResult = await sendEmail(orderResult.email, `Order Confirmed - #${orderId}`, emailHtml);
                console.log('Email send result:', emailResult);
                
                if (emailResult.success) {
                    console.log('Email sent successfully!');
                } else {
                    console.error('Email failed:', emailResult.error);
                }
            } catch (emailError) {
                console.error('Email sending error:', emailError);
            }
        } else {
            console.log('No email to send - missing order result or email address');
            if (orderResult) {
                console.log('Order result exists but email is:', orderResult.email);
            }
        }
        
        res.json({ success: true, message: 'Order confirmed and email sent' });
    } catch (error) {
        console.error('Error updating to processing:', error);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

// Update to Ready (sends packed email)
app.put('/api/admin/orders/:orderId/ready', isAuthenticated, async (req, res) => {
    const orderId = req.params.orderId;
    
    try {
        const orderResult = await new Promise((resolve, reject) => {
            const query = `SELECT o.*, u.first_name, u.last_name, u.email FROM orders o JOIN users u ON o.user_id = u.user_id WHERE o.order_id = ?`;
            db.query(query, [orderId], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });
        
        await new Promise((resolve, reject) => {
            db.query('UPDATE orders SET status = "ready" WHERE order_id = ?', [orderId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        if (orderResult && orderResult.email) {
            const emailHtml = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: white;">
                    <div style="text-align: center; padding: 20px; background: #c3a4c6;">
                        <img src="https://bbqstyle.in/src/logos.png" alt="BBQSTYLE" style="max-width: 150px; height: auto;">
                    </div>
                    <div style="padding: 30px;">
                        <h2 style="color: #17a2b8; margin-bottom: 20px;">Order Packed! 📦</h2>
                        <p>Dear ${orderResult.first_name} ${orderResult.last_name},</p>
                        <p>Your order has been carefully packed and is ready for shipment!</p>
                        <div style="background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #17a2b8;">
                            <h3 style="margin: 0 0 15px 0; color: #0c5460;">Order Details:</h3>
                            <p><strong>Order ID:</strong> #${orderId}</p>
                            <p><strong>Status:</strong> PACKED & READY</p>
                            <p><strong>Total Amount:</strong> ₹${orderResult.total_amount}</p>
                        </div>
                        <p>Your order will be shipped soon. We'll send you tracking details once it's dispatched.</p>
                    </div>
                    <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
                        <p style="margin: 0 0 10px 0; font-weight: 600;">Need Help?</p>
                        <p style="margin: 5px 0;">📧 <a href="mailto:support@bbqstyle.in" style="color: #007bff;">support@bbqstyle.in</a></p>
                        <p style="margin: 5px 0;">📞 <a href="tel:+918901551059" style="color: #007bff;">+91 8901551059</a></p>
                        <p style="margin: 15px 0 0 0; color: #666; font-size: 12px;">BBQSTYLE - India's Premium Clothing Store</p>
                    </div>
                </div>
            `;
            
            await sendEmail(orderResult.email, `Order Packed - #${orderId}`, emailHtml);
        }
        
        res.json({ success: true, message: 'Order marked as ready and email sent' });
    } catch (error) {
        console.error('Error updating to ready:', error);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

// Update to Shipped
app.put('/api/admin/orders/:orderId/shipped', isAuthenticated, async (req, res) => {
    const orderId = req.params.orderId;
    const { trackingId, trackingLink, carrier } = req.body;
    
    try {
        const orderResult = await new Promise((resolve, reject) => {
            const query = `SELECT o.*, u.first_name, u.last_name, u.email FROM orders o JOIN users u ON o.user_id = u.user_id WHERE o.order_id = ?`;
            db.query(query, [orderId], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });
        
        await new Promise((resolve, reject) => {
            db.query('UPDATE orders SET status = "shipped" WHERE order_id = ?', [orderId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        if (orderResult && orderResult.email) {
            const emailHtml = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: white;">
                    <div style="text-align: center; padding: 20px; background: #c3a4c6;">
                        <img src="https://bbqstyle.in/src/logos.png" alt="BBQSTYLE" style="max-width: 150px; height: auto;">
                    </div>
                    <div style="padding: 30px;">
                        <h2 style="color: #6f42c1; margin-bottom: 20px;">Order Shipped! 🚚</h2>
                        <p>Dear ${orderResult.first_name} ${orderResult.last_name},</p>
                        <p>Great news! Your order is on its way to you!</p>
                        <div style="background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #6f42c1;">
                            <h3 style="margin: 0 0 15px 0; color: #495057;">Shipping Details:</h3>
                            <p><strong>Order ID:</strong> #${orderId}</p>
                            <p><strong>Status:</strong> SHIPPED</p>
                            <p><strong>Carrier:</strong> ${orderResult.carrier || 'Standard Delivery'}</p>
                            <p><strong>AWB Number:</strong> ${orderResult.tracking_id || 'Will be updated soon'}</p>
                            <p><strong>Total Amount:</strong> ₹${orderResult.total_amount}</p>
                        </div>
                        ${orderResult.tracking_link ? `
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${orderResult.tracking_link}" target="_blank" style="background: linear-gradient(135deg, #007bff 0%, #0056b3 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: 600; box-shadow: 0 4px 12px rgba(0,123,255,0.3); font-size: 16px;">🔍 Track Your Order</a>
                        </div>
                        ` : ''}
                        <p>You'll receive your order soon. Thank you for your patience!</p>
                    </div>
                    <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
                        <p style="margin: 0 0 10px 0; font-weight: 600;">Need Help?</p>
                        <p style="margin: 5px 0;">📧 <a href="mailto:support@bbqstyle.in" style="color: #007bff;">support@bbqstyle.in</a></p>
                        <p style="margin: 5px 0;">📞 <a href="tel:+918901551059" style="color: #007bff;">+91 8901551059</a></p>
                        <p style="margin: 15px 0 0 0; color: #666; font-size: 12px;">BBQSTYLE - India's Premium Clothing Store</p>
                    </div>
                </div>
            `;
            
            await sendEmail(orderResult.email, `Order Shipped - #${orderId}`, emailHtml);
        }
        
        res.json({ success: true, message: 'Order marked as shipped and email sent' });
    } catch (error) {
        console.error('Error updating to shipped:', error);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

// Update to Out for Delivery
app.put('/api/admin/orders/:orderId/out-for-delivery', isAuthenticated, async (req, res) => {
    const orderId = req.params.orderId;
    
    try {
        console.log(`Updating order ${orderId} to out for delivery`);
        
        const orderResult = await new Promise((resolve, reject) => {
            const query = `SELECT o.*, u.first_name, u.last_name, u.email FROM orders o JOIN users u ON o.user_id = u.user_id WHERE o.order_id = ?`;
            db.query(query, [orderId], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });
        
        if (!orderResult) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        await new Promise((resolve, reject) => {
            db.query('UPDATE orders SET status = "out_for_delivery" WHERE order_id = ?', [orderId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        if (orderResult && orderResult.email) {
            const isCOD = orderResult.payment_mode === 'COD';
            const paymentSection = isCOD ? 
                `<div style="background: #fff3cd; padding: 15px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #ffc107; text-align: center;">
                    <p style="margin: 0; color: #856404; font-size: 18px; font-weight: bold;">💵 Keep Cash Ready</p>
                    <p style="margin: 5px 0 0 0; color: #856404; font-size: 16px;">₹${orderResult.total_amount}</p>
                </div>` :
                `<div style="background: #d4edda; padding: 15px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #28a745; text-align: center;">
                    <p style="margin: 0; color: #155724; font-size: 18px; font-weight: bold;">✅ Amount Paid</p>
                    <p style="margin: 5px 0 0 0; color: #155724; font-size: 16px;">₹${orderResult.total_amount}</p>
                </div>`;
            
            const emailHtml = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: white;">
                    <div style="text-align: center; padding: 20px; background: #c3a4c6;">
                        <img src="https://bbqstyle.in/src/logos.png" alt="BBQSTYLE" style="max-width: 150px; height: auto;">
                    </div>
                    <div style="padding: 30px;">
                        <h2 style="color: #ff9500; margin-bottom: 20px;">Out for Delivery! 🚛</h2>
                        <p>Dear ${orderResult.first_name} ${orderResult.last_name},</p>
                        <p>Great news! Your order is out for delivery and will reach you soon!</p>
                        <div style="background: #fff3cd; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #ff9500;">
                            <h3 style="margin: 0 0 15px 0; color: #856404;">Delivery Details:</h3>
                            <p><strong>Order ID:</strong> #${orderId}</p>
                            <p><strong>Status:</strong> OUT FOR DELIVERY</p>
                            <p><strong>Expected Delivery:</strong> Today</p>
                        </div>
                        ${paymentSection}
                        <div style="background: #e7f3ff; padding: 15px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #007bff;">
                            <p style="margin: 0; color: #004085;"><strong>📞 Delivery Instructions:</strong></p>
                            <p style="margin: 5px 0 0 0; color: #004085;">Please keep your phone accessible. Our delivery partner will call you before delivery.</p>
                        </div>
                        <p>Please be available to receive your order. Thank you for choosing BBQSTYLE!</p>
                    </div>
                    <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
                        <p style="margin: 0 0 10px 0; font-weight: 600;">Need Help?</p>
                        <p style="margin: 5px 0;">📧 <a href="mailto:support@bbqstyle.in" style="color: #007bff;">support@bbqstyle.in</a></p>
                        <p style="margin: 5px 0;">📞 <a href="tel:+918901551059" style="color: #007bff;">+91 8901551059</a></p>
                        <p style="margin: 15px 0 0 0; color: #666; font-size: 12px;">BBQSTYLE - India's Premium Clothing Store</p>
                    </div>
                </div>
            `;
            
            const emailResult = await sendEmail(orderResult.email, `Out for Delivery - #${orderId}`, emailHtml);
            console.log('Out for delivery email result:', emailResult);
        }
        
        res.json({ success: true, message: 'Order marked as out for delivery and email sent' });
    } catch (error) {
        console.error('Error updating to out for delivery:', error);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

// Update to Delivered
app.put('/api/admin/orders/:orderId/delivered', isAuthenticated, async (req, res) => {
    const orderId = req.params.orderId;
    
    try {
        const orderResult = await new Promise((resolve, reject) => {
            const query = `SELECT o.*, u.first_name, u.last_name, u.email FROM orders o JOIN users u ON o.user_id = u.user_id WHERE o.order_id = ?`;
            db.query(query, [orderId], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });
        
        await new Promise((resolve, reject) => {
            db.query('UPDATE orders SET status = "delivered" WHERE order_id = ?', [orderId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        if (orderResult && orderResult.email) {
            const emailHtml = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: white;">
                    <div style="text-align: center; padding: 20px; background: #c3a4c6;">
                        <img src="https://bbqstyle.in/src/logos.png" alt="BBQSTYLE" style="max-width: 150px; height: auto;">
                    </div>
                    <div style="padding: 30px;">
                        <h2 style="color: #28a745; margin-bottom: 20px;">Order Delivered! ✅</h2>
                        <p>Dear ${orderResult.first_name} ${orderResult.last_name},</p>
                        <p>Congratulations! Your order has been delivered successfully!</p>
                        <div style="background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #28a745;">
                            <h3 style="margin: 0 0 15px 0; color: #155724;">Order Details:</h3>
                            <p><strong>Order ID:</strong> #${orderId}</p>
                            <p><strong>Status:</strong> DELIVERED</p>
                            <p><strong>Total Amount:</strong> ₹${orderResult.total_amount}</p>
                        </div>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="https://bbqstyle.in/account?tab=orders" style="background: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: 600;">⭐ Write a Review</a>
                        </div>
                        <p>We hope you love your purchase! Your feedback helps us serve you better.</p>
                    </div>
                    <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
                        <p style="margin: 0 0 10px 0; font-weight: 600;">Need Help?</p>
                        <p style="margin: 5px 0;">📧 <a href="mailto:support@bbqstyle.in" style="color: #007bff;">support@bbqstyle.in</a></p>
                        <p style="margin: 5px 0;">📞 <a href="tel:+918901551059" style="color: #007bff;">+91 8901551059</a></p>
                        <p style="margin: 15px 0 0 0; color: #666; font-size: 12px;">BBQSTYLE - India's Premium Clothing Store</p>
                    </div>
                </div>
            `;
            
            await sendEmail(orderResult.email, `Order Delivered - #${orderId}`, emailHtml);
        }
        
        res.json({ success: true, message: 'Order marked as delivered and email sent' });
    } catch (error) {
        console.error('Error updating to delivered:', error);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

// Update to Cancelled
app.put('/api/admin/orders/:orderId/cancelled', isAuthenticated, async (req, res) => {
    const orderId = req.params.orderId;
    const { cancelReason, cancelComment, cancelledBy } = req.body || {};
    
    try {
        console.log(`Cancelling order ${orderId}`);
        
        // Update order status first
        await new Promise((resolve, reject) => {
            db.query('UPDATE orders SET status = "cancelled", cancelled_by = ?, cancellation_reason = ?, cancellation_comments = ? WHERE order_id = ?', 
                [cancelledBy || 'Admin', cancelReason || '', cancelComment || '', orderId], (err, result) => {
                if (err) {
                    console.error('Database update error:', err);
                    reject(err);
                } else if (result.affectedRows === 0) {
                    reject(new Error('Order not found'));
                } else {
                    resolve();
                }
            });
        });
        
        // Get order details for email
        const orderResult = await new Promise((resolve, reject) => {
            const query = `SELECT o.*, u.first_name, u.last_name, u.email FROM orders o LEFT JOIN users u ON o.user_id = u.user_id WHERE o.order_id = ?`;
            db.query(query, [orderId], (err, results) => {
                if (err) {
                    console.error('Database select error:', err);
                    reject(err);
                } else {
                    resolve(results[0] || null);
                }
            });
        });
        
        // Send email if customer exists
        if (orderResult && orderResult.email) {
            try {
                const customerEmailHtml = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: white;">
                        <div style="text-align: center; padding: 20px; background: #c3a4c6;">
                            <img src="https://bbqstyle.in/src/logos.png" alt="BBQSTYLE" style="max-width: 150px; height: auto;">
                        </div>
                        <div style="padding: 30px;">
                            <h2 style="color: #dc3545; margin-bottom: 20px;">Order Cancelled</h2>
                            <p>Dear ${orderResult.first_name || 'Customer'} ${orderResult.last_name || ''},</p>
                            <p>We regret to inform you that your order has been cancelled.</p>
                            <div style="background: #f8d7da; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #dc3545;">
                                <h3 style="margin: 0 0 15px 0; color: #721c24;">Cancellation Details:</h3>
                                <p><strong>Order ID:</strong> #${orderId}</p>
                                <p><strong>Cancelled By:</strong> ${cancelledBy === 'Customer' ? 'You' : 'Seller'}</p>
                                <p><strong>Reason:</strong> ${cancelReason || 'Not specified'}</p>
                                ${cancelComment ? `<p><strong>Comment:</strong> ${cancelComment}</p>` : ''}
                            </div>
                            <p>If you paid online, your refund will be processed within 5-7 business days.</p>
                            <div style="background: #e7f3ff; padding: 15px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #007bff; text-align: center;">
                                <p style="margin: 0 0 10px 0; color: #004085; font-weight: 600;">Cancelled by mistake?</p>
                                <a href="https://bbqstyle.in/account?tab=orders" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: 600;">🛒 Reorder Now</a>
                            </div>
                        </div>
                        <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
                            <p style="margin: 0 0 10px 0; font-weight: 600;">Need Help?</p>
                            <p style="margin: 5px 0;">📧 <a href="mailto:support@bbqstyle.in" style="color: #007bff;">support@bbqstyle.in</a></p>
                            <p style="margin: 5px 0;">📞 <a href="tel:+918901551059" style="color: #007bff;">+91 8901551059</a></p>
                            <p style="margin: 15px 0 0 0; color: #666; font-size: 12px;">BBQSTYLE - India's Premium Clothing Store</p>
                        </div>
                    </div>
                `;
                
                await sendEmail(orderResult.email, `Order Cancelled - #${orderId}`, customerEmailHtml);
                console.log('Cancellation email sent successfully');
            } catch (emailError) {
                console.error('Email sending failed:', emailError);
                // Don't fail the API if email fails
            }
        }
        
        // Send admin notification email
        try {
            const adminEmailHtml = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: white;">
                        <div style="text-align: center; padding: 20px; background: #c3a4c6;">
                            <img src="https://bbqstyle.in/src/logos.png" alt="BBQSTYLE" style="max-width: 150px; height: auto;">
                        </div>
                        <div style="padding: 30px;">
                            <h2 style="color: #dc3545; margin-bottom: 20px;">Order Cancelled</h2>
                            <p>Dear ${orderResult.first_name || 'Customer'} ${orderResult.last_name || ''},</p>
                            <p>We regret to inform you that your order has been cancelled.</p>
                            <div style="background: #f8d7da; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #dc3545;">
                                <h3 style="margin: 0 0 15px 0; color: #721c24;">Cancellation Details:</h3>
                                <p><strong>Order ID:</strong> #${orderId}</p>
                                <p><strong>Cancelled By:</strong> ${cancelledBy === 'Customer' ? 'You' : 'Seller'}</p>
                                <p><strong>Reason:</strong> ${cancelReason || 'Not specified'}</p>
                                ${cancelComment ? `<p><strong>Comment:</strong> ${cancelComment}</p>` : ''}
                            </div>
                            <p>If you paid online, your refund will be processed within 5-7 business days.</p>
                            <div style="background: #e7f3ff; padding: 15px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #007bff; text-align: center;">
                                <p style="margin: 0 0 10px 0; color: #004085; font-weight: 600;">View Order</p>
                                <a href="https://admin.bbqstyle.in/?tab=orders" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: 600;">Click Here</a>
                            </div>
                        </div>
                        <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
                            <p style="margin: 0 0 10px 0; font-weight: 600;">Need Help?</p>
                            <p style="margin: 5px 0;">📧 <a href="mailto:support@bbqstyle.in" style="color: #007bff;">support@bbqstyle.in</a></p>
                            <p style="margin: 5px 0;">📞 <a href="tel:+918901551059" style="color: #007bff;">+91 8901551059</a></p>
                            <p style="margin: 15px 0 0 0; color: #666; font-size: 12px;">BBQSTYLE - India's Premium Clothing Store</p>
                        </div>
                    </div>
                `;
            
            await sendEmail('hardevi143@gmail.com', `Order Cancelled - #${orderId}`, adminEmailHtml);
            console.log('Admin cancellation notification sent');
        } catch (adminEmailError) {
            console.error('Admin email sending failed:', adminEmailError);
        }
        
        res.json({ success: true, message: 'Order cancelled successfully' });
    } catch (error) {
        console.error('Error cancelling order:', error);
        res.status(500).json({ error: 'Failed to cancel order', details: error.message });
    }
});

// Update to Out of Stock
app.put('/api/admin/orders/:orderId/out-of-stock', isAuthenticated, async (req, res) => {
    const orderId = req.params.orderId;
    
    try {
        const orderResult = await new Promise((resolve, reject) => {
            const query = `SELECT o.*, u.first_name, u.last_name, u.email FROM orders o JOIN users u ON o.user_id = u.user_id WHERE o.order_id = ?`;
            db.query(query, [orderId], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });
        
        await new Promise((resolve, reject) => {
            db.query('UPDATE orders SET status = "out_of_stock" WHERE order_id = ?', [orderId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        if (orderResult && orderResult.email) {
            const emailHtml = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: white;">
                    <div style="text-align: center; padding: 20px; background: #c3a4c6;">
                        <img src="https://bbqstyle.in/src/logos.png" alt="BBQSTYLE" style="max-width: 150px; height: auto;">
                    </div>
                    <div style="padding: 30px;">
                        <h2 style="color: #ffc107; margin-bottom: 20px;">Order On Hold ⏳</h2>
                        <p>Dear ${orderResult.first_name} ${orderResult.last_name},</p>
                        <p>We're sorry to inform you that some items in your order are currently out of stock.</p>
                        <div style="background: #fff3cd; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #ffc107;">
                            <h3 style="margin: 0 0 15px 0; color: #856404;">Order Details:</h3>
                            <p><strong>Order ID:</strong> #${orderId}</p>
                            <p><strong>Status:</strong> ON HOLD</p>
                            <p><strong>Total Amount:</strong> ₹${orderResult.total_amount}</p>
                        </div>
                        <p>We'll notify you as soon as the items are back in stock and ready to ship.</p>
                    </div>
                    <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
                        <p style="margin: 0 0 10px 0; font-weight: 600;">Need Help?</p>
                        <p style="margin: 5px 0;">📧 <a href="mailto:support@bbqstyle.in" style="color: #007bff;">support@bbqstyle.in</a></p>
                        <p style="margin: 5px 0;">📞 <a href="tel:+918901551059" style="color: #007bff;">+91 8901551059</a></p>
                        <p style="margin: 15px 0 0 0; color: #666; font-size: 12px;">BBQSTYLE - India's Premium Clothing Store</p>
                    </div>
                </div>
            `;
            
            await sendEmail(orderResult.email, `Order On Hold - #${orderId}`, emailHtml);
        }
        
        res.json({ success: true, message: 'Order marked as out of stock and email sent' });
    } catch (error) {
        console.error('Error updating to out of stock:', error);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

// Keep the original status update endpoint for backward compatibility
app.put('/api/admin/orders/:orderId/status', isAuthenticated, async (req, res) => {
    const orderId = req.params.orderId;
    const { status, cancelledBy, cancelReason, cancelComment, trackingId, trackingLink, carrier } = req.body;
    
    if (!status) {
        return res.status(400).json({ error: 'Status is required' });
    }

    try {
        // Get order and user details
        const orderQuery = `
            SELECT o.*, u.first_name, u.last_name, u.email 
            FROM orders o 
            JOIN users u ON o.user_id = u.user_id 
            WHERE o.order_id = ?
        `;
        
        const orderResult = await new Promise((resolve, reject) => {
            db.query(orderQuery, [orderId], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });

        if (!orderResult) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Update order status with additional fields
        const updateFields = ['status = ?'];
        const updateValues = [status];
        
        if (status === 'cancelled') {
            updateFields.push('cancelled_by = ?', 'cancellation_reason = ?', 'cancellation_comments = ?');
            updateValues.push(cancelledBy || 'Admin', cancelReason || '', cancelComment || '');
        }
        
        if (status === 'shipped') {
            updateFields.push('tracking_id = ?', 'tracking_link = ?', 'carrier = ?');
            updateValues.push(trackingId || '', trackingLink || '', carrier || '');
        }
        
        updateValues.push(orderId);
        
        await new Promise((resolve, reject) => {
            db.query(`UPDATE orders SET ${updateFields.join(', ')} WHERE order_id = ?`, updateValues, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Send status update email to customer
        if (orderResult.email) {
            console.log('Sending status update email to:', orderResult.email);
            const statusMessages = {
                'processing': { title: 'Order Confirmed', message: 'Your order has been confirmed and is being prepared for packing.', color: '#28a745' },
                'ready': { title: 'Order Packed', message: 'Your order has been packed and is ready for shipment.', color: '#17a2b8' },
                'shipped': { title: 'Order Shipped', message: 'Your order is on its way to you!', color: '#6f42c1' },
                'delivered': { title: 'Order Delivered', message: 'Your order has been delivered successfully!', color: '#28a745' },
                'cancelled': { title: 'Order Cancelled', message: `Your order has been cancelled${cancelledBy ? ` by ${cancelledBy}` : ''}.`, color: '#dc3545' },
                'out_of_stock': { title: 'Order On Hold', message: 'Some items in your order are currently out of stock. We will notify you once they are available.', color: '#ffc107' }
            };

            const statusInfo = statusMessages[status] || { title: 'Order Status Updated', message: `Your order status has been updated to: ${status}`, color: '#6c757d' };

            const statusEmailHtml = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: ${statusInfo.color};">${statusInfo.title} - BBQSTYLE</h2>
                    <p>Dear ${orderResult?.first_name || 'Customer'} ${orderResult?.last_name || ''},</p>
                    <p>${statusInfo.message}</p>
                    <div style="background: #f8f9fa; padding: 15px; margin: 20px 0; border-radius: 5px; border-left: 4px solid ${statusInfo.color};">
                        <h3 style="margin: 0 0 10px 0;">Order Details:</h3>
                        <p><strong>Order ID:</strong> #${orderId}</p>
                        <p><strong>Status:</strong> ${status.toUpperCase()}</p>
                        <p><strong>Total Amount:</strong> ₹${orderResult.total_amount}</p>
                    </div>
                    ${status === 'delivered' ? '<p>We hope you love your purchase! Please consider leaving a review.</p>' : ''}
                    <p>Thank you for shopping with BBQSTYLE!</p>
                    <hr style="margin: 30px 0;">
                    <p style="color: #666; font-size: 12px;">BBQSTYLE - India's Premium Clothing Store</p>
                </div>
            `;

            try {
                const result = await sendEmail(
                    orderResult.email,
                    `${statusInfo.title} - Order #${orderId}`,
                    statusEmailHtml
                );
                console.log('Status email result:', result);
                
                // Store message ID for threading
                if (result.success && result.messageId) {
                    db.query('UPDATE orders SET last_email_id = ? WHERE order_id = ?', [result.messageId, orderId], () => {});
                }
            } catch (emailError) {
                console.error('Error sending status update email:', emailError);
            }
        }

        // Send cancellation notification to admin if cancelled
        if (status === 'cancelled') {
            console.log('Sending cancellation notification to admin');
            const adminEmailHtml = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="text-align: center; margin-bottom: 20px;"><img src="cid:logo" alt="BBQSTYLE" style="max-width: 200px; height: auto;"></div>
                    <h2 style="color: #dc3545;">Order Cancelled - BBQSTYLE</h2>
                    <div style="background: #f8d7da; padding: 20px; margin: 20px 0; border-radius: 5px; border-left: 4px solid #dc3545;">
                        <h3 style="margin: 0 0 15px 0;">Cancelled Order Details:</h3>
                        <p><strong>Order ID:</strong> #${orderId}</p>
                        <p><strong>Customer:</strong> ${orderResult?.first_name || 'N/A'} ${orderResult?.last_name || ''}</p>
                        <p><strong>Email:</strong> ${orderResult?.email || 'N/A'}</p>
                        <p><strong>Total Amount:</strong> ₹${orderResult.total_amount}</p>
                        <p><strong>Cancelled By:</strong> ${cancelledBy || 'System'}</p>
                        <p><strong>Cancellation Date:</strong> ${new Date().toLocaleString()}</p>
                    </div>
                </div>
            `;

            try {
                await sendEmail(
                    'hardevi143@gmail.com',
                    `Order Cancelled - #${orderId}`,
                    adminEmailHtml
                );
                console.log('Admin cancellation email sent');
            } catch (emailError) {
                console.error('Error sending admin cancellation email:', emailError);
            }
        }

        res.json({ success: true, message: 'Order status updated successfully' });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

// Cancel order by customer
app.put('/api/orders/:orderId/cancel', authenticateToken, async (req, res) => {
    const orderId = req.params.orderId;
    const userId = req.userId;

    try {
        // Verify order belongs to user and can be cancelled
        const orderQuery = `
            SELECT o.*, u.first_name, u.last_name, u.email 
            FROM orders o 
            JOIN users u ON o.user_id = u.user_id 
            WHERE o.order_id = ? AND o.user_id = ? AND o.status IN ('pending', 'confirmed')
        `;
        
        const orderResult = await new Promise((resolve, reject) => {
            db.query(orderQuery, [orderId, userId], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });

        if (!orderResult) {
            return res.status(404).json({ error: 'Order not found or cannot be cancelled' });
        }

        // Update order status to cancelled
        await new Promise((resolve, reject) => {
            db.query('UPDATE orders SET status = ? WHERE order_id = ?', ['cancelled', orderId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Send cancellation email to customer
        if (orderResult.email) {
            console.log('Sending customer cancellation email to:', orderResult.email);
            const cancelEmailHtml = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: white;">
                    <div style="text-align: center; padding: 20px; background: #c3a4c6;">
                        <img src="https://bbqstyle.in/src/logos.png" alt="BBQSTYLE" style="max-width: 150px; height: auto;">
                    </div>
                    <div style="padding: 30px;">
                        <h2 style="color: #dc3545; margin-bottom: 20px;">Order Cancelled 🚫</h2>
                        <p>Dear ${orderResult?.first_name || 'Customer'} ${orderResult?.last_name || ''},</p>
                        <p>Your order has been successfully cancelled as requested.</p>
                        <div style="background: #f8d7da; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #dc3545;">
                            <h3 style="margin: 0 0 15px 0; color: #721c24;">Cancelled Order Details:</h3>
                            <p><strong>Order ID:</strong> #${orderId}</p>
                            <p><strong>Total Amount:</strong> ₹${orderResult.total_amount}</p>
                            <p><strong>Cancelled By:</strong> You</p>
                            <p><strong>Cancellation Date:</strong> ${new Date().toLocaleString()}</p>
                        </div>
                        <div style="background: #d1ecf1; padding: 15px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #17a2b8;">
                            <p style="margin: 0; color: #0c5460;"><strong>💰 Refund Information:</strong> If you paid online, your refund will be processed within 5-7 business days.</p>
                        </div>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="https://bbqstyle.in" style="background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: 600;">🛒 Continue Shopping</a>
                        </div>
                        <p>Thank you for choosing BBQSTYLE!</p>
                    </div>
                    <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
                        <p style="margin: 0 0 10px 0; font-weight: 600;">Need Help?</p>
                        <p style="margin: 5px 0;">📧 <a href="mailto:support@bbqstyle.in" style="color: #007bff;">support@bbqstyle.in</a></p>
                        <p style="margin: 5px 0;">📞 <a href="tel:+918901551059" style="color: #007bff;">+91 8901551059</a></p>
                        <p style="margin: 15px 0 0 0; color: #666; font-size: 12px;">BBQSTYLE - India's Premium Clothing Store</p>
                    </div>
                </div>
            `;

            try {
                await sendEmail(
                    orderResult.email,
                    `Order Cancelled - #${orderId}`,
                    cancelEmailHtml
                );
                console.log('Customer cancellation email sent');
            } catch (emailError) {
                console.error('Error sending customer cancellation email:', emailError);
            }
        }

        // Send cancellation notification to admin
        const adminEmailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #dc3545;">Order Cancelled by Customer - BBQSTYLE</h2>
                <div style="background: #f8d7da; padding: 20px; margin: 20px 0; border-radius: 5px; border-left: 4px solid #dc3545;">
                    <h3 style="margin: 0 0 15px 0;">Cancelled Order Details:</h3>
                    <p><strong>Order ID:</strong> #${orderId}</p>
                    <p><strong>Customer:</strong> ${orderResult?.first_name || 'N/A'} ${orderResult?.last_name || ''}</p>
                    <p><strong>Email:</strong> ${orderResult?.email || 'N/A'}</p>
                    <p><strong>Total Amount:</strong> ₹${orderResult.total_amount}</p>
                    <p><strong>Cancelled By:</strong> Customer</p>
                    <p><strong>Cancellation Date:</strong> ${new Date().toLocaleString()}</p>
                </div>
            </div>
        `;

        try {
            await sendEmail(
                'hardevi143@gmail.com',
                `Order Cancelled by Customer - #${orderId}`,
                adminEmailHtml
            );
            console.log('Admin notification email sent for customer cancellation');
        } catch (emailError) {
            console.error('Error sending admin notification email:', emailError);
        }

        res.json({ success: true, message: 'Order cancelled successfully' });
    } catch (error) {
        console.error('Error cancelling order:', error);
        res.status(500).json({ error: 'Failed to cancel order' });
    }
});

// Get invoice template
app.get('/api/admin/invoice-template', isAuthenticated, (req, res) => {
    const query = 'SELECT * FROM invoice_template ORDER BY id DESC LIMIT 1';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ success: false, error: 'Database error' });
        }
        
        if (results.length === 0) {
            return res.json({ 
                success: true, 
                template: {
                    company_name: '',
                    company_address: '',
                    company_gstin: '',
                    company_email: '',
                    company_phone: '',
                    invoice_prefix: 'INV-',
                    invoice_theme: 'classic',
                    invoice_footer: 'Thank you for your business!',
                    invoice_terms: ''
                }
            });
        }
        
        res.json({ success: true, template: results[0] });
    });
});

// Save invoice template
app.put('/api/admin/invoice-template', isAuthenticated, (req, res) => {
    const {
        company_name,
        company_address,
        company_gstin,
        company_email,
        company_phone,
        invoice_prefix,
        invoice_theme,
        invoice_footer,
        invoice_terms
    } = req.body;
    
    // Check if template exists
    const checkQuery = 'SELECT id FROM invoice_template LIMIT 1';
    
    db.query(checkQuery, (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ success: false, error: 'Database error' });
        }
        
        if (results.length === 0) {
            // Insert new template
            const insertQuery = `
                INSERT INTO invoice_template 
                (company_name, company_address, company_gstin, company_email, company_phone, invoice_prefix, invoice_theme, invoice_footer, invoice_terms)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            db.query(insertQuery, [
                company_name, company_address, company_gstin, company_email, 
                company_phone, invoice_prefix, invoice_theme, invoice_footer, invoice_terms
            ], (insertErr) => {
                if (insertErr) {
                    console.error('Database error:', insertErr);
                    return res.status(500).json({ success: false, error: 'Database error' });
                }
                res.json({ success: true, message: 'Template created successfully' });
            });
        } else {
            // Update existing template
            const updateQuery = `
                UPDATE invoice_template 
                SET company_name = ?, company_address = ?, company_gstin = ?, company_email = ?, 
                    company_phone = ?, invoice_prefix = ?, invoice_theme = ?, invoice_footer = ?, invoice_terms = ?
                WHERE id = ?
            `;
            
            db.query(updateQuery, [
                company_name, company_address, company_gstin, company_email,
                company_phone, invoice_prefix, invoice_theme, invoice_footer, invoice_terms,
                results[0].id
            ], (updateErr) => {
                if (updateErr) {
                    console.error('Database error:', updateErr);
                    return res.status(500).json({ success: false, error: 'Database error' });
                }
                res.json({ success: true, message: 'Template updated successfully' });
            });
        }
    });
});

// Get addresses for user
app.get('/api/addresses', authenticateToken, (req, res) => {
    const userId = req.userId;

    db.query('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, address_id DESC', [userId], (err, results) => {
        if (err) {
            console.error('Database error fetching addresses:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        res.json({ success: true, addresses: results });
    });
});

// Settings - upload favicon
app.post('/api/settings/favicon', isAuthenticated, upload.single('favicon'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    // Check if file is a valid image format
    const allowedMimeTypes = ['image/x-icon', 'image/vnd.microsoft.icon', 'image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ error: 'Invalid file format. Please upload .ico, .png, .jpg, or .jpeg files.' });
    }

    // Check file size (max 1MB)
    if (req.file.size > 1024 * 1024) {
        return res.status(400).json({ error: 'File too large. Maximum size is 1MB.' });
    }

    console.log('Favicon uploaded successfully:', {
        filename: req.file.filename,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        destination: req.file.destination
    });

    res.json({
        message: 'Favicon updated successfully',
        filename: req.file.filename,
        path: req.file.path
    });
});

// Reviews CRUD

// Get all reviews with optional star filter and search
app.get('/api/reviews', isAuthenticated, (req, res) => {
    const starFilter = req.query.stars;
    const search = req.query.search;
    let query = 'SELECT * FROM reviews';
    const params = [];

    if (starFilter && search) {
        query += ' WHERE star_rating = ? AND (product_id LIKE ? OR review_text LIKE ?)';
        params.push(starFilter, `%${search}%`, `%${search}%`);
    } else if (starFilter) {
        query += ' WHERE star_rating = ?';
        params.push(starFilter);
    } else if (search) {
        query += ' WHERE product_id LIKE ? OR review_text LIKE ?';
        params.push(`%${search}%`, `%${search}%`);
    }

    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

// Subscribers API endpoint
app.get('/api/subscribers', isAuthenticated, (req, res) => {
    db.query('SELECT sr_no, customer_name, email_id FROM subscribers', (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

// Add new subscriber (no authentication required)
app.post('/api/subscribers', async (req, res) => {
    const { customer_name, email_id } = req.body;
    if (!customer_name || !email_id) {
        return res.status(400).json({ error: 'Name and email are required' });
    }

    // Check if email already exists
    db.query('SELECT * FROM subscribers WHERE email_id = ?', [email_id], async (checkErr, existing) => {
        if (checkErr) {
            console.error('Database check error:', checkErr);
            return res.status(500).json({ error: 'Database error' });
        }

        if (existing.length > 0) {
            return res.status(409).json({ error: 'Email already subscribed' });
        }

        const query = 'INSERT INTO subscribers (customer_name, email_id) VALUES (?, ?)';
        db.query(query, [customer_name, email_id], async (err, result) => {
            if (err) {
                console.error('Database insert error:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            // Send welcome email to subscriber
            try {
                const welcomeEmailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: white;">
                <div style="text-align: center; padding: 20px; background: #c3a4c6;">
                    <img src="https://bbqstyle.in/src/logos.png" alt="BBQSTYLE" style="max-width: 150px; height: auto;">
                </div>
                <div style="padding: 30px;">
                    <h2 style="color: #007bff; margin-bottom: 20px;">📧 Welcome to BBQSTYLE Newsletter!</h2>
                    <div style="background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #007bff;">
                        <p>Dear ${customer_name},</p>
                        <p>Thank you for subscribing to our newsletter! You'll be the first to know about our latest collections, exclusive offers, and style tips.</p>
                        <p>Stay tuned for exciting updates from BBQSTYLE!</p>
                    </div>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="https://bbqstyle.in" style="background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: 600;">🛒 Shop Now</a>
                    </div>
                </div>
                <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
                    <p style="margin: 0 0 10px 0; font-weight: 600;">Stay Connected</p>
                    <p style="margin: 5px 0;">📧 <a href="mailto:support@bbqstyle.in" style="color: #007bff;">support@bbqstyle.in</a></p>
                    <p style="margin: 5px 0;">📞 <a href="tel:+918901551059" style="color: #007bff;">+91 8901551059</a></p>
                    <p style="margin: 15px 0 0 0; color: #666; font-size: 12px;">BBQSTYLE - India's Premium Clothing Store</p>
                    <p style="margin: 10px 0 0 0; font-size: 10px; color: #999;">
                        <a href="#" style="color: #999;">Unsubscribe</a>
                    </p>
                </div>
            </div>
        `;

                await sendEmail(
                    email_id,
                    'Welcome to BBQSTYLE Newsletter!',
                    welcomeEmailHtml
                );
            } catch (emailError) {
                console.error('Error sending welcome email:', emailError);
            }

            res.status(201).json({ message: 'Subscriber added', subscriberId: result.insertId });
        });
    });
});

// Contact form endpoint
app.post('/api/contact', async (req, res) => {
    const { name, email, subject, message } = req.body;
    
    if (!name || !email || !subject || !message) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        // Send email to admin
        const contactEmailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">New Contact Form Submission</h2>
                <div style="background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 5px;">
                    <p><strong>Name:</strong> ${name}</p>
                    <p><strong>Email:</strong> ${email}</p>
                    <p><strong>Subject:</strong> ${subject}</p>
                    <p><strong>Message:</strong></p>
                    <div style="background: white; padding: 15px; border-left: 4px solid #007bff; margin-top: 10px;">
                        ${message.replace(/\n/g, '<br>')}
                    </div>
                </div>
                <p style="color: #666; font-size: 12px;">This message was sent from the BBQSTYLE contact form.</p>
            </div>
        `;

        await sendEmail(
            process.env.ADMIN_EMAIL || process.env.SMTP_USER,
            `Contact Form: ${subject}`,
            contactEmailHtml
        );

        // Send confirmation email to user
        const confirmationEmailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Thank you for contacting BBQSTYLE!</h2>
                <p>Dear ${name},</p>
                <p>We have received your message and will get back to you within 24-48 hours.</p>
                <div style="background: #f8f9fa; padding: 15px; margin: 20px 0; border-radius: 5px;">
                    <p><strong>Your message:</strong></p>
                    <p style="font-style: italic;">${message}</p>
                </div>
                <p>Thank you for reaching out to us!</p>
                <hr style="margin: 30px 0;">
                <p style="color: #666; font-size: 12px;">BBQSTYLE - India's Premium Clothing Store</p>
            </div>
        `;

        await sendEmail(
            email,
            'Thank you for contacting BBQSTYLE',
            confirmationEmailHtml
        );

        res.json({ success: true, message: 'Message sent successfully' });
    } catch (error) {
        console.error('Error sending contact form email:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Add a new review
app.post('/api/reviews', authenticateToken, (req, res) => {
    try {
        const { review_text, star_rating, product_id, order_item_id, customer_name, publish_status } = req.body;
        const userId = req.userId;

        if (!review_text || !star_rating || !product_id) {
            return res.status(400).json({ success: false, message: 'Review text, star rating, and product ID are required' });
        }

        if (![1, 2, 3, 4, 5].includes(Number(star_rating))) {
            return res.status(400).json({ success: false, message: 'Star rating must be between 1 and 5' });
        }

        const publish = publish_status === true || publish_status === 1 ? 1 : 0;
        
        // Use customer_name from request if provided (backend), otherwise get first_name from database (frontend)
        if (customer_name) {
            // Backend request - use provided customer_name
            db.query(
                'INSERT INTO reviews (review_text, star_rating, customer_name, user_id, product_id, order_item_id, publish_status) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [review_text, star_rating, customer_name, userId, product_id, order_item_id || null, publish],
                (err, result) => {
                    if (err) {
                        console.error('Database insert error:', err);
                        return res.status(500).json({ success: false, message: 'Database error' });
                    }
                    res.json({ success: true, message: 'Review submitted successfully!', reviewId: result.insertId });
                }
            );
        } else {
            // Frontend request - get first_name from database
            db.query('SELECT first_name FROM users WHERE user_id = ?', [userId], (userErr, userResults) => {
                if (userErr) {
                    console.error('Error fetching user:', userErr);
                    return res.status(500).json({ success: false, message: 'Database error' });
                }

                const customerName = userResults.length > 0 ? userResults[0].first_name : 'Anonymous';

                db.query(
                    'INSERT INTO reviews (review_text, star_rating, customer_name, user_id, product_id, order_item_id, publish_status) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [review_text, star_rating, customerName, userId, product_id, order_item_id || null, publish],
                    (err, result) => {
                        if (err) {
                            console.error('Database insert error:', err);
                            return res.status(500).json({ success: false, message: 'Database error' });
                        }
                        res.json({ success: true, message: 'Review submitted successfully!', reviewId: result.insertId });
                    }
                );
            });
        }
    } catch (error) {
        console.error('Reviews endpoint error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Public API endpoint for adding a new review
app.post('/api/public/reviews', authenticateToken, (req, res) => {
    const { review_text, star_rating, product_id, order_id } = req.body;
    const userId = req.userId;

    if (!review_text || !star_rating || !product_id) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    if (![1, 2, 3, 4, 5].includes(Number(star_rating))) {
        return res.status(400).json({ error: 'Star rating must be between 1 and 5' });
    }
    // For public submissions, set publish_status to 0 (unpublished) by default
    const publish_status = 0;
    db.query(
        'INSERT INTO reviews (review_text, star_rating, publish_status, product_id, user_id, order_id) VALUES (?, ?, ?, ?, ?, ?)',
        [review_text, star_rating, publish_status, product_id, userId, order_id || null],
        (err, result) => {
            if (err) {
                console.error('Database insert error for public review:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.status(201).json({ message: 'Review submitted successfully for moderation.', reviewId: result.insertId });
        }
    );
});

// Edit a review
app.put('/api/reviews/:id', authenticateToken, (req, res) => {
    const reviewId = req.params.id;
    const { product_id, review_text, star_rating, publish_status } = req.body;
    const userId = req.userId;

    if (!product_id || !review_text || !star_rating) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    if (![1, 2, 3, 4, 5].includes(Number(star_rating))) {
        return res.status(400).json({ error: 'Star rating must be between 1 and 5' });
    }
    const publish = publish_status ? 1 : 0;
    db.query(
        'UPDATE reviews SET product_id = ?, review_text = ?, star_rating = ?, publish_status = ? WHERE review_id = ?',
        [product_id, review_text, star_rating, publish, reviewId],
        (err, result) => {
            if (err) {
                console.error('Database update error:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            if (result.affectedRows === 0) return res.status(404).json({ error: 'Review not found' });
            res.json({ message: 'Review updated' });
        }
    );
});

// Delete a review
app.delete('/api/reviews/:id', isAuthenticated, (req, res) => {
    const reviewId = req.params.id;
    db.query('DELETE FROM reviews WHERE review_id = ?', [reviewId], (err, result) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Review not found' });
        res.json({ message: 'Review deleted' });
    });
});

// Toggle publish/unpublish status
app.patch('/api/reviews/:id/publish', isAuthenticated, (req, res) => {
    const reviewId = req.params.id;
    const { publish_status } = req.body;
    const publish = publish_status ? 1 : 0;
    db.query('UPDATE reviews SET publish_status = ? WHERE review_id = ?', [publish, reviewId], (err, result) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Review not found' });
        res.json({ message: 'Publish status updated' });
    });
});

// Public API endpoint for new arrivals
app.get('/api/public/new-arrivals', (req, res) => {
    // Fetch latest 10 products with one image each
    const query = `
        SELECT p.*, c.category_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN product_images pi ON p.product_id = pi.product_id
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
        LIMIT 10
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

// Public API endpoint for published reviews
app.get('/api/public/reviews', (req, res) => {
    const productId = req.query.product_id;
    let query = 'SELECT r.*, u.first_name FROM reviews r LEFT JOIN users u ON r.user_id = u.user_id WHERE r.publish_status = 1';
    const params = [];

    if (productId) {
        query += ' AND r.product_id = ?';
        params.push(productId);
    }

    query += ' ORDER BY r.review_id DESC LIMIT 8';

    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

// Account page API endpoint for all reviews (published and unpublished)
app.get('/api/account/reviews', authenticateToken, (req, res) => {
    const productId = req.query.product_id;
    const userId = req.userId;
    let query = 'SELECT r.*, u.first_name FROM reviews r LEFT JOIN users u ON r.user_id = u.user_id WHERE r.user_id = ?';
    const params = [userId];

    if (productId) {
        query += ' AND r.product_id = ?';
        params.push(productId);
    }

    query += ' ORDER BY r.review_id DESC';

    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

// Public API endpoint for getting a single product by ID
app.get('/api/public/products/:id', (req, res) => {
    const productId = req.params.id;
    const query = `
        SELECT p.*, c.category_name, col.collection_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        WHERE p.product_id = ?
    `;
    db.query(query, [productId], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (results.length === 0) return res.status(404).json({ error: 'Product not found' });

        try {
            const product = results[0];
            try {
                if (product.variant_type && typeof product.variant_type === 'string') {
                    product.variant_type = JSON.parse(product.variant_type);
                }
                if (product.variant_details && typeof product.variant_details === 'string') {
                    product.variant_details = JSON.parse(product.variant_details);
                }
            } catch (e) {
                console.error('Error parsing variant data for product:', product.product_id, e);
            }

            db.query(
                'SELECT variant_detail, image_path, stock FROM product_images WHERE product_id = ?',
                [productId],
                (imgErr, images) => {
                    if (imgErr) {
                        console.error('Error fetching product images:', imgErr);
                        return res.json(product);
                    }
                    try {
                        product.images = images;
                        res.json(product);
                    } catch (e) {
                        console.error('Error processing product images:', e);
                        res.json(product);
                    }
                }
            );
        } catch (e) {
            console.error('Error processing product:', e);
            res.status(500).json({ error: 'Error processing product' });
        }
    });
});

// Public API endpoint for all products in women's collection without limit
app.get('/api/public/products', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN product_images pi ON p.product_id = pi.product_id
        WHERE LOWER(col.collection_name) = "women's collection"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

// Public API endpoint for all products in dress material without limit
app.get('/api/public/product/dm', (req, res) => {
    // First, let's check if there are any products at all
    db.query('SELECT COUNT(*) as count FROM products', (err, result) => {
        if (err) {
            console.error('Database error checking products count:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        console.log('Total products in database:', result[0].count);

        // Check categories
        db.query('SELECT category_id, category_name FROM categories', (err, categories) => {
            if (err) {
                console.error('Database error fetching categories:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            console.log('Categories:', categories);

            // Check collections
            db.query('SELECT collection_id, collection_name FROM collections', (err, collections) => {
                if (err) {
                    console.error('Database error fetching collections:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                console.log('Collections:', collections);

                // Check products with their categories and collections
                db.query(`
                    SELECT p.product_id, p.title, c.category_name, col.collection_name
                    FROM products p
                    LEFT JOIN categories c ON p.category_id = c.category_id
                    LEFT JOIN collections col ON p.collection_id = col.collection_id
                    LIMIT 10
                `, (err, products) => {
                    if (err) {
                        console.error('Database error fetching products with categories and collections:', err);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    console.log('Sample products with categories and collections:', products);

                    // Now execute the main query
                    const query = `
                        SELECT p.*, c.category_name, col.collection_name, pi.image_path
                        FROM products p
                        LEFT JOIN categories c ON p.category_id = c.category_id
                        LEFT JOIN collections col ON p.collection_id = col.collection_id
                        LEFT JOIN (
                            SELECT product_id, MIN(image_path) as image_path
                            FROM product_images
                            GROUP BY product_id
                        ) pi ON p.product_id = pi.product_id
                        WHERE LOWER(c.category_name) = "dress materials"
                        and
                        LOWER(col.collection_name) = "women's collection"
                        GROUP BY p.product_id
                        ORDER BY p.product_id DESC
                    `;
                    console.log('Executing query for /api/public/products/dm');
                    db.query(query, (err, results) => {
                        if (err) {
                            console.error('Database error for /api/public/products/dm:', err);
                            return res.status(500).json({ error: 'Database error' });
                        }
                        console.log('Products in dress materials category:', results);
                        res.json(results);
                    });
                });
            });
        });
    });
});
app.get('/api/public/products/dm/cdm', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN (
            SELECT product_id, MIN(image_path) as image_path
            FROM product_images
            GROUP BY product_id
        ) pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "dress materials"
        and
        LOWER(col.collection_name) = "women's collection"
        and
        LOWER(p.title) LIKE "%cotton%"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});
app.get('/api/public/products/dm/rdm', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN (
            SELECT product_id, MIN(image_path) as image_path
            FROM product_images
            GROUP BY product_id
        ) pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "dress materials"
        and
        LOWER(col.collection_name) = "women's collection"
        and
        LOWER(p.title) LIKE "%rayon%"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});
app.get('/api/public/products/dm/gdm', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN (
            SELECT product_id, MIN(image_path) as image_path
            FROM product_images
            GROUP BY product_id
        ) pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "dress materials"
        and
        LOWER(col.collection_name) = "women's collection"
        and
        LOWER(p.title) LIKE "%georgette%"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});
app.get('/api/public/products/dm/sdm', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN (
            SELECT product_id, MIN(image_path) as image_path
            FROM product_images
            GROUP BY product_id
        ) pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "dress materials"
        and
        LOWER(col.collection_name) = "women's collection"
        and
        LOWER(p.title) LIKE "%silk%"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});
app.get('/api/public/products/dm/mdm', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN (
            SELECT product_id, MIN(image_path) as image_path
            FROM product_images
            GROUP BY product_id
        ) pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "dress materials"
        and
        LOWER(col.collection_name) = "women's collection"
        and
        LOWER(p.title) LIKE "%muslin%"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});
app.get('/api/public/products/dm/wdm', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN (
            SELECT product_id, MIN(image_path) as image_path
            FROM product_images
            GROUP BY product_id
        ) pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "dress materials"
        and
        LOWER(col.collection_name) = "women's collection"
        and
        LOWER(p.title) LIKE "%wool%"
        LOWER(p.title) LIKE "%pashmina%"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

// Public API endpoint for all products in dupatta without limit
app.get('/api/public/product/dp', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN (
            SELECT product_id, MIN(image_path) as image_path
            FROM product_images
            GROUP BY product_id
        ) pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "dupattas"
        and
        LOWER(col.collection_name) = "women's collection"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        console.log('Products in dupattas category:', results);
        res.json(results);
    });
});
app.get('/api/public/products/dp/cd', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN (
            SELECT product_id, MIN(image_path) as image_path
            FROM product_images
            GROUP BY product_id
        ) pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "dupattas"
        and
        LOWER(col.collection_name) = "women's collection"
        and
        Lower(p.title) LIKE "%cotton%"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});
app.get('/api/public/products/dp/sd', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN (
            SELECT product_id, MIN(image_path) as image_path
            FROM product_images
            GROUP BY product_id
        ) pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "dupattas"
        and
        LOWER(col.collection_name) = "women's collection"
        and
        Lower(p.title) LIKE "%silk%"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});
app.get('/api/public/products/dp/chd', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN (
            SELECT product_id, MIN(image_path) as image_path
            FROM product_images
            GROUP BY product_id
        ) pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "dupattas"
        and
        LOWER(col.collection_name) = "women's collection"
        and
        Lower(p.title) LIKE "%chiffon%"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});
app.get('/api/public/products/dp/nd', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN (
            SELECT product_id, MIN(image_path) as image_path
            FROM product_images
            GROUP BY product_id
        ) pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "dupattas"
        and
        LOWER(col.collection_name) = "women's collection"
        and
        Lower(p.title) LIKE "%net%"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});
app.get('/api/public/products/dp/rd', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN (
            SELECT product_id, MIN(image_path) as image_path
            FROM product_images
            GROUP BY product_id
        ) pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "dupattas"
        and
        LOWER(col.collection_name) = "women's collection"
        and
        Lower(p.title) LIKE "%rayon%"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});
app.get('/api/public/products/dp/wd', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN (
            SELECT product_id, MIN(image_path) as image_path
            FROM product_images
            GROUP BY product_id
        ) pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "dupattas"
        and
        LOWER(col.collection_name) = "women's collection"
        and
        Lower(p.title) LIKE "%wool%"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

// Public API endpoint for all products in fabric without limit
app.get('/api/public/product/fab', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN (
            SELECT product_id, MIN(image_path) as image_path
            FROM product_images
            GROUP BY product_id
        ) pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "fabrics"
        and
        LOWER(col.collection_name) = "women's collection"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});
app.get('/api/public/products/fab/cfab', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN (
            SELECT product_id, MIN(image_path) as image_path
            FROM product_images
            GROUP BY product_id
        ) pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "fabrics"
        and
        LOWER(col.collection_name) = "women's collection"
        and
        LOWER(p.title) LIKE "%cotton%"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});
app.get('/api/public/products/fab/sfab', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN (
            SELECT product_id, MIN(image_path) as image_path
            FROM product_images
            GROUP BY product_id
        ) pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "fabrics"
        and
        LOWER(col.collection_name) = "women's collection"
        and
        LOWER(p.title) LIKE "%silk%"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});
app.get('/api/public/products/fab/gfab', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN (
            SELECT product_id, MIN(image_path) as image_path
            FROM product_images
            GROUP BY product_id
        ) pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "fabrics"
        and
        LOWER(col.collection_name) = "women's collection"
        and
        LOWER(p.title) LIKE "%georgette%"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});
app.get('/api/public/products/fab/wfab', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN (
            SELECT product_id, MIN(image_path) as image_path
            FROM product_images
            GROUP BY product_id
        ) pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "fabrics"
        and
        LOWER(col.collection_name) = "women's collection"
        and
        LOWER(p.title) LIKE "%wool%"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

// Public API endpoint for all products in stitched-garment without limit
app.get('/api/public/product/sm', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN (
            SELECT product_id, MIN(image_path) as image_path
            FROM product_images
            GROUP BY product_id
        ) pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "stitched garments"
        and
        LOWER(col.collection_name) = "women's collection"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});
app.get('/api/public/products/sm/cks', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN (
            SELECT product_id, MIN(image_path) as image_path
            FROM product_images
            GROUP BY product_id
        ) pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "stitched garments"
        and
        LOWER(col.collection_name) = "women's collection"
        and
        LOWER(p.title) LIKE "%cotton%"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});
app.get('/api/public/products/sm/rks', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN (
            SELECT product_id, MIN(image_path) as image_path
            FROM product_images
            GROUP BY product_id
        ) pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "stitched garments"
        and
        LOWER(col.collection_name) = "women's collection"
        and
        LOWER(p.title) LIKE "%rayon%"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});
app.get('/api/public/products/sm/wks', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN (
            SELECT product_id, MIN(image_path) as image_path
            FROM product_images
            GROUP BY product_id
        ) pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "stitched garments"
        and
        LOWER(col.collection_name) = "women's collection"
        and
        LOWER(p.title) LIKE "%wool%"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});
app.get('/api/public/products/sm/ns', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN (
            SELECT product_id, MIN(image_path) as image_path
            FROM product_images
            GROUP BY product_id
        ) pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "stitched garments"
        and
        LOWER(col.collection_name) = "women's collection"
        and
        LOWER(p.title) LIKE "%night%"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

// Public API endpoint for all products in accessories without limit
app.get('/api/public/product/asc', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN product_images pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "accessories"
        and
        LOWER(col.collection_name) = "women's collection"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});
app.get('/api/public/products/asc/wtch', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN product_images pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "accessories"
        and
        LOWER(col.collection_name) = "women's collection"
        and
        Lower(p.title) like "%watch%"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});
app.get('/api/public/products/asc/hb', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN product_images pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "accessories"
        and
        LOWER(col.collection_name) = "women's collection"
        and
        Lower(p.title) like "%handbag%"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

// Public API endpoint for all products in men's collection without limit
app.get('/api/public/productsm', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN product_images pi ON p.product_id = pi.product_id
        WHERE LOWER(col.collection_name) = "men's collection"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

// Public API endpoint for all products in t-shirt without limit
app.get('/api/public/productsm/ts', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN product_images pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "t-shirts"
        and
        LOWER(col.collection_name) = "men's collection"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

// Public API endpoint for all products in shirt without limit
app.get('/api/public/productsm/s', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN product_images pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "formal shirts"
        and
        LOWER(col.collection_name) = "men's collection"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

// Public API endpoint for all products in fabric without limit
app.get('/api/public/productsm/fabm', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN product_images pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "fabrics"
        and
        LOWER(col.collection_name) = "men's collection"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

// Public API endpoint for all products in accessories without limit
app.get('/api/public/productsm/ascm', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN product_images pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "accessories"
        and
        LOWER(col.collection_name) = "men's collection"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

// Public API endpoint for all products in home decor without limit
app.get('/api/public/productshd', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN product_images pi ON p.product_id = pi.product_id
        WHERE LOWER(col.collection_name) = "home decor"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

// Public API endpoint for all products in towel without limit
app.get('/api/public/productshd/tw', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN product_images pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "towels"
        and
        LOWER(col.collection_name) = "home decor"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

app.get('/api/public/productshd/tw/hand', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN product_images pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "towels"
        and
        LOWER(col.collection_name) = "home decor"
        and
        LOWER(p.title) LIKE "%hand %"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

app.get('/api/public/productshd/tw/bath', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN product_images pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "towels"
        and
        LOWER(col.collection_name) = "home decor"
        and
        LOWER(p.title) LIKE "%bath%"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

app.get('/api/public/productshd/tw/ktchn', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN product_images pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "towels"
        and
        LOWER(col.collection_name) = "home decor"
        and
        LOWER(p.title) LIKE "%kitchen%"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

app.get('/api/public/productshd/tw/hank', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN product_images pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "towels"
        and
        LOWER(col.collection_name) = "home decor"
        and
        LOWER(p.title) LIKE "%handkerchiefs%"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

// Public API endpoint for all products in kitch utility without limit
app.get('/api/public/productshd/ku', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN product_images pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "kitchen utility"
        and
        LOWER(col.collection_name) = "home decor"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

// Public API endpoint for user registration
app.post('/api/public/product/register', async (req, res) => {
    const { first_name, last_name, email, password } = req.body;

    if (!first_name || !last_name || !email || !password) {
        return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    try {
        // Check if user already exists
        db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
            if (err) {
                console.error('Database error during registration check:', err);
                return res.status(500).json({ success: false, message: 'Database error.' });
            }
            if (results.length > 0) {
                return res.status(409).json({ success: false, message: 'Email already registered.' });
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Insert new user
            db.query(
                'INSERT INTO users (first_name, last_name, email, password) VALUES (?, ?, ?, ?)',
                [first_name, last_name, email, hashedPassword],
                (err, result) => {
                    if (err) {
                        console.error('Database error during user insertion:', err);
                        return res.status(500).json({ success: false, message: 'Database error.' });
                    }
                    res.status(201).json({ success: true, message: 'Registration successful. Please log in.' });
                }
            );
        });
    } catch (error) {
        console.error('Server error during registration:', error);
        res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
});

// Public API endpoint for user login
app.post('/api/public/product/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
        if (err) {
            console.error('Database error during login check:', err);
            return res.status(500).json({ success: false, message: 'Database error.' });
        }
        if (results.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {
            req.session.user = { id: user.user_id, email: user.email, first_name: user.first_name, last_name: user.last_name };
            req.session.loggedIn = true;
            res.json({ success: true, message: 'Login successful.' });
        } else {
            res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }
    });
});

// Public API endpoint to check authentication status
app.get('/api/public/product/check-auth', (req, res) => {
    console.log('--- check-auth Endpoint Debug ---');
    console.log('req.session:', req.session);
    console.log('req.session.loggedIn:', req.session.loggedIn);
    console.log('req.session.user:', req.session.user);
    if (req.session.loggedIn && req.session.user) {
        console.log('check-auth: User is logged in.');
        res.json({ loggedIn: true, user: req.session.user });
    } else {
        console.log('check-auth: User is NOT logged in.');
        res.json({ loggedIn: false });
    }
    console.log('-----------------------------------');
});



// Public API endpoint to add product to wishlist
app.post('/api/wishlist/add', authenticateToken, (req, res) => {
    const { productId } = req.body;
    const userId = req.session.user ? req.session.user.user_id : null; // Safely get userId

    console.log('--- Wishlist Add Request Debug ---');
    console.log('req.session.user:', req.session.user);
    console.log('Extracted userId:', userId);
    console.log('ProductId from request body:', productId);
    console.log('----------------------------------');

    if (!productId) {
        return res.status(400).json({ success: false, message: 'Product ID is required.' });
    }

    if (!userId) {
        console.error('Attempt to add to wishlist without a valid userId in session.');
        return res.status(401).json({ success: false, message: 'User not logged in or session invalid.' });
    }

    db.query(
        'INSERT INTO wishlist (user_id, product_id) VALUES (?, ?)',
        [userId, productId],
        (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(409).json({ success: false, message: 'Product already in wishlist.' });
                }
                console.error('Database error adding to wishlist:', err);
                return res.status(500).json({ success: false, message: 'Database error.', error: err.message });
            }
            res.status(201).json({ success: true, message: 'Product added to wishlist.' });

            // Public API endpoint to remove product from wishlist
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(409).json({ success: false, message: 'Product already in wishlist.' });
                }
                console.error('Database error adding to wishlist:', err);
                return res.status(500).json({ success: false, message: 'Database error.' });
            }
            res.status(201).json({ success: true, message: 'Product added to wishlist.' });
        }
    );
});

// Public API endpoint to remove product from wishlist
app.post('/api/wishlist/remove', authenticateToken, (req, res) => {
    const { productId } = req.body;
    const userId = req.session.user.user_id;

    if (!productId) {
        return res.status(400).json({ success: false, message: 'Product ID is required.' });
    }

    db.query(
        'DELETE FROM wishlist WHERE user_id = ? AND product_id = ?',
        [userId, productId],
        (err, result) => {
            if (err) {
                console.error('Database error removing from wishlist:', err);
                return res.status(500).json({ success: false, message: 'Database error.' });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'Product not found in wishlist.' });
            }
            res.json({ success: true, message: 'Product removed from wishlist.' });
        }
    );
});

// Public API endpoint to fetch user's wishlist
app.get('/api/wishlist', authenticateToken, (req, res) => {
    const userId = req.session.user.user_id;

    const query = `
        SELECT p.product_id AS id, p.title AS name, p.price, pi.image_path AS image
        FROM wishlist w
        JOIN products p ON w.product_id = p.product_id
        LEFT JOIN (
            SELECT product_id, MIN(image_path) as image_path
            FROM product_images
            GROUP BY product_id
        ) pi ON p.product_id = pi.product_id
        WHERE w.user_id = ?
    `;

    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Database error fetching wishlist:', err);
            return res.status(500).json({ success: false, message: 'Database error.' });
        }
        res.json({ success: true, wishlist: results });
    });
});

// Public API endpoint for all products in soft toy without limit
app.get('/api/public/productshd/st', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN product_images pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "soft toys"
        and
        LOWER(col.collection_name) = "home decor"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

// Public API endpoint for all products in bedsheet without limit
app.get('/api/public/productshd/bs', (req, res) => {
    const query = `
        SELECT p.*, c.category_name, col.collection_name, pi.image_path
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        LEFT JOIN product_images pi ON p.product_id = pi.product_id
        WHERE LOWER(c.category_name) = "bedsheets"
        and
        LOWER(col.collection_name) = "home decor"
        GROUP BY p.product_id
        ORDER BY p.product_id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

// API endpoint to get all collections
app.get('/api/collections', isAuthenticated, (req, res) => {
    const query = 'SELECT * FROM collections ORDER BY collection_id DESC';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Database error in /api/collections:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        console.log('Collections fetched:', results);
        if (!Array.isArray(results)) {
            console.error('Collections result is not an array:', results);
            return res.status(500).json({ error: 'Invalid data format' });
        }
        res.json(results);
    });
});

// Public API endpoint to get slideshow data
app.get('/api/public/slideshow', (req, res) => {
    const query = 'SELECT * FROM slideshow WHERE status = 1 ORDER BY `order` ASC';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        const slides = results.map(slide => ({
            id: slide.id,
            heading: slide.heading,
            description: slide.description,
            image: slide.image ? `/src/slides/${slide.image}` : '/src/placeholder.jpg'
        }));

        res.json(slides);
    });
});

// Admin slideshow endpoints
app.get('/api/slideshow', isAuthenticated, (req, res) => {
    const query = 'SELECT * FROM slideshow ORDER BY `order` ASC';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        const slides = results.map(slide => ({
            ...slide,
            image: slide.image ? `/src/slides/${slide.image}` : null
        }));

        res.json(slides);
    });
});

app.post('/api/slideshow', isAuthenticated, upload.single('image'), (req, res) => {
    const { heading, description, order, status } = req.body;
    const image = req.file ? req.file.filename : null;

    const query = 'INSERT INTO slideshow (heading, description, `order`, status, image) VALUES (?, ?, ?, ?, ?)';

    db.query(query, [heading, description, order, status, image], (err, result) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        res.json({ success: true, id: result.insertId });
    });
});

app.put('/api/slideshow/:id', isAuthenticated, upload.single('image'), (req, res) => {
    const { id } = req.params;
    const { heading, description, order, status } = req.body;
    const image = req.file ? req.file.filename : null;

    let query, params;

    if (image) {
        query = 'UPDATE slideshow SET heading = ?, description = ?, `order` = ?, status = ?, image = ? WHERE id = ?';
        params = [heading, description, order, status, image, id];
    } else {
        query = 'UPDATE slideshow SET heading = ?, description = ?, `order` = ?, status = ? WHERE id = ?';
        params = [heading, description, order, status, id];
    }

    db.query(query, params, (err, result) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        res.json({ success: true });
    });
});

app.delete('/api/slideshow/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;

    db.query('DELETE FROM slideshow WHERE id = ?', [id], (err, result) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        res.json({ success: true });
    });
});

// Public API endpoint to get all categories for slideshow
app.get('/api/public/categories', (req, res) => {
    const query = `
        SELECT c.category_id, c.category_name, c.category_image, col.collection_name
        FROM categories c
        LEFT JOIN collections col ON c.collection_id = col.collection_id
        ORDER BY c.category_id
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        const categories = results.map(cat => ({
            category_id: cat.category_id,
            category_name: cat.category_name,
            category_image: cat.category_image ? `/src/categories/${cat.category_image}`:'',
            collection_name: cat.collection_name || 'General',
            category_link: `${cat.category_name.toLowerCase().replace(/\s+/g, '-')}.html`
        }));

        res.json(categories);
    });
});

// Public API endpoint to get categories by collection name
app.get('/api/public/collections', (req, res) => {
    db.query('SELECT * FROM collections', (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        const collections = results.map(col => {
            if (col.collection_image) {
                col.collection_image = `/src/collections/${col.collection_image}`;
            }
            return col;
        });
        res.json(collections);
    });
});

app.get('/api/public/categories/:collectionName', (req, res) => {
    const collectionName = req.params.collectionName.toLowerCase();

    // Query to get categories related to the collection, including categories without products
    const query = `
        SELECT c.category_id, c.category_name, c.category_image
        FROM categories c
        JOIN collections col ON c.collection_id = col.collection_id
        WHERE LOWER(col.collection_name) = ?
    `;

    db.query(query, [collectionName], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        // Map results to include category_link for frontend usage
        const categories = results.map(cat => ({
            category_id: cat.category_id,
            category_name: cat.category_name,
            category_image: cat.category_image ? `/src/categories/${cat.category_image}` : '',
            category_link: `${cat.category_name.toLowerCase().replace(/\s+/g, '-')}.html`
        }));

        res.json(categories);
    });
});

// API endpoint to create a new collection
app.post('/api/collections', isAuthenticated, upload.single('collectionImage'), (req, res) => {
    const collectionName = req.body.collectionName || req.body.collection_name;
    const collectionDescription = req.body.collectionDescription || req.body.collection_des;
    const collectionImage = req.file ? req.file.filename : null;

    if (!collectionName) return res.status(400).json({ error: 'Collection name is required' });

    db.query(
        'INSERT INTO collections (collection_name, collection_description, collection_image) VALUES (?, ?, ?)',
        [collectionName, collectionDescription, collectionImage],
        (err, result) => {
            if (err) {
                console.error('DB Insert Error:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.status(201).json({ message: 'Collection created', collectionId: result.insertId });
        }
    );
});

// API endpoint to update a collection
app.put('/api/collections/:id', isAuthenticated, upload.single('collectionImage'), (req, res) => {
    const collectionId = req.params.id;
    const collectionName = req.body.collectionName || req.body.collection_name;
    const collectionDescription = req.body.collectionDescription || req.body.collection_des;
    const collectionImage = req.file ? req.file.filename : null;

    if (!collectionName) return res.status(400).json({ error: 'Collection name is required' });

    let query = 'UPDATE collections SET collection_name = ?, collection_description = ?';
    const params = [collectionName, collectionDescription];

    if (collectionImage) {
        query += ', collection_image = ?';
        params.push(collectionImage);
    }
    query += ' WHERE collection_id = ?';
    params.push(collectionId);

    db.query(query, params, (err, result) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Collection not found' });
        res.json({ message: 'Collection updated' });
    });
});

// API endpoint to delete a collection
app.delete('/api/collections/:id', isAuthenticated, (req, res) => {
    const collectionId = req.params.id;
    db.query('DELETE FROM collections WHERE collection_id = ?', [collectionId], (err, result) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Collection not found' });
        res.json({ message: 'Collection deleted' });
    });
});

// Cart API Endpoints
app.post('/api/cart/add', authenticateToken, (req, res) => {
    const { productId, variantDetail, quantity = 1 } = req.body;
    const userId = req.userId;

    console.log('Cart add request:', { productId, variantDetail, quantity, userId });

    if (!productId) {
        return res.status(400).json({ success: false, message: 'Product ID is required' });
    }

    if (!userId) {
        console.error('User ID is missing from request');
        return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    // Get stock for the variant
    let stockQuery = 'SELECT stock FROM product_images WHERE product_id = ?';
    let stockParams = [productId];

    if (variantDetail) {
        stockQuery += ' AND variant_detail = ?';
        stockParams.push(variantDetail);
    } else {
        stockQuery += ' AND variant_detail IS NULL';
    }

    db.query(
        stockQuery,
        stockParams,
        (stockErr, stockResults) => {
            if (stockErr) {
                console.error('Database error getting stock:', stockErr);
                return res.status(500).json({ success: false, message: 'Database error' });
            }

            const stock = stockResults.length > 0 ? stockResults[0].stock : 0;

            // Check if item already exists in cart
            let checkQuery = 'SELECT * FROM cart WHERE user_id = ? AND product_id = ?';
            let checkParams = [userId, productId];

            if (variantDetail) {
                checkQuery += ' AND variant_detail = ?';
                checkParams.push(variantDetail);
            } else {
                checkQuery += ' AND variant_detail IS NULL';
            }

            db.query(
                checkQuery,
                checkParams,
                (err, results) => {
                    if (err) {
                        console.error('Database error checking cart:', err);
                        return res.status(500).json({ success: false, message: 'Database error' });
                    }

                    if (results.length > 0) {
                        // Update existing item quantity and stock
                        const newQuantity = results[0].quantity + parseInt(quantity);
                        db.query(
                            'UPDATE cart SET quantity = ?, stock = ? WHERE cart_id = ?',
                            [newQuantity, stock, results[0].cart_id],
                            (updateErr) => {
                                if (updateErr) {
                                    console.error('Database error updating cart:', updateErr);
                                    return res.status(500).json({ success: false, message: 'Database error' });
                                }
                                res.json({ success: true, message: 'Cart updated successfully' });
                            }
                        );
                    } else {
                        // Add new item to cart with stock
                        db.query(
                            'INSERT INTO cart (user_id, product_id, variant_detail, quantity, stock) VALUES (?, ?, ?, ?, ?)',
                            [userId, productId, variantDetail || null, parseInt(quantity), stock],
                            (insertErr) => {
                                if (insertErr) {
                                    console.error('Database error adding to cart:', insertErr);
                                    return res.status(500).json({ success: false, message: 'Database error' });
                                }
                                res.status(201).json({ success: true, message: 'Product added to cart' });
                            }
                        );
                    }
                }
            );
        }
    );
});

app.post('/api/cart/remove', authenticateToken, (req, res) => {
    const { productId, variantDetail } = req.body;
    const userId = req.userId;

    if (!productId) {
        return res.status(400).json({ success: false, message: 'Product ID is required' });
    }

    let deleteQuery = 'DELETE FROM cart WHERE user_id = ? AND product_id = ?';
    let deleteParams = [userId, productId];

    if (variantDetail) {
        deleteQuery += ' AND variant_detail = ?';
        deleteParams.push(variantDetail);
    } else {
        deleteQuery += ' AND variant_detail IS NULL';
    }

    db.query(
        deleteQuery,
        deleteParams,
        (err, result) => {
            if (err) {
                console.error('Database error removing from cart:', err);
                return res.status(500).json({ success: false, message: 'Database error' });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'Item not found in cart' });
            }
            res.json({ success: true, message: 'Item removed from cart' });
        }
    );
});

app.post('/api/cart/update', authenticateToken, (req, res) => {
    const { productId, variantDetail, quantity } = req.body;
    const userId = req.userId;

    if (!productId || !quantity || quantity < 1) {
        return res.status(400).json({ success: false, message: 'Product ID and valid quantity are required' });
    }

    db.query(
        'UPDATE cart SET quantity = ? WHERE user_id = ? AND product_id = ?',
        [parseInt(quantity), userId, productId],
        (err, result) => {
            if (err) {
                console.error('Database error updating cart:', err);
                return res.status(500).json({ success: false, message: 'Database error' });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'Item not found in cart' });
            }
            res.json({ success: true, message: 'Cart updated successfully' });
        }
    );
});

app.post('/api/cart/clear', authenticateToken, (req, res) => {
    const userId = req.userId;

    db.query(
        'DELETE FROM cart WHERE user_id = ?',
        [userId],
        (err, result) => {
            if (err) {
                console.error('Database error clearing cart:', err);
                return res.status(500).json({ success: false, message: 'Database error' });
            }
            res.json({ success: true, message: 'Cart cleared successfully' });
        }
    );
});

app.get('/api/cart', authenticateToken, (req, res) => {
    const userId = req.userId;

    const query = `
        SELECT 
            c.cart_id,
            c.product_id,
            c.quantity,
            c.variant_detail,
            c.stock as cart_stock,
            p.title,
            p.price,
            p.mrp,
            pi.image_path,
            pi.stock as product_stock,
            cat.category_name,
            col.collection_name
        FROM cart c
        JOIN products p ON c.product_id = p.product_id
        LEFT JOIN product_images pi ON p.product_id = pi.product_id AND 
            ((c.variant_detail IS NOT NULL AND pi.variant_detail = c.variant_detail) OR 
             (c.variant_detail IS NULL AND pi.variant_detail IS NULL))
        LEFT JOIN categories cat ON p.category_id = cat.category_id
        LEFT JOIN collections col ON p.collection_id = col.collection_id
        WHERE c.user_id = ?
        GROUP BY c.cart_id, c.product_id
        ORDER BY c.product_id ASC
    `;

    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Database error fetching cart:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        const cartItems = results.map(item => {
            // Use product_stock from product_images table, fallback to cart_stock
            let actualStock = item.product_stock || item.cart_stock || 0;

            console.log(`Cart item ${item.product_id}: product_stock=${item.product_stock}, cart_stock=${item.cart_stock}, final_stock=${actualStock}`);

            return {
                cart_id: item.cart_id,
                product_id: item.product_id,
                title: item.title,
                price: item.price,
                mrp: item.mrp,
                quantity: item.quantity,
                stock: actualStock,
                image_path: item.image_path,
                category_name: item.category_name,
                collection_name: item.collection_name,
                variant_detail: item.variant_detail
            };
        });

        const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
        const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        res.json({
            success: true,
            cart: cartItems,
            totalItems,
            subtotal
        });
    });
});

// Check if product is in cart
app.get('/api/cart/check/:productId', authenticateToken, (req, res) => {
    const { productId } = req.params;
    const { variantDetail } = req.query;
    const userId = req.userId;

    let query = 'SELECT * FROM cart WHERE user_id = ? AND product_id = ?';
    let params = [userId, productId];

    if (variantDetail) {
        query += ' AND variant_detail = ?';
        params.push(variantDetail);
    } else {
        query += ' AND variant_detail IS NULL';
    }

    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Database error checking cart:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        res.json({ success: true, inCart: results.length > 0 });
    });
});

// Promo code API endpoints
app.post('/api/apply-promo', authenticateToken, (req, res) => {
    const { code } = req.body;
    const userId = req.userId;

    if (!code) {
        return res.status(400).json({ success: false, message: 'Promo code is required' });
    }

    // Check if offer exists and is valid
    db.query('SELECT * FROM offers WHERE code = ?', [code], (err, offers) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }

        if (offers.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid promo code' });
        }

        const offer = offers[0];

        // Check if offer is enabled
        if (!offer.is_enabled) {
            return res.status(400).json({ success: false, message: 'Invalid promo code' });
        }

        // Check if offer limit is reached
        if (offer.used >= offer.offer_limit) {
            return res.status(400).json({ success: false, message: 'Promo code usage limit reached' });
        }

        // Check if user already used this offer
        db.query('SELECT * FROM offer_usage WHERE offer_id = ? AND user_id = ?', [offer.offer_id, userId], (usageErr, usage) => {
            if (usageErr) {
                console.error('Database error:', usageErr);
                return res.status(500).json({ success: false, message: 'Database error' });
            }

            if (usage.length > 0) {
                return res.status(400).json({ success: false, message: 'You have already used this promo code' });
            }

            // Record usage
            db.query('INSERT INTO offer_usage (offer_id, user_id) VALUES (?, ?)', [offer.offer_id, userId], (insertErr) => {
                if (insertErr) {
                    console.error('Database error:', insertErr);
                    return res.status(500).json({ success: false, message: 'Database error' });
                }

                // Update used count
                db.query('UPDATE offers SET used = used + 1 WHERE offer_id = ?', [offer.offer_id], (updateErr) => {
                    if (updateErr) {
                        console.error('Database error:', updateErr);
                    }
                });

                res.json({
                    success: true,
                    message: 'Promo code applied successfully',
                    discount: {
                        type: offer.discount_type,
                        value: offer.discount_value
                    }
                });
            });
        });
    });
});

// Admin offer management endpoints
app.get('/admin/offers', isAuthenticated, (req, res) => {
    const search = req.query.search || '';
    const searchQuery = search ? 'WHERE code LIKE ?' : '';
    const searchParams = search ? [`%${search}%`] : [];

    db.query(`SELECT * FROM offers ${searchQuery} ORDER BY created_at DESC`, searchParams, (err, offers) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(offers);
    });
});

// Admin API offer management endpoints
app.get('/api/admin/offers', isAuthenticated, (req, res) => {
    const search = req.query.search || '';
    const searchQuery = search ? 'WHERE code LIKE ?' : '';
    const searchParams = search ? [`%${search}%`] : [];

    db.query(`SELECT * FROM offers ${searchQuery} ORDER BY created_at DESC`, searchParams, (err, offers) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(offers);
    });
});

app.post('/admin/offers', isAuthenticated, (req, res) => {
    const { code, discount_type, discount_value, offer_limit, is_enabled = true } = req.body;

    if (!code || !discount_type || !discount_value || !offer_limit) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    db.query('INSERT INTO offers (code, discount_type, discount_value, offer_limit, is_enabled) VALUES (?, ?, ?, ?, ?)',
        [code, discount_type, discount_value, offer_limit, is_enabled], (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ error: 'Offer code already exists' });
                }
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ message: 'Offer created successfully', offerId: result.insertId });
        });
});

app.post('/api/admin/offers', isAuthenticated, (req, res) => {
    const { code, discount_type, discount_value, offer_limit, is_enabled = true } = req.body;

    if (!code || !discount_type || !discount_value || !offer_limit) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    db.query('INSERT INTO offers (code, discount_type, discount_value, offer_limit, is_enabled) VALUES (?, ?, ?, ?, ?)',
        [code, discount_type, discount_value, offer_limit, is_enabled], (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ error: 'Offer code already exists' });
                }
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ message: 'Offer created successfully', offerId: result.insertId });
        });
});

app.put('/admin/offers/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;
    const { code, discount_type, discount_value, offer_limit, is_enabled } = req.body;

    db.query('UPDATE offers SET code = ?, discount_type = ?, discount_value = ?, offer_limit = ?, is_enabled = ? WHERE offer_id = ?',
        [code, discount_type, discount_value, offer_limit, is_enabled, id], (err) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ message: 'Offer updated successfully' });
        });
});

app.put('/api/admin/offers/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;
    const { code, discount_type, discount_value, offer_limit, is_enabled } = req.body;

    db.query('UPDATE offers SET code = ?, discount_type = ?, discount_value = ?, offer_limit = ?, is_enabled = ? WHERE offer_id = ?',
        [code, discount_type, discount_value, offer_limit, is_enabled, id], (err) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ message: 'Offer updated successfully' });
        });
});

app.delete('/admin/offers/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;

    // First delete usage records, then delete the offer
    db.query('DELETE FROM offer_usage WHERE offer_id = ?', [id], (usageErr) => {
        if (usageErr) {
            console.error('Database error deleting usage records:', usageErr);
            return res.status(500).json({ error: 'Database error' });
        }

        // Now delete the offer
        db.query('DELETE FROM offers WHERE offer_id = ?', [id], (err) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ message: 'Offer deleted successfully' });
        });
    });
});

app.delete('/api/admin/offers/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;

    // First delete usage records, then delete the offer
    db.query('DELETE FROM offer_usage WHERE offer_id = ?', [id], (usageErr) => {
        if (usageErr) {
            console.error('Database error deleting usage records:', usageErr);
            return res.status(500).json({ error: 'Database error' });
        }

        // Now delete the offer
        db.query('DELETE FROM offers WHERE offer_id = ?', [id], (err) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ message: 'Offer deleted successfully' });
        });
    });
});

app.get('/admin/offers/:id/users', isAuthenticated, (req, res) => {
    const { id } = req.params;

    db.query(`SELECT u.first_name, u.last_name, u.email, ou.used_at 
              FROM offer_usage ou 
              JOIN users u ON ou.user_id = u.user_id 
              WHERE ou.offer_id = ? 
              ORDER BY ou.used_at DESC`, [id], (err, users) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(users);
    });
});

app.get('/api/admin/offers/:id/users', isAuthenticated, (req, res) => {
    const { id } = req.params;

    db.query(`SELECT u.first_name, u.last_name, u.email, ou.used_at 
              FROM offer_usage ou 
              JOIN users u ON ou.user_id = u.user_id 
              WHERE ou.offer_id = ? 
              ORDER BY ou.used_at DESC`, [id], (err, users) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(users);
    });
});

app.put('/admin/offers/:id/toggle', isAuthenticated, (req, res) => {
    const { id } = req.params;
    const { is_enabled } = req.body;

    db.query('UPDATE offers SET is_enabled = ? WHERE offer_id = ?', [is_enabled, id], (err) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ message: 'Offer status updated successfully' });
    });
});

app.put('/api/admin/offers/:id/toggle', isAuthenticated, (req, res) => {
    const { id } = req.params;
    const { is_enabled } = req.body;

    db.query('UPDATE offers SET is_enabled = ? WHERE offer_id = ?', [is_enabled, id], (err) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ message: 'Offer status updated successfully' });
    });
});

// Address API Endpoints
app.get('/api/addresses', authenticateToken, (req, res) => {
    const userId = req.userId;
    
    db.query('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC', [userId], (err, results) => {
        if (err) {
            console.error('Database error fetching addresses:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        res.json({ success: true, addresses: results });
    });
});

app.post('/api/addresses', authenticateToken, (req, res) => {
    const userId = req.userId;
    const { fullName, mobileNo, addressLine1, addressLine2, city, district, state, pincode, isDefault } = req.body;

    if (!fullName || !mobileNo || !addressLine1 || !city || !state || !pincode) {
        return res.status(400).json({ success: false, message: 'Required fields missing' });
    }

    const insertAddress = () => {
        db.query(
            'INSERT INTO addresses (user_id, full_name, mobile_no, address_line1, address_line2, city, district, state, pincode, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [userId, fullName, mobileNo, addressLine1, addressLine2 || null, city, district, state, pincode, isDefault || false],
            (err, result) => {
                if (err) {
                    console.error('Database error saving address:', err);
                    return res.status(500).json({ success: false, message: 'Database error' });
                }
                res.json({ success: true, message: 'Address saved successfully', addressId: result.insertId });
            }
        );
    };

    if (isDefault) {
        db.query('UPDATE addresses SET is_default = FALSE WHERE user_id = ?', [userId], (err) => {
            if (err) {
                console.error('Error updating default addresses:', err);
                return res.status(500).json({ success: false, message: 'Database error' });
            }
            insertAddress();
        });
    } else {
        insertAddress();
    }
});

// Get order cancellation details
app.get('/api/orders/:id/cancellation', authenticateToken, (req, res) => {
    const orderId = req.params.id;
    const userId = req.userId;
    
    db.query('SELECT cancellation_reason, cancellation_comments FROM orders WHERE order_id = ? AND user_id = ?', [orderId, userId], (err, results) => {
        if (err) {
            console.error('Database error fetching cancellation details:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        
        const order = results[0];
        res.json({
            reason: order.cancellation_reason,
            comments: order.cancellation_comments
        });
    });
});

// Admin get order cancellation details
app.get('/api/admin/orders/:id/cancellation', isAuthenticated, (req, res) => {
    const orderId = req.params.id;
    
    db.query('SELECT cancellation_reason, cancellation_comments FROM orders WHERE order_id = ?', [orderId], (err, results) => {
        if (err) {
            console.error('Database error fetching cancellation details:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        
        const order = results[0];
        res.json({
            reason: order.cancellation_reason,
            comments: order.cancellation_comments
        });
    });
});

// Orders API Endpoints (updated to work with guest accounts)
app.post('/api/orders', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1] || req.cookies?.session_token;
    let userId = null;

    // Try to get user ID if logged in
    if (token) {
        try {
            const sessionRecord = await Session.findByPk(token);
            if (sessionRecord && sessionRecord.expires > new Date()) {
                const sessionData = JSON.parse(sessionRecord.data);
                userId = sessionData.userId;
            }
        } catch (error) {
            console.error('Error getting user from session:', error);
        }
    }

    const { addressId, paymentMode, subtotal, discount, totalAmount, items } = req.body;

    if (!addressId || !paymentMode || !subtotal || !totalAmount || !items || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Required order data missing' });
    }

    try {
        // Calculate total weight
        let totalWeight = 0;
        for (const item of items) {
            const productWeight = await new Promise((resolve, reject) => {
                db.query('SELECT weight FROM products WHERE product_id = ?', [item.productId], (err, results) => {
                    if (err) reject(err);
                    else resolve(results[0]?.weight || 0);
                });
            });
            totalWeight += (productWeight * item.quantity);
        }

        // Insert order
        const orderResult = await new Promise((resolve, reject) => {
            db.query(
                'INSERT INTO orders (user_id, address_id, payment_mode, subtotal, discount, total_amount, weight, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [userId, addressId, paymentMode, subtotal, discount || 0, totalAmount, totalWeight, 'pending'],
                (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                }
            );
        });

        const dbOrderId = orderResult.insertId;

        // Insert order items
        const orderItems = items.map(item => [
            dbOrderId,
            item.productId,
            item.quantity,
            item.price,
            item.variantType || null,
            item.variantDetail || null
        ]);

        await new Promise((resolve, reject) => {
            db.query(
                'INSERT INTO order_items (order_id, product_id, quantity, price, variant_type, variant_detail) VALUES ?',
                [orderItems],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({ success: true, message: 'Order placed successfully', orderId: dbOrderId });
    } catch (error) {
        console.error('Database error creating order:', error);
        res.status(500).json({ success: false, message: 'Failed to create order' });
    }
});

// Admin Orders Management
app.get('/api/admin/orders', isAuthenticated, (req, res) => {
    const { status, date, payment, search } = req.query;

    let query = `
        SELECT 
            o.order_id,
            o.order_date,
            o.total_amount,
            o.status,
            o.payment_mode,
            o.tracking_id,
            o.tracking_link,
            o.carrier,
            u.first_name,
            u.last_name,
            u.email,
            a.full_name as customer_name,
            a.address_line1,
            a.address_line2,
            a.city,
            a.state,
            a.pincode,
            a.mobile_no
        FROM orders o
        JOIN users u ON o.user_id = u.user_id
        LEFT JOIN addresses a ON o.address_id = a.address_id
    `;

    const conditions = [];
    const params = [];

    if (status) {
        conditions.push('o.status = ?');
        params.push(status);
    }

    if (payment) {
        conditions.push('o.payment_mode = ?');
        params.push(payment);
    }

    if (search) {
        conditions.push('(o.order_id LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR a.full_name LIKE ? OR CONCAT(u.first_name, " ", u.last_name) LIKE ?)');
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    if (date === 'recent') {
        query += ' ORDER BY o.order_date DESC';
    } else if (date === 'old') {
        query += ' ORDER BY o.order_date ASC';
    } else {
        query += ' ORDER BY o.order_date DESC';
    }

    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Database error fetching orders:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

app.get('/api/admin/orders/:orderId/items', authenticateToken, (req, res) => {
    const orderId = req.params.orderId;

    const query = `
        SELECT 
            oi.order_item_id,
            oi.product_id,
            oi.quantity,
            oi.price,
            oi.variant_detail,
            oi.variant_type,
            p.title,
            p.sku,
            pi.image_path
        FROM order_items oi
        JOIN products p ON oi.product_id = p.product_id
        LEFT JOIN product_images pi ON p.product_id = pi.product_id AND 
            ((oi.variant_detail IS NOT NULL AND pi.variant_detail = oi.variant_detail) OR 
             (oi.variant_detail IS NULL AND pi.variant_detail IS NULL))
        WHERE oi.order_id = ?
        GROUP BY oi.order_item_id, oi.product_id, oi.variant_detail
    `;

    db.query(query, [orderId], (err, results) => {
        if (err) {
            console.error('Database error fetching order items:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// Order Status Management
app.post('/api/admin/orders/:orderId/accept', isAuthenticated, (req, res) => {
    const orderId = req.params.orderId;

    db.query('UPDATE orders SET status = "processing" WHERE order_id = ?', [orderId], (err) => {
        if (err) {
            console.error('Error accepting order:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ success: true, message: 'Order accepted' });
    });
});

app.post('/api/admin/orders/:orderId/cancel', isAuthenticated, async (req, res) => {
    const orderId = req.params.orderId;

    try {
        // First get order items to restore stock
        const orderItems = await new Promise((resolve, reject) => {
            db.query('SELECT product_id, variant_detail, quantity FROM order_items WHERE order_id = ?', [orderId], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        // Restore stock for each item
        for (const item of orderItems) {
            let stockQuery = 'UPDATE product_images SET stock = stock + ? WHERE product_id = ?';
            let stockParams = [item.quantity, item.product_id];

            if (item.variant_detail) {
                stockQuery += ' AND variant_detail = ?';
                stockParams.push(item.variant_detail);
            } else {
                stockQuery += ' AND variant_detail IS NULL';
            }

            await new Promise((resolve, reject) => {
                db.query(stockQuery, stockParams, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }

        // Update order status to cancelled with reason and comments
        const reason = req.body.reason || null;
        const comments = req.body.additionalComments || null;
        await new Promise((resolve, reject) => {
            db.query('UPDATE orders SET status = "cancelled", cancellation_reason = ?, cancellation_comments = ? WHERE order_id = ?', 
                [reason, comments, orderId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        res.json({ success: true, message: 'Order cancelled and stock restored' });
    } catch (error) {
        console.error('Error cancelling order:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/admin/orders/:orderId/tracking', isAuthenticated, (req, res) => {
    const orderId = req.params.orderId;
    const { trackingId, trackingLink, carrier } = req.body;

    if (!trackingId) {
        return res.status(400).json({ error: 'Tracking ID required' });
    }

    db.query('UPDATE orders SET tracking_id = ?, tracking_link = ?, carrier = ?, status = "ready" WHERE order_id = ?',
        [trackingId, trackingLink || null, carrier || null, orderId], (err) => {
            if (err) {
                console.error('Error adding tracking:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ success: true, message: 'Tracking added' });
        });
});

app.post('/api/admin/orders/:orderId/deliver', isAuthenticated, (req, res) => {
    const orderId = req.params.orderId;
    const deliveryDate = new Date();

    db.query('UPDATE orders SET status = "delivered", delivery_date = ? WHERE order_id = ?',
        [deliveryDate, orderId], (err) => {
            if (err) {
                console.error('Error marking order as delivered:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ success: true, message: 'Order marked as delivered' });
        });
});

app.put('/api/admin/orders/:orderId', isAuthenticated, (req, res) => {
    const orderId = req.params.orderId;
    const { total_amount, payment_mode, status } = req.body;

    let updateQuery = 'UPDATE orders SET total_amount = ?, payment_mode = ?, status = ?';
    let params = [total_amount, payment_mode, status];

    if (status === 'delivered') {
        updateQuery += ', delivery_date = ?';
        params.push(new Date());
    }

    updateQuery += ' WHERE order_id = ?';
    params.push(orderId);

    db.query(updateQuery, params, (err, result) => {
        if (err) {
            console.error('Error updating order:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.json({ success: true, message: 'Order updated successfully' });
    });
});



app.get('/api/admin/orders/:orderId/address', isAuthenticated, (req, res) => {
    const orderId = req.params.orderId;

    const query = `
        SELECT a.*
        FROM orders o
        JOIN addresses a ON o.address_id = a.address_id
        WHERE o.order_id = ?
    `;

    db.query(query, [orderId], (err, results) => {
        if (err) {
            console.error('Database error fetching address:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: 'Address not found' });
        }
        res.json(results[0]);
    });
});

// Users CRUD
app.get('/api/users', isAuthenticated, (req, res) => {
    const { filter } = req.query;

    let query = `
        SELECT 
            u.user_id,
            CONCAT(u.first_name, ' ', u.last_name) as name,
            u.email,
            u.mobile
        FROM users u
        ORDER BY u.user_id DESC
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Database error fetching users:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

app.get('/api/users/:id/orders', isAuthenticated, (req, res) => {
    const userId = req.params.id;
    const query = `
        SELECT 
            order_id,
            order_date,
            total_amount as amount,
            status
        FROM orders 
        WHERE user_id = ?
        ORDER BY order_date DESC
    `;

    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Database error fetching user orders:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// Users CRUD
app.get('/api/users', isAuthenticated, (req, res) => {
    const { filter } = req.query;

    let query = `
        SELECT 
            u.user_id,
            CONCAT(u.first_name, ' ', u.last_name) as name,
            u.email,
            u.mobile
        FROM users u
        ORDER BY u.user_id DESC
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Database error fetching users:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

app.get('/api/users/:id/orders', isAuthenticated, (req, res) => {
    const userId = req.params.id;
    const query = `
        SELECT 
            order_id,
            order_date,
            total_amount as amount,
            status
        FROM orders 
        WHERE user_id = ?
        ORDER BY order_date DESC
    `;

    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Database error fetching user orders:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

app.get('/api/users/orders/:orderId/items', isAuthenticated, (req, res) => {
    const orderId = req.params.orderId;

    const query = `
        SELECT 
            oi.order_item_id,
            oi.product_id,
            oi.quantity,
            oi.price,
            oi.variant_detail,
            oi.variant_type,
            p.title,
            p.sku,
            pi.image_path
        FROM order_items oi
        JOIN products p ON oi.product_id = p.product_id
        LEFT JOIN product_images pi ON p.product_id = pi.product_id AND 
            ((oi.variant_detail IS NOT NULL AND pi.variant_detail = oi.variant_detail) OR 
             (oi.variant_detail IS NULL AND pi.variant_detail IS NULL))
        WHERE oi.order_id = ?
        GROUP BY oi.order_item_id, oi.product_id, oi.variant_detail
    `;

    db.query(query, [orderId], (err, results) => {
        if (err) {
            console.error('Database error fetching user order items:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// Visitor tracking endpoint
app.post('/api/track-visitor', (req, res) => {
    const sessionId = req.cookies.session_token || req.sessionID || req.ip + '_' + Date.now();

    db.query('INSERT INTO visitor_sessions (session_id) VALUES (?) ON DUPLICATE KEY UPDATE last_activity = NOW()',
        [sessionId], (err) => {
            if (err) console.error('Visitor tracking error:', err);
            res.json({ success: true });
        });
});

// Dashboard API Endpoints
app.get('/api/dashboard/visitors', isAuthenticated, (req, res) => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const query = 'SELECT COUNT(DISTINCT session_id) as count FROM visitor_sessions WHERE last_activity > ?';

    db.query(query, [fiveMinutesAgo], (err, results) => {
        if (err) {
            console.error('Database error fetching live visitors:', err);
            return res.json({ count: 0 });
        }
        res.json({ count: results[0].count || 0 });
    });
});

app.get('/api/dashboard/sales/today', isAuthenticated, (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const query = `
        SELECT COALESCE(SUM(total_amount), 0) as total
        FROM orders 
        WHERE DATE(order_date) = ? AND status != 'cancelled'
    `;

    db.query(query, [today], (err, results) => {
        if (err) {
            console.error('Database error fetching today sales:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ total: results[0].total || 0 });
    });
});

app.get('/api/dashboard/orders/pending', isAuthenticated, (req, res) => {
    const query = 'SELECT COUNT(*) as count FROM orders WHERE status = "pending"';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Database error fetching pending orders:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ count: results[0].count || 0 });
    });
});

app.get('/api/dashboard/products/count', isAuthenticated, (req, res) => {
    const query = 'SELECT COUNT(*) as count FROM products';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Database error fetching product count:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ count: results[0].count || 0 });
    });
});

app.get('/api/dashboard/users/count', isAuthenticated, (req, res) => {
    const query = 'SELECT COUNT(*) as count FROM users';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Database error fetching user count:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ count: results[0].count || 0 });
    });
});

app.get('/api/dashboard/stock/low', isAuthenticated, (req, res) => {
    const query = 'SELECT COUNT(*) as count FROM product_images WHERE stock < 10';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Database error fetching low stock count:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ count: results[0].count || 0 });
    });
});

// Tracking API endpoints
app.post('/api/track-carrier', async (req, res) => {
    const { trackingId, carrier } = req.body;
    
    if (!trackingId || !carrier) {
        return res.status(400).json({ success: false, message: 'Tracking ID and carrier required' });
    }
    
    const trackingService = require('./tracking-service');
    const result = await trackingService.trackAndUpdateOrder(trackingId, carrier);
    res.json(result);
});

// Individual carrier tracking APIs
app.post('/api/track/amazon', async (req, res) => {
    const { trackingId } = req.body;
    if (!trackingId) return res.status(400).json({ success: false, message: 'Tracking ID required' });
    
    const trackingService = require('./tracking-service');
    const result = await trackingService.getTrackingData(trackingId, 'amazon');
    res.json(result);
});

app.post('/api/track/xpressbees', async (req, res) => {
    const { trackingId } = req.body;
    if (!trackingId) return res.status(400).json({ success: false, message: 'Tracking ID required' });
    
    const trackingService = require('./tracking-service');
    const result = await trackingService.getTrackingData(trackingId, 'xpressbees');
    res.json(result);
});

app.post('/api/track/shiprocket', async (req, res) => {
    const { trackingId } = req.body;
    if (!trackingId) return res.status(400).json({ success: false, message: 'Tracking ID required' });
    
    const trackingService = require('./tracking-service');
    const result = await trackingService.getTrackingData(trackingId, 'shiprocket');
    res.json(result);
});

app.post('/api/bulk-update-tracking', async (req, res) => {
    const trackingService = require('./tracking-service');
    const result = await trackingService.bulkUpdateTracking();
    res.json(result);
});

app.post('/api/webhook/shiprocket', async (req, res) => {
    const { awb, current_status } = req.body;
    
    if (awb && current_status) {
        const trackingService = require('./tracking-service');
        await trackingService.trackAndUpdateOrder(awb, 'shiprocket');
    }
    
    res.json({ status: 'success' });
});

// Start server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Database: ${process.env.DB_NAME}`);
});

// User cancel order endpoint
app.post('/api/orders/:id/cancel', authenticateToken, async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.userId;
        const { reason, additionalComments } = req.body;

        // Check if order exists and belongs to user
        const orderResult = await new Promise((resolve, reject) => {
            db.query('SELECT * FROM orders WHERE order_id = ? AND user_id = ?', [orderId, userId], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });

        if (!orderResult) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Check if order can be cancelled (only pending/processing orders)
        if (!['pending', 'processing'].includes(orderResult.status)) {
            return res.status(400).json({ success: false, message: 'Order cannot be cancelled' });
        }

        // Update order status to cancelled
        await new Promise((resolve, reject) => {
            db.query('UPDATE orders SET status = ?, cancellation_reason = ?, cancellation_comments = ? WHERE order_id = ?', 
                ['cancelled', reason, additionalComments, orderId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        res.json({ success: true, message: 'Order cancelled successfully' });
    } catch (error) {
        console.error('Error cancelling order:', error);
        res.status(500).json({ success: false, message: 'Failed to cancel order' });
    }
});
// Get user addresses with JWT authentication
app.get('/api/addresses', authenticateToken, (req, res) => {
    const userId = req.userId;
    
    db.query('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC', [userId], (err, results) => {
        if (err) {
            console.error('Database error fetching addresses:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        res.json({ success: true, addresses: results });
    });
});

// Add address with JWT authentication  
app.post('/api/addresses', authenticateToken, (req, res) => {
    const userId = req.userId;
    const { fullName, mobileNo, addressLine1, addressLine2, city, district, state, pincode, isDefault } = req.body;

    if (!fullName || !mobileNo || !addressLine1 || !city || !state || !pincode) {
        return res.status(400).json({ success: false, message: 'Required fields missing' });
    }

    const insertAddress = () => {
        db.query(
            'INSERT INTO addresses (user_id, full_name, mobile_no, address_line1, address_line2, city, district, state, pincode, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [userId, fullName, mobileNo, addressLine1, addressLine2 || null, city, district, state, pincode, isDefault || false],
            (err, result) => {
                if (err) {
                    console.error('Database error saving address:', err);
                    return res.status(500).json({ success: false, message: 'Database error' });
                }
                res.json({ success: true, message: 'Address saved successfully', addressId: result.insertId });
            }
        );
    };

    if (isDefault) {
        db.query('UPDATE addresses SET is_default = FALSE WHERE user_id = ?', [userId], (err) => {
            if (err) {
                console.error('Error updating default addresses:', err);
                return res.status(500).json({ success: false, message: 'Database error' });
            }
            insertAddress();
        });
    } else {
        insertAddress();
    }
});
// Verify OTP without user check (for registration)
app.post('/api/verify-otp', async (req, res) => {
    const { mobile, otp } = req.body;

    if (!mobile || !otp) {
        return res.status(400).json({ success: false, message: 'Mobile number and OTP are required' });
    }

    try {
        // Verify OTP
        const result = await new Promise((resolve, reject) => {
            db.query('SELECT * FROM otp_verifications WHERE mobile = ? AND otp = ? AND expires_at > NOW() AND verified = FALSE ORDER BY created_at DESC LIMIT 1',
                [mobile, otp], (err, results) => {
                    if (err) reject(err);
                    else resolve(results[0]);
                });
        });

        if (!result) {
            return res.json({ success: false, message: 'Invalid or expired OTP' });
        }

        // Mark as verified
        await new Promise((resolve, reject) => {
            db.query('UPDATE otp_verifications SET verified = TRUE WHERE id = ?',
                [result.id], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
        });

        res.json({ success: true, message: 'OTP verified successfully' });
    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(500).json({ success: false, message: 'Failed to verify OTP' });
    }
});