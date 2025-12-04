import cv2
import numpy as np
import insightface
from insightface.app import FaceAnalysis

class FaceRecognizer:
    def __init__(self):
        # Initialize InsightFace
        # providers=['CUDAExecutionProvider'] if GPU available, else ['CPUExecutionProvider']
        self.app = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider'])
        self.app.prepare(ctx_id=0, det_size=(640, 640))

    def get_embedding(self, image_bytes):
        # Convert bytes to numpy array
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        faces = self.app.get(img)
        if not faces:
            return None
        
        # Return the embedding of the largest face found
        # Sort by bounding box area
        faces = sorted(faces, key=lambda x: (x.bbox[2]-x.bbox[0]) * (x.bbox[3]-x.bbox[1]), reverse=True)
        return faces[0].embedding.tolist()

    def compare_faces(self, known_embedding, new_embedding):
        # Cosine Similarity
        # Compute cosine similarity between two vectors
        vec1 = np.array(known_embedding)
        vec2 = np.array(new_embedding)
        sim = np.dot(vec1, vec2) / (np.linalg.norm(vec1) * np.linalg.norm(vec2))
        return sim
