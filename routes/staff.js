const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const path = require('path');
const crypto = require('crypto');

router.use(authenticateToken);
router.use(requireRole('staff'));

// ─────────────────────────────────────────────
// EXISTING: Staff Dashboard
// ─────────────────────────────────────────────
router.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/staff/dashboard.html'));
});

// EXISTING: Get pending applications (Feature 9: with queue priority)
router.get('/applications/pending', (req, res) => {
  db.all(
    `SELECT a.*, s.name AS service_name, u.name AS citizen_name, u.phone,
            CASE 
              WHEN julianday('now') - julianday(a.created_at) > 7 THEN 'high'
              WHEN julianday('now') - julianday(a.created_at) > 3 THEN 'medium'
              ELSE 'low'
            END AS priority,
            CAST(julianday('now') - julianday(a.created_at) AS INTEGER) AS waiting_days,
            sa.staff_id AS assigned_to
     FROM applications a
     JOIN services s ON a.service_id = s.id
     JOIN users u ON a.citizen_id = u.id
     LEFT JOIN staff_assignments sa ON sa.application_id = a.id
     WHERE a.status = 'pending'
       AND (sa.staff_id = ? OR sa.staff_id IS NULL)
     ORDER BY 
       CASE WHEN julianday('now') - julianday(a.created_at) > 7 THEN 1
            WHEN julianday('now') - julianday(a.created_at) > 3 THEN 2
            ELSE 3 END,
       a.created_at ASC`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(rows);
    }
  );
});

