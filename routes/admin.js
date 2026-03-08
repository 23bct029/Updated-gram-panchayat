const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const path = require('path');

router.use(authenticateToken);
router.use(requireRole('admin'));

// ─────────────────────────────────────────────
// EXISTING: Admin Dashboard
// ─────────────────────────────────────────────
router.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/admin/dashboard.html'));
});

// EXISTING: Dashboard stats
router.get('/stats', (req, res) => {
  db.get(
    `SELECT 
      (SELECT COUNT(*) FROM users WHERE role = 'citizen') AS total_citizens,
      (SELECT COUNT(*) FROM users WHERE role = 'staff') AS total_staff,
      (SELECT COUNT(*) FROM applications) AS total_applications,
      (SELECT COUNT(*) FROM applications WHERE status = 'pending') AS pending_applications,
      (SELECT COUNT(*) FROM applications WHERE status = 'approved') AS approved_applications,
      (SELECT COUNT(*) FROM certificates) AS total_certificates`,
    [],
    (err, stats) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(stats);
    }
  );
});

// EXISTING: Manage Users
router.get('/users', (req, res) => {
  db.all(
    `SELECT id, name, email, phone, role, created_at, is_active FROM users WHERE role = 'citizen' ORDER BY created_at DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(rows);
    }
  );
});

router.patch('/users/:id/toggle', (req, res) => {
  db.run(
    `UPDATE users SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?`,
    [req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: 'Failed to update user' });
      res.json({ success: true });
    }
  );
});

// EXISTING: Manage Staff
router.get('/staff', (req, res) => {
  db.all(
    `SELECT u.id, u.name, u.email, u.phone, u.created_at, u.is_active,
            COALESCE(sw.approved_count, 0) AS approved_count,
            COALESCE(sw.pending_count, 0) AS pending_count
     FROM users u
     LEFT JOIN staff_workload sw ON sw.staff_id = u.id
     WHERE u.role = 'staff' ORDER BY u.created_at DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(rows);
    }
  );
});

router.post('/staff', (req, res) => {
  const bcrypt = require('bcrypt');
  const { name, email, phone, password } = req.body;
  bcrypt.hash(password, 10, (err, hash) => {
    if (err) return res.status(500).json({ error: 'Hash error' });
    db.run(
      `INSERT INTO users (name, email, phone, password, role, is_active, created_at) VALUES (?,?,?,?,'staff',1,datetime('now'))`,
      [name, email, phone, hash],
      function(err2) {
        if (err2) return res.status(400).json({ error: 'Email already exists' });
        db.run(`INSERT INTO staff_workload (staff_id, pending_count, approved_count, updated_at) VALUES (?,0,0,datetime('now'))`, [this.lastID]);
        res.json({ success: true, staff_id: this.lastID });
      }
    );
  });
});

// EXISTING: Manage Services
router.get('/services', (req, res) => {
  db.all(`SELECT * FROM services ORDER BY name`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

router.post('/services', (req, res) => {
  const { name, description, fee, processing_days, required_documents } = req.body;
  db.run(
    `INSERT INTO services (name, description, fee, processing_days, required_documents, is_active, created_at) VALUES (?,?,?,?,?,1,datetime('now'))`,
    [name, description, fee, processing_days, required_documents],
    function(err) {
      if (err) return res.status(500).json({ error: 'Failed to create service' });
      res.json({ success: true, service_id: this.lastID });
    }
  );
});

router.patch('/services/:id', (req, res) => {
  const { name, description, fee, processing_days, required_documents, is_active } = req.body;
  db.run(
    `UPDATE services SET name=?, description=?, fee=?, processing_days=?, required_documents=?, is_active=? WHERE id=?`,
    [name, description, fee, processing_days, required_documents, is_active, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: 'Failed to update service' });
      res.json({ success: true });
    }
  );
});

// ─────────────────────────────────────────────
// FEATURE 7: Village Demographics Dashboard
// ─────────────────────────────────────────────
router.get('/demographics', (req, res) => {
  // Return latest snapshot or compute live data
  db.get(`SELECT * FROM village_demographics_snapshots ORDER BY created_at DESC LIMIT 1`, [], (err, snapshot) => {
    if (snapshot && !err) return res.json(JSON.parse(snapshot.data));

    // Compute live demographics from user data
    db.get(
      `SELECT 
        COUNT(*) AS total_citizens,
        COUNT(CASE WHEN gender = 'male' THEN 1 END) AS male,
        COUNT(CASE WHEN gender = 'female' THEN 1 END) AS female,
        COUNT(CASE WHEN gender = 'other' THEN 1 END) AS other_gender,
        AVG(CAST((julianday('now') - julianday(dob)) / 365.25 AS INTEGER)) AS avg_age,
        COUNT(CASE WHEN CAST((julianday('now') - julianday(dob)) / 365.25 AS INTEGER) < 18 THEN 1 END) AS age_0_17,
        COUNT(CASE WHEN CAST((julianday('now') - julianday(dob)) / 365.25 AS INTEGER) BETWEEN 18 AND 35 THEN 1 END) AS age_18_35,
        COUNT(CASE WHEN CAST((julianday('now') - julianday(dob)) / 365.25 AS INTEGER) BETWEEN 36 AND 60 THEN 1 END) AS age_36_60,
        COUNT(CASE WHEN CAST((julianday('now') - julianday(dob)) / 365.25 AS INTEGER) > 60 THEN 1 END) AS age_60_plus,
        COUNT(CASE WHEN strftime('%Y', created_at) = strftime('%Y', 'now') THEN 1 END) AS new_registrations_this_year
       FROM users WHERE role = 'citizen'`,
      [],
      (err2, demog) => {
        db.get(
          `SELECT 
            COUNT(*) AS total_applications,
            COUNT(DISTINCT citizen_id) AS citizens_with_applications,
            COUNT(CASE WHEN status = 'approved' THEN 1 END) AS approved_applications,
            COUNT(DISTINCT service_id) AS services_used
           FROM applications`,
          [],
          (err3, appStats) => {
            const data = { demographics: demog || {}, application_stats: appStats || {}, generated_at: new Date().toISOString() };
            res.json(data);
          }
        );
      }
    );
  });
});

// POST: Take a demographics snapshot
router.post('/demographics/snapshot', (req, res) => {
  db.get(
    `SELECT COUNT(*) AS total_citizens,
            COUNT(CASE WHEN gender = 'male' THEN 1 END) AS male,
            COUNT(CASE WHEN gender = 'female' THEN 1 END) AS female
     FROM users WHERE role = 'citizen'`,
    [],
    (err, data) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      db.run(
        `INSERT INTO village_demographics_snapshots (data, created_at) VALUES (?,datetime('now'))`,
        [JSON.stringify({ demographics: data, generated_at: new Date().toISOString() })],
        function(err2) {
          if (err2) return res.status(500).json({ error: 'Failed to save snapshot' });
          res.json({ success: true, snapshot_id: this.lastID });
        }
      );
    }
  );
});

