export const CONFIG = {
  PARTICLE_COUNT: 400,
  CAMERA_WIDTH: 1280,
  CAMERA_HEIGHT: 720,
  SMOOTHING_FACTOR: 0.25, // Lower = smoother but more delay. 0.25 is a good balance.
  DWELL_TIME: 500, // ms to hover before opening
  WAKE_THRESHOLD: 50, // Amount of motion energy needed to wake
  WAKE_DECAY: 2, // How fast wake energy dissipates
  SPHERE_RADIUS: 250,
  GALAXY_SPIRAL_TIGHTNESS: 0.2,
  SNAP_DISTANCE: 60, // Pixel distance to snap to a photo
};

export const COLORS = {
  PRIMARY: '#00ffff', // Cyan
  SECONDARY: '#ff00ff', // Magenta
  TEXT: '#ffffff',
  PARTICLE_BASE: 'rgba(200, 230, 255, 0.8)',
};