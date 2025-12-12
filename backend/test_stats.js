const axios = require('axios');

async function testStats() {
    try {
        console.log('Logging in as admin...');
        const loginRes = await axios.post('http://localhost:5000/api/auth/admin/login', {
            email: 'glasonnel.duenasgarganta@gmail.com',
            password: 'Glason_27'
        });

        const token = loginRes.data.token;
        console.log('Login successful.');

        console.log('Fetching stats...');
        const statsRes = await axios.get('http://localhost:5000/api/admin/stats', {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log('Stats Data Keys:', Object.keys(statsRes.data));
        console.log('Recent Actions Sample:', JSON.stringify(statsRes.data.recentActions?.[0] || 'No actions found', null, 2));
        console.log('User Stats:', JSON.stringify(statsRes.data.userStats, null, 2));

    } catch (err) {
        console.error('Error:', err.message);
        if (err.response) console.error(err.response.data);
    }
}

testStats();
