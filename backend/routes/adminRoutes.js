const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const { sendApprovalEmail, sendRejectionEmail } = require('../utils/emailService');
const { generate2FASecret, verify2FAToken, generateBackupCodes, hashBackupCodes, verifyBackupCode } = require('../services/twoFactorService');

/**
 * Middleware to check if user is Laboratory Head (admin)
 */
function requireLabHead(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            message: 'Access denied. Laboratory Head authorization required.'
        });
    }
    next();
}

/**
 * Log admin action for audit trail
 */
async function logAdminAction(adminId, actionType, targetUserId, reason = null) {
    try {
        await pool.query(
            'INSERT INTO admin_actions (admin_id, action_type, target_user_id, reason) VALUES (?, ?, ?, ?)',
            [adminId, actionType, targetUserId, reason]
        );
    } catch (error) {
        console.error('Failed to log admin action:', error);
    }
}

// ==================== BULK OPERATIONS ====================

/**
 * Bulk approve professors
 * POST /api/admin/bulk-approve
 */
router.post('/bulk-approve', authenticateToken, requireLabHead, async (req, res) => {
    const { professorIds } = req.body;
    const adminId = req.user.id;

    if (!Array.isArray(professorIds) || professorIds.length === 0) {
        return res.status(400).json({ message: 'Professor IDs array is required' });
    }

    try {
        const results = { approved: [], failed: [] };

        for (const professorId of professorIds) {
            try {
                await pool.query(
                    'UPDATE users SET approval_status = ?, verified_by = ?, verified_at = NOW() WHERE id = ?',
                    ['approved', adminId, professorId]
                );

                const [professor] = await pool.query(
                    'SELECT id, first_name, last_name, email FROM users WHERE id = ?',
                    [professorId]
                );

                if (professor.length > 0) {
                    await pool.query(
                        'INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
                        [professorId, 'Account Approved', 'Your professor account has been approved.']
                    );

                    await logAdminAction(adminId, 'bulk_approve', professorId, 'Bulk approval');

                    try {
                        await sendApprovalEmail(professor[0].email, professor[0].first_name, professor[0].last_name);
                    } catch (emailError) {
                        console.error('Email error:', emailError);
                    }

                    results.approved.push(professorId);
                }
            } catch (error) {
                results.failed.push({ id: professorId, error: error.message });
            }
        }

        res.json({
            message: `Bulk approval: ${results.approved.length} approved, ${results.failed.length} failed.`,
            results
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Bulk reject professors
 * POST /api/admin/bulk-reject
 */
router.post('/bulk-reject', authenticateToken, requireLabHead, async (req, res) => {
    const { professorIds, reason } = req.body;
    const adminId = req.user.id;

    if (!Array.isArray(professorIds) || professorIds.length === 0) {
        return res.status(400).json({ message: 'Professor IDs array is required' });
    }

    try {
        const results = { rejected: [], failed: [] };

        for (const professorId of professorIds) {
            try {
                await pool.query(
                    'UPDATE users SET approval_status = ?, verified_by = ?, verified_at = NOW() WHERE id = ?',
                    ['rejected', adminId, professorId]
                );

                const [professor] = await pool.query(
                    'SELECT id, first_name, last_name, email FROM users WHERE id = ?',
                    [professorId]
                );

                if (professor.length > 0) {
                    await pool.query(
                        'INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
                        [professorId, 'Account Rejected', `Your registration was rejected. ${reason || ''}`]
                    );

                    await logAdminAction(adminId, 'bulk_reject', professorId, reason || 'Bulk rejection');

                    try {
                        await sendRejectionEmail(professor[0].email, professor[0].first_name, professor[0].last_name, reason);
                    } catch (emailError) {
                        console.error('Email error:', emailError);
                    }

                    results.rejected.push(professorId);
                }
            } catch (error) {
                results.failed.push({ id: professorId, error: error.message });
            }
        }

        res.json({
            message: `Bulk rejection: ${results.rejected.length} rejected, ${results.failed.length} failed.`,
            results
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// ==================== PROFESSOR APPROVAL ROUTES ====================

/**
 * Get all pending professor registrations
 * GET /api/admin/pending-professors
 */
router.get('/pending-professors', authenticateToken, requireLabHead, async (req, res) => {
    try {
        const [professors] = await pool.query(`
            SELECT 
                id, user_id, first_name, middle_name, last_name, 
                email, id_photo, created_at
            FROM users 
            WHERE role = 'professor' AND approval_status = 'pending'
            ORDER BY created_at DESC
        `);

        res.json(professors);
    } catch (error) {
        console.error('Error fetching pending professors:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Approve professor registration
 * POST /api/admin/approve-professor/:id
 */
router.post('/approve-professor/:id', authenticateToken, requireLabHead, async (req, res) => {
    const professorId = req.params.id;
    const adminId = req.user.id;

    try {
        // Update professor status to approved
        await pool.query(
            'UPDATE users SET approval_status = ?, verified_by = ?, verified_at = NOW() WHERE id = ?',
            ['approved', adminId, professorId]
        );

        // Get professor details for notification
        const [professor] = await pool.query(
            'SELECT id, first_name, last_name, email FROM users WHERE id = ?',
            [professorId]
        );

        if (professor.length === 0) {
            return res.status(404).json({ message: 'Professor not found' });
        }

        // Create notification for professor
        await pool.query(
            'INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
            [
                professorId,
                'Account Approved',
                'Your professor account has been approved by the Laboratory Head. You can now login and start using LabFace.'
            ]
        );

        // Log admin action
        await logAdminAction(adminId, 'approve', professorId, 'Professor account approved');

        // Send approval email
        try {
            await sendApprovalEmail(professor[0].email, professor[0].first_name, professor[0].last_name);
        } catch (emailError) {
            console.error('Failed to send approval email:', emailError);
            // Don't fail the request if email fails
        }

        res.json({
            message: 'Professor approved successfully',
            professor: professor[0]
        });
    } catch (error) {
        console.error('Error approving professor:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Reject professor registration
 * POST /api/admin/reject-professor/:id
 */
router.post('/reject-professor/:id', authenticateToken, requireLabHead, async (req, res) => {
    const professorId = req.params.id;
    const adminId = req.user.id;
    const { reason } = req.body;

    try {
        // Update professor status to rejected
        await pool.query(
            'UPDATE users SET approval_status = ?, verified_by = ?, verified_at = NOW() WHERE id = ?',
            ['rejected', adminId, professorId]
        );

        // Get professor details
        const [professor] = await pool.query(
            'SELECT id, first_name, last_name, email FROM users WHERE id = ?',
            [professorId]
        );

        if (professor.length === 0) {
            return res.status(404).json({ message: 'Professor not found' });
        }

        // Create notification for professor
        await pool.query(
            'INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
            [
                professorId,
                'Account Rejected',
                `Your professor account registration has been rejected. ${reason ? 'Reason: ' + reason : 'Please contact the Laboratory Head for more information.'}`
            ]
        );

        // Log admin action
        await logAdminAction(adminId, 'reject', professorId, reason || 'Professor account rejected');

        // Send rejection email
        try {
            await sendRejectionEmail(professor[0].email, professor[0].first_name, professor[0].last_name, reason);
        } catch (emailError) {
            console.error('Failed to send rejection email:', emailError);
            // Don't fail the request if email fails
        }

        res.json({
            message: 'Professor rejected successfully',
            professor: professor[0]
        });
    } catch (error) {
        console.error('Error rejecting professor:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== USER MANAGEMENT ROUTES ====================

/**
 * Get all users with filters
 * GET /api/admin/users?role=student&status=approved
 */
router.get('/users', authenticateToken, requireLabHead, async (req, res) => {
    try {
        const { role, status, search } = req.query;

        let query = 'SELECT id, user_id, first_name, middle_name, last_name, email, role, approval_status, created_at FROM users WHERE 1=1';
        const params = [];

        if (role) {
            query += ' AND role = ?';
            params.push(role);
        }

        if (status) {
            query += ' AND approval_status = ?';
            params.push(status);
        }

        if (search) {
            query += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR user_id LIKE ?)';
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern, searchPattern);
        }

        query += ' ORDER BY created_at DESC LIMIT 100';

        const [users] = await pool.query(query, params);
        res.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get user details by ID
 * GET /api/admin/users/:id
 */
router.get('/users/:id', authenticateToken, requireLabHead, async (req, res) => {
    try {
        const [users] = await pool.query(
            'SELECT * FROM users WHERE id = ?',
            [req.params.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Get verification history
        const [verificationLogs] = await pool.query(
            'SELECT * FROM verification_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
            [req.params.id]
        );

        res.json({
            user: users[0],
            verificationHistory: verificationLogs
        });
    } catch (error) {
        console.error('Error fetching user details:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Deactivate user account
 * POST /api/admin/deactivate-user/:id
 */
router.post('/deactivate-user/:id', authenticateToken, requireLabHead, async (req, res) => {
    const userId = req.params.id;
    const adminId = req.user.id;
    const { reason } = req.body;

    try {
        // Prevent admin from deactivating themselves
        if (userId == adminId) {
            return res.status(400).json({ message: 'Cannot deactivate your own account' });
        }

        // Update user status to rejected (effectively deactivated)
        await pool.query(
            'UPDATE users SET approval_status = ? WHERE id = ?',
            ['rejected', userId]
        );

        // Create notification
        await pool.query(
            'INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
            [
                userId,
                'Account Deactivated',
                `Your account has been deactivated. ${reason ? 'Reason: ' + reason : 'Please contact the Laboratory Head for more information.'}`
            ]
        );

        // Log admin action
        await logAdminAction(adminId, 'deactivate', userId, reason || 'User account deactivated');

        res.json({ message: 'User deactivated successfully' });
    } catch (error) {
        console.error('Error deactivating user:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Activate user account
 * POST /api/admin/activate-user/:id
 */
router.post('/activate-user/:id', authenticateToken, requireLabHead, async (req, res) => {
    const userId = req.params.id;
    const adminId = req.user.id;

    try {
        // Update user status to approved
        await pool.query(
            'UPDATE users SET approval_status = ? WHERE id = ?',
            ['approved', userId]
        );

        // Create notification
        await pool.query(
            'INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
            [userId, 'Account Activated', 'Your account has been reactivated. You can now login to LabFace.']
        );

        // Log admin action
        await logAdminAction(adminId, 'activate', userId, 'User account activated');

        res.json({ message: 'User activated successfully' });
    } catch (error) {
        console.error('Error activating user:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== STATISTICS & DASHBOARD ====================

/**
 * Get dashboard statistics
 * GET /api/admin/stats
 */
router.get('/stats', authenticateToken, requireLabHead, async (req, res) => {
    try {
        // Get user counts
        const [userStats] = await pool.query(`
            SELECT 
                role,
                approval_status,
                COUNT(*) as count
            FROM users
            GROUP BY role, approval_status
        `);

        // Get pending professors count
        const [pendingCount] = await pool.query(`
            SELECT COUNT(*) as count 
            FROM users 
            WHERE role = 'professor' AND approval_status = 'pending'
        `);

        // Get recent admin actions
        const [recentActions] = await pool.query(`
            SELECT 
                aa.*,
                admin.first_name as admin_first_name,
                admin.last_name as admin_last_name,
                target.first_name as target_first_name,
                target.last_name as target_last_name
            FROM admin_actions aa
            JOIN users admin ON aa.admin_id = admin.id
            JOIN users target ON aa.target_user_id = target.id
            ORDER BY aa.created_at DESC
            LIMIT 10
        `);

        // Map admin names to match frontend expectations
        const mappedActions = recentActions.map(action => ({
            ...action,
            first_name: action.admin_first_name,
            last_name: action.admin_last_name
        }));

        res.json({
            userStats,
            pendingProfessors: pendingCount[0].count,
            recentActions: mappedActions
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== DATA EXPORT ROUTES ====================

/**
 * Export pending professors to CSV
 */
router.get('/export/pending-professors/csv', authenticateToken, requireLabHead, async (req, res) => {
    try {
        const [professors] = await pool.query(`
            SELECT user_id, first_name, middle_name, last_name, email, created_at, approval_status
            FROM users WHERE role = 'professor' AND approval_status = 'pending'
            ORDER BY created_at DESC
        `);

        const csvHeader = 'Professor ID,First Name,Middle Name,Last Name,Email,Registration Date,Status\n';
        const csvRows = professors.map(prof =>
            `"${prof.user_id}","${prof.first_name}","${prof.middle_name || ''}","${prof.last_name}","${prof.email}","${new Date(prof.created_at).toISOString()}","${prof.approval_status}"`
        ).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="pending-professors-${Date.now()}.csv"`);
        res.send(csvHeader + csvRows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Export all users to CSV
 */
router.get('/export/users/csv', authenticateToken, requireLabHead, async (req, res) => {
    try {
        const [users] = await pool.query(`
            SELECT user_id, first_name, middle_name, last_name, email, role, approval_status, created_at
            FROM users ORDER BY created_at DESC LIMIT 1000
        `);

        const csvHeader = 'User ID,First Name,Middle Name,Last Name,Email,Role,Status,Registration Date\n';
        const csvRows = users.map(user =>
            `"${user.user_id}","${user.first_name}","${user.middle_name || ''}","${user.last_name}","${user.email}","${user.role}","${user.approval_status}","${new Date(user.created_at).toISOString()}"`
        ).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="all-users-${Date.now()}.csv"`);
        res.send(csvHeader + csvRows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Export data as JSON
 */
router.get('/export/json', authenticateToken, requireLabHead, async (req, res) => {
    const { type } = req.query;
    try {
        let data, filename;

        if (type === 'users') {
            [data] = await pool.query('SELECT user_id, first_name, last_name, email, role, approval_status, created_at FROM users ORDER BY created_at DESC LIMIT 1000');
            filename = `users-${Date.now()}.json`;
        } else if (type === 'professors') {
            [data] = await pool.query('SELECT user_id, first_name, last_name, email, created_at FROM users WHERE role = "professor" AND approval_status = "pending"');
            filename = `pending-professors-${Date.now()}.json`;
        } else {
            return res.status(400).json({ message: 'Invalid type' });
        }

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== TWO-FACTOR AUTHENTICATION ROUTES ====================

/**
 * Setup 2FA - Generate QR code
 * POST /api/admin/2fa/setup
 */
router.post('/2fa/setup', authenticateToken, requireLabHead, async (req, res) => {
    try {
        const userId = req.user.id;
        const [users] = await pool.query('SELECT email, two_factor_enabled FROM users WHERE id = ?', [userId]);

        if (users.length === 0) return res.status(404).json({ message: 'User not found' });
        if (users[0].two_factor_enabled) {
            return res.status(400).json({ message: '2FA is already enabled' });
        }

        const { secret, qrCode } = await generate2FASecret(users[0].email);
        const backupCodes = generateBackupCodes(10);
        const hashedCodes = hashBackupCodes(backupCodes);

        await pool.query(
            'UPDATE users SET two_factor_secret = ?, two_factor_backup_codes = ? WHERE id = ?',
            [secret, hashedCodes, userId]
        );

        await pool.query(
            'INSERT INTO two_factor_logs (user_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)',
            [userId, 'setup_initiated', req.ip, req.get('user-agent')]
        );

        res.json({ qrCode, secret, backupCodes });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Enable 2FA
 * POST /api/admin/2fa/enable
 */
router.post('/2fa/enable', authenticateToken, requireLabHead, async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: 'Verification code required' });

    try {
        const [users] = await pool.query(
            'SELECT two_factor_secret, two_factor_enabled FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) return res.status(404).json({ message: 'User not found' });
        if (!users[0].two_factor_secret) return res.status(400).json({ message: 'Setup 2FA first' });
        if (users[0].two_factor_enabled) return res.status(400).json({ message: '2FA already enabled' });

        const isValid = verify2FAToken(token, users[0].two_factor_secret);
        if (!isValid) {
            await pool.query(
                'INSERT INTO two_factor_logs (user_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)',
                [req.user.id, 'enable_failed', req.ip, req.get('user-agent')]
            );
            return res.status(400).json({ message: 'Invalid code' });
        }

        await pool.query('UPDATE users SET two_factor_enabled = TRUE WHERE id = ?', [req.user.id]);
        await pool.query(
            'INSERT INTO two_factor_logs (user_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)',
            [req.user.id, 'enabled', req.ip, req.get('user-agent')]
        );

        res.json({ message: '2FA enabled successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Verify 2FA code
 * POST /api/admin/2fa/verify
 */
router.post('/2fa/verify', authenticateToken, async (req, res) => {
    const { token, backupCode } = req.body;

    try {
        const [users] = await pool.query(
            'SELECT two_factor_secret, two_factor_enabled, two_factor_backup_codes FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) return res.status(404).json({ message: 'User not found' });
        if (!users[0].two_factor_enabled) return res.status(400).json({ message: '2FA not enabled' });

        let isValid = false;
        if (token) isValid = verify2FAToken(token, users[0].two_factor_secret);

        if (!isValid && backupCode && users[0].two_factor_backup_codes) {
            const result = verifyBackupCode(backupCode, users[0].two_factor_backup_codes);
            isValid = result.valid;
            if (isValid) {
                await pool.query(
                    'UPDATE users SET two_factor_backup_codes = ? WHERE id = ?',
                    [result.remainingCodes, req.user.id]
                );
            }
        }

        if (!isValid) {
            await pool.query(
                'INSERT INTO two_factor_logs (user_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)',
                [req.user.id, 'verification_failed', req.ip, req.get('user-agent')]
            );
            return res.status(400).json({ message: 'Invalid code' });
        }

        await pool.query(
            'INSERT INTO two_factor_logs (user_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)',
            [req.user.id, 'verified', req.ip, req.get('user-agent')]
        );

        res.json({ message: '2FA verified', verified: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Disable 2FA
 * POST /api/admin/2fa/disable
 */
router.post('/2fa/disable', authenticateToken, requireLabHead, async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: 'Verification code required' });

    try {
        const [users] = await pool.query(
            'SELECT two_factor_secret, two_factor_enabled FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) return res.status(404).json({ message: 'User not found' });
        if (!users[0].two_factor_enabled) return res.status(400).json({ message: '2FA not enabled' });

        const isValid = verify2FAToken(token, users[0].two_factor_secret);
        if (!isValid) return res.status(400).json({ message: 'Invalid code' });

        await pool.query(
            'UPDATE users SET two_factor_enabled = FALSE, two_factor_secret = NULL, two_factor_backup_codes = NULL WHERE id = ?',
            [req.user.id]
        );

        await pool.query(
            'INSERT INTO two_factor_logs (user_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)',
            [req.user.id, 'disabled', req.ip, req.get('user-agent')]
        );

        res.json({ message: '2FA disabled' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get 2FA status
 * GET /api/admin/2fa/status
 */
router.get('/2fa/status', authenticateToken, requireLabHead, async (req, res) => {
    try {
        const [users] = await pool.query(
            'SELECT two_factor_enabled FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) return res.status(404).json({ message: 'User not found' });
        res.json({ enabled: users[0].two_factor_enabled || false });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== ANALYTICS ROUTES ====================

/**
 * Get registration trends
 */
router.get('/analytics/registration-trends', authenticateToken, requireLabHead, async (req, res) => {
    const days = parseInt(req.query.days) || 30;
    try {
        const [trends] = await pool.query(`
            SELECT DATE(created_at) as date, role, COUNT(*) as count
            FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY DATE(created_at), role ORDER BY date ASC
        `, [days]);
        res.json(trends);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get approval statistics
 */
router.get('/analytics/approval-stats', authenticateToken, requireLabHead, async (req, res) => {
    try {
        const [overallStats] = await pool.query(`
            SELECT approval_status, COUNT(*) as count
            FROM users WHERE role = 'professor' GROUP BY approval_status
        `);

        const [monthlyTrends] = await pool.query(`
            SELECT DATE_FORMAT(verified_at, '%Y-%m') as month, approval_status, COUNT(*) as count
            FROM users WHERE role = 'professor' AND verified_at IS NOT NULL
            GROUP BY month, approval_status ORDER BY month DESC LIMIT 12
        `);

        const [avgTime] = await pool.query(`
            SELECT AVG(TIMESTAMPDIFF(HOUR, created_at, verified_at)) as avg_hours
            FROM users WHERE role = 'professor' AND approval_status = 'approved' AND verified_at IS NOT NULL
        `);

        res.json({ overall: overallStats, monthly: monthlyTrends, averageApprovalTime: avgTime[0]?.avg_hours || 0 });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get admin activity stats
 */
router.get('/analytics/admin-activity', authenticateToken, requireLabHead, async (req, res) => {
    const days = parseInt(req.query.days) || 30;
    try {
        const [actionsByType] = await pool.query(`
            SELECT action_type, COUNT(*) as count FROM admin_actions
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) GROUP BY action_type
        `, [days]);

        const [dailyActivity] = await pool.query(`
            SELECT DATE(created_at) as date, COUNT(*) as count FROM admin_actions
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) GROUP BY DATE(created_at) ORDER BY date ASC
        `, [days]);

        res.json({ byType: actionsByType, daily: dailyActivity });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get comprehensive dashboard analytics
 */
router.get('/analytics/dashboard', authenticateToken, requireLabHead, async (req, res) => {
    try {
        const [metrics] = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM users WHERE role = 'student') as total_students,
                (SELECT COUNT(*) FROM users WHERE role = 'professor') as total_professors,
                (SELECT COUNT(*) FROM users WHERE role = 'professor' AND approval_status = 'pending') as pending_professors,
                (SELECT COUNT(*) FROM users WHERE role = 'professor' AND approval_status = 'approved') as approved_professors,
                (SELECT COUNT(*) FROM admin_actions WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) as actions_last_7_days,
                (SELECT COUNT(*) FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) as registrations_last_7_days
        `);

        const [growth] = await pool.query(`
            SELECT DATE_FORMAT(created_at, '%Y-%m') as month, role, COUNT(*) as count
            FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
            GROUP BY month, role ORDER BY month ASC
        `);

        res.json({ metrics: metrics[0], growth });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== SESSION MANAGEMENT ROUTES ====================

/**
 * Get my active sessions
 */
router.get('/sessions/my-sessions', authenticateToken, requireLabHead, async (req, res) => {
    try {
        const [sessions] = await pool.query(`
            SELECT id, session_token, ip_address, user_agent, device_info, location, login_time, last_activity, expires_at
            FROM active_sessions WHERE user_id = ? AND is_active = TRUE ORDER BY last_activity DESC
        `, [req.user.id]);
        res.json(sessions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get all active admin sessions
 */
router.get('/sessions/all', authenticateToken, requireLabHead, async (req, res) => {
    try {
        const [sessions] = await pool.query(`
            SELECT s.id, s.user_id, s.ip_address, s.user_agent, s.login_time, s.last_activity,
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
 * Force logout session
 */
router.post('/sessions/force-logout/:sessionId', authenticateToken, requireLabHead, async (req, res) => {
    const { sessionId } = req.params;
    const { reason } = req.body;
    try {
        const [session] = await pool.query('SELECT user_id FROM active_sessions WHERE id = ?', [sessionId]);
        if (session.length === 0) return res.status(404).json({ message: 'Session not found' });

        await pool.query('UPDATE active_sessions SET is_active = FALSE WHERE id = ?', [sessionId]);
        await pool.query(
            'INSERT INTO session_logs (user_id, session_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
            [session[0].user_id, sessionId, 'force_logout', req.ip, req.get('user-agent')]
        );
        await pool.query(
            'INSERT INTO admin_actions (admin_id, action_type, target_user_id, reason) VALUES (?, ?, ?, ?)',
            [req.user.id, 'force_logout', session[0].user_id, reason || 'Suspicious activity']
        );

        res.json({ message: 'Session terminated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Cleanup expired sessions
 */
router.post('/sessions/cleanup', authenticateToken, requireLabHead, async (req, res) => {
    try {
        const [expired] = await pool.query('SELECT id, user_id FROM active_sessions WHERE expires_at < NOW() AND is_active = TRUE');
        await pool.query('UPDATE active_sessions SET is_active = FALSE WHERE expires_at < NOW() AND is_active = TRUE');

        for (const session of expired) {
            await pool.query('INSERT INTO session_logs (user_id, session_id, action) VALUES (?, ?, ?)',
                [session.user_id, session.id, 'expired']);
        }

        res.json({ message: 'Cleanup completed', expiredCount: expired.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get session statistics
 */
router.get('/sessions/stats', authenticateToken, requireLabHead, async (req, res) => {
    try {
        const [stats] = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM active_sessions WHERE is_active = TRUE) as active_sessions,
                (SELECT COUNT(DISTINCT user_id) FROM active_sessions WHERE is_active = TRUE) as active_users,
                (SELECT COUNT(*) FROM session_logs WHERE action = 'login' AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) as logins_24h
        `);

        const [recentActivity] = await pool.query(`
            SELECT sl.action, sl.ip_address, sl.created_at, u.email, u.first_name, u.last_name
            FROM session_logs sl JOIN users u ON sl.user_id = u.id
            ORDER BY sl.created_at DESC LIMIT 20
        `);

        res.json({ stats: stats[0], recentActivity });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
