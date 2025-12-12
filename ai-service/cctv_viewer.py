import argparse
import threading
import time
import cv2
import face_recognition
import numpy as np
import os
from datetime import datetime
import tkinter as tk
from PIL import Image, ImageTk


def load_reference_photos(photos_folder):
    """Load and encode reference photos from folder. Returns (encodings, names)."""
    known_face_encodings = []
    known_face_names = []

    if not photos_folder or not os.path.exists(photos_folder):
        print(f"Reference photos folder not found: {photos_folder}")
        return known_face_encodings, known_face_names

    valid_extensions = ('.jpg', '.jpeg', '.png', '.bmp')
    photo_files = [f for f in os.listdir(photos_folder) if f.lower().endswith(valid_extensions)]
    if len(photo_files) == 0:
        print(f"No photos found in {photos_folder}")
        return known_face_encodings, known_face_names

    print(f"Found {len(photo_files)} reference photo(s) in {photos_folder}; encoding...")
    for filename in photo_files:
        filepath = os.path.join(photos_folder, filename)
        image = face_recognition.load_image_file(filepath)
        encs = face_recognition.face_encodings(image)
        if len(encs) > 0:
            known_face_encodings.append(encs[0])
            name = os.path.splitext(filename)[0]
            known_face_names.append(name)
            print(f"Loaded: {name}")
        else:
            print(f"No face found in {filename}")

    return known_face_encodings, known_face_names


