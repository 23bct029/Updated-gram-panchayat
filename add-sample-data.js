#!/usr/bin/env node
/**
 * Add Sample Test Data to Database
 * This script adds realistic test applications for dashboard testing
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'gram_panchayat.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Database connection failed:', err);
        process.exit(1);
    }
    console.log('✓ Connected to database');
});

// Sample data - use user_id 16 which is the Demo Citizen that exists in DB
const sampleApplications = [
    // Today
    { user_id: 16, service_id: 1, status: 'Pending', created_at: new Date().toISOString(), remarks: 'Waiting for verification' },
    { user_id: 16, service_id: 2, status: 'Pending', created_at: new Date().toISOString(), remarks: 'Document check pending' },
    { user_id: 16, service_id: 3, status: 'Verification', created_at: new Date().toISOString(), remarks: 'Under staff review' },
    
    // Yesterday
    { user_id: 16, service_id: 1, status: 'Verified', created_at: new Date(Date.now() - 86400000).toISOString(), remarks: 'Verified and approved' },
    { user_id: 16, service_id: 2, status: 'Pending', created_at: new Date(Date.now() - 86400000).toISOString(), remarks: 'Initial submission' },
    { user_id: 16, service_id: 3, status: 'Verification', created_at: new Date(Date.now() - 86400000).toISOString(), remarks: 'Document verification in progress' },
    
    // 2 Days Ago
    { user_id: 16, service_id: 1, status: 'Approved', created_at: new Date(Date.now() - 172800000).toISOString(), remarks: 'Certificate generated' },
    { user_id: 16, service_id: 2, status: 'Verified', created_at: new Date(Date.now() - 172800000).toISOString(), remarks: 'Ready for approval' },
    { user_id: 16, service_id: 3, status: 'Pending', created_at: new Date(Date.now() - 172800000).toISOString(), remarks: 'New application' },
    
    // 3 Days Ago
    { user_id: 16, service_id: 1, status: 'Pending', created_at: new Date(Date.now() - 259200000).toISOString(), remarks: 'Awaiting verification' },
    { user_id: 16, service_id: 2, status: 'Verification', created_at: new Date(Date.now() - 259200000).toISOString(), remarks: 'Under review' },
    { user_id: 16, service_id: 3, status: 'Verified', created_at: new Date(Date.now() - 259200000).toISOString(), remarks: 'Verified' },
    
    // 4 Days Ago
    { user_id: 16, service_id: 1, status: 'Approved', created_at: new Date(Date.now() - 345600000).toISOString(), remarks: 'Approved' },
    { user_id: 16, service_id: 2, status: 'Pending', created_at: new Date(Date.now() - 345600000).toISOString(), remarks: 'New application' },
    { user_id: 16, service_id: 3, status: 'Verification', created_at: new Date(Date.now() - 345600000).toISOString(), remarks: 'Verification pending' },
    
    // 5 Days Ago
    { user_id: 16, service_id: 1, status: 'Pending', created_at: new Date(Date.now() - 432000000).toISOString(), remarks: 'Waiting for staff' },
    { user_id: 16, service_id: 2, status: 'Verified', created_at: new Date(Date.now() - 432000000).toISOString(), remarks: 'Document verified' },
    { user_id: 16, service_id: 3, status: 'Approved', created_at: new Date(Date.now() - 432000000).toISOString(), remarks: 'Final approval' },
    
    // 6 Days Ago
    { user_id: 16, service_id: 1, status: 'Verification', created_at: new Date(Date.now() - 518400000).toISOString(), remarks: 'Under review' },
    { user_id: 16, service_id: 2, status: 'Pending', created_at: new Date(Date.now() - 518400000).toISOString(), remarks: 'Application received' },
    { user_id: 16, service_id: 3, status: 'Verified', created_at: new Date(Date.now() - 518400000).toISOString(), remarks: 'All documents verified' },
    
    // 7 Days Ago
    { user_id: 16, service_id: 1, status: 'Approved', created_at: new Date(Date.now() - 604800000).toISOString(), remarks: 'Certificate ready' },
    { user_id: 16, service_id: 2, status: 'Verified', created_at: new Date(Date.now() - 604800000).toISOString(), remarks: 'Approved' },
    { user_id: 16, service_id: 3, status: 'Pending', created_at: new Date(Date.now() - 604800000).toISOString(), remarks: 'New application' },
    
    // Earlier (Last month)
    { user_id: 16, service_id: 1, status: 'Approved', created_at: new Date(Date.now() - 2592000000).toISOString(), remarks: 'Old application' },
    { user_id: 16, service_id: 2, status: 'Approved', created_at: new Date(Date.now() - 2592000000).toISOString(), remarks: 'Completed' },
    { user_id: 16, service_id: 3, status: 'Approved', created_at: new Date(Date.now() - 2592000000).toISOString(), remarks: 'Finished' }
];

function addSampleData() {
    // First, delete existing test applications for user_id 16
    db.run(`DELETE FROM applications WHERE user_id = 16`, (err) => {
        if (err) console.error('Error deleting old data:', err);
        
        // Then add new sample data
        let added = 0;
        sampleApplications.forEach((app) => {
            const query = `
                INSERT INTO applications (user_id, service_id, status, created_at, remarks)
                VALUES (?, ?, ?, ?, ?)
            `;
            
            db.run(query, [app.user_id, app.service_id, app.status, app.created_at, app.remarks], 
                (err) => {
                    if (err) {
                        console.error(`Error adding application:`, err);
                    } else {
                        added++;
                        console.log(`✓ Added application ${added}/${sampleApplications.length}`);
                    }
                    
                    if (added === sampleApplications.length) {
                        // All done, verify and close
                        verifyData();
                    }
                }
            );
        });
    });
}

function verifyData() {
    // Show statistics
    db.all(`
        SELECT status, COUNT(*) as count 
        FROM applications 
        WHERE user_id = 16 
        GROUP BY status
    `, (err, rows) => {
        if (err) {
            console.error('Error verifying data:', err);
            return;
        }
        
        console.log('\n✓ Sample Data Added Successfully!');
        console.log('\nApplication Statistics:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        let total = 0;
        rows.forEach(row => {
            console.log(`  ${row.status.padEnd(15)}: ${row.count} applications`);
            total += row.count;
        });
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`  Total: ${total} applications`);
        console.log('\n✓ Dashboard will now show realistic data!');
        console.log('✓ Staff can see applications organized by:');
        console.log('  - Time periods (Today, Yesterday, 7 days, etc)');
        console.log('  - Status (Pending, Verification, Verified, Approved)');
        console.log('  - Interactive charts with trends\n');
        
        db.close();
        process.exit(0);
    });
}

// Run the script
addSampleData();
