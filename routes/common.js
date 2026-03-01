const express = require('express');
const router = express.Router();

// Get all active services (public)
router.get('/services', (req, res) => {
    const db = req.app.locals.db;
    
    db.query('SELECT * FROM services WHERE is_active = TRUE ORDER BY service_name', (err, results) => {
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

// Get all active schemes (public)
router.get('/schemes', (req, res) => {
    const db = req.app.locals.db;
    
    db.query('SELECT * FROM schemes WHERE is_active = TRUE ORDER BY scheme_name', (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error fetching schemes'
            });
        }
        res.json({
            success: true,
            schemes: results
        });
    });
});

// Get active announcements (public)
router.get('/announcements', (req, res) => {
    const db = req.app.locals.db;
    
    const query = `
        SELECT * FROM announcements 
        WHERE is_active = TRUE 
        AND (expiry_date IS NULL OR expiry_date >= DATE('now'))
        ORDER BY published_on DESC 
        LIMIT 10
    `;

    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error fetching announcements'
            });
        }
        res.json({
            success: true,
            announcements: results
        });
    });
});

// Get panchayat information (public)
router.get('/panchayat-info', (req, res) => {
    const db = req.app.locals.db;
    
    db.query('SELECT * FROM panchayat_info LIMIT 1', (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error fetching panchayat information'
            });
        }
        res.json({
            success: true,
            info: results[0] || null
        });
    });
});

// Track application by ID (public - no auth required)
router.get('/track/:applicationId', (req, res) => {
    const db = req.app.locals.db;
    const applicationId = req.params.applicationId;

    const query = `
        SELECT a.application_id, a.status, a.created_at, a.updated_at, s.service_name 
        FROM applications a 
        JOIN services s ON a.service_id = s.service_id 
        WHERE a.application_id = ?
    `;

    db.query(query, [applicationId], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }

        // Get status history
        db.query(
            'SELECT new_status, remarks, changed_at FROM status_history WHERE application_id = ? ORDER BY changed_at',
            [applicationId],
            (err, history) => {
                res.json({
                    success: true,
                    application: results[0],
                    history: history || []
                });
            }
        );
    });
});

module.exports = router;
