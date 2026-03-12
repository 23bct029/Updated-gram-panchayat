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

dotenv.config();

if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'gram-panchayat-default-jwt-secret-change-in-production';
}
if (!process.env.SESSION_SECRET) {
    process.env.SESSION_SECRET = 'gram-panchayat-default-session-secret';
}

const app = express();
const PORT = process.env.PORT || 8001;

// ── CORS ──────────────────────────────────────
const corsOptions = {
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        const allowedOrigins = [
            'http://localhost:8001',
            'http://127.0.0.1:8001',
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            process.env.FRONTEND_URL,
            /\.onrender\.com$/,
            /\.github\.dev$/
        ].filter(Boolean);
        const isAllowed = allowedOrigins.some(allowed => {
            if (allowed instanceof RegExp) return allowed.test(origin);
            return allowed === origin;
        });
        callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Disposition']
};

// ── Middleware ────────────────────────────────
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// ── Database ──────────────────────────────────
const dbPath = path.join(__dirname, 'database', 'gram_panchayat.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const migrateDatabase = (db) => {
    return new Promise((resolve) => {
        const migrations = [
            `ALTER TABLE users ADD COLUMN village TEXT`,
            `ALTER TABLE users ADD COLUMN block TEXT`,
            `ALTER TABLE users ADD COLUMN district TEXT`,
            // New feature tables (safe to run repeatedly - CREATE IF NOT EXISTS)
            `CREATE TABLE IF NOT EXISTS application_corrections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                application_id INTEGER NOT NULL REFERENCES applications(application_id),
                requested_by INTEGER REFERENCES staff(staff_id),
                correction_reason TEXT NOT NULL,
                required_documents TEXT,
                correction_notes TEXT,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT (datetime('now')),
                resubmitted_at DATETIME,
                resolved_at DATETIME
            )`,
            `ALTER TABLE certificates ADD COLUMN expiry_date DATE`,
            `ALTER TABLE certificates ADD COLUMN status TEXT DEFAULT 'active'`,
            `ALTER TABLE certificates ADD COLUMN verification_hash TEXT`,
            `ALTER TABLE applications ADD COLUMN parent_certificate_id INTEGER`,
            `ALTER TABLE applications ADD COLUMN updated_at DATETIME`,
            `CREATE TABLE IF NOT EXISTS certificate_verification_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                certificate_id INTEGER NOT NULL REFERENCES certificates(certificate_id),
                verified_by INTEGER REFERENCES users(user_id),
                verification_method TEXT DEFAULT 'public',
                ip_address TEXT,
                created_at DATETIME DEFAULT (datetime('now'))
            )`,
            `CREATE TABLE IF NOT EXISTS multi_application_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                citizen_id INTEGER NOT NULL REFERENCES users(user_id),
                purpose TEXT NOT NULL,
                total_services INTEGER DEFAULT 0,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT (datetime('now'))
            )`,
            `ALTER TABLE applications ADD COLUMN multi_request_id INTEGER`,
            `CREATE TABLE IF NOT EXISTS citizen_timeline_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                citizen_id INTEGER NOT NULL REFERENCES users(user_id),
                event_type TEXT NOT NULL,
                event_title TEXT NOT NULL,
                event_description TEXT,
                reference_id INTEGER,
                created_at DATETIME DEFAULT (datetime('now'))
            )`,
            `CREATE TABLE IF NOT EXISTS village_demographics_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                data TEXT NOT NULL,
                created_at DATETIME DEFAULT (datetime('now'))
            )`,
            `ALTER TABLE users ADD COLUMN gender TEXT`,
            `ALTER TABLE users ADD COLUMN dob DATE`,
            `CREATE TABLE IF NOT EXISTS service_usage_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                service_id INTEGER REFERENCES services(service_id),
                stat_date DATE DEFAULT (date('now')),
                request_count INTEGER DEFAULT 0,
                approved_count INTEGER DEFAULT 0
            )`,
            `CREATE TABLE IF NOT EXISTS staff_workload (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                staff_id INTEGER UNIQUE REFERENCES staff(staff_id),
                pending_count INTEGER DEFAULT 0,
                approved_count INTEGER DEFAULT 0,
                updated_at DATETIME DEFAULT (datetime('now'))
            )`,
            `CREATE TABLE IF NOT EXISTS staff_assignments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                staff_id INTEGER REFERENCES staff(staff_id),
                application_id INTEGER UNIQUE REFERENCES applications(application_id),
                assigned_at DATETIME DEFAULT (datetime('now'))
            )`,
        ];
        let done = 0;
        const runNext = () => {
            if (done >= migrations.length) {
                console.log('✓ Database migrations checked');
                resolve();
                return;
            }
            db.db.run(migrations[done], (err) => {
                if (err && !err.message.includes('duplicate column') && !err.message.includes('already exists')) {
                    console.log(`Migration note: ${err.message}`);
                }
                done++;
                runNext();
            });
        };
        runNext();
    });
};

