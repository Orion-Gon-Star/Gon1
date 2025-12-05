import { Point, HandGesture } from '../types';

export const lerp = (start: number, end: number, t: number) => {
  return start * (1 - t) + end * t;
};

export const getDistance = (p1: Point, p2: Point) => {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
};

// Map normalized coordinates (0-1) to screen size
export const toScreen = (val: number, size: number, flip: boolean = false) => {
  return flip ? (1 - val) * size : val * size;
};

// Detect Open Palm vs Fist based on MediaPipe Landmarks
// Uses the ratio of finger tip distances to wrist vs finger pip distances to wrist
export const detectLeftHandGesture = (landmarks: any[]): HandGesture => {
  const wrist = landmarks[0];
  const tips = [8, 12, 16, 20]; // Index, Middle, Ring, Pinky tips
  const pips = [6, 10, 14, 18]; // Knuckles/Joints

  let foldedCount = 0;
  for (let i = 0; i < 4; i++) {
    const dTip = Math.hypot(landmarks[tips[i]].x - wrist.x, landmarks[tips[i]].y - wrist.y);
    const dPip = Math.hypot(landmarks[pips[i]].x - wrist.x, landmarks[pips[i]].y - wrist.y);
    // If tip is closer to wrist than the PIP joint, it's folded
    if (dTip < dPip * 1.1) {
      foldedCount++;
    }
  }

  // Thumb check (simplified)
  const dThumbTip = Math.hypot(landmarks[4].x - wrist.x, landmarks[4].y - wrist.y);
  const dThumbIp = Math.hypot(landmarks[3].x - wrist.x, landmarks[3].y - wrist.y);
  if (dThumbTip < dThumbIp) foldedCount++;

  return foldedCount >= 3 ? HandGesture.FIST : HandGesture.OPEN;
};