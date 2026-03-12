const express = require('express');
const router = express.Router();
const path = require('path');
const crypto = require('crypto');

router.get('/verify/:ref', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/verify.html'));
});

// Verify by application ID + hash (new QR format: /verify/APP1023?h=sha256hash)
router.get('/api/verify/by-app', (req, res) => {
  const db = req.app.locals.db;
  const { app_id, h } = req.query;
  if (!app_id || !h) return res.status(400).json({ valid: false, message: 'Missing parameters' });

  const numericId = app_id.replace(/^APP/i, '');

  db.get(
    `SELECT c.certificate_id AS id, c.issue_date AS issued_at, c.expiry_date,
            c.verification_hash, c.is_valid, c.certificate_number,
            c.application_id AS app_id,
            s.service_name, u.full_name AS citizen_name
     FROM certificates c
     JOIN applications a ON c.application_id = a.application_id
     JOIN services s ON c.service_id = s.service_id
     JOIN users u ON c.user_id = u.user_id
     WHERE a.application_id = ?`,
    [numericId],
    (err, cert) => {
      if (err) return res.status(500).json({ valid: false, message: 'Server error' });
      if (!cert) return res.status(404).json({ valid: false, message: 'Certificate not found for this Application ID' });

      // Recompute hash from stored data to verify tamper-detection
      const issueDateRaw = new Date(cert.issued_at).toISOString().split('T')[0];
      const expectedHash = crypto.createHash('sha256')
        .update(`${cert.app_id}|${cert.citizen_name}|${cert.service_name}|${issueDateRaw}`)
        .digest('hex');

      const hashMatch = (h === expectedHash) || (h === cert.verification_hash);

      if (!hashMatch) {
        return res.json({
          valid: false,
          tampered: true,
          message: 'Invalid Certificate — Possible Tampering Detected',
          certificate: { service_name: cert.service_name, status: 'tampered' }
        });
      }

      const isExpired = cert.expiry_date && new Date(cert.expiry_date) < new Date();
      const isValid = cert.is_valid === 1;
      res.json({
        valid: isValid && !isExpired,
        certificate: { ...cert, status: isExpired ? 'expired' : (isValid ? 'active' : 'invalid') },
        message: isExpired ? 'Certificate has expired' : (isValid ? 'Certificate is Valid and Authentic ✅' : 'Certificate is not active')
      });
    }
  );
});

router.get('/api/verify/certificate/:id', (req, res) => {
  const db = req.app.locals.db;
  db.get(
    `SELECT c.certificate_id AS id, c.issue_date AS issued_at, c.expiry_date,
            c.verification_hash, c.is_valid, c.certificate_number,
            c.application_id AS app_id,
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
        message: isExpired ? 'Certificate has expired' : (isValid ? 'Certificate is Valid and Authentic ✅' : 'Certificate is not active')
      });
    }
  );
});

router.get('/api/verify/hash/:hash', (req, res) => {
  const db = req.app.locals.db;
  db.get(
    `SELECT c.certificate_id AS id, c.issue_date AS issued_at, c.expiry_date,
            c.verification_hash, c.is_valid, c.certificate_number,
            c.application_id AS app_id,
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
        message: isExpired ? 'Certificate has expired' : (isValid ? 'Certificate is Valid and Authentic ✅' : 'Certificate is not active')
      });
    }
  );
});

module.exports = router;
