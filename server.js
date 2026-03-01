const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const SQLiteDatabase = require('./database/sqlite-wrapper');

// Load environment variables
dotenv.config();

// Ensure JWT_SECRET is always available (fallback for missing .env)
if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'gram-panchayat-default-jwt-secret-change-in-production';
}
if (!process.env.SESSION_SECRET) {
    process.env.SESSION_SECRET = 'gram-panchayat-default-session-secret';
}

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 8001;

// CORS Configuration
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, curl, Postman)
        if (!origin) return callback(null, true);
        
        // Allow all origins in development, or specific origins in production
        const allowedOrigins = [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            process.env.FRONTEND_URL, // Add your Render frontend URL to .env
            /\.onrender\.com$/ // Allow all Render domains
        ].filter(Boolean);
        
        // Check if origin is allowed
        const isAllowed = allowedOrigins.some(allowed => {
            if (allowed instanceof RegExp) {
                return allowed.test(origin);
            }
            return allowed === origin;
        });
        
        if (isAllowed || process.env.NODE_ENV === 'development') {
            callback(null, true);
        } else {
            callback(null, true); // Allow all for now, restrict in production if needed
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Disposition']
};

// Middleware
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Enable pre-flight for all routes
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to true if using HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Database connection (SQLite)
const dbPath = path.join(__dirname, 'database', 'gram_panchayat.db');

// Ensure database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Migrate database schema - add missing columns to existing tables
const migrateDatabase = (db) => {
    return new Promise((resolve) => {
        const migrations = [
            // Add village, block, district to users if missing (old schema had 'city')
            `ALTER TABLE users ADD COLUMN village TEXT`,
            `ALTER TABLE users ADD COLUMN block TEXT`,
            `ALTER TABLE users ADD COLUMN district TEXT`,
        ];

        let done = 0;
        const runNext = () => {
            if (done >= migrations.length) {
                // Drop 'city' column not possible in SQLite, just ignore it
                console.log('✓ Database migrations checked');
                resolve();
                return;
            }
            db.db.run(migrations[done], (err) => {
                // Ignore "duplicate column" errors — means column already exists
                if (err && !err.message.includes('duplicate column')) {
                    console.log(`Migration note: ${err.message}`);
                }
                done++;
                runNext();
            });
        };
        runNext();
    });
};

// Seed default accounts with proper bcrypt hashes at runtime
const seedDefaultAccounts = (db) => {
    return new Promise(async (resolve) => {
        try {
            const adminHash = await bcrypt.hash('admin123', 10);
            const staffHash = await bcrypt.hash('staff123', 10);
            const citizenHash = await bcrypt.hash('citizen123', 10);

            // Delete old seed accounts that may have bad hashes, then re-insert
            const seeds = [
                // Admin
                {
                    check: `SELECT admin_id FROM admin WHERE email = 'admin@example.com'`,
                    del: `DELETE FROM admin WHERE email = 'admin@example.com'`,
                    insert: `INSERT INTO admin (username, email, password_hash, full_name, role) VALUES ('admin', 'admin@example.com', ?, 'Admin User', 'super_admin')`,
                    params: [adminHash],
                    label: 'Admin'
                },
                // Citizen
                {
                    check: `SELECT user_id FROM users WHERE email = 'citizen@example.com'`,
                    del: `DELETE FROM users WHERE email = 'citizen@example.com'`,
                    insert: `INSERT INTO users (full_name, email, phone, aadhar_number, password_hash, address, village, block, district, state, pincode) VALUES ('Demo Citizen', 'citizen@example.com', '9876543210', '123456789012', ?, '123 Main St', 'Demo Village', 'Demo Block', 'Demo District', 'Rajasthan', '12345')`,
                    params: [citizenHash],
                    label: 'Citizen'
                },
                // Staff
                {
                    check: `SELECT staff_id FROM staff WHERE email = 'staff@example.com'`,
                    del: `DELETE FROM staff WHERE email = 'staff@example.com'`,
                    insert: `INSERT INTO staff (full_name, email, phone, password_hash, role, employee_id, department, panchayat_name) VALUES ('Demo Staff', 'staff@example.com', '9876543211', ?, 'officer', 'EMP001', 'Administration', 'Demo Panchayat')`,
                    params: [staffHash],
                    label: 'Staff'
                }
            ];

            // Also clean up old email accounts that no longer match
            db.db.run(`DELETE FROM admin WHERE email = 'admin@panchayat.gov'`, () => {});
            db.db.run(`DELETE FROM staff WHERE email = 'staff@panchayat.gov'`, () => {});

            // Process seeds sequentially to avoid race conditions
            let done = 0;
            const processSeed = (seed) => {
                return new Promise((res) => {
                    // Delete by email first
                    db.db.run(seed.del, () => {
                        // Also delete any row with conflicting unique fields (aadhar_number, employee_id)
                        const extraDel = seed.label === 'Citizen' 
                            ? `DELETE FROM users WHERE aadhar_number = '123456789012'`
                            : seed.label === 'Staff'
                            ? `DELETE FROM staff WHERE employee_id = 'EMP001'`
                            : null;
                        const doInsert = () => {
                            db.db.run(seed.insert, seed.params, (err) => {
                                if (err) {
                                    console.error(`Error seeding ${seed.label}:`, err.message);
                                } else {
                                    console.log(`✓ ${seed.label} account seeded`);
                                }
                                res();
                            });
                        };
                        if (extraDel) {
                            db.db.run(extraDel, () => doInsert());
                        } else {
                            doInsert();
                        }
                    });
                });
            };
            for (const seed of seeds) {
                await processSeed(seed);
            }
            resolve();
        } catch (error) {
            console.error('Error seeding accounts:', error);
            resolve(); // Don't block startup
        }
    });
};

