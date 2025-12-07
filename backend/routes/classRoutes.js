const express = require('express');
const pool = require('../config/db');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const upload = multer({ storage: multer.memoryStorage() });

// Ensure enrollments table exists
pool.query(`
    CREATE TABLE IF NOT EXISTS enrollments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        class_id INT NOT NULL,
        student_id INT, 
        student_number VARCHAR(20) NOT NULL,
        student_name VARCHAR(255),
        batch_group VARCHAR(50),
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    )
`).catch(err => console.error('Error creating enrollments table:', err));

// Create Class
router.post('/', async (req, res) => {
    const { subjectCode, subjectName, professorId, schoolYear, semester, section, schedule, course, yearLevel } = req.body;
    try {
        const [result] = await pool.query(
            'INSERT INTO classes (subject_code, subject_name, professor_id, school_year, semester, section, schedule_json, course, year_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [subjectCode, subjectName, professorId, schoolYear, semester, section, JSON.stringify(schedule), course || null, yearLevel || null]
        );
        res.status(201).json({ message: 'Class created successfully', classId: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// List Classes for Professor
router.get('/professor/:id', async (req, res) => {
    const { archived } = req.query;
    try {
        let query = `
            SELECT c.*, COUNT(e.id) as student_count 
            FROM classes c 
            LEFT JOIN enrollments e ON c.id = e.class_id
            WHERE c.professor_id = ?
        `;
        const params = [req.params.id];

        if (archived === 'true') {
            query += ' AND c.is_archived = 1';
        } else {
            query += ' AND (c.is_archived = 0 OR c.is_archived IS NULL)';
        }

        query += ' GROUP BY c.id';

        const [classes] = await pool.query(query, params);
        res.json(classes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Archive/Unarchive Class
router.patch('/:id/archive', async (req, res) => {
    const { isArchived } = req.body;
    try {
        await pool.query('UPDATE classes SET is_archived = ? WHERE id = ?', [isArchived ? 1 : 0, req.params.id]);
        res.json({ message: `Class ${isArchived ? 'archived' : 'unarchived'} successfully` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Upload Class Roster
router.post('/:id/upload-roster', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    try {
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet);

        const classId = req.params.id;
        let addedCount = 0;
        let updatedCount = 0;

        for (const row of data) {
            const studentNumber = row['Student Number'] || row['Student ID'] || row['student_number'];
            const name = row['Name'] || row['Full Name'] || row['name'];

            if (studentNumber) {
                // FIXED: Changed user_id to student_id
                const [users] = await pool.query('SELECT id FROM users WHERE student_id = ? AND role = "student"', [studentNumber]);
                const studentId = users.length > 0 ? users[0].id : null;

                // Check for duplicate enrollment
                const [existing] = await pool.query('SELECT id, student_id FROM enrollments WHERE class_id = ? AND student_number = ?', [classId, studentNumber]);

                if (existing.length === 0) {
                    // New enrollment
                    await pool.query(
                        'INSERT INTO enrollments (class_id, student_id, student_number, student_name) VALUES (?, ?, ?, ?)',
                        [classId, studentId, studentNumber, name || 'Unknown']
                    );
                    addedCount++;
                } else if (studentId && existing[0].student_id === null) {
                    // Update linkage if student now registered
                    await pool.query('UPDATE enrollments SET student_id = ?, student_name = ? WHERE id = ?', [studentId, name, existing[0].id]);
                    updatedCount++;
                }
            }
        }

        res.json({
            message: `Processed ${data.length} records. Added ${addedCount} new students. Updated ${updatedCount} existing enrollments.`,
            added: addedCount,
            updated: updatedCount,
            total: data.length
        });

    } catch (err) {
        console.error("Roster Upload Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Get Class Details (Roster) - Enhanced with account status
router.get('/:id', async (req, res) => {
    try {
        const [classes] = await pool.query('SELECT * FROM classes WHERE id = ?', [req.params.id]);
        if (classes.length === 0) return res.status(404).json({ message: 'Class not found' });

        const [students] = await pool.query(`
            SELECT 
                e.id,
                e.student_number,
                e.student_name,
                e.student_id,
                u.profile_picture,
                u.first_name,
                u.last_name,
                CASE 
                    WHEN e.student_id IS NULL THEN 'No Account'
                    ELSE 'Registered'
                END as account_status
            FROM enrollments e 
            LEFT JOIN users u ON e.student_id = u.id 
            WHERE e.class_id = ?
            ORDER BY e.student_name
        `, [req.params.id]);

        res.json({ class: classes[0], students });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Students for a Class (for SessionModal batch selection)
router.get('/:id/students', async (req, res) => {
    try {
        const [students] = await pool.query(`
            SELECT 
                u.id, 
                u.student_id as user_id, 
                u.first_name, 
                u.last_name, 
                u.profile_picture, 
                u.course, 
                u.year_level
            FROM enrollments e
            JOIN users u ON e.student_id = u.id
            WHERE e.class_id = ? AND e.student_id IS NOT NULL
            ORDER BY u.last_name, u.first_name
        `, [req.params.id]);

        res.json(students);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Class Analytics (Attendance Statistics)
router.get('/:id/analytics', async (req, res) => {
    try {
        const classId = req.params.id;

        // Get all sessions for this class
        const [sessions] = await pool.query(
            'SELECT id, date, start_time, type FROM sessions WHERE class_id = ? ORDER BY date, start_time',
            [classId]
        );

        // Get all enrolled students
        const [students] = await pool.query(`
            SELECT e.student_id, e.student_name, u.first_name, u.last_name, u.profile_picture
            FROM enrollments e
            LEFT JOIN users u ON e.student_id = u.id
            WHERE e.class_id = ?
            ORDER BY e.student_name
        `, [classId]);

        // Get all attendance logs for this class
        const sessionIds = sessions.map(s => s.id);
        let logs = [];
        if (sessionIds.length > 0) {
            const [logsResult] = await pool.query(
                `SELECT session_id, student_id, status
                 FROM attendance_logs
                 WHERE session_id IN (${sessionIds.map(() => '?').join(',')})`,
                sessionIds
            );
            logs = logsResult;
        }

        // Calculate statistics per student
        const analytics = students.map(student => {
            const studentLogs = logs.filter(log => log.student_id === student.student_id);
            const totalSessions = sessions.length;
            const attendedSessions = studentLogs.length;
            const presentCount = studentLogs.filter(log => log.status === 'Present').length;
            const lateCount = studentLogs.filter(log => log.status === 'Late').length;
            const absentCount = totalSessions - attendedSessions;

            const attendanceRate = totalSessions > 0
                ? ((attendedSessions / totalSessions) * 100).toFixed(1)
                : 0;

            const isAtRisk = parseFloat(attendanceRate) < 75;

            return {
                studentId: student.student_id,
                studentName: student.student_name || `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Unknown',
                profilePicture: student.profile_picture,
                totalSessions,
                attendedSessions,
                presentCount,
                lateCount,
                absentCount,
                attendanceRate: parseFloat(attendanceRate),
                isAtRisk
            };
        });

        // Sort by attendance rate (lowest first)
        analytics.sort((a, b) => a.attendanceRate - b.attendanceRate);

        // Calculate class average
        const avgAttendance = analytics.length > 0
            ? (analytics.reduce((sum, s) => sum + s.attendanceRate, 0) / analytics.length).toFixed(1)
            : 0;

        res.json({
            classId,
            totalSessions: sessions.length,
            totalStudents: students.length,
            averageAttendance: parseFloat(avgAttendance),
            atRiskCount: analytics.filter(s => s.isAtRisk).length,
            students: analytics,
            sessions: sessions.map(s => ({
                id: s.id,
                date: s.date,
                startTime: s.start_time,
                type: s.type
            }))
        });
    } catch (err) {
        console.error('Analytics error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get Attendance Grid (Students × Sessions Matrix)
router.get('/:id/attendance-grid', async (req, res) => {
    try {
        const classId = req.params.id;

        const [sessions] = await pool.query(
            'SELECT id, date, start_time, type FROM sessions WHERE class_id = ? ORDER BY date, start_time',
            [classId]
        );

        const [students] = await pool.query(
            'SELECT student_id, student_name FROM enrollments WHERE class_id = ? ORDER BY student_name',
            [classId]
        );

        const sessionIds = sessions.map(s => s.id);
        let logs = [];
        if (sessionIds.length > 0) {
            const [logsResult] = await pool.query(
                `SELECT session_id, student_id, status, time_in
                 FROM attendance_logs
                 WHERE session_id IN (${sessionIds.map(() => '?').join(',')})`,
                sessionIds
            );
            logs = logsResult;
        }

        // Build grid
        const grid = students.map(student => ({
            studentId: student.student_id,
            studentName: student.student_name,
            attendance: sessions.map(session => {
                const log = logs.find(l =>
                    l.session_id === session.id && l.student_id === student.student_id
                );
                return {
                    sessionId: session.id,
                    date: session.date,
                    status: log ? log.status : 'Absent',
                    timeIn: log ? log.time_in : null
                };
            })
        }));

        res.json({
            students: grid,
            sessions: sessions.map(s => ({
                id: s.id,
                date: s.date,
                startTime: s.start_time,
                type: s.type
            }))
        });
    } catch (err) {
        console.error('Attendance grid error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
