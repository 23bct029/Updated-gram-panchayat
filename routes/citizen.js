const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');

// Multer setup for document uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Middleware: all citizen routes require auth + citizen role
router.use(authenticateToken);
router.use(requireRole('citizen'));

// ─────────────────────────────────────────────
// EXISTING: Dashboard
// ─────────────────────────────────────────────
router.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/citizen/dashboard.html'));
});

// ─────────────────────────────────────────────
// EXISTING: My Applications
// ─────────────────────────────────────────────
router.get('/applications', (req, res) => {
  db.all(
    `SELECT a.*, s.name AS service_name 
     FROM applications a 
     JOIN services s ON a.service_id = s.id 
     WHERE a.citizen_id = ? 
     ORDER BY a.created_at DESC`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(rows);
    }
  );
});

router.post('/applications', upload.array('documents', 5), (req, res) => {
  const { service_id, purpose, details } = req.body;
  const citizen_id = req.user.id;
  db.run(
    `INSERT INTO applications (citizen_id, service_id, purpose, details, status, created_at) VALUES (?,?,?,?,'pending', datetime('now'))`,
    [citizen_id, service_id, purpose, details],
    function(err) {
      if (err) return res.status(500).json({ error: 'Failed to submit application' });
      const appId = this.lastID;
      // Insert timeline event
      db.run(
        `INSERT INTO citizen_timeline_events (citizen_id, event_type, event_title, event_description, reference_id, created_at) VALUES (?,?,?,?,?,datetime('now'))`,
        [citizen_id, 'application_submitted', 'Application Submitted', `New application submitted for service #${service_id}`, appId]
      );
      res.json({ success: true, application_id: appId });
    }
  );
});

// ─────────────────────────────────────────────
// EXISTING: Certificates (with QR & Hash - Feature 3 & 4)
// ─────────────────────────────────────────────
router.get('/certificates', (req, res) => {
  db.all(
    `SELECT c.*, s.name AS service_name, a.purpose 
     FROM certificates c
     JOIN applications a ON c.application_id = a.id
     JOIN services s ON a.service_id = s.id
     WHERE a.citizen_id = ?
     ORDER BY c.issued_at DESC`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      // Ensure each certificate has a hash
      rows.forEach(cert => {
        if (!cert.verification_hash) {
          const hash = crypto.createHash('sha256')
            .update(`${cert.id}-${cert.application_id}-${cert.issued_at}-${process.env.JWT_SECRET || 'secret'}`)
            .digest('hex');
          db.run(`UPDATE certificates SET verification_hash = ? WHERE id = ?`, [hash, cert.id]);
          cert.verification_hash = hash;
        }
      });
      res.json(rows);
    }
  );
});

// Feature 3 & 4: Verify certificate by ID (citizen-facing)
router.get('/certificates/:id/verify', (req, res) => {
  db.get(
    `SELECT c.*, s.name AS service_name, u.name AS citizen_name, a.purpose
     FROM certificates c
     JOIN applications a ON c.application_id = a.id
     JOIN services s ON a.service_id = s.id
     JOIN users u ON a.citizen_id = u.id
     WHERE c.id = ? AND a.citizen_id = ?`,
    [req.params.id, req.user.id],
    (err, cert) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!cert) return res.status(404).json({ error: 'Certificate not found' });
      // Log verification attempt
      db.run(
        `INSERT INTO certificate_verification_logs (certificate_id, verified_by, verification_method, created_at) VALUES (?,?,?,datetime('now'))`,
        [cert.id, req.user.id, 'citizen_view']
      );
      res.json({ valid: true, certificate: cert });
    }
  );
});

// ─────────────────────────────────────────────
// FEATURE 1: Smart Application Correction System
// ─────────────────────────────────────────────

// GET: List correction requests for this citizen
router.get('/corrections', (req, res) => {
  db.all(
    `SELECT ac.*, a.id AS application_id, s.name AS service_name, 
            ac.correction_reason, ac.required_documents, ac.status,
            ac.created_at, ac.resubmitted_at
     FROM application_corrections ac
     JOIN applications a ON ac.application_id = a.id
     JOIN services s ON a.service_id = s.id
     WHERE a.citizen_id = ?
     ORDER BY ac.created_at DESC`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(rows);
    }
  );
});

