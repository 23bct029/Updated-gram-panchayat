const express = require('express');
const router = express.Router();
const { verifyToken, isCitizen } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = './uploads/documents';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|pdf/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb('Error: Only .png, .jpg, .jpeg and .pdf files are allowed!');
        }
    }
});

// Get citizen dashboard data
router.get('/dashboard', verifyToken, isCitizen, (req, res) => {
    const db = req.app.locals.db;
    const userId = req.userId;

    // Get user info
    db.query('SELECT * FROM users WHERE user_id = ?', [userId], (err, userResults) => {
        if (err || userResults.length === 0) {
            return res.status(500).json({
                success: false,
                message: 'Error fetching user data'
            });
        }

        // Get recent applications
        const applicationsQuery = `
            SELECT a.*, s.service_name, s.service_type 
            FROM applications a 
            JOIN services s ON a.service_id = s.service_id 
            WHERE a.user_id = ? 
            ORDER BY a.created_at DESC 
            LIMIT 10
        `;

        db.query(applicationsQuery, [userId], (err, applications) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Error fetching applications'
                });
            }

            // Get notifications
            db.query(
                'SELECT * FROM notifications WHERE user_id = ? ORDER BY sent_at DESC LIMIT 5',
                [userId],
                (err, notifications) => {
                    res.json({
                        success: true,
                        user: userResults[0],
                        applications: applications,
                        notifications: notifications || []
                    });
                }
            );
        });
    });
});

// Get all services
router.get('/services', verifyToken, isCitizen, (req, res) => {
    const db = req.app.locals.db;
    
    db.query('SELECT * FROM services WHERE is_active = TRUE', (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error fetching services'
            });
        }
        res.json({
            success: true,
            services: results
        });
    });
});

// Submit new application
router.post('/apply', verifyToken, isCitizen, (req, res) => {
    const db = req.app.locals.db;
    const userId = req.userId;
    const { service_id, application_data } = req.body;

    const query = `
        INSERT INTO applications (user_id, service_id, application_data, status) 
        VALUES (?, ?, ?, 'Pending')
    `;

    db.run(query, [userId, service_id, JSON.stringify(application_data)], (err, result) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error submitting application',
                error: err.message
            });
        }

        const applicationId = result.insertId;

        // Create notification
        const notifQuery = `
            INSERT INTO notifications (user_id, application_id, notification_type, title, message) 
            VALUES (?, ?, 'Status Update', 'Application Submitted', 'Your application has been submitted successfully.')
        `;
        db.run(notifQuery, [userId, applicationId]);

        res.status(201).json({
            success: true,
            message: 'Application submitted successfully',
            application_id: applicationId
        });
    });
});

// Upload documents for application
router.post('/upload-documents', verifyToken, isCitizen, upload.array('documents', 5), (req, res) => {
    const db = req.app.locals.db;
    const { application_id, document_types } = req.body;
    const files = req.files;

    if (!files || files.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'No files uploaded'
        });
    }

    const documentTypes = JSON.parse(document_types);
    const insertPromises = [];

    files.forEach((file, index) => {
        const query = `
            INSERT INTO documents (application_id, document_type, document_name, file_path, file_size) 
            VALUES (?, ?, ?, ?, ?)
        `;
        
        insertPromises.push(
            new Promise((resolve, reject) => {
                db.run(
                    query,
                    [application_id, documentTypes[index], file.originalname, file.path, file.size],
                    (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    }
                );
            })
        );
    });

    Promise.all(insertPromises)
        .then(() => {
            res.json({
                success: true,
                message: 'Documents uploaded successfully',
                count: files.length
            });
        })
        .catch(err => {
            res.status(500).json({
                success: false,
                message: 'Error uploading documents',
                error: err.message
            });
        });
});

