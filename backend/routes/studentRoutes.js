const express = require('express');
const pool = require('../config/db');
const router = express.Router();

// Ensure class_students table exists
pool.query(`
    CREATE TABLE IF NOT EXISTS class_students (
        id INT AUTO_INCREMENT PRIMARY KEY,
        class_id INT NOT NULL,
        student_id INT NOT NULL,
        enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    )
`).catch(err => console.error('Error creating class_students table:', err));

// Get Student Dashboard Data
router.get('/dashboard/:id', async (req, res) => {
    const studentId = req.params.id;

    try {
        // 1. Get User Details (to get string user_id for attendance logs)
        const [users] = await pool.query('SELECT user_id, first_name FROM users WHERE id = ?', [studentId]);
        if (users.length === 0) return res.status(404).json({ message: 'Student not found' });
        const user = users[0];
        const studentStringId = user.user_id;

        // 2. Get Enrolled Classes
        const [classes] = await pool.query(`
            SELECT c.* 
            FROM classes c
            JOIN class_students cs ON c.id = cs.class_id
            WHERE cs.student_id = ?
            AND (c.is_archived = 0 OR c.is_archived IS NULL)
        `, [studentId]);

        // 3. Calculate Next Class
        let nextClass = null;
        const now = new Date();
        const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
        const currentTime = now.getHours() * 60 + now.getMinutes(); // Minutes from midnight

        // Helper to parse time "1:00 PM" to minutes
        const parseTime = (timeStr) => {
            const [time, modifier] = timeStr.split(' ');
            let [hours, minutes] = time.split(':');
            hours = parseInt(hours);
            minutes = parseInt(minutes);
            if (hours === 12 && modifier === 'AM') hours = 0;
            if (hours !== 12 && modifier === 'PM') hours += 12;
            return hours * 60 + minutes;
        };

        let minDiff = Infinity;

        classes.forEach(cls => {
            let schedule = cls.schedule_json;
            if (typeof schedule === 'string') {
                try {
                    schedule = JSON.parse(schedule);
                } catch (e) {
                    return;
                }
            }

            if (Array.isArray(schedule)) {
                schedule.forEach(slot => {
                    // slot: { day: 'Monday', startTime: '1:00 PM', endTime: '4:00 PM' }
                    // Simple logic: find the next slot today or future days
                    // For simplicity, let's just check if it's today and later, or just return the first upcoming one in the week.
                    // This logic can be complex. Let's simplify:
                    // If today matches slot.day:
                    //   if startTime > now: candidate
                    // Else if day is after today: candidate

                    // Map days to numbers
                    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                    const todayIdx = now.getDay();
                    const slotDayIdx = days.indexOf(slot.day);

                    if (slotDayIdx === -1) return;

                    let dayDiff = slotDayIdx - todayIdx;
                    if (dayDiff < 0) dayDiff += 7; // Next week

                    const slotStartMinutes = parseTime(slot.startTime);

                    // If it's today but passed, move to next week
                    if (dayDiff === 0 && slotStartMinutes < currentTime) {
                        dayDiff = 7;
                    }

                    const totalMinutesDiff = (dayDiff * 24 * 60) + (slotStartMinutes - currentTime);

                    if (totalMinutesDiff < minDiff && totalMinutesDiff >= 0) {
                        minDiff = totalMinutesDiff;
                        nextClass = {
                            subject: cls.subject_name,
                            professor: 'Prof. ' + cls.professor_id, // We might need to fetch professor name
                            room: 'Lab 1', // Placeholder or from DB
                            time: `${slot.startTime} - ${slot.endTime}`,
                            status: 'Scheduled'
                        };
                    }
                });
            }
        });

        // 4. Get Attendance Stats
        // Assuming attendance_logs uses studentStringId (user_id)
        const [attendanceLogs] = await pool.query(`
            SELECT status, COUNT(*) as count
            FROM attendance_logs
            WHERE student_id = ?
            GROUP BY status
        `, [studentStringId]);

        let stats = { present: 0, late: 0, absent: 0 };
        let totalClasses = 0;
        attendanceLogs.forEach(log => {
            const status = log.status.toLowerCase();
            if (stats[status] !== undefined) {
                stats[status] = log.count;
            }
            totalClasses += log.count;
        });

        const attendanceRate = totalClasses > 0 ? Math.round((stats.present / totalClasses) * 100) : 0;

        // 5. Get Recent Attendance
        const [recentLogs] = await pool.query(`
            SELECT al.status, al.time_in, s.date, c.subject_name
            FROM attendance_logs al
            JOIN sessions s ON al.session_id = s.id
            JOIN classes c ON s.class_id = c.id
            WHERE al.student_id = ?
            ORDER BY al.time_in DESC
            LIMIT 5
        `, [studentStringId]);

        const recentActivity = recentLogs.map(log => ({
            subject: log.subject_name,
            date: new Date(log.time_in).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: true }),
            status: log.status,
            color: log.status.toLowerCase() === 'present' ? 'text-green-600 bg-green-50' :
                log.status.toLowerCase() === 'late' ? 'text-orange-600 bg-orange-50' : 'text-red-600 bg-red-50'
        }));

        res.json({
            nextClass,
            stats: {
                attendanceRate,
                absences: stats.absent
            },
            recentActivity
        });

    } catch (err) {
        console.error("Dashboard Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Get Student Attendance Summary
router.get('/attendance-summary/:id', async (req, res) => {
    try {
        const studentId = req.params.id;

        // Get user's string ID for attendance logs
        const [users] = await pool.query('SELECT id FROM users WHERE id = ?', [studentId]);
        if (users.length === 0) return res.status(404).json({ message: 'Student not found' });

        // Get all attendance logs
        const [logs] = await pool.query(
            'SELECT status FROM attendance_logs WHERE student_id = ?',
            [studentId]
        );

        const presentCount = logs.filter(l => l.status === 'Present').length;
        const lateCount = logs.filter(l => l.status === 'Late').length;
        const totalSessions = logs.length;

        // Get total possible sessions from enrolled classes
        const [sessions] = await pool.query(`
            SELECT COUNT(DISTINCT s.id) as total
            FROM sessions s
            JOIN enrollments e ON s.class_id = e.class_id
            WHERE e.student_id = ?
        `, [studentId]);

        const totalPossibleSessions = sessions[0]?.total || 0;
        const absentCount = totalPossibleSessions - totalSessions;

        const attendanceRate = totalPossibleSessions > 0
            ? ((totalSessions / totalPossibleSessions) * 100).toFixed(1)
            : 0;

        res.json({
            presentCount,
            lateCount,
            absentCount,
            totalSessions: totalPossibleSessions,
            attendedSessions: totalSessions,
            attendanceRate: parseFloat(attendanceRate)
        });
    } catch (err) {
        console.error('Attendance summary error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get Student Recent Activity
router.get('/recent-activity/:id', async (req, res) => {
    try {
        const studentId = req.params.id;
        const limit = parseInt(req.query.limit) || 10;

        const [activities] = await pool.query(`
            SELECT 
                al.status,
                al.time_in,
                al.time_out,
                s.date,
                s.start_time,
                c.subject_name as className,
                c.subject_code
            FROM attendance_logs al
            JOIN sessions s ON al.session_id = s.id
            JOIN classes c ON s.class_id = c.id
            WHERE al.student_id = ?
            ORDER BY al.time_in DESC
            LIMIT ?
        `, [studentId, limit]);

        const formattedActivities = activities.map(act => ({
            className: `${act.subject_code} - ${act.className}`,
            status: act.status,
            date: act.date,
            timeIn: act.time_in,
            timeOut: act.time_out,
            timestamp: new Date(act.time_in).toISOString()
        }));

        res.json(formattedActivities);
    } catch (err) {
        console.error('Recent activity error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
