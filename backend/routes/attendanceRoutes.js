const express = require('express');
const pool = require('../config/db');
const router = express.Router();

// ============================================
// SESSION MANAGEMENT
// ============================================

// Start Session (Regular, Make-up, or Batch)
router.post('/sessions', async (req, res) => {
    const { classId, date, startTime, type, batchStudents, sessionName, reason } = req.body;

    try {
        // Validate required fields
        if (!classId || !date || !startTime) {
            return res.status(400).json({ error: 'Missing required fields: classId, date, startTime' });
        }

        // Validate session type
        const validTypes = ['regular', 'makeup', 'batch'];
        const sessionType = type || 'regular';

        if (!validTypes.includes(sessionType)) {
            return res.status(400).json({
                error: 'Invalid session type',
                validTypes: validTypes
            });
        }

        // Validate batch students if batch session
        if (sessionType === 'batch') {
            if (!batchStudents || !Array.isArray(batchStudents) || batchStudents.length === 0) {
                return res.status(400).json({
                    error: 'Batch sessions require at least one student',
                    hint: 'Provide batchStudents as an array of student IDs'
                });
            }

            // Verify all students are enrolled in this class
            const [enrolled] = await pool.query(
                'SELECT student_id FROM class_enrollments WHERE class_id = ?',
                [classId]
            );

            if (enrolled.length === 0) {
                return res.status(400).json({ error: 'No students enrolled in this class' });
            }

            const enrolledIds = enrolled.map(e => e.student_id);
            const invalidStudents = batchStudents.filter(id => !enrolledIds.includes(id));

            if (invalidStudents.length > 0) {
                return res.status(400).json({
                    error: 'Some students are not enrolled in this class',
                    invalidStudents,
                    enrolledCount: enrolledIds.length
                });
            }
        }

        // Insert session
        const [result] = await pool.query(
            `INSERT INTO sessions 
            (class_id, date, start_time, type, batch_students, session_name, reason) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                classId,
                date,
                startTime,
                sessionType,
                batchStudents ? JSON.stringify(batchStudents) : null,
                sessionName || null,
                reason || null
            ]
        );

        res.status(201).json({
            success: true,
            message: `${sessionType.charAt(0).toUpperCase() + sessionType.slice(1)} session started`,
            sessionId: result.insertId,
            type: sessionType,
            date,
            startTime,
            studentCount: sessionType === 'batch' ? batchStudents.length : null,
            sessionName: sessionName || null
        });
    } catch (err) {
        console.error('Session creation error:', err);
        res.status(500).json({ error: 'Failed to create session', details: err.message });
    }
});

// Get Session Details
router.get('/sessions/:id', async (req, res) => {
    try {
        const [sessions] = await pool.query(
            `SELECT s.*, c.subject_code, c.subject_name, c.section
            FROM sessions s
            JOIN classes c ON s.class_id = c.id
            WHERE s.id = ?`,
            [req.params.id]
        );

        if (sessions.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const session = sessions[0];

        // Parse batch_students if it exists
        if (session.batch_students) {
            try {
                session.batch_students = JSON.parse(session.batch_students);
            } catch (e) {
                session.batch_students = null;
            }
        }

        res.json(session);
    } catch (err) {
        console.error('Get session error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get Eligible Students for Session (respects batch restrictions)
router.get('/sessions/:id/students', async (req, res) => {
    try {
        // Get session details
        const [sessions] = await pool.query('SELECT * FROM sessions WHERE id = ?', [req.params.id]);

        if (sessions.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const session = sessions[0];
        let studentIds = null;

        // If batch session, only return assigned students
        if (session.type === 'batch' && session.batch_students) {
            try {
                studentIds = JSON.parse(session.batch_students);
            } catch (e) {
                return res.status(500).json({ error: 'Invalid batch_students data' });
            }
        }

        // Build query
        let query = `
            SELECT u.id, u.student_id as user_id, u.first_name, u.last_name, 
                   u.profile_picture, u.course, u.year_level
            FROM users u
            JOIN class_enrollments ce ON u.id = ce.student_id
            WHERE ce.class_id = ?
        `;

        const params = [session.class_id];

        if (studentIds && studentIds.length > 0) {
            query += ` AND u.id IN (${studentIds.map(() => '?').join(',')})`;
            params.push(...studentIds);
        }

        query += ` ORDER BY u.last_name, u.first_name`;

        const [students] = await pool.query(query, params);

        res.json({
            sessionId: session.id,
            sessionType: session.type,
            totalStudents: students.length,
            students
        });
    } catch (err) {
        console.error('Get session students error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// ATTENDANCE MARKING
// ============================================

// Mark Attendance (called by AI Service or Manual)
router.post('/mark', async (req, res) => {
    const { sessionId, studentId, direction, snapshotUrl } = req.body;

    if (!sessionId || !studentId) {
        return res.status(400).json({ error: 'Missing sessionId or studentId' });
    }

    try {
        // Get session details to check batch restrictions
        const [sessions] = await pool.query('SELECT * FROM sessions WHERE id = ?', [sessionId]);

        if (sessions.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const session = sessions[0];

        // Check if student is allowed in this session (batch restriction)
        if (session.type === 'batch' && session.batch_students) {
            const batchStudents = JSON.parse(session.batch_students);
            if (!batchStudents.includes(studentId)) {
                return res.status(403).json({
                    error: 'Student not assigned to this batch session',
                    sessionType: 'batch'
                });
            }
        }

        // Check if student is enrolled in the class
        const [enrollment] = await pool.query(
            'SELECT * FROM class_enrollments WHERE class_id = ? AND student_id = ?',
            [session.class_id, studentId]
        );

        if (enrollment.length === 0) {
            return res.status(403).json({ error: 'Student not enrolled in this class' });
        }

        // Find existing attendance log
        const [existing] = await pool.query(
            'SELECT * FROM attendance_logs WHERE session_id = ? AND student_id = ?',
            [sessionId, studentId]
        );

        const now = new Date();

        // Handle EXIT
        if (direction === 'EXIT') {
            if (existing.length > 0) {
                await pool.query(
                    'UPDATE attendance_logs SET time_out = ? WHERE id = ?',
                    [now, existing[0].id]
                );
                return res.json({
                    success: true,
                    message: 'Exit time recorded',
                    type: 'EXIT',
                    logId: existing[0].id
                });
            } else {
                return res.status(400).json({
                    error: 'Cannot mark exit without entry',
                    hint: 'Student has not marked entry yet'
                });
            }
        }

        // Handle ENTRY (default)
        if (existing.length > 0) {
            return res.json({
                success: true,
                message: 'Already marked present',
                status: existing[0].status,
                timeIn: existing[0].time_in
            });
        }

        // Determine status (Present vs Late)
        let status = 'Present';
        const sessionStart = new Date(`${session.date}T${session.start_time}`);
        const diffMins = (now.getTime() - sessionStart.getTime()) / 60000;

        if (diffMins > 15) {
            status = 'Late';
        }

        // Insert attendance log
        const [result] = await pool.query(
            `INSERT INTO attendance_logs 
            (session_id, student_id, time_in, status, snapshot_url) 
            VALUES (?, ?, ?, ?, ?)`,
            [sessionId, studentId, now, status, snapshotUrl || null]
        );

        res.status(201).json({
            success: true,
            message: 'Attendance marked',
            type: 'ENTRY',
            status,
            logId: result.insertId,
            timeIn: now,
            minutesLate: diffMins > 15 ? Math.floor(diffMins) : 0
        });

    } catch (err) {
        console.error('Mark attendance error:', err);
        res.status(500).json({ error: 'Failed to mark attendance', details: err.message });
    }
});

// Get Live Attendance for Session
router.get('/session/:id/live', async (req, res) => {
    try {
        const [logs] = await pool.query(`
            SELECT 
                a.id,
                a.session_id,
                a.student_id,
                a.time_in,
                a.time_out,
                a.status,
                a.snapshot_url,
                u.student_id as user_id,
                u.first_name,
                u.last_name,
                u.profile_picture,
                u.course,
                u.year_level
            FROM attendance_logs a
            JOIN users u ON a.student_id = u.id
            WHERE a.session_id = ?
            ORDER BY a.time_in DESC
        `, [req.params.id]);

        res.json({
            sessionId: parseInt(req.params.id),
            totalPresent: logs.length,
            attendanceLogs: logs
        });
    } catch (err) {
        console.error('Get live attendance error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get Attendance Summary for Session
router.get('/session/:id/summary', async (req, res) => {
    try {
        // Get session details
        const [sessions] = await pool.query('SELECT * FROM sessions WHERE id = ?', [req.params.id]);

        if (sessions.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const session = sessions[0];

        // Get total enrolled students (or batch students)
        let totalStudents = 0;
        if (session.type === 'batch' && session.batch_students) {
            const batchStudents = JSON.parse(session.batch_students);
            totalStudents = batchStudents.length;
        } else {
            const [enrolled] = await pool.query(
                'SELECT COUNT(*) as count FROM class_enrollments WHERE class_id = ?',
                [session.class_id]
            );
            totalStudents = enrolled[0].count;
        }

        // Get attendance counts
        const [counts] = await pool.query(`
            SELECT 
                COUNT(*) as total_present,
                SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as on_time,
                SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) as late
            FROM attendance_logs
            WHERE session_id = ?
        `, [req.params.id]);

        const summary = counts[0];
        const absent = totalStudents - summary.total_present;

        res.json({
            sessionId: session.id,
            sessionType: session.type,
            date: session.date,
            startTime: session.start_time,
            totalStudents,
            present: summary.total_present || 0,
            onTime: summary.on_time || 0,
            late: summary.late || 0,
            absent,
            attendanceRate: totalStudents > 0 ? ((summary.total_present / totalStudents) * 100).toFixed(1) : 0
        });
    } catch (err) {
        console.error('Get attendance summary error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
