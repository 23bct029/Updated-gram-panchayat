const express = require('express');
const router = express.Router();
const { verifyToken, isStaff } = require('../middleware/auth');
const { generateCertificatePDF } = require('../utils/pdf');
const path = require('path');
const fs = require('fs');

// Get staff dashboard data
router.get('/dashboard', verifyToken, isStaff, (req, res) => {
    const db = req.app.locals.db;
    const staffId = req.userId;

    // Get pending applications count
    db.query("SELECT COUNT(*) as pending FROM applications WHERE status = 'Pending'", (err, pendingCount) => {
        if (err) {
            console.error('Error counting pending:', err.message);
        }
        // Get assigned applications
        const assignedQuery = `
            SELECT a.*, s.service_name, u.full_name as citizen_name, u.phone 
            FROM applications a 
            JOIN services s ON a.service_id = s.service_id 
            JOIN users u ON a.user_id = u.user_id 
            WHERE a.assigned_to = ? OR a.assigned_to IS NULL
            ORDER BY a.created_at DESC 
            LIMIT 20
        `;

        db.query(assignedQuery, [staffId], (err, applications) => {
            if (err) {
                console.error('Error fetching applications:', err.message);
                return res.status(500).json({
                    success: false,
                    message: 'Error fetching dashboard data'
                });
            }

            res.json({
                success: true,
                pendingCount: (pendingCount && pendingCount[0]) ? pendingCount[0].pending : 0,
                applications: applications || []
            });
        });
    });
});

// Get all applications
router.get('/applications', verifyToken, isStaff, (req, res) => {
    const db = req.app.locals.db;
    const { status, search } = req.query;

    let query = `
        SELECT a.*, s.service_name, u.full_name as citizen_name, u.phone, u.email 
        FROM applications a 
        JOIN services s ON a.service_id = s.service_id 
        JOIN users u ON a.user_id = u.user_id 
        WHERE 1=1
    `;
    const params = [];

    if (status) {
        query += ' AND a.status = ?';
        params.push(status);
    }

    if (search) {
        query += ' AND (a.application_id LIKE ? OR u.full_name LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY a.created_at DESC';

    db.query(query, params, (err, results) => {
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

// Get application details
router.get('/application/:id', verifyToken, isStaff, (req, res) => {
    const db = req.app.locals.db;
    const applicationId = req.params.id;

    const query = `
        SELECT a.*, s.service_name, s.description, 
               u.full_name as citizen_name, u.phone, u.email, u.address, u.aadhar_number 
        FROM applications a 
        JOIN services s ON a.service_id = s.service_id 
        JOIN users u ON a.user_id = u.user_id 
        WHERE a.application_id = ?
    `;

    db.query(query, [applicationId], (err, appResults) => {
        if (err || appResults.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }

        // Get documents
        db.query(
            'SELECT * FROM documents WHERE application_id = ?',
            [applicationId],
            (err, documents) => {
                // Get status history
                db.query(
                    'SELECT * FROM status_history WHERE application_id = ? ORDER BY changed_at DESC',
                    [applicationId],
                    (err, history) => {
                        res.json({
                            success: true,
                            application: appResults[0],
                            documents: documents || [],
                            history: history || []
                        });
                    }
                );
            }
        );
    });
});

// Update application status
router.put('/application/:id/status', verifyToken, isStaff, (req, res) => {
    const db = req.app.locals.db;
    const applicationId = req.params.id;
    const staffId = req.userId;
    const { status, remarks } = req.body;

    // Get current status first
    db.query('SELECT status, user_id FROM applications WHERE application_id = ?', [applicationId], (err, currentApp) => {
        if (err || currentApp.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }

        const oldStatus = currentApp[0].status;
        const userId = currentApp[0].user_id;

        // Update application
        const updateQuery = `
            UPDATE applications 
            SET status = ?, remarks = ?, assigned_to = ?, updated_at = DATETIME('now') 
            WHERE application_id = ?
        `;

        db.run(updateQuery, [status, remarks, staffId, applicationId], (err) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Error updating application status'
                });
            }

            // Add to status history
            const historyQuery = `
                INSERT INTO status_history (application_id, old_status, new_status, changed_by, user_type, remarks) 
                VALUES (?, ?, ?, ?, 'Staff', ?)
            `;
            db.run(historyQuery, [applicationId, oldStatus, status, staffId, remarks]);

            // Create notification for citizen
            const notifQuery = `
                INSERT INTO notifications (user_id, application_id, notification_type, title, message) 
                VALUES (?, ?, 'Status Update', ?, ?)
            `;
            const notifTitle = `Application ${status}`;
            const notifMessage = `Your application ${applicationId} status has been updated to ${status}. ${remarks || ''}`;
            db.run(notifQuery, [userId, applicationId, notifTitle, notifMessage]);

            res.json({
                success: true,
                message: 'Application status updated successfully'
            });
        });
    });
});

// Verify document
router.put('/document/:id/verify', verifyToken, isStaff, (req, res) => {
    const db = req.app.locals.db;
    const documentId = req.params.id;
    const staffId = req.userId;

    const query = `
        UPDATE documents 
        SET is_verified = TRUE, verified_by = ?, verified_on = DATETIME('now') 
        WHERE document_id = ?
    `;

    db.run(query, [staffId, documentId], (err, result) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error verifying document'
            });
        }
        res.json({
            success: true,
            message: 'Document verified successfully'
        });
    });
});

