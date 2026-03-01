const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'gram_panchayat.db');
const password = 'password'; // Default password for all accounts

// Generate bcrypt hash
bcrypt.hash(password, 10, (err, hash) => {
    if (err) {
        console.error('Error generating hash:', err);
        process.exit(1);
    }

    console.log('Generated hash:', hash);

    const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('Database error:', err);
            process.exit(1);
        }

        // Update all passwords
        const queries = [
            {
                sql: `UPDATE admin SET password_hash = ? WHERE username = 'admin'`,
                params: [hash],
                desc: 'Admin'
            },
            {
                sql: `UPDATE users SET password_hash = ? WHERE email = 'citizen@example.com'`,
                params: [hash],
                desc: 'Citizen'
            },
            {
                sql: `UPDATE staff SET password_hash = ? WHERE email = 'staff@panchayat.gov'`,
                params: [hash],
                desc: 'Staff'
            }
        ];

        let completed = 0;

        queries.forEach(q => {
            db.run(q.sql, q.params, function(err) {
                completed++;
                if (err) {
                    console.error(`Error updating ${q.desc}:`, err);
                } else {
                    console.log(`✓ ${q.desc} password updated`);
                }

                if (completed === queries.length) {
                    console.log('\n===========================================');
                    console.log('All passwords reset successfully!');
                    console.log('===========================================');
                    console.log('\nTest Credentials:');
                    console.log('Admin    - admin@panchayat.gov / password');
                    console.log('Citizen  - citizen@example.com / password');
                    console.log('Staff    - staff@panchayat.gov / password');
                    console.log('===========================================\n');
                    db.close();
                }
            });
        });
    });
});
