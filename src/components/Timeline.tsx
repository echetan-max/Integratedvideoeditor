import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';
import { ZoomEffect } from '../types';

interface TimelineProps {
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
  zoomEffects: ZoomEffect[];
  selectedZoom: ZoomEffect | null;
  onSelectZoom: (zoom: ZoomEffect) => void;
  onUpdateZoom: (zoom: ZoomEffect) => void;
  onDeleteZoom: (id: string) => void;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  duration,
  currentTime,
  onSeek,
  zoomEffects,
  selectedZoom,
  onSelectZoom,
  onUpdateZoom,
  onDeleteZoom,
  isPlaying,
  onPlay,
  onPause
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState<'playhead' | 'zoom-start' | 'zoom-end' | 'zoom-move' | null>(null);
  const [dragZoom, setDragZoom] = useState<ZoomEffect | null>(null);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTimeFromPosition = (clientX: number): number => {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const position = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(duration, position * duration));
  };

  const getPositionFromTime = (time: number): number => {
    // Ensure time is within valid range and duration is not zero
    if (duration <= 0) return 0;
    const position = (time / duration) * 100;
    console.log('Position calculation:', { time, duration, position });
    return Math.max(0, Math.min(100, position));
  };

  const handleMouseDown = (e: React.MouseEvent, type: 'playhead' | 'zoom-start' | 'zoom-end' | 'zoom-move', zoom?: ZoomEffect) => {
    e.preventDefault();
    setIsDragging(true);
    setDragType(type);
    setDragZoom(zoom || null);

    if (type === 'playhead') {
      const newTime = getTimeFromPosition(e.clientX);
      onSeek(newTime);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragType) return;

    const newTime = getTimeFromPosition(e.clientX);

    if (dragType === 'playhead') {
      onSeek(newTime);
    } else if (dragZoom) {
      let updatedZoom = { ...dragZoom };

      switch (dragType) {
        case 'zoom-start':
          updatedZoom.startTime = Math.max(0, Math.min(newTime, dragZoom.endTime - 0.1));
          break;
        case 'zoom-end':
          updatedZoom.endTime = Math.max(dragZoom.startTime + 0.1, Math.min(newTime, duration));
          break;
        case 'zoom-move':
          const zoomDuration = dragZoom.endTime - dragZoom.startTime;
          updatedZoom.startTime = Math.max(0, Math.min(newTime, duration - zoomDuration));
          updatedZoom.endTime = updatedZoom.startTime + zoomDuration;
          break;
      }

      onUpdateZoom(updatedZoom);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragType(null);
    setDragZoom(null);
  };

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (isDragging) return;
    const newTime = getTimeFromPosition(e.clientX);
    onSeek(newTime);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (isPlaying) {
          onPause();
        } else {
          onPlay();
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isPlaying, onPlay, onPause]);

  return (
    <div className="bg-gray-800 border-t border-gray-700 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-4">
          <button
            onClick={isPlaying ? onPause : onPlay}
            className="flex items-center justify-center w-10 h-10 bg-purple-600 hover:bg-purple-700 text-white rounded-full transition-colors"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <div className="text-sm text-gray-400">
            <span className="font-mono">{formatTime(currentTime)}</span>
            <span className="mx-2">/</span>
            <span className="font-mono">{formatTime(duration)}</span>
          </div>
        </div>
        <div className="text-xs text-gray-500">
          Press SPACE to play/pause
        </div>
      </div>
      
      <div
        ref={timelineRef}
        className="relative h-16 bg-gray-700 rounded-lg cursor-pointer select-none"
        onClick={handleTimelineClick}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Time markers */}
        <div className="absolute inset-x-0 top-0 h-4 flex">
          {Array.from({ length: Math.ceil(duration / 10) + 1 }, (_, i) => (
            <div
              key={i}
              className="absolute border-l border-gray-500 h-full text-xs text-gray-400 pl-1"
              style={{ left: `${(i * 10 / duration) * 100}%` }}
            >
              {i * 10}s
            </div>
          ))}
        </div>

        {/* Zoom effects container */}
        <div className="absolute inset-x-0 top-4 bottom-0">
          {zoomEffects.map((zoom) => {
            const isAutoZoom = zoom.type === 'autozoom';
            const startPos = getPositionFromTime(zoom.startTime);
            const width = getPositionFromTime(zoom.endTime - zoom.startTime);
            
            console.log('Rendering zoom effect:', { id: zoom.id, type: zoom.type, startPos, width });
            
            return (
              <div
                key={zoom.id}
                className={`absolute h-8 rounded cursor-pointer transition-all group ${
                  selectedZoom?.id === zoom.id
                    ? isAutoZoom
                      ? 'bg-blue-500 ring-2 ring-blue-300'
                      : 'bg-purple-500 ring-2 ring-purple-300'
                    : isAutoZoom
                      ? 'bg-blue-600 hover:bg-blue-500'
                      : 'bg-purple-600 hover:bg-purple-500'
                }`}
                style={{
                  left: `${startPos}%`,
                  width: `${width}%`
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectZoom(zoom);
                }}
                onMouseDown={(e) => handleMouseDown(e, 'zoom-move', zoom)}
              >
                {/* Resize handles */}
                <div
                  className={`absolute left-0 top-0 w-2 h-full cursor-w-resize opacity-0 hover:opacity-100 ${
                    isAutoZoom ? 'bg-blue-400' : 'bg-purple-400'
                  }`}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    handleMouseDown(e, 'zoom-start', zoom);
                  }}
                />
                <div
                className={`absolute right-0 top-0 w-2 h-full cursor-e-resize opacity-0 hover:opacity-100 ${
                  isAutoZoom ? 'bg-blue-400' : 'bg-purple-400'
                }`}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleMouseDown(e, 'zoom-end', zoom);
                }}
              />
              {/* Delete button - appears on hover */}
              <button
                className="absolute left-1 top-1 w-4 h-4 bg-red-600 hover:bg-red-700 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteZoom(zoom.id);
                }}
                title="Delete zoom"
              >
                ×
              </button>
              <div className="px-2 py-1 text-xs text-white truncate flex items-center space-x-1">
                  <span>{isAutoZoom ? '🤖' : '🔍'}</span>
                  <span>Zoom {zoom.scale}x</span>
                  {isAutoZoom && <span className="text-blue-200">(Auto)</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Playhead */}
        <div
          className="absolute top-0 w-0.5 h-full bg-white cursor-ew-resize z-10"
          style={{ left: `${getPositionFromTime(currentTime)}%` }}
          onMouseDown={(e) => handleMouseDown(e, 'playhead')}
        >
          <div className="absolute -top-1 -left-2 w-4 h-4 bg-white rounded-full border-2 border-gray-800" />
        </div>
      </div>
    </div>
  );
};