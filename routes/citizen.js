const express = require('express');
const router = express.Router();
const { verifyToken, isCitizen } = require('../middleware/auth');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

router.use(verifyToken);
router.use(isCitizen);

router.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/citizen/dashboard.html'));
});

router.get('/applications', (req, res) => {
  const db = req.app.locals.db;
  db.all(
    `SELECT a.application_id AS id, a.status, a.created_at, a.updated_at,
            a.remarks AS staff_remarks, a.application_data,
            s.service_name, s.service_type
     FROM applications a
     JOIN services s ON a.service_id = s.service_id
     WHERE a.user_id = ?
     ORDER BY a.created_at DESC`,
    [req.userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

router.post('/applications', upload.array('documents', 5), (req, res) => {
  const db = req.app.locals.db;
  const { service_id, purpose, details } = req.body;
  db.run(
    `INSERT INTO applications (user_id, service_id, application_data, status, created_at)
     VALUES (?, ?, ?, 'pending', datetime('now'))`,
    [req.userId, service_id, JSON.stringify({ purpose, details })],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      const appId = this.lastID;
      db.run(
        `INSERT INTO citizen_timeline_events (citizen_id, event_type, event_title, event_description, reference_id, created_at)
         VALUES (?, 'application_submitted', 'Application Submitted', ?, ?, datetime('now'))`,
        [req.userId, `Application submitted for service #${service_id}`, appId]
      );
      res.json({ success: true, application_id: appId });
    }
  );
});

router.get('/services', (req, res) => {
  const db = req.app.locals.db;
  db.all(
    `SELECT service_id AS id, service_name AS name, service_type,
            description, required_documents, processing_time, fee
     FROM services WHERE is_active = 1 ORDER BY service_name`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

router.get('/certificates', (req, res) => {
  const db = req.app.locals.db;
  db.all(
    `SELECT c.certificate_id AS id, c.certificate_number, c.issue_date AS issued_at,
            c.expiry_date, c.is_valid, c.verification_hash,
            s.service_name, a.application_data
     FROM certificates c
     JOIN applications a ON c.application_id = a.application_id
     JOIN services s ON c.service_id = s.service_id
     WHERE c.user_id = ?
     ORDER BY c.created_at DESC`,
    [req.userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const result = rows || [];
      result.forEach(cert => {
        try { const d = JSON.parse(cert.application_data||'{}'); cert.purpose = d.purpose||''; } catch(e) { cert.purpose=''; }
        if (!cert.verification_hash) {
          const hash = crypto.createHash('sha256')
            .update(`${cert.id}-${cert.certificate_number}-${process.env.JWT_SECRET||'secret'}`)
            .digest('hex');
          db.run(`UPDATE certificates SET verification_hash = ? WHERE certificate_id = ?`, [hash, cert.id]);
          cert.verification_hash = hash;
        }
      });
      res.json(result);
    }
  );
});

router.get('/certificates/renewable', (req, res) => {
  const db = req.app.locals.db;
  db.all(
    `SELECT c.certificate_id AS id, c.certificate_number, c.issue_date AS issued_at,
            c.expiry_date, s.service_name,
            CASE WHEN c.expiry_date < date('now') THEN 'expired' ELSE 'expiring_soon' END AS expiry_status
     FROM certificates c
     JOIN applications a ON c.application_id = a.application_id
     JOIN services s ON c.service_id = s.service_id
     WHERE c.user_id = ? AND c.expiry_date IS NOT NULL AND c.expiry_date < date('now','+30 days')
     ORDER BY c.expiry_date ASC`,
    [req.userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

router.post('/certificates/:id/renew', (req, res) => {
  const db = req.app.locals.db;
  db.get(
    `SELECT c.*, a.service_id FROM certificates c
     JOIN applications a ON c.application_id = a.application_id
     WHERE c.certificate_id = ? AND c.user_id = ?`,
    [req.params.id, req.userId],
    (err, cert) => {
      if (err || !cert) return res.status(404).json({ error: 'Certificate not found' });
      db.run(
        `INSERT INTO applications (user_id, service_id, application_data, status, parent_certificate_id, created_at)
         VALUES (?, ?, ?, 'pending', ?, datetime('now'))`,
        [req.userId, cert.service_id, JSON.stringify({ purpose: 'Certificate Renewal' }), cert.certificate_id],
        function(err2) {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({ success: true, application_id: this.lastID });
        }
      );
    }
  );
});

router.get('/corrections', (req, res) => {
  const db = req.app.locals.db;
  db.all(
    `SELECT ac.*, s.service_name
     FROM application_corrections ac
     JOIN applications a ON ac.application_id = a.application_id
     JOIN services s ON a.service_id = s.service_id
     WHERE a.user_id = ? ORDER BY ac.created_at DESC`,
    [req.userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

router.post('/corrections/:id/resubmit', upload.array('documents', 5), (req, res) => {
  const db = req.app.locals.db;
  const { correction_notes } = req.body;
  db.get(
    `SELECT ac.*, a.user_id FROM application_corrections ac
     JOIN applications a ON ac.application_id = a.application_id WHERE ac.id = ?`,
    [req.params.id],
    (err, correction) => {
      if (err || !correction) return res.status(404).json({ error: 'Not found' });
      if (correction.user_id !== req.userId) return res.status(403).json({ error: 'Forbidden' });
      db.run(
        `UPDATE application_corrections SET status='resubmitted', correction_notes=?, resubmitted_at=datetime('now') WHERE id=?`,
        [correction_notes, req.params.id],
        (err2) => {
          if (err2) return res.status(500).json({ error: err2.message });
          db.run(`UPDATE applications SET status='pending', updated_at=datetime('now') WHERE application_id=?`, [correction.application_id]);
          res.json({ success: true });
        }
      );
    }
  );
});

router.get('/multi-application', (req, res) => {
  const db = req.app.locals.db;
  db.all(
    `SELECT mar.*,
      (SELECT COUNT(*) FROM applications WHERE multi_request_id = mar.id) AS total_sub,
      (SELECT COUNT(*) FROM applications WHERE multi_request_id = mar.id AND status='approved') AS approved_sub,
      (SELECT COUNT(*) FROM applications WHERE multi_request_id = mar.id AND status='pending') AS pending_sub
     FROM multi_application_requests mar WHERE mar.citizen_id = ? ORDER BY mar.created_at DESC`,
    [req.userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

router.post('/multi-application', (req, res) => {
  const db = req.app.locals.db;
  const { purpose, service_ids } = req.body;
  let serviceIds;
  try { serviceIds = typeof service_ids === 'string' ? JSON.parse(service_ids) : service_ids; }
  catch (e) { return res.status(400).json({ error: 'Invalid service_ids' }); }
  if (!serviceIds || serviceIds.length < 2) return res.status(400).json({ error: 'Select at least 2 services' });
  db.run(
    `INSERT INTO multi_application_requests (citizen_id, purpose, total_services, status, created_at) VALUES (?,?,?,'pending',datetime('now'))`,
    [req.userId, purpose, serviceIds.length],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      const multiId = this.lastID;
      let inserted = 0;
      serviceIds.forEach(sid => {
        db.run(
          `INSERT INTO applications (user_id, service_id, application_data, status, multi_request_id, created_at) VALUES (?,?,?,'pending',?,datetime('now'))`,
          [req.userId, sid, JSON.stringify({ purpose }), multiId],
          () => { if (++inserted === serviceIds.length) res.json({ success: true, multi_request_id: multiId }); }
        );
      });
    }
  );
});

router.get('/multi-application/:id', (req, res) => {
  const db = req.app.locals.db;
  db.get(`SELECT * FROM multi_application_requests WHERE id=? AND citizen_id=?`, [req.params.id, req.userId],
    (err, mar) => {
      if (err || !mar) return res.status(404).json({ error: 'Not found' });
      db.all(
        `SELECT a.application_id AS id, a.status, s.service_name FROM applications a
         JOIN services s ON a.service_id = s.service_id WHERE a.multi_request_id=?`,
        [mar.id], (err2, subApps) => res.json({ ...mar, sub_applications: subApps || [] })
      );
    }
  );
});

router.get('/timeline', (req, res) => {
  const db = req.app.locals.db;
  db.all(`SELECT * FROM citizen_timeline_events WHERE citizen_id=? ORDER BY created_at DESC LIMIT 100`,
    [req.userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

module.exports = router;
