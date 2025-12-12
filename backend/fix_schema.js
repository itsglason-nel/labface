const pool = require('./config/db');

async function fixSchema() {
    try {
        console.log('Starting schema fix...');

        // Check if columns exist
        const [columns] = await pool.query(`SHOW COLUMNS FROM users LIKE 'professor_password_hash'`);
        if (columns.length > 0) {
            console.log('New columns exist. Ensuring legacy column is nullable...');
        } else {
            console.log('Adding specific password hash columns...');

            // Add new columns
            await pool.query(`
                ALTER TABLE users 
                ADD COLUMN professor_password_hash VARCHAR(255) NULL AFTER email,
                ADD COLUMN student_password_hash VARCHAR(255) NULL AFTER professor_password_hash,
                ADD COLUMN admin_password_hash VARCHAR(255) NULL AFTER student_password_hash
            `);

            console.log('Columns added.');

            // Migrate existing password_hash to the appropriate column based on role
            console.log('Migrating existing passwords...');
            const [users] = await pool.query('SELECT id, role, password_hash FROM users');

            for (const user of users) {
                const roles = user.role ? user.role.split(',').map(r => r.trim()) : [];
                let updateField = null;

                if (roles.includes('admin')) updateField = 'admin_password_hash';
                else if (roles.includes('professor')) updateField = 'professor_password_hash';
                else if (roles.includes('student')) updateField = 'student_password_hash';

                if (updateField && user.password_hash) {
                    await pool.query(`UPDATE users SET ${updateField} = ? WHERE id = ?`, [user.password_hash, user.id]);
                }
            }
            console.log('Data migration complete.');
        }

        // Dropping old column might be risky if code still references it, 
        // but 'authRoutes.js' seems to use specific columns. 
        // Let's keep it for now or make it nullable if it was NOT NULL.
        // init.sql said `password_hash VARCHAR(255) NOT NULL`.
        // We should probably make it NULLable so inserts don't fail for missing password_hash.

        // Always ensure legacy password_hash is nullable
        console.log('Modifying password_hash to be nullable...');
        await pool.query(`ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL`);
        console.log('Made legacy password_hash nullable.');

        console.log('Schema fix successful!');
        process.exit(0);
    } catch (err) {
        console.error('Schema fix failed:', err);
        process.exit(1);
    }
}

fixSchema();
