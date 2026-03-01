const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class SQLiteDatabase {
    constructor(dbPath) {
        this.db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Database connection error:', err);
            }
        });
        this.db.run('PRAGMA foreign_keys = ON');
    }

    // Compatible with mysql2 callback style
    query(sql, params, callback) {
        // Handle optional params
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }

        this.db.all(sql, params, (err, rows) => {
            if (callback) {
                if (err) {
                    callback(err, null);
                } else {
                    callback(null, rows || []);
                }
            }
        });
    }

    // For getting single row
    getOne(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }

        this.db.get(sql, params, (err, row) => {
            if (callback) {
                if (err) {
                    callback(err, null);
                } else {
                    callback(null, row || null);
                }
            }
        });
    }

    // For INSERT/UPDATE/DELETE
    run(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }

        this.db.run(sql, params, function(err) {
            if (callback) {
                if (err) {
                    callback(err, null);
                } else {
                    callback(null, { 
                        insertId: this.lastID, 
                        affectedRows: this.changes 
                    });
                }
            }
        });
    }

    // Close database
    close(callback) {
        this.db.close(callback);
    }
}

module.exports = SQLiteDatabase;
