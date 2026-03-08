const express = require('express');
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