// EXISTING: Get all applications (verified, approved, rejected, etc.)
router.get('/applications', (req, res) => {
  const { status } = req.query;
  let query = `SELECT a.*, s.name AS service_name, u.name AS citizen_name FROM applications a JOIN services s ON a.service_id = s.id JOIN users u ON a.citizen_id = u.id`;
  const params = [];
  if (status) {
    query += ` WHERE a.status = ?`;
    params.push(status);
  }
  query += ` ORDER BY a.created_at DESC`;
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

// EXISTING: Get single application detail
router.get('/applications/:id', (req, res) => {
  db.get(
    `SELECT a.*, s.name AS service_name, u.name AS citizen_name, u.email, u.phone, u.address
     FROM applications a
     JOIN services s ON a.service_id = s.id
     JOIN users u ON a.citizen_id = u.id
     WHERE a.id = ?`,
    [req.params.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    }
  );
});

// EXISTING: Approve application & generate certificate
router.post('/applications/:id/approve', (req, res) => {
  const { remarks } = req.body;
  const appId = req.params.id;

  db.get(`SELECT * FROM applications WHERE id = ?`, [appId], (err, app) => {
    if (err || !app) return res.status(404).json({ error: 'Application not found' });

    db.run(
      `UPDATE applications SET status = 'approved', staff_remarks = ?, reviewed_by = ?, updated_at = datetime('now') WHERE id = ?`,
      [remarks, req.user.id, appId],
      (err2) => {
        if (err2) return res.status(500).json({ error: 'Failed to approve' });

        // Generate certificate hash
        const hash = crypto.createHash('sha256')
          .update(`${appId}-${Date.now()}-${process.env.JWT_SECRET || 'secret'}`)
          .digest('hex');

        // Issue certificate with expiry (1 year)
        db.run(
          `INSERT INTO certificates (application_id, issued_by, issued_at, expiry_date, verification_hash, status) 
           VALUES (?,?,datetime('now'),date('now','+1 year'),?,'active')`,
          [appId, req.user.id, hash],
          function(err3) {
            if (err3) return res.status(500).json({ error: 'Failed to generate certificate' });
            // Timeline event for citizen
            db.run(
              `INSERT INTO citizen_timeline_events (citizen_id, event_type, event_title, event_description, reference_id, created_at) VALUES (?,?,?,?,?,datetime('now'))`,
              [app.citizen_id, 'application_approved', 'Application Approved', `Your application was approved. Certificate issued.`, appId]
            );
            db.run(
              `INSERT INTO citizen_timeline_events (citizen_id, event_type, event_title, event_description, reference_id, created_at) VALUES (?,?,?,?,?,datetime('now'))`,
              [app.citizen_id, 'certificate_issued', 'Certificate Issued', `Certificate #${this.lastID} has been issued to you.`, this.lastID]
            );
            // Update workload
            db.run(`UPDATE staff_workload SET approved_count = approved_count + 1, updated_at = datetime('now') WHERE staff_id = ?`, [req.user.id]);
            res.json({ success: true, certificate_id: this.lastID });
          }
        );
      }
    );
  });
});

// EXISTING: Reject application (kept for backward compat)
router.post('/applications/:id/reject', (req, res) => {
  const { remarks } = req.body;
  db.get(`SELECT * FROM applications WHERE id = ?`, [req.params.id], (err, app) => {
    if (err || !app) return res.status(404).json({ error: 'Application not found' });
    db.run(
      `UPDATE applications SET status = 'rejected', staff_remarks = ?, reviewed_by = ?, updated_at = datetime('now') WHERE id = ?`,
      [remarks, req.user.id, req.params.id],
      (err2) => {
        if (err2) return res.status(500).json({ error: 'Failed to reject' });
        db.run(
          `INSERT INTO citizen_timeline_events (citizen_id, event_type, event_title, event_description, reference_id, created_at) VALUES (?,?,?,?,?,datetime('now'))`,
          [app.citizen_id, 'application_rejected', 'Application Rejected', `Your application was rejected. Reason: ${remarks}`, app.id]
        );
        res.json({ success: true });
      }
    );
  });
});

// ─────────────────────────────────────────────
// FEATURE 1: Request Correction (instead of reject)
// ─────────────────────────────────────────────
router.post('/applications/:id/request-correction', (req, res) => {
  const { correction_reason, required_documents } = req.body;
  const appId = req.params.id;

  db.get(`SELECT * FROM applications WHERE id = ?`, [appId], (err, app) => {
    if (err || !app) return res.status(404).json({ error: 'Application not found' });

    db.run(
      `UPDATE applications SET status = 'correction_required', updated_at = datetime('now') WHERE id = ?`,
      [appId],
      (err2) => {
        if (err2) return res.status(500).json({ error: 'Failed to update status' });

        db.run(
          `INSERT INTO application_corrections (application_id, requested_by, correction_reason, required_documents, status, created_at) VALUES (?,?,?,?,'pending',datetime('now'))`,
          [appId, req.user.id, correction_reason, required_documents],
          function(err3) {
            if (err3) return res.status(500).json({ error: 'Failed to create correction request' });
            // Timeline event
            db.run(
              `INSERT INTO citizen_timeline_events (citizen_id, event_type, event_title, event_description, reference_id, created_at) VALUES (?,?,?,?,?,datetime('now'))`,
              [app.citizen_id, 'correction_requested', 'Correction Requested', `Staff requested corrections: ${correction_reason}`, appId]
            );
            res.json({ success: true, correction_id: this.lastID });
          }
        );
      }
    );
  });
});

// GET: Pending correction requests for this staff
router.get('/corrections/pending', (req, res) => {
  db.all(
    `SELECT ac.*, a.id AS application_id, s.name AS service_name, u.name AS citizen_name
     FROM application_corrections ac
     JOIN applications a ON ac.application_id = a.id
     JOIN services s ON a.service_id = s.id
     JOIN users u ON a.citizen_id = u.id
     WHERE ac.requested_by = ? AND ac.status = 'resubmitted'
     ORDER BY ac.resubmitted_at ASC`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(rows);
    }
  );
});

// POST: Approve correction (mark as resolved)
router.post('/corrections/:id/approve', (req, res) => {
  db.get(`SELECT * FROM application_corrections WHERE id = ?`, [req.params.id], (err, corr) => {
    if (err || !corr) return res.status(404).json({ error: 'Correction not found' });
    db.run(
      `UPDATE application_corrections SET status = 'approved', resolved_at = datetime('now') WHERE id = ?`,
      [req.params.id],
      () => {
        db.run(`UPDATE applications SET status = 'pending', updated_at = datetime('now') WHERE id = ?`, [corr.application_id]);
        res.json({ success: true });
      }
    );
  });
});

// ─────────────────────────────────────────────
// FEATURE 9: Fair Queue - Next in Queue
// ─────────────────────────────────────────────
router.get('/queue/next', (req, res) => {
  // Get oldest unassigned high-priority application not yet assigned to this staff
  db.get(
    `SELECT a.*, s.name AS service_name, u.name AS citizen_name,
            CAST(julianday('now') - julianday(a.created_at) AS INTEGER) AS waiting_days
     FROM applications a
     JOIN services s ON a.service_id = s.id
     JOIN users u ON a.citizen_id = u.id
     LEFT JOIN staff_assignments sa ON sa.application_id = a.id
     WHERE a.status = 'pending' AND sa.application_id IS NULL
     ORDER BY a.created_at ASC
     LIMIT 1`,
    [],
    (err, app) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!app) return res.json({ message: 'No applications in queue', application: null });

      // Auto-assign to requesting staff
      db.run(
        `INSERT OR IGNORE INTO staff_assignments (staff_id, application_id, assigned_at) VALUES (?,?,datetime('now'))`,
        [req.user.id, app.id],
        () => {
          db.run(`UPDATE staff_workload SET pending_count = pending_count + 1, updated_at = datetime('now') WHERE staff_id = ?`, [req.user.id]);
          res.json({ application: app });
        }
      );
    }
  );
});

// ─────────────────────────────────────────────
// FEATURE 10: Staff Workload (own stats)
// ─────────────────────────────────────────────
router.get('/workload', (req, res) => {
  db.get(
    `SELECT sw.*, u.name AS staff_name,
            (SELECT COUNT(*) FROM applications WHERE reviewed_by = sw.staff_id AND status = 'approved') AS total_approved,
            (SELECT COUNT(*) FROM applications WHERE reviewed_by = sw.staff_id AND status = 'rejected') AS total_rejected,
            (SELECT COUNT(*) FROM staff_assignments WHERE staff_id = sw.staff_id) AS total_assigned
     FROM staff_workload sw
     JOIN users u ON sw.staff_id = u.id
     WHERE sw.staff_id = ?`,
    [req.user.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(row || { message: 'No workload data yet' });
    }
  );
});

module.exports = router;
