const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

const API_URL = 'http://localhost:5001'; // Direct to backend

async function testBackend() {
    try {
        console.log("1. Testing Class Creation...");
        const classRes = await axios.post(`${API_URL}/api/classes`, {
            subjectCode: "TEST101",
            subjectName: "Test Subject",
            professorId: "PROF_TEST", // Ensure this user exists or logic handles it? Logic doesn't check FK constraints strictly usually unless DB enforces.
            schoolYear: "2024-2025",
            semester: "1st Semester",
            section: "TEST-SEC",
            schedule: []
        });

        if (classRes.data.classId) {
            console.log("✅ Class Created. ID:", classRes.data.classId);
        } else {
            console.log("❌ Class Creation failed to return ID");
            return;
        }

        const classId = classRes.data.classId;

        console.log("2. Testing Roster Upload...");
        // Create dummy excel
        const XLSX = require('xlsx');
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet([
            { "Student Number": "ST-001", "Name": "Test Student 1" },
            { "Student Number": "ST-002", "Name": "Test Student 2" }
        ]);
        XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        fs.writeFileSync('test_roster.xlsx', buf);

        const form = new FormData();
        form.append('file', fs.createReadStream('test_roster.xlsx'));

        const uploadRes = await axios.post(`${API_URL}/api/classes/${classId}/upload-roster`, form, {
            headers: {
                ...form.getHeaders()
            }
        });
        console.log("✅ Upload Response:", uploadRes.data.message);

        console.log("3. Testing Start Session...");
        const sessionRes = await axios.post(`${API_URL}/api/attendance/sessions`, {
            classId: classId,
            date: "2024-12-07",
            startTime: "08:00",
            type: "regular"
        });
        console.log("✅ Session Started. ID:", sessionRes.data.sessionId);
        const sessionId = sessionRes.data.sessionId;

        console.log("4. Testing Attendance Marking (Directional)...");
        // Mark Entry
        const markEntry = await axios.post(`${API_URL}/api/attendance/mark`, {
            sessionId,
            studentId: 1, // specific ID might fail if not in DB, but let's try
            direction: "ENTRY",
            snapshotUrl: "http://example.com/pic.jpg"
        });
        console.log("✅ Mark Entry Response:", markEntry.data);

        // Mark Exit
        const markExit = await axios.post(`${API_URL}/api/attendance/mark`, {
            sessionId,
            studentId: 1,
            direction: "EXIT",
            snapshotUrl: ""
        });
        console.log("✅ Mark Exit Response:", markExit.data);

    } catch (e) {
        console.error("❌ Test Failed:", e.message);
        if (e.response) console.error("Data:", e.response.data);
    }
}

testBackend();
