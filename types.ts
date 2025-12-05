export interface Point {
  x: number;
  y: number;
}

export interface PhotoData {
  id: string;
  img: HTMLImageElement;
  name: string;
}

export interface Particle {
  id: number;
  x: number;
  y: number;
  z: number; // For 3D depth effect
  tx: number; // Target X
  ty: number; // Target Y
  vx: number; // Velocity X
  vy: number; // Velocity Y
  baseSize: number;
  color: string;
  isPhoto: boolean;
  photoData: PhotoData | null;
  angle: number; // For orbital calculations
  radius: number; // Distance from center
  speed: number;
}

export enum AppMode {
  SLEEP = 'SLEEP',
  SPHERE = 'SPHERE', // Idle state (Left hand fist)
  GALAXY = 'GALAXY', // Active state (Left hand open)
}

export enum HandGesture {
  NONE = 'NONE',
  FIST = 'FIST',
  OPEN = 'OPEN',
}