#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'gram_panchayat.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    }
    console.log('Connected to SQLite database');
});

// Services data
const services = [
    { service_id: 1, name: 'Birth Certificate' },
    { service_id: 2, name: 'Death Certificate' },
    { service_id: 3, name: 'Income Certificate' },
    { service_id: 4, name: 'Caste Certificate' },
    { service_id: 5, name: 'Residence Certificate' },
    { service_id: 6, name: 'Property Registration' }
];

// Generate comprehensive sample applications
function generateSampleApplications() {
    const applications = [];
    const userId = 16; // Demo Citizen
    const baseDate = new Date(2026, 1, 28); // Feb 28, 2026
    let appId = 100;

    // Today - 3 applications (Pending)
    for (let i = 0; i < 3; i++) {
        applications.push({
            application_id: appId++,
            user_id: userId,
            service_id: (i % 6) + 1,
            status: 'Pending',
            created_at: new Date(baseDate.getTime() - (0 * 24 * 60 * 60 * 1000)),
            remarks: `Application submitted today - ${services[i % 6].name} service`
        });
    }

    // Yesterday - 2 applications (Pending, 1 Verification)
    applications.push({
        application_id: appId++,
        user_id: userId,
        service_id: 2,
        status: 'Pending',
        created_at: new Date(baseDate.getTime() - (1 * 24 * 60 * 60 * 1000)),
        remarks: 'Death Certificate - Pending review'
    });
    
    applications.push({
        application_id: appId++,
        user_id: userId,
        service_id: 3,
        status: 'Verification',
        created_at: new Date(baseDate.getTime() - (1 * 24 * 60 * 60 * 1000)),
        remarks: 'Income Certificate - Awaiting document verification'
    });

    // 2 days ago - 2 Verification
    for (let i = 0; i < 2; i++) {
        applications.push({
            application_id: appId++,
            user_id: userId,
            service_id: (i % 6) + 1,
            status: 'Verification',
            created_at: new Date(baseDate.getTime() - (2 * 24 * 60 * 60 * 1000)),
            remarks: `Document verification in progress`
        });
    }

    // 3 days ago - 2 applications (Verified)
    for (let i = 0; i < 2; i++) {
        applications.push({
            application_id: appId++,
            user_id: userId,
            service_id: (i % 6) + 1,
            status: 'Verified',
            created_at: new Date(baseDate.getTime() - (3 * 24 * 60 * 60 * 1000)),
            remarks: 'Documents verified and approved for processing'
        });
    }

    // 4 days ago - 2 applications (Verified)
    for (let i = 0; i < 2; i++) {
        applications.push({
            application_id: appId++,
            user_id: userId,
            service_id: (i % 6) + 1,
            status: 'Verified',
            created_at: new Date(baseDate.getTime() - (4 * 24 * 60 * 60 * 1000)),
            remarks: 'Verified documents - ready for approval'
        });
    }

    // 5 days ago - 3 applications (Approved)
    for (let i = 0; i < 3; i++) {
        applications.push({
            application_id: appId++,
            user_id: userId,
            service_id: (i % 6) + 1,
            status: 'Approved',
            created_at: new Date(baseDate.getTime() - (5 * 24 * 60 * 60 * 1000)),
            remarks: 'Application approved and processed'
        });
    }

    // 7 days ago - 2 applications (Approved)
    for (let i = 0; i < 2; i++) {
        applications.push({
            application_id: appId++,
            user_id: userId,
            service_id: (i % 6) + 1,
            status: 'Approved',
            created_at: new Date(baseDate.getTime() - (7 * 24 * 60 * 60 * 1000)),
            remarks: 'Approved and certificate generated'
        });
    }

    // 10 days ago - 2 applications (Approved)
    for (let i = 0; i < 2; i++) {
        applications.push({
            application_id: appId++,
            user_id: userId,
            service_id: (i % 6) + 1,
            status: 'Approved',
            created_at: new Date(baseDate.getTime() - (10 * 24 * 60 * 60 * 1000)),
            remarks: 'Certificate issued and delivered'
        });
    }

    // 15 days ago - 2 applications (Approved)
    for (let i = 0; i < 2; i++) {
        applications.push({
            application_id: appId++,
            user_id: userId,
            service_id: (i % 6) + 1,
            status: 'Approved',
            created_at: new Date(baseDate.getTime() - (15 * 24 * 60 * 60 * 1000)),
            remarks: 'Certificate issued'
        });
    }

    return applications;
}

// Add sample data
function addComprehensiveData() {
    return new Promise((resolve, reject) => {
        // First, delete existing sample applications (keeping original 2)
        db.run(`
            DELETE FROM applications 
            WHERE user_id = 16 AND application_id >= 100
        `, (err) => {
            if (err) {
                console.error('Error clearing old applications:', err.message);
                return reject(err);
            }

            const sampleApps = generateSampleApplications();
            let count = 0;

            const insertNext = () => {
                if (count >= sampleApps.length) {
                    console.log(`\n✓ Successfully added ${sampleApps.length} comprehensive sample applications`);
                    verifyAndDisplayStats();
                    return;
                }

                const app = sampleApps[count];
                const query = `
                    INSERT INTO applications (application_id, user_id, service_id, status, created_at, remarks)
                    VALUES (?, ?, ?, ?, ?, ?)
                `;

                db.run(
                    query,
                    [
                        app.application_id,
                        app.user_id,
                        app.service_id,
                        app.status,
                        app.created_at.toISOString(),
                        app.remarks
                    ],
                    (err) => {
                        if (err) {
                            console.error(`Error adding application ${app.application_id}:`, err.message);
                        } else {
                            process.stdout.write(`\r✓ Added application ${count + 1}/${sampleApps.length}`);
                        }
                        count++;
                        insertNext();
                    }
                );
            };

            insertNext();
        });
    });
}

// Verify and display statistics
function verifyAndDisplayStats() {
    const query = `
        SELECT 
            a.status,
            COUNT(*) as count,
            COUNT(DISTINCT DATE(a.created_at)) as days
        FROM applications a
        WHERE a.user_id = 16
        GROUP BY a.status
        ORDER BY a.created_at DESC
    `;

    db.all(query, (err, results) => {
        if (err) {
            console.error('Error getting statistics:', err.message);
            process.exit(1);
        }

        console.log('\n\n📊 Application Statistics:');
        console.log('═' .repeat(50));
        let total = 0;
        results.forEach(row => {
            console.log(`  ${row.status.padEnd(15)}: ${row.count} applications across ${row.days} days`);
            total += row.count;
        });
        console.log('═' .repeat(50));
        console.log(`  Total: ${total} applications`);

        // Show sample of data
        const sampleQuery = `
            SELECT a.application_id, a.status, a.created_at, s.service_name
            FROM applications a
            JOIN services s ON a.service_id = s.service_id
            WHERE a.user_id = 16
            ORDER BY a.created_at DESC
            LIMIT 5
        `;

        db.all(sampleQuery, (err, samples) => {
            if (err) {
                console.log('Error fetching samples');
            } else {
                console.log('\n📋 Sample Applications (Most Recent):');
                samples.forEach(sample => {
                    const date = new Date(sample.created_at).toLocaleDateString('en-IN');
                    console.log(`  #${sample.application_id} | ${sample.service_name.padEnd(20)} | ${sample.status.padEnd(12)} | ${date}`);
                });
            }

            console.log('\n✨ Dashboard is ready with full sample data!');
            db.close();
            process.exit(0);
        });
    });
}

// Run the process
addComprehensiveData().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
