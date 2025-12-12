const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const { uploadBase64ToMinio } = require('../utils/minioHelper');

// Helper to save base64 image to MinIO
const saveBase64Image = async (base64Data, userId, type) => {
    try {
        return await uploadBase64ToMinio(base64Data, userId, type);
    } catch (error) {
        console.error('Error uploading to MinIO:', error);
        return null;
    }
};

// Register Student
router.post('/register/student', async (req, res) => {
    const { studentId, firstName, middleName, lastName, email, password, course, yearLevel, facePhotos, profilePicture, certificateOfRegistration } = req.body;
    try {
        // Check if user exists by user_id
        const [existingById] = await pool.query('SELECT * FROM users WHERE user_id = ?', [studentId]);

        // Check if email is already used by a DIFFERENT user
        const [existingByEmail] = await pool.query('SELECT * FROM users WHERE email = ? AND user_id != ?', [email, studentId]);
        if (existingByEmail.length > 0) {
            return res.status(400).json({ message: 'Email already registered to another user' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Verify Certificate of Registration if provided
        let corPath = null;
        if (certificateOfRegistration) {
            const verificationService = require('../services/verificationService');

            // Verify COR using OCR
            // Verify COR using OCR
            const corVerification = await verificationService.verifyStudentDocuments(
                { studentId, firstName, middleName, lastName, course, yearLevel },
                certificateOfRegistration
            );

            if (!corVerification.valid) {
                return res.status(400).json({
                    message: 'Certificate of Registration verification failed',
                    reason: corVerification.reason,
                    details: corVerification.details
                });
            }

            // Save COR image
            corPath = await saveBase64Image(certificateOfRegistration, studentId, 'cor');
        }

        // Save profile picture if provided
        let profilePicPath = null;
        if (profilePicture) {
            profilePicPath = await saveBase64Image(profilePicture, studentId, 'profile');
        }

        let userId;

        if (existingById.length > 0) {
            // User exists - add student role and password
            const existingUser = existingById[0];
            userId = existingUser.id;

            // Check if already has student role
            const roles = existingUser.role ? existingUser.role.split(',').map(r => r.trim()) : [];
            if (roles.includes('student')) {
                return res.status(400).json({ message: 'User already registered as student' });
            }

            // Prevent professors from registering as students (only admins can have both roles)
            if (roles.includes('professor') && !roles.includes('admin')) {
                return res.status(403).json({ message: 'Professors cannot register as students. Please contact the administrator if you need multiple roles.' });
            }

            // Add student role
            const newRoles = [...roles, 'student'].join(',');

            // Update existing user with student password and role
            await pool.query(
                'UPDATE users SET student_password_hash = ?, role = ?, certificate_of_registration = ?, approval_status = ? WHERE id = ?',
                [hashedPassword, newRoles, corPath || existingUser.certificate_of_registration, 'approved', userId]
            );

            // Update profile picture if provided
            if (profilePicPath) {
                await pool.query('UPDATE users SET profile_picture = ? WHERE id = ?', [profilePicPath, userId]);
            }
        } else {
            // New user - create account
            const [result] = await pool.query(
                'INSERT INTO users (user_id, first_name, middle_name, last_name, email, student_password_hash, role, profile_picture, certificate_of_registration, approval_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [studentId, firstName, middleName, lastName, email, hashedPassword, 'student', profilePicPath, corPath, 'approved']
            );
            userId = result.insertId;
        }


        // Get course_id from courses table (optional)
        let courseId = null;
        if (course) {
            const [courses] = await pool.query('SELECT id FROM courses WHERE code = ? OR name = ?', [course, course]);
            if (courses.length === 0) {
                return res.status(400).json({ message: 'Invalid course: ' + course });
            }
            courseId = courses[0].id;
        }

        // Check if student record already exists
        const [existingStudent] = await pool.query('SELECT * FROM students WHERE user_id = ?', [userId]);
        if (existingStudent.length === 0) {
            // Insert into students table
            await pool.query(
                'INSERT INTO students (user_id, course_id, year_level) VALUES (?, ?, ?)',
                [userId, courseId, yearLevel]
            );
        } else {
            // Update existing student record
            await pool.query(
                'UPDATE students SET course_id = ?, year_level = ? WHERE user_id = ?',
                [courseId, yearLevel, userId]
            );
        }

        // Save face photos if provided
        if (facePhotos && typeof facePhotos === 'object') {
            // Validate that all face photos contain actual faces
            const { validateFacePhotos } = require('../utils/faceValidation');
            const validation = await validateFacePhotos(facePhotos);

            if (!validation.valid) {
                return res.status(400).json({
                    message: validation.error,
                    invalidAngles: validation.invalidAngles
                });
            }

            // Delete existing face photos for this user
            await pool.query('DELETE FROM face_photos WHERE user_id = ?', [userId]);

            for (const [angle, base64Data] of Object.entries(facePhotos)) {
                const photoPath = await saveBase64Image(base64Data, studentId, `face-${angle}`);
                if (photoPath) {
                    await pool.query(
                        'INSERT INTO face_photos (user_id, photo_url, angle) VALUES (?, ?, ?)',
                        [userId, photoPath, angle]
                    );
                }
            }

            // Log verification for audit trail
            if (certificateOfRegistration) {
                const verificationService = require('../services/verificationService');
                await verificationService.logVerification(
                    userId,
                    'cor',
                    'pass',
                    { studentId, firstName, lastName },
                    0.9,
                    'Auto-approved after COR verification'
                );
            }
        }

        // Create Welcome Notification (only for new users)
        const [existingNotif] = await pool.query('SELECT * FROM notifications WHERE user_id = ? AND title = ?', [userId, 'Welcome to LabFace']);
        if (existingNotif.length === 0) {
            await pool.query(
                'INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
                [userId, 'Welcome to LabFace', 'Your student account has been successfully created. Welcome to the platform!']
            );
        }

        res.status(201).json({ message: existingById.length > 0 ? 'Student role added successfully' : 'Student registered successfully' });
    } catch (err) {
        console.error("Registration Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Register Professor
router.post('/register/professor', async (req, res) => {
    const { professorId, firstName, middleName, lastName, email, password, idPhoto } = req.body;
    try {
        // Check if user exists by user_id
        const [existingById] = await pool.query('SELECT * FROM users WHERE user_id = ?', [professorId]);

        // Check if email is already used by a DIFFERENT user
        const [existingByEmail] = await pool.query('SELECT * FROM users WHERE email = ? AND user_id != ?', [email, professorId]);
        if (existingByEmail.length > 0) {
            return res.status(400).json({ message: 'Email already registered to another user' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Save ID photo if provided
        let idPhotoPath = null;
        if (idPhoto) {
            idPhotoPath = await saveBase64Image(idPhoto, professorId, 'id-photo');
        }

        let userId;

        if (existingById.length > 0) {
            // User exists - add professor role and password
            const existingUser = existingById[0];
            userId = existingUser.id;

            // Check if already has professor role
            const roles = existingUser.role ? existingUser.role.split(',').map(r => r.trim()) : [];
            if (roles.includes('professor')) {
                return res.status(400).json({ message: 'User already registered as professor' });
            }

            // Prevent students from registering as professors (only admins can have both roles)
            if (roles.includes('student') && !roles.includes('admin')) {
                return res.status(403).json({ message: 'Students cannot register as professors. Please contact the administrator if you need multiple roles.' });
            }

            // Add professor role
            const newRoles = [...roles, 'professor'].join(',');

            // Update existing user with professor password and role
            await pool.query(
                'UPDATE users SET professor_password_hash = ?, role = ?, id_photo = ? WHERE id = ?',
                [hashedPassword, newRoles, idPhotoPath || existingUser.id_photo, userId]
            );
        } else {
            // New user - create account
            const [result] = await pool.query(
                'INSERT INTO users (user_id, first_name, middle_name, last_name, email, professor_password_hash, role, approval_status, id_photo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [professorId, firstName, middleName, lastName, email, hashedPassword, 'professor', 'pending', idPhotoPath]
            );
            userId = result.insertId;
        }

        // Create Welcome Notification (only for new users)
        const [existingNotif] = await pool.query('SELECT * FROM notifications WHERE user_id = ? AND title LIKE ?', [userId, 'Welcome to LabFace%']);
        if (existingNotif.length === 0) {
            await pool.query(
                'INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
                [userId, 'Welcome to LabFace', 'Your professor account has been successfully created. Please wait for Admin approval.']
            );
        }

        // Send email notification to Admin (only for new professor registrations)
        if (existingById.length === 0) {
            const { sendLabHeadNotification } = require('../utils/emailService');
            try {
                await sendLabHeadNotification(firstName, lastName, email, professorId);
            } catch (emailError) {
                console.error('Failed to send Admin notification:', emailError);
                // Don't fail registration if email fails
            }
        }

        res.status(201).json({ message: existingById.length > 0 ? 'Professor role added successfully' : 'Professor registered successfully' });
    } catch (err) {
        console.error("Professor Registration Error:", err);
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
        // Join with students and courses tables for student data
        const [users] = await pool.query(`
            SELECT 
                u.*,
                s.year_level,
                c.code as course,
                c.name as course_name
            FROM users u
            LEFT JOIN students s ON u.id = s.user_id
            LEFT JOIN courses c ON s.course_id = c.id
            WHERE u.user_id = ?
        `, [userId]);
        console.log('User found:', users.length > 0 ? 'Yes' : 'No');

        if (users.length === 0) return res.status(400).json({ message: 'Invalid credentials' });

        const user = users[0];

        // Determine which password hash to use based on role
        const roles = user.role ? user.role.split(',').map(r => r.trim()) : [];
        let passwordHash;

        if (roles.includes('professor')) {
            passwordHash = user.professor_password_hash;
        } else if (roles.includes('student')) {
            passwordHash = user.student_password_hash;
        } else {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        if (!passwordHash) {
            return res.status(400).json({ message: 'Password not set for this role. Please contact support.' });
        }

        const isMatch = await bcrypt.compare(password, passwordHash);
        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

        // Check approval status
        if (user.approval_status === 'pending') {
            return res.status(403).json({
                message: 'Your account is pending approval. Please wait for the Laboratory Head to review your registration.',
                status: 'pending'
            });
        }

        if (user.approval_status === 'rejected') {
            return res.status(403).json({
                message: 'Your account registration was rejected. Please contact the Laboratory Head for more information.',
                status: 'rejected'
            });
        }

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
                courseName: user.course_name,
                yearLevel: user.year_level,

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

        // Join with students and courses tables for student data
        const [users] = await pool.query(`
            SELECT 
                u.*,
                s.year_level,
                c.code as course,
                c.name as course_name
            FROM users u
            LEFT JOIN students s ON u.id = s.user_id
            LEFT JOIN courses c ON s.course_id = c.id
            WHERE u.id = ?
        `, [decoded.id]);

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
            courseName: user.course_name,
            yearLevel: user.year_level,
            studentId: user.role === 'student' ? user.user_id : undefined,
            professorId: user.role === 'professor' ? user.user_id : undefined,
            profilePicture: user.profile_picture
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
    const { field, value, registeringAs, userId } = req.query;
    if (!field || !value) return res.status(400).json({ message: 'Field and value required' });

    try {
        let query = '';
        if (field === 'email') {
            query = 'SELECT user_id, role FROM users WHERE email = ?';
        } else if (field === 'userId') {
            query = 'SELECT user_id, role FROM users WHERE user_id = ?';
        } else {
            return res.status(400).json({ message: 'Invalid field' });
        }

        const [existing] = await pool.query(query, [value]);

        if (existing.length === 0) {
            // User doesn't exist - available
            return res.json({
                available: true,
                canProceed: true
            });
        }

        const user = existing[0];
        const roles = user.role ? user.role.split(',').map(r => r.trim()) : [];

        // If checking email
        if (field === 'email') {
            // If userId is provided and email belongs to the same user, allow it
            if (userId && user.user_id === userId) {
                // Same user - check if they can add the role
                if (registeringAs && roles.includes(registeringAs)) {
                    return res.json({
                        available: false,
                        canProceed: false,
                        message: `User already registered as ${registeringAs}`
                    });
                }

                // Same user, different role - allow
                return res.json({
                    available: false,
                    canProceed: true,
                    message: 'Email belongs to your account',
                    existingUserId: user.user_id
                });
            }

            // Different user - block
            return res.json({
                available: false,
                canProceed: false,
                message: 'Email already registered to another user',
                existingUserId: user.user_id
            });
        }

        // If checking userId and registeringAs is provided
        if (field === 'userId' && registeringAs) {
            // Check if user already has the role they're trying to register for
            if (roles.includes(registeringAs)) {
                return res.json({
                    available: false,
                    canProceed: false,
                    message: `User already registered as ${registeringAs}`
                });
            }

            // Check if user is admin or has a different role (multi-role allowed)
            const isAdmin = roles.includes('admin');
            const hasOtherRole = roles.length > 0;

            if (isAdmin || hasOtherRole) {
                // Admin or existing user can add another role
                return res.json({
                    available: false,
                    canProceed: true,
                    message: `Adding ${registeringAs} role to existing account`,
                    existingRoles: roles
                });
            }
        }

        // Default: user exists
        res.json({
            available: false,
            canProceed: false,
            message: 'User ID already registered'
        });
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

        // Check if user has at least professor or student role for password reset
        const user = users[0];
        const roles = user.role ? user.role.split(',').map(r => r.trim()) : [];
        if (!roles.includes('professor') && !roles.includes('student')) {
            return res.status(403).json({ message: 'Password reset is only available for professor and student accounts.' });
        }

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
    console.log('Verify OTP Request:', { email, otp });

    try {
        const [records] = await pool.query('SELECT * FROM password_resets WHERE email = ? AND otp = ?', [email, otp]);
        if (records.length === 0) return res.status(400).json({ message: 'Invalid OTP' });

        if (new Date() > new Date(records[0].expires_at)) {
            return res.status(400).json({ message: 'OTP expired' });
        }

        console.log('OTP verified, fetching user data for email:', email);

        // Fetch user data to return for confirmation
        const [users] = await pool.query(`
            SELECT 
                u.user_id,
                u.first_name,
                u.last_name,
                u.role,
                s.year_level,
                c.code as course,
                c.name as course_name
            FROM users u
            LEFT JOIN students s ON u.id = s.user_id
            LEFT JOIN courses c ON s.course_id = c.id
            WHERE u.email = ?
        `, [email]);

        console.log('User query result:', users);

        if (users.length === 0) {
            console.error('No user found for email:', email);
            return res.status(404).json({ message: 'User not found' });
        }

        const user = users[0];

        // Check if user has at least professor or student role for password reset
        const roles = user.role ? user.role.split(',').map(r => r.trim()) : [];
        if (!roles.includes('professor') && !roles.includes('student')) {
            return res.status(403).json({ message: 'Password reset is only available for professor and student accounts.' });
        }

        console.log('Sending user data:', user);

        res.json({
            message: 'OTP verified',
            user: {
                userId: user.user_id,
                firstName: user.first_name,
                lastName: user.last_name,
                role: user.role,
                course: user.course,
                courseName: user.course_name,
                yearLevel: user.year_level
            }
        });
    } catch (err) {
        console.error('Verify OTP Error:', err);
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

        // Check if user has at least professor or student role for password reset
        const [users] = await pool.query('SELECT role FROM users WHERE email = ?', [email]);
        if (users.length > 0) {
            const roles = users[0].role ? users[0].role.split(',').map(r => r.trim()) : [];
            if (!roles.includes('professor') && !roles.includes('student') && !roles.includes('admin')) {
                return res.status(403).json({ message: 'Password reset is only available for professor, student, and admin accounts.' });
            }

            // Determine which password hash to update based on role
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            let updateQuery;

            if (roles.includes('professor')) {
                updateQuery = 'UPDATE users SET professor_password_hash = ? WHERE email = ?';
            } else if (roles.includes('student')) {
                updateQuery = 'UPDATE users SET student_password_hash = ? WHERE email = ?';
            } else {
                return res.status(400).json({ message: 'Invalid role for password reset' });
            }

            await pool.query(updateQuery, [hashedPassword, email]);
            await pool.query('DELETE FROM password_resets WHERE email = ?', [email]);

            res.json({ message: 'Password reset successfully' });
        } else {
            return res.status(404).json({ message: 'User not found' });
        }
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
        const roles = user.role ? user.role.split(',').map(r => r.trim()) : [];

        // Determine which password hash to check and update based on role
        let currentPasswordHash;
        let updateQuery;

        if (roles.includes('professor')) {
            currentPasswordHash = user.professor_password_hash;
            updateQuery = 'UPDATE users SET professor_password_hash = ? WHERE user_id = ?';
        } else if (roles.includes('student')) {
            currentPasswordHash = user.student_password_hash;
            updateQuery = 'UPDATE users SET student_password_hash = ? WHERE user_id = ?';
        } else if (roles.includes('admin')) {
            currentPasswordHash = user.admin_password_hash;
            updateQuery = 'UPDATE users SET admin_password_hash = ? WHERE user_id = ?';
        } else {
            return res.status(400).json({ message: 'Invalid role' });
        }

        if (!currentPasswordHash) {
            return res.status(400).json({ message: 'Password not set for this role' });
        }

        const isMatch = await bcrypt.compare(currentPassword, currentPasswordHash);
        if (!isMatch) return res.status(400).json({ message: 'Incorrect current password' });

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query(updateQuery, [hashedPassword, userId]);

        res.json({ message: 'Password changed successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin Login Endpoint (separate from regular login)
router.post('/admin/login', async (req, res) => {
    const { email, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    try {
        // Find admin user by email - check if role includes 'admin'
        const [users] = await pool.query(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            // Log failed attempt
            await pool.query(
                'INSERT INTO admin_login_logs (email, success, ip_address, user_agent) VALUES (?, ?, ?, ?)',
                [email, false, ipAddress, userAgent]
            );
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const user = users[0];

        // Check if user has admin role
        const roles = user.role ? user.role.split(',').map(r => r.trim()) : [];
        if (!roles.includes('admin')) {
            await pool.query(
                'INSERT INTO admin_login_logs (email, success, ip_address, user_agent) VALUES (?, ?, ?, ?)',
                [email, false, ipAddress, userAgent]
            );
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Verify password using admin_password_hash
        if (!user.admin_password_hash) {
            await pool.query(
                'INSERT INTO admin_login_logs (email, success, ip_address, user_agent) VALUES (?, ?, ?, ?)',
                [email, false, ipAddress, userAgent]
            );
            return res.status(401).json({ message: 'Admin password not set. Please contact support.' });
        }

        const validPassword = await bcrypt.compare(password, user.admin_password_hash);

        if (!validPassword) {
            // Log failed attempt
            await pool.query(
                'INSERT INTO admin_login_logs (email, success, ip_address, user_agent) VALUES (?, ?, ?, ?)',
                [email, false, ipAddress, userAgent]
            );
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Log successful login
        await pool.query(
            'INSERT INTO admin_login_logs (email, success, ip_address, user_agent) VALUES (?, ?, ?, ?)',
            [email, true, ipAddress, userAgent]
        );

        // Generate token with shorter expiration for admin
        const token = jwt.sign(
            { id: user.id, role: user.role },
            JWT_SECRET,
            { expiresIn: '4h' } // Shorter session for admin security
        );

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                role: user.role
            }
        });
    } catch (err) {
        console.error('Admin Login Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Validate Certificate of Registration (without registration)
router.post('/validate-cor', async (req, res) => {
    const { studentId, firstName, middleName, lastName, certificateOfRegistration } = req.body;

    try {
        if (!certificateOfRegistration) {
            return res.status(400).json({
                valid: false,
                reason: 'No certificate provided'
            });
        }

        const verificationService = require('../services/verificationService');

        // Verify COR using OCR
        const result = await verificationService.verifyStudentDocuments(
            { studentId, firstName, middleName, lastName, course: req.body.course, yearLevel: req.body.yearLevel },
            certificateOfRegistration
        );

        res.json(result);
    } catch (error) {
        console.error('COR validation error:', error);
        res.status(500).json({
            valid: false,
            reason: 'Validation error: ' + error.message
        });
    }
});

module.exports = router;
