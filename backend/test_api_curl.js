const axios = require('axios');

async function testApi() {
    try {
        console.log('Logging in as admin...');
        const loginRes = await axios.post('http://localhost:5000/api/auth/admin/login', {
            email: 'glasonnel.duenasgarganta@gmail.com',
            password: 'Glason_27'
        });

        const token = loginRes.data.token;
        console.log('Login successful. Token obtained.');

        console.log('Fetching pending professors...');
        const pendingRes = await axios.get('http://localhost:5000/api/admin/pending-professors', {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log('Response status:', pendingRes.status);
        console.log('Data:', JSON.stringify(pendingRes.data, null, 2));

    } catch (err) {
        if (err.response) {
            console.error('Error status:', err.response.status);
            console.error('Error data:', err.response.data);
        } else {
            console.error('Error:', err.message);
        }
    }
}

testApi();
