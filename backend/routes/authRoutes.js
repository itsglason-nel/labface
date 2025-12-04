const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const fs = require('fs');
const path = require('path');

// Helper to save base64 image
const saveBase64Image = (base64Data, userId, type) => {
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
        return null;
    }
    const buffer = Buffer.from(matches[2], 'base64');
    const uploadDir = 'uploads/profiles';
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
    const filename = `${type}-${userId}-${Date.now()}.jpg`;
    const filepath = path.join(uploadDir, filename);
    fs.writeFileSync(filepath, buffer);
    return `/uploads/profiles/${filename}`;
};

// Register Student
router.post('/register/student', async (req, res) => {
    const { studentId, firstName, middleName, lastName, email, password, course, yearLevel, facePhotos, profilePicture } = req.body;
    try {
        const [existing] = await pool.query('SELECT * FROM users WHERE user_id = ? OR email = ?', [studentId, email]);
        if (existing.length > 0) return res.status(400).json({ message: 'User already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);

        // Save profile picture if provided
        let profilePicPath = null;
        if (profilePicture) {
            profilePicPath = saveBase64Image(profilePicture, studentId, 'profile');
        }

        const [result] = await pool.query(
            'INSERT INTO users (user_id, first_name, middle_name, last_name, email, password_hash, role, course, year_level, profile_picture) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [studentId, firstName, middleName, lastName, email, hashedPassword, 'student', course, yearLevel, profilePicPath]
        );

        const userId = result.insertId;

        // Save face photos if provided
        if (facePhotos && typeof facePhotos === 'object') {
            for (const [angle, base64Data] of Object.entries(facePhotos)) {
                const photoPath = saveBase64Image(base64Data, studentId, `face-${angle}`);
                if (photoPath) {
                    await pool.query(
                        'INSERT INTO face_photos (user_id, photo_url, angle) VALUES (?, ?, ?)',
                        [userId, photoPath, angle]
                    );
                }
            }
        }

        // Create Welcome Notification
        await pool.query(
            'INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
            [userId, 'Welcome to LabFace', 'Your account has been successfully created. Welcome to the platform!']
        );

        res.status(201).json({ message: 'Student registered successfully' });
    } catch (err) {
        console.error("Registration Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Register Professor
router.post('/register/professor', async (req, res) => {
    const { professorId, firstName, middleName, lastName, email, password } = req.body;
    try {
        const [existing] = await pool.query('SELECT * FROM users WHERE user_id = ? OR email = ?', [professorId, email]);
        if (existing.length > 0) return res.status(400).json({ message: 'User already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.query(
            'INSERT INTO users (user_id, first_name, middle_name, last_name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [professorId, firstName, middleName, lastName, email, hashedPassword, 'professor']
        );

        // Create Welcome Notification
        await pool.query(
            'INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
            [result.insertId, 'Welcome to LabFace', 'Your professor account has been successfully created.']
        );

        res.status(201).json({ message: 'Professor registered successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    const { userId, password } = req.body;
    console.log('Login attempt:', req.body);

    if (!userId || !password) {
        return res.status(400).json({ message: 'User ID and password are required' });
    }

    try {
        const [users] = await pool.query('SELECT * FROM users WHERE user_id = ?', [userId]);
        console.log('User found:', users.length > 0 ? 'Yes' : 'No');

        if (users.length === 0) return res.status(400).json({ message: 'Invalid credentials' });

        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

        const token = jwt.sign({ id: user.id, role: user.role, userId: user.user_id }, JWT_SECRET, { expiresIn: '1d' });
        res.json({
            token,
            user: {
                id: user.id,
                userId: user.user_id,
                role: user.role,
                firstName: user.first_name,
                lastName: user.last_name,
                email: user.email,
                course: user.course,
                yearLevel: user.year_level,
                phone: user.phone,
                studentId: user.role === 'student' ? user.user_id : undefined,
                professorId: user.role === 'professor' ? user.user_id : undefined,
                profilePicture: user.profile_picture
            }
        });
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get Current User from Token
router.get('/me', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ message: 'Access token required' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [decoded.id]);

        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = users[0];
        res.json({
            id: user.id,
            userId: user.user_id,
            role: user.role,
            firstName: user.first_name,
            middleName: user.middle_name,
            lastName: user.last_name,
            email: user.email,
            course: user.course,
            yearLevel: user.year_level,
            phone: user.phone,
            studentId: user.role === 'student' ? user.user_id : undefined,
            professorId: user.role === 'professor' ? user.user_id : undefined,
            profilePicture: user.profile_picture,
            department: user.department
        });
    } catch (err) {
        if (err.name === 'JsonWebTokenError') {
            return res.status(403).json({ message: 'Invalid token' });
        }
        if (err.name === 'TokenExpiredError') {
            return res.status(403).json({ message: 'Token expired' });
        }
        console.error('Get Current User Error:', err);
        res.status(500).json({ error: err.message });
    }
});


// Check Availability
router.get('/check-availability', async (req, res) => {
    const { field, value } = req.query;
    if (!field || !value) return res.status(400).json({ message: 'Field and value required' });

    try {
        let query = '';
        if (field === 'email') {
            query = 'SELECT * FROM users WHERE email = ?';
        } else if (field === 'userId') {
            query = 'SELECT * FROM users WHERE user_id = ?';
        } else {
            return res.status(400).json({ message: 'Invalid field' });
        }

        const [existing] = await pool.query(query, [value]);
        res.json({ available: existing.length === 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const { sendOTP } = require('../utils/emailService');
const crypto = require('crypto');

// Ensure table exists
pool.query(`
    CREATE TABLE IF NOT EXISTS password_resets (
        email VARCHAR(255) NOT NULL,
        otp VARCHAR(10) NOT NULL,
        expires_at DATETIME NOT NULL,
        PRIMARY KEY (email)
    )
`).catch(err => console.error('Error creating password_resets table:', err));

// Forgot Password - Send OTP
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(404).json({ message: 'Email not found' });

        const otp = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

        await pool.query(
            'REPLACE INTO password_resets (email, otp, expires_at) VALUES (?, ?, ?)',
            [email, otp, expiresAt]
        );

        await sendOTP(email, otp);
        res.json({ message: 'OTP sent to email' });
    } catch (err) {
        console.error('Forgot Password Error:', err);
        res.status(500).json({ message: err.message });
    }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
    const { email, otp } = req.body;
    try {
        const [records] = await pool.query('SELECT * FROM password_resets WHERE email = ? AND otp = ?', [email, otp]);
        if (records.length === 0) return res.status(400).json({ message: 'Invalid OTP' });

        if (new Date() > new Date(records[0].expires_at)) {
            return res.status(400).json({ message: 'OTP expired' });
        }

        res.json({ message: 'OTP verified' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Reset Password
router.post('/reset-password', async (req, res) => {
    const { email, otp, newPassword } = req.body;
    try {
        const [records] = await pool.query('SELECT * FROM password_resets WHERE email = ? AND otp = ?', [email, otp]);
        if (records.length === 0 || new Date() > new Date(records[0].expires_at)) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password_hash = ? WHERE email = ?', [hashedPassword, email]);
        await pool.query('DELETE FROM password_resets WHERE email = ?', [email]);

        res.json({ message: 'Password reset successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Change Password (Authenticated)
router.post('/change-password', async (req, res) => {
    const { userId, currentPassword, newPassword } = req.body;
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE user_id = ?', [userId]);
        if (users.length === 0) return res.status(404).json({ message: 'User not found' });

        const user = users[0];
        const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isMatch) return res.status(400).json({ message: 'Incorrect current password' });

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [hashedPassword, userId]);

        res.json({ message: 'Password changed successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
