const express = require('express');
const router = express.Router();
const { verifyToken, isCitizen } = require('../middleware/auth');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const getUploadDir = (req) => {
  return req.app.locals.uploadsDir || path.join(__dirname, '..', 'uploads');
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = getUploadDir(req);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-z0-9.]/gi,'_'))
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

router.use(verifyToken);
router.use(isCitizen);

// Helper: create notification
function createNotification(db, userId, title, message, appId) {
  db.run(
    `INSERT INTO notifications (user_id, application_id, notification_type, title, message, is_read, sent_at)
     VALUES (?, ?, 'system', ?, ?, 0, datetime('now'))`,
    [userId, appId || null, title, message]
  );
}

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
      const result = (rows || []).map(r => {
        try { const d = JSON.parse(r.application_data||'{}'); r.purpose = d.purpose||''; } catch(e) { r.purpose=''; }
        return r;
      });
      res.json(result);
    });
});

router.post('/applications', upload.array('documents', 10), (req, res) => {
  const db = req.app.locals.db;
  const { service_id, purpose, details } = req.body;
  const files = req.files || [];
  const appData = { purpose, details, documents: files.map(f => f.filename) };

  db.run(
    `INSERT INTO applications (user_id, service_id, application_data, status, created_at)
     VALUES (?, ?, ?, 'pending', datetime('now'))`,
    [req.userId, service_id, JSON.stringify(appData)],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      const appId = this.lastID;
      // Auto-assign to staff member with fewest pending applications
      db.all(
        `SELECT s.staff_id,
                COUNT(a.application_id) AS pending_count
         FROM staff s
         LEFT JOIN applications a ON a.assigned_to = s.staff_id AND a.status = 'pending'
         WHERE s.is_active = 1
         GROUP BY s.staff_id
         ORDER BY pending_count ASC
         LIMIT 1`,
        [],
        (sErr, rows) => {
          if (!sErr && rows && rows.length > 0) {
            const staffId = rows[0].staff_id;
            db.run(`UPDATE applications SET assigned_to=? WHERE application_id=?`, [staffId, appId]);
            db.run(`INSERT OR IGNORE INTO staff_assignments (staff_id, application_id, assigned_at) VALUES (?,?,datetime('now'))`, [staffId, appId]);
          }
        }
      );
      // Timeline event
      db.run(
        `INSERT INTO citizen_timeline_events (citizen_id, event_type, event_title, event_description, reference_id, created_at)
         VALUES (?, 'application_submitted', 'Application Submitted', ?, ?, datetime('now'))`,
        [req.userId, `Applied for service. Purpose: ${purpose}`, appId]
      );
      // Notification
      createNotification(db, req.userId, '✅ Application Submitted', `Your application has been submitted and is under review. Application ID: #${appId}`, appId);
      res.json({ success: true, application_id: appId });
    });
});

