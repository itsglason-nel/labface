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
        // Join with students and courses tables for student data
        const [users] = await pool.query(`
            SELECT 
                u.id, u.user_id, u.first_name, u.middle_name, u.last_name, u.email, u.role, 
                u.profile_picture,
                s.year_level,
                c.code as course,
                c.name as course_name
            FROM users u
            LEFT JOIN students s ON u.id = s.user_id
            LEFT JOIN courses c ON s.course_id = c.id
            WHERE u.id = ?
        `, [req.params.id]);

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
            courseName: user.course_name,
            yearLevel: user.year_level,
            profilePicture: user.profile_picture,
            studentId: role === 'student' ? user.user_id : undefined,
            professorId: role === 'professor' ? user.user_id : undefined,
            schoolId: user.user_id
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Profile
router.put('/profile/:id', async (req, res) => {
    const { firstName, lastName, email, course, yearLevel } = req.body;
    console.log(`Updating profile for user ${req.params.id}:`, req.body);

    try {
        // Update users table
        await pool.query(
            'UPDATE users SET first_name = ?, last_name = ?, email = ? WHERE id = ?',
            [firstName || null, lastName || null, email || null, req.params.id]
        );

        // Update students table if course or yearLevel provided
        if (course || yearLevel) {
            // Check if user is a student
            const [users] = await pool.query('SELECT role FROM users WHERE id = ?', [req.params.id]);
            if (users.length > 0 && users[0].role === 'student') {
                // Get course_id if course is provided
                let courseId = null;
                if (course) {
                    const [courses] = await pool.query('SELECT id FROM courses WHERE code = ?', [course]);
                    if (courses.length > 0) {
                        courseId = courses[0].id;
                    }
                }

                // Update or insert into students table
                const [existing] = await pool.query('SELECT * FROM students WHERE user_id = ?', [req.params.id]);
                if (existing.length > 0) {
                    // Update existing record
                    const updates = [];
                    const values = [];
                    if (courseId) {
                        updates.push('course_id = ?');
                        values.push(courseId);
                    }
                    if (yearLevel) {
                        updates.push('year_level = ?');
                        values.push(yearLevel);
                    }
                    if (updates.length > 0) {
                        values.push(req.params.id);
                        await pool.query(`UPDATE students SET ${updates.join(', ')} WHERE user_id = ?`, values);
                    }
                } else if (courseId && yearLevel) {
                    // Insert new record
                    await pool.query(
                        'INSERT INTO students (user_id, course_id, year_level) VALUES (?, ?, ?)',
                        [req.params.id, courseId, yearLevel]
                    );
                }
            }
        }

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

    try {
        // Read the uploaded file and convert to base64 for validation
        const fs = require('fs');
        const imageBuffer = fs.readFileSync(req.file.path);
        const base64Image = `data:${req.file.mimetype};base64,${imageBuffer.toString('base64')}`;

        // Validate that the image contains a face
        const { validateFaceInImage } = require('../utils/faceValidation');
        const validation = await validateFaceInImage(base64Image);

        if (!validation.valid) {
            // Delete the uploaded file since it's invalid
            fs.unlinkSync(req.file.path);
            return res.status(400).json({
                message: validation.error || 'No face detected in the uploaded image'
            });
        }

        const photoUrl = `/uploads/profiles/${req.file.filename}`;

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
