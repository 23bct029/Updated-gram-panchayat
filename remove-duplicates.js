const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'gram_panchayat.db');
const db = new sqlite3.Database(dbPath);

// Get all unique schemes
db.all(`
    SELECT DISTINCT scheme_id, scheme_name FROM schemes
`, [], (err, uniqueSchemes) => {
    if (err) {
        console.error('Error reading schemes:', err);
        return;
    }

    console.log(`Found ${uniqueSchemes.length} unique schemes`);
    
    // Delete all and re-insert only unique ones
    db.run('DELETE FROM schemes', (err) => {
        if (err) {
            console.error('Error deleting schemes:', err);
            return;
        }

        let inserted = 0;
        uniqueSchemes.forEach((scheme) => {
            db.run(
                `INSERT INTO schemes (scheme_id, scheme_name, description, eligibility, guidelines, official_website) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [scheme.scheme_id, scheme.scheme_name, 'Government scheme', 'Eligible citizens', 'Check official website', 'https://example.com'],
                (err) => {
                    if (!err) inserted++;
                    if (inserted === uniqueSchemes.length) {
                        console.log(`✓ Inserted ${inserted} unique schemes`);
                        
                        // Also remove duplicate services
                        db.all(`
                            SELECT DISTINCT service_id, service_name FROM services
                        `, [], (err, uniqueServices) => {
                            if (!err) {
                                db.run('DELETE FROM services', () => {
                                    let sInserted = 0;
                                    uniqueServices.forEach((svc) => {
                                        db.run(
                                            `INSERT INTO services (service_id, service_name, service_type, description) 
                                             VALUES (?, ?, ?, ?)`,
                                            [svc.service_id, svc.service_name, 'certificate', 'Government service'],
                                            () => {
                                                sInserted++;
                                                if (sInserted === uniqueServices.length) {
                                                    console.log(`✓ Inserted ${sInserted} unique services`);
                                                    db.close();
                                                    process.exit(0);
                                                }
                                            }
                                        );
                                    });
                                });
                            }
                        });
                    }
                }
            );
        });
    });
});
