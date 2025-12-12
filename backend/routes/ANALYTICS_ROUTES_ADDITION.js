// Add these analytics routes to adminRoutes.js
// Insert before module.exports

// ==================== ANALYTICS ROUTES ====================

/**
 * Get registration trends
 * GET /api/admin/analytics/registration-trends?days=30
 */
router.get('/analytics/registration-trends', authenticateToken, requireLabHead, async (req, res) => {
    const days = parseInt(req.query.days) || 30;

    try {
        const [trends] = await pool.query(`
            SELECT 
                DATE(created_at) as date,
                role,
                COUNT(*) as count
            FROM users
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY DATE(created_at), role
            ORDER BY date ASC
        `, [days]);

        res.json(trends);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get approval statistics
 * GET /api/admin/analytics/approval-stats
 */
router.get('/analytics/approval-stats', authenticateToken, requireLabHead, async (req, res) => {
    try {
        // Overall approval stats
        const [overallStats] = await pool.query(`
            SELECT 
                approval_status,
                COUNT(*) as count
            FROM users
            WHERE role = 'professor'
            GROUP BY approval_status
        `);

        // Monthly approval trends
        const [monthlyTrends] = await pool.query(`
            SELECT 
                DATE_FORMAT(verified_at, '%Y-%m') as month,
                approval_status,
                COUNT(*) as count
            FROM users
            WHERE role = 'professor' AND verified_at IS NOT NULL
            GROUP BY month, approval_status
            ORDER BY month DESC
            LIMIT 12
        `);

        // Average approval time
        const [avgTime] = await pool.query(`
            SELECT 
                AVG(TIMESTAMPDIFF(HOUR, created_at, verified_at)) as avg_hours
            FROM users
            WHERE role = 'professor' 
            AND approval_status = 'approved'
            AND verified_at IS NOT NULL
        `);

        res.json({
            overall: overallStats,
            monthly: monthlyTrends,
            averageApprovalTime: avgTime[0]?.avg_hours || 0
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get admin activity stats
 * GET /api/admin/analytics/admin-activity?days=30
 */
router.get('/analytics/admin-activity', authenticateToken, requireLabHead, async (req, res) => {
    const days = parseInt(req.query.days) || 30;

    try {
        // Actions by type
        const [actionsByType] = await pool.query(`
            SELECT 
                action_type,
                COUNT(*) as count
            FROM admin_actions
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY action_type
        `, [days]);

        // Daily activity
        const [dailyActivity] = await pool.query(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as count
            FROM admin_actions
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `, [days]);

        // Most active hours
        const [hourlyActivity] = await pool.query(`
            SELECT 
                HOUR(created_at) as hour,
                COUNT(*) as count
            FROM admin_actions
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY hour
            ORDER BY hour ASC
        `, [days]);

        res.json({
            byType: actionsByType,
            daily: dailyActivity,
            hourly: hourlyActivity
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get verification statistics
 * GET /api/admin/analytics/verification-stats
 */
router.get('/analytics/verification-stats', authenticateToken, requireLabHead, async (req, res) => {
    try {
        // Student verification success rate
        const [studentStats] = await pool.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN approval_status = 'approved' THEN 1 ELSE 0 END) as approved,
                SUM(CASE WHEN approval_status = 'rejected' THEN 1 ELSE 0 END) as rejected
            FROM users
            WHERE role = 'student'
        `);

        // OCR verification logs
        const [ocrStats] = await pool.query(`
            SELECT 
                verification_status,
                COUNT(*) as count
            FROM verification_logs
            GROUP BY verification_status
        `);

        // Recent verification activity
        const [recentActivity] = await pool.query(`
            SELECT 
                DATE(created_at) as date,
                verification_status,
                COUNT(*) as count
            FROM verification_logs
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY date, verification_status
            ORDER BY date DESC
        `);

        res.json({
            students: studentStats[0],
            ocr: ocrStats,
            recent: recentActivity
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get comprehensive dashboard analytics
 * GET /api/admin/analytics/dashboard
 */
router.get('/analytics/dashboard', authenticateToken, requireLabHead, async (req, res) => {
    try {
        // Key metrics
        const [metrics] = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM users WHERE role = 'student') as total_students,
                (SELECT COUNT(*) FROM users WHERE role = 'professor') as total_professors,
                (SELECT COUNT(*) FROM users WHERE role = 'professor' AND approval_status = 'pending') as pending_professors,
                (SELECT COUNT(*) FROM users WHERE role = 'professor' AND approval_status = 'approved') as approved_professors,
                (SELECT COUNT(*) FROM users WHERE role = 'professor' AND approval_status = 'rejected') as rejected_professors,
                (SELECT COUNT(*) FROM admin_actions WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) as actions_last_7_days,
                (SELECT COUNT(*) FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) as registrations_last_7_days
        `);

        // Growth trends (last 6 months)
        const [growth] = await pool.query(`
            SELECT 
                DATE_FORMAT(created_at, '%Y-%m') as month,
                role,
                COUNT(*) as count
            FROM users
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
            GROUP BY month, role
            ORDER BY month ASC
        `);

        res.json({
            metrics: metrics[0],
            growth
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