// POST: Citizen resubmits corrected application
router.post('/corrections/:id/resubmit', upload.array('documents', 5), (req, res) => {
  const { correction_notes } = req.body;
  const correctionId = req.params.id;

  db.get(
    `SELECT ac.*, a.citizen_id FROM application_corrections ac JOIN applications a ON ac.application_id = a.id WHERE ac.id = ?`,
    [correctionId],
    (err, correction) => {
      if (err || !correction) return res.status(404).json({ error: 'Correction not found' });
      if (correction.citizen_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

      db.run(
        `UPDATE application_corrections SET status = 'resubmitted', correction_notes = ?, resubmitted_at = datetime('now') WHERE id = ?`,
        [correction_notes, correctionId],
        (err2) => {
          if (err2) return res.status(500).json({ error: 'Failed to resubmit' });
          // Reset application status to pending
          db.run(`UPDATE applications SET status = 'pending', updated_at = datetime('now') WHERE id = ?`, [correction.application_id]);
          // Timeline event
          db.run(
            `INSERT INTO citizen_timeline_events (citizen_id, event_type, event_title, event_description, reference_id, created_at) VALUES (?,?,?,?,?,datetime('now'))`,
            [req.user.id, 'correction_resubmitted', 'Correction Resubmitted', 'You resubmitted a corrected application', correction.application_id]
          );
          res.json({ success: true, message: 'Application resubmitted successfully' });
        }
      );
    }
  );
});

// ─────────────────────────────────────────────
// FEATURE 2: Certificate Renewal System
// ─────────────────────────────────────────────

// GET: List certificates eligible for renewal (expiring within 30 days or already expired)
router.get('/certificates/renewable', (req, res) => {
  db.all(
    `SELECT c.*, s.name AS service_name, a.purpose,
            CASE WHEN c.expiry_date < date('now') THEN 'expired'
                 WHEN c.expiry_date < date('now', '+30 days') THEN 'expiring_soon'
                 ELSE 'valid' END AS expiry_status
     FROM certificates c
     JOIN applications a ON c.application_id = a.id
     JOIN services s ON a.service_id = s.id
     WHERE a.citizen_id = ?
       AND (c.expiry_date IS NOT NULL)
       AND (c.expiry_date < date('now', '+30 days'))
       AND NOT EXISTS (
         SELECT 1 FROM applications ar 
         WHERE ar.parent_certificate_id = c.id AND ar.status NOT IN ('rejected')
       )
     ORDER BY c.expiry_date ASC`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(rows);
    }
  );
});

// POST: Submit renewal application
router.post('/certificates/:id/renew', (req, res) => {
  db.get(
    `SELECT c.*, a.service_id, a.purpose, a.citizen_id FROM certificates c JOIN applications a ON c.application_id = a.id WHERE c.id = ?`,
    [req.params.id],
    (err, cert) => {
      if (err || !cert) return res.status(404).json({ error: 'Certificate not found' });
      if (cert.citizen_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

      db.run(
        `INSERT INTO applications (citizen_id, service_id, purpose, details, status, parent_certificate_id, created_at) VALUES (?,?,?,?,'pending',?,datetime('now'))`,
        [req.user.id, cert.service_id, `Renewal: ${cert.purpose || 'Certificate Renewal'}`, 'Certificate renewal request', cert.id],
        function(err2) {
          if (err2) return res.status(500).json({ error: 'Failed to create renewal application' });
          db.run(
            `INSERT INTO citizen_timeline_events (citizen_id, event_type, event_title, event_description, reference_id, created_at) VALUES (?,?,?,?,?,datetime('now'))`,
            [req.user.id, 'renewal_applied', 'Renewal Application Submitted', `Renewal requested for certificate #${cert.id}`, this.lastID]
          );
          res.json({ success: true, application_id: this.lastID });
        }
      );
    }
  );
});

// ─────────────────────────────────────────────
// FEATURE 5: Multi-Certificate Requests
// ─────────────────────────────────────────────

// GET: List multi-application requests
router.get('/multi-application', (req, res) => {
  db.all(
    `SELECT mar.*, 
            (SELECT COUNT(*) FROM applications WHERE multi_request_id = mar.id) AS total_sub,
            (SELECT COUNT(*) FROM applications WHERE multi_request_id = mar.id AND status = 'approved') AS approved_sub,
            (SELECT COUNT(*) FROM applications WHERE multi_request_id = mar.id AND status = 'pending') AS pending_sub
     FROM multi_application_requests mar
     WHERE mar.citizen_id = ?
     ORDER BY mar.created_at DESC`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(rows);
    }
  );
});

