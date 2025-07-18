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

  const deleteAllZoomEffects = () => {
    setZoomEffects([]);
    setSelectedZoom(null);
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

  const getCurrentZoom = () => {
    return getInterpolatedZoom(currentTime, zoomEffects);
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

  const handleExportComplete = (exportedBlob: Blob, format: string) => {
    const newFile = new File([exportedBlob], `exported_video.${format}`, { type: `video/${format}` });
    setVideoFile(newFile);
    setShowExportModal(false);
    console.log('Exported video re-imported successfully.');
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
    // Set the video file
    setVideoFile(videoFile);
    
    // Convert clicks data to zoom effects using the specified format
    if (clicksData.clicks && Array.isArray(clicksData.clicks)) {
      // Get the first click's timestamp as reference
      const firstClickTime = Math.min(...clicksData.clicks.map((click: any) => click.time || 0));
      
      const newZoomEffects: ZoomEffect[] = clicksData.clicks.map((click: any, index: number) => {
        // Normalize time relative to first click
        const normalizedTime = (click.time || 0) - firstClickTime;
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
      
      setZoomEffects(newZoomEffects);
      console.log('Auto zoom effects imported:', newZoomEffects);
      
      // Select the first zoom effect
      if (newZoomEffects.length > 0) {
        setSelectedZoom(newZoomEffects[0]);
      }
    }
    
    // Close the recorder modal
    setShowAutoZoomRecorder(false);
  };

  const handleClicksImport = (clicksData: any) => {
    if (clicksData.clicks && Array.isArray(clicksData.clicks)) {
      // Get the first click's timestamp as reference
      const firstClickTime = Math.min(...clicksData.clicks.map((click: any) => click.time || 0));
      
      const newZoomEffects: ZoomEffect[] = clicksData.clicks.map((click: any, index: number) => {
        // Normalize time relative to first click
        const normalizedTime = (click.time || 0) - firstClickTime;
        
        // Create zoom effect with normalized time
        const zoomEffect: ZoomEffect = {
          id: click.id || `imported-${index}-${Date.now()}`,
          startTime: normalizedTime,
          endTime: normalizedTime + (click.duration || 2.0),
          x: (click.x / clicksData.width) * 100,
          y: (click.y / clicksData.height) * 100,
          scale: click.zoomLevel || 2.0,
          transition: 'smooth',
          type: 'autozoom',
          originalData: click
        };
        
        console.log('Created zoom effect:', zoomEffect);
        return zoomEffect;
      });
      
      setZoomEffects(prev => {
        const combined = [...prev, ...newZoomEffects];
        console.log('Updated zoom effects:', combined);
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
            currentZoom={getCurrentZoom()}
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
            zoomEffects={zoomEffects}
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
          zoomEffects={zoomEffects}
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