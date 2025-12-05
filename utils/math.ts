
import { Point, HandGesture } from '../types';

export const lerp = (start: number, end: number, t: number) => {
  return start * (1 - t) + end * t;
};

export const getDistance = (p1: Point, p2: Point) => {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
};

export const toScreen = (val: number, size: number, flip: boolean = false) => {
  return flip ? (1 - val) * size : val * size;
};

// Calculate 3D rotation matrix application
export const rotate3D = (x: number, y: number, z: number, pitch: number, yaw: number, roll: number) => {
  // Roll (Z-axis)
  let x1 = x * Math.cos(roll) - y * Math.sin(roll);
  let y1 = x * Math.sin(roll) + y * Math.cos(roll);
  
  // Pitch (X-axis)
  let y2 = y1 * Math.cos(pitch) - z * Math.sin(pitch);
  let z2 = y1 * Math.sin(pitch) + z * Math.cos(pitch);

  // Yaw (Y-axis)
  let x3 = x1 * Math.cos(yaw) + z2 * Math.sin(yaw);
  let z3 = -x1 * Math.sin(yaw) + z2 * Math.cos(yaw);

  return { x: x3, y: y2, z: z3 };
};

export const detectLeftHandGesture = (landmarks: any[]): HandGesture => {
  const wrist = landmarks[0];
  const tips = [8, 12, 16, 20]; 
  const pips = [6, 10, 14, 18]; 

  let foldedCount = 0;
  for (let i = 0; i < 4; i++) {
    const dTip = Math.hypot(landmarks[tips[i]].x - wrist.x, landmarks[tips[i]].y - wrist.y);
    const dPip = Math.hypot(landmarks[pips[i]].x - wrist.x, landmarks[pips[i]].y - wrist.y);
    if (dTip < dPip * 1.1) {
      foldedCount++;
    }
  }

  // Thumb check
  const dThumbTip = Math.hypot(landmarks[4].x - wrist.x, landmarks[4].y - wrist.y);
  const dThumbIp = Math.hypot(landmarks[3].x - wrist.x, landmarks[3].y - wrist.y);
  if (dThumbTip < dThumbIp) foldedCount++;

  return foldedCount >= 3 ? HandGesture.FIST : HandGesture.OPEN;
};
