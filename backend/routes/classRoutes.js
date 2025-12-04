const express = require('express');
const pool = require('../config/db');
const router = express.Router();

// Create Class
router.post('/', async (req, res) => {
    const { subjectCode, subjectName, professorId, schoolYear, semester, section, schedule } = req.body;
    try {
        await pool.query(
            'INSERT INTO classes (subject_code, subject_name, professor_id, school_year, semester, section, schedule_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [subjectCode, subjectName, professorId, schoolYear, semester, section, JSON.stringify(schedule)]
        );
        res.status(201).json({ message: 'Class created successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// List Classes for Professor
router.get('/professor/:id', async (req, res) => {
    const { archived } = req.query;
    try {
        let query = 'SELECT * FROM classes WHERE professor_id = ?';
        const params = [req.params.id];

        if (archived === 'true') {
            query += ' AND is_archived = 1';
        } else {
            query += ' AND (is_archived = 0 OR is_archived IS NULL)';
        }

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

module.exports = router;
