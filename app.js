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
const JWT_SECRET = process.env.JWT_SECRET;

console.log('Node.js server starting...'); // Added for debugging

const app = express();

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

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
    origin: ['http://localhost:3000', 'https://www.bbqstyle.in', 'https://bbqstyle.in', 'https://admin.bbqstyle.in', 'https://bbqstyle-backend.onrender.com'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Handle preflight requests
app.options('*', cors({
    origin: ['http://localhost:3000', 'https://www.bbqstyle.in', 'https://bbqstyle.in', 'https://admin.bbqstyle.in', 'https://bbqstyle-backend.onrender.com'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Additional CORS middleware for admin routes
app.use('/api/admin/*', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
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
// Serve static files with absolute URLs for admin subdomain
app.use('/uploads', (req, res, next) => {
    if (req.get('host') && req.get('host').includes('admin.bbqstyle.in')) {
        return res.redirect(`https://bbqstyle.in${req.originalUrl}`);
    }
    next();
}, express.static(path.join(__dirname, 'public', 'uploads')));

app.use('/src', (req, res, next) => {
    if (req.get('host') && req.get('host').includes('admin.bbqstyle.in')) {
        return res.redirect(`https://bbqstyle.in${req.originalUrl}`);
    }
    next();
}, express.static(path.join(__dirname, 'src')));

app.use('/src/categories', (req, res, next) => {
    if (req.get('host') && req.get('host').includes('admin.bbqstyle.in')) {
        return res.redirect(`https://bbqstyle.in${req.originalUrl}`);
    }
    next();
}, express.static(path.join(__dirname, 'src', 'categories')));

app.use('/src/collections', (req, res, next) => {
    if (req.get('host') && req.get('host').includes('admin.bbqstyle.in')) {
        return res.redirect(`https://bbqstyle.in${req.originalUrl}`);
    }
    next();
}, express.static(path.join(__dirname, 'src', 'collections')));

app.use('/src/slides', (req, res, next) => {
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

// Get invoice data for order
app.get('/api/orders/:orderId/invoice', authenticateToken, (req, res) => {
    const orderId = req.params.orderId;
    const userId = req.userId;

    // Get order details with customer info
    const orderQuery = `
        SELECT o.*, a.full_name, a.mobile_no, a.address_line1, a.address_line2, 
               a.city, a.state, a.pincode, u.email
        FROM orders o
        JOIN addresses a ON o.address_id = a.address_id
        JOIN users u ON o.user_id = u.user_id
        WHERE o.order_id = ? AND o.user_id = ?
    `;

    db.query(orderQuery, [orderId, userId], (err, orderResults) => {
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
            SELECT oi.*, p.title, p.hsn
            FROM order_items oi
            JOIN products p ON oi.product_id = p.product_id
            WHERE oi.order_id = ?
        `;

        db.query(itemsQuery, [orderId], (itemsErr, itemsResults) => {
            if (itemsErr) {
                console.error('Database error fetching order items:', itemsErr);
                return res.status(500).json({ success: false, message: 'Database error' });
            }

            const invoice = {
                company: {
                    name: 'BBQ Style',
                    address: 'Kolkata, West Bengal, India',
                    gstin: '19AABCU9603R1ZM',
                    email: 'support@bbqstyle.in',
                    phone: '+91 8901551059'
                },
                order: {
                    order_id: order.order_id,
                    order_date: order.order_date,
                    payment_mode: order.payment_mode,
                    subtotal: order.subtotal,
                    discount: order.discount || 0,
                    total_amount: order.total_amount
                },
                customer: {
                    name: order.full_name,
                    mobile: order.mobile_no,
                    email: order.email,
                    address: {
                        line1: order.address_line1,
                        line2: order.address_line2,
                        city: order.city,
                        state: order.state,
                        pincode: order.pincode
                    }
                },
                items: itemsResults.map(item => ({
                    title: item.title,
                    variant_detail: item.variant_detail,
                    hsn: item.hsn || '61091000',
                    quantity: item.quantity,
                    price: item.price,
                    total: item.price * item.quantity
                }))
            };

            res.json({ success: true, invoice });
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
app.post('/api/subscribers', (req, res) => {
    const { customer_name, email_id } = req.body;
    if (!customer_name || !email_id) {
        return res.status(400).json({ error: 'Name and email are required' });
    }

    // Check if email already exists
    db.query('SELECT * FROM subscribers WHERE email_id = ?', [email_id], (checkErr, existing) => {
        if (checkErr) {
            console.error('Database check error:', checkErr);
            return res.status(500).json({ error: 'Database error' });
        }

        if (existing.length > 0) {
            return res.status(409).json({ error: 'Email already subscribed' });
        }

        const query = 'INSERT INTO subscribers (customer_name, email_id) VALUES (?, ?)';
        db.query(query, [customer_name, email_id], (err, result) => {
            if (err) {
                console.error('Database insert error:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.status(201).json({ message: 'Subscriber added', subscriberId: result.insertId });
        });
    });
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