// Initialize SQLite database
const initializeDatabase = () => {
    return new Promise((resolve, reject) => {
        const db = new SQLiteDatabase(dbPath);
        
        // Read and execute schema
        const schemaPath = path.join(__dirname, 'database', 'schema-sqlite.sql');
        fs.readFile(schemaPath, 'utf8', (readErr, schema) => {
            if (readErr) {
                console.error('Error reading schema:', readErr);
                reject(readErr);
            } else {
                // Split and execute statements one by one
                const statements = schema.split(';').filter(stmt => stmt.trim());
                let executed = 0;

                const executeNext = () => {
                    if (executed >= statements.length) {
                        console.log('✓ SQLite database connected and initialized');
                        app.locals.db = db;
                        // Run migrations to add missing columns
                        migrateDatabase(db).then(() => {
                            // Seed default accounts with proper bcrypt hashes
                            seedDefaultAccounts(db).then(() => {
                                console.log('✓ Default accounts ready');
                                resolve(db);
                            });
                        });
                        return;
                    }

                    const sql = statements[executed].trim();
                    if (sql) {
                        db.db.run(sql, (err) => {
                            // Ignore "already exists" errors on CREATE TABLE
                            if (err && !err.message.includes('already exists')) {
                                console.error('Error executing statement:', err.message);
                            }
                            executed++;
                            executeNext();
                        });
                    } else {
                        executed++;
                        executeNext();
                    }
                };

                executeNext();
            }
        });
    });
};

// Import routes
const authRoutes = require('./routes/auth');
const citizenRoutes = require('./routes/citizen');
const staffRoutes = require('./routes/staff');
const adminRoutes = require('./routes/admin');
const commonRoutes = require('./routes/common');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/citizen', citizenRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/common', commonRoutes);

// Serve HTML pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'register.html'));
});

app.get('/citizen/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'citizen', 'dashboard.html'));
});

app.get('/staff/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'staff', 'dashboard.html'));
});

app.get('/admin/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'admin', 'dashboard.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : {}
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Start server - Initialize database first
initializeDatabase().then(() => {
    app.listen(PORT, () => {
        console.log('===========================================');
        console.log('Digital Gram Panchayat Services Portal');
        console.log('===========================================');
        console.log(`✓ Server running on http://localhost:${PORT}`);
        console.log(`✓ Database: SQLite (gram_panchayat.db)`);
        console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log('===========================================');
        console.log('\nDefault Credentials:');
        console.log('Admin    - admin@example.com / admin123');
        console.log('Citizen  - citizen@example.com / citizen123');
        console.log('Staff    - staff@example.com / staff123');
        console.log('===========================================\n');
    });
}).catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});

module.exports = app;
