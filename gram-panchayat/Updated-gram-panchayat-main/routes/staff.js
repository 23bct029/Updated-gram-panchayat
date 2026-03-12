const express = require('express');
const router = express.Router();
const { verifyToken, isStaff } = require('../middleware/auth');
const crypto = require('crypto');
const path = require('path');

router.use(verifyToken);
router.use(isStaff);

function createNotification(db, userId, title, message, appId) {
  db.run(
    `INSERT INTO notifications (user_id, application_id, notification_type, title, message, is_read, sent_at)
     VALUES (?, ?, 'system', ?, ?, 0, datetime('now'))`,
    [userId, appId || null, title, message]
  );
}

router.get('/applications/pending', (req, res) => {
  const db = req.app.locals.db;
  // Only show applications assigned to this staff member
  db.all(
    `SELECT a.application_id AS id, a.status, a.created_at, a.application_data,
            s.service_name, u.full_name AS citizen_name, u.phone, u.email,
            CAST(julianday('now') - julianday(a.created_at) AS INTEGER) AS waiting_days,
            CASE WHEN CAST(julianday('now') - julianday(a.created_at) AS INTEGER) > 7 THEN 'high'
                 WHEN CAST(julianday('now') - julianday(a.created_at) AS INTEGER) > 3 THEN 'medium'
                 ELSE 'low' END AS priority
     FROM applications a
     JOIN services s ON a.service_id = s.service_id
     JOIN users u ON a.user_id = u.user_id
     WHERE a.status IN ('pending','verified') AND a.assigned_to = ?
     ORDER BY waiting_days DESC, a.created_at ASC`,
    [req.userId], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
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
            u.full_name AS citizen_name, u.email, u.phone, u.address, u.aadhar_number, u.user_id
     FROM applications a
     JOIN services s ON a.service_id = s.service_id
     JOIN users u ON a.user_id = u.user_id
     WHERE a.application_id = ?`,
    [req.params.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Not found' });
      try { const d = JSON.parse(row.application_data||'{}'); row.purpose = d.purpose||''; row.details = d.details||''; row.uploaded_docs = d.documents||[]; } catch(e) {}
      res.json(row);
    });
});

// Mark application as verified (intermediate step before approval)
router.post('/applications/:id/verify', (req, res) => {
  const db = req.app.locals.db;
  db.run(
    `UPDATE applications SET status='verified', updated_at=datetime('now') WHERE application_id=? AND assigned_to=?`,
    [req.params.id, req.userId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
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
            const certId = this.lastID;
            // Timeline
            db.run(
              `INSERT INTO citizen_timeline_events (citizen_id, event_type, event_title, event_description, reference_id, created_at)
               VALUES (?, 'approved', 'Application Approved ✅', 'Your application was approved and certificate has been issued. You can download it now.', ?, datetime('now'))`,
              [app.user_id, appId]
            );
            // Notification to citizen
            createNotification(db, app.user_id, '🎉 Certificate Approved!',
              `Your application has been approved! Your certificate is ready for download. Certificate No: ${certNum}${remarks ? '. Note: ' + remarks : ''}`, appId);
            // Check if expiring soon and notify for renewal
            db.run(`INSERT INTO citizen_timeline_events (citizen_id, event_type, event_title, event_description, reference_id, created_at)
                    VALUES (?, 'certificate_issued', 'Certificate Issued 📜', ?, ?, datetime('now'))`,
              [app.user_id, `Certificate ${certNum} issued. Valid for 1 year.`, certId]);
            res.json({ success: true, certificate_id: certId });
          });
      });
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
           VALUES (?, 'rejected', 'Application Rejected ❌', ?, ?, datetime('now'))`,
          [app.user_id, `Rejected: ${remarks}`, app.application_id]
        );
        createNotification(db, app.user_id, '❌ Application Rejected',
          `Your application has been rejected. Reason: ${remarks}. You may re-apply with correct documents.`, app.application_id);
        res.json({ success: true });
      });
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
             VALUES (?, 'correction_requested', 'Correction Requested ✏️', ?, ?, datetime('now'))`,
            [app.user_id, `Staff requested: ${correction_reason}`, appId]
          );
          createNotification(db, app.user_id, '✏️ Correction Required',
            `Staff has requested corrections for your application. Reason: ${correction_reason}. Required: ${required_documents || 'See details'}. Please resubmit.`, appId);
          res.json({ success: true, correction_id: this.lastID });
        });
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
    [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
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
    [], (err, app) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!app) return res.json({ message: 'No applications in queue', application: null });
      db.run(
        `INSERT OR IGNORE INTO staff_assignments (staff_id, application_id, assigned_at) VALUES (?,?,datetime('now'))`,
        [req.userId, app.id],
        () => res.json({ application: app })
      );
    });
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
    });
});

// All applications (for "All Applications" tab) — all staff can see all
router.get('/applications/all', (req, res) => {
  const db = req.app.locals.db;
  const { search, staff_id } = req.query;
  let query = `SELECT a.application_id AS id, a.status, a.created_at, a.application_data,
                      s.service_name, u.full_name AS citizen_name,
                      st.full_name AS assigned_to_name, a.assigned_to AS assigned_staff_id
               FROM applications a
               JOIN services s ON a.service_id = s.service_id
               JOIN users u ON a.user_id = u.user_id
               LEFT JOIN staff st ON a.assigned_to = st.staff_id`;
  const params = [];
  const conditions = [];
  if (search) {
    conditions.push(`(u.full_name LIKE ? OR CAST(a.application_id AS TEXT) LIKE ? OR st.full_name LIKE ?)`);
    params.push('%'+search+'%', '%'+search+'%', '%'+search+'%');
  }
  if (staff_id) {
    conditions.push(`a.assigned_to = ?`);
    params.push(staff_id);
  }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY a.created_at DESC LIMIT 200';
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// Staff list (for search filter in all-applications)
router.get('/staff-list', (req, res) => {
  const db = req.app.locals.db;
  db.all(`SELECT staff_id AS id, full_name AS name FROM staff WHERE is_active=1 ORDER BY full_name`,
    [], (err, rows) => { res.json(rows || []); });
});

// QR Verify certificate (staff-only)
router.get('/verify-certificate', (req, res) => {
  const db = req.app.locals.db;
  const { app_id, h } = req.query;
  if (!app_id) return res.status(400).json({ valid: false, message: 'Missing app_id' });

  const numericId = String(app_id).replace(/^APP/i, '');
  db.get(
    `SELECT c.certificate_id AS id, c.issue_date AS issued_at, c.expiry_date,
            c.verification_hash, c.is_valid, c.certificate_number,
            c.application_id AS app_id,
            s.service_name, u.full_name AS citizen_name, u.aadhar_number
     FROM certificates c
     JOIN applications a ON c.application_id = a.application_id
     JOIN services s ON c.service_id = s.service_id
     JOIN users u ON c.user_id = u.user_id
     WHERE a.application_id = ?`,
    [numericId],
    (err, cert) => {
      if (err) return res.status(500).json({ valid: false, message: 'DB error' });
      if (!cert) return res.status(404).json({ valid: false, message: 'No certificate found for Application ID: APP' + numericId });

      const crypto = require('crypto');
      const issueDateRaw = new Date(cert.issued_at).toISOString().split('T')[0];
      const expectedHash = crypto.createHash('sha256')
        .update(`${cert.app_id}|${cert.citizen_name}|${cert.service_name}|${issueDateRaw}`)
        .digest('hex');

      const hashMatch = !h || h === expectedHash || h === cert.verification_hash;
      if (h && !hashMatch) {
        return res.json({ valid: false, tampered: true, message: 'Invalid Certificate — Possible Tampering Detected' });
      }

      const isExpired = cert.expiry_date && new Date(cert.expiry_date) < new Date();
      const isValid = cert.is_valid === 1;
      res.json({
        valid: isValid && !isExpired,
        certificate: { ...cert, status: isExpired ? 'expired' : (isValid ? 'active' : 'invalid') },
        message: isExpired ? 'Certificate Expired' : (isValid ? 'Certificate is Valid and Authentic ✅' : 'Certificate is not active')
      });
    }
  );
});

// Staff: get uploaded documents list for an application
router.get('/applications/:id/documents', (req, res) => {
  const db = req.app.locals.db;
  db.get(
    `SELECT a.application_id AS id, a.application_data, s.service_name, u.full_name AS citizen_name
     FROM applications a
     JOIN services s ON a.service_id = s.service_id
     JOIN users u ON a.user_id = u.user_id
     WHERE a.application_id = ?`,
    [req.params.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Not found' });
      let docs = [];
      try {
        const d = JSON.parse(row.application_data || '{}');
        docs = (d.documents || []).map((filename, idx) => ({
          index: idx + 1,
          filename,
          url: `/uploads/${filename}`,
          label: `Document ${idx + 1}`,
          type: filename.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? 'image' : 'pdf'
        }));
      } catch(e) {}
      res.json({ application_id: row.id, citizen_name: row.citizen_name, service_name: row.service_name, documents: docs });
    }
  );
});

module.exports = router;
