import cv2
import time
import threading

class RTSPStream:
    def __init__(self, rtsp_url):
        self.rtsp_url = rtsp_url
        self.cap = None
        self.frame = None
        self.running = False
        self.lock = threading.Lock()

    def start(self):
        self.running = True
        self.thread = threading.Thread(target=self._update)
        self.thread.start()

    def _update(self):
        while self.running:
            if self.cap is None or not self.cap.isOpened():
                self.cap = cv2.VideoCapture(self.rtsp_url)
                if not self.cap.isOpened():
                    print(f"Failed to connect to {self.rtsp_url}. Retrying in 5s...")
                    time.sleep(5)
                    continue

            ret, frame = self.cap.read()
            if not ret:
                print("Frame read failed. Reconnecting...")
                self.cap.release()
                self.cap = None
                continue

            with self.lock:
                self.frame = frame
            
            # Limit frame rate to save CPU
            time.sleep(0.03) 

    def read(self):
        with self.lock:
            return self.frame.copy() if self.frame is not None else None

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join()
        if self.cap:
            self.cap.release()