router.get('/services', (req, res) => {
  const db = req.app.locals.db;
  db.all(
    `SELECT service_id AS id, service_name AS name, service_type,
            description, required_documents, processing_time, fee
     FROM services WHERE is_active = 1 ORDER BY service_name`,
    [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
});

router.get('/certificates', (req, res) => {
  const db = req.app.locals.db;
  db.all(
    `SELECT c.certificate_id AS id, c.certificate_number, c.issue_date AS issued_at,
            c.expiry_date, c.is_valid, c.verification_hash,
            s.service_name, s.service_id, a.application_data, a.application_id
     FROM certificates c
     JOIN applications a ON c.application_id = a.application_id
     JOIN services s ON c.service_id = s.service_id
     WHERE c.user_id = ?
     ORDER BY c.created_at DESC`,
    [req.userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const result = (rows || []).map(cert => {
        try { const d = JSON.parse(cert.application_data||'{}'); cert.purpose = d.purpose||''; } catch(e) { cert.purpose=''; }
        if (!cert.verification_hash) {
          const hash = crypto.createHash('sha256')
            .update(`${cert.id}-${cert.certificate_number}-${process.env.JWT_SECRET||'secret'}`)
            .digest('hex');
          db.run(`UPDATE certificates SET verification_hash = ? WHERE certificate_id = ?`, [hash, cert.id]);
          cert.verification_hash = hash;
        }
        return cert;
      });
      res.json(result);
    });
});

// Download certificate as HTML/PDF
router.get('/certificates/:id/download', (req, res) => {
  const db = req.app.locals.db;
  db.get(
    `SELECT c.*, s.service_name, u.full_name AS citizen_name, u.aadhar_number,
            u.address, u.village, u.district, u.state,
            st.full_name AS issued_by_name, a.application_data, a.application_id AS app_id
     FROM certificates c
     JOIN applications a ON c.application_id = a.application_id
     JOIN services s ON c.service_id = s.service_id
     JOIN users u ON c.user_id = u.user_id
     LEFT JOIN staff st ON c.issued_by = st.staff_id
     WHERE c.certificate_id = ? AND c.user_id = ?`,
    [req.params.id, req.userId],
    (err, cert) => {
      if (err || !cert) return res.status(404).json({ error: 'Certificate not found' });
      let appData = {};
      try { appData = JSON.parse(cert.application_data||'{}'); } catch(e) {}

      const issueDate = new Date(cert.issue_date).toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' });
      const expiryDate = cert.expiry_date ? new Date(cert.expiry_date).toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' }) : 'N/A';
      const issueDateRaw = new Date(cert.issue_date).toISOString().split('T')[0];

      // Hash computed from meaningful certificate fields (not random secret)
      const hashInput = `${cert.app_id}|${cert.citizen_name}|${cert.service_name}|${issueDateRaw}`;
      const certHash = crypto.createHash('sha256').update(hashInput).digest('hex');

      // Update stored hash to match this formula
      db.run(`UPDATE certificates SET verification_hash = ? WHERE certificate_id = ?`, [certHash, cert.certificate_id]);

      // QR code content: structured text with app ID and hash (NOT shown to citizen)
      const qrContent = `application_id: APP${cert.app_id}\nhash: ${certHash}`;
      const verifyUrl = `${req.protocol}://${req.get('host')}/verify/APP${cert.app_id}?h=${certHash}`;

      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${cert.service_name} – Official Certificate</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Serif:wght@400;700&family=Noto+Sans:wght@400;600;700&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Noto Serif', serif; background:#f5f0e8; min-height:100vh; display:flex; flex-direction:column; align-items:center; padding:20px; }
  .no-print { width:794px; background:#1a3a6b; color:#fff; padding:10px 20px; border-radius:8px 8px 0 0; display:flex; align-items:center; justify-content:space-between; font-family:'Noto Sans',sans-serif; font-size:13px; }
  .no-print button { background:#c9a84c; color:#1a3a6b; border:none; padding:8px 22px; border-radius:5px; font-weight:700; cursor:pointer; font-size:13px; }
  .certificate { background:#fff; width:794px; min-height:1123px; box-shadow:0 4px 40px rgba(0,0,0,.2); position:relative; border:1px solid #c9a84c; display:flex; flex-direction:column; }
  .border-outer { position:absolute; inset:8px; border:2px solid #c9a84c; pointer-events:none; z-index:1; }
  .border-inner { position:absolute; inset:14px; border:1px solid #e8d5a3; pointer-events:none; z-index:1; }
  .watermark { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%) rotate(-30deg); font-size:72px; color:rgba(37,99,168,.04); font-weight:900; pointer-events:none; z-index:0; white-space:nowrap; text-transform:uppercase; letter-spacing:8px; font-family:'Noto Sans',sans-serif; }
  /* HEADER */
  .cert-header { background:linear-gradient(135deg,#1a3a6b,#2563a8); color:#fff; padding:0; position:relative; }
  .cert-header-top { display:flex; align-items:center; justify-content:space-between; padding:16px 36px 0; }
  .ashoka { font-size:52px; }
  .header-center { text-align:center; flex:1; padding:0 16px; }
  .gov-label { font-size:10px; letter-spacing:3px; text-transform:uppercase; opacity:.8; font-family:'Noto Sans',sans-serif; }
  .panchayat-name { font-size:22px; font-weight:700; margin:4px 0 2px; letter-spacing:.5px; }
  .panchayat-sub { font-size:11px; opacity:.85; font-family:'Noto Sans',sans-serif; }
  .cert-header-divider { height:3px; background:linear-gradient(90deg,transparent,#c9a84c,transparent); margin:12px 36px 0; }
  .cert-type-banner { text-align:center; padding:10px 36px 16px; }
  .cert-type-banner h2 { font-size:18px; font-weight:700; text-transform:uppercase; letter-spacing:3px; color:rgba(255,255,255,.95); }
  /* CERT NUMBER BAR */
  .cert-num-bar { background:#faf5e8; border-top:2px solid #c9a84c; border-bottom:1px solid #e8d5a3; padding:10px 36px; display:flex; justify-content:space-between; font-family:'Noto Sans',sans-serif; font-size:12px; color:#6b5a2a; }
  .cert-num-bar strong { color:#1a3a6b; }
  /* BODY */
  .cert-body { padding:24px 44px; flex:1; position:relative; z-index:2; }
  .cert-intro { text-align:center; font-size:13px; color:#666; margin-bottom:18px; font-family:'Noto Sans',sans-serif; font-style:italic; }
  .cert-subject { text-align:center; font-size:26px; font-weight:700; color:#1a3a6b; text-transform:uppercase; letter-spacing:2px; margin-bottom:4px; }
  .gold-line { width:180px; height:3px; background:linear-gradient(90deg,transparent,#c9a84c,transparent); margin:0 auto 20px; }
  .details-box { background:#faf5e8; border:1px solid #e8d5a3; border-radius:4px; padding:14px 18px; margin-bottom:18px; }
  .dr { display:flex; border-bottom:1px dotted #e0d0a0; padding:7px 0; font-size:13px; font-family:'Noto Sans',sans-serif; }
  .dr:last-child { border-bottom:none; }
  .dl { width:190px; color:#6b5a2a; font-weight:600; flex-shrink:0; }
  .dv { flex:1; color:#1e293b; }
  .purpose-strip { background:#eff6ff; border-left:4px solid #2563a8; padding:10px 14px; margin-bottom:18px; font-size:13px; font-family:'Noto Sans',sans-serif; color:#1e40af; }
  .body-para { font-size:13px; line-height:1.9; color:#333; text-align:justify; margin-bottom:16px; }
  .valid-strip { text-align:center; background:#f0fdf4; border:1px solid #86efac; border-radius:4px; padding:9px; margin-bottom:18px; font-family:'Noto Sans',sans-serif; font-size:12px; color:#166534; }
  /* FOOTER */
  .cert-footer { border-top:2px solid #c9a84c; padding:16px 44px 20px; display:flex; justify-content:space-between; align-items:flex-end; background:#fefefe; }
  .qr-block { text-align:center; }
  .qr-label { font-size:9px; color:#888; margin-top:4px; font-family:'Noto Sans',sans-serif; }
  .sig-block { text-align:center; }
  .sig-line { width:170px; border-bottom:2px solid #1a3a6b; margin-bottom:5px; }
  .sig-name { font-size:13px; font-weight:700; color:#1a3a6b; font-family:'Noto Sans',sans-serif; }
  .sig-title { font-size:10px; color:#666; font-family:'Noto Sans',sans-serif; margin-top:1px; }
  .cert-id-footer { text-align:center; font-size:9px; font-family:'Noto Sans',sans-serif; color:#aaa; padding:6px 44px 10px; letter-spacing:.3px; }
  @media print { body{background:#fff;padding:0} .no-print{display:none!important} .certificate{box-shadow:none;border:none;min-height:100vh} }
</style>
</head>
<body>
<div class="no-print">
  <span>🏛️ Digital Gram Panchayat – Official Certificate</span>
  <button onclick="window.print()">🖨️ Print / Save as PDF</button>
</div>
<div class="certificate">
  <div class="border-outer"></div>
  <div class="border-inner"></div>
  <div class="watermark">OFFICIAL</div>

  <div class="cert-header">
    <div class="cert-header-top">
      <div class="ashoka">🏛️</div>
      <div class="header-center">
        <div class="gov-label">Government of India · Gram Panchayat</div>
        <div class="panchayat-name">Digital Gram Panchayat Services Portal</div>
        <div class="panchayat-sub">Village Administration · e-Governance Initiative · Paperless · Transparent</div>
      </div>
      <div class="ashoka">🏛️</div>
    </div>
    <div class="cert-header-divider"></div>
    <div class="cert-type-banner"><h2>${cert.service_name}</h2></div>
  </div>

  <div class="cert-num-bar">
    <span>Certificate No: <strong>${cert.certificate_number}</strong></span>
    <span>Application ID: <strong>APP${cert.app_id}</strong></span>
    <span>Issue Date: <strong>${issueDate}</strong></span>
  </div>

  <div class="cert-body">
    <p class="cert-intro">This is to certify that the following information has been duly verified and approved by the authorized Gram Panchayat Officer</p>
    <div class="cert-subject">${cert.service_name}</div>
    <div class="gold-line"></div>

    <div class="details-box">
      <div class="dr"><span class="dl">Full Name</span><span class="dv"><strong>${cert.citizen_name}</strong></span></div>
      <div class="dr"><span class="dl">Aadhar Number</span><span class="dv">${cert.aadhar_number ? cert.aadhar_number.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 XXXX') : '–'}</span></div>
      <div class="dr"><span class="dl">Address</span><span class="dv">${cert.address || '–'}</span></div>
      <div class="dr"><span class="dl">Village / District</span><span class="dv">${cert.village || '–'}, ${cert.district || '–'}</span></div>
      <div class="dr"><span class="dl">State</span><span class="dv">${cert.state || 'India'}</span></div>
      <div class="dr"><span class="dl">Certificate Type</span><span class="dv">${cert.service_name}</span></div>
      <div class="dr"><span class="dl">Issue Date</span><span class="dv">${issueDate}</span></div>
      <div class="dr"><span class="dl">Valid Until</span><span class="dv">${expiryDate}</span></div>
      <div class="dr"><span class="dl">Issued By</span><span class="dv">${cert.issued_by_name || 'Gram Panchayat Officer'}</span></div>
    </div>

    ${appData.purpose ? `<div class="purpose-strip"><strong>📋 Purpose:</strong> ${appData.purpose}</div>` : ''}

    <p class="body-para">
      This certificate is issued based on the documents submitted and duly verified by the Gram Panchayat office.
      This document is valid for all official purposes. Any misuse, forgery, or tampering of this certificate
      is a punishable offence under applicable Indian laws.
    </p>

    <div class="valid-strip">✅ This certificate is digitally verified. Scan the QR code below to verify authenticity.</div>
  </div>

  <div class="cert-footer">
    <div class="qr-block">
      <div id="qrcode"></div>
      <div class="qr-label">Scan QR to verify</div>
    </div>
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-name">${cert.issued_by_name || 'Gram Panchayat Officer'}</div>
      <div class="sig-title">Authorised Signatory</div>
      <div class="sig-title">Gram Panchayat Administration</div>
    </div>
  </div>
  <div class="cert-id-footer">Certificate No: ${cert.certificate_number} · Application ID: APP${cert.app_id} · Verify at: ${verifyUrl}</div>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<script>
  // QR contains application_id and hash – NOT shown to user in plain text
  new QRCode(document.getElementById('qrcode'), {
    text: ${JSON.stringify(qrContent)},
    width: 100, height: 100,
    correctLevel: QRCode.CorrectLevel.M
  });
</script>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `inline; filename="${cert.service_name.replace(/\s+/g,'_')}_${cert.certificate_number}.html"`);
      res.send(html);
    });
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
    [req.userId], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
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
          createNotification(db, req.userId, '🔄 Renewal Application Submitted', `Your certificate renewal request has been submitted. Application ID: #${this.lastID}`, this.lastID);
          res.json({ success: true, application_id: this.lastID });
        });
    });
});

router.get('/corrections', (req, res) => {
  const db = req.app.locals.db;
  db.all(
    `SELECT ac.*, s.service_name
     FROM application_corrections ac
     JOIN applications a ON ac.application_id = a.application_id
     JOIN services s ON a.service_id = s.service_id
     WHERE a.user_id = ? ORDER BY ac.created_at DESC`,
    [req.userId], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
});

router.post('/corrections/:id/resubmit', upload.array('documents', 10), (req, res) => {
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
          createNotification(db, req.userId, '📤 Documents Resubmitted', 'Your corrected documents have been submitted and are under review.', correction.application_id);
          res.json({ success: true });
        });
    });
});

router.get('/multi-application', (req, res) => {
  const db = req.app.locals.db;
  db.all(
    `SELECT mar.*,
      (SELECT COUNT(*) FROM applications WHERE multi_request_id = mar.id) AS total_sub,
      (SELECT COUNT(*) FROM applications WHERE multi_request_id = mar.id AND status='approved') AS approved_sub,
      (SELECT COUNT(*) FROM applications WHERE multi_request_id = mar.id AND status='pending') AS pending_sub
     FROM multi_application_requests mar WHERE mar.citizen_id = ? ORDER BY mar.created_at DESC`,
    [req.userId], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
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
          () => { if (++inserted === serviceIds.length) {
            createNotification(db, req.userId, '📋 Multi-Application Submitted', `Your multi-certificate request for "${purpose}" has been submitted (${serviceIds.length} certificates).`, null);
            res.json({ success: true, multi_request_id: multiId });
          }}
        );
      });
    });
});

router.get('/timeline', (req, res) => {
  const db = req.app.locals.db;
  db.all(`SELECT * FROM citizen_timeline_events WHERE citizen_id=? ORDER BY created_at DESC LIMIT 100`,
    [req.userId], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
});

// Notifications
router.get('/notifications', (req, res) => {
  const db = req.app.locals.db;
  db.all(
    `SELECT * FROM notifications WHERE user_id=? ORDER BY sent_at DESC LIMIT 50`,
    [req.userId], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
});

router.patch('/notifications/:id/read', (req, res) => {
  const db = req.app.locals.db;
  db.run(`UPDATE notifications SET is_read=1 WHERE notification_id=? AND user_id=?`,
    [req.params.id, req.userId],
    (err) => { if (err) return res.status(500).json({ error: err.message }); res.json({ success: true }); });
});

router.patch('/notifications/read-all', (req, res) => {
  const db = req.app.locals.db;
  db.run(`UPDATE notifications SET is_read=1 WHERE user_id=?`, [req.userId],
    (err) => { if (err) return res.status(500).json({ error: err.message }); res.json({ success: true }); });
});

router.get('/notifications/unread-count', (req, res) => {
  const db = req.app.locals.db;
  db.get(`SELECT COUNT(*) AS count FROM notifications WHERE user_id=? AND is_read=0`,
    [req.userId], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ count: row ? row.count : 0 });
    });
});

// Public: schemes and announcements (no auth needed - moved to common via auth bypass)
// Profile - GET
router.get('/profile', (req, res) => {
  const db = req.app.locals.db;
  db.get(
    `SELECT user_id AS id, full_name, email, phone, address, village, block, district, state, pincode,
            date_of_birth, gender, occupation, created_at
     FROM users WHERE user_id = ?`,
    [req.userId],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'User not found' });
      res.json(row);
    });
});

// Profile - UPDATE (email and aadhar are NOT updatable)
router.patch('/profile', (req, res) => {
  const db = req.app.locals.db;
  const { full_name, phone, address, village, block, district, state, pincode, date_of_birth, gender, occupation } = req.body;
  db.run(
    `UPDATE users SET full_name=?, phone=?, address=?, village=?, block=?, district=?, state=?, pincode=?,
            date_of_birth=?, gender=?, occupation=?, updated_at=datetime('now')
     WHERE user_id=?`,
    [full_name, phone, address, village, block, district, state, pincode, date_of_birth, gender, occupation, req.userId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
});

// Schemes - filtered by citizen's occupation (only show eligible schemes)
router.get('/schemes', (req, res) => {
  const db = req.app.locals.db;
  db.get(`SELECT occupation, gender, date_of_birth FROM users WHERE user_id=?`, [req.userId], (err, user) => {
    const occ = ((user && user.occupation) || '').toLowerCase();
    const gender = ((user && user.gender) || '').toLowerCase();
    const age = user && user.date_of_birth
      ? Math.floor((Date.now() - new Date(user.date_of_birth)) / (365.25*24*3600*1000))
      : null;

    const allSchemes = [
      { id:1, name:'PM-KISAN', category:'Agriculture', icon:'🌾',
        desc:'Direct income support of ₹6,000/year for farmers with land holdings.',
        eligibility:'Farmers owning cultivable land',
        benefit:'₹6,000 per year in 3 installments', link:'https://pmkisan.gov.in',
        occupations:['farmer','agriculture','agriculturist','tenant','sharecropper'] },
      { id:2, name:'MNREGA', category:'Employment', icon:'⛏️',
        desc:'Guarantees 100 days of wage employment per year to rural households.',
        eligibility:'Any adult rural household member',
        benefit:'100 days work guarantee at minimum wages', link:'https://nrega.nic.in',
        occupations:['all'] },
      { id:3, name:'PMAY-G (Housing)', category:'Housing', icon:'🏠',
        desc:'Financial assistance to BPL/SC/ST families to build pucca houses.',
        eligibility:'BPL families, SC/ST, minorities without pucca house',
        benefit:'₹1.20–1.30 lakh for house construction', link:'https://pmayg.nic.in',
        occupations:['all'] },
      { id:4, name:'Sukanya Samriddhi', category:'Women & Child', icon:'👧',
        desc:'Savings scheme for girl child education and marriage.',
        eligibility:'Parents/guardians of girl child below 10 years',
        benefit:'8.2% interest, tax benefits', link:'https://www.nsiindia.gov.in',
        genders:['female'], occupations:['all'] },
      { id:5, name:'Ayushman Bharat', category:'Healthcare', icon:'🏥',
        desc:'Health coverage of ₹5 lakh per family per year.',
        eligibility:'Bottom 40% population (SECC data)',
        benefit:'₹5 lakh health insurance/year', link:'https://pmjay.gov.in',
        occupations:['all'] },
      { id:6, name:'PM Ujjwala Yojana', category:'Energy', icon:'🔥',
        desc:'Free LPG connections to women from BPL households.',
        eligibility:'BPL women, 18+ years',
        benefit:'Free LPG connection + first refill', link:'https://pmuy.gov.in',
        genders:['female'], occupations:['all'] },
      { id:7, name:'Kisan Credit Card', category:'Agriculture', icon:'💳',
        desc:'Credit facility for farmers at subsidised interest rate.',
        eligibility:'Farmers, sharecroppers, tenant farmers',
        benefit:'Credit up to ₹3 lakh at 7% interest', link:'https://www.nabard.org',
        occupations:['farmer','agriculture','agriculturist','tenant','sharecropper'] },
      { id:8, name:'National Pension Scheme', category:'Social Security', icon:'👴',
        desc:'Pension scheme for unorganised sector workers.',
        eligibility:'Age 18-40, unorganised workers',
        benefit:'₹3,000/month pension after 60', link:'https://www.npscra.nsdl.co.in',
        occupations:['labour','laborer','worker','daily wage','unorganised','casual'] },
    ];

    const eligible = allSchemes.filter(s => {
      // If occupations is 'all', always eligible
      if (s.occupations && s.occupations[0] !== 'all') {
        // If we have occupation data, filter strictly
        if (occ) {
          const matches = s.occupations.some(o => occ.includes(o) || o.includes(occ));
          if (!matches) return false;
        }
        // If no occupation set, show anyway (citizen hasn't filled profile)
      }
      // Gender filter for specific schemes
      if (s.genders && s.genders.length && gender) {
        if (!s.genders.includes(gender)) return false;
      }
      return true;
    });

    res.json(eligible.map(s => ({ ...s, occupations: undefined, genders: undefined })));
  });
});

router.get('/announcements', (req, res) => {
  const db = req.app.locals.db;
  db.all(`SELECT * FROM announcements WHERE is_active=1 AND (expiry_date IS NULL OR expiry_date > datetime('now')) ORDER BY published_on DESC LIMIT 20`,
    [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
});

module.exports = router;
