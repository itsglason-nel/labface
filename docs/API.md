LabFace API Documentation

Base URL: http://localhost:5001/api

Authentication (/auth)

Register Student
-   POST /register/student
-   Body:
    
    {
      "studentId": "2023-00001-LQ-0",
      "firstName": "Jane",
      "lastName": "Doe",
      "email": "jane@example.com",
      "course": "BSIT",
      "yearLevel": 1,
      "password": "password123"
    }
    

Register Professor
-   POST /register/professor
-   Body:
    
    {
      "professorId": "PROF-001",
      "firstName": "John",
      "lastName": "Smith",
      "email": "john@example.com",
      "password": "password123"
    }
    

Login
-   POST /login
-   Body:
    
    {
      "userId": "PROF-001",
      "password": "password123"
    }
    
-   Response: Returns JWT token and user object.

Classes (/classes)

Create Class
-   POST /
-   Headers: Authorization: <token> (Recommended)
-   Body:
    
    {
      "subjectCode": "CS101",
      "subjectName": "Intro to CS",
      "professorId": 1,
      "schoolYear": "2023-2024",
      "semester": "1st",
      "section": "BSIT 1-1",
      "schedule": { "day": "Monday", "start": "08:00", "end": "11:00" }
    }
    

List Classes
-   GET /professor/:id
-   Returns list of classes for a professor.

Attendance (/attendance)

Start Session
-   POST /sessions
-   Body:
    
    {
      "classId": 1,
      "date": "2023-11-29",
      "startTime": "08:00",
      "type": "regular"
    }
    

Mark Attendance (AI Internal)
-   POST /mark
-   Body:
    
    {
      "sessionId": 1,
      "studentId": 5,
      "status": "present",
      "snapshotUrl": "http://minio..."
    }
    