// Get application details
router.get('/application/:id', verifyToken, isCitizen, (req, res) => {
    const db = req.app.locals.db;
    const applicationId = req.params.id;
    const userId = req.userId;

    // Get application details
    db.query(
        `SELECT a.*, s.service_name, s.service_type, s.description 
         FROM applications a 
         JOIN services s ON a.service_id = s.service_id 
         WHERE a.application_id = ? AND a.user_id = ?`,
        [applicationId, userId],
        (err, applications) => {
            if (err || !applications || applications.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found'
                });
            }

            const application = applications[0];

            // Get documents for this application
            db.query(
                'SELECT * FROM documents WHERE application_id = ?',
                [applicationId],
                (err, documents) => {
                    res.json({
                        success: true,
                        application: application,
                        documents: documents || []
                    });
                }
            );
        }
    );
});

// Get all applications for citizen
router.get('/applications', verifyToken, isCitizen, (req, res) => {
    const db = req.app.locals.db;
    const userId = req.userId;

    const query = `
        SELECT a.*, s.service_name, s.service_type 
        FROM applications a 
        JOIN services s ON a.service_id = s.service_id 
        WHERE a.user_id = ? 
        ORDER BY a.created_at DESC
    `;

    db.query(query, [userId], (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error fetching applications'
            });
        }
        res.json({
            success: true,
            applications: results
        });
    });
});

// Get certificates for citizen
router.get('/certificates', verifyToken, isCitizen, (req, res) => {
    const db = req.app.locals.db;
    const userId = req.userId;

    const query = `
        SELECT c.*, s.service_name 
        FROM certificates c 
        JOIN services s ON c.service_id = s.service_id 
        WHERE c.user_id = ? AND c.is_valid = TRUE 
        ORDER BY c.issue_date DESC
    `;

    db.query(query, [userId], (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error fetching certificates'
            });
        }
        res.json({
            success: true,
            certificates: results
        });
    });
});

// Get notifications
router.get('/notifications', verifyToken, isCitizen, (req, res) => {
    const db = req.app.locals.db;
    const userId = req.userId;

    db.query(
        'SELECT * FROM notifications WHERE user_id = ? ORDER BY sent_at DESC',
        [userId],
        (err, results) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Error fetching notifications'
                });
            }
            res.json({
                success: true,
                notifications: results
            });
        }
    );
});

// Mark notification as read
router.put('/notifications/:id/read', verifyToken, isCitizen, (req, res) => {
    const db = req.app.locals.db;
    const notificationId = req.params.id;

    db.run(
        'UPDATE notifications SET is_read = TRUE WHERE notification_id = ?',
        [notificationId],
        (err, result) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Error updating notification'
                });
            }
            res.json({
                success: true,
                message: 'Notification marked as read'
            });
        }
    );
});

