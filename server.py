import base64
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision
from mediapipe.tasks.python.vision import HandLandmarkerOptions, HandLandmarker, RunningMode
from flask import Flask, render_template, request, jsonify
import os

# --- Initialize MediaPipe Hand Landmarker (Tasks API for 0.10+) ---
MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hand_landmarker.task")

base_options = mp_python.BaseOptions(model_asset_path=MODEL_PATH)
options = HandLandmarkerOptions(
    base_options=base_options,
    running_mode=RunningMode.IMAGE,
    num_hands=1,
    min_hand_detection_confidence=0.7,
    min_hand_presence_confidence=0.7,
    min_tracking_confidence=0.5,
)
detector = HandLandmarker.create_from_options(options)

def get_gesture(landmarks, frame_w, frame_h):
    """Classify gesture from normalized landmark list."""
    def px(lm):
        return int(lm.x * frame_w), int(lm.y * frame_h)

    thumb_tip   = px(landmarks[4])
    index_tip   = px(landmarks[8])
    index_base  = px(landmarks[6])
    middle_tip  = px(landmarks[12])
    middle_base = px(landmarks[10])
    ring_tip    = px(landmarks[16])
    ring_base   = px(landmarks[14])
    pinky_tip   = px(landmarks[20])
    pinky_base  = px(landmarks[18])

    # YES gesture (Thumb up)
    if thumb_tip[1] < index_base[1]:
        return "YES"
    # HELLO gesture (open hand)
    elif (index_tip[1] < index_base[1] and
          middle_tip[1] < middle_base[1] and
          ring_tip[1] < ring_base[1] and
          pinky_tip[1] < pinky_base[1]):
        return "HELLO"
    # NO gesture (fist)
    elif (index_tip[1] > index_base[1] and
          middle_tip[1] > middle_base[1]):
        return "NO"

    return "Unknown"


def draw_landmarks_on_frame(frame, landmark_list):
    """Draw dots and connections on the frame."""
    HAND_CONNECTIONS = [
        (0,1),(1,2),(2,3),(3,4),
        (0,5),(5,6),(6,7),(7,8),
        (0,9),(9,10),(10,11),(11,12),
        (0,13),(13,14),(14,15),(15,16),
        (0,17),(17,18),(18,19),(19,20),
        (5,9),(9,13),(13,17)
    ]
    h, w = frame.shape[:2]
    pts = [(int(lm.x * w), int(lm.y * h)) for lm in landmark_list]
    for start_idx, end_idx in HAND_CONNECTIONS:
        cv2.line(frame, pts[start_idx], pts[end_idx], (0, 255, 0), 2)
    for pt in pts:
        cv2.circle(frame, pt, 4, (255, 255, 255), -1)
    return frame



def process_frame(frame):
    """Accept a BGR frame; return (gesture_str, annotated_frame)."""
    h, w = frame.shape[:2]
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    result = detector.detect(mp_image)
    gesture = "Unknown"

    if result.hand_landmarks:
        for hand_landmarks in result.hand_landmarks:
            draw_landmarks_on_frame(frame, hand_landmarks)
            gesture = get_gesture(hand_landmarks, w, h)

    return gesture, frame


# --- Flask App ---
app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.json
        if 'image' not in data:
            return jsonify({'gesture': 'Error: No Image'})

        image_data = data['image']
        if ',' in image_data:
            _, encoded = image_data.split(',', 1)
        else:
            encoded = image_data

        nparr = np.frombuffer(base64.b64decode(encoded), np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            return jsonify({'gesture': 'Error'})

        gesture, _ = process_frame(frame)
        return jsonify({'gesture': gesture})

    except Exception as e:
        print("Error:", e)
        return jsonify({'gesture': 'Error'})


if __name__ == '__main__':
    print("✅  Gesture server running on http://localhost:5000")
    app.run(debug=False, port=5000, threaded=True)
