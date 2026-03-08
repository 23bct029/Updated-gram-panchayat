const express = require('express');
const router = express.Router();
const db = require('../database/db');
const path = require('path');

// ─────────────────────────────────────────────
// PUBLIC: Certificate Verification Page
// Feature 3 & 4: QR Code leads to this page
// ─────────────────────────────────────────────

// Public verification landing page
router.get('/verify/:hash', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/verify.html'));
});

// API: Verify by certificate ID (public)
router.get('/api/verify/certificate/:id', (req, res) => {
  db.get(
    `SELECT c.id, c.issued_at, c.expiry_date, c.verification_hash, c.status,
            s.name AS service_name,
            u.name AS citizen_name,
            a.purpose
     FROM certificates c
     JOIN applications a ON c.application_id = a.id
     JOIN services s ON a.service_id = s.id
     JOIN users u ON a.citizen_id = u.id
     WHERE c.id = ?`,
    [req.params.id],
    (err, cert) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!cert) return res.status(404).json({ valid: false, message: 'Certificate not found' });

      const isExpired = cert.expiry_date && new Date(cert.expiry_date) < new Date();
      const isActive = cert.status === 'active';

      // Log verification
      db.run(
        `INSERT INTO certificate_verification_logs (certificate_id, verification_method, created_at) VALUES (?,?,datetime('now'))`,
        [cert.id, 'public_api']
      );

      res.json({
        valid: isActive && !isExpired,
        certificate: {
          id: cert.id,
          service_name: cert.service_name,
          citizen_name: cert.citizen_name,
          purpose: cert.purpose,
          issued_at: cert.issued_at,
          expiry_date: cert.expiry_date,
          status: isExpired ? 'expired' : cert.status
        },
        message: isExpired ? 'Certificate has expired' : (isActive ? 'Certificate is valid and authentic' : 'Certificate is not active')
      });
    }
  );
});

// API: Verify by hash (QR code URL verification)
router.get('/api/verify/hash/:hash', (req, res) => {
  db.get(
    `SELECT c.id, c.issued_at, c.expiry_date, c.verification_hash, c.status,
            s.name AS service_name,
            u.name AS citizen_name,
            a.purpose
     FROM certificates c
     JOIN applications a ON c.application_id = a.id
     JOIN services s ON a.service_id = s.id
     JOIN users u ON a.citizen_id = u.id
     WHERE c.verification_hash = ?`,
    [req.params.hash],
    (err, cert) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!cert) return res.status(404).json({ valid: false, message: 'Certificate not found or invalid hash' });

      const isExpired = cert.expiry_date && new Date(cert.expiry_date) < new Date();
      const isActive = cert.status === 'active';

      db.run(
        `INSERT INTO certificate_verification_logs (certificate_id, verification_method, created_at) VALUES (?,?,datetime('now'))`,
        [cert.id, 'qr_scan']
      );

      res.json({
        valid: isActive && !isExpired,
        certificate: {
          id: cert.id,
          service_name: cert.service_name,
          citizen_name: cert.citizen_name,
          purpose: cert.purpose,
          issued_at: cert.issued_at,
          expiry_date: cert.expiry_date,
          status: isExpired ? 'expired' : cert.status
        },
        message: isExpired ? 'Certificate has expired' : (isActive ? 'Certificate is valid and authentic' : 'Certificate is not active')
      });
    }
  );
});

module.exports = router;
