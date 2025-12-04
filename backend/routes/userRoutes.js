const express = require('express');
const pool = require('../config/db');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = 'uploads/profiles';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure Multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Ensure columns exist
const ensureColumns = async () => {
    try {
        const [columns] = await pool.query("SHOW COLUMNS FROM users");
        const columnNames = columns.map(c => c.Field);

        if (!columnNames.includes('profile_picture')) {
            await pool.query("ALTER TABLE users ADD COLUMN profile_picture VARCHAR(255)");
            console.log("Added profile_picture column");
        }
        if (!columnNames.includes('phone')) {
            await pool.query("ALTER TABLE users ADD COLUMN phone VARCHAR(20)");
            console.log("Added phone column");
        }
        if (!columnNames.includes('department')) {
            await pool.query("ALTER TABLE users ADD COLUMN department VARCHAR(100)");
            console.log("Added department column");
        }
        if (!columnNames.includes('course')) {
            await pool.query("ALTER TABLE users ADD COLUMN course VARCHAR(100)");
            console.log("Added course column");
        }
        if (!columnNames.includes('year_level')) {
            await pool.query("ALTER TABLE users ADD COLUMN year_level VARCHAR(20)");
            console.log("Added year_level column");
        }
    } catch (err) {
        console.error("Error checking columns:", err);
    }
};
ensureColumns();

// Middleware to verify JWT (simplified for now)
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ message: 'No token provided' });
    // In real app, verify with jwt.verify
    next();
};

// Get Profile
router.get('/profile/:id', async (req, res) => {
    try {
        const [users] = await pool.query('SELECT id, user_id, first_name, middle_name, last_name, email, role, course, year_level, phone, profile_picture, department FROM users WHERE id = ?', [req.params.id]);
        if (users.length === 0) return res.status(404).json({ message: 'User not found' });

        const user = users[0];
        const role = user.role ? user.role.toLowerCase() : '';

        res.json({
            id: user.id,
            userId: user.user_id,
            firstName: user.first_name,
            middleName: user.middle_name,
            lastName: user.last_name,
            email: user.email,
            role: user.role,
            course: user.course,
            yearLevel: user.year_level,
            phone: user.phone,
            profilePicture: user.profile_picture,
            department: user.department,
            studentId: role === 'student' ? user.user_id : undefined,
            professorId: role === 'professor' ? user.user_id : undefined,
            // Fallback for display if role is missing or weird
            schoolId: user.user_id
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Profile
router.put('/profile/:id', async (req, res) => {
    const { firstName, lastName, email, phone, course, yearLevel, department } = req.body;
    console.log(`Updating profile for user ${req.params.id}:`, req.body);

    try {
        await pool.query(
            'UPDATE users SET first_name = ?, last_name = ?, email = ?, phone = ?, course = ?, year_level = ?, department = ? WHERE id = ?',
            [
                firstName || null,
                lastName || null,
                email || null,
                phone || null,
                course || null,
                yearLevel || null,
                department || null,
                req.params.id
            ]
        );
        res.json({ message: 'Profile updated successfully' });
    } catch (err) {
        console.error("Update Profile Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Upload Profile Picture
router.post('/profile/:id/upload-photo', upload.single('profilePicture'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    const profilePictureUrl = `/uploads/profiles/${req.file.filename}`;

    try {
        await pool.query('UPDATE users SET profile_picture = ? WHERE id = ?', [profilePictureUrl, req.params.id]);
        res.json({ message: 'Profile picture uploaded successfully', profilePicture: profilePictureUrl });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Face Enrollment Photos
router.get('/profile/:id/face-photos', async (req, res) => {
    try {
        // Assuming we store face photos in a separate table or column. 
        // For now, let's assume a 'face_photos' table or JSON column.
        // Based on previous context, there might be a 'face_encodings' table, but we need the actual images.
        // Let's create a table for this if it doesn't exist.

        await pool.query(`
            CREATE TABLE IF NOT EXISTS face_photos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                angle VARCHAR(20) NOT NULL, -- 'front', 'left', 'right', 'up', 'down'
                photo_url VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        const [photos] = await pool.query('SELECT * FROM face_photos WHERE user_id = ?', [req.params.id]);
        res.json(photos);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Upload Face Enrollment Photo
router.post('/profile/:id/upload-face-photo', upload.single('facePhoto'), async (req, res) => {
    const { angle } = req.body;
    if (!req.file || !angle) {
        return res.status(400).json({ message: 'File and angle are required' });
    }

    const photoUrl = `/uploads/profiles/${req.file.filename}`;

    try {
        // Check if photo for this angle exists
        const [existing] = await pool.query('SELECT * FROM face_photos WHERE user_id = ? AND angle = ?', [req.params.id, angle]);

        if (existing.length > 0) {
            await pool.query('UPDATE face_photos SET photo_url = ? WHERE id = ?', [photoUrl, existing[0].id]);
        } else {
            await pool.query('INSERT INTO face_photos (user_id, angle, photo_url) VALUES (?, ?, ?)', [req.params.id, angle, photoUrl]);
        }

        res.json({ message: 'Face photo uploaded successfully', photoUrl });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
