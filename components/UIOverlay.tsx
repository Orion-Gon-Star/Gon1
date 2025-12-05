
import React from 'react';
import { AppMode, PhotoData } from '../types';

interface UIOverlayProps {
  mode: AppMode;
  hoverProgress: number;
  activePhoto: PhotoData | null;
  onFileUpload: (files: FileList) => void;
  photoCount: number;
}

const UIOverlay: React.FC<UIOverlayProps> = ({ mode, hoverProgress, activePhoto, onFileUpload, photoCount }) => {
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileUpload(e.target.files);
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden font-sans">
      
      {/* VIGNETTE */}
      <div className="absolute inset-0 bg-[radial-gradient(circle,transparent_40%,rgba(0,0,0,0.8)_100%)]"></div>

      {/* SLEEP MODE UI */}
      {mode === AppMode.SLEEP && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
            <h1 className="text-4xl md:text-6xl font-bold text-white tracking-[0.2em] animate-pulse drop-shadow-[0_0_10px_rgba(0,255,255,0.8)]">
                AWAKEN
            </h1>
            <p className="text-cyan-300 mt-4 text-sm tracking-widest uppercase opacity-80">
                Wave right hand to activate
            </p>
            {/* Energy Bar */}
            <div className="w-64 h-2 bg-gray-800 rounded-full mt-8 overflow-hidden border border-gray-600">
                <div 
                    className="h-full bg-gradient-to-r from-cyan-500 to-white transition-all duration-75 ease-linear"
                    style={{ width: `${hoverProgress * 100}%` }}
                ></div>
            </div>
        </div>
      )}

      {/* ACTIVE MODES UI */}
      {mode !== AppMode.SLEEP && (
        <>
            {/* TOP LEFT STATUS */}
            <div className={`absolute top-6 left-6 transition-opacity duration-500 ${mode === AppMode.GALAXY ? 'opacity-0' : 'opacity-100'}`}>
                <div className="bg-black/40 backdrop-blur-md border border-white/10 p-4 rounded-xl text-white shadow-lg max-w-xs pointer-events-auto">
                    <h2 className="text-cyan-400 font-bold text-lg mb-1 drop-shadow-md">AR CUBE</h2>
                    <div className="text-xs text-gray-300 space-y-1">
                        <p><span className="text-magenta-500 font-bold">Left Open:</span> Expand Universe</p>
                        <p><span className="text-cyan-500 font-bold">Left Fist:</span> Reset to Cube</p>
                        <p><span className="text-white font-bold">Right Point:</span> Cursor</p>
                    </div>
                </div>
            </div>

            {/* BOTTOM LEFT UPLOAD */}
            <div className={`absolute bottom-8 left-8 transition-all duration-500 pointer-events-auto ${mode === AppMode.GALAXY ? 'translate-y-20 opacity-0' : 'translate-y-0 opacity-100'}`}>
                <label className="group flex items-center gap-3 bg-black/50 backdrop-blur-md border border-white/20 px-6 py-3 rounded-full cursor-pointer hover:bg-cyan-900/40 hover:border-cyan-400 transition-all shadow-[0_0_15px_rgba(0,0,0,0.5)] hover:shadow-[0_0_20px_rgba(0,255,255,0.4)]">
                    <span className="text-2xl group-hover:scale-110 transition-transform">📂</span>
                    <div>
                        <div className="text-white text-sm font-bold tracking-wide">IMPORT PHOTOS</div>
                        <div className="text-cyan-300 text-xs">{photoCount > 0 ? `${photoCount} Loaded` : 'No photos'}</div>
                    </div>
                    <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileChange} />
                </label>
            </div>
        </>
      )}

      {/* ACTIVE PHOTO MODAL */}
      {activePhoto && (
        <div className="absolute inset-0 flex items-center justify-center z-50">
            <div className="relative bg-black/60 backdrop-blur-xl p-2 rounded-2xl border border-white/20 shadow-[0_0_50px_rgba(255,0,255,0.3)] animate-[scaleIn_0.3s_ease-out]">
                <img 
                    src={activePhoto.img.src} 
                    alt="AR Content" 
                    className="max-w-[80vw] max-h-[70vh] rounded-lg object-contain block"
                />
                <div className="absolute -bottom-10 left-0 w-full text-center">
                    <span className="text-white font-bold text-lg drop-shadow-md bg-black/50 px-4 py-1 rounded-full">
                        {activePhoto.name}
                    </span>
                </div>
                {/* Loader bar for closing */}
                {hoverProgress > 0 && (
                     <div className="absolute top-0 left-0 h-1 bg-white transition-all duration-75" style={{width: `${(1-hoverProgress)*100}%`}}></div>
                )}
            </div>
        </div>
      )}
    </div>
  );
};

export default UIOverlay;