class CCTVViewer:
    def __init__(self, rtsp_url, window_title="CCTV Viewer", width=None, height=None,
                 known_face_encodings=None, known_face_names=None,
                 process_every=2, tolerance=0.6, verbose=False):
        self.rtsp_url = rtsp_url
        self.window_title = window_title
        self.width = width
        self.height = height
        # Face recognition data
        self.known_face_encodings = known_face_encodings or []
        self.known_face_names = known_face_names or []
        self.process_every = process_every
        self.tolerance = tolerance
        self.verbose = verbose
        self._process_counter = 0

        self.cap = None
        self.root = None
        self.label = None
        self.stop_event = threading.Event()
        self.frame_lock = threading.Lock()
        self.latest_frame = None
        self.capture_thread = None

    def start_capture(self):
        self.cap = cv2.VideoCapture(self.rtsp_url)
        if not self.cap.isOpened():
            print("Error: Could not open RTSP stream:", self.rtsp_url)
            return False

        # Start background thread to read frames continuously
        self.capture_thread = threading.Thread(target=self._capture_loop, daemon=True)
        self.capture_thread.start()
        return True

    def _capture_loop(self):
        while not self.stop_event.is_set():
            ret, frame = self.cap.read()
            if not ret:
                # Sleep briefly and retry
                time.sleep(0.1)
                continue

            # Optionally resize to requested size for display performance
            if self.width and self.height:
                frame = cv2.resize(frame, (self.width, self.height))
            # Draw timestamp
            ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cv2.putText(frame, ts, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

            # Face recognition processing every Nth frame
            self._process_counter += 1
            face_names = []
            face_locations = []
            if len(self.known_face_encodings) > 0 and (self._process_counter % self.process_every) == 0:
                # Resize for faster face processing
                small_frame = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)
                # Convert BGR to RGB for face_recognition
                rgb_small_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)

                # Find faces and encodings
                face_locations = face_recognition.face_locations(rgb_small_frame)
                face_encodings = face_recognition.face_encodings(rgb_small_frame, face_locations)

                for face_encoding in face_encodings:
                    matches = face_recognition.compare_faces(self.known_face_encodings, face_encoding, tolerance=self.tolerance)
                    name = "Unknown"

                    face_distances = face_recognition.face_distance(self.known_face_encodings, face_encoding)
                    if len(face_distances) > 0:
                        best_match_index = np.argmin(face_distances)
                        if matches[best_match_index]:
                            name = f"{self.known_face_names[best_match_index]} ({(1 - face_distances[best_match_index]) * 100:.1f}%)"

                    face_names.append(name)

                if self.verbose:
                    print(f"[{ts}] Detected {len(face_locations)} face(s); matches: {', '.join(face_names) if face_names else '(none)'}")

            # Draw recognition results (scale coordinates back up)
            for (top, right, bottom, left), name in zip(face_locations, face_names):
                top *= 4
                right *= 4
                bottom *= 4
                left *= 4

                # Choose color
                if "Unknown" in name:
                    box_color = (0, 0, 255)
                else:
                    box_color = (0, 255, 0)

                # Draw rectangle around face
                cv2.rectangle(frame, (left, top), (right, bottom), box_color, 2)

                # Draw a filled circle at the face center as a clear indicator
                center_x = int((left + right) / 2)
                center_y = int((top + bottom) / 2)
                cv2.circle(frame, (center_x, center_y), 10, box_color, thickness=-1)

                # Draw label background below the face box
                label_y_top = bottom - 35
                cv2.rectangle(frame, (left, label_y_top), (right, bottom), box_color, cv2.FILLED)

                # Put the name centered horizontally under the face box
                font = cv2.FONT_HERSHEY_DUPLEX
                text = name
                (text_w, text_h), _ = cv2.getTextSize(text, font, 0.6, 1)
                text_x = center_x - int(text_w / 2)
                text_y = bottom - 6
                # Ensure text is inside image bounds
                text_x = max(left + 6, text_x)
                cv2.putText(frame, text, (text_x, text_y), font, 0.6, (255, 255, 255), 1)

            with self.frame_lock:
                self.latest_frame = frame

            # Small sleep to avoid pegging CPU
            time.sleep(0.01)

    def start_ui(self):
        self.root = tk.Tk()
        self.root.title(self.window_title)

        # Create label to hold video frames
        self.label = tk.Label(self.root)
        self.label.pack()

        # Register close handler
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

        # Kick off periodic UI update
        self._update_frame()
        self.root.mainloop()

    def _update_frame(self):
        frame = None
        with self.frame_lock:
            if self.latest_frame is not None:
                frame = self.latest_frame.copy()

        if frame is not None:
            # Convert BGR (OpenCV) to RGB (PIL)
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            img = Image.fromarray(rgb)
            imgtk = ImageTk.PhotoImage(image=img)
            # Keep reference to image to avoid garbage collection
            self.label.imgtk = imgtk
            self.label.configure(image=imgtk)

        # Schedule next update
        if self.root and not self.stop_event.is_set():
            self.root.after(30, self._update_frame)

    def _on_close(self):
        self.stop()

    def stop(self):
        # Signal background thread to stop
        self.stop_event.set()

        # Wait briefly for thread to join
        if self.capture_thread and self.capture_thread.is_alive():
            self.capture_thread.join(timeout=1.0)

        try:
            if self.cap:
                self.cap.release()
        except Exception:
            pass

        # Destroy UI if running
        try:
            if self.root:
                self.root.quit()
                self.root.destroy()
        except Exception:
            pass


def main():
    parser = argparse.ArgumentParser(description="Simple CCTV viewer window using Tkinter")
    parser.add_argument("rtsp_url", nargs="?",
                        default="rtsp://admin:glason27@192.168.1.15:554/cam/realmonitor?channel=1&subtype=1",
                        help="RTSP URL for the CCTV camera")
    parser.add_argument("--width", type=int, help="Resize width for display (optional)")
    parser.add_argument("--height", type=int, help="Resize height for display (optional)")
    parser.add_argument("--photos-folder", default="reference_photos", help="Folder with reference photos for recognition")
    parser.add_argument("--tolerance", type=float, default=0.6, help="Face recognition tolerance (lower = stricter)")
    parser.add_argument("--process-every", type=int, default=2, help="Process every Nth frame for recognition")

    args = parser.parse_args()

    known_encodings, known_names = load_reference_photos(args.photos_folder)

    viewer = CCTVViewer(args.rtsp_url, width=args.width, height=args.height,
                        known_face_encodings=known_encodings, known_face_names=known_names,
                        process_every=args.process_every, tolerance=args.tolerance)

    ok = viewer.start_capture()
    if not ok:
        return

    # Start UI (blocks until window closed)
    viewer.start_ui()


if __name__ == "__main__":
    main()