// Download certificate PDF for approved applications
router.get('/certificates/download/:id', verifyToken, isCitizen, (req, res) => {
    const db = req.app.locals.db;
    const applicationId = req.params.id;
    const userId = req.userId;

    // Verify application belongs to user and is approved
    db.query(
        `SELECT a.*, s.service_name, u.full_name as citizen_name, u.aadhar_number, u.address, u.village, u.district, u.state
         FROM applications a 
         JOIN services s ON a.service_id = s.service_id 
         JOIN users u ON a.user_id = u.user_id
         WHERE a.application_id = ? AND a.user_id = ? AND a.status = 'Approved'`,
        [applicationId, userId],
        (err, results) => {
            if (err || results.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found or not approved'
                });
            }

            const app = results[0];
            const PDFDocument = require('pdfkit');

            try {
                // Generate PDF in memory
                const doc = new PDFDocument({ size: 'A4', margin: 50 });
                const chunks = [];

                doc.on('data', (chunk) => chunks.push(chunk));
                doc.on('end', () => {
                    const pdfBuffer = Buffer.concat(chunks);
                    
                    // Set headers for download
                    res.setHeader('Content-Type', 'application/pdf');
                    res.setHeader('Content-Disposition', `attachment; filename="Certificate_${app.application_id}.pdf"`);
                    
                    // Send buffer
                    res.send(pdfBuffer);
                });

                // Create certificate content
                doc.fontSize(24).fillColor('#2563eb').text('GRAM PANCHAYAT', { align: 'center' });
                doc.fontSize(18).text('CERTIFICATE OF APPROVAL', { align: 'center' });
                doc.moveDown();

                // Certificate border
                doc.rect(40, 120, doc.page.width - 80, doc.page.height - 200).stroke();

                // Certificate content
                doc.fontSize(14).fillColor('#000');
                doc.moveDown();
                doc.text(`Application ID: APP-${app.application_id}`, { align: 'left' });
                doc.text(`Date: ${new Date(app.updated_at).toLocaleDateString('en-IN')}`, { align: 'left' });
                doc.moveDown();

                doc.fontSize(16).text(`${app.service_name || 'Certificate'}`, { align: 'center', underline: true });
                doc.moveDown();

                doc.fontSize(12);
                doc.text(`This is to certify that ${app.citizen_name}`, { align: 'left' });
                doc.text(`having Aadhar No: ${app.aadhar_number}`, { align: 'left' });
                doc.text(`residing at ${app.address || 'N/A'}`, { align: 'left' });
                doc.text(`${app.village || ''}, ${app.district || ''}, ${app.state || ''}`.replace(/,\s*,/g, ','), { align: 'left' });
                doc.moveDown();

                doc.text('has been approved for the above service/certificate.', { align: 'left' });
                doc.text('This certificate is valid and issued by the Gram Panchayat office.', { align: 'left' });
                doc.moveDown(2);

                // Footer
                doc.fontSize(10).fillColor('#666');
                doc.text(`Issued on: ${new Date().toLocaleDateString('en-IN')}`, 400, doc.page.height - 150);
                doc.moveDown();
                doc.text('Authorized Signatory', 400, doc.page.height - 100);
                doc.text('Gram Panchayat Office', 400, doc.page.height - 80);

                doc.end();
            } catch (error) {
                console.error('Error generating PDF:', error);
                return res.status(500).json({
                    success: false,
                    message: 'Error generating certificate'
                });
            }
        }
    );
});

// Download certificate (legacy endpoint)
router.get('/certificate/:id/download', verifyToken, isCitizen, (req, res) => {
    const db = req.app.locals.db;
    const certificateId = req.params.id;
    const userId = req.userId;

    // Verify certificate belongs to user
    db.query(
        'SELECT * FROM certificates WHERE certificate_id = ? AND user_id = ?',
        [certificateId, userId],
        (err, results) => {
            if (err || results.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Certificate not found'
                });
            }

            const certificate = results[0];
            const filePath = path.join(__dirname, '..', certificate.certificate_file_path);

            // Check if file exists
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({
                    success: false,
                    message: 'Certificate file not found'
                });
            }

            // Set headers for download
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${certificate.certificate_number}.pdf"`);

            // Send file
            res.sendFile(filePath);
        }
    );
});

// Get user profile
router.get('/profile', verifyToken, isCitizen, (req, res) => {
    const db = req.app.locals.db;
    const userId = req.userId;

    db.get('SELECT user_id, full_name, email_address, address, phone FROM users WHERE user_id = ?', [userId], (err, user) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error fetching profile' });
        }
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({
            success: true,
            profile: {
                name: user.full_name,
                email: user.email_address,
                address: user.address,
                phone: user.phone
            }
        });
    });
});

// Update user profile
router.put('/profile', verifyToken, isCitizen, (req, res) => {
    const db = req.app.locals.db;
    const userId = req.userId;
    const { name, address, phone } = req.body;

    if (!name) {
        return res.status(400).json({ success: false, message: 'Name is required' });
    }

    db.run(
        'UPDATE users SET full_name = ?, address = ?, phone = ?, updated_at = datetime("now") WHERE user_id = ?',
        [name, address || '', phone || '', userId],
        function(err) {
            if (err) {
                return res.status(500).json({ success: false, message: 'Error updating profile' });
            }

            res.json({
                success: true,
                message: 'Profile updated successfully',
                profile: {
                    name,
                    address,
                    phone
                }
            });
        }
    );
});

module.exports = router;


