const fs = require('fs');
const path = require('path');
const SQLiteDatabase = require('./database/sqlite-wrapper');

// Database file path
const dbPath = path.join(__dirname, 'database', 'gram_panchayat.db');
const schemaPath = path.join(__dirname, 'database', 'schema-sqlite.sql');

console.log('Reinitializing database...');

// Delete existing database
if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log('✓ Old database deleted');
}

// Create new database
const db = new SQLiteDatabase(dbPath);

// Read schema file
const schema = fs.readFileSync(schemaPath, 'utf8');

// Split into individual statements
const statements = schema.split(';').filter(stmt => stmt.trim());

console.log(`Executing ${statements.length} SQL statements...`);

let executed = 0;

const executeNext = () => {
    if (executed >= statements.length) {
        console.log('✓ Database reinitialized successfully!');
        console.log('\nDefault credentials created:');
        console.log('Admin:   admin@example.com   / admin123');
        console.log('Staff:   staff@example.com   / staff123');
        console.log('Citizen: citizen@example.com / citizen123');
        db.close(() => {
            process.exit(0);
        });
        return;
    }

    const sql = statements[executed].trim();
    if (sql) {
        db.db.run(sql, (err) => {
            if (err && !err.message.includes('already exists')) {
                console.error(`Error executing statement ${executed + 1}:`, err.message);
            }
            executed++;
            executeNext();
        });
    } else {
        executed++;
        executeNext();
    }
};

executeNext();
