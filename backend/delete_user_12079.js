const pool = require('./config/db');

async function removeUser() {
    try {
        const userId = '12079';
        // Check first
        const [users] = await pool.query("SELECT * FROM users WHERE user_id = ?", [userId]);

        if (users.length === 0) {
            console.log(`User ${userId} not found.`);
            process.exit(0);
        }

        const user = users[0];
        console.log(`Found user: ${user.first_name} ${user.last_name} (ID: ${user.user_id})`);

        // Perform delete
        const [result] = await pool.query("DELETE FROM users WHERE user_id = ?", [userId]);
        console.log(`Deleted user ${userId}. Rows affected: ${result.affectedRows}`);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

removeUser();
