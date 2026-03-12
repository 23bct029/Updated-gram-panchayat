const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Citizen Registration
router.post('/register', async (req, res) => {
    const db = req.app.locals.db;
    const {
        full_name, email, phone, password, aadhar_number,
        address, village, block, district, state, pincode,
        date_of_birth, gender
    } = req.body;

    try {
        // Check if user already exists
        db.query('SELECT * FROM users WHERE email = ? OR aadhar_number = ?', 
            [email, aadhar_number], 
            async (err, results) => {
                if (err) {
                    return res.status(500).json({
                        success: false,
                        message: 'Database error',
                        error: err.message
                    });
                }

                if (results.length > 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'User with this email or Aadhar number already exists'
                    });
                }

                // Hash password
                const password_hash = await bcrypt.hash(password, 10);

                // Insert new user
                const insertQuery = `INSERT INTO users 
                    (full_name, email, phone, password_hash, aadhar_number, address, 
                    village, block, district, state, pincode, date_of_birth, gender) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

                db.run(insertQuery, 
                    [full_name, email, phone, password_hash, aadhar_number, address,
                     village, block, district, state || 'Rajasthan', pincode, date_of_birth, gender],
                    (err, result) => {
                        if (err) {
                            return res.status(500).json({
                                success: false,
                                message: 'Error creating user',
                                error: err.message
                            });
                        }

                        res.status(201).json({
                            success: true,
                            message: 'Registration successful! Please login to continue.',
                            userId: result.insertId
                        });
                    }
                );
            }
        );
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
});

// Citizen Login
router.post('/login', (req, res) => {
    const db = req.app.locals.db;
    const { email, password, userType } = req.body;

    if (!email || !password || !userType) {
        return res.status(400).json({
            success: false,
            message: 'Please provide email, password, and user type'
        });
    }

    let query, table;
    
    // Determine which table to query based on user type
    if (userType === 'citizen') {
        query = 'SELECT user_id as id, full_name, email, password_hash, is_active FROM users WHERE email = ?';
    } else if (userType === 'staff') {
        query = 'SELECT staff_id as id, full_name, email, password_hash, is_active, role FROM staff WHERE email = ?';
    } else if (userType === 'admin') {
        query = 'SELECT admin_id as id, full_name, email, password_hash, is_active, role FROM admin WHERE email = ?';
    } else {
        return res.status(400).json({
            success: false,
            message: 'Invalid user type'
        });
    }

    db.query(query, [email], async (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Database error',
                error: err.message
            });
        }

        if (results.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        const user = results[0];

        // Check if account is active
        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message: 'Your account has been deactivated. Please contact administrator.'
            });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { 
                id: user.id, 
                email: user.email,
                type: userType,
                name: user.full_name
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Store token in session
        req.session.token = token;
        req.session.userType = userType;
        req.session.userId = user.id;

        // Log the login
        const logQuery = 'INSERT INTO system_logs (user_id, user_type, action, ip_address) VALUES (?, ?, ?, ?)';
        db.run(logQuery, [user.id, userType.charAt(0).toUpperCase() + userType.slice(1), 'Login', req.ip]);

        res.json({
            success: true,
            message: 'Login successful',
            token: token,
            userType: userType,
            user: {
                id: user.id,
                name: user.full_name,
                email: user.email,
                role: user.role || null
            }
        });
    });
});

// Logout
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error logging out'
            });
        }
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    });
});

// Check authentication status
router.get('/check', (req, res) => {
    if (req.session.token) {
        jwt.verify(req.session.token, process.env.JWT_SECRET, (err, decoded) => {
            if (err) {
                return res.json({ authenticated: false });
            }
            res.json({
                authenticated: true,
                userType: req.session.userType,
                userId: req.session.userId
            });
        });
    } else {
        res.json({ authenticated: false });
    }
});

module.exports = router;
