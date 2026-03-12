import os

routes_dir = 'routes'

citizen = '''const express = require('express');
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
'''

staff = '''const express = require('express');
const router = express.Router();
const { verifyToken, isStaff } = require('../middleware/auth');
const crypto = require('crypto');
const path = require('path');

router.use(verifyToken);
router.use(isStaff);

router.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/staff/dashboard.html'));
});

router.get('/applications/pending', (req, res) => {
  const db = req.app.locals.db;
  db.all(
    `SELECT a.application_id AS id, a.status, a.created_at, a.application_data,
            s.service_name, u.full_name AS citizen_name, u.phone, u.email,
            CAST(julianday('now') - julianday(a.created_at) AS INTEGER) AS waiting_days
     FROM applications a
     JOIN services s ON a.service_id = s.service_id
     JOIN users u ON a.user_id = u.user_id
     WHERE a.status = 'pending'
     ORDER BY waiting_days DESC, a.created_at ASC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

router.get('/applications', (req, res) => {
  const db = req.app.locals.db;
  const { status } = req.query;
  let query = `SELECT a.application_id AS id, a.status, a.created_at, a.updated_at,
                      a.remarks AS staff_remarks, a.application_data,
                      s.service_name, u.full_name AS citizen_name
               FROM applications a
               JOIN services s ON a.service_id = s.service_id
               JOIN users u ON a.user_id = u.user_id`;
  const params = [];
  if (status) { query += ` WHERE a.status = ?`; params.push(status); }
  query += ` ORDER BY a.created_at DESC`;
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

router.get('/applications/:id', (req, res) => {
  const db = req.app.locals.db;
  db.get(
    `SELECT a.application_id AS id, a.status, a.created_at, a.application_data, a.remarks,
            s.service_name, s.required_documents,
            u.full_name AS citizen_name, u.email, u.phone, u.address, u.aadhar_number
     FROM applications a
     JOIN services s ON a.service_id = s.service_id
     JOIN users u ON a.user_id = u.user_id
     WHERE a.application_id = ?`,
    [req.params.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Not found' });
      try { const d = JSON.parse(row.application_data||'{}'); row.purpose = d.purpose||''; } catch(e) {}
      res.json(row);
    }
  );
});

router.post('/applications/:id/approve', (req, res) => {
  const db = req.app.locals.db;
  const { remarks } = req.body;
  const appId = req.params.id;
  db.get(`SELECT * FROM applications WHERE application_id = ?`, [appId], (err, app) => {
    if (err || !app) return res.status(404).json({ error: 'Not found' });
    db.run(
      `UPDATE applications SET status='approved', remarks=?, assigned_to=?, updated_at=datetime('now') WHERE application_id=?`,
      [remarks, req.userId, appId],
      (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        const certNum = 'CERT-' + Date.now();
        const hash = crypto.createHash('sha256')
          .update(`${appId}-${certNum}-${process.env.JWT_SECRET||'secret'}`).digest('hex');
        db.run(
          `INSERT INTO certificates (application_id, user_id, service_id, certificate_number, issue_date, expiry_date, issued_by, is_valid, verification_hash, created_at)
           VALUES (?, ?, ?, ?, date('now'), date('now','+1 year'), ?, 1, ?, datetime('now'))`,
          [appId, app.user_id, app.service_id, certNum, req.userId, hash],
          function(err3) {
            if (err3) return res.status(500).json({ error: err3.message });
            db.run(
              `INSERT INTO citizen_timeline_events (citizen_id, event_type, event_title, event_description, reference_id, created_at)
               VALUES (?, 'application_approved', 'Application Approved', 'Your application was approved and certificate issued.', ?, datetime('now'))`,
              [app.user_id, appId]
            );
            res.json({ success: true, certificate_id: this.lastID });
          }
        );
      }
    );
  });
});

router.post('/applications/:id/reject', (req, res) => {
  const db = req.app.locals.db;
  const { remarks } = req.body;
  db.get(`SELECT * FROM applications WHERE application_id=?`, [req.params.id], (err, app) => {
    if (err || !app) return res.status(404).json({ error: 'Not found' });
    db.run(
      `UPDATE applications SET status='rejected', remarks=?, assigned_to=?, updated_at=datetime('now') WHERE application_id=?`,
      [remarks, req.userId, req.params.id],
      (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        db.run(
          `INSERT INTO citizen_timeline_events (citizen_id, event_type, event_title, event_description, reference_id, created_at)
           VALUES (?, 'application_rejected', 'Application Rejected', ?, ?, datetime('now'))`,
          [app.user_id, `Rejected: ${remarks}`, app.application_id]
        );
        res.json({ success: true });
      }
    );
  });
});

router.post('/applications/:id/request-correction', (req, res) => {
  const db = req.app.locals.db;
  const { correction_reason, required_documents } = req.body;
  const appId = req.params.id;
  db.get(`SELECT * FROM applications WHERE application_id=?`, [appId], (err, app) => {
    if (err || !app) return res.status(404).json({ error: 'Not found' });
    db.run(`UPDATE applications SET status='correction_required', updated_at=datetime('now') WHERE application_id=?`, [appId], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      db.run(
        `INSERT INTO application_corrections (application_id, requested_by, correction_reason, required_documents, status, created_at)
         VALUES (?,?,?,?,'pending',datetime('now'))`,
        [appId, req.userId, correction_reason, required_documents],
        function(err3) {
          if (err3) return res.status(500).json({ error: err3.message });
          db.run(
            `INSERT INTO citizen_timeline_events (citizen_id, event_type, event_title, event_description, reference_id, created_at)
             VALUES (?, 'correction_requested', 'Correction Requested', ?, ?, datetime('now'))`,
            [app.user_id, `Staff requested: ${correction_reason}`, appId]
          );
          res.json({ success: true, correction_id: this.lastID });
        }
      );
    });
  });
});

router.get('/corrections/pending', (req, res) => {
  const db = req.app.locals.db;
  db.all(
    `SELECT ac.*, s.service_name, u.full_name AS citizen_name
     FROM application_corrections ac
     JOIN applications a ON ac.application_id = a.application_id
     JOIN services s ON a.service_id = s.service_id
     JOIN users u ON a.user_id = u.user_id
     WHERE ac.status='resubmitted'
     ORDER BY ac.resubmitted_at ASC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

router.post('/corrections/:id/approve', (req, res) => {
  const db = req.app.locals.db;
  db.get(`SELECT * FROM application_corrections WHERE id=?`, [req.params.id], (err, corr) => {
    if (err || !corr) return res.status(404).json({ error: 'Not found' });
    db.run(`UPDATE application_corrections SET status='approved', resolved_at=datetime('now') WHERE id=?`, [req.params.id], () => {
      db.run(`UPDATE applications SET status='pending', updated_at=datetime('now') WHERE application_id=?`, [corr.application_id]);
      res.json({ success: true });
    });
  });
});

router.get('/queue/next', (req, res) => {
  const db = req.app.locals.db;
  db.get(
    `SELECT a.application_id AS id, a.status, a.created_at, a.application_data,
            s.service_name, u.full_name AS citizen_name,
            CAST(julianday('now') - julianday(a.created_at) AS INTEGER) AS waiting_days
     FROM applications a
     JOIN services s ON a.service_id = s.service_id
     JOIN users u ON a.user_id = u.user_id
     LEFT JOIN staff_assignments sa ON sa.application_id = a.application_id
     WHERE a.status='pending' AND sa.application_id IS NULL
     ORDER BY a.created_at ASC LIMIT 1`,
    [],
    (err, app) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!app) return res.json({ message: 'No applications in queue', application: null });
      db.run(
        `INSERT OR IGNORE INTO staff_assignments (staff_id, application_id, assigned_at) VALUES (?,?,datetime('now'))`,
        [req.userId, app.id],
        () => res.json({ application: app })
      );
    }
  );
});

router.get('/workload', (req, res) => {
  const db = req.app.locals.db;
  db.get(
    `SELECT
      (SELECT COUNT(*) FROM applications WHERE assigned_to=? AND status='approved') AS total_approved,
      (SELECT COUNT(*) FROM applications WHERE assigned_to=? AND status='rejected') AS total_rejected,
      (SELECT COUNT(*) FROM staff_assignments WHERE staff_id=?) AS total_assigned`,
    [req.userId, req.userId, req.userId],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(row || {});
    }
  );
});

module.exports = router;
'''

