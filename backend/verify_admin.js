const pool = require('./config/db');
const bcrypt = require('bcryptjs');

async function verifyAdmin() {
    const email = 'glasonnel.duenasgarganta@gmail.com';
    const password = 'Glason_27';

    try {
        console.log(`Checking user: ${email}`);

        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

        if (users.length === 0) {
            console.log('User NOT found.');
            process.exit(0);
        }

        const user = users[0];
        console.log(`User ID: ${user.user_id}`);
        console.log(`Roles: ${user.role}`);

        const roles = user.role ? user.role.split(',').map(r => r.trim()) : [];
        const isAdmin = roles.includes('admin');
        console.log(`Is Admin Role Present: ${isAdmin}`);

        if (isAdmin) {
            if (!user.admin_password_hash) {
                console.log('Admin password hash is NULL.');
            } else {
                const isMatch = await bcrypt.compare(password, user.admin_password_hash);
                console.log(`Password 'Glason_27' matches admin_password_hash: ${isMatch}`);
            }
        } else {
            console.log('User does NOT have admin role.');
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

verifyAdmin();
