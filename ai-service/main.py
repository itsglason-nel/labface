from fastapi import FastAPI, UploadFile, File, BackgroundTasks
from core.face_recognition import FaceRecognizer
from core.stream_handler import RTSPStream
import uvicorn
import os

app = FastAPI()
face_recognizer = FaceRecognizer()

# RTSP URLs (from env or hardcoded for now based on SDD)
RTSP_URL_1 = os.getenv("RTSP_URL_1", "rtsp://admin:glason27@192.168.1.15:554/cam/realmonitor?channel=1&subtype=1")
# RTSP_URL_2 = ...

# Global streams
stream1 = None

@app.on_event("startup")
async def startup_event():
    global stream1
    # stream1 = RTSPStream(RTSP_URL_1)
    # stream1.start()
    print("AI Service Started. RTSP Streams initialized (commented out for dev).")

@app.on_event("shutdown")
async def shutdown_event():
    global stream1
    if stream1:
        stream1.stop()

@app.post("/enroll")
async def enroll_face(file: UploadFile = File(...)):
    contents = await file.read()
    embedding = face_recognizer.get_embedding(contents)
    if embedding is None:
        return {"error": "No face detected"}
    return {"embedding": embedding}

@app.get("/")
def read_root():
    return {"message": "LabFace AI Service Running"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
