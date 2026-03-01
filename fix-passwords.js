const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'gram_panchayat.db');

const passwords = {
  citizen123: 'citizen123',
  staff123: 'staff123',
  admin123: 'admin123'
};

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Database error:', err);
        process.exit(1);
    }

    let completed = 0;

    // Update citizen
    bcrypt.hash(passwords.citizen123, 10, (err, hash) => {
        if (!err) {
            db.run(`UPDATE users SET password_hash = ? WHERE email = 'citizen@example.com'`, [hash], function() {
                console.log('✓ Citizen: citizen@example.com / citizen123');
                completed++;
                if (completed === 3) { db.close(); process.exit(0); }
            });
        }
    });

    // Update staff
    bcrypt.hash(passwords.staff123, 10, (err, hash) => {
        if (!err) {
            db.run(`UPDATE staff SET password_hash = ? WHERE email = 'staff@example.com'`, [hash], function() {
                console.log('✓ Staff: staff@example.com / staff123');
                completed++;
                if (completed === 3) { db.close(); process.exit(0); }
            });
        }
    });

    // Update admin
    bcrypt.hash(passwords.admin123, 10, (err, hash) => {
        if (!err) {
            db.run(`UPDATE admin SET password_hash = ? WHERE username = 'admin'`, [hash], function() {
                console.log('✓ Admin: admin@example.com / admin123');
                completed++;
                if (completed === 3) { db.close(); process.exit(0); }
            });
        }
    });
});
