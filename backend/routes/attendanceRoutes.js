const express = require('express');
const pool = require('../config/db');
const router = express.Router();

// Start Session
router.post('/sessions', async (req, res) => {
    const { classId, date, startTime, type } = req.body;
    try {
        const [result] = await pool.query(
            'INSERT INTO sessions (class_id, date, start_time, type) VALUES (?, ?, ?, ?)',
            [classId, date, startTime, type || 'regular']
        );
        res.status(201).json({ message: 'Session started', sessionId: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Mark Attendance (called by AI Service)
router.post('/mark', async (req, res) => {
    const { sessionId, studentId, status, snapshotUrl } = req.body;
    try {
        // Check if already marked for this session to avoid duplicates (logic can be refined)
        const [existing] = await pool.query('SELECT * FROM attendance_logs WHERE session_id = ? AND student_id = ?', [sessionId, studentId]);

        if (existing.length > 0) {
            // Update if needed, e.g., from Late to Present? Or just log exit?
            // For now, simple insert or ignore
            return res.json({ message: 'Attendance already marked' });
        }

        await pool.query(
            'INSERT INTO attendance_logs (session_id, student_id, time_in, status, snapshot_url) VALUES (?, ?, NOW(), ?, ?)',
            [sessionId, studentId, status, snapshotUrl]
        );
        res.status(201).json({ message: 'Attendance marked' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
