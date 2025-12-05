
import React, { useEffect, useRef } from 'react';
import { Particle, AppMode, HandGesture, PhotoData, Point } from '../types';
import { CONFIG, COLORS } from '../constants';
import { lerp, getDistance, toScreen, detectLeftHandGesture, rotate3D } from '../utils/math';

declare global {
  interface Window {
    Hands: any;
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
  
  const particles = useRef<Particle[]>([]);
  const state = useRef({
    mode: AppMode.SLEEP,
    leftGesture: HandGesture.NONE,
    cursor: { x: -100, y: -100, active: false } as Point & { active: boolean },
    rawCursor: { x: -100, y: -100 } as Point,
    // Rotation state (Auto)
    rot: { pitch: 0, yaw: 0, roll: 0 },
    rotSpeeds: { pitch: 0.005, yaw: 0.008, roll: 0.003 }, // Constant rotation speeds
    hoveredParticleId: -1,
    hoverStartTime: 0,
    wakeEnergy: 0,
    lastHandPos: { x: 0, y: 0 },
    activePhotoId: null as string | null,
    // Store normalized random targets (0.0 to 1.0) for Galaxy mode
    galaxyTargets: [] as {nx: number, ny: number}[],
  });

  useEffect(() => {
    initParticles();
    
    // Initialize Hands
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

    // Manual Camera Setup
    let active = true;
    let stream: MediaStream | null = null;
    let animId: number;

    const startCamera = async () => {
      try {
        try {
            // Attempt 1: Preferred settings (User facing, HD)
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: CONFIG.CAMERA_WIDTH },
                    height: { ideal: CONFIG.CAMERA_HEIGHT },
                    facingMode: 'user'
                }
            });
        } catch (e) {
            console.warn("Preferred camera config failed, trying fallback...", e);
            // Attempt 2: Fallback to any available video source
            stream = await navigator.mediaDevices.getUserMedia({
                video: true
            });
        }

        if (videoRef.current && active && stream) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            if (active && videoRef.current) {
                videoRef.current.play().catch(e => console.error("Play error:", e));
                requestAnimationFrame(predictLoop);
            }
          };
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
      }
    };

    const predictLoop = async () => {
      if (!active) return;
      if (videoRef.current && videoRef.current.readyState >= 2) {
        await hands.send({ image: videoRef.current });
      }
      if (active) requestAnimationFrame(predictLoop);
    };

    startCamera();

    // Rendering Loop (Physics + Draw)
    const renderTick = () => {
        if (!active) return;
        
        // Handle canvas resize if needed
        if (canvasRef.current && window.innerWidth !== canvasRef.current.width) {
            canvasRef.current.width = window.innerWidth;
            canvasRef.current.height = window.innerHeight;
        }

        updatePhysics();
        draw();
        animId = requestAnimationFrame(renderTick);
    };
    animId = requestAnimationFrame(renderTick);

    // Cleanup
    return () => {
      active = false;
      cancelAnimationFrame(animId);
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      hands.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    updateParticlesWithPhotos();
    generateGalaxyTargets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]);

  const initParticles = () => {
    const tempParticles: Particle[] = [];
    const size = CONFIG.CUBE_SIZE;
    
    for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
      // Random position inside the Cube volume
      const px = (Math.random() - 0.5) * 2 * size;
      const py = (Math.random() - 0.5) * 2 * size;
      const pz = (Math.random() - 0.5) * 2 * size;

      tempParticles.push({
        id: i,
        x: window.innerWidth / 2, // Start center
        y: window.innerHeight / 2,
        z: pz,
        // Store cubic local coordinates in vx/vy and we will manage Z via ID or calc
        vx: px, vy: py,  
        tx: 0, ty: 0,    
        baseSize: Math.random() * 2 + 1,
        color: i % 3 === 0 ? COLORS.PRIMARY : (i % 3 === 1 ? COLORS.SECONDARY : '#ffffff'),
        isPhoto: false,
        photoData: null,
        angle: Math.random() * Math.PI * 2, // Used for blinking offset
        radius: 0,
        speed: 0.005 + Math.random() * 0.02,
      });
    }
    particles.current = tempParticles;
    generateGalaxyTargets();
  };

  const generateGalaxyTargets = () => {
    const targets: {nx: number, ny: number}[] = [];
    // Generate random NORMALIZED positions (0.0 to 1.0)
    for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
        targets.push({
            nx: Math.random(), 
            ny: Math.random() 
        });
    }
    state.current.galaxyTargets = targets;
  };

  const updateParticlesWithPhotos = () => {
    particles.current.forEach(p => { p.isPhoto = false; p.photoData = null; });
    if (photos.length === 0) return;

    // Assign photos to random particles
    const photoIndices = new Set<number>();
    while(photoIndices.size < photos.length) {
        const idx = Math.floor(Math.random() * particles.current.length);
        photoIndices.add(idx);
    }

    let pIdx = 0;
    photoIndices.forEach(idx => {
        const p = particles.current[idx];
        p.isPhoto = true;
        p.photoData = photos[pIdx];
        p.baseSize = 8; 
        p.color = '#ffffff';
        pIdx++;
    });
  };

  const onResults = (results: any) => {
    const s = state.current;
    s.cursor.active = false;
    let leftHandDetected = false;

    if (results.multiHandLandmarks && results.multiHandedness) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const label = results.multiHandedness[i].label; 
        const lm = results.multiHandLandmarks[i];

        // "Left" label = User's Right Hand (mirror) -> CURSOR
        if (label === 'Left') { 
           const tip = lm[8]; 
           const rawX = toScreen(tip.x, window.innerWidth, true); 
           const rawY = toScreen(tip.y, window.innerHeight);
           
           s.rawCursor.x = rawX;
           s.rawCursor.y = rawY;
           s.cursor.active = true;

           if (s.mode === AppMode.SLEEP) {
              const dx = rawX - s.lastHandPos.x;
              const dy = rawY - s.lastHandPos.y;
              const speed = Math.hypot(dx, dy);
              if (speed > 10) s.wakeEnergy += speed * 0.5;
           }
           s.lastHandPos = { x: rawX, y: rawY };
        } 
        
        // "Right" label = User's Left Hand -> MODE SWITCH
        if (label === 'Right') { 
           leftHandDetected = true;
           s.leftGesture = detectLeftHandGesture(lm);
        }
      }
    }

    if (!leftHandDetected) {
      s.leftGesture = HandGesture.NONE;
    }

    // State Transitions
    if (s.mode === AppMode.SLEEP) {
       s.wakeEnergy -= CONFIG.WAKE_DECAY;
       if (s.wakeEnergy < 0) s.wakeEnergy = 0;
       if (s.wakeEnergy > CONFIG.WAKE_THRESHOLD) {
          s.mode = AppMode.SPHERE;
          onModeChange(AppMode.SPHERE);
       }
       onHoverProgress(Math.min(1, s.wakeEnergy / CONFIG.WAKE_THRESHOLD));
    } else {
       if (s.leftGesture === HandGesture.OPEN) {
          if (s.mode !== AppMode.GALAXY) {
             s.mode = AppMode.GALAXY;
             onModeChange(AppMode.GALAXY);
          }
       } else if (s.leftGesture === HandGesture.FIST) {
          if (s.mode !== AppMode.SPHERE) {
             s.mode = AppMode.SPHERE;
             onModeChange(AppMode.SPHERE);
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

    // Auto Rotate Logic
    if (s.mode === AppMode.SPHERE || s.mode === AppMode.SLEEP) {
        s.rot.yaw += s.rotSpeeds.yaw;
        s.rot.pitch += s.rotSpeeds.pitch;
        s.rot.roll += s.rotSpeeds.roll;
    }

    // Cursor Smoothing
    if (s.cursor.active) {
       s.cursor.x = lerp(s.cursor.x, s.rawCursor.x, CONFIG.SMOOTHING_FACTOR);
       s.cursor.y = lerp(s.cursor.y, s.rawCursor.y, CONFIG.SMOOTHING_FACTOR);
    }

    let nearestPhotoDist = 9999;
    let nearestPhotoId = -1;

    particles.current.forEach((p, i) => {
      let tx = 0, ty = 0;

      if (s.mode === AppMode.SLEEP || s.mode === AppMode.SPHERE) {
         // CUBE MODE
         // Use particle's initial random volume position (vx, vy, stableZ)
         // We construct a stable Z based on ID to maintain shape consistency
         const stableZ = ((p.id * 137.5) % (CONFIG.CUBE_SIZE * 2)) - CONFIG.CUBE_SIZE;

         // Rotate the point in 3D space
         const rotated = rotate3D(p.vx, p.vy, stableZ, s.rot.pitch, s.rot.yaw, s.rot.roll);
         
         // Simple perspective projection
         const perspective = 1000 / (1000 - rotated.z); 
         tx = w/2 + rotated.x * perspective;
         ty = h/2 + rotated.y * perspective;

      } else if (s.mode === AppMode.GALAXY) {
         // FULL SCREEN DIFFUSION
         // Map normalized coordinates (0-1) to current screen dimensions
         if (s.galaxyTargets[i]) {
             tx = s.galaxyTargets[i].nx * w;
             ty = s.galaxyTargets[i].ny * h;
         } else {
             tx = w/2; ty = h/2;
         }

         // Add floating drift
         if (!p.isPhoto) {
             tx += Math.sin(now * 0.001 + p.id) * 10;
             ty += Math.cos(now * 0.001 + p.id) * 10;
         }
      }

      // Physics Move
      // Use a slightly faster lerp for expansion effect
      const ease = s.mode === AppMode.GALAXY ? 0.08 : 0.1;
      p.x = lerp(p.x, tx, ease);
      p.y = lerp(p.y, ty, ease);

      // Interaction
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

    // Cursor & Hover Logic
    if (nearestPhotoId !== -1 && !s.activePhotoId) {
        if (s.hoveredParticleId !== nearestPhotoId) {
            s.hoveredParticleId = nearestPhotoId;
            s.hoverStartTime = now;
            onHoverProgress(0);
        } else {
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
        if (s.hoveredParticleId !== -1 && !s.activePhotoId) {
            s.hoveredParticleId = -1;
            onHoverProgress(0);
        }
    }

    if (s.activePhotoId) {
        const activeP = particles.current.find(p => p.photoData?.id === s.activePhotoId);
        if (activeP && s.cursor.active) {
            const dist = getDistance({x: activeP.x, y: activeP.y}, s.cursor);
            if (dist > CONFIG.SNAP_DISTANCE * 1.5) {
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
    const now = Date.now();

    ctx.globalCompositeOperation = 'lighter';
    
    particles.current.forEach(p => {
        const isHovered = p.id === s.hoveredParticleId;
        const isActive = p.photoData?.id === s.activePhotoId;
        
        // Blink logic
        const blink = Math.sin(now * 0.003 + p.angle) * 0.5 + 0.5; // 0 to 1
        
        let size = p.baseSize;
        let alpha = 0.8;
        let shadowBlur = 0;

        if (s.mode === AppMode.GALAXY) {
             // Twinkling stars
             if (!p.isPhoto) {
                 alpha = 0.3 + blink * 0.5;
                 // Some particles act as distant blurred stars
                 if (p.id % 7 === 0) { 
                     size *= 1.5;
                     alpha *= 0.4;
                 }
             }
        }

        if (p.isPhoto) {
            size = isHovered || isActive ? 16 : 10;
            alpha = 1;
            ctx.fillStyle = isActive ? '#ffffff' : (isHovered ? COLORS.SECONDARY : '#ffffff');
            
            // Strong glow for photos
            shadowBlur = isHovered ? 30 : 15;
            ctx.shadowColor = isHovered ? COLORS.SECONDARY : COLORS.PRIMARY;
            
            // Draw Label if hovered
            if (isHovered && p.photoData && !s.activePhotoId) {
                 ctx.save();
                 ctx.shadowBlur = 0;
                 ctx.fillStyle = "white";
                 ctx.font = "bold 14px sans-serif";
                 ctx.textAlign = "center";
                 ctx.fillText(p.photoData.name, p.x, p.y + 30);
                 ctx.restore();
            }
        } else {
            ctx.fillStyle = p.color;
            if (s.mode === AppMode.SPHERE) {
                 shadowBlur = 4;
            }
        }

        ctx.shadowBlur = shadowBlur;
        if(ctx.shadowBlur > 0 && !ctx.shadowColor) ctx.shadowColor = p.color;

        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
    });

    // Draw Cursor
    if (s.cursor.active && s.mode !== AppMode.SLEEP) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = s.activePhotoId ? COLORS.SECONDARY : COLORS.PRIMARY;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 10;
        ctx.shadowColor = ctx.strokeStyle;
        
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(s.cursor.x, s.cursor.y, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(s.cursor.x, s.cursor.y, 20, 0, Math.PI * 2);
        ctx.stroke();

        ctx.shadowBlur = 0;
    }
  };

  return (
    <>
        <video 
            ref={videoRef} 
            className="absolute top-0 left-0 w-full h-full object-cover transform -scale-x-100 opacity-60 pointer-events-none"
            playsInline 
            muted
        />
        <canvas 
            ref={canvasRef} 
            className="absolute top-0 left-0 w-full h-full pointer-events-none z-10"
        />
    </>
  );
};

export default ARView;
