import requests
import json
import time

# Configuration (Internal Docker Network)
API_URL = "http://backend:5000/api"
AI_SERVICE_URL = "http://localhost:8000" 

def run_test():
    print("Starting End-to-End Test (Internal)...")

    # 1. Register a Professor
    print("\n1. Registering Professor...")
    prof_data = {
        "professorId": "PROF-001",
        "firstName": "John",
        "lastName": "Doe",
        "email": "prof.doe@example.com",
        "password": "password123"
    }
    try:
        res = requests.post(f"{API_URL}/auth/register/professor", json=prof_data)
        print(f"Response: {res.status_code} - {res.json()}")
    except Exception as e:
        print(f"Registration failed (might already exist): {e}")

    # 2. Login as Professor
    print("\n2. Logging in as Professor...")
    login_data = {
        "userId": "PROF-001",
        "password": "password123"
    }
    res = requests.post(f"{API_URL}/auth/login", json=login_data)
    if res.status_code != 200:
        print(f"Login failed! {res.text}")
        return
    
    token = res.json()['token']
    prof_id = res.json()['user']['id']
    print("Login Successful. Token received.")

    # 3. Create a Class
    print("\n3. Creating a Class...")
    class_data = {
        "subjectCode": "CS101",
        "subjectName": "Intro to CS",
        "professorId": prof_id,
        "schoolYear": "2023-2024",
        "semester": "1st",
        "section": "BSIT 1-1",
        "schedule": {"day": "Monday", "start": "08:00", "end": "11:00"}
    }
    headers = {"Authorization": token}
    res = requests.post(f"{API_URL}/classes", json=class_data, headers=headers)
    print(f"Response: {res.status_code} - {res.json()}")

    # Get Class ID
    res = requests.get(f"{API_URL}/classes/professor/{prof_id}")
    classes = res.json()
    if not classes:
        print("No classes found!")
        return
    class_id = classes[0]['id']
    print(f"Class ID: {class_id}")

    # 4. Register a Student
    print("\n4. Registering Student...")
    student_data = {
        "studentId": "2023-00001-LQ-0",
        "firstName": "Jane",
        "lastName": "Smith",
        "email": "jane.smith@example.com",
        "course": "BSIT",
        "yearLevel": "1",
        "password": "password123"
    }
    try:
        requests.post(f"{API_URL}/auth/register/student", json=student_data)
    except:
        pass

    # Get Student ID
    res = requests.post(f"{API_URL}/auth/login", json={"userId": "2023-00001-LQ-0", "password": "password123"})
    student_db_id = res.json()['user']['id']
    print(f"Student DB ID: {student_db_id}")

    # 5. Start a Session
    print("\n5. Starting Class Session...")
    session_data = {
        "classId": class_id,
        "date": "2023-11-29",
        "startTime": "08:00",
        "type": "regular"
    }
    res = requests.post(f"{API_URL}/attendance/sessions", json=session_data)
    session_id = res.json().get('sessionId')
    print(f"Session Started. ID: {session_id}")

    # 6. Simulate AI Service Marking Attendance
    print("\n6. Simulating AI Attendance Mark...")
    # Note: In real flow, AI service calls backend. Here we are simulating the AI service logic calling the backend.
    # But wait, the AI service logic (attendance_logic.py) calls the backend.
    # So we can just call the backend directly here to simulate what the AI service would do.
    attendance_data = {
        "sessionId": session_id,
        "studentId": student_db_id,
        "status": "present",
        "snapshotUrl": "http://minio:9000/labface-snapshots/test.jpg"
    }
    res = requests.post(f"{API_URL}/attendance/mark", json=attendance_data)
    print(f"Response: {res.status_code} - {res.json()}")

    print("\nTest Complete.")

if __name__ == "__main__":
    run_test()
