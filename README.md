LabFace - Web-Based CCTV Face Recognition System

LabFace is a comprehensive attendance monitoring system designed for the PUP Lopez Campus Computer Laboratory. It leverages AI-powered face recognition to automatically mark student attendance using CCTV streams.

🚀 Tech Stack

-   Frontend: Next.js (React), Tailwind CSS
-   Backend: Node.js, Express.js
-   AI Service: Python, FastAPI, InsightFace, OpenCV
-   Database: MariaDB (MySQL compatible)
-   Storage: MinIO (S3 compatible object storage)
-   Infrastructure: Docker & Docker Compose

📋 Prerequisites

-   Docker Desktop (https://www.docker.com/products/docker-desktop/) installed and running.
-   Git (optional, for cloning).

🛠️ Installation & Setup

1.  Clone the Repository (if applicable) or navigate to the project directory.
    
    cd c:/Users/John Lloyd/Capstone/LabFace
    

2.  Environment Variables
    The project comes with a default .env file. You can modify it if needed, but the defaults work out of the box for local development.
    -   DB_ROOT_PASSWORD: rootpassword
    -   DB_NAME: labface
    -   MINIO_ACCESS_KEY: minioadmin
    -   MINIO_SECRET_KEY: minioadmin

▶️ How to Run

1.  Start the Services
    Run the following command to build and start all containers:
    
    docker-compose up -d --build
    
    Note: The first run might take a few minutes to download images and build dependencies.

2.  Verify Status
    Check if all containers are running:
    
    docker ps
    
    You should see labface-frontend, labface-backend, labface-ai-service, labface-mariadb, and labface-minio.

🌐 Accessing the Application

Service | URL | Description
--- | --- | ---
Frontend | http://localhost:3001 | Main User Interface (Student/Professor)
Backend API | http://localhost:5001 | REST API Endpoints
AI Service | Internal Only | Handles Face Recognition
MinIO Console | http://localhost:9003 | Object Storage Admin

🔑 Default Credentials

MinIO Object Storage
-   Username: minioadmin
-   Password: minioadmin

MariaDB Database
-   Username: root
-   Password: rootpassword
-   Database Name: labface

Sample Users (Created by Test Script)
-   Professor Login:
    -   User ID: PROF-001
    -   Password: password123
-   Student Login:
    -   User ID: 2023-00001-LQ-0
    -   Password: password123

🧪 Service Verification

You can verify the status of each service using the following methods:

1. Frontend
   - URL: http://localhost:3001
   - Check: Open in browser. You should see the Landing Page.

2. Backend API
   - URL: http://localhost:5001
   - Check: Open in browser. You should see "LabFace Backend API is running".

3. AI Service
   - URL: Internal Only (http://ai-service:8000)
   - Check: Run `docker logs labface-ai-service-1`. You should see "AI Service Started".

4. MinIO Object Storage
   - Console: http://localhost:9003
   - Check: Login with credentials (minioadmin/minioadmin). You should see `labface-profiles` and `labface-snapshots` buckets.

5. MariaDB Database
   - Check: Run `docker exec -it labface-mariadb-1 mariadb -u root -p` (Enter password: rootpassword).
   - Run SQL: `SHOW DATABASES;` to see `labface`.

6. Create Buckets Utility
   - Check: Run `docker logs labface-createbuckets-1`.
   - Expected Output: It should run commands to create buckets and then exit with code 0. This is normal behavior.

🧪 Testing

To verify the system is working correctly, you can run the integration test script. This simulates a full flow: Register Professor -> Create Class -> Register Student -> Start Session -> AI Marks Attendance.


# Run the test script inside the AI Service container
docker exec labface-ai-service-1 python tests/test_flow.py


📂 Project Structure

-   frontend/: Next.js application source code.
-   backend/: Node.js Express API source code.
-   ai-service/: Python FastAPI computer vision logic.
-   docker-compose.yml: Orchestration configuration.
-   docs/: Detailed documentation.

👥 Developers
-   Glason Nel Dueñas Garganta
-   John Lloyd S. Manzanero
-   Ashley Marie Paraiso Avila
-   Jayricko A. Ocampo
