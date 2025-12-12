import cv2
import numpy as np
from rembg import remove
from PIL import Image
import io
import base64

class BackgroundRemover:
    """
    Background removal service for face photos
    Uses rembg library for AI-powered background segmentation
    """
    
    def __init__(self):
        """Initialize the background remover"""
        # rembg will auto-download models on first use
        pass
    
    def remove_background(self, image_bytes: bytes) -> bytes:
        """
        Remove background from image
        
        Args:
            image_bytes: Input image as bytes
            
        Returns:
            bytes: Processed image with transparent background as PNG bytes
        """
        try:
            # Convert bytes to PIL Image
            input_image = Image.open(io.BytesIO(image_bytes))
            
            # Remove background
            output_image = remove(input_image)
            
            # Convert to bytes
            output_buffer = io.BytesIO()
            output_image.save(output_buffer, format='PNG')
            output_bytes = output_buffer.getvalue()
            
            return output_bytes
            
        except Exception as e:
            print(f"Background removal error: {e}")
            raise
    
    def remove_background_base64(self, base64_image: str) -> str:
        """
        Remove background from base64 encoded image
        
        Args:
            base64_image: Base64 encoded image (with or without data URI prefix)
            
        Returns:
            str: Base64 encoded PNG with transparent background
        """
        try:
            # Remove data URI prefix if present
            if ',' in base64_image:
                base64_image = base64_image.split(',')[1]
            
            # Decode base64 to bytes
            image_bytes = base64.b64decode(base64_image)
            
            # Process image
            processed_bytes = self.remove_background(image_bytes)
            
            # Encode back to base64
            processed_base64 = base64.b64encode(processed_bytes).decode('utf-8')
            
            # Add data URI prefix for PNG
            return f"data:image/png;base64,{processed_base64}"
            
        except Exception as e:
            print(f"Base64 background removal error: {e}")
            raise
    
    def remove_background_with_face_crop(self, image_bytes: bytes, padding: float = 0.3) -> bytes:
        """
        Remove background and crop to face region
        
        Args:
            image_bytes: Input image as bytes
            padding: Padding around face bounding box (0.3 = 30% padding)
            
        Returns:
            bytes: Cropped image with transparent background
        """
        try:
            # Convert bytes to numpy array
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            # Detect face using OpenCV
            face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            faces = face_cascade.detectMultiScale(gray, 1.1, 4)
            
            if len(faces) == 0:
                # No face detected, process entire image
                return self.remove_background(image_bytes)
            
            # Get largest face
            largest_face = max(faces, key=lambda f: f[2] * f[3])
            x, y, w, h = largest_face
            
            # Add padding
            pad_w = int(w * padding)
            pad_h = int(h * padding)
            
            x1 = max(0, x - pad_w)
            y1 = max(0, y - pad_h)
            x2 = min(img.shape[1], x + w + pad_w)
            y2 = min(img.shape[0], y + h + pad_h)
            
            # Crop to face region
            cropped = img[y1:y2, x1:x2]
            
            # Convert to PIL Image
            cropped_pil = Image.fromarray(cv2.cvtColor(cropped, cv2.COLOR_BGR2RGB))
            
            # Remove background
            output_image = remove(cropped_pil)
            
            # Convert to bytes
            output_buffer = io.BytesIO()
            output_image.save(output_buffer, format='PNG')
            output_bytes = output_buffer.getvalue()
            
            return output_bytes
            
        except Exception as e:
            print(f"Face crop background removal error: {e}")
            # Fallback to regular background removal
            return self.remove_background(image_bytes)
