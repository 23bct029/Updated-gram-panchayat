const jwt = require('jsonwebtoken');

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1] || req.session.token;

    if (!token) {
        return res.status(403).json({
            success: false,
            message: 'No token provided'
        });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized! Invalid token'
            });
        }
        req.userId = decoded.id;
        req.userType = decoded.type;
        next();
    });
};

// Middleware to check if user is citizen
const isCitizen = (req, res, next) => {
    if (req.userType !== 'citizen') {
        return res.status(403).json({
            success: false,
            message: 'Access denied. Citizen privileges required.'
        });
    }
    next();
};

// Middleware to check if user is staff
const isStaff = (req, res, next) => {
    if (req.userType !== 'staff') {
        return res.status(403).json({
            success: false,
            message: 'Access denied. Staff privileges required.'
        });
    }
    next();
};

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
    if (req.userType !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Access denied. Admin privileges required.'
        });
    }
    next();
};

module.exports = {
    verifyToken,
    isCitizen,
    isStaff,
    isAdmin
};
