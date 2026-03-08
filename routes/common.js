const express = require('express');
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
