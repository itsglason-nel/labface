const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { sendApprovalEmail, sendRejectionEmail, sendLabHeadNotification } = require('../utils/emailService');

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
        const results = {
            approved: [],
            failed: []
        };

        for (const professorId of professorIds) {
            try {
                // Update professor status
                await pool.query(
                    'UPDATE users SET approval_status = ?, verified_by = ?, verified_at = NOW() WHERE id = ?',
                    ['approved', adminId, professorId]
                );

                // Get professor details
                const [professor] = await pool.query(
                    'SELECT id, first_name, last_name, email FROM users WHERE id = ?',
                    [professorId]
                );

                if (professor.length > 0) {
                    // Create notification
                    await pool.query(
                        'INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
                        [professorId, 'Account Approved', 'Your professor account has been approved by the Laboratory Head.']
                    );

                    // Log action
                    await logAdminAction(adminId, 'bulk_approve', professorId, 'Bulk approval');

                    // Send email
                    try {
                        await sendApprovalEmail(professor[0].email, professor[0].first_name, professor[0].last_name);
                    } catch (emailError) {
                        console.error('Failed to send approval email:', emailError);
                    }

                    results.approved.push(professorId);
                }
            } catch (error) {
                console.error(`Failed to approve professor ${professorId}:`, error);
                results.failed.push({ id: professorId, error: error.message });
            }
        }

        res.json({
            message: `Bulk approval completed. ${results.approved.length} approved, ${results.failed.length} failed.`,
            results
        });
    } catch (error) {
        console.error('Bulk approve error:', error);
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
        const results = {
            rejected: [],
            failed: []
        };

        for (const professorId of professorIds) {
            try {
                // Update professor status
                await pool.query(
                    'UPDATE users SET approval_status = ?, verified_by = ?, verified_at = NOW() WHERE id = ?',
                    ['rejected', adminId, professorId]
                );

                // Get professor details
                const [professor] = await pool.query(
                    'SELECT id, first_name, last_name, email FROM users WHERE id = ?',
                    [professorId]
                );

                if (professor.length > 0) {
                    // Create notification
                    await pool.query(
                        'INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
                        [professorId, 'Account Rejected', `Your professor account registration has been rejected. ${reason || ''}`]
                    );

                    // Log action
                    await logAdminAction(adminId, 'bulk_reject', professorId, reason || 'Bulk rejection');

                    // Send email
                    try {
                        await sendRejectionEmail(professor[0].email, professor[0].first_name, professor[0].last_name, reason);
                    } catch (emailError) {
                        console.error('Failed to send rejection email:', emailError);
                    }

                    results.rejected.push(professorId);
                }
            } catch (error) {
                console.error(`Failed to reject professor ${professorId}:`, error);
                results.failed.push({ id: professorId, error: error.message });
            }
        }

        res.json({
            message: `Bulk rejection completed. ${results.rejected.length} rejected, ${results.failed.length} failed.`,
            results
        });
    } catch (error) {
        console.error('Bulk reject error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ... (keep all existing routes)

module.exports = router;
