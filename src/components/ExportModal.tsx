import React, { useState } from 'react';
import { X, Download } from 'lucide-react';
import { getInterpolatedZoom, ZoomEffect, lerp } from '../types';

interface TextOverlay {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  x: number;
  y: number;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
  backgroundColor?: string;
  padding?: string | number;
  borderRadius?: string | number;
  border?: string;
  boxShadow?: string;
}

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
  const [errorMessage, setErrorMessage] = useState('');

  // --- Server-side export with fallback to client-side ---
  async function serverSideExport(): Promise<void> {
    try {
      setErrorMessage('Preparing video for server-side processing...');
      setExportProgress(10);

      // Use FormData instead of base64 to avoid stack overflow
      const formData = new FormData();
      formData.append('videoFile', videoFile);
      formData.append('duration', duration.toString());
      formData.append('zoomEffects', JSON.stringify(zoomEffects));
      formData.append('textOverlays', JSON.stringify(textOverlays));
      formData.append('fps', '30');
      
      setExportProgress(20);
      setErrorMessage('Sending to server for processing...');

      console.log('Sending export request to server...');
      const response = await fetch('http://localhost:5002/export-with-effects', {
        method: 'POST',
        body: formData,
      });
      console.log('Server response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      setExportProgress(80);
      setErrorMessage('Downloading processed video...');

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'exported_video.mp4';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setExportProgress(100);
      setErrorMessage('Export completed successfully!');
    } catch (err: any) {
      console.error('Server-side export failed:', err);
      console.error('Error details:', {
        message: err.message,
        stack: err.stack,
        name: err.name
      });
      throw err; // Re-throw to trigger fallback
    }
  }

  // --- Robust client-side fallback export with real progress and error handling ---
  async function clientSideExportFallback(): Promise<void> {
    try {
      console.log('Exporting with zoomEffects:', zoomEffects);
      console.log('Exporting with textOverlays:', textOverlays);
      
      // Verify zoom effects are properly structured
      const validZooms = zoomEffects.filter(z => 
        typeof z.startTime === 'number' && 
        typeof z.endTime === 'number' && 
        typeof z.x === 'number' && 
        typeof z.y === 'number' && 
        typeof z.scale === 'number' &&
        z.startTime < z.endTime
      );
      
      console.log('Valid zooms for export:', validZooms.length, 'out of', zoomEffects.length);
      validZooms.forEach((zoom, index) => {
        console.log(`Zoom ${index}:`, {
          id: zoom.id,
          startTime: zoom.startTime.toFixed(3),
          endTime: zoom.endTime.toFixed(3),
          x: zoom.x.toFixed(2),
          y: zoom.y.toFixed(2),
          scale: zoom.scale.toFixed(3)
        });
      });
      
      // Helper function for smooth zoom interpolation (export only)
      function getSmoothExportZoom(time: number, zooms: ZoomEffect[]): ZoomEffect {
        if (!zooms.length) {
          return {
            id: 'default',
            startTime: 0,
            endTime: Number.MAX_SAFE_INTEGER,
            x: 50,
            y: 50,
            scale: 1.0,
            transition: 'smooth',
          };
        }

        const sorted = [...zooms].sort((a, b) => a.startTime - b.startTime);
        
        if (time < sorted[0].startTime) {
          return {
            id: 'default',
            startTime: 0,
            endTime: sorted[0].startTime,
            x: 50,
            y: 50,
            scale: 1.0,
            transition: 'smooth',
          };
        }

        if (time > sorted[sorted.length - 1].endTime) {
          return {
            id: 'default',
            startTime: sorted[sorted.length - 1].endTime,
            endTime: Number.MAX_SAFE_INTEGER,
            x: 50,
            y: 50,
            scale: 1.0,
            transition: 'smooth',
          };
        }

        for (let i = 0; i < sorted.length; i++) {
          const currentZoom = sorted[i];
          
          if (time >= currentZoom.startTime && time <= currentZoom.endTime) {
            // Use longer, smoother transitions for better quality
            const transitionDuration = 2.0; // 2 seconds for very smooth transitions
            const actualTransitionDuration = Math.min(transitionDuration, (currentZoom.endTime - currentZoom.startTime) / 2);
            
            // Transition from normal view to zoom
            if (time < currentZoom.startTime + actualTransitionDuration) {
              const progress = Math.max(0, Math.min(1, (time - currentZoom.startTime) / actualTransitionDuration));
              // Use very smooth easing function for natural motion
              const easedProgress = 1 - Math.pow(1 - progress, 5); // Ease-out quintic for very smooth motion
              
              // Limit scale to reasonable bounds (1.0 to 3.0 for better screen fitting)
              const maxScale = Math.min(3.0, currentZoom.scale);
              const safeScale = Math.max(1.0, Math.min(3.0, maxScale));
              
              return {
                id: currentZoom.id,
                startTime: currentZoom.startTime,
                endTime: currentZoom.endTime,
                x: lerp(50, currentZoom.x, easedProgress),
                y: lerp(50, currentZoom.y, easedProgress),
                scale: lerp(1.0, safeScale, easedProgress),
                transition: 'smooth',
              };
            }
            
            // Transition from zoom to normal view
            if (time > currentZoom.endTime - actualTransitionDuration) {
              const progress = Math.max(0, Math.min(1, (currentZoom.endTime - time) / actualTransitionDuration));
              // Use very smooth easing function for natural motion
              const easedProgress = 1 - Math.pow(1 - progress, 5); // Ease-out quintic for very smooth motion
              
              // Limit scale to reasonable bounds
              const maxScale = Math.min(3.0, currentZoom.scale);
              const safeScale = Math.max(1.0, Math.min(3.0, maxScale));
              
              return {
                id: currentZoom.id,
                startTime: currentZoom.startTime,
                endTime: currentZoom.endTime,
                x: lerp(50, currentZoom.x, easedProgress),
                y: lerp(50, currentZoom.y, easedProgress),
                scale: lerp(1.0, safeScale, easedProgress),
                transition: 'smooth',
              };
            }
            
            // Full zoom state with safe scale
            const maxScale = Math.min(3.0, currentZoom.scale);
            const safeScale = Math.max(1.0, Math.min(3.0, maxScale));
            
            return {
              ...currentZoom,
              scale: safeScale
            };
          }
        }

        return {
          id: 'default',
          startTime: 0,
          endTime: Number.MAX_SAFE_INTEGER,
          x: 50,
          y: 50,
          scale: 1.0,
          transition: 'smooth',
        };
      }
      
      setErrorMessage('Loading video for browser processing...');
      setExportProgress(10);

      const video = document.createElement('video');
      video.src = URL.createObjectURL(videoFile);
      video.muted = true;
      video.playsInline = true;

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Video load timeout')), 10000);
        video.onloadedmetadata = () => {
          clearTimeout(timeout);
          setExportProgress(15);
          resolve();
        };
        video.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('Video load failed'));
        };
      });

      setErrorMessage('Setting up canvas for frame processing...');
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false }); // Optimize for performance
      if (!ctx) throw new Error('Failed to get canvas context');

      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      // Note: Canvas capture doesn't include audio, so we'll use mux-audio endpoint
      const chunks: Blob[] = [];
      recorder.ondataavailable = e => chunks.push(e.data);
      const recordingPromise = new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: 'video/webm' }));
        };
      });

      setExportProgress(20);
      setErrorMessage('Starting frame-by-frame processing...');
      recorder.start();

      const fps = 30;
      const actualDuration = video.duration;
      
      // Calculate exact frame count to match original video duration precisely
      // Use Math.ceil to ensure we capture the full duration
      const totalFrames = Math.ceil(actualDuration * fps);
      
      console.log('Export settings:', {
        actualDuration,
        totalFrames,
        fps,
        expectedDuration: totalFrames / fps,
        zoomEffectsCount: zoomEffects.length
      });

      // Process all zooms once - outside the loop for consistency
      const exportReadyZooms = zoomEffects
        .filter(z => z.startTime < actualDuration && z.endTime > 0)
        .map(z => ({
          ...z,
          startTime: Math.max(0, Math.min(z.startTime, actualDuration)),
          endTime: Math.max(0, Math.min(z.endTime, actualDuration)),
        }))
        .sort((a, b) => a.startTime - b.startTime);

      // Debug: Log all zooms being processed
      console.log('[EXPORT ZOOMS DEBUG]', {
        originalZoomEffects: zoomEffects.length,
        exportReadyZooms: exportReadyZooms.length,
        actualDuration,
        allZooms: exportReadyZooms.map(z => ({
          id: z.id,
          startTime: z.startTime.toFixed(3),
          endTime: z.endTime.toFixed(3),
          x: z.x.toFixed(2),
          y: z.y.toFixed(2),
          scale: z.scale.toFixed(3)
        }))
      });

      // Test zoom interpolation for key frames
      const testTimes = [0, actualDuration / 4, actualDuration / 2, actualDuration * 3 / 4, actualDuration];
      console.log('Testing zoom interpolation at key times:');
      testTimes.forEach(time => {
        const testZoom = getSmoothExportZoom(time, exportReadyZooms);
        console.log(`Time ${time.toFixed(3)}s:`, {
          id: testZoom.id,
          x: testZoom.x.toFixed(2),
          y: testZoom.y.toFixed(2),
          scale: testZoom.scale.toFixed(3)
        });
      });

      // Pre-calculate all frame times for precise timing
      const frameTimes: number[] = [];
      for (let frame = 0; frame < totalFrames; frame++) {
        const frameTime = Math.min(frame / fps, actualDuration);
        frameTimes.push(frameTime);
      }

      // Pre-calculate zoom states for each frame for consistency (using smooth export zoom)
      const frameZooms: ZoomEffect[] = [];
      for (let i = 0; i < frameTimes.length; i++) {
        const frameTime = frameTimes[i];
        const interpolatedZoom = getSmoothExportZoom(frameTime, exportReadyZooms);
        frameZooms.push(interpolatedZoom);
      }

      // Pre-calculate text overlay visibility for each frame
      const frameTextOverlays: TextOverlay[][] = [];
      for (let i = 0; i < frameTimes.length; i++) {
        const frameTime = frameTimes[i];
        const activeOverlays = textOverlays.filter(overlay => 
          frameTime >= overlay.startTime && frameTime <= overlay.endTime
        );
        frameTextOverlays.push(activeOverlays);
      }

      async function seekTo(time: number) {
        return new Promise<void>((resolve) => {
          let resolved = false;
          const onSeeked = () => {
            if (!resolved) {
              resolved = true;
              video.removeEventListener('seeked', onSeeked);
              resolve();
            }
          };
          video.addEventListener('seeked', onSeeked);
          video.currentTime = time;
          setTimeout(() => {
            if (!resolved) {
              video.removeEventListener('seeked', onSeeked);
              resolve();
            }
          }, 100);
        });
      }

      for (let frame = 0; frame < totalFrames; frame++) {
        // Use pre-calculated frame time for consistency
        const currentTime = frameTimes[frame];
        const interpolatedZoom = frameZooms[frame];
        const activeTextOverlays = frameTextOverlays[frame];
        
        // Debug: Track which zoom is active for each frame (reduced frequency)
        if (frame % 90 === 0) { // Log every 3 seconds at 30fps
          console.log('[ZOOM ACTIVE]', {
            frame,
            currentTime: currentTime.toFixed(3),
            activeZoomId: interpolatedZoom.id,
            activeZoomScale: interpolatedZoom.scale.toFixed(3),
            activeZoomPosition: `${interpolatedZoom.x.toFixed(1)}%, ${interpolatedZoom.y.toFixed(1)}%`,
            activeTextOverlays: activeTextOverlays.length
          });
        }
        
        // Debug: Track zoom changes (only log changes, not every frame)
        if (frame > 0) {
          const previousZoom = frameZooms[frame - 1];
          if (previousZoom.id !== interpolatedZoom.id) {
            console.log('[ZOOM CHANGE]', {
              frame,
              time: currentTime.toFixed(3),
              from: previousZoom.id,
              to: interpolatedZoom.id,
              fromScale: previousZoom.scale.toFixed(3),
              toScale: interpolatedZoom.scale.toFixed(3)
            });
          }
        }
        
        // Optimized seek operation with better timing
        if (Math.abs(video.currentTime - currentTime) > 0.05) { // Reduced threshold for more precise seeking
          video.currentTime = currentTime;
          // Wait for video to be ready with shorter timeout
          let tries = 0;
          while (video.readyState < 2 && tries < 10) {
            await new Promise(r => setTimeout(r, 2));
            tries++;
          }
        }
        
        // Ensure we don't process beyond the actual video duration
        if (currentTime > actualDuration) {
          break;
        }
        
        ctx.clearRect(0, 0, width, height);
        ctx.save();
        
        // Apply zoom transformation with precise calculations
        const { x, y, scale } = interpolatedZoom;
        if (scale !== 1.0 || x !== 50 || y !== 50) {
          // Use the smooth export zoom calculation for better transitions
          // This ensures the export has smooth transitions while preview stays responsive
          
          // Ensure scale is within bounds and properly calculated (same as smooth export)
          const safeScale = Math.max(1.0, Math.min(3.0, scale)); // Limit to 3.0 for better screen fitting
          
          // Calculate offsets for proper screen fitting
          const offsetX = (50 - x) * (safeScale - 1);
          const offsetY = (50 - y) * (safeScale - 1);
          
          // Apply transformation to center the zoom properly
          ctx.save();
          ctx.translate(width / 2, height / 2);
          ctx.scale(safeScale, safeScale);
          ctx.translate(-width / 2 + (offsetX / 100) * width, -height / 2 + (offsetY / 100) * height);
          
          // Draw the video frame with proper scaling
          ctx.drawImage(video, 0, 0, width, height);
          ctx.restore();
        } else {
          // No zoom - draw normally
          ctx.drawImage(video, 0, 0, width, height);
        }
        
        // Apply text overlays with precise timing
        for (const overlay of activeTextOverlays) {
          ctx.save();
          ctx.fillStyle = overlay.color || '#ffffff';
          ctx.font = `bold ${overlay.fontSize || 24}px ${overlay.fontFamily || 'Arial, sans-serif'}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          // Add shadow for better visibility
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 4;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 2;
          
          const x = (overlay.x / 100) * width;
          const y = (overlay.y / 100) * height;
          
          // Draw background if specified
          if (overlay.backgroundColor && overlay.backgroundColor !== 'transparent') {
            const textMetrics = ctx.measureText(overlay.text);
            const padding = Number(overlay.padding) || 0;
            const bgWidth = textMetrics.width + (padding * 2);
            const bgHeight = (overlay.fontSize || 24) + (padding * 2);
            
            ctx.fillStyle = overlay.backgroundColor;
            ctx.fillRect(
              x - bgWidth / 2,
              y - bgHeight / 2,
              bgWidth,
              bgHeight
            );
            ctx.fillStyle = overlay.color || '#ffffff';
          }
          
          ctx.fillText(overlay.text, x, y);
          ctx.restore();
        }
        
        const frameProgress = Math.floor((frame / totalFrames) * 70);
        setExportProgress(20 + frameProgress);
        setErrorMessage(`Processing frame ${frame + 1} of ${totalFrames} (${Math.floor((frame / totalFrames) * 100)}%)`);
        
        // Log summary on last frame
        if (frame === totalFrames - 1) {
          console.log('[EXPORT SUMMARY]', {
            totalFrames,
            totalZooms: exportReadyZooms.length,
            zooms: exportReadyZooms.map((z: any) => ({
              id: z.id,
              startTime: z.startTime.toFixed(3),
              endTime: z.endTime.toFixed(3),
              x: z.x.toFixed(2),
              y: z.y.toFixed(2),
              scale: z.scale.toFixed(3)
            }))
          });
        }
      }
      
      // Stop the recorder immediately after the last frame to avoid extra frames
      recorder.stop();
      console.log('Recording stopped, waiting for blob...');
      
      const webmBlob = await recordingPromise;
      console.log('WebM blob created, size:', webmBlob.size);
      
      // Debug: Check if WebM blob is valid
      if (webmBlob.size === 0) {
        throw new Error('WebM blob is empty - zoom processing failed');
      }
      
      // Debug: Create a temporary URL to test the WebM
      const webmUrl = URL.createObjectURL(webmBlob);
      console.log('WebM URL created:', webmUrl);
      
      // Debug: Test if WebM can be played
      const testVideo = document.createElement('video');
      testVideo.src = webmUrl;
      testVideo.muted = true;
      testVideo.playsInline = true;
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          URL.revokeObjectURL(webmUrl);
          reject(new Error('WebM test timeout'));
        }, 5000);
        
        testVideo.onloadedmetadata = () => {
          clearTimeout(timeout);
          console.log('WebM test successful - duration:', testVideo.duration, 'size:', testVideo.videoWidth, 'x', testVideo.videoHeight);
          URL.revokeObjectURL(webmUrl);
          resolve();
        };
        
        testVideo.onerror = () => {
          clearTimeout(timeout);
          URL.revokeObjectURL(webmUrl);
          reject(new Error('WebM test failed - invalid video data'));
        };
      });
      
      // Optional: Download WebM for testing (uncomment to test)
      // const webmDownloadUrl = URL.createObjectURL(webmBlob);
      // const webmLink = document.createElement('a');
      // webmLink.href = webmDownloadUrl;
      // webmLink.download = `test_webm_${Date.now()}.webm`;
      // document.body.appendChild(webmLink);
      // webmLink.click();
      // document.body.removeChild(webmLink);
      // URL.revokeObjectURL(webmDownloadUrl);
      
      setExportProgress(95);
      setErrorMessage('Processing with original audio...');
      
      // Send both rendered video and original audio for muxing
      const formData = new FormData();
      formData.append('rendered', webmBlob, 'rendered.webm');
      formData.append('original', videoFile);
      
      console.log('Sending to server for audio muxing...');
      const response = await fetch('http://localhost:5002/mux-audio', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server error:', errorText);
        throw new Error(`Audio muxing failed: ${errorText}`);
      }
      
      setExportProgress(98);
      setErrorMessage('Downloading final video...');
      const finalMp4Blob = await response.blob();
      console.log('Final MP4 blob received, size:', finalMp4Blob.size);
      const url = URL.createObjectURL(finalMp4Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `exported_video_${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 1000);
      setExportProgress(100);
      setErrorMessage('Export completed successfully!');
      console.log('Export completed successfully!');
    } catch (err: any) {
      setExportProgress(100);
      setErrorMessage('Export failed: ' + (err.message || err.toString()));
      throw err;
    }
  }

  const handleExport = async () => {
    setIsExporting(true);
    setExportStatus('processing');
    setExportProgress(0);
    setErrorMessage('');
    try {
      if (!videoFile) {
        throw new Error('No video file selected');
      }
      if (duration <= 0) {
        throw new Error('Invalid video duration');
      }
      
      // Debug: Log all zooms being passed to export
      console.log('[EXPORT INPUT DEBUG]', {
        totalZoomEffects: zoomEffects.length,
        duration,
        allZooms: zoomEffects.map(z => ({
          id: z.id,
          startTime: z.startTime.toFixed(3),
          endTime: z.endTime.toFixed(3),
          x: z.x.toFixed(2),
          y: z.y.toFixed(2),
          scale: z.scale.toFixed(3)
        }))
      });
      
      // Always use client-side export for accurate zoom effects and timeline edits
      console.log('Using client-side export for accurate timeline effects');
      await clientSideExportFallback();
      setExportStatus('complete');
    } catch (e: any) {
      console.error('Export failed:', e);
      setExportStatus('error');
      setErrorMessage(e.message || 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">Export Video</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white" disabled={isExporting}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-6">
          {isExporting && (
            <div>
              <div className="flex justify-between text-sm text-gray-300 mb-2">
                <span>Exporting video with effects...</span>
                <span>{exportProgress.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-gray-600 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-purple-600 to-green-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
            </div>
          )}
          {errorMessage && (
            <div className={`p-4 rounded-lg ${
              exportStatus === 'complete' 
                ? 'bg-green-500 bg-opacity-20 text-green-100' 
                : 'bg-red-500 bg-opacity-20 text-red-100'
            }`}>
              <p className="text-sm">{errorMessage}</p>
            </div>
          )}
          <div className="flex justify-end space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors"
              disabled={isExporting}
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              disabled={isExporting}
            >
              {isExporting ? (
                <div className="flex items-center">
                  <svg className="animate-spin mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Exporting...
                </div>
              ) : (
                <div className="flex items-center">
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </div>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};