// Approve application and generate certificate
router.post('/application/:id/approve', verifyToken, isStaff, (req, res) => {
    const db = req.app.locals.db;
    const applicationId = req.params.id;
    const staffId = req.userId;

    // Get complete application, user, and service details
    const detailsQuery = `
        SELECT a.*, u.full_name, u.aadhar_number, u.address, u.village, u.district, u.state,
               s.service_name, s.service_type
        FROM applications a
        JOIN users u ON a.user_id = u.user_id
        JOIN services s ON a.service_id = s.service_id
        WHERE a.application_id = ?
    `;

    db.query(detailsQuery, [applicationId], async (err, appResults) => {
        if (err || appResults.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }

        const application = appResults[0];
        const { user_id, service_id, full_name, aadhar_number, address, village, district, state, service_name } = application;

        // Generate certificate
        const certificateId = 'CERT' + Date.now();
        const certificateNumber = 'CERT-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        const issueDate = new Date().toISOString().split('T')[0];

        // Ensure uploads directory exists
        const uploadsDir = path.join(__dirname, '..', 'uploads', 'certificates');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        // Generate PDF file path
        const pdfFileName = `${certificateNumber}.pdf`;
        const pdfFilePath = path.join(uploadsDir, pdfFileName);

        // Prepare certificate data for PDF
        const certificateData = {
            certificate_number: certificateNumber,
            issue_date: issueDate,
            service_name: service_name,
            user_name: full_name,
            aadhar_number: aadhar_number,
            address: address || '',
            village: village || '',
            district: district || '',
            state: state || ''
        };

        try {
            // Generate PDF
            await generateCertificatePDF(certificateData, pdfFilePath);

            // Insert certificate record
            const certQuery = `
                INSERT INTO certificates 
                (application_id, user_id, service_id, certificate_number, issue_date, issued_by, certificate_file_path) 
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;

            db.run(certQuery, [applicationId, user_id, service_id, certificateNumber, issueDate, staffId, `/uploads/certificates/${pdfFileName}`], (err) => {
                if (err) {
                    return res.status(500).json({
                        success: false,
                        message: 'Error generating certificate',
                        error: err.message
                    });
                }

                // Update application status to Approved
                db.run("UPDATE applications SET status = 'Approved' WHERE application_id = ?", [applicationId]);

                // Create notification
                const notifQuery = `
                    INSERT INTO notifications (user_id, application_id, notification_type, title, message) 
                    VALUES (?, ?, 'Approval', 'Application Approved', 'Your application has been approved. Certificate is ready for download.')
                `;
                db.run(notifQuery, [user_id, applicationId]);

                res.json({
                    success: true,
                    message: 'Application approved and certificate generated',
                    certificate_id: certificateId,
                    certificate_number: certificateNumber,
                    pdf_path: `/uploads/certificates/${pdfFileName}`
                });
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Error generating PDF',
                error: error.message
            });
        }
    });
});

// Reject application
router.post('/application/:id/reject', verifyToken, isStaff, (req, res) => {
    const db = req.app.locals.db;
    const applicationId = req.params.id;
    const staffId = req.userId;
    const { reason } = req.body;

    // Get user_id for notification
    db.query('SELECT user_id FROM applications WHERE application_id = ?', [applicationId], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }

        const userId = results[0].user_id;

        // Update application status
        db.run(
            "UPDATE applications SET status = 'Rejected', remarks = ? WHERE application_id = ?",
            [reason, applicationId],
            (err) => {
                if (err) {
                    return res.status(500).json({
                        success: false,
                        message: 'Error rejecting application'
                    });
                }

                // Create notification
                const notifQuery = `
                    INSERT INTO notifications (user_id, application_id, notification_type, title, message) 
                    VALUES (?, ?, 'Rejection', 'Application Rejected', ?)
                `;
                db.run(notifQuery, [userId, applicationId, `Your application has been rejected. Reason: ${reason}`]);

                res.json({
                    success: true,
                    message: 'Application rejected'
                });
            }
        );
    });
});

// Get statistics
router.get('/statistics', verifyToken, isStaff, (req, res) => {
    const db = req.app.locals.db;

    const statsQuery = `
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) as approved,
            SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END) as rejected,
            SUM(CASE WHEN status = 'Verification' THEN 1 ELSE 0 END) as verification
        FROM applications
    `;

    db.query(statsQuery, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error fetching statistics'
            });
        }
        const stats = (results && results[0]) ? results[0] : { total: 0, pending: 0, approved: 0, rejected: 0, verification: 0 };
        res.json({
            success: true,
            statistics: stats
        });
    });
});

// Get staff profile
router.get('/profile', verifyToken, isStaff, (req, res) => {
    const db = req.app.locals.db;
    const staffId = req.staffId || req.userId;

    db.query('SELECT staff_id, staff_name, email_address, phone FROM staff WHERE staff_id = ?', [staffId], (err, results) => {
        if (err || !results || results.length === 0) {
            return res.status(404).json({ success: false, message: 'Staff not found' });
        }

        const staff = results[0];
        res.json({
            success: true,
            profile: {
                name: staff.staff_name,
                email: staff.email_address,
                phone: staff.phone
            }
        });
    });
});

// Update staff profile
router.put('/profile', verifyToken, isStaff, (req, res) => {
    const db = req.app.locals.db;
    const staffId = req.staffId || req.userId;
    const { name, phone } = req.body;

    if (!name) {
        return res.status(400).json({ success: false, message: 'Name is required' });
    }

    db.run(
        'UPDATE staff SET staff_name = ?, phone = ?, updated_at = datetime("now") WHERE staff_id = ?',
        [name, phone || '', staffId],
        function(err) {
            if (err) {
                return res.status(500).json({ success: false, message: 'Error updating profile' });
            }

            res.json({
                success: true,
                message: 'Profile updated successfully',
                profile: {
                    name,
                    phone
                }
            });
        }
    );
});

module.exports = router;
