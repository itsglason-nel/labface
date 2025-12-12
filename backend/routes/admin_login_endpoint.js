// Admin Login Endpoint (separate from regular login)
router.post('/admin/login', async (req, res) => {
    const { email, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    try {
        // Find admin user by email
        const [users] = await pool.query(
            'SELECT * FROM users WHERE email = ? AND role = ?',
            [email, 'admin']
        );

        if (users.length === 0) {
            // Log failed attempt
            await pool.query(
                'INSERT INTO admin_login_logs (email, success, ip_address, user_agent) VALUES (?, ?, ?, ?)',
                [email, false, ipAddress, userAgent]
            );
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const user = users[0];

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            // Log failed attempt
            await pool.query(
                'INSERT INTO admin_login_logs (email, success, ip_address, user_agent) VALUES (?, ?, ?, ?)',
                [email, false, ipAddress, userAgent]
            );
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Log successful login
        await pool.query(
            'INSERT INTO admin_login_logs (email, success, ip_address, user_agent) VALUES (?, ?, ?, ?)',
            [email, true, ipAddress, userAgent]
        );

        // Generate token with shorter expiration for admin
        const token = jwt.sign(
            { id: user.id, role: user.role },
            JWT_SECRET,
            { expiresIn: '4h' } // Shorter session for admin security
        );

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                role: user.role
            }
        });
    } catch (err) {
        console.error('Admin Login Error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