admin = '''const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin } = require('../middleware/auth');
const bcrypt = require('bcrypt');
const path = require('path');

router.use(verifyToken);
router.use(isAdmin);

router.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/admin/dashboard.html'));
});

router.get('/stats', (req, res) => {
  const db = req.app.locals.db;
  db.get(
    `SELECT
      (SELECT COUNT(*) FROM users) AS total_citizens,
      (SELECT COUNT(*) FROM staff) AS total_staff,
      (SELECT COUNT(*) FROM applications) AS total_applications,
      (SELECT COUNT(*) FROM applications WHERE status='pending') AS pending_applications,
      (SELECT COUNT(*) FROM applications WHERE status='approved') AS approved_applications,
      (SELECT COUNT(*) FROM certificates) AS total_certificates`,
    [],
    (err, stats) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(stats || {});
    }
  );
});

router.get('/users', (req, res) => {
  const db = req.app.locals.db;
  db.all(
    `SELECT user_id AS id, full_name AS name, email, phone, created_at, is_active FROM users ORDER BY created_at DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

router.patch('/users/:id/toggle', (req, res) => {
  const db = req.app.locals.db;
  db.run(`UPDATE users SET is_active = CASE WHEN is_active=1 THEN 0 ELSE 1 END WHERE user_id=?`, [req.params.id],
    (err) => { if (err) return res.status(500).json({ error: err.message }); res.json({ success: true }); }
  );
});

router.get('/staff', (req, res) => {
  const db = req.app.locals.db;
  db.all(
    `SELECT s.staff_id AS id, s.full_name AS name, s.email, s.phone, s.created_at, s.is_active,
            (SELECT COUNT(*) FROM applications a WHERE a.assigned_to=s.staff_id AND a.status='approved') AS approved_count,
            (SELECT COUNT(*) FROM applications a WHERE a.assigned_to=s.staff_id AND a.status='pending') AS pending_count
     FROM staff s ORDER BY s.created_at DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

router.post('/staff', async (req, res) => {
  const db = req.app.locals.db;
  const { name, email, phone, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    const hash = await bcrypt.hash(password, 10);
    db.run(
      `INSERT INTO staff (full_name, email, phone, password_hash, role, employee_id, department, panchayat_name, created_at)
       VALUES (?,?,?,?,'officer',?,'Administration','Gram Panchayat',datetime('now'))`,
      [name, email, phone, hash, 'EMP' + Date.now()],
      function(err2) {
        if (err2) return res.status(400).json({ error: 'Email already exists' });
        res.json({ success: true, staff_id: this.lastID });
      }
    );
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/services', (req, res) => {
  const db = req.app.locals.db;
  db.all(
    `SELECT service_id AS id, service_name AS name, service_type, description,
            required_documents, processing_time, fee, is_active, created_at
     FROM services ORDER BY service_name`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

router.post('/services', (req, res) => {
  const db = req.app.locals.db;
  const { name, description, fee, processing_days, required_documents } = req.body;
  db.run(
    `INSERT INTO services (service_name, service_type, description, fee, processing_time, required_documents, is_active, created_at)
     VALUES (?,'certificate',?,?,?,?,1,datetime('now'))`,
    [name, description, fee, (processing_days||'7') + ' days', required_documents],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, service_id: this.lastID });
    }
  );
});

router.patch('/services/:id', (req, res) => {
  const db = req.app.locals.db;
  const { name, description, fee, processing_days, required_documents, is_active } = req.body;
  db.run(
    `UPDATE services SET service_name=?, description=?, fee=?, processing_time=?, required_documents=?, is_active=? WHERE service_id=?`,
    [name, description, fee, processing_days, required_documents, is_active, req.params.id],
    (err) => { if (err) return res.status(500).json({ error: err.message }); res.json({ success: true }); }
  );
});

router.get('/demographics', (req, res) => {
  const db = req.app.locals.db;
  db.get(
    `SELECT COUNT(*) AS total_citizens,
            COUNT(CASE WHEN gender='male' THEN 1 END) AS male,
            COUNT(CASE WHEN gender='female' THEN 1 END) AS female,
            COUNT(CASE WHEN strftime('%Y',created_at)=strftime('%Y','now') THEN 1 END) AS new_registrations_this_year
     FROM users`,
    [],
    (err, demog) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get(
        `SELECT COUNT(*) AS total_applications,
                COUNT(DISTINCT user_id) AS citizens_with_applications,
                COUNT(CASE WHEN status='approved' THEN 1 END) AS approved_applications
         FROM applications`,
        [],
        (err2, appStats) => {
          res.json({ demographics: demog||{}, application_stats: appStats||{}, generated_at: new Date().toISOString() });
        }
      );
    }
  );
});

router.post('/demographics/snapshot', (req, res) => {
  const db = req.app.locals.db;
  db.get(`SELECT COUNT(*) AS total_citizens FROM users`, [], (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    db.run(
      `INSERT INTO village_demographics_snapshots (data, created_at) VALUES (?,datetime('now'))`,
      [JSON.stringify({ demographics: data, generated_at: new Date().toISOString() })],
      function(err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ success: true, snapshot_id: this.lastID });
      }
    );
  });
});

router.get('/insights/services', (req, res) => {
  const db = req.app.locals.db;
  db.all(
    `SELECT s.service_name, s.service_id,
            COUNT(a.application_id) AS total_requests,
            COUNT(CASE WHEN a.status='approved' THEN 1 END) AS approved,
            COUNT(CASE WHEN a.status='rejected' THEN 1 END) AS rejected,
            COUNT(CASE WHEN a.status='pending' THEN 1 END) AS pending
     FROM services s
     LEFT JOIN applications a ON a.service_id = s.service_id
     GROUP BY s.service_id, s.service_name ORDER BY total_requests DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

router.get('/insights/usage-trends', (req, res) => {
  const db = req.app.locals.db;
  db.all(
    `SELECT strftime('%Y-%m', created_at) AS month,
            COUNT(*) AS total,
            COUNT(CASE WHEN status='approved' THEN 1 END) AS approved,
            COUNT(CASE WHEN status='pending' THEN 1 END) AS pending
     FROM applications
     WHERE created_at >= date('now','-12 months')
     GROUP BY strftime('%Y-%m', created_at) ORDER BY month ASC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

router.get('/workload/all', (req, res) => {
  const db = req.app.locals.db;
  db.all(
    `SELECT s.staff_id AS id, s.full_name AS name, s.email,
            (SELECT COUNT(*) FROM staff_assignments sa WHERE sa.staff_id=s.staff_id) AS assigned_count,
            (SELECT COUNT(*) FROM applications a WHERE a.assigned_to=s.staff_id AND a.status='approved') AS total_approved,
            (SELECT COUNT(*) FROM applications a WHERE a.assigned_to=s.staff_id AND a.status='rejected') AS total_rejected
     FROM staff s WHERE s.is_active=1 ORDER BY assigned_count DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

router.post('/rebalance', (req, res) => {
  const db = req.app.locals.db;
  db.all(
    `SELECT a.application_id AS id FROM applications a
     LEFT JOIN staff_assignments sa ON sa.application_id = a.application_id
     WHERE a.status='pending' AND sa.application_id IS NULL ORDER BY a.created_at ASC`,
    [],
    (err, apps) => {
      if (err) return res.status(500).json({ error: err.message });
      db.all(`SELECT staff_id FROM staff WHERE is_active=1`, [], (err2, staffList) => {
        if (err2 || !staffList.length) return res.status(400).json({ error: 'No active staff' });
        apps.forEach((app, idx) => {
          const staffId = staffList[idx % staffList.length].staff_id;
          db.run(`INSERT OR IGNORE INTO staff_assignments (staff_id, application_id, assigned_at) VALUES (?,?,datetime('now'))`, [staffId, app.id]);
        });
        res.json({ success: true, applications_assigned: apps.length, staff_count: staffList.length });
      });
    }
  );
});

module.exports = router;
'''

