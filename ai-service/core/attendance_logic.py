import time

class AttendanceManager:
    def __init__(self, cooldown_seconds=60, movement_threshold=20):
        self.faces = {} # { face_id: { 'history': [], 'last_active': timestamp, 'last_event': timestamp } }
        self.cooldown = cooldown_seconds
        self.threshold = movement_threshold
        self.direction_history_len = 5 # Number of frames to track for direction

    def update(self, face_id, bbox):
        """
        Update tracker with new face bounding box.
        bbox: (x, y, w, h)
        Returns: 'ENTRY', 'EXIT', or None
        """
        now = time.time()
        centroid_x = bbox[0] + bbox[2] // 2
        
        if face_id not in self.faces:
            self.faces[face_id] = {
                'history': [],
                'last_active': now,
                'last_event': 0
            }
        
        data = self.faces[face_id]
        data['last_active'] = now
        data['history'].append(centroid_x)

        # Keep history short
        if len(data['history']) > self.direction_history_len:
            data['history'].pop(0)
        
        # Check cooldown
        if now - data['last_event'] < self.cooldown:
            return None

        # Determine Direction
        if len(data['history']) >= 3:
            start_x = data['history'][0]
            end_x = data['history'][-1]
            diff = end_x - start_x

            # Heuristic: 
            # If camera faces the door from inside:
            # - Moving Left might be Entering? or Exiting?
            # SDD says: 
            # - Channel 1 (Entry): Forward & Left -> PRESENT
            # - Channel 2 (Exit): Forward & Right -> EXIT (Actually usually separate cameras)
            
            # Simplified Logic based on general movement for single camera setup (if applicable)
            # Or strict adherence to SDD triggers if we know which camera it is.
            # Here we return a directional vector/status and let main.py decide based on Camera ID.

            if diff > self.threshold:
                return "RIGHT"
            elif diff < -self.threshold:
                return "LEFT"
        
        return None

    def mark_event(self, face_id):
        self.faces[face_id]['last_event'] = time.time()

    def cleanup(self):
        # Remove old faces to save memory
        now = time.time()
        to_remove = []
        for fid, data in self.faces.items():
            if now - data['last_active'] > 300: # 5 mins inactive
                to_remove.append(fid)
        for fid in to_remove:
            del self.faces[fid]
