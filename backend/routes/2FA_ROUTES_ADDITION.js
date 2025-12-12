// Add these 2FA routes to adminRoutes.js
// Insert after the export routes and before module.exports

const { generate2FASecret, verify2FAToken, generateBackupCodes, hashBackupCodes, verifyBackupCode } = require('../services/twoFactorService');

// ==================== TWO-FACTOR AUTHENTICATION ROUTES ====================

/**
 * Setup 2FA - Generate QR code
 * POST /api/admin/2fa/setup
 */
router.post('/2fa/setup', authenticateToken, requireLabHead, async (req, res) => {
    try {
        const userId = req.user.id;

        // Get user email
        const [users] = await pool.query('SELECT email, two_factor_enabled FROM users WHERE id = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = users[0];

        // Check if 2FA is already enabled
        if (user.two_factor_enabled) {
            return res.status(400).json({ message: '2FA is already enabled. Disable it first to re-setup.' });
        }

        // Generate secret and QR code
        const { secret, qrCode } = await generate2FASecret(user.email);

        // Generate backup codes
        const backupCodes = generateBackupCodes(10);
        const hashedCodes = hashBackupCodes(backupCodes);

        // Store secret temporarily (not enabled yet)
        await pool.query(
            'UPDATE users SET two_factor_secret = ?, two_factor_backup_codes = ? WHERE id = ?',
            [secret, hashedCodes, userId]
        );

        // Log setup initiation
        await pool.query(
            'INSERT INTO two_factor_logs (user_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)',
            [userId, 'setup_initiated', req.ip, req.get('user-agent')]
        );

        res.json({
            qrCode,
            secret, // Send to frontend for manual entry if QR fails
            backupCodes // Show once, user must save these
        });
    } catch (error) {
        console.error('2FA setup error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Enable 2FA - Verify and activate
 * POST /api/admin/2fa/enable
 */
router.post('/2fa/enable', authenticateToken, requireLabHead, async (req, res) => {
    const { token } = req.body;
    const userId = req.user.id;

    if (!token) {
        return res.status(400).json({ message: 'Verification code is required' });
    }

    try {
        // Get user's secret
        const [users] = await pool.query(
            'SELECT two_factor_secret, two_factor_enabled FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = users[0];

        if (!user.two_factor_secret) {
            return res.status(400).json({ message: 'Please setup 2FA first' });
        }

        if (user.two_factor_enabled) {
            return res.status(400).json({ message: '2FA is already enabled' });
        }

        // Verify token
        const isValid = verify2FAToken(token, user.two_factor_secret);
        if (!isValid) {
            await pool.query(
                'INSERT INTO two_factor_logs (user_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)',
                [userId, 'enable_failed', req.ip, req.get('user-agent')]
            );
            return res.status(400).json({ message: 'Invalid verification code' });
        }

        // Enable 2FA
        await pool.query(
            'UPDATE users SET two_factor_enabled = TRUE WHERE id = ?',
            [userId]
        );

        // Log successful enable
        await pool.query(
            'INSERT INTO two_factor_logs (user_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)',
            [userId, 'enabled', req.ip, req.get('user-agent')]
        );

        res.json({ message: '2FA enabled successfully' });
    } catch (error) {
        console.error('2FA enable error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Verify 2FA code during login
 * POST /api/admin/2fa/verify
 */
router.post('/2fa/verify', authenticateToken, async (req, res) => {
    const { token, backupCode } = req.body;
    const userId = req.user.id;

    try {
        const [users] = await pool.query(
            'SELECT two_factor_secret, two_factor_enabled, two_factor_backup_codes FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = users[0];

        if (!user.two_factor_enabled) {
            return res.status(400).json({ message: '2FA is not enabled' });
        }

        let isValid = false;

        // Try regular token first
        if (token) {
            isValid = verify2FAToken(token, user.two_factor_secret);
        }

        // Try backup code if token failed
        if (!isValid && backupCode && user.two_factor_backup_codes) {
            const result = verifyBackupCode(backupCode, user.two_factor_backup_codes);
            isValid = result.valid;

            if (isValid) {
                // Update remaining backup codes
                await pool.query(
                    'UPDATE users SET two_factor_backup_codes = ? WHERE id = ?',
                    [result.remainingCodes, userId]
                );
            }
        }

        if (!isValid) {
            await pool.query(
                'INSERT INTO two_factor_logs (user_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)',
                [userId, 'verification_failed', req.ip, req.get('user-agent')]
            );
            return res.status(400).json({ message: 'Invalid code' });
        }

        // Log successful verification
        await pool.query(
            'INSERT INTO two_factor_logs (user_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)',
            [userId, 'verified', req.ip, req.get('user-agent')]
        );

        res.json({ message: '2FA verified successfully', verified: true });
    } catch (error) {
        console.error('2FA verify error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Disable 2FA
 * POST /api/admin/2fa/disable
 */
router.post('/2fa/disable', authenticateToken, requireLabHead, async (req, res) => {
    const { token } = req.body;
    const userId = req.user.id;

    if (!token) {
        return res.status(400).json({ message: 'Verification code is required to disable 2FA' });
    }

    try {
        const [users] = await pool.query(
            'SELECT two_factor_secret, two_factor_enabled FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = users[0];

        if (!user.two_factor_enabled) {
            return res.status(400).json({ message: '2FA is not enabled' });
        }

        // Verify token before disabling
        const isValid = verify2FAToken(token, user.two_factor_secret);
        if (!isValid) {
            return res.status(400).json({ message: 'Invalid verification code' });
        }

        // Disable 2FA and clear secrets
        await pool.query(
            'UPDATE users SET two_factor_enabled = FALSE, two_factor_secret = NULL, two_factor_backup_codes = NULL WHERE id = ?',
            [userId]
        );

        // Log disable
        await pool.query(
            'INSERT INTO two_factor_logs (user_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)',
            [userId, 'disabled', req.ip, req.get('user-agent')]
        );

        res.json({ message: '2FA disabled successfully' });
    } catch (error) {
        console.error('2FA disable error:', error);
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

        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({ enabled: users[0].two_factor_enabled || false });
    } catch (error) {
        console.error('2FA status error:', error);
        res.status(500).json({ error: error.message });
    }
});