common = '''const express = require('express');
const router = express.Router();
const path = require('path');

router.get('/verify/:hash', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/verify.html'));
});

router.get('/api/verify/certificate/:id', (req, res) => {
  const db = req.app.locals.db;
  db.get(
    `SELECT c.certificate_id AS id, c.issue_date AS issued_at, c.expiry_date,
            c.verification_hash, c.is_valid, c.certificate_number,
            s.service_name, u.full_name AS citizen_name
     FROM certificates c
     JOIN applications a ON c.application_id = a.application_id
     JOIN services s ON c.service_id = s.service_id
     JOIN users u ON c.user_id = u.user_id
     WHERE c.certificate_id = ?`,
    [req.params.id],
    (err, cert) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!cert) return res.status(404).json({ valid: false, message: 'Certificate not found' });
      const isExpired = cert.expiry_date && new Date(cert.expiry_date) < new Date();
      const isValid = cert.is_valid === 1;
      res.json({
        valid: isValid && !isExpired,
        certificate: { ...cert, status: isExpired ? 'expired' : (isValid ? 'active' : 'invalid') },
        message: isExpired ? 'Certificate has expired' : (isValid ? 'Certificate is valid and authentic' : 'Certificate is not active')
      });
    }
  );
});

router.get('/api/verify/hash/:hash', (req, res) => {
  const db = req.app.locals.db;
  db.get(
    `SELECT c.certificate_id AS id, c.issue_date AS issued_at, c.expiry_date,
            c.verification_hash, c.is_valid, c.certificate_number,
            s.service_name, u.full_name AS citizen_name
     FROM certificates c
     JOIN applications a ON c.application_id = a.application_id
     JOIN services s ON c.service_id = s.service_id
     JOIN users u ON c.user_id = u.user_id
     WHERE c.verification_hash = ?`,
    [req.params.hash],
    (err, cert) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!cert) return res.status(404).json({ valid: false, message: 'Certificate not found' });
      const isExpired = cert.expiry_date && new Date(cert.expiry_date) < new Date();
      const isValid = cert.is_valid === 1;
      res.json({
        valid: isValid && !isExpired,
        certificate: { ...cert, status: isExpired ? 'expired' : (isValid ? 'active' : 'invalid') },
        message: isExpired ? 'Certificate has expired' : (isValid ? 'Certificate is valid and authentic' : 'Certificate is not active')
      });
    }
  );
});

module.exports = router;
'''

files = {
    'routes/citizen.js': citizen,
    'routes/staff.js': staff,
    'routes/admin.js': admin,
    'routes/common.js': common,
}

for filepath, content in files.items():
    with open(filepath, 'w') as f:
        f.write(content)
    print(f'✅ Written: {filepath}')

print('\\n✅ All 4 route files written successfully!')