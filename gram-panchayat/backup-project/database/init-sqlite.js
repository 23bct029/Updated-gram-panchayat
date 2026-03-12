const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'gram_panchayat.db');

// Create database connection
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
    }
    console.log('✓ SQLite database initialized');
    db.run('PRAGMA foreign_keys = ON');
});

// Read and execute schema
const schemaPath = path.join(__dirname, 'schema-sqlite.sql');
if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    const statements = schema.split(';').filter(stmt => stmt.trim());
    
    let completed = 0;
    statements.forEach((statement, index) => {
        db.run(statement, (err) => {
            if (err && !err.message.includes('already exists')) {
                console.error('Error executing statement:', err);
            }
            completed++;
            if (completed === statements.length) {
                console.log('✓ Database schema initialized');
                db.close();
            }
        });
    });
} else {
    console.log('Schema file not found');
    db.close();
}

module.exports = db;
