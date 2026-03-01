const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'gram_panchayat.db');

class Database {
    constructor() {
        this.db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Database connection failed:', err);
            } else {
                console.log('✓ SQLite Database Connected');
                this.db.run('PRAGMA foreign_keys = ON');
            }
        });
    }

    // Execute query (for SELECT)
    query(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    // Execute single row query
    queryOne(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row || null);
                }
            });
        });
    }

    // Execute mutation (INSERT, UPDATE, DELETE)
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ 
                        id: this.lastID, 
                        changes: this.changes 
                    });
                }
            });
        });
    }

    // Execute multiple statements
    exec(sql) {
        return new Promise((resolve, reject) => {
            this.db.exec(sql, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(true);
                }
            });
        });
    }

    // Close database
    close() {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
}

// Export as a wrapper compatible with mysql2
class SQLiteWrapper {
    constructor(db) {
        this.db = db;
    }

    // Compatibility layer for existing routes using query callbacks
    query(sql, params, callback) {
        this.db.db.all(sql, params, (err, rows) => {
            if (callback) {
                if (err) {
                    callback(err, null);
                } else {
                    callback(null, rows || []);
                }
            }
        });
    }

    getConnection(callback) {
        // For compatibility
        callback(null, this);
    }

    release() {
        // For compatibility
    }
}

const database = new Database();
module.exports = new SQLiteWrapper(database);
