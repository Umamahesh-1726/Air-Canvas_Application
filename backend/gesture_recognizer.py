import cv2
import mediapipe as mp
import numpy as np
from tensorflow.keras.models import load_model
 

model = load_model('model/gesture_model.h5')

 # Make sure this model is in your backend folder

mp_hands = mp.solutions.hands
hands = mp_hands.Hands(static_image_mode=False, max_num_hands=1, min_detection_confidence=0.7)
mp_draw = mp.solutions.drawing_utils

gesture_labels = ['fist', 'palm', 'peace', 'point', 'thumbsup', 'undo']

def extract_landmarks(landmarks):
    return np.array([[lm.x, lm.y, lm.z] for lm in landmarks]).flatten()

def predict_gesture(frame):
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = hands.process(rgb)

    if results.multi_hand_landmarks:
        for hand_landmarks in results.multi_hand_landmarks:
            landmarks = extract_landmarks(hand_landmarks)
            if landmarks.shape == (63,):
                prediction = model.predict(np.expand_dims(landmarks, axis=0))[0]
                class_id = np.argmax(prediction)
                gesture_name = gesture_labels[class_id]

                index_finger = hand_landmarks.landmark[8]
                h, w, _ = frame.shape
                x = int(index_finger.x * w)
                y = int(index_finger.y * h)

                return gesture_name, (x, y)
    return 'none', None
