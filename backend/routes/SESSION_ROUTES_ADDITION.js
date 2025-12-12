// Add these session management routes to adminRoutes.js
// Insert before module.exports

// ==================== SESSION MANAGEMENT ROUTES ====================

/**
 * Get all active sessions for current admin
 * GET /api/admin/sessions/my-sessions
 */
router.get('/sessions/my-sessions', authenticateToken, requireLabHead, async (req, res) => {
    try {
        const [sessions] = await pool.query(`
            SELECT 
                id, session_token, ip_address, user_agent, device_info, 
                location, login_time, last_activity, expires_at
            FROM active_sessions
            WHERE user_id = ? AND is_active = TRUE
            ORDER BY last_activity DESC
        `, [req.user.id]);

        res.json(sessions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get all active admin sessions (for monitoring)
 * GET /api/admin/sessions/all
 */
router.get('/sessions/all', authenticateToken, requireLabHead, async (req, res) => {
    try {
        const [sessions] = await pool.query(`
            SELECT 
                s.id, s.user_id, s.session_token, s.ip_address, s.user_agent,
                s.device_info, s.location, s.login_time, s.last_activity, s.expires_at,
                u.email, u.first_name, u.last_name
            FROM active_sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.is_active = TRUE AND u.role = 'admin'
            ORDER BY s.last_activity DESC
        `);

        res.json(sessions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Force logout a specific session
 * POST /api/admin/sessions/force-logout/:sessionId
 */
router.post('/sessions/force-logout/:sessionId', authenticateToken, requireLabHead, async (req, res) => {
    const { sessionId } = req.params;
    const { reason } = req.body;

    try {
        // Get session details before deleting
        const [session] = await pool.query(
            'SELECT user_id, session_token FROM active_sessions WHERE id = ?',
            [sessionId]
        );

        if (session.length === 0) {
            return res.status(404).json({ message: 'Session not found' });
        }

        // Deactivate session
        await pool.query(
            'UPDATE active_sessions SET is_active = FALSE WHERE id = ?',
            [sessionId]
        );

        // Log the force logout
        await pool.query(
            'INSERT INTO session_logs (user_id, session_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
            [session[0].user_id, sessionId, 'force_logout', req.ip, req.get('user-agent')]
        );

        // Log admin action
        await pool.query(
            'INSERT INTO admin_actions (admin_id, action_type, target_user_id, reason) VALUES (?, ?, ?, ?)',
            [req.user.id, 'force_logout', session[0].user_id, reason || 'Suspicious activity']
        );

        res.json({ message: 'Session terminated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Logout current session
 * POST /api/admin/sessions/logout
 */
router.post('/sessions/logout', authenticateToken, async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (token) {
            // Deactivate current session
            await pool.query(
                'UPDATE active_sessions SET is_active = FALSE WHERE session_token = ?',
                [token]
            );

            // Log logout
            await pool.query(
                'INSERT INTO session_logs (user_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)',
                [req.user.id, 'logout', req.ip, req.get('user-agent')]
            );
        }

        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Clean up expired sessions
 * POST /api/admin/sessions/cleanup
 */
router.post('/sessions/cleanup', authenticateToken, requireLabHead, async (req, res) => {
    try {
        // Get expired sessions
        const [expired] = await pool.query(
            'SELECT id, user_id FROM active_sessions WHERE expires_at < NOW() AND is_active = TRUE'
        );

        // Deactivate expired sessions
        await pool.query(
            'UPDATE active_sessions SET is_active = FALSE WHERE expires_at < NOW() AND is_active = TRUE'
        );

        // Log expired sessions
        for (const session of expired) {
            await pool.query(
                'INSERT INTO session_logs (user_id, session_id, action) VALUES (?, ?, ?)',
                [session.user_id, session.id, 'expired']
            );
        }

        res.json({
            message: 'Cleanup completed',
            expiredCount: expired.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get session statistics
 * GET /api/admin/sessions/stats
 */
router.get('/sessions/stats', authenticateToken, requireLabHead, async (req, res) => {
    try {
        const [stats] = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM active_sessions WHERE is_active = TRUE) as active_sessions,
                (SELECT COUNT(DISTINCT user_id) FROM active_sessions WHERE is_active = TRUE) as active_users,
                (SELECT COUNT(*) FROM session_logs WHERE action = 'login' AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) as logins_24h,
                (SELECT COUNT(*) FROM session_logs WHERE action = 'force_logout' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) as forced_logouts_7d
        `);

        // Recent activity
        const [recentActivity] = await pool.query(`
            SELECT 
                sl.action, sl.ip_address, sl.created_at,
                u.email, u.first_name, u.last_name
            FROM session_logs sl
            JOIN users u ON sl.user_id = u.id
            ORDER BY sl.created_at DESC
            LIMIT 20
        `);

        res.json({
            stats: stats[0],
            recentActivity
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
