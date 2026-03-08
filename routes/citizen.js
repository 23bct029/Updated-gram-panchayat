const express = require('express');
const router = express.Router();
const { verifyToken, isCitizen } = require('../middleware/auth');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'public/uploads/';
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
            st.full_name AS issued_by_name, a.application_data
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
      const verifyUrl = `http://localhost:8001/verify/${cert.verification_hash}`;

      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${cert.service_name} - Certificate</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Serif:wght@400;700&family=Noto+Sans:wght@400;600&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Noto Serif', serif; background:#f5f0e8; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px; }
  .certificate { background:#fff; width:794px; min-height:1123px; margin:0 auto; padding:0; box-shadow:0 4px 40px rgba(0,0,0,0.2); position:relative; border:1px solid #c9a84c; }
  .border-outer { position:absolute; inset:8px; border:2px solid #c9a84c; pointer-events:none; z-index:1; }
  .border-inner { position:absolute; inset:14px; border:1px solid #e8d5a3; pointer-events:none; z-index:1; }
  .header { background:linear-gradient(135deg,#1a3a6b,#2563a8); color:#fff; padding:24px 40px; text-align:center; }
  .gov-title { font-size:11px; letter-spacing:3px; text-transform:uppercase; opacity:.85; font-family:'Noto Sans',sans-serif; }
  .panchayat-name { font-size:26px; font-weight:700; margin:6px 0 2px; letter-spacing:1px; }
  .sub-title { font-size:13px; opacity:.9; font-family:'Noto Sans',sans-serif; }
  .emblem { display:flex; align-items:center; justify-content:center; gap:20px; padding:20px 40px 10px; border-bottom:2px solid #c9a84c; }
  .emblem-icon { font-size:56px; }
  .emblem-text { text-align:center; }
  .emblem-text h2 { font-size:20px; color:#1a3a6b; font-weight:700; text-transform:uppercase; letter-spacing:2px; }
  .emblem-text p { font-size:12px; color:#6b5a2a; margin-top:2px; font-family:'Noto Sans',sans-serif; }
  .cert-number { text-align:center; padding:12px; background:#faf5e8; border-bottom:1px solid #e8d5a3; font-family:'Noto Sans',sans-serif; font-size:12px; color:#6b5a2a; }
  .cert-number strong { color:#1a3a6b; font-size:13px; }
  .body { padding:30px 50px; }
  .body p.intro { text-align:center; font-size:13px; color:#555; margin-bottom:20px; font-family:'Noto Sans',sans-serif; }
  .cert-title { text-align:center; font-size:28px; color:#1a3a6b; font-weight:700; text-transform:uppercase; letter-spacing:3px; margin-bottom:6px; }
  .underline { width:200px; height:3px; background:linear-gradient(90deg,transparent,#c9a84c,transparent); margin:0 auto 24px; }
  .body-text { font-size:14px; line-height:2; color:#333; text-align:justify; margin-bottom:20px; }
  .body-text strong { color:#1a3a6b; }
  .details-box { background:#faf5e8; border:1px solid #e8d5a3; border-radius:4px; padding:16px 20px; margin-bottom:24px; }
  .details-row { display:flex; border-bottom:1px dotted #e0d0a0; padding:8px 0; font-size:13px; font-family:'Noto Sans',sans-serif; }
  .details-row:last-child { border-bottom:none; }
  .details-label { width:200px; color:#6b5a2a; font-weight:600; }
  .details-value { flex:1; color:#1e293b; font-weight:400; }
  .purpose-box { background:#eff6ff; border-left:4px solid #2563a8; padding:12px 16px; margin-bottom:24px; font-size:13px; font-family:'Noto Sans',sans-serif; color:#1e40af; }
  .validity { text-align:center; background:#f0fdf4; border:1px solid #86efac; border-radius:4px; padding:10px; margin-bottom:24px; font-family:'Noto Sans',sans-serif; font-size:13px; color:#166534; }
  .footer { display:flex; justify-content:space-between; align-items:flex-end; padding:20px 50px 30px; border-top:2px solid #c9a84c; }
  .qr-section { text-align:center; }
  .qr-section p { font-size:10px; color:#888; margin-top:4px; font-family:'Noto Sans',sans-serif; }
  .signature-section { text-align:center; }
  .sig-line { width:180px; border-bottom:2px solid #1a3a6b; margin-bottom:6px; }
  .sig-name { font-size:13px; font-weight:700; color:#1a3a6b; font-family:'Noto Sans',sans-serif; }
  .sig-title { font-size:11px; color:#666; font-family:'Noto Sans',sans-serif; }
  .hash-box { text-align:center; padding:10px 40px 0; font-size:9px; color:#aaa; font-family:monospace; word-break:break-all; }
  .watermark { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%) rotate(-30deg); font-size:80px; color:rgba(37,99,168,0.04); font-weight:900; pointer-events:none; z-index:0; white-space:nowrap; text-transform:uppercase; letter-spacing:10px; }
  @media print { body{background:#fff;padding:0} .certificate{box-shadow:none;border:none} .no-print{display:none} }
</style>
</head>
<body>
<div class="no-print" style="text-align:center;padding:12px;background:#1a3a6b;color:#fff;font-family:sans-serif;font-size:13px">
  <button onclick="window.print()" style="background:#c9a84c;color:#1a3a6b;border:none;padding:8px 24px;border-radius:4px;font-weight:700;cursor:pointer;margin-right:10px">🖨️ Print / Save PDF</button>
  <span>Digital Gram Panchayat – Official Certificate</span>
</div>
<div class="certificate">
  <div class="border-outer"></div>
  <div class="border-inner"></div>
  <div class="watermark">OFFICIAL</div>
  <div class="header">
    <div class="gov-title">Government of India – Gram Panchayat</div>
    <div class="panchayat-name">🏛️ Digital Gram Panchayat Services Portal</div>
    <div class="sub-title">Village Administration • e-Governance Initiative</div>
  </div>
  <div class="emblem">
    <div class="emblem-icon">🪔</div>
    <div class="emblem-text">
      <h2>${cert.service_name}</h2>
      <p>Issued under the authority of Gram Panchayat Administration</p>
    </div>
    <div class="emblem-icon">🪔</div>
  </div>
  <div class="cert-number">Certificate No: <strong>${cert.certificate_number}</strong> &nbsp;|&nbsp; Issue Date: <strong>${issueDate}</strong></div>
  <div class="body">
    <p class="intro">This is to certify that the following information has been verified and approved by the authorized Gram Panchayat Officer</p>
    <div class="cert-title">${cert.service_name}</div>
    <div class="underline"></div>
    <div class="details-box">
      <div class="details-row"><span class="details-label">Full Name</span><span class="details-value"><strong>${cert.citizen_name}</strong></span></div>
      <div class="details-row"><span class="details-label">Aadhar Number</span><span class="details-value">${cert.aadhar_number ? cert.aadhar_number.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3') : '–'}</span></div>
      <div class="details-row"><span class="details-label">Address</span><span class="details-value">${cert.address || '–'}</span></div>
      <div class="details-row"><span class="details-label">Village / District</span><span class="details-value">${cert.village || '–'}, ${cert.district || '–'}</span></div>
      <div class="details-row"><span class="details-label">State</span><span class="details-value">${cert.state || 'Rajasthan'}</span></div>
      <div class="details-row"><span class="details-label">Issue Date</span><span class="details-value">${issueDate}</span></div>
      <div class="details-row"><span class="details-label">Valid Until</span><span class="details-value">${expiryDate}</span></div>
      <div class="details-row"><span class="details-label">Issued By</span><span class="details-value">${cert.issued_by_name || 'Gram Panchayat Officer'}</span></div>
    </div>
    ${appData.purpose ? `<div class="purpose-box"><strong>Purpose:</strong> ${appData.purpose}</div>` : ''}
    <p class="body-text">
      This certificate has been issued based on the documents submitted and verified by the Gram Panchayat office.
      This certificate is valid for official purposes. Any misuse or tampering of this certificate is a punishable offence under applicable laws.
    </p>
    <div class="validity">✅ This certificate is digitally verified. Scan the QR code or visit: <strong>${verifyUrl}</strong></div>
  </div>
  <div class="footer">
    <div class="qr-section">
      <div id="qrcode"></div>
      <p>Scan to verify</p>
    </div>
    <div class="signature-section">
      <div class="sig-line"></div>
      <div class="sig-name">${cert.issued_by_name || 'Gram Panchayat Officer'}</div>
      <div class="sig-title">Authorised Signatory</div>
      <div class="sig-title">Gram Panchayat Administration</div>
    </div>
  </div>
  <div class="hash-box">Digital Fingerprint (SHA-256): ${cert.verification_hash || ''}</div>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<script>
  new QRCode(document.getElementById('qrcode'), { text: '${verifyUrl}', width:90, height:90 });
</script>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html');
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
router.get('/schemes', (req, res) => {
  const schemes = [
    { id:1, name:'PM-KISAN', category:'Agriculture', desc:'Direct income support of ₹6,000/year for farmers with land holdings.', eligibility:'Farmers owning cultivable land', benefit:'₹6,000 per year in 3 installments', link:'https://pmkisan.gov.in', icon:'🌾' },
    { id:2, name:'MNREGA', category:'Employment', desc:'Guarantees 100 days of wage employment per year to rural households.', eligibility:'Rural households, any adult member willing to do unskilled work', benefit:'100 days work guarantee at minimum wages', link:'https://nrega.nic.in', icon:'⛏️' },
    { id:3, name:'PMAY-G', category:'Housing', desc:'Housing for all — financial assistance to BPL families to build pucca houses.', eligibility:'BPL families, SC/ST, minorities', benefit:'₹1.20 lakh (plain areas), ₹1.30 lakh (hills)', link:'https://pmayg.nic.in', icon:'🏠' },
    { id:4, name:'Sukanya Samriddhi', category:'Women & Child', desc:'Savings scheme for girl child education and marriage expenses.', eligibility:'Parents/guardians of girl child below 10 years', benefit:'High interest rate (8.2%), tax benefits', link:'https://www.nsiindia.gov.in', icon:'👧' },
    { id:5, name:'National Pension Scheme', category:'Social Security', desc:'Pension scheme for unorganised sector workers.', eligibility:'Age 18-40, unorganised workers', benefit:'₹3,000/month pension after 60', link:'https://www.npscra.nsdl.co.in', icon:'👴' },
    { id:6, name:'Ayushman Bharat', category:'Healthcare', desc:'Health coverage of ₹5 lakh per family per year for secondary and tertiary care.', eligibility:'Bottom 40% population as per SECC data', benefit:'₹5 lakh health insurance per family/year', link:'https://pmjay.gov.in', icon:'🏥' },
    { id:7, name:'Kisan Credit Card', category:'Agriculture', desc:'Credit facility for farmers to meet agricultural and allied needs.', eligibility:'Farmers, sharecroppers, tenant farmers', benefit:'Revolving credit up to ₹3 lakh at 7% interest', link:'https://www.nabard.org', icon:'💳' },
    { id:8, name:'PM Ujjwala Yojana', category:'Energy', desc:'Free LPG connections to women from BPL households.', eligibility:'BPL women, 18+ years', benefit:'Free LPG connection + first refill', link:'https://pmuy.gov.in', icon:'🔥' },
  ];
  res.json(schemes);
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