const seedDefaultAccounts = (db) => {
    return new Promise(async (resolve) => {
        try {
            const adminHash = await bcrypt.hash('admin123', 10);
            const staffHash = await bcrypt.hash('staff123', 10);
            const citizenHash = await bcrypt.hash('citizen123', 10);

            const runSerial = (statements) => new Promise((res) => {
                let i = 0;
                const next = () => {
                    if (i >= statements.length) return res();
                    const [sql, params, label] = statements[i++];
                    db.db.run(sql, params || [], (err) => {
                        if (err && label) console.log(`Seed note (${label}): ${err.message}`);
                        next();
                    });
                };
                next();
            });

            // Clean up any old/conflicting seed data first
            await runSerial([
                [`DELETE FROM admin WHERE email = 'admin@example.com'`, [], null],
                [`DELETE FROM admin WHERE email = 'admin@panchayat.gov'`, [], null],
                [`DELETE FROM users WHERE email = 'citizen@example.com'`, [], null],
                [`DELETE FROM users WHERE aadhar_number = '123456789012'`, [], null],
                [`DELETE FROM staff WHERE email = 'staff@example.com'`, [], null],
                [`DELETE FROM staff WHERE employee_id = 'EMP001'`, [], null],
                [`DELETE FROM staff WHERE email = 'staff@panchayat.gov'`, [], null],
            ]);

            // Insert fresh seed data
            await runSerial([
                [
                    `INSERT INTO admin (username, email, password_hash, full_name, role) VALUES ('admin', 'admin@example.com', ?, 'Admin User', 'super_admin')`,
                    [adminHash], 'Admin'
                ],
                [
                    `INSERT INTO users (full_name, email, phone, aadhar_number, password_hash, address, village, block, district, state, pincode) VALUES ('Demo Citizen', 'citizen@example.com', '9876543210', '123456789012', ?, '123 Main St', 'Demo Village', 'Demo Block', 'Demo District', 'Rajasthan', '12345')`,
                    [citizenHash], 'Citizen'
                ],
                [
                    `INSERT INTO staff (full_name, email, phone, password_hash, role, employee_id, department, panchayat_name) VALUES ('Demo Staff', 'staff@example.com', '9876543211', ?, 'officer', 'EMP001', 'Administration', 'Demo Panchayat')`,
                    [staffHash], 'Staff'
                ],
            ]);

            console.log('✓ Admin account seeded');
            console.log('✓ Citizen account seeded');
            console.log('\u2713 Staff account seeded');

            // Seed sample announcements
            const announcements = [
              ['Free Medical Camp – March 28-31', 'A free medical camp will be conducted from March 28 to March 31 at the Gram Panchayat Office. All residents are invited. Please bring: Aadhar Card, Birth Certificate, and any recent medical checkup reports. Free checkup for blood pressure, diabetes, and eye care will be available.', 'health'],
              ['Water Supply Maintenance – April 3', 'The water supply will be suspended on April 3rd from 9 AM to 5 PM for pipeline maintenance. Please store adequate water in advance.', 'notice'],
              ['PM-KISAN Registration Drive', 'Eligible farmers can register for PM-KISAN scheme at the Panchayat office. Bring land documents, Aadhar, and bank passbook. Registration open until March 31.', 'scheme'],
              ['Panchayat Budget Meeting – April 10', 'Annual budget meeting will be held on April 10 at 10 AM. All ward members and citizens are invited to participate in the planning process.', 'meeting'],
            ];
            const annDb = db;
            announcements.forEach(([title, content, type]) => {
              annDb.db.run(
                "INSERT OR IGNORE INTO announcements (title, content, announcement_type, published_by, is_active, published_on) VALUES (?, ?, ?, 1, 1, datetime('now'))",
                [title, content, type], (err) => { if (err && !err.message.includes('UNIQUE')) {} }
              );
            });
            resolve();
        } catch (error) {
            console.error('Error seeding accounts:', error);
            resolve();
        }
    });
};

