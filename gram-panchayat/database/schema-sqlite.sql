-- SQLite Database Schema for Gram Panchayat Portal

-- Users Table (Citizens)
CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT NOT NULL,
    aadhar_number TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    address TEXT,
    village TEXT,
    block TEXT,
    district TEXT,
    state TEXT,
    pincode TEXT,
    date_of_birth DATE,
    gender TEXT,
    profile_image TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Staff Table
CREATE TABLE IF NOT EXISTS staff (
    staff_id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    employee_id TEXT UNIQUE NOT NULL,
    department TEXT,
    panchayat_name TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admin Table
CREATE TABLE IF NOT EXISTS admin (
    admin_id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT DEFAULT 'super_admin',
    is_active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Services Table
CREATE TABLE IF NOT EXISTS services (
    service_id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_name TEXT NOT NULL,
    service_type TEXT NOT NULL,
    description TEXT,
    required_documents TEXT,
    processing_time TEXT,
    fee DECIMAL(10, 2),
    is_active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Applications Table
CREATE TABLE IF NOT EXISTS applications (
    application_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    service_id INTEGER NOT NULL,
    application_data TEXT,
    status TEXT DEFAULT 'pending',
    assigned_to INTEGER,
    remarks TEXT,
    priority TEXT DEFAULT 'normal',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (service_id) REFERENCES services(service_id),
    FOREIGN KEY (assigned_to) REFERENCES staff(staff_id)
);

-- Documents Table
CREATE TABLE IF NOT EXISTS documents (
    document_id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    document_type TEXT NOT NULL,
    document_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    is_verified BOOLEAN DEFAULT 0,
    verified_by INTEGER,
    verified_on TIMESTAMP,
    uploaded_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES applications(application_id),
    FOREIGN KEY (verified_by) REFERENCES staff(staff_id)
);

-- Certificates Table
CREATE TABLE IF NOT EXISTS certificates (
    certificate_id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    service_id INTEGER NOT NULL,
    certificate_number TEXT UNIQUE NOT NULL,
    issue_date DATE NOT NULL,
    expiry_date DATE,
    issued_by INTEGER,
    certificate_file_path TEXT,
    is_valid BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES applications(application_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (service_id) REFERENCES services(service_id),
    FOREIGN KEY (issued_by) REFERENCES staff(staff_id)
);

-- Status History Table
CREATE TABLE IF NOT EXISTS status_history (
    history_id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    old_status TEXT,
    new_status TEXT NOT NULL,
    changed_by INTEGER,
    user_type TEXT,
    remarks TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES applications(application_id)
);

-- Schemes Table
CREATE TABLE IF NOT EXISTS schemes (
    scheme_id INTEGER PRIMARY KEY AUTOINCREMENT,
    scheme_name TEXT NOT NULL,
    scheme_type TEXT NOT NULL,
    description TEXT,
    eligibility_criteria TEXT,
    benefits TEXT,
    application_process TEXT,
    required_documents TEXT,
    dates TEXT,
    is_active BOOLEAN DEFAULT 1,
    link TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Announcements Table
CREATE TABLE IF NOT EXISTS announcements (
    announcement_id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    announcement_type TEXT,
    published_by INTEGER,
    is_active BOOLEAN DEFAULT 1,
    attachment TEXT,
    published_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expiry_date TIMESTAMP,
    FOREIGN KEY (published_by) REFERENCES admin(admin_id)
);

-- Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    application_id INTEGER,
    notification_type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT 0,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (application_id) REFERENCES applications(application_id)
);

-- Payments Table
CREATE TABLE IF NOT EXISTS payments (
    payment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method TEXT NOT NULL,
    transaction_id TEXT,
    payment_status TEXT DEFAULT 'pending',
    receipt_path TEXT,
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES applications(application_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- System Logs Table
CREATE TABLE IF NOT EXISTS system_logs (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    user_type TEXT,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Panchayat Info Table
CREATE TABLE IF NOT EXISTS panchayat_info (
    info_id INTEGER PRIMARY KEY AUTOINCREMENT,
    panchayat_name TEXT NOT NULL,
    block TEXT,
    district TEXT,
    state TEXT,
    office_address TEXT,
    contact_number TEXT,
    email TEXT,
    office_hours TEXT,
    sarpanch_name TEXT,
    secretary_name TEXT
);

-- Create Indexes
CREATE INDEX IF NOT EXISTS idx_user_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_app_user ON applications(user_id);
CREATE INDEX IF NOT EXISTS idx_app_service ON applications(service_id);
CREATE INDEX IF NOT EXISTS idx_app_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_staff_email ON staff(email);
CREATE INDEX IF NOT EXISTS idx_cert_app ON certificates(application_id);

-- Insert Sample Data
INSERT OR IGNORE INTO admin (username, email, password_hash, full_name, role) 
VALUES ('admin', 'admin@example.com', '$2b$10$jXfZiqfYFXo2PfrojoKuieof6IPH6fHiogF7r9Vo0vZdAGCO7dQL6', 'Admin User', 'super_admin');

INSERT OR IGNORE INTO users (full_name, email, phone, aadhar_number, password_hash, address, village, block, district, state, pincode)
VALUES ('Demo Citizen', 'citizen@example.com', '9876543210', '123456789012', '$2b$10$4EboRW7AZin68cWB/gs41.STD0d3BxExFnO3gMOG4IC28bfQGUlri', '123 Main St', 'Demo Village', 'Demo Block', 'Demo District', 'Rajasthan', '12345');

INSERT OR IGNORE INTO staff (full_name, email, phone, password_hash, role, employee_id, department, panchayat_name)
VALUES ('Demo Staff', 'staff@example.com', '9876543211', '$2b$10$qiDWCzy6L2UpWYgdYY9l3uDPJD8.YW70dSjmGJXGIVnrG1WqAq6Ey', 'officer', 'EMP001', 'Administration', 'Demo Panchayat');

INSERT OR IGNORE INTO services (service_name, service_type, description, required_documents, processing_time, fee)
VALUES 
('Birth Certificate', 'certificate', 'Official birth certificate', 'ID Proof, Address Proof', '5-7 days', 100),
('Death Certificate', 'certificate', 'Official death certificate', 'ID Proof, Medical Certificate', '3-5 days', 50),
('Caste Certificate', 'certificate', 'Official caste certificate', 'Aadhar, ID Proof', '10-15 days', 150),
('Income Certificate', 'certificate', 'Income certificate for subsidies', 'ID Proof, Residence Proof', '7-10 days', 200);

INSERT OR IGNORE INTO schemes (scheme_name, scheme_type, description, eligibility_criteria, benefits)
VALUES 
('PM-KISAN', 'Agriculture', 'Direct income support for farmers', 'Farmers with land holdings', '₹6000 per year'),
('MNREGA', 'Employment', 'Guaranteed employment scheme', 'Rural laborers', '100 days work guarantee'),
('Social Security', 'Welfare', 'Pension for elderly', 'Age 60+', 'Monthly pension');

INSERT OR IGNORE INTO panchayat_info (panchayat_name, block, district, state, office_address, contact_number, email, office_hours, sarpanch_name, secretary_name)
VALUES ('Test Panchayat', 'Test Block', 'Test District', 'Test State', 'Panchayat Office, Village', '9876543210', 'info@panchayat.gov', '9:00 AM - 5:00 PM', 'Sarpanch Name', 'Secretary Name');
