import React, { forwardRef, useEffect, useRef, useState, useImperativeHandle } from 'react';
import { Play, Pause, Volume2, Maximize, VolumeX } from 'lucide-react';
import { ZoomEffect, TextOverlay } from '../types';

interface VideoPlayerProps {
  src: string;
  currentTime: number;
  isPlaying: boolean;
  onTimeUpdate: (time: number) => void;
  onLoadedMetadata: (duration: number) => void;
  onPlay: () => void;
  onPause: () => void;
  currentZoom: ZoomEffect | null;
  textOverlays: TextOverlay[];
  onVideoClick: (x: number, y: number) => void;
}

export interface VideoPlayerRef {
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
}

export const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(
  ({ src, currentTime, isPlaying, onTimeUpdate, onLoadedMetadata, onPlay, onPause, currentZoom, textOverlays, onVideoClick }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const videoWrapperRef = useRef<HTMLDivElement>(null);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isVideoReady, setIsVideoReady] = useState(false);
    const [videoError, setVideoError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useImperativeHandle(ref, () => ({
      play: () => {
        if (videoRef.current && isVideoReady) {
          videoRef.current.play().catch(console.error);
        }
      },
      pause: () => {
        if (videoRef.current) {
          videoRef.current.pause();
        }
      },
      seek: (time: number) => {
        if (videoRef.current && isVideoReady) {
          videoRef.current.currentTime = time;
        }
      }
    }));

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      const handleLoadedMetadata = () => {
        console.log('Video metadata loaded:', {
          duration: video.duration,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          src: video.src
        });
        setIsVideoReady(true);
        setVideoError(null);
        setIsLoading(false);
        onLoadedMetadata(video.duration);
      };

      const handleTimeUpdate = () => {
        onTimeUpdate(video.currentTime);
      };

      const handlePlay = () => {
        onPlay();
      };

      const handlePause = () => {
        onPause();
      };

      const handleLoadedData = () => {
        console.log('Video data loaded successfully');
        setIsVideoReady(true);
      };

      const handleError = (e: Event) => {
        console.error('Video loading error:', e);
        console.error('Video error details:', video.error);
        console.error('Video src:', video.src);
        const errorMessage = video.error?.message || 'Unknown error';
        setVideoError(errorMessage);
        alert(`Error loading video: ${errorMessage}`);
      };

      const handleCanPlay = () => {
        console.log('Video can play');
      };

      const handleCanPlayThrough = () => {
        console.log('Video can play through');
      };

      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('timeupdate', handleTimeUpdate);
      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);
      video.addEventListener('loadeddata', handleLoadedData);
      video.addEventListener('error', handleError);
      video.addEventListener('canplay', handleCanPlay);
      video.addEventListener('canplaythrough', handleCanPlayThrough);

      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('timeupdate', handleTimeUpdate);
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('loadeddata', handleLoadedData);
        video.removeEventListener('error', handleError);
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('canplaythrough', handleCanPlayThrough);
      };
    }, [src, onTimeUpdate, onLoadedMetadata, onPlay, onPause]);

    // Reset video state when src changes
    useEffect(() => {
      setIsVideoReady(false);
      setVideoError(null);
      setIsLoading(true);
      console.log('Video src changed to:', src);
    }, [src]);

    useEffect(() => {
      const video = videoRef.current;
      if (!video || !isVideoReady) return;

      if (isPlaying) {
        video.play().catch(console.error);
      } else {
        video.pause();
      }
    }, [isPlaying, isVideoReady]);

    useEffect(() => {
      const video = videoRef.current;
      if (!video || !isVideoReady) return;

      if (Math.abs(video.currentTime - currentTime) > 0.1) {
        video.currentTime = currentTime;
      }
    }, [currentTime, isVideoReady]);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      video.volume = isMuted ? 0 : volume;
    }, [volume, isMuted]);

    const handleVideoClick = (e: React.MouseEvent<HTMLVideoElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      onVideoClick(x, y);
    };

    const togglePlayPause = () => {
      if (isPlaying) {
        onPause();
      } else {
        onPlay();
      }
    };

    const toggleMute = () => {
      setIsMuted(!isMuted);
    };

    const toggleFullscreen = async () => {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    };

    useEffect(() => {
      const handleFullscreenChange = () => {
        setIsFullscreen(!!document.fullscreenElement);
      };
      document.addEventListener('fullscreenchange', handleFullscreenChange);
      return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const getTransformStyle = () => {
      if (!currentZoom) return {};
      
      const { x, y, scale } = currentZoom;
      console.log('Applying zoom effect:', { x, y, scale, transition: currentZoom.transition });
      
      // Calculate the offset to keep the zoom point centered
      const offsetX = (50 - x) * (scale - 1);
      const offsetY = (50 - y) * (scale - 1);
      
      const style = {
        transform: `scale(${scale}) translate(${offsetX}%, ${offsetY}%)`,
        transformOrigin: 'center center',
        transition: currentZoom.transition === 'smooth' ? 'transform 0.3s ease-out' : 'none'
      };
      
      console.log('Applied transform style:', style);
      return style;
    };

    const getZoomIndicatorPosition = () => {
      if (!currentZoom || !videoRef.current || !videoWrapperRef.current) {
        return { left: '50%', top: '50%' };
      }

      return {
        left: `${currentZoom.x}%`,
        top: `${currentZoom.y}%`
      };
    };

    return (
      <div ref={containerRef} className="flex-1 bg-black relative group">
        {/* Video Wrapper with Overflow Hidden to Contain Zoom */}
        <div 
          ref={videoWrapperRef}
          className="absolute inset-0 flex items-center justify-center overflow-hidden"
        >
          {/* Loading Indicator */}
          {!isVideoReady && !videoError && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
              <div className="text-white text-center">
                <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p>Loading video...</p>
                <p className="text-sm text-gray-400 mt-2">{src}</p>
              </div>
            </div>
          )}

          {/* Error Display */}
          {videoError && (
            <div className="absolute inset-0 flex items-center justify-center bg-red-900/50">
              <div className="text-white text-center p-6 bg-red-800 rounded-lg">
                <h3 className="text-lg font-semibold mb-2">Video Loading Error</h3>
                <p className="text-red-200 mb-4">{videoError}</p>
                <p className="text-sm text-gray-300">File: {src}</p>
                <button 
                  onClick={() => {
                    setVideoError(null);
                    setIsLoading(true);
                    if (videoRef.current) {
                      videoRef.current.load();
                    }
                  }}
                  className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Video Container that handles the zoom transform */}
          <div 
            className="relative"
            style={getTransformStyle()}
          >
            <video
              ref={videoRef}
              src={src}
              className="max-w-full max-h-full cursor-pointer block"
              onClick={handleVideoClick}
              preload="metadata"
              playsInline
              crossOrigin="anonymous"
              muted={isMuted}
              controls={false}
              onLoadStart={() => setIsLoading(true)}
            />
            
            {/* Zoom Position Indicator - positioned relative to video */}
            {currentZoom && isVideoReady && (
              <div
                className="absolute w-3 h-3 bg-purple-500 border-2 border-white rounded-full transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10"
                style={getZoomIndicatorPosition()}
              />
            )}

            {/* Text Overlays */}
            {textOverlays.map((textOverlay) => {
              const isActive = currentTime >= textOverlay.startTime && currentTime <= textOverlay.endTime;
              if (!isActive) return null;

              return (
                <div
                  key={textOverlay.id}
                  className="absolute pointer-events-none z-20"
                  style={{
                    left: `${textOverlay.x}%`,
                    top: `${textOverlay.y}%`,
                    transform: 'translate(-50%, -50%)',
                    fontFamily: textOverlay.fontFamily,
                    fontSize: `${textOverlay.fontSize}px`,
                    color: textOverlay.color,
                    backgroundColor: textOverlay.backgroundColor,
                    padding: `${textOverlay.padding}px`,
                    borderRadius: `${textOverlay.borderRadius}px`,
                    whiteSpace: 'pre-wrap',
                    textAlign: 'center',
                    textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                    boxShadow: textOverlay.backgroundColor ? '2px 2px 8px rgba(0,0,0,0.5)' : 'none',
                    maxWidth: '80%',
                    wordWrap: 'break-word'
                  }}
                >
                  {textOverlay.text}
                </div>
              );
            })}
          </div>
        </div>

        {/* Video Controls Overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={togglePlayPause}
                className="text-white hover:text-purple-400 transition-colors"
                disabled={!isVideoReady}
              >
                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
              </button>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={toggleMute}
                  className="text-white hover:text-purple-400 transition-colors"
                >
                  {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-20 accent-purple-500"
                />
              </div>
            </div>
            
            <button
              onClick={toggleFullscreen}
              className="text-white hover:text-purple-400 transition-colors"
            >
              <Maximize className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Loading indicator */}
        {!isVideoReady && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-white text-lg">Loading video...</div>
          </div>
        )}

        {/* Click instruction */}
        {!currentZoom && isVideoReady && (
          <div className="absolute top-4 left-4 bg-black/60 text-white px-3 py-2 rounded-lg text-sm opacity-60">
            Click on video to add zoom effect
          </div>
        )}

        {/* Zoom info overlay */}
        {currentZoom && (
          <div className="absolute top-4 right-4 bg-black/60 text-white px-3 py-2 rounded-lg text-sm">
            Zoom: {currentZoom.scale.toFixed(1)}x at ({currentZoom.x.toFixed(0)}%, {currentZoom.y.toFixed(0)}%)
          </div>
        )}
      </div>
    );
  }
);

VideoPlayer.displayName = 'VideoPlayer';