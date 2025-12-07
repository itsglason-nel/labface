from fastapi import FastAPI, UploadFile, File, BackgroundTasks
from fastapi.responses import StreamingResponse
import io
from core.face_recognition import FaceRecognizer
from core.attendance_logic import AttendanceManager
import uvicorn
import os
import cv2
import requests
import asyncio
import numpy as np
import aiomysql
import json
from datetime import datetime
from minio import Minio
from minio.error import S3Error

app = FastAPI()
face_recognizer = None
attendance_manager = None
db_pool = None
minio_client = None

# Configuration
RTSP_URL_1 = os.getenv("RTSP_URL_1", "rtsp://admin:glason27@192.168.1.15:554/cam/realmonitor?channel=1&subtype=1")
RTSP_URL_2 = os.getenv("RTSP_URL_2", "rtsp://admin:glason27@192.168.1.15:554/cam/realmonitor?channel=2&subtype=1")

print(f"RTSP 1: {RTSP_URL_1}")
print(f"RTSP 2: {RTSP_URL_2}")

BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:5000")
DB_HOST = os.getenv("DB_HOST", "mariadb")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "root")
DB_NAME = os.getenv("DB_NAME", "labface")

# Recognition threshold
FACE_THRESHOLD = float(os.getenv("FACE_RECOGNITION_THRESHOLD", "0.6"))

should_run = True
latest_frames = {}

# Database connection pool
async def init_db_pool():
    global db_pool
    db_pool = await aiomysql.create_pool(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
        db=DB_NAME,
        autocommit=True,
        maxsize=10
    )
    print("Database pool initialized")

# MinIO client
def init_minio():
    global minio_client
    try:
        minio_client = Minio(
            os.getenv("MINIO_ENDPOINT", "minio:9000"),
            access_key=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
            secret_key=os.getenv("MINIO_SECRET_KEY", "minioadmin"),
            secure=False
        )
        
        # Ensure bucket exists
        if not minio_client.bucket_exists("labface"):
            minio_client.make_bucket("labface")
        
        print("MinIO client initialized")
    except Exception as e:
        print(f"MinIO initialization error: {e}")

async def load_models():
    global face_recognizer, attendance_manager
    print("Loading AI Models...")
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _init_models)
    print("AI Models Loaded Successfully!")

def _init_models():
    global face_recognizer, attendance_manager
    face_recognizer = FaceRecognizer()
    attendance_manager = AttendanceManager()

# Database helper functions
async def get_all_students_with_embeddings():
    """Fetch all students with face embeddings from database"""
    async with db_pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            await cursor.execute(
                "SELECT id, student_id, first_name, last_name, face_embedding "
                "FROM users WHERE role = 'student' AND face_embedding IS NOT NULL"
            )
            result = await cursor.fetchall()
            return result

async def get_active_session_for_student(student_id):
    """Get active session where student is enrolled"""
    async with db_pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            # Find active sessions for classes where student is enrolled
            await cursor.execute("""
                SELECT s.id, s.class_id, s.type, s.batch_students
                FROM sessions s
                JOIN enrollments e ON s.class_id = e.class_id
                WHERE e.student_id = ?
                AND s.end_time IS NULL
                ORDER BY s.start_time DESC
                LIMIT 1
            """, (student_id,))
            session = await cursor.fetchone()
            
            if not session:
                return None
            
            # Check if batch session
            if session['type'] == 'batch' and session['batch_students']:
                batch_students = json.loads(session['batch_students'])
                if student_id not in batch_students:
                    return None  # Student not in this batch
            
            return session

async def save_snapshot_to_minio(face_crop, student_id, session_id):
    """Save face snapshot to MinIO"""
    if not minio_client:
        return None
    
    try:
        # Encode image as JPEG
        _, buffer = cv2.imencode('.jpg', face_crop, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        image_bytes = io.BytesIO(buffer.tobytes())
        
        # Generate filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        filename = f"attendance/{session_id}/{student_id}_{timestamp}.jpg"
        
        # Upload to MinIO
        minio_client.put_object(
            "labface",
            filename,
            image_bytes,
            length=len(buffer),
            content_type="image/jpeg"
        )
        
        # Return URL
        return f"/minio/labface/{filename}"
    except Exception as e:
        print(f"MinIO upload error: {e}")
        return None

async def mark_attendance_api(session_id, student_id, direction, snapshot_url):
    """Call backend API to mark attendance"""
    try:
        response = requests.post(
            f"{BACKEND_URL}/api/attendance/mark",
            json={
                "sessionId": session_id,
                "studentId": student_id,
                "direction": direction,
                "snapshotUrl": snapshot_url
            },
            timeout=5
        )
        
        if response.status_code in [200, 201]:
            print(f"✓ Attendance marked: Student {student_id}, {direction}")
            return True
        else:
            print(f"✗ Attendance marking failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"✗ Attendance API error: {e}")
        return False

def determine_action(camera_id, direction):
    """Map camera + direction to attendance action"""
    if camera_id == 1 and direction == "LEFT":
        return "ENTRY"
    elif camera_id == 2 and direction == "RIGHT":
        return "EXIT"
    return None

async def handle_attendance_event(student_id, direction, camera_id, frame, bbox):
    """Handle detected attendance event"""
    action = determine_action(camera_id, direction)
    
    if not action:
        return
    
    # Get active session
    session = await get_active_session_for_student(student_id)
    
    if not session:
        print(f"No active session for student {student_id}")
        return
    
    # Crop face from frame
    x, y, w, h = bbox
    face_crop = frame[max(0, y):min(frame.shape[0], y+h), max(0, x):min(frame.shape[1], x+w)]
    
    if face_crop.size == 0:
        print("Invalid face crop")
        return
    
    # Save snapshot
    snapshot_url = await save_snapshot_to_minio(face_crop, student_id, session['id'])
    
    # Mark attendance
    success = await mark_attendance_api(session['id'], student_id, action, snapshot_url)
    
    if success:
        # Update cooldown
        attendance_manager.mark_event(student_id)

async def process_stream(rtsp_url, camera_id):
    """Process RTSP stream with face recognition"""
    print(f"Starting stream processing for Camera {camera_id}...")
    
    cap = cv2.VideoCapture(rtsp_url)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    
    frame_count = 0
    process_every_n_frames = 3  # Process every 3rd frame to reduce CPU load
    
    # Cache students embeddings (refresh every 5 minutes)
    students_cache = []
    last_cache_update = 0
    cache_ttl = 300  # 5 minutes
    
    while should_run:
        if not cap.isOpened():
            print(f"Camera {camera_id} failed to connect. Retrying in 10s...")
            await asyncio.sleep(10)
            cap = cv2.VideoCapture(rtsp_url)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            continue
        
        ret, frame = cap.read()
        if not ret:
            print(f"Failed to read frame from Camera {camera_id}")
            cap.release()
            await asyncio.sleep(1)
            cap = cv2.VideoCapture(rtsp_url)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            continue
        
        # Resize frame
        try:
            frame = cv2.resize(frame, (1280, 720))
        except Exception:
            pass
        
        # Store latest frame for streaming
        latest_frames[camera_id] = frame.copy()
        
        frame_count += 1
        
        # Process every Nth frame
        if frame_count % process_every_n_frames != 0:
            await asyncio.sleep(0.001)
            continue
        
        # Skip if models not loaded
        if face_recognizer is None or db_pool is None:
            await asyncio.sleep(0.1)
            continue
        
        # Refresh students cache
        current_time = asyncio.get_event_loop().time()
        if current_time - last_cache_update > cache_ttl:
            try:
                students_cache = await get_all_students_with_embeddings()
                last_cache_update = current_time
                print(f"Refreshed students cache: {len(students_cache)} students")
            except Exception as e:
                print(f"Cache refresh error: {e}")
        
        # Detect faces
        try:
            faces = face_recognizer.app.get(frame)
        except Exception as e:
            print(f"Face detection error: {e}")
            await asyncio.sleep(0.001)
            continue
        
        # Process each detected face
        for face in faces:
            try:
                # Get embedding
                embedding = face.embedding.tolist()
                
                # Find best match
                best_match = None
                best_score = 0.0
                
                for student in students_cache:
                    if student['face_embedding']:
                        try:
                            known_emb = json.loads(student['face_embedding'])
                            score = face_recognizer.compare_faces(known_emb, embedding)
                            
                            if score > FACE_THRESHOLD and score > best_score:
                                best_score = score
                                best_match = student
                        except Exception:
                            continue
                
                if best_match:
                    # Track movement
                    bbox = face.bbox.astype(int)
                    direction = attendance_manager.update(best_match['id'], bbox)
                    
                    if direction:
                        print(f"Detected: {best_match['first_name']} {best_match['last_name']} - {direction} (Score: {best_score:.2f})")
                        await handle_attendance_event(
                            best_match['id'],
                            direction,
                            camera_id,
                            frame,
                            bbox
                        )
            except Exception as e:
                print(f"Face processing error: {e}")
                continue
        
        # Cleanup old tracking data
        if frame_count % 300 == 0:  # Every ~10 seconds
            attendance_manager.cleanup()
        
        await asyncio.sleep(0.001)
    
    cap.release()

@app.on_event("startup")
async def startup_event():
    global should_run
    should_run = True
    
    # Initialize components
    await init_db_pool()
    init_minio()
    asyncio.create_task(load_models())
    
    # Start stream processing
    asyncio.create_task(process_stream(RTSP_URL_1, 1))
    asyncio.create_task(process_stream(RTSP_URL_2, 2))
    print("Background RTSP tasks initialized.")

@app.on_event("shutdown")
async def shutdown_event():
    global should_run, db_pool
    should_run = False
    
    if db_pool:
        db_pool.close()
        await db_pool.wait_closed()

@app.post("/generate-embedding")
async def generate_embedding(file: UploadFile = File(...)):
    """Generate face embedding from uploaded image"""
    if face_recognizer is None:
        return {"error": "System is initializing models, please try again in a few moments."}
    
    try:
        contents = await file.read()
        embedding = face_recognizer.get_embedding(contents)
        
        if embedding is None:
            return {"error": "No face detected in image"}
        
        return {"embedding": embedding, "dimensions": len(embedding)}
    except Exception as e:
        return {"error": str(e)}

@app.post("/enroll")
async def enroll_face(file: UploadFile = File(...)):
    """Legacy endpoint - redirects to generate-embedding"""
    return await generate_embedding(file)

@app.get("/")
def read_root():
    return {
        "message": "LabFace AI Service Running v2.0",
        "features": ["Face Recognition", "RTSP Streaming", "Auto Attendance"],
        "threshold": FACE_THRESHOLD
    }

@app.get("/video_feed/{camera_id}")
async def video_feed(camera_id: int):
    """Stream video feed from camera"""
    return StreamingResponse(
        generate_frames(camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

def generate_frames(camera_id):
    """Generate MJPEG frames for streaming"""
    import time
    
    placeholder = np.zeros((720, 1280, 3), dtype=np.uint8)
    cv2.putText(placeholder, f"CAM {camera_id} Connecting...", (400, 360),
                cv2.FONT_HERSHEY_SIMPLEX, 1.5, (255, 255, 255), 3)
    _, placeholder_bytes = cv2.imencode('.jpg', placeholder)
    placeholder_frame = b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + placeholder_bytes.tobytes() + b'\r\n'
    
    while True:
        if camera_id in latest_frames and latest_frames[camera_id] is not None:
            ret, buffer = cv2.imencode('.jpg', latest_frames[camera_id],
                                      [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            if ret:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
                time.sleep(0.016)  # ~60 FPS
        else:
            yield placeholder_frame
            time.sleep(1.0)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