// GET: Single multi-application detail with sub-applications
router.get('/multi-application/:id', (req, res) => {
  db.get(
    `SELECT * FROM multi_application_requests WHERE id = ? AND citizen_id = ?`,
    [req.params.id, req.user.id],
    (err, mar) => {
      if (err || !mar) return res.status(404).json({ error: 'Not found' });
      db.all(
        `SELECT a.*, s.name AS service_name FROM applications a JOIN services s ON a.service_id = s.id WHERE a.multi_request_id = ?`,
        [mar.id],
        (err2, subApps) => {
          if (err2) return res.status(500).json({ error: 'Database error' });
          res.json({ ...mar, sub_applications: subApps });
        }
      );
    }
  );
});

// POST: Submit a multi-certificate application
router.post('/multi-application', upload.array('documents', 10), (req, res) => {
  const { purpose, service_ids } = req.body;
  const citizen_id = req.user.id;

  let serviceIds;
  try {
    serviceIds = typeof service_ids === 'string' ? JSON.parse(service_ids) : service_ids;
  } catch (e) {
    return res.status(400).json({ error: 'Invalid service_ids format' });
  }

  if (!serviceIds || serviceIds.length < 2) {
    return res.status(400).json({ error: 'Select at least 2 services' });
  }

  db.run(
    `INSERT INTO multi_application_requests (citizen_id, purpose, total_services, status, created_at) VALUES (?,?,?,'pending',datetime('now'))`,
    [citizen_id, purpose, serviceIds.length],
    function(err) {
      if (err) return res.status(500).json({ error: 'Failed to create multi-application' });
      const multiId = this.lastID;

      let inserted = 0;
      serviceIds.forEach(sid => {
        db.run(
          `INSERT INTO applications (citizen_id, service_id, purpose, status, multi_request_id, created_at) VALUES (?,?,?,'pending',?,datetime('now'))`,
          [citizen_id, sid, purpose, multiId],
          () => {
            inserted++;
            if (inserted === serviceIds.length) {
              db.run(
                `INSERT INTO citizen_timeline_events (citizen_id, event_type, event_title, event_description, reference_id, created_at) VALUES (?,?,?,?,?,datetime('now'))`,
                [citizen_id, 'multi_application_submitted', 'Multi-Application Submitted', `Applied for ${serviceIds.length} certificates: ${purpose}`, multiId]
              );
              res.json({ success: true, multi_request_id: multiId });
            }
          }
        );
      });
    }
  );
});

// ─────────────────────────────────────────────
// FEATURE 6: Citizen Service Timeline
// ─────────────────────────────────────────────
router.get('/timeline', (req, res) => {
  db.all(
    `SELECT cte.*, 
            CASE cte.event_type
              WHEN 'application_submitted' THEN 'submitted'
              WHEN 'application_approved' THEN 'approved'
              WHEN 'application_rejected' THEN 'rejected'
              WHEN 'certificate_issued' THEN 'certificate'
              WHEN 'correction_requested' THEN 'correction'
              WHEN 'correction_resubmitted' THEN 'resubmitted'
              WHEN 'renewal_applied' THEN 'renewal'
              WHEN 'multi_application_submitted' THEN 'multi'
              ELSE 'info'
            END AS event_category
     FROM citizen_timeline_events cte
     WHERE cte.citizen_id = ?
     ORDER BY cte.created_at DESC
     LIMIT 100`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(rows);
    }
  );
});

// ─────────────────────────────────────────────
// EXISTING: Services list
// ─────────────────────────────────────────────
router.get('/services', (req, res) => {
  db.all(`SELECT * FROM services WHERE is_active = 1 ORDER BY name`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

module.exports = router;
