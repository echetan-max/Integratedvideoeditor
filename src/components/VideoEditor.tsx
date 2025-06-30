import React, { useState, useRef, useEffect } from 'react';
import { VideoPlayer, VideoPlayerRef } from './VideoPlayer';
import { Timeline } from './Timeline';
import { ZoomControls } from './ZoomControls';
import { Header } from './Header';
import { FileImport } from './FileImport';
import { ExportModal } from './ExportModal';
import { SakDataImport } from './SakDataImport';
import { AutoZoomRecorder } from './AutoZoomRecorder';
import { ZoomEffect } from '../types';

export const VideoEditor: React.FC = () => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoomEffects, setZoomEffects] = useState<ZoomEffect[]>([]);
  const [selectedZoom, setSelectedZoom] = useState<ZoomEffect | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSakImport, setShowSakImport] = useState(false);
  const [showAutoZoomRecorder, setShowAutoZoomRecorder] = useState(false);
  const [zoomEnabled, setZoomEnabled] = useState(true);
  const videoRef = useRef<VideoPlayerRef>(null);

  useEffect(() => {
    if (videoFile) {
      const url = URL.createObjectURL(videoFile);
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

  const addZoomEffect = (startTime: number, endTime: number, x: number, y: number, scale: number) => {
    const newZoom: ZoomEffect = {
      id: Date.now().toString(),
      startTime,
      endTime,
      x,
      y,
      scale,
      transition: 'smooth'
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

  const getCurrentZoom = (): ZoomEffect | null => {
    return zoomEffects.find(zoom => 
      currentTime >= zoom.startTime && currentTime <= zoom.endTime
    ) || null;
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
    // Set the video file
    setVideoFile(videoFile);
    
    // Convert clicks data to zoom effects using the specified format
    if (clicksData.clicks && Array.isArray(clicksData.clicks)) {
      const newZoomEffects: ZoomEffect[] = clicksData.clicks.map((click: any, index: number) => ({
        id: `autozoom-${index}-${Date.now()}`,
        startTime: click.time || 0, // time from click data
        endTime: (click.time || 0) + 2.0, // 2.0 second duration
        x: (click.x / clicksData.width) * 100, // centerX as percentage
        y: (click.y / clicksData.height) * 100, // centerY as percentage
        scale: 2.0, // zoomLevel 2.0
        transition: 'smooth' as const
      }));
      
      setZoomEffects(newZoomEffects);
      
      // Select the first zoom effect
      if (newZoomEffects.length > 0) {
        setSelectedZoom(newZoomEffects[0]);
      }
    }
    
    // Close the recorder modal
    setShowAutoZoomRecorder(false);
  };

  const resetProject = () => {
    setVideoFile(null);
    setZoomEffects([]);
    setSelectedZoom(null);
    setCurrentTime(0);
    setIsPlaying(false);
    setShowAutoZoomRecorder(false);
  };

  if (!videoFile) {
    return (
      <div>
        <FileImport 
          onFileSelect={setVideoFile}
          onSakImport={() => setShowSakImport(true)}
          onAutoZoomRecord={() => setShowAutoZoomRecorder(true)}
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
        onSakImport={() => setShowSakImport(true)}
        onAutoZoomRecord={() => setShowAutoZoomRecorder(true)}
      />
      
      <div className="flex-1 flex overflow-hidden">
        <ZoomControls
          zoomEnabled={zoomEnabled}
          onToggleZoom={setZoomEnabled}
          selectedZoom={selectedZoom}
          onUpdateZoom={updateZoomEffect}
          onDeleteZoom={deleteZoomEffect}
          onAddZoom={() => {
            const startTime = currentTime;
            const endTime = Math.min(currentTime + 2.0, duration); // 2.0 second duration
            addZoomEffect(startTime, endTime, 50, 50, 2.0); // 2.0 zoom level
          }}
          currentTime={currentTime}
          duration={duration}
        />
        
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
            currentZoom={zoomEnabled ? getCurrentZoom() : null}
            onVideoClick={(x, y) => {
              if (zoomEnabled && !selectedZoom) {
                const startTime = currentTime;
                const endTime = Math.min(currentTime + 2.0, duration); // 2.0 second duration
                addZoomEffect(startTime, endTime, x, y, 2.0); // 2.0 zoom level
              }
            }}
          />
          
          {/* Zoom List Section */}
          <div className="bg-gray-800 border-t border-gray-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-medium">All Zoom Effects ({zoomEffects.length})</h3>
              {zoomEffects.length > 0 && (
                <button
                  onClick={deleteAllZoomEffects}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
                >
                  🗑️ Clear All
                </button>
              )}
            </div>
            
            <div className="max-h-32 overflow-y-auto space-y-2">
              {zoomEffects.length === 0 ? (
                <p className="text-gray-400 text-sm">No zoom effects added yet</p>
              ) : (
                zoomEffects.map((zoom, index) => (
                  <div
                    key={zoom.id}
                    className={`flex items-center justify-between p-2 rounded ${
                      selectedZoom?.id === zoom.id ? 'bg-purple-600' : 'bg-gray-700'
                    } hover:bg-gray-600 transition-colors cursor-pointer`}
                    onClick={() => setSelectedZoom(zoom)}
                  >
                    <div className="flex-1">
                      <div className="text-white text-sm">
                        Zoom {index + 1}: {zoom.startTime.toFixed(1)}s - {zoom.endTime.toFixed(1)}s
                      </div>
                      <div className="text-gray-400 text-xs">
                        Position: ({zoom.x.toFixed(0)}%, {zoom.y.toFixed(0)}%) | Scale: {zoom.scale.toFixed(1)}x
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteZoomEffect(zoom.id);
                      }}
                      className="ml-2 px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
                    >
                      🗑️
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
          
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