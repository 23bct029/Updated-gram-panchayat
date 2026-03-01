const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin } = require('../middleware/auth');
const bcrypt = require('bcrypt');

// Get admin dashboard statistics
router.get('/dashboard', verifyToken, isAdmin, (req, res) => {
    const db = req.app.locals.db;

    // Get various statistics
    const queries = {
        totalUsers: 'SELECT COUNT(*) as count FROM users',
        totalApplications: 'SELECT COUNT(*) as count FROM applications',
        pendingApplications: 'SELECT COUNT(*) as count FROM applications WHERE status = "Pending"',
        approvedApplications: 'SELECT COUNT(*) as count FROM applications WHERE status = "Approved"',
        totalStaff: 'SELECT COUNT(*) as count FROM staff',
        totalServices: 'SELECT COUNT(*) as count FROM services WHERE is_active = TRUE'
    };

    const stats = {};
    const queryPromises = Object.keys(queries).map(key => {
        return new Promise((resolve, reject) => {
            db.query(queries[key], (err, results) => {
                if (err) reject(err);
                else {
                    stats[key] = results[0].count;
                    resolve();
                }
            });
        });
    });

    Promise.all(queryPromises)
        .then(() => {
            res.json({
                success: true,
                statistics: stats
            });
        })
        .catch(err => {
            res.status(500).json({
                success: false,
                message: 'Error fetching statistics',
                error: err.message
            });
        });
});

// Manage Services
router.get('/services', verifyToken, isAdmin, (req, res) => {
    const db = req.app.locals.db;
    db.query('SELECT * FROM services ORDER BY service_id DESC', (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error fetching services' });
        }
        res.json({ success: true, services: results });
    });
});

router.post('/services', verifyToken, isAdmin, (req, res) => {
    const db = req.app.locals.db;
    const { service_name, service_type, description, required_documents, processing_time, fee } = req.body;

    const query = `
        INSERT INTO services (service_name, service_type, description, required_documents, processing_time, fee) 
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.run(query, [service_name, service_type, description, required_documents, processing_time, fee], (err, result) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error adding service' });
        }
        res.status(201).json({ success: true, message: 'Service added successfully', serviceId: result.insertId });
    });
});

router.put('/services/:id', verifyToken, isAdmin, (req, res) => {
    const db = req.app.locals.db;
    const serviceId = req.params.id;
    const { service_name, service_type, description, required_documents, processing_time, fee } = req.body;

    const query = `
        UPDATE services 
        SET service_name = ?, service_type = ?, description = ?, required_documents, processing_time = ?, fee = ? 
        WHERE service_id = ?
    `;

    db.run(query, [service_name, service_type, description, required_documents, processing_time, fee, serviceId], (err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error updating service' });
        }
        res.json({ success: true, message: 'Service updated successfully' });
    });
});

// Deactivate service (soft delete)
router.put('/services/:id/deactivate', verifyToken, isAdmin, (req, res) => {
    const db = req.app.locals.db;
    const serviceId = req.params.id;

    db.run('UPDATE services SET is_active = FALSE WHERE service_id = ?', [serviceId], (err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error deactivating service' });
        }
        res.json({ success: true, message: 'Service deactivated successfully' });
    });
});

// Delete service (hard delete)
router.delete('/services/:id', verifyToken, isAdmin, (req, res) => {
    const db = req.app.locals.db;
    const serviceId = req.params.id;

    db.run('DELETE FROM services WHERE service_id = ?', [serviceId], (err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error deleting service' });
        }
        res.json({ success: true, message: 'Service deleted successfully' });
    });
});

// Manage Users (Citizens)
router.get('/users', verifyToken, isAdmin, (req, res) => {
    const db = req.app.locals.db;
    db.query('SELECT user_id, full_name, email, phone, village, block, district, state, created_at, is_active FROM users ORDER BY user_id DESC', (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error fetching users' });
        }
        res.json({ success: true, users: results });
    });
});

router.put('/users/:id/toggle-status', verifyToken, isAdmin, (req, res) => {
    const db = req.app.locals.db;
    const userId = req.params.id;

    db.run('UPDATE users SET is_active = NOT is_active WHERE user_id = ?', [userId], (err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error updating user status' });
        }
        res.json({ success: true, message: 'User status updated successfully' });
    });
});

// Manage Staff
router.get('/staff', verifyToken, isAdmin, (req, res) => {
    const db = req.app.locals.db;
    db.query('SELECT staff_id, full_name, email, phone, role, department, is_active FROM staff ORDER BY staff_id DESC', (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error fetching staff' });
        }
        res.json({ success: true, staff: results });
    });
});

router.post('/staff', verifyToken, isAdmin, async (req, res) => {
    const db = req.app.locals.db;
    const { full_name, email, phone, password, role, employee_id, department, panchayat_name } = req.body;

    try {
        const password_hash = await bcrypt.hash(password, 10);

        const query = `
            INSERT INTO staff (full_name, email, phone, password_hash, role, employee_id, department, panchayat_name) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.run(query, [full_name, email, phone, password_hash, role, employee_id, department, panchayat_name], (err, result) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Error adding staff member', error: err.message });
            }
            res.status(201).json({ success: true, message: 'Staff member added successfully', staffId: result.insertId });
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

router.put('/staff/:id/toggle-status', verifyToken, isAdmin, (req, res) => {
    const db = req.app.locals.db;
    const staffId = req.params.id;

    db.run('UPDATE staff SET is_active = NOT is_active WHERE staff_id = ?', [staffId], (err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error updating staff status' });
        }
        res.json({ success: true, message: 'Staff status updated successfully' });
    });
});

// Manage Schemes
router.get('/schemes', verifyToken, isAdmin, (req, res) => {
    const db = req.app.locals.db;
    db.query('SELECT * FROM schemes ORDER BY scheme_id DESC', (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error fetching schemes' });
        }
        res.json({ success: true, schemes: results });
    });
});

router.post('/schemes', verifyToken, isAdmin, (req, res) => {
    const db = req.app.locals.db;
    const { scheme_name, scheme_type, description, eligibility_criteria, benefits, application_process, required_documents, link } = req.body;

    const query = `
        INSERT INTO schemes (scheme_name, scheme_type, description, eligibility_criteria, benefits, application_process, required_documents, link) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(query, [scheme_name, scheme_type, description, eligibility_criteria, benefits, application_process, required_documents, link], (err, result) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error adding scheme' });
        }
        res.status(201).json({ success: true, message: 'Scheme added successfully', schemeId: result.insertId });
    });
});

router.put('/schemes/:id', verifyToken, isAdmin, (req, res) => {
    const db = req.app.locals.db;
    const schemeId = req.params.id;
    const { scheme_name, scheme_type, description, eligibility_criteria, benefits, application_process, required_documents, link, is_active } = req.body;

    const query = `
        UPDATE schemes 
        SET scheme_name = ?, scheme_type = ?, description = ?, eligibility_criteria = ?, 
            benefits = ?, application_process = ?, required_documents = ?, link = ?, is_active = ? 
        WHERE scheme_id = ?
    `;

    db.run(query, [scheme_name, scheme_type, description, eligibility_criteria, benefits, application_process, required_documents, link, is_active, schemeId], (err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error updating scheme' });
        }
        res.json({ success: true, message: 'Scheme updated successfully' });
    });
});

// Deactivate scheme (soft delete)
router.put('/schemes/:id/deactivate', verifyToken, isAdmin, (req, res) => {
    const db = req.app.locals.db;
    const schemeId = req.params.id;

    db.run('UPDATE schemes SET is_active = FALSE WHERE scheme_id = ?', [schemeId], (err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error deactivating scheme' });
        }
        res.json({ success: true, message: 'Scheme deactivated successfully' });
    });
});

// Delete scheme (hard delete)
router.delete('/schemes/:id', verifyToken, isAdmin, (req, res) => {
    const db = req.app.locals.db;
    const schemeId = req.params.id;

    db.run('DELETE FROM schemes WHERE scheme_id = ?', [schemeId], (err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error deleting scheme' });
        }
        res.json({ success: true, message: 'Scheme deleted successfully' });
    });
});

// Manage Announcements
router.get('/announcements', verifyToken, isAdmin, (req, res) => {
    const db = req.app.locals.db;
    db.query('SELECT * FROM announcements ORDER BY published_on DESC', (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error fetching announcements' });
        }
        res.json({ success: true, announcements: results });
    });
});

router.post('/announcements', verifyToken, isAdmin, (req, res) => {
    const db = req.app.locals.db;
    const adminId = req.userId;
    const { title, content, announcement_type, expiry_date } = req.body;

    const query = `
        INSERT INTO announcements (title, content, announcement_type, published_by, expiry_date) 
        VALUES (?, ?, ?, ?, ?)
    `;

    db.run(query, [title, content, announcement_type, adminId, expiry_date], (err, result) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error adding announcement' });
        }
        res.status(201).json({ success: true, message: 'Announcement added successfully', announcementId: result.insertId });
    });
});

router.delete('/announcements/:id', verifyToken, isAdmin, (req, res) => {
    const db = req.app.locals.db;
    const announcementId = req.params.id;

    db.run('UPDATE announcements SET is_active = FALSE WHERE announcement_id = ?', [announcementId], (err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error deleting announcement' });
        }
        res.json({ success: true, message: 'Announcement deleted successfully' });
    });
});

// System Logs
router.get('/logs', verifyToken, isAdmin, (req, res) => {
    const db = req.app.locals.db;
    const { limit = 100 } = req.query;

    db.query('SELECT * FROM system_logs ORDER BY timestamp DESC LIMIT ?', [parseInt(limit)], (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error fetching logs' });
        }
        res.json({ success: true, logs: results });
    });
});

// Reports
router.get('/reports/applications', verifyToken, isAdmin, (req, res) => {
    const db = req.app.locals.db;
    const { start_date, end_date, status } = req.query;

    let query = `
        SELECT a.*, s.service_name, u.full_name as citizen_name 
        FROM applications a 
        JOIN services s ON a.service_id = s.service_id 
        JOIN users u ON a.user_id = u.user_id 
        WHERE 1=1
    `;
    const params = [];

    if (start_date) {
        query += ' AND a.created_at >= ?';
        params.push(start_date);
    }
    if (end_date) {
        query += ' AND a.created_at <= ?';
        params.push(end_date);
    }
    if (status) {
        query += ' AND a.status = ?';
        params.push(status);
    }

    query += ' ORDER BY a.created_at DESC';

    db.query(query, params, (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error generating report' });
        }
        res.json({ success: true, report: results });
    });
});

module.exports = router;
