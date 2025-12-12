const pool = require('./config/db');
const bcrypt = require('bcryptjs');

async function resetAdminPassword() {
    const email = 'glasonnel.duenasgarganta@gmail.com';
    const newPassword = 'Glason_27';

    try {
        console.log(`Resetting password for: ${email}`);

        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

        if (users.length === 0) {
            console.log('User NOT found.');
            process.exit(1);
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await pool.query('UPDATE users SET admin_password_hash = ? WHERE email = ?', [hashedPassword, email]);

        console.log('Password updated successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

resetAdminPassword();
