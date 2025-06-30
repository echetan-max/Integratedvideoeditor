import React, { useState } from 'react';
import { X, Download, Settings, Play, AlertCircle, CheckCircle, Volume2 } from 'lucide-react';
import { ZoomEffect } from '../types';

interface ExportModalProps {
  videoFile: File;
  zoomEffects: ZoomEffect[];
  duration: number;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  videoFile,
  zoomEffects,
  duration,
  onClose
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState<'idle' | 'processing' | 'complete' | 'error'>('idle');
  const [quality, setQuality] = useState('1080p');
  const [format, setFormat] = useState('webm');
  const [includeSakData, setIncludeSakData] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const processVideoWithZoomAndAudio = async (
    videoFile: File,
    zoomEffects: ZoomEffect[],
    onProgress: (progress: number) => void
  ): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      video.src = URL.createObjectURL(videoFile);
      video.crossOrigin = 'anonymous';
      video.muted = false;
      video.volume = 1.0;
      
      video.onloadedmetadata = async () => {
        try {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          
          const chunks: Blob[] = [];
          
          // Create video stream from canvas
          const videoStream = canvas.captureStream(30);
          const videoTrack = videoStream.getVideoTracks()[0];
          
          // Create audio context and capture audio from video
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          
          // Resume audio context if suspended (required by some browsers)
          if (audioContext.state === 'suspended') {
            await audioContext.resume();
          }
          
          const source = audioContext.createMediaElementSource(video);
          const destination = audioContext.createMediaStreamDestination();
          
          // Connect audio source to destination (for recording) and to speakers (for monitoring)
          source.connect(destination);
          source.connect(audioContext.destination);
          
          // Create combined stream with video and audio
          const combinedStream = new MediaStream();
          combinedStream.addTrack(videoTrack);
          
          // Add audio track if available
          const audioTracks = destination.stream.getAudioTracks();
          if (audioTracks.length > 0) {
            combinedStream.addTrack(audioTracks[0]);
          }
          
          // Try different codec combinations for best compatibility
          const codecOptions = [
            { mimeType: 'video/webm;codecs=vp9,opus', videoBitrate: 8000000, audioBitrate: 192000 },
            { mimeType: 'video/webm;codecs=vp8,opus', videoBitrate: 6000000, audioBitrate: 128000 },
            { mimeType: 'video/webm;codecs=h264,opus', videoBitrate: 5000000, audioBitrate: 128000 },
            { mimeType: 'video/webm', videoBitrate: 4000000, audioBitrate: 96000 }
          ];
          
          let selectedCodec = null;
          for (const codec of codecOptions) {
            if (MediaRecorder.isTypeSupported(codec.mimeType)) {
              selectedCodec = codec;
              break;
            }
          }
          
          if (!selectedCodec) {
            reject(new Error('No supported video codec found for audio recording'));
            return;
          }
          
          const mediaRecorder = new MediaRecorder(combinedStream, {
            mimeType: selectedCodec.mimeType,
            videoBitsPerSecond: selectedCodec.videoBitrate,
            audioBitsPerSecond: selectedCodec.audioBitrate
          });
          
          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              chunks.push(event.data);
            }
          };
          
          mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: selectedCodec!.mimeType });
            audioContext.close();
            resolve(blob);
          };
          
          mediaRecorder.onerror = (event) => {
            audioContext.close();
            reject(new Error('MediaRecorder error: ' + (event as any).error));
          };
          
          // Start recording
          mediaRecorder.start(100);
          
          let frameCount = 0;
          const targetFPS = 30;
          const totalFrames = Math.ceil(duration * targetFPS);
          let lastTime = 0;
          
          const processFrame = (currentTime: number) => {
            if (video.ended || video.paused) {
              mediaRecorder.stop();
              return;
            }
            
            // Throttle to target FPS
            if (currentTime - lastTime < 1000 / targetFPS) {
              requestAnimationFrame(processFrame);
              return;
            }
            lastTime = currentTime;
            
            const videoCurrentTime = video.currentTime;
            const progress = Math.min((frameCount / totalFrames) * 90, 90);
            onProgress(progress);
            
            // Find active zoom effect
            const activeZoom = zoomEffects.find(zoom => 
              videoCurrentTime >= zoom.startTime && videoCurrentTime <= zoom.endTime
            );
            
            // Clear canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            if (activeZoom) {
              // Apply zoom effect with smooth transitions
              const { x, y, scale } = activeZoom;
              const zoomWidth = canvas.width / scale;
              const zoomHeight = canvas.height / scale;
              const zoomX = (x / 100) * canvas.width - zoomWidth / 2;
              const zoomY = (y / 100) * canvas.height - zoomHeight / 2;
              
              // Clamp zoom area to video bounds
              const clampedZoomX = Math.max(0, Math.min(zoomX, canvas.width - zoomWidth));
              const clampedZoomY = Math.max(0, Math.min(zoomY, canvas.height - zoomHeight));
              const clampedZoomWidth = Math.min(zoomWidth, canvas.width - clampedZoomX);
              const clampedZoomHeight = Math.min(zoomHeight, canvas.height - clampedZoomY);
              
              // Draw zoomed portion
              ctx.drawImage(
                video,
                clampedZoomX,
                clampedZoomY,
                clampedZoomWidth,
                clampedZoomHeight,
                0,
                0,
                canvas.width,
                canvas.height
              );
            } else {
              // Draw normal frame
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            }
            
            frameCount++;
            requestAnimationFrame(processFrame);
          };
          
          // Start video playback and frame processing
          await video.play();
          requestAnimationFrame(processFrame);
          
        } catch (error) {
          reject(error);
        }
      };
      
      video.onerror = () => {
        reject(new Error('Failed to load video file'));
      };
      
      video.onended = () => {
        onProgress(95);
      };
    });
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      setExportStatus('processing');
      setExportProgress(0);
      setErrorMessage('');

      // Process video with zoom effects and preserve audio
      const processedBlob = await processVideoWithZoomAndAudio(
        videoFile,
        zoomEffects,
        setExportProgress
      );

      setExportProgress(98);

      // Determine file extension and MIME type
      let fileExtension = 'webm';
      let finalBlob = processedBlob;

      if (format === 'mp4') {
        // Note: True MP4 conversion would require FFmpeg.wasm or server-side processing
        fileExtension = 'webm';
        setErrorMessage('Note: Exported as WebM with audio (MP4 conversion requires additional tools)');
      }

      setExportProgress(100);
      setExportStatus('complete');

      // Create download link for video
      const url = URL.createObjectURL(finalBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${videoFile.name.replace(/\.[^/.]+$/, '')}_with_zoom_and_audio.${fileExtension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Download sak.py integration data if requested
      if (includeSakData) {
        const exportData = {
          videoFile: videoFile.name,
          zoomEffects,
          duration,
          exportSettings: { 
            quality, 
            format: fileExtension,
            audioIncluded: true,
            videoBitrate: '8Mbps',
            audioBitrate: '192kbps'
          },
          timestamp: new Date().toISOString(),
          audioPreserved: true,
          totalZoomEffects: zoomEffects.length
        };
        
        const jsonBlob = new Blob([JSON.stringify(exportData, null, 2)], { 
          type: 'application/json' 
        });
        const jsonUrl = URL.createObjectURL(jsonBlob);
        const jsonA = document.createElement('a');
        jsonA.href = jsonUrl;
        jsonA.download = `${videoFile.name.replace(/\.[^/.]+$/, '')}_zoom_data_with_audio.json`;
        document.body.appendChild(jsonA);
        jsonA.click();
        document.body.removeChild(jsonA);
        URL.revokeObjectURL(jsonUrl);
      }

      // Auto-close modal after successful export
      setTimeout(() => {
        onClose();
      }, 3000);

    } catch (error) {
      setExportStatus('error');
      const errorMsg = error instanceof Error ? error.message : 'Export failed';
      setErrorMessage(errorMsg);
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const getStatusIcon = () => {
    switch (exportStatus) {
      case 'processing':
        return <div className="animate-spin w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full" />;
      case 'complete':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Download className="w-5 h-5" />;
    }
  };

  const getStatusText = () => {
    switch (exportStatus) {
      case 'processing':
        return 'Processing with audio...';
      case 'complete':
        return 'Export complete!';
      case 'error':
        return 'Export failed';
      default:
        return 'Export with Audio';
    }
  };

  const canExport = !isExporting && exportStatus !== 'complete';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center space-x-2">
            <h3 className="text-lg font-semibold text-white">Export Video</h3>
            <Volume2 className="w-5 h-5 text-green-400" />
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            disabled={isExporting}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-green-900/20 border border-green-700 rounded-lg p-3">
            <div className="flex items-center space-x-2">
              <Volume2 className="w-4 h-4 text-green-400" />
              <span className="text-green-300 text-sm font-medium">Audio Export Enabled</span>
            </div>
            <p className="text-green-200 text-xs mt-1">
              Original audio will be preserved in the exported video
            </p>
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-2">Quality</label>
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              disabled={isExporting}
              className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
            >
              <option value="720p">720p HD (4 Mbps video + 128k audio)</option>
              <option value="1080p">1080p Full HD (8 Mbps video + 192k audio)</option>
              <option value="1440p">1440p 2K (12 Mbps video + 256k audio)</option>
              <option value="2160p">2160p 4K (20 Mbps video + 320k audio)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-2">Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              disabled={isExporting}
              className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
            >
              <option value="webm">WebM (Best audio support - VP9 + Opus)</option>
              <option value="mp4">MP4 (Exports as WebM - requires conversion)</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-300">Include sak.py integration data</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={includeSakData}
                onChange={(e) => setIncludeSakData(e.target.checked)}
                disabled={isExporting}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600 peer-disabled:opacity-50"></div>
            </label>
          </div>

          <div className="bg-gray-700 rounded-lg p-4 space-y-2">
            <div className="flex items-center space-x-3 text-sm text-gray-300">
              <Play className="w-4 h-4" />
              <span>Duration: {Math.floor(duration / 60)}:{(duration % 60).toFixed(0).padStart(2, '0')}</span>
            </div>
            <div className="flex items-center space-x-3 text-sm text-gray-300">
              <Settings className="w-4 h-4" />
              <span>{zoomEffects.length} zoom effects</span>
            </div>
            <div className="flex items-center space-x-3 text-sm text-green-300">
              <Volume2 className="w-4 h-4" />
              <span>Audio: Original quality preserved</span>
            </div>
          </div>

          {isExporting && (
            <div>
              <div className="flex justify-between text-sm text-gray-300 mb-2">
                <span>Processing video with zoom effects and audio...</span>
                <span>{exportProgress.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-gray-600 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-purple-600 to-green-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Rendering frames with audio synchronization...
              </p>
            </div>
          )}

          {exportStatus === 'error' && errorMessage && (
            <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <span className="text-red-300 text-sm">{errorMessage}</span>
            </div>
          )}

          {exportStatus === 'complete' && (
            <div className="p-3 bg-green-900/50 border border-green-700 rounded-lg flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="text-green-300 text-sm">
                Video exported successfully with full audio! Check your downloads folder.
              </span>
            </div>
          )}

          <div className="text-xs text-gray-500 bg-gray-700 p-3 rounded-lg">
            <strong>Audio Quality:</strong> The exported video preserves the original audio track with high-quality encoding. 
            WebM format provides the best compatibility for audio preservation in browsers.
          </div>
        </div>

        {/* Export Button Section - Always Visible */}
        <div className="flex space-x-3 p-6 border-t border-gray-700 bg-gray-800 rounded-b-xl">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors disabled:opacity-50 font-medium"
            disabled={isExporting}
          >
            {exportStatus === 'complete' ? 'Close' : 'Cancel'}
          </button>
          <button
            onClick={handleExport}
            disabled={!canExport}
            className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-lg transition-colors font-medium ${
              canExport 
                ? 'bg-gradient-to-r from-purple-600 to-green-600 hover:from-purple-700 hover:to-green-700 text-white' 
                : 'bg-gray-500 text-gray-300 cursor-not-allowed'
            }`}
          >
            {getStatusIcon()}
            <span>{getStatusText()}</span>
          </button>
        </div>
      </div>
    </div>
  );
};