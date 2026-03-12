-- Digital Gram Panchayat Services Portal Database Schema
-- MySQL Database

-- Create Database
CREATE DATABASE IF NOT EXISTS gram_panchayat_db;
USE gram_panchayat_db;

-- Table: Users (Citizens)
CREATE TABLE users (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(15) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    aadhar_number VARCHAR(12) UNIQUE,
    address TEXT,
    village VARCHAR(100),
    block VARCHAR(100),
    district VARCHAR(100),
    state VARCHAR(100) DEFAULT 'Rajasthan',
    pincode VARCHAR(6),
    date_of_birth DATE,
    gender ENUM('Male', 'Female', 'Other'),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    profile_image VARCHAR(255)
);

-- Table: Staff Members
CREATE TABLE staff (
    staff_id INT PRIMARY KEY AUTO_INCREMENT,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(15) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('Sarpanch', 'Secretary', 'Clerk', 'Officer') NOT NULL,
    employee_id VARCHAR(50) UNIQUE,
    department VARCHAR(100),
    panchayat_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Table: Admin
CREATE TABLE admin (
    admin_id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role ENUM('Super Admin', 'Admin') DEFAULT 'Admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Table: Services/Certificates
CREATE TABLE services (
    service_id INT PRIMARY KEY AUTO_INCREMENT,
    service_name VARCHAR(100) NOT NULL,
    service_type ENUM('Certificate', 'Scheme', 'License', 'Other') NOT NULL,
    description TEXT,
    required_documents TEXT,
    processing_time VARCHAR(50),
    fee DECIMAL(10, 2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Table: Applications
CREATE TABLE applications (
    application_id VARCHAR(50) PRIMARY KEY,
    user_id INT NOT NULL,
    service_id INT NOT NULL,
    application_data JSON,
    status ENUM('Pending', 'Under Review', 'Verification', 'Approved', 'Rejected', 'On Hold') DEFAULT 'Pending',
    submitted_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    assigned_to INT,
    remarks TEXT,
    priority ENUM('Low', 'Medium', 'High') DEFAULT 'Medium',
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (service_id) REFERENCES services(service_id),
    FOREIGN KEY (assigned_to) REFERENCES staff(staff_id)
);

-- Table: Documents
CREATE TABLE documents (
    document_id INT PRIMARY KEY AUTO_INCREMENT,
    application_id VARCHAR(50) NOT NULL,
    document_type VARCHAR(100) NOT NULL,
    document_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    file_size INT,
    uploaded_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_verified BOOLEAN DEFAULT FALSE,
    verified_by INT,
    verified_on TIMESTAMP NULL,
    FOREIGN KEY (application_id) REFERENCES applications(application_id),
    FOREIGN KEY (verified_by) REFERENCES staff(staff_id)
);

-- Table: Certificates (Approved/Generated)
CREATE TABLE certificates (
    certificate_id VARCHAR(50) PRIMARY KEY,
    application_id VARCHAR(50) NOT NULL,
    user_id INT NOT NULL,
    service_id INT NOT NULL,
    certificate_number VARCHAR(100) UNIQUE NOT NULL,
    issue_date DATE NOT NULL,
    expiry_date DATE,
    issued_by INT NOT NULL,
    certificate_file_path VARCHAR(255),
    is_valid BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES applications(application_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (service_id) REFERENCES services(service_id),
    FOREIGN KEY (issued_by) REFERENCES staff(staff_id)
);

-- Table: Status History
CREATE TABLE status_history (
    history_id INT PRIMARY KEY AUTO_INCREMENT,
    application_id VARCHAR(50) NOT NULL,
    old_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    changed_by INT,
    user_type ENUM('Staff', 'System', 'Admin'),
    remarks TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES applications(application_id)
);

-- Table: Government Schemes
CREATE TABLE schemes (
    scheme_id INT PRIMARY KEY AUTO_INCREMENT,
    scheme_name VARCHAR(200) NOT NULL,
    scheme_type VARCHAR(100),
    description TEXT,
    eligibility_criteria TEXT,
    benefits TEXT,
    application_process TEXT,
    required_documents TEXT,
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    link VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: Announcements
CREATE TABLE announcements (
    announcement_id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    announcement_type ENUM('General', 'Important', 'Urgent', 'Scheme', 'Holiday') DEFAULT 'General',
    published_by INT,
    published_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expiry_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    attachment VARCHAR(255),
    FOREIGN KEY (published_by) REFERENCES admin(admin_id)
);

-- Table: Notifications
CREATE TABLE notifications (
    notification_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    application_id VARCHAR(50),
    notification_type ENUM('Status Update', 'Document Request', 'Approval', 'Rejection', 'General'),
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (application_id) REFERENCES applications(application_id)
);

-- Table: Payments
CREATE TABLE payments (
    payment_id VARCHAR(50) PRIMARY KEY,
    application_id VARCHAR(50) NOT NULL,
    user_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method ENUM('Online', 'Cash', 'Card', 'UPI') DEFAULT 'Online',
    transaction_id VARCHAR(100),
    payment_status ENUM('Pending', 'Success', 'Failed', 'Refunded') DEFAULT 'Pending',
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    receipt_path VARCHAR(255),
    FOREIGN KEY (application_id) REFERENCES applications(application_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Table: System Logs
CREATE TABLE system_logs (
    log_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    user_type ENUM('Citizen', 'Staff', 'Admin'),
    action VARCHAR(200) NOT NULL,
    details TEXT,
    ip_address VARCHAR(45),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: Panchayat Information
CREATE TABLE panchayat_info (
    info_id INT PRIMARY KEY AUTO_INCREMENT,
    panchayat_name VARCHAR(100) NOT NULL,
    block VARCHAR(100),
    district VARCHAR(100),
    state VARCHAR(100),
    office_address TEXT,
    contact_number VARCHAR(15),
    email VARCHAR(100),
    office_hours VARCHAR(100),
    sarpanch_name VARCHAR(100),
    secretary_name VARCHAR(100)
);

-- Insert Sample Services
INSERT INTO services (service_name, service_type, description, required_documents, processing_time, fee) VALUES
('Income Certificate', 'Certificate', 'Certificate to prove annual family income', 'Aadhar Card, Ration Card, Bank Statement, Salary Slip', '7-10 days', 50.00),
('Caste Certificate', 'Certificate', 'Certificate to prove caste category', 'Aadhar Card, Birth Certificate, School Certificate, Family Certificate', '10-15 days', 50.00),
('Residence Certificate', 'Certificate', 'Certificate to prove residential address', 'Aadhar Card, Ration Card, Electricity Bill, Voter ID', '5-7 days', 30.00),
('Birth Certificate', 'Certificate', 'Official birth certificate', 'Hospital Records, Parents Aadhar, Birth Register Entry', '15-20 days', 100.00),
('Death Certificate', 'Certificate', 'Official death certificate', 'Death Register Entry, Hospital Records, Family Aadhar', '7-10 days', 50.00),
('Character Certificate', 'Certificate', 'Certificate of good character and conduct', 'Aadhar Card, Address Proof, Police Verification', '10-15 days', 30.00),
('Non-Criminal Certificate', 'Certificate', 'Certificate of no criminal record', 'Aadhar Card, Police Verification Form', '15-20 days', 100.00);

-- Insert Sample Government Schemes
INSERT INTO schemes (scheme_name, scheme_type, description, eligibility_criteria, benefits, is_active) VALUES
('PM Awas Yojana', 'Housing', 'Housing for all scheme providing financial assistance for building houses', 'BPL families, Landless households, Women-headed households', 'Financial assistance up to Rs. 1,20,000', TRUE),
('Pradhan Mantri Kisan Samman Nidhi', 'Agriculture', 'Direct income support to farmers', 'Small and marginal farmers with cultivable land', 'Rs. 6000 per year in three installments', TRUE),
('Ayushman Bharat Yojana', 'Healthcare', 'Health insurance scheme for poor families', 'Families identified as per SECC data', 'Health coverage up to Rs. 5 lakhs per family per year', TRUE),
('National Social Assistance Programme', 'Social Security', 'Pension for elderly, widows and disabled', 'Age above 60 years, BPL families, Disabled persons', 'Monthly pension', TRUE);

-- Insert Sample Admin
INSERT INTO admin (username, email, password_hash, full_name, role) VALUES
('admin', 'admin@grampanchayat.gov.in', '$2b$10$xK8H7H8KJH7KJH7KJH7KJexample', 'System Administrator', 'Super Admin');

-- Insert Sample Staff
INSERT INTO staff (full_name, email, phone, password_hash, role, employee_id, department, panchayat_name) VALUES
('Ramesh Kumar', 'ramesh.kumar@grampanchayat.gov.in', '9876543210', '$2b$10$xK8H7H8KJH7KJH7KJH7KJexample', 'Secretary', 'EMP001', 'Administration', 'Model Gram Panchayat'),
('Sunita Devi', 'sunita.devi@grampanchayat.gov.in', '9876543211', '$2b$10$xK8H7H8KJH7KJH7KJH7KJexample', 'Clerk', 'EMP002', 'Documentation', 'Model Gram Panchayat');

-- Insert Sample Citizen
INSERT INTO users (full_name, email, phone, password_hash, aadhar_number, address, village, block, district, state, pincode, date_of_birth, gender) VALUES
('Rajesh Kumar', 'rajesh.kumar@example.com', '9123456789', '$2b$10$xK8H7H8KJH7KJH7KJH7KJexample', '123456789012', 'House No. 123, Main Street', 'Rampur', 'Sanganer', 'Jaipur', 'Rajasthan', '302029', '1990-05-15', 'Male');

-- Insert Sample Panchayat Information
INSERT INTO panchayat_info (panchayat_name, block, district, state, office_address, contact_number, email, office_hours, sarpanch_name, secretary_name) VALUES
('Model Gram Panchayat', 'Sanganer', 'Jaipur', 'Rajasthan', 'Village Office, Main Road, Rampur - 302029', '0141-2345678', 'office@modelgp.gov.in', 'Mon-Fri: 10:00 AM - 5:00 PM', 'Smt. Geeta Devi', 'Shri Ramesh Kumar');

-- Insert Sample Announcements
INSERT INTO announcements (title, content, announcement_type, published_by, is_active) VALUES
('Digital Gram Panchayat Important Announcements', 'Welcome to the Digital Gram Panchayat Services Portal. All citizens can now apply for certificates online.', 'Important', 1, TRUE),
('Government Schemes in Anlaance &Ireay for Services Portal', 'Multiple government schemes are available for eligible citizens. Check the Government Schemes section for more details.', 'Scheme', 1, TRUE);

-- Create Indexes for Better Performance
CREATE INDEX idx_user_email ON users(email);
CREATE INDEX idx_application_user ON applications(user_id);
CREATE INDEX idx_application_status ON applications(status);
CREATE INDEX idx_documents_application ON documents(application_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_payments_application ON payments(application_id);