const initializeDatabase = () => {
    return new Promise((resolve, reject) => {
        const db = new SQLiteDatabase(dbPath);
        const schemaPath = path.join(__dirname, 'database', 'schema-sqlite.sql');
        fs.readFile(schemaPath, 'utf8', (readErr, schema) => {
            if (readErr) { console.error('Error reading schema:', readErr); reject(readErr); return; }
            const statements = schema.split(';').filter(stmt => stmt.trim());
            let executed = 0;
            const executeNext = () => {
                if (executed >= statements.length) {
                    console.log('✓ SQLite database connected and initialized');
                    app.locals.db = db;
                    migrateDatabase(db).then(() => {
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
                        if (err && !err.message.includes('already exists')) {
                            console.error('Error executing statement:', err.message);
                        }
                        executed++;
                        executeNext();
                    });
                } else { executed++; executeNext(); }
            };
            executeNext();
        });
    });
};

// ── Routes ────────────────────────────────────
const authRoutes = require('./routes/auth');
const citizenRoutes = require('./routes/citizen');
const staffRoutes = require('./routes/staff');
const adminRoutes = require('./routes/admin');
const commonRoutes = require('./routes/common');

app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);
app.use('/api/citizen', citizenRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/admin', adminRoutes);

// Public endpoints (no auth)
app.get('/api/public/announcements', (req, res) => {
  const db = req.app.locals.db;
  db.all("SELECT * FROM announcements WHERE is_active=1 AND (expiry_date IS NULL OR expiry_date > datetime('now')) ORDER BY published_on DESC LIMIT 20",
    [], (err, rows) => { res.json(rows || []); });
});

app.get('/api/public/schemes', (req, res) => {
  res.json([
    { id:1, name:'PM-KISAN', category:'Agriculture', desc:'Direct income support of Rs.6,000/year for farmers.', eligibility:'Farmers owning cultivable land', benefit:'Rs.6,000 per year', link:'https://pmkisan.gov.in' },
    { id:2, name:'MNREGA', category:'Employment', desc:'100 days guaranteed wage employment for rural households.', eligibility:'Rural households', benefit:'100 days work guarantee', link:'https://nrega.nic.in' },
    { id:3, name:'PMAY-G', category:'Housing', desc:'Financial assistance to BPL families to build pucca houses.', eligibility:'BPL families, SC/ST, minorities', benefit:'Up to Rs.1.30 lakh', link:'https://pmayg.nic.in' },
    { id:4, name:'Sukanya Samriddhi', category:'Women & Child', desc:'Savings scheme for girl child education and marriage.', eligibility:'Girl child below 10 years', benefit:'8.2% interest rate, tax benefits', link:'https://www.nsiindia.gov.in' },
    { id:5, name:'Ayushman Bharat', category:'Healthcare', desc:'Health coverage of Rs.5 lakh per family per year.', eligibility:'Bottom 40% population', benefit:'Rs.5 lakh health insurance/year', link:'https://pmjay.gov.in' },
    { id:6, name:'PM Ujjwala Yojana', category:'Energy', desc:'Free LPG connections to women from BPL households.', eligibility:'BPL women, 18+ years', benefit:'Free LPG connection + first refill', link:'https://pmuy.gov.in' },
    { id:7, name:'Kisan Credit Card', category:'Agriculture', desc:'Credit facility for farmers at subsidised interest.', eligibility:'Farmers, sharecroppers, tenant farmers', benefit:'Credit up to Rs.3 lakh at 7%', link:'https://www.nabard.org' },
    { id:8, name:'National Pension Scheme', category:'Social Security', desc:'Pension scheme for unorganised sector workers.', eligibility:'Age 18-40, unorganised workers', benefit:'Rs.3,000/month pension after 60', link:'https://www.npscra.nsdl.co.in' }
  ]);
});

// ── HTML Pages ────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, 'public', 'favicon.svg')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'views', 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'views', 'register.html')));
app.get('/citizen/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'views', 'citizen', 'dashboard.html')));
app.get('/staff/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'views', 'staff', 'dashboard.html')));
app.get('/admin/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'views', 'admin', 'dashboard.html')));

// ── QR Verification (LAST - catch-all) ───────
app.use('/', commonRoutes);

// ── Error handlers ────────────────────────────
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, message: 'Something went wrong!', error: process.env.NODE_ENV === 'development' ? err.message : {} });
});

app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

// ── Start ─────────────────────────────────────
initializeDatabase().then(() => {
    app.listen(PORT, () => {
        console.log('===========================================');
        console.log('Digital Gram Panchayat Services Portal');
        console.log('===========================================');
        console.log(`✓ Server running on http://localhost:${PORT}`);
        console.log(`✓ Database: SQLite (gram_panchayat.db)`);
        console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log('===========================================');
        console.log('Default Credentials:');
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