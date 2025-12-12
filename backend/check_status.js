const pool = require('./config/db');

async function checkUserStatus() {
    try {
        console.log('Checking users table columns...');
        const [columns] = await pool.query("SHOW COLUMNS FROM users LIKE 'approval_status'");
        console.log('Approval Status Column:', columns);

        console.log('Fetching recent professors...');
        const [users] = await pool.query("SELECT id, first_name, email, role, approval_status FROM users WHERE role LIKE '%professor%' ORDER BY id DESC LIMIT 5");
        console.log(JSON.stringify(users, null, 2));

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

checkUserStatus();