// ─────────────────────────────────────────────
// FEATURE 8: Service Usage Insights
// ─────────────────────────────────────────────
router.get('/insights/services', (req, res) => {
  db.all(
    `SELECT s.name AS service_name, s.id AS service_id,
            COUNT(a.id) AS total_requests,
            COUNT(CASE WHEN a.status = 'approved' THEN 1 END) AS approved,
            COUNT(CASE WHEN a.status = 'rejected' THEN 1 END) AS rejected,
            COUNT(CASE WHEN a.status = 'pending' THEN 1 END) AS pending,
            AVG(CASE WHEN a.status = 'approved' THEN julianday(a.updated_at) - julianday(a.created_at) END) AS avg_processing_days
     FROM services s
     LEFT JOIN applications a ON a.service_id = s.id
     GROUP BY s.id, s.name
     ORDER BY total_requests DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(rows);
    }
  );
});

router.get('/insights/usage-trends', (req, res) => {
  // Monthly application trends for last 12 months
  db.all(
    `SELECT strftime('%Y-%m', created_at) AS month,
            COUNT(*) AS total,
            COUNT(CASE WHEN status = 'approved' THEN 1 END) AS approved,
            COUNT(CASE WHEN status = 'rejected' THEN 1 END) AS rejected,
            COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending
     FROM applications
     WHERE created_at >= date('now', '-12 months')
     GROUP BY strftime('%Y-%m', created_at)
     ORDER BY month ASC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(rows);
    }
  );
});

// ─────────────────────────────────────────────
// FEATURE 10: Staff Workload Distribution
// ─────────────────────────────────────────────
router.get('/workload/all', (req, res) => {
  db.all(
    `SELECT u.id, u.name, u.email,
            COALESCE(sw.pending_count, 0) AS pending_count,
            COALESCE(sw.approved_count, 0) AS approved_count,
            (SELECT COUNT(*) FROM staff_assignments sa WHERE sa.staff_id = u.id) AS assigned_count,
            (SELECT COUNT(*) FROM applications a WHERE a.reviewed_by = u.id AND a.status = 'approved') AS total_approved,
            (SELECT COUNT(*) FROM applications a WHERE a.reviewed_by = u.id AND a.status = 'rejected') AS total_rejected,
            (SELECT AVG(julianday(a.updated_at) - julianday(a.created_at))
             FROM applications a WHERE a.reviewed_by = u.id AND a.status IN ('approved','rejected')) AS avg_processing_days
     FROM users u
     LEFT JOIN staff_workload sw ON sw.staff_id = u.id
     WHERE u.role = 'staff' AND u.is_active = 1
     ORDER BY COALESCE(sw.pending_count, 0) DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(rows);
    }
  );
});

// POST: Auto-rebalance workload among staff
router.post('/rebalance', (req, res) => {
  // Get all unassigned pending applications
  db.all(
    `SELECT a.id FROM applications a
     LEFT JOIN staff_assignments sa ON sa.application_id = a.id
     WHERE a.status = 'pending' AND sa.application_id IS NULL
     ORDER BY a.created_at ASC`,
    [],
    (err, apps) => {
      if (err) return res.status(500).json({ error: 'Database error' });

      // Get all active staff
      db.all(
        `SELECT u.id FROM users u WHERE u.role = 'staff' AND u.is_active = 1`,
        [],
        (err2, staffList) => {
          if (err2 || staffList.length === 0) return res.status(400).json({ error: 'No active staff available' });

          let assigned = 0;
          apps.forEach((app, idx) => {
            const staffId = staffList[idx % staffList.length].id;
            db.run(
              `INSERT OR IGNORE INTO staff_assignments (staff_id, application_id, assigned_at) VALUES (?,?,datetime('now'))`,
              [staffId, app.id],
              () => {
                db.run(`UPDATE staff_workload SET pending_count = pending_count + 1, updated_at = datetime('now') WHERE staff_id = ?`, [staffId]);
                assigned++;
              }
            );
          });

          res.json({ success: true, applications_assigned: apps.length, staff_count: staffList.length });
        }
      );
    }
  );
});

module.exports = router;
