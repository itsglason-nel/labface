const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { sendApprovalEmail, sendRejectionEmail } = require('../utils/emailService');

// ... (keep existing middleware and functions)

// ==================== DATA EXPORT ROUTES ====================

/**
 * Export pending professors to CSV
 * GET /api/admin/export/pending-professors/csv
 */
router.get('/export/pending-professors/csv', authenticateToken, requireLabHead, async (req, res) => {
    try {
        const [professors] = await pool.query(`
            SELECT 
                user_id, first_name, middle_name, last_name, 
                email, created_at, approval_status
            FROM users 
            WHERE role = 'professor' AND approval_status = 'pending'
            ORDER BY created_at DESC
        `);

        // Generate CSV
        const csvHeader = 'Professor ID,First Name,Middle Name,Last Name,Email,Registration Date,Status\n';
        const csvRows = professors.map(prof =>
            `"${prof.user_id}","${prof.first_name}","${prof.middle_name || ''}","${prof.last_name}","${prof.email}","${new Date(prof.created_at).toISOString()}","${prof.approval_status}"`
        ).join('\n');

        const csv = csvHeader + csvRows;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="pending-professors-${Date.now()}.csv"`);
        res.send(csv);
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Export all users to CSV
 * GET /api/admin/export/users/csv
 */
router.get('/export/users/csv', authenticateToken, requireLabHead, async (req, res) => {
    try {
        const [users] = await pool.query(`
            SELECT 
                user_id, first_name, middle_name, last_name, 
                email, role, approval_status, created_at
            FROM users 
            ORDER BY created_at DESC
            LIMIT 1000
        `);

        const csvHeader = 'User ID,First Name,Middle Name,Last Name,Email,Role,Status,Registration Date\n';
        const csvRows = users.map(user =>
            `"${user.user_id}","${user.first_name}","${user.middle_name || ''}","${user.last_name}","${user.email}","${user.role}","${user.approval_status}","${new Date(user.created_at).toISOString()}"`
        ).join('\n');

        const csv = csvHeader + csvRows;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="all-users-${Date.now()}.csv"`);
        res.send(csv);
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Export admin actions to CSV
 * GET /api/admin/export/actions/csv
 */
router.get('/export/actions/csv', authenticateToken, requireLabHead, async (req, res) => {
    try {
        const [actions] = await pool.query(`
            SELECT 
                aa.id,
                aa.action_type,
                admin.user_id as admin_id,
                CONCAT(admin.first_name, ' ', admin.last_name) as admin_name,
                target.user_id as target_user_id,
                CONCAT(target.first_name, ' ', target.last_name) as target_name,
                aa.reason,
                aa.created_at
            FROM admin_actions aa
            JOIN users admin ON aa.admin_id = admin.id
            JOIN users target ON aa.target_user_id = target.id
            ORDER BY aa.created_at DESC
            LIMIT 1000
        `);

        const csvHeader = 'ID,Action Type,Admin ID,Admin Name,Target User ID,Target Name,Reason,Date\n';
        const csvRows = actions.map(action =>
            `"${action.id}","${action.action_type}","${action.admin_id}","${action.admin_name}","${action.target_user_id}","${action.target_name}","${action.reason || ''}","${new Date(action.created_at).toISOString()}"`
        ).join('\n');

        const csv = csvHeader + csvRows;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="admin-actions-${Date.now()}.csv"`);
        res.send(csv);
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Export data as JSON
 * GET /api/admin/export/json?type=users|professors|actions
 */
router.get('/export/json', authenticateToken, requireLabHead, async (req, res) => {
    const { type } = req.query;

    try {
        let data;
        let filename;

        switch (type) {
            case 'users':
                [data] = await pool.query(`
                    SELECT user_id, first_name, middle_name, last_name, 
                           email, role, approval_status, created_at
                    FROM users ORDER BY created_at DESC LIMIT 1000
                `);
                filename = `users-${Date.now()}.json`;
                break;

            case 'professors':
                [data] = await pool.query(`
                    SELECT user_id, first_name, middle_name, last_name, 
                           email, approval_status, created_at
                    FROM users 
                    WHERE role = 'professor' AND approval_status = 'pending'
                    ORDER BY created_at DESC
                `);
                filename = `pending-professors-${Date.now()}.json`;
                break;

            case 'actions':
                [data] = await pool.query(`
                    SELECT aa.*, 
                           admin.user_id as admin_user_id,
                           target.user_id as target_user_id
                    FROM admin_actions aa
                    JOIN users admin ON aa.admin_id = admin.id
                    JOIN users target ON aa.target_user_id = target.id
                    ORDER BY aa.created_at DESC LIMIT 1000
                `);
                filename = `admin-actions-${Date.now()}.json`;
                break;

            default:
                return res.status(400).json({ message: 'Invalid export type' });
        }

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.json(data);
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Export statistics summary
 * GET /api/admin/export/stats/json
 */
router.get('/export/stats/json', authenticateToken, requireLabHead, async (req, res) => {
    try {
        const [userStats] = await pool.query(`
            SELECT role, approval_status, COUNT(*) as count
            FROM users GROUP BY role, approval_status
        `);

        const [pendingCount] = await pool.query(`
            SELECT COUNT(*) as count FROM users 
            WHERE role = 'professor' AND approval_status = 'pending'
        `);

        const [recentActions] = await pool.query(`
            SELECT COUNT(*) as count FROM admin_actions 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAYS)
        `);

        const stats = {
            exportDate: new Date().toISOString(),
            userStatistics: userStats,
            pendingProfessors: pendingCount[0].count,
            recentActionsLast7Days: recentActions[0].count
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="stats-${Date.now()}.json"`);
        res.json(stats);
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
