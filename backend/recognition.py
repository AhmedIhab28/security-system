"""
AI recognition engine — only active when opencv and face_recognition are installed.
On the cloud server these are not installed (too large).
Camera processing runs on the local Windows machine only.
"""
import os
import pickle
from datetime import datetime
from pathlib import Path

SNAPSHOTS_DIR = Path("snapshots")
SNAPSHOTS_DIR.mkdir(exist_ok=True)

# Try to import heavy libs — they are optional
try:
    import cv2
    import numpy as np
    import face_recognition
    from ultralytics import YOLO
    AI_AVAILABLE = True
except ImportError:
    AI_AVAILABLE = False
    print("[Recognition] AI libs not installed — camera processing disabled on this server.")

_yolo_model = None


def get_yolo():
    global _yolo_model
    if _yolo_model is None:
        from ultralytics import YOLO
        _yolo_model = YOLO("yolov8n.pt")
    return _yolo_model


def encode_face_from_bytes(image_bytes: bytes) -> bytes | None:
    if not AI_AVAILABLE:
        return None
    import numpy as np
    import cv2
    import face_recognition
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    encodings = face_recognition.face_encodings(rgb)
    if not encodings:
        return None
    return pickle.dumps(encodings[0])


def match_face(unknown_encoding_bytes: bytes, known_persons: list) -> tuple:
    if not AI_AVAILABLE:
        return None, 0.0
    import face_recognition
    unknown_enc = pickle.loads(unknown_encoding_bytes)
    best_id = None
    best_conf = 0.0
    for person_id, enc_bytes in known_persons:
        if enc_bytes is None:
            continue
        known_enc = pickle.loads(enc_bytes)
        distance = face_recognition.face_distance([known_enc], unknown_enc)[0]
        confidence = 1.0 - distance
        if confidence > 0.55 and confidence > best_conf:
            best_conf = confidence
            best_id = person_id
    return best_id, best_conf


def analyze_frame(frame, known_persons: list) -> dict:
    if not AI_AVAILABLE:
        return {"faces": [], "vehicles": []}
    import cv2
    import face_recognition
    import pickle
    results = {"faces": [], "vehicles": []}
    model = get_yolo()
    detections = model(frame, verbose=False)[0]
    for box in detections.boxes:
        cls = int(box.cls[0])
        label = model.names[cls]
        conf = float(box.conf[0])
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        if label == "person" and conf > 0.5:
            crop = frame[y1:y2, x1:x2]
            rgb_crop = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
            face_encs = face_recognition.face_encodings(rgb_crop)
            if face_encs:
                enc_bytes = pickle.dumps(face_encs[0])
                person_id, face_conf = match_face(enc_bytes, known_persons)
                results["faces"].append({
                    "bbox": [x1, y1, x2, y2],
                    "person_id": person_id,
                    "confidence": face_conf,
                    "is_unknown": person_id is None,
                })
        elif label in ("car", "truck", "bus", "motorcycle") and conf > 0.5:
            results["vehicles"].append({
                "bbox": [x1, y1, x2, y2],
                "type": label,
                "confidence": conf,
            })
    return results


def save_snapshot(frame, camera_id: int) -> str:
    import cv2
    from datetime import datetime
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
    path = SNAPSHOTS_DIR / f"cam{camera_id}_{ts}.jpg"
    cv2.imwrite(str(path), frame)
    return str(path)
