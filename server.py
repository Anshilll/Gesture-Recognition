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
    num_hands=2,
    min_hand_detection_confidence=0.6,
    min_hand_presence_confidence=0.6,
    min_tracking_confidence=0.5,
)
detector = HandLandmarker.create_from_options(options)

import math

def _distance(p1, p2):
    """Euclidean distance between two (x, y) tuples."""
    return math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2)


def get_gesture(landmarks, frame_w, frame_h):
    """Classify gesture from normalized landmark list — supports 9 gestures."""
    def px(lm):
        return int(lm.x * frame_w), int(lm.y * frame_h)

    wrist       = px(landmarks[0])
    thumb_cmc   = px(landmarks[1])
    thumb_mcp   = px(landmarks[2])
    thumb_ip    = px(landmarks[3])
    thumb_tip   = px(landmarks[4])
    index_mcp   = px(landmarks[5])
    index_pip   = px(landmarks[6])   # index_base
    index_dip   = px(landmarks[7])
    index_tip   = px(landmarks[8])
    middle_mcp  = px(landmarks[9])
    middle_pip  = px(landmarks[10])  # middle_base
    middle_dip  = px(landmarks[11])
    middle_tip  = px(landmarks[12])
    ring_mcp    = px(landmarks[13])
    ring_pip    = px(landmarks[14])  # ring_base
    ring_dip    = px(landmarks[15])
    ring_tip    = px(landmarks[16])
    pinky_mcp   = px(landmarks[17])
    pinky_pip   = px(landmarks[18])  # pinky_base
    pinky_dip   = px(landmarks[19])
    pinky_tip   = px(landmarks[20])

    # --- Helper: finger extended? ---
    index_up  = index_tip[1] < index_pip[1]
    middle_up = middle_tip[1] < middle_pip[1]
    ring_up   = ring_tip[1] < ring_pip[1]
    pinky_up  = pinky_tip[1] < pinky_pip[1]

    # Thumb: compare x-distance from wrist (works for left/right hand)
    thumb_up_y = thumb_tip[1] < thumb_ip[1]  # thumb pointing upward
    thumb_out  = abs(thumb_tip[0] - wrist[0]) > abs(thumb_ip[0] - wrist[0])

    all_fingers_curled = not index_up and not middle_up and not ring_up and not pinky_up

    # --- OK gesture: thumb tip very close to index tip, others extended ---
    thumb_index_dist = _distance(thumb_tip, index_tip)
    palm_size = _distance(wrist, middle_mcp)
    if palm_size > 0 and (thumb_index_dist / palm_size) < 0.25 and middle_up and ring_up and pinky_up:
        return "OK"

    # --- PEACE: index + middle up, ring + pinky curled ---
    if index_up and middle_up and not ring_up and not pinky_up:
        return "PEACE"

    # --- ROCK ON: index + pinky up, middle + ring curled ---
    if index_up and not middle_up and not ring_up and pinky_up and not thumb_out:
        return "ROCK ON"

    # --- I LOVE YOU: thumb + index + pinky up, middle + ring curled ---
    if index_up and not middle_up and not ring_up and pinky_up and thumb_out:
        return "I LOVE YOU"

    # --- POINTING: only index extended ---
    if index_up and not middle_up and not ring_up and not pinky_up:
        return "POINTING"

    # --- THUMBS UP: thumb points up, all fingers curled ---
    if thumb_up_y and thumb_tip[1] < index_mcp[1] and all_fingers_curled:
        return "THUMBS UP"

    # --- THUMBS DOWN: thumb points down, all fingers curled ---
    if not thumb_up_y and thumb_tip[1] > thumb_cmc[1] and all_fingers_curled:
        return "THUMBS DOWN"

    # --- HELLO / OPEN HAND: all fingers extended ---
    if index_up and middle_up and ring_up and pinky_up:
        return "HELLO"

    # --- FIST: all fingers curled ---
    if all_fingers_curled:
        return "FIST"

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
    print("✅  Gesture server running on http://localhost:5001")
    app.run(debug=False, port=5001, threaded=True)
