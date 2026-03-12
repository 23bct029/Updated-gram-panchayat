/**
 * Migration: Add new tables and columns for 10 new features
 * Run this ONCE: node database/migrate-new-features.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'gram_panchayat.db');
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  console.log('🚀 Running migration for new features...\n');

  // ── Feature 1: Application Corrections ─────────────
  db.run(`CREATE TABLE IF NOT EXISTS application_corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(application_id),
    requested_by INTEGER REFERENCES staff(staff_id),
    correction_reason TEXT NOT NULL,
    required_documents TEXT,
    correction_notes TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT (datetime('now')),
    resubmitted_at DATETIME,
    resolved_at DATETIME
  )`, err => logResult('application_corrections', err));

  // ── Feature 2: Add expiry + parent cert columns to certificates ────
  db.run(`ALTER TABLE certificates ADD COLUMN expiry_date DATE`, () => {});
  db.run(`ALTER TABLE certificates ADD COLUMN status TEXT DEFAULT 'active'`, () => {});
  // Add parent_certificate_id to applications for renewal tracking
  db.run(`ALTER TABLE applications ADD COLUMN parent_certificate_id INTEGER`, () => {});
  db.run(`ALTER TABLE applications ADD COLUMN updated_at DATETIME`, () => {});
  console.log('✅ Added expiry/renewal columns to certificates and applications');

  // ── Feature 3 & 4: Certificate hash/QR ─────────────
  db.run(`ALTER TABLE certificates ADD COLUMN verification_hash TEXT UNIQUE`, () => {});
  db.run(`CREATE TABLE IF NOT EXISTS certificate_verification_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    certificate_id INTEGER NOT NULL REFERENCES certificates(certificate_id),
    verified_by INTEGER REFERENCES users(user_id),
    verification_method TEXT DEFAULT 'public',
    ip_address TEXT,
    created_at DATETIME DEFAULT (datetime('now'))
  )`, err => logResult('certificate_verification_logs', err));

  // ── Feature 5: Multi-Application Requests ──────────
  db.run(`CREATE TABLE IF NOT EXISTS multi_application_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    citizen_id INTEGER NOT NULL REFERENCES users(user_id),
    purpose TEXT NOT NULL,
    total_services INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT (datetime('now'))
  )`, err => logResult('multi_application_requests', err));
  // Add multi_request_id to applications
  db.run(`ALTER TABLE applications ADD COLUMN multi_request_id INTEGER REFERENCES multi_application_requests(id)`, () => {});
  console.log('✅ Added multi_request_id column to applications');

  // ── Feature 6: Citizen Timeline Events ─────────────
  db.run(`CREATE TABLE IF NOT EXISTS citizen_timeline_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    citizen_id INTEGER NOT NULL REFERENCES users(user_id),
    event_type TEXT NOT NULL,
    event_title TEXT NOT NULL,
    event_description TEXT,
    reference_id INTEGER,
    created_at DATETIME DEFAULT (datetime('now'))
  )`, err => logResult('citizen_timeline_events', err));

  // ── Feature 7: Demographics Snapshots ──────────────
  db.run(`CREATE TABLE IF NOT EXISTS village_demographics_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT NOT NULL,                -- JSON blob
    created_at DATETIME DEFAULT (datetime('now'))
  )`, err => logResult('village_demographics_snapshots', err));
  // Add demographic columns to users (if not present)
  db.run(`ALTER TABLE users ADD COLUMN gender TEXT`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN dob DATE`, () => {});

  // ── Feature 8: Service Usage Stats ─────────────────
  db.run(`CREATE TABLE IF NOT EXISTS service_usage_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id INTEGER REFERENCES services(service_id),
    stat_date DATE DEFAULT (date('now')),
    request_count INTEGER DEFAULT 0,
    approved_count INTEGER DEFAULT 0
  )`, err => logResult('service_usage_stats', err));

  // ── Feature 9 & 10: Staff Workload & Assignments ───
  db.run(`CREATE TABLE IF NOT EXISTS staff_workload (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER UNIQUE REFERENCES staff(staff_id),
    pending_count INTEGER DEFAULT 0,
    approved_count INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT (datetime('now'))
  )`, err => logResult('staff_workload', err));

  db.run(`CREATE TABLE IF NOT EXISTS staff_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER REFERENCES staff(staff_id),
    application_id INTEGER UNIQUE REFERENCES applications(application_id),
    assigned_at DATETIME DEFAULT (datetime('now')),
    UNIQUE(application_id)
  )`, err => logResult('staff_assignments', err));

  // ── Seed staff_workload for existing staff ──────────
  db.run(`INSERT OR IGNORE INTO staff_workload (staff_id, pending_count, approved_count)
          SELECT staff_id, 0, 0 FROM staff`,
    err => {
      if (!err) console.log('✅ Seeded staff_workload for existing staff');
    }
  );

  // ── Seed verification hashes for existing certificates ──
  db.all(`SELECT id, application_id, issued_at FROM certificates WHERE verification_hash IS NULL`, [], (err, certs) => {
    if (certs && certs.length > 0) {
      const crypto = require('crypto');
      certs.forEach(c => {
        const hash = crypto.createHash('sha256').update(`${c.id}-${c.application_id}-${c.issued_at}-seed`).digest('hex');
        db.run(`UPDATE certificates SET verification_hash = ? WHERE id = ?`, [hash, c.id]);
      });
      console.log(`✅ Generated hashes for ${certs.length} existing certificates`);
    }
  });

  setTimeout(() => {
    console.log('\n✅ Migration complete! All new feature tables created.\n');
    console.log('📋 Summary of new tables:');
    console.log('   - application_corrections (Feature 1)');
    console.log('   - certificate_verification_logs (Feature 3 & 4)');
    console.log('   - multi_application_requests (Feature 5)');
    console.log('   - citizen_timeline_events (Feature 6)');
    console.log('   - village_demographics_snapshots (Feature 7)');
    console.log('   - service_usage_stats (Feature 8)');
    console.log('   - staff_workload (Feature 9 & 10)');
    console.log('   - staff_assignments (Feature 9 & 10)');
    console.log('\n📋 New columns added:');
    console.log('   - certificates: expiry_date, status, verification_hash');
    console.log('   - applications: parent_certificate_id, multi_request_id, updated_at');
    console.log('   - users: gender, dob');
    db.close();
  }, 1000);
});

function logResult(table, err) {
  if (err && !err.message.includes('already exists')) {
    console.error(`❌ Error creating ${table}:`, err.message);
  } else {
    console.log(`✅ Table ready: ${table}`);
  }
}