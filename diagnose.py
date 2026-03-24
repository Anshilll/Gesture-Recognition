import traceback, sys

log = []
try:
    log.append("Trying cv2...")
    import cv2
    log.append("cv2 OK")
    
    log.append("Trying numpy...")
    import numpy as np
    log.append("numpy OK: " + np.__version__)
    
    log.append("Trying mediapipe...")
    import mediapipe as mp
    log.append("mediapipe OK")
    
    log.append("Trying flask...")
    from flask import Flask
    log.append("flask OK")
    
    log.append("Trying importlib for gesture_app...")
    import importlib.util, os
    file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app (1).py")
    spec = importlib.util.spec_from_file_location("gesture_app", file_path)
    gesture_app = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gesture_app)
    log.append("gesture_app loaded OK")
    
except Exception as e:
    log.append("ERROR: " + str(e))
    log.append(traceback.format_exc())

with open("diagnose_out.txt", "w") as f:
    f.write("\n".join(log))

print("Done. Check diagnose_out.txt")
