# CCTV Face Recognition Test

## Purpose
This script tests the CCTV camera connection and face recognition using reference photos.

## Setup Instructions

### 1. Add Reference Photos
Place your test photos in the `reference_photos/` folder:
```
ai-service/
├── test_cctv_recognition.py
└── reference_photos/
    ├── John.jpg
    ├── Jane.png
    ├── Person1.jpg
    ├── Person2.jpg
    └── Person3.jpg
```

**Important:**
- Use clear, front-facing photos
- Supported formats: `.jpg`, `.jpeg`, `.png`, `.bmp`
- Name files with the person's name (e.g., `John.jpg`)
- The script will use the filename (without extension) as the person's name

### 2. Run the Test

**Option 1: Run directly in ai-service container**
```bash
docker-compose exec ai-service python test_cctv_recognition.py
```

**Option 2: Run locally (if you have Python with required packages)**
```bash
cd ai-service
python test_cctv_recognition.py
```

### 3. What to Expect
- The script will connect to your CCTV camera at `rtsp://admin:glason27@192.168.1.15:554`
- It will load all photos from `reference_photos/`
- A window will open showing the live camera feed
- Detected faces will have:
  - **Green box** = Recognized person (with name and confidence %)
  - **Red box** = Unknown person
- Press **'q'** to quit

## Troubleshooting

**"No photos found"**
- Make sure you've added photos to `ai-service/reference_photos/`

**"Could not connect to CCTV camera"**
- Check camera IP address and credentials
- Verify network connection
- Test RTSP URL in VLC media player first

**"No face found in: [filename]"**
- The photo doesn't contain a detectable face
- Try using a clearer, front-facing photo
