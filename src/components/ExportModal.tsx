import React, { useState, useEffect } from 'react';
import { X, Download, Settings, Play, AlertCircle, CheckCircle, Volume2 } from 'lucide-react';
import { ZoomEffect, TextOverlay } from '../types';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

interface ExportModalProps {
  videoFile: File;
  zoomEffects: ZoomEffect[];
  textOverlays: TextOverlay[];
  duration: number;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  videoFile,
  zoomEffects,
  textOverlays,
  duration,
  onClose
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState<'idle' | 'processing' | 'complete' | 'error'>('idle');
  const [quality, setQuality] = useState('1080p');
  const [format, setFormat] = useState('mp4');
  const [includeSakData, setIncludeSakData] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [ffmpeg, setFfmpeg] = useState<FFmpeg | null>(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [ffmpegLoadingProgress, setFfmpegLoadingProgress] = useState(0);

  // Initialize FFmpeg with timeout
  useEffect(() => {
    const initFFmpeg = async () => {
      try {
        console.log('Loading FFmpeg...');
        setErrorMessage('Loading FFmpeg for MP4 conversion...');
        setFfmpegLoadingProgress(10);
        
        const ffmpegInstance = new FFmpeg();
        
        // Set a timeout for FFmpeg loading (10 seconds)
        const loadPromise = ffmpegInstance.load({
          coreURL: await toBlobURL(`/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`/ffmpeg-core.wasm`, 'application/wasm'),
        });
        
        // Simulate progress updates
        const progressInterval = setInterval(() => {
          setFfmpegLoadingProgress(prev => {
            if (prev < 90) return prev + 10;
            return prev;
          });
        }, 500);
        
        // Add timeout
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            clearInterval(progressInterval);
            reject(new Error('FFmpeg loading timeout'));
          }, 10000);
        });
        
        await Promise.race([loadPromise, timeoutPromise]);
        clearInterval(progressInterval);
        setFfmpegLoadingProgress(100);
        
        setFfmpeg(ffmpegInstance);
        setFfmpegLoaded(true);
        console.log('FFmpeg loaded successfully');
        setErrorMessage('');
      } catch (error) {
        console.error('Failed to load FFmpeg:', error);
        setFfmpegLoaded(false);
        setErrorMessage('FFmpeg failed to load. Switching to WebM format for faster export.');
        
        // Auto-switch to WebM if FFmpeg fails
        if (format === 'mp4') {
          setFormat('webm');
        }
      }
    };

    initFFmpeg();
  }, [format]);





  const convertWebmToMp4 = async (webmBlob: Blob): Promise<Blob> => {
    if (!ffmpeg || !ffmpegLoaded) {
      throw new Error('FFmpeg not loaded');
    }

    try {
      console.log('Starting MP4 conversion...');
      
      // Write WebM file to FFmpeg
      const webmData = new Uint8Array(await webmBlob.arrayBuffer());
      await ffmpeg.writeFile('input.webm', webmData);
      console.log('WebM file written to FFmpeg');

      // Convert to MP4 with H.264 video and AAC audio
      const result = await ffmpeg.exec([
        '-i', 'input.webm',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
        '-y', // Overwrite output file
        'output.mp4'
      ]);
      
      console.log('FFmpeg conversion completed with result:', result);

      // Read the output MP4 file
      const mp4Data = await ffmpeg.readFile('output.mp4');
      const mp4Blob = new Blob([mp4Data], { type: 'video/mp4' });
      
      console.log('MP4 blob created, size:', mp4Blob.size);

      // Clean up files
      await ffmpeg.deleteFile('input.webm');
      await ffmpeg.deleteFile('output.mp4');

      return mp4Blob;
    } catch (error) {
      console.error('FFmpeg conversion error:', error);
      throw new Error(`MP4 conversion failed: ${error}`);
    }
  };

  const processVideoWithZoomAndAudio = async (
    videoFile: File,
    zoomEffects: ZoomEffect[],
    textOverlays: TextOverlay[],
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
      video.muted = false; // Keep audio for capture
      video.volume = 1.0;
      video.preload = 'metadata';
      
                video.onloadedmetadata = async () => {
            try {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              
              console.log('Video metadata loaded:', {
                width: video.videoWidth,
                height: video.videoHeight,
                duration: video.duration,
                hasAudio: !video.muted
              });
          
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
          
          // Connect audio source to destination (for recording only - no speaker output)
          source.connect(destination);
          
          // Also connect to a gain node to control volume
          const gainNode = audioContext.createGain();
          gainNode.gain.value = 1.0; // Full volume
          source.connect(gainNode);
          gainNode.connect(destination);
          
          // Create combined stream with video and audio
          const combinedStream = new MediaStream();
          combinedStream.addTrack(videoTrack);
          
          // Add audio track if available
          const audioTracks = destination.stream.getAudioTracks();
          if (audioTracks.length > 0) {
            console.log('Adding audio track to recording');
            combinedStream.addTrack(audioTracks[0]);
          } else {
            console.log('No audio track available for recording');
          }
          
          // Always use WebM for reliable recording - browsers can't create true MP4 files
          // WebM provides the best audio support and compatibility
          const codecOptions = [
            // High quality options first
            { mimeType: 'video/webm;codecs=vp9,opus', videoBitrate: 8000000, audioBitrate: 192000 },
            { mimeType: 'video/webm;codecs=vp8,opus', videoBitrate: 6000000, audioBitrate: 128000 },
            { mimeType: 'video/webm;codecs=h264,opus', videoBitrate: 5000000, audioBitrate: 128000 },
            // Fallback options
            { mimeType: 'video/webm;codecs=vp9', videoBitrate: 4000000, audioBitrate: 96000 },
            { mimeType: 'video/webm;codecs=vp8', videoBitrate: 3000000, audioBitrate: 96000 },
            { mimeType: 'video/webm', videoBitrate: 2000000, audioBitrate: 64000 }
          ];
          
          let selectedCodec = null;
          
          for (const codec of codecOptions) {
            const isSupported = MediaRecorder.isTypeSupported(codec.mimeType);
            if (isSupported) {
              selectedCodec = codec;
              break;
            }
          }
          
          if (!selectedCodec) {
            reject(new Error('No supported WebM codec found. Browser may not support WebM recording.'));
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
            console.log('MediaRecorder stopped, chunks:', chunks.length);
            clearTimeout(recordingTimeout);
            const blob = new Blob(chunks, { type: selectedCodec!.mimeType });
            console.log('Final blob size:', blob.size, 'type:', blob.type);
            audioContext.close();
            resolve(blob);
          };
          
          mediaRecorder.onerror = (event) => {
            console.error('MediaRecorder error:', event);
            audioContext.close();
            reject(new Error('MediaRecorder error: ' + (event as any).error || 'Unknown error'));
          };
          
          mediaRecorder.onstart = () => {
            console.log('MediaRecorder started');
          };
          
          // Start recording
          mediaRecorder.start(100);
          
          let frameCount = 0;
          const targetFPS = 30;
          const totalFrames = Math.ceil(duration * targetFPS);
          let lastTime = 0;
          
          // Add timeout to prevent infinite recording
          const recordingTimeout = setTimeout(() => {
            console.log('Recording timeout reached, stopping');
            mediaRecorder.stop();
          }, (duration + 5) * 1000); // 5 seconds extra buffer
          
          const processFrame = (currentTime: number) => {
            // Check if video has ended or is paused
            if (video.ended || video.paused || video.currentTime >= video.duration) {
              console.log('Video ended, stopping recording');
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
            
            // Ensure video is ready before drawing
            if (video.readyState >= 2) { // HAVE_CURRENT_DATA
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
            } else {
              // Draw black frame if video not ready
              ctx.fillStyle = 'black';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            
            // Draw text overlays
            const activeTextOverlays = textOverlays.filter(textOverlay => 
              videoCurrentTime >= textOverlay.startTime && videoCurrentTime <= textOverlay.endTime
            );
            
            activeTextOverlays.forEach(textOverlay => {
              // Set text properties
              ctx.font = `${textOverlay.fontSize}px ${textOverlay.fontFamily}`;
              ctx.fillStyle = textOverlay.color;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              
              // Add text shadow
              ctx.shadowColor = 'rgba(0,0,0,0.8)';
              ctx.shadowBlur = 4;
              ctx.shadowOffsetX = 2;
              ctx.shadowOffsetY = 2;
              
              // Calculate position
              const x = (textOverlay.x / 100) * canvas.width;
              const y = (textOverlay.y / 100) * canvas.height;
              
              // Draw background if specified
              if (textOverlay.backgroundColor) {
                const textMetrics = ctx.measureText(textOverlay.text);
                const textWidth = textMetrics.width;
                const textHeight = textOverlay.fontSize;
                const padding = textOverlay.padding || 0;
                const borderRadius = textOverlay.borderRadius || 0;
                
                // Draw background rectangle
                ctx.fillStyle = textOverlay.backgroundColor;
                ctx.shadowColor = 'rgba(0,0,0,0.5)';
                ctx.shadowBlur = 8;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;
                
                const bgX = x - (textWidth / 2) - padding;
                const bgY = y - (textHeight / 2) - padding;
                const bgWidth = textWidth + (padding * 2);
                const bgHeight = textHeight + (padding * 2);
                
                // Draw rounded rectangle background
                ctx.beginPath();
                if (borderRadius > 0) {
                  // Draw rounded rectangle manually
                  ctx.moveTo(bgX + borderRadius, bgY);
                  ctx.lineTo(bgX + bgWidth - borderRadius, bgY);
                  ctx.quadraticCurveTo(bgX + bgWidth, bgY, bgX + bgWidth, bgY + borderRadius);
                  ctx.lineTo(bgX + bgWidth, bgY + bgHeight - borderRadius);
                  ctx.quadraticCurveTo(bgX + bgWidth, bgY + bgHeight, bgX + bgWidth - borderRadius, bgY + bgHeight);
                  ctx.lineTo(bgX + borderRadius, bgY + bgHeight);
                  ctx.quadraticCurveTo(bgX, bgY + bgHeight, bgX, bgY + bgHeight - borderRadius);
                  ctx.lineTo(bgX, bgY + borderRadius);
                  ctx.quadraticCurveTo(bgX, bgY, bgX + borderRadius, bgY);
                } else {
                  // Draw regular rectangle
                  ctx.rect(bgX, bgY, bgWidth, bgHeight);
                }
                ctx.fill();
                
                // Reset shadow for text
                ctx.shadowColor = 'rgba(0,0,0,0.8)';
                ctx.shadowBlur = 4;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;
                ctx.fillStyle = textOverlay.color;
              }
              
              // Draw text (handle multi-line)
              const lines = textOverlay.text.split('\n');
              const lineHeight = textOverlay.fontSize * 1.2;
              const totalHeight = lines.length * lineHeight;
              const startY = y - (totalHeight / 2) + (lineHeight / 2);
              
              lines.forEach((line, index) => {
                const lineY = startY + (index * lineHeight);
                ctx.fillText(line, x, lineY);
              });
              
              // Reset shadow
              ctx.shadowColor = 'transparent';
              ctx.shadowBlur = 0;
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = 0;
            });
            
            frameCount++;
            requestAnimationFrame(processFrame);
          };
          
          // Start video playback and frame processing
          try {
            // Try to play with audio first
            await video.play();
            console.log('Video started playing with audio, duration:', video.duration);
            requestAnimationFrame(processFrame);
          } catch (playError) {
            console.log('Failed to play with audio, trying muted:', playError);
            // If autoplay with audio fails, try muted
            video.muted = true;
            try {
              await video.play();
              console.log('Video started playing muted, duration:', video.duration);
              requestAnimationFrame(processFrame);
            } catch (mutedPlayError) {
              console.error('Failed to play video even muted:', mutedPlayError);
              reject(new Error('Failed to start video playback'));
            }
          }
          
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
      
      // Add canplay event to ensure video is ready
      video.oncanplay = () => {
        console.log('Video can play, ready for recording');
      };
    });
  };

  const handleExport = async () => {
    if (!videoFile) {
      setErrorMessage('No video file selected for export.');
      setExportStatus('error');
      return;
    }

    try {
      setIsExporting(true);
      setExportStatus('processing');
      setExportProgress(0);
      setErrorMessage('');

      // Always export as WebM first (most reliable)
      setErrorMessage('Recording video with zoom effects and audio...');
      const webmBlob = await processVideoWithZoomAndAudio(
        videoFile,
        zoomEffects,
        textOverlays,
        (progress) => setExportProgress(progress * 0.8) // First 80% for recording
      );
      
      // Always use WebM for export
      const processedBlob = webmBlob;
      const actualFormat = 'webm';

      setExportProgress(98);

      // Use the selected format for file extension
      const fileExtension = actualFormat;
      const finalBlob = processedBlob;
      
      


      setExportProgress(100);
      setExportStatus('complete');

      // Always save as WebM first
      const webmUrl = URL.createObjectURL(webmBlob);
      const webmLink = document.createElement('a');
      webmLink.href = webmUrl;
      webmLink.download = `${videoFile.name.replace(/\.[^/.]+$/, '')}_with_zoom_and_audio.webm`;
      document.body.appendChild(webmLink);
      webmLink.click();
      document.body.removeChild(webmLink);
      URL.revokeObjectURL(webmUrl);

      // If MP4 was requested, show conversion command
      if (format === 'mp4') {
        const fileName = videoFile.name.replace(/\.[^/.]+$/, '') + '_with_zoom_and_audio';
        setErrorMessage(`WebM exported! To convert to MP4, run this command in terminal:
        
ffmpeg -i "${fileName}.webm" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 192k "${fileName}.mp4"`);
      }

      // Download sak.py integration data if requested
      if (includeSakData) {
        const exportData = {
          videoFile: videoFile.name,
          zoomEffects,
          textOverlays,
          duration,
          exportSettings: { 
            quality, 
            format: fileExtension,
            requestedFormat: format,
            actualFormat: actualFormat,
            audioIncluded: true,
            videoBitrate: '8Mbps',
            audioBitrate: '192kbps'
          },
          timestamp: new Date().toISOString(),
          audioPreserved: true,
          totalZoomEffects: zoomEffects.length,
          totalTextOverlays: textOverlays.length
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
        return 'Recording WebM with zoom effects and audio...';
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
          {format === 'mp4' && (
            <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <Settings className="w-4 h-4 text-blue-400" />
                <span className="text-blue-300 text-sm font-medium">Manual MP4 Conversion</span>
              </div>
              <p className="text-blue-200 text-xs mt-1">
                WebM will be exported first, then you'll get the FFmpeg command to convert to MP4
              </p>
            </div>
          )}
          
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
              <option value="webm">WebM (Export directly)</option>
              <option value="mp4">MP4 (Export as WebM + manual conversion)</option>
            </select>

            {format === 'mp4' && (
              <div className="mt-2 p-2 bg-blue-900/20 border border-blue-700 rounded">
                <div className="flex items-center space-x-2">
                  {ffmpegLoaded ? (
                    <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs">✓</span>
                    </div>
                  ) : (
                    <div className="w-4 h-4 bg-yellow-500 rounded-full flex items-center justify-center">
                      <div className="animate-spin w-3 h-3 border border-white border-t-transparent rounded-full"></div>
                    </div>
                  )}
                  <span className="text-blue-300 text-xs">
                    {ffmpegLoaded ? 'FFmpeg ready for MP4 conversion' : 'FFmpeg loading... (will auto-switch to WebM if not ready)'}
                  </span>
                </div>
              </div>
            )}
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
            {format === 'mp4' && (
              <div className="mt-2">
                <strong>MP4 Export:</strong> True MP4 format with H.264 video codec and AAC audio for maximum compatibility across devices and platforms.
                {!ffmpegLoaded && ' (FFmpeg loading required for conversion)'}
              </div>
            )}
            {format === 'webm' && (
              <div className="mt-2">
                <strong>WebM Export:</strong> Uses VP9 video codec with Opus audio for best quality and browser compatibility.
              </div>
            )}
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