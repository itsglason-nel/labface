const pool = require('./config/db');

async function testPending() {
    try {
        console.log('Testing Pending Professors Query...');
        const [professors] = await pool.query(`
            SELECT 
                id, user_id, first_name, middle_name, last_name, 
                email, id_photo, created_at, approval_status
            FROM users 
            WHERE role = 'professor' AND approval_status = 'pending'
            ORDER BY created_at DESC
        `);

        console.log(`Found ${professors.length} pending professors.`);
        console.log(JSON.stringify(professors, null, 2));

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

testPending();
