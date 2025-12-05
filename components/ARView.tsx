import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Particle, AppMode, HandGesture, PhotoData, Point } from '../types';
import { CONFIG, COLORS } from '../constants';
import { lerp, getDistance, toScreen, detectLeftHandGesture } from '../utils/math';

declare global {
  interface Window {
    Hands: any;
    Camera: any;
  }
}

interface ARViewProps {
  photos: PhotoData[];
  onModeChange: (mode: AppMode) => void;
  onHoverProgress: (progress: number) => void;
  onPhotoOpen: (photo: PhotoData | null) => void;
}

const ARView: React.FC<ARViewProps> = ({ photos, onModeChange, onHoverProgress, onPhotoOpen }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Mutable State (Refs for performance)
  const particles = useRef<Particle[]>([]);
  const state = useRef({
    mode: AppMode.SLEEP,
    leftGesture: HandGesture.NONE,
    cursor: { x: -100, y: -100, active: false } as Point & { active: boolean },
    rawCursor: { x: -100, y: -100 } as Point,
    hoveredParticleId: -1,
    hoverStartTime: 0,
    wakeEnergy: 0,
    lastHandPos: { x: 0, y: 0 },
    rotation: 0, // Global rotation for sphere
    activePhotoId: null as string | null,
  });

  // Initialization
  useEffect(() => {
    initParticles();
    
    // MediaPipe Setup
    const hands = new window.Hands({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    hands.onResults(onResults);

    if (videoRef.current) {
      const camera = new window.Camera(videoRef.current, {
        onFrame: async () => {
          if (videoRef.current) await hands.send({ image: videoRef.current });
        },
        width: CONFIG.CAMERA_WIDTH,
        height: CONFIG.CAMERA_HEIGHT,
      });
      camera.start();
    }

    // Start Render Loop
    const animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync photos when they change
  useEffect(() => {
    updateParticlesWithPhotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]);

  const initParticles = () => {
    const tempParticles: Particle[] = [];
    for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
      const isPhoto = false; 
      tempParticles.push({
        id: i,
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        z: 0,
        tx: 0, ty: 0, vx: 0, vy: 0,
        baseSize: Math.random() * 2 + 1,
        color: i % 2 === 0 ? COLORS.PRIMARY : COLORS.SECONDARY,
        isPhoto,
        photoData: null,
        angle: Math.random() * Math.PI * 2,
        radius: Math.random() * CONFIG.SPHERE_RADIUS,
        speed: 0.005 + Math.random() * 0.01,
      });
    }
    particles.current = tempParticles;
  };

  const updateParticlesWithPhotos = () => {
    // Reset photo assignments
    particles.current.forEach(p => { p.isPhoto = false; p.photoData = null; });
    
    if (photos.length === 0) return;

    // Distribute photos evenly among particles
    // We want photos to be "stars" in the system
    const step = Math.floor(particles.current.length / photos.length);
    
    photos.forEach((photo, index) => {
      const pIndex = (index * step + Math.floor(Math.random() * 10)) % particles.current.length;
      const p = particles.current[pIndex];
      p.isPhoto = true;
      p.photoData = photo;
      p.baseSize = 6; // Bigger base size for photos
      p.color = '#ffffff';
    });
  };

  const onResults = (results: any) => {
    const s = state.current;
    s.cursor.active = false;
    let leftHandDetected = false;

    if (results.multiHandLandmarks && results.multiHandedness) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const label = results.multiHandedness[i].label; // "Left" or "Right"
        const landmarks = results.multiHandLandmarks[i];

        // LOGIC NOTE: MediaPipe assumes mirrored image input (selfie mode).
        // "Left" label usually means the user's RIGHT hand in mirror mode.
        // However, we want to control with our physical Right hand.
        // In mirrored video: 
        // User raises Right hand -> Appears on right side of screen -> Labelled "Left" by default MediaPipe model if assuming front camera.
        // Let's rely on standard: Label 'Left' = User's Right Hand (in default selfie mode)
        // Wait, MediaPipe Hands 'Left' usually means the model thinks it is a Left hand.
        // Let's stick to user experience:
        // We want one hand to point (Cursor), one hand to toggle mode (Menu).
        
        // Let's assume:
        // Label "Left" -> Controls Cursor (User's active hand)
        // Label "Right" -> Controls Mode (User's passive hand)
        // (This might be swapped depending on camera mirror settings, but let's implement and user can swap hands if needed)

        if (label === 'Left') { // User's Right hand (usually)
           const tip = landmarks[8]; // Index finger
           const rawX = toScreen(tip.x, window.innerWidth, true); // Flip X for mirror feel
           const rawY = toScreen(tip.y, window.innerHeight);
           
           s.rawCursor.x = rawX;
           s.rawCursor.y = rawY;
           s.cursor.active = true;

           // Wake Up Logic: Velocity Check
           if (s.mode === AppMode.SLEEP) {
              const dx = rawX - s.lastHandPos.x;
              const dy = rawY - s.lastHandPos.y;
              const speed = Math.hypot(dx, dy);
              
              if (speed > 10) { // Moving fast enough
                 s.wakeEnergy += speed * 0.5;
              }
           }
           s.lastHandPos = { x: rawX, y: rawY };
        } 
        
        if (label === 'Right') { // User's Left hand (usually)
           const gesture = detectLeftHandGesture(landmarks);
           s.leftGesture = gesture;
           leftHandDetected = true;
        }
      }
    }

    if (!leftHandDetected) {
      s.leftGesture = HandGesture.NONE;
    }

    // State Machine Transitions
    if (s.mode === AppMode.SLEEP) {
       s.wakeEnergy -= CONFIG.WAKE_DECAY;
       if (s.wakeEnergy < 0) s.wakeEnergy = 0;
       if (s.wakeEnergy > CONFIG.WAKE_THRESHOLD) {
          s.mode = AppMode.SPHERE;
          onModeChange(AppMode.SPHERE);
       }
       // Pass wake progress to UI
       onHoverProgress(Math.min(1, s.wakeEnergy / CONFIG.WAKE_THRESHOLD));
    } else {
       // Mode Toggle Logic
       if (s.leftGesture === HandGesture.OPEN) {
          if (s.mode !== AppMode.GALAXY) {
             s.mode = AppMode.GALAXY;
             onModeChange(AppMode.GALAXY);
          }
       } else if (s.leftGesture === HandGesture.FIST) {
          if (s.mode !== AppMode.SPHERE) {
             s.mode = AppMode.SPHERE;
             onModeChange(AppMode.SPHERE);
             // Close photo if we make a fist
             onPhotoOpen(null);
             s.activePhotoId = null;
          }
       }
    }
  };

  const updatePhysics = () => {
    const s = state.current;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const now = Date.now();

    // 1. Smooth Cursor
    if (s.cursor.active) {
       // Snap logic overrides smoothing if needed, but basic lerp here
       s.cursor.x = lerp(s.cursor.x, s.rawCursor.x, CONFIG.SMOOTHING_FACTOR);
       s.cursor.y = lerp(s.cursor.y, s.rawCursor.y, CONFIG.SMOOTHING_FACTOR);
    }

    // 2. Global Rotation
    s.rotation += 0.002;

    // 3. Update Particles
    let nearestPhotoDist = 9999;
    let nearestPhotoId = -1;

    particles.current.forEach((p, i) => {
      let tx = 0, ty = 0, tz = 0;

      if (s.mode === AppMode.SLEEP || s.mode === AppMode.SPHERE) {
         // Sphere Math
         // Use Golden Spiral on a Sphere for even distribution
         const phi = Math.acos( -1 + ( 2 * i ) / CONFIG.PARTICLE_COUNT );
         const theta = Math.sqrt( CONFIG.PARTICLE_COUNT * Math.PI ) * phi + s.rotation;
         
         const r = CONFIG.SPHERE_RADIUS + (p.z * 50); // Variation in radius

         // Spherical to Cartesian
         tx = w/2 + r * Math.sin(phi) * Math.cos(theta);
         ty = h/2 + r * Math.sin(phi) * Math.sin(theta);
         tz = r * Math.cos(phi);

         // Add float
         tx += Math.sin(now * 0.001 + p.id) * 5;
         ty += Math.cos(now * 0.002 + p.id) * 5;

      } else if (s.mode === AppMode.GALAXY) {
         // Galaxy / Spiral Math
         // Flatten Z, spread XY
         const armOffset = (p.id % 3) * (2 * Math.PI / 3); // 3 Arms
         const distance = 100 + (p.id / CONFIG.PARTICLE_COUNT) * (Math.min(w,h) * 0.4);
         const galaxyAngle = distance * CONFIG.GALAXY_SPIRAL_TIGHTNESS + s.rotation + armOffset;

         tx = w/2 + distance * Math.cos(galaxyAngle);
         ty = h/2 + distance * Math.sin(galaxyAngle);
         
         // Special handling for Photo Particles in Galaxy Mode
         // Keep them somewhat accessible
         if (p.isPhoto) {
             // Override spiral for photos to ensure they are in the "Goldilocks" zone
             // Map photo index to a grid or inner circle
             const photoCount = particles.current.filter(x => x.isPhoto).length;
             const myPhotoIdx = particles.current.filter((x, idx) => x.isPhoto && idx < p.id).length;
             const angleStep = (Math.PI * 2) / Math.max(1, photoCount);
             const safeR = Math.min(w,h) * 0.25; // Closer to center
             tx = w/2 + safeR * Math.cos(s.rotation * 0.5 + myPhotoIdx * angleStep);
             ty = h/2 + safeR * Math.sin(s.rotation * 0.5 + myPhotoIdx * angleStep);
         }
      }

      // Easing to target
      p.x = lerp(p.x, tx, 0.08);
      p.y = lerp(p.y, ty, 0.08);

      // Interaction Check (Only in Galaxy Mode)
      if (s.mode === AppMode.GALAXY && s.cursor.active && p.isPhoto) {
         const d = getDistance({x: p.x, y: p.y}, s.cursor);
         if (d < CONFIG.SNAP_DISTANCE) {
             if (d < nearestPhotoDist) {
                 nearestPhotoDist = d;
                 nearestPhotoId = p.id;
             }
         }
      }
    });

    // 4. Cursor Interaction Handling
    if (nearestPhotoId !== -1 && !s.activePhotoId) {
        // Snapping visual effect? Maybe pull cursor slightly?
        // Let's just track hover
        if (s.hoveredParticleId !== nearestPhotoId) {
            s.hoveredParticleId = nearestPhotoId;
            s.hoverStartTime = now;
            onHoverProgress(0);
        } else {
            // Still hovering same particle
            const elapsed = now - s.hoverStartTime;
            const progress = Math.min(1, elapsed / CONFIG.DWELL_TIME);
            onHoverProgress(progress);
            
            if (progress >= 1 && !s.activePhotoId) {
                const p = particles.current.find(pt => pt.id === nearestPhotoId);
                if (p && p.photoData) {
                    s.activePhotoId = p.photoData.id;
                    onPhotoOpen(p.photoData);
                }
            }
        }
    } else {
        // No valid target
        if (s.hoveredParticleId !== -1 && !s.activePhotoId) {
            // Only clear hover if we haven't locked a photo open
            s.hoveredParticleId = -1;
            onHoverProgress(0);
        }
    }

    // If active photo is set, but we moved away significantly? 
    // The prompt says "Move away -> Close".
    if (s.activePhotoId) {
        const activeP = particles.current.find(p => p.photoData?.id === s.activePhotoId);
        if (activeP && s.cursor.active) {
            const dist = getDistance({x: activeP.x, y: activeP.y}, s.cursor);
            if (dist > CONFIG.SNAP_DISTANCE * 1.5) { // Hysteresis
                s.activePhotoId = null;
                onPhotoOpen(null);
            }
        }
    }
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const s = state.current;

    // 1. Draw Particles
    // Use additive blending for "glowing" effect
    ctx.globalCompositeOperation = 'lighter';
    
    particles.current.forEach(p => {
        const isHovered = p.id === s.hoveredParticleId;
        const isActive = p.photoData?.id === s.activePhotoId;
        
        let size = p.baseSize;
        let alpha = 0.6;

        if (s.mode === AppMode.SLEEP) alpha = 0.2;

        if (p.isPhoto) {
            size = isHovered || isActive ? 12 : 6;
            alpha = 1;
            ctx.fillStyle = isActive ? '#ffffff' : (isHovered ? COLORS.SECONDARY : COLORS.PRIMARY);
            
            if (isHovered) {
                // Glow ring
                ctx.beginPath();
                ctx.arc(p.x, p.y, size * 1.5, 0, Math.PI * 2);
                ctx.fillStyle = COLORS.SECONDARY;
                ctx.globalAlpha = 0.3;
                ctx.fill();
            }
        } else {
            ctx.fillStyle = p.color;
        }

        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
    });

    // 2. Draw Cursor
    if (s.cursor.active && s.mode !== AppMode.SLEEP) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = s.activePhotoId ? COLORS.SECONDARY : COLORS.PRIMARY;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 10;
        ctx.shadowColor = ctx.strokeStyle;
        
        // Inner Dot
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(s.cursor.x, s.cursor.y, 4, 0, Math.PI * 2);
        ctx.fill();

        // Outer Ring
        ctx.beginPath();
        ctx.arc(s.cursor.x, s.cursor.y, 15, 0, Math.PI * 2);
        ctx.stroke();

        ctx.shadowBlur = 0;
    }
  };

  const renderLoop = () => {
    if (canvasRef.current && window.innerWidth !== canvasRef.current.width) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
    }

    updatePhysics();
    draw();
    requestAnimationFrame(renderLoop);
  };

  return (
    <>
        <video 
            ref={videoRef} 
            className="absolute top-0 left-0 w-full h-full object-cover transform -scale-x-100 opacity-60 pointer-events-none"
            playsInline 
        />
        <canvas 
            ref={canvasRef} 
            className="absolute top-0 left-0 w-full h-full pointer-events-none z-10"
        />
    </>
  );
};

export default ARView;