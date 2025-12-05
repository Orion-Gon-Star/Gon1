import React, { useState, useCallback } from 'react';
import ARView from './components/ARView';
import UIOverlay from './components/UIOverlay';
import { AppMode, PhotoData } from './types';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.SLEEP);
  const [hoverProgress, setHoverProgress] = useState(0);
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [activePhoto, setActivePhoto] = useState<PhotoData | null>(null);

  const handleFileUpload = useCallback((files: FileList) => {
    const newPhotos: PhotoData[] = [];
    let loadedCount = 0;
    
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target?.result as string;
        img.onload = () => {
           // Clean filename
           const name = file.name.replace(/\.[^/.]+$/, "");
           newPhotos.push({
             id: Math.random().toString(36).substr(2, 9),
             img,
             name
           });
           loadedCount++;
           if (loadedCount === files.length) {
             setPhotos(prev => [...prev, ...newPhotos]);
           }
        };
      };
      reader.readAsDataURL(file);
    });
  }, []);

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden">
      <ARView 
        photos={photos} 
        onModeChange={setMode}
        onHoverProgress={setHoverProgress}
        onPhotoOpen={setActivePhoto}
      />
      <UIOverlay 
        mode={mode} 
        hoverProgress={hoverProgress} 
        onFileUpload={handleFileUpload}
        activePhoto={activePhoto}
        photoCount={photos.length}
      />
    </div>
  );
};

export default App;