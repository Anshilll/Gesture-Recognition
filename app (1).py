# Import required libraries
import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python.vision import HandLandmarkerOptions, HandLandmarker, RunningMode
import os

# Initialize mediapipe hand landmarker (Tasks API for mediapipe 0.10+)
MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hand_landmarker.task")

base_options = mp_python.BaseOptions(model_asset_path=MODEL_PATH)
options = HandLandmarkerOptions(
    base_options=base_options,
    running_mode=RunningMode.IMAGE,
    num_hands=1,
    min_hand_detection_confidence=0.7,
)
detector = HandLandmarker.create_from_options(options)


def draw_landmarks_on_frame(frame, landmark_list):
    h, w = frame.shape[:2]
    pts = [(int(lm.x * w), int(lm.y * h)) for lm in landmark_list]
    # Draw connections manually
    connections = [
        (0,1),(1,2),(2,3),(3,4),
        (0,5),(5,6),(6,7),(7,8),
        (0,9),(9,10),(10,11),(11,12),
        (0,13),(13,14),(14,15),(15,16),
        (0,17),(17,18),(18,19),(19,20),
        (5,9),(9,13),(13,17)
    ]
    for s, e in connections:
        cv2.line(frame, pts[s], pts[e], (0, 255, 0), 2)
    for pt in pts:
        cv2.circle(frame, pt, 4, (255, 255, 255), -1)


def get_gesture(landmarks, frame_w, frame_h):
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
    elif (index_tip[1] > index_base[1] and middle_tip[1] > middle_base[1]):
        return "NO"
    return "Unknown"


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


if __name__ == "__main__":
    # Start webcam
    cap = cv2.VideoCapture(0)

    while True:
        success, frame = cap.read()
        if not success:
            break
        frame = cv2.flip(frame, 1)

        gesture, frame = process_frame(frame)

        # Display gesture
        cv2.putText(frame, gesture, (50, 100),
                    cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 255, 0), 3)

        # Show webcam window
        cv2.imshow("Gesture Detection", frame)

        # Press q to exit
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()