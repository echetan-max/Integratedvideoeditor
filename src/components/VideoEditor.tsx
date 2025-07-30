import React, { useState, useRef, useEffect } from 'react';
import { VideoPlayer, VideoPlayerRef } from './VideoPlayer';
import { Timeline } from './Timeline';
import { ZoomControls } from './ZoomControls';
import { Header } from './Header';
import { FileImport } from './FileImport';
import { ExportModal } from './ExportModal';
import { SakDataImport } from './SakDataImport';
import { AutoZoomRecorder } from './AutoZoomRecorder';
import { TextOverlayComponent } from './TextOverlay';
import { ZoomEffect, TextOverlay, getInterpolatedZoom } from '../types';

export const VideoEditor: React.FC = () => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoomEffects, setZoomEffects] = useState<ZoomEffect[]>([]);
  const [selectedZoom, setSelectedZoom] = useState<ZoomEffect | null>(null);
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSakImport, setShowSakImport] = useState(false);
  const [showAutoZoomRecorder, setShowAutoZoomRecorder] = useState(false);
  const [zoomEnabled, setZoomEnabled] = useState(true);
  const videoRef = useRef<VideoPlayerRef>(null);
  const clicksFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (videoFile) {
      console.log('Loading video file:', {
        name: videoFile.name,
        type: videoFile.type,
        size: videoFile.size,
        lastModified: videoFile.lastModified
      });
      const url = URL.createObjectURL(videoFile);
      console.log('Created video URL:', url);
      setVideoUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [videoFile]);

  // Add keyboard shortcuts for zoom management
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedZoom) {
        deleteZoomEffect(selectedZoom.id);
      }
      if (e.key === 'Escape') {
        setSelectedZoom(null);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedZoom]);

  const addZoomEffect = (startTime: number, endTime: number, x: number, y: number, scale: number, type: 'manual' | 'autozoom' = 'manual') => {
    const newZoom: ZoomEffect = {
      id: Date.now().toString(),
      startTime,
      endTime,
      x,
      y,
      scale,
      transition: 'smooth',
      type
    };
    setZoomEffects(prev => [...prev, newZoom]);
    setSelectedZoom(newZoom);
  };

  const updateZoomEffect = (updatedZoom: ZoomEffect) => {
    setZoomEffects(prev => 
      prev.map(zoom => zoom.id === updatedZoom.id ? updatedZoom : zoom)
    );
    setSelectedZoom(updatedZoom);
  };

  const deleteZoomEffect = (id: string) => {
    setZoomEffects(prev => prev.filter(zoom => zoom.id !== id));
    if (selectedZoom?.id === id) {
      setSelectedZoom(null);
    }
  };

  // Text overlay functions
  const addTextOverlay = (textOverlay: TextOverlay) => {
    setTextOverlays(prev => [...prev, textOverlay]);
  };

  const updateTextOverlay = (id: string, updates: Partial<TextOverlay>) => {
    setTextOverlays(prev => 
      prev.map(text => text.id === id ? { ...text, ...updates } : text)
    );
  };

  const deleteTextOverlay = (id: string) => {
    setTextOverlays(prev => prev.filter(text => text.id !== id));
  };

  const handleTimeUpdate = (time: number) => {
    setCurrentTime(time);
  };

  const handleSeek = (time: number) => {
    setCurrentTime(time);
    videoRef.current?.seek(time);
  };

  const handlePlay = () => {
    setIsPlaying(true);
    videoRef.current?.play();
  };

  const handlePause = () => {
    setIsPlaying(false);
    videoRef.current?.pause();
  };

  const handleSakDataImport = (sakData: any) => {
    // Convert sak.py data to zoom effects
    if (sakData.clicks && Array.isArray(sakData.clicks)) {
      const newZoomEffects: ZoomEffect[] = sakData.clicks.map((click: any, index: number) => ({
        id: `sak-${index}-${Date.now()}`,
        startTime: click.time || index * 2,
        endTime: (click.time || index * 2) + 2.0, // 2 second duration as specified
        x: (click.x / sakData.width) * 100 || 50,
        y: (click.y / sakData.height) * 100 || 50,
        scale: 2.0, // 2.0 zoom level as specified
        transition: 'smooth' as const
      }));
      setZoomEffects(prev => [...prev, ...newZoomEffects]);
    }
    setShowSakImport(false);
  };

  const handleAutoZoomImport = (videoFile: File, clicksData: any) => {
    setVideoFile(videoFile);
    if (clicksData.clicks && Array.isArray(clicksData.clicks)) {
      // Find the earliest click time (video-relative, not epoch)
      const firstClickTime = Math.min(...clicksData.clicks.map((click: any) => click.time || 0));
      // If the first click time is very large (epoch), try to use the first click as 0
      const isEpoch = firstClickTime > 1000000000;
      const baseTime = isEpoch ? firstClickTime : 0;
      const newZoomEffects: ZoomEffect[] = clicksData.clicks.map((click: any, index: number) => {
        // Always normalize to video start
        const normalizedTime = (click.time || 0) - baseTime;
        return {
          id: `autozoom-${index}-${Date.now()}`,
          startTime: normalizedTime,
          endTime: normalizedTime + (click.duration || 2.0),
          x: (click.x / clicksData.width) * 100,
          y: (click.y / clicksData.height) * 100,
          scale: click.zoomLevel || 2.0,
          transition: 'smooth' as const,
          type: 'autozoom',
          originalData: click
        };
      });
      setZoomEffects(prev => [...prev, ...newZoomEffects]);
      if (newZoomEffects.length > 0) {
        setSelectedZoom(newZoomEffects[0]);
      }
    }
    setShowAutoZoomRecorder(false);
  };

  const handleClicksImport = (clicksData: any) => {
    if (clicksData.clicks && Array.isArray(clicksData.clicks)) {
      // Detect if times are epoch (very large) or relative
      const times = clicksData.clicks.map((c: any): number => c.time || 0);
      const isEpoch = Math.min(...times) > 1e6;
      const baseTime = isEpoch ? Math.min(...times) : 0;
      // Use provided duration if available, else infer from last click
      let duration = typeof clicksData.duration === 'number'
        ? clicksData.duration
        : Math.max(...times.map((t: number) => t - baseTime));
      // Clamp duration to at least the last click's end
      const newZoomEffects: ZoomEffect[] = clicksData.clicks.map((click: any, index: number) => {
        let normalizedTime = (click.time || 0) - baseTime;
        normalizedTime = Math.max(0, Math.min(normalizedTime, duration));
        const endTime = Math.max(0, Math.min(normalizedTime + (click.duration || 2.0), duration));
        const width = click.width || clicksData.width;
        const height = click.height || clicksData.height;
        const zoomEffect: ZoomEffect = {
          id: click.id || `imported-${index}-${Date.now()}`,
          startTime: normalizedTime,
          endTime: endTime,
          x: (click.x / width) * 100,
          y: (click.y / height) * 100,
          scale: click.zoomLevel || 2.0,
          transition: 'smooth',
          type: 'autozoom',
          originalData: click
        };
        return zoomEffect;
      });
      setZoomEffects(prev => {
        const combined = [...prev, ...newZoomEffects];
        return combined;
      });
    }
  };

  const resetProject = () => {
    setVideoFile(null);
    setZoomEffects([]);
    setSelectedZoom(null);
    setCurrentTime(0);
    setIsPlaying(false);
    setShowAutoZoomRecorder(false);
    setTextOverlays([]); // Clear text overlays as well
  };

  // This will be used for the header Import Data button
  const handleHeaderClicksImport = () => {
    clicksFileInputRef.current?.click();
  };

  const handleHeaderClicksFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const clicksData = JSON.parse(e.target?.result as string);
          handleClicksImport(clicksData);
        } catch (error) {
          alert('Invalid JSON file. Please select a valid clicks.json file.');
        }
      };
      reader.readAsText(file);
    }
  };

  // Utility to get export-ready zooms (sorted, filtered)
  function getExportReadyZooms(zooms: ZoomEffect[], duration: number): ZoomEffect[] {
    return [...zooms]
      .filter(z => z.startTime < duration && z.endTime > 0)
      .map(z => ({
        ...z,
        startTime: Math.max(0, Math.min(z.startTime, duration)),
        endTime: Math.max(0, Math.min(z.endTime, duration)),
      }))
      .sort((a, b) => a.startTime - b.startTime);
  }

  if (!videoFile) {
    return (
      <div>
        <FileImport 
          onFileSelect={setVideoFile}
          onSakImport={() => setShowSakImport(true)}
          onAutoZoomRecord={() => setShowAutoZoomRecorder(true)}
          onClicksImport={handleClicksImport}
        />
        
        {showSakImport && (
          <SakDataImport
            onImport={handleSakDataImport}
            onClose={() => setShowSakImport(false)}
          />
        )}
        
        {showAutoZoomRecorder && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-900 rounded-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-white">AutoZoom Recorder</h2>
                  <button
                    onClick={() => setShowAutoZoomRecorder(false)}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    ✕
                  </button>
                </div>
                <AutoZoomRecorder onVideoImported={handleAutoZoomImport} />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      <Header 
        videoFile={videoFile}
        onExport={() => setShowExportModal(true)}
        onNewProject={resetProject}
        onSakImport={handleHeaderClicksImport} // Now triggers file input
        onAutoZoomRecord={() => setShowAutoZoomRecorder(true)}
      />
      <input
        ref={clicksFileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleHeaderClicksFileSelect}
      />
      
      <div className="flex-1 flex overflow-hidden">
        <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
          {/* Removed tab buttons for Zoom Effects and Text Overlays */}
          <div className="flex-1 overflow-y-auto">
            <ZoomControls
              zoomEnabled={zoomEnabled}
              onToggleZoom={setZoomEnabled}
              selectedZoom={selectedZoom}
              onUpdateZoom={updateZoomEffect}
              onDeleteZoom={deleteZoomEffect}
              onAddZoom={() => {
                const startTime = currentTime;
                const endTime = Math.min(currentTime + 2.0, duration);
                addZoomEffect(startTime, endTime, 50, 50, 2.0);
              }}
              currentTime={currentTime}
              duration={duration}
            />
            
            <TextOverlayComponent
              textOverlays={textOverlays}
              onAddText={addTextOverlay}
              onUpdateText={updateTextOverlay}
              onDeleteText={deleteTextOverlay}
              currentTime={currentTime}
              duration={duration}
            />
          </div>
        </div>
        
        <div className="flex-1 flex flex-col">
          <VideoPlayer
            ref={videoRef}
            src={videoUrl}
            currentTime={currentTime}
            isPlaying={isPlaying}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={(duration) => setDuration(duration)}
            onPlay={handlePlay}
            onPause={handlePause}
            currentZoom={(() => {
              const exportReadyZooms = getExportReadyZooms(zoomEffects, duration);
              const interpolatedZoom = getInterpolatedZoom(currentTime, exportReadyZooms);
              
              // Always return the interpolated zoom, even if it's the default zoom-out
              // This ensures the preview shows the correct zoom state at all times
              return interpolatedZoom;
            })()}
            textOverlays={textOverlays}
            onVideoClick={(x, y) => {
              if (zoomEnabled && !selectedZoom) {
                const startTime = currentTime;
                const endTime = Math.min(currentTime + 2.0, duration);
                addZoomEffect(startTime, endTime, x, y, 2.0);
              }
            }}
          />
          <Timeline
            duration={duration}
            currentTime={currentTime}
            onSeek={handleSeek}
            zoomEffects={getExportReadyZooms(zoomEffects, duration)}
            selectedZoom={selectedZoom}
            onSelectZoom={setSelectedZoom}
            onUpdateZoom={updateZoomEffect}
            onDeleteZoom={deleteZoomEffect}
            isPlaying={isPlaying}
            onPlay={handlePlay}
            onPause={handlePause}
          />
        </div>
      </div>

      {showExportModal && (
        <ExportModal
          videoFile={videoFile}
          zoomEffects={zoomEffects} // Pass all zoom effects, let ExportModal handle filtering
          textOverlays={textOverlays}
          duration={duration}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {showSakImport && (
        <SakDataImport
          onImport={handleSakDataImport}
          onClose={() => setShowSakImport(false)}
        />
      )}

      {showAutoZoomRecorder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">AutoZoom Recorder</h2>
                <button
                  onClick={() => setShowAutoZoomRecorder(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>
              <AutoZoomRecorder onVideoImported={handleAutoZoomImport} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};