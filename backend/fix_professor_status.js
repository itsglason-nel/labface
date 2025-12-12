const pool = require('./config/db');

async function fixProfessorStatus() {
    try {
        console.log('Checking for professors with NULL or empty approval_status...');

        // Check count first
        const [count] = await pool.query(
            "SELECT COUNT(*) as count FROM users WHERE role LIKE '%professor%' AND (approval_status IS NULL OR approval_status = '')"
        );
        console.log(`Found ${count[0].count} professors with missing status.`);

        if (count[0].count > 0) {
            console.log('Updating status to "pending"...');
            const [result] = await pool.query(
                "UPDATE users SET approval_status = 'pending' WHERE role LIKE '%professor%' AND (approval_status IS NULL OR approval_status = '')"
            );
            console.log(`Successfully updated ${result.changedRows} rows.`);
        } else {
            console.log('No rows needed updating.');
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

fixProfessorStatus();
