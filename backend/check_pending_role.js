const pool = require('./config/db');

async function checkRole() {
    try {
        const [users] = await pool.query("SELECT id, email, role, approval_status FROM users WHERE approval_status = 'pending'");
        console.log(JSON.stringify(users, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
checkRole();
