import requests
import json
import time

BACKEND_URL = "http://backend:5000/api/attendance/mark"

def mark_attendance(student_id, session_id, status, snapshot_url):
    payload = {
        "studentId": student_id,
        "sessionId": session_id,
        "status": status,
        "snapshotUrl": snapshot_url
    }
    try:
        response = requests.post(BACKEND_URL, json=payload)
        if response.status_code == 201:
            print(f"Attendance marked for {student_id}: {status}")
        else:
            print(f"Failed to mark attendance: {response.text}")
    except Exception as e:
        print(f"Error calling backend: {e}")
