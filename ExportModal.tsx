import React, { useState } from 'react';
import { X, Download } from 'lucide-react';
import { ZoomEffect, lerp, getInterpolatedZoom, TextOverlay } from '../types';

interface ExportModalProps {
  videoFile: File;
  zoomEffects: ZoomEffect[];
  textOverlays: TextOverlay[];
  duration: number;
  onClose: () => void;
}

const SERVER_URL = 'https://server-mbgv.onrender.com';

// Function to filter zoom effects for export (same logic as VideoEditor)
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
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const handleClose = () => {
    if (isExporting && abortController) {
      abortController.abort();
    }
    onClose();
  };

  const handleExport = async () => {
    setIsExporting(true);
    setExportStatus('processing');
    setExportProgress(0);
    setErrorMessage('');
    
    const controller = new AbortController();
    setAbortController(controller);
    
    try {
      if (!videoFile) throw new Error('No video file selected');
      if (duration <= 0) throw new Error('Invalid video duration');

      setErrorMessage('Loading video...');
      const video = document.createElement('video');
      video.src = URL.createObjectURL(videoFile);
      video.muted = true;
      video.playsInline = true;

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Video load timeout')), 10000);
        video.onloadedmetadata = () => { clearTimeout(timeout); resolve(); };
        video.onerror = () => { clearTimeout(timeout); reject(new Error('Video load error')); };
      });

      const fps = 30;
      const width = video.videoWidth;
      const height = video.videoHeight;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      const stream = canvas.captureStream(fps);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      const recordingPromise = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
      });

      recorder.start();
      const totalFrames = Math.ceil(duration * fps);

      for (let frame = 0; frame < totalFrames; frame++) {
        // Check if export was cancelled
        if (controller.signal.aborted) {
          recorder.stop();
          throw new Error('Export cancelled');
        }

        const t = frame / fps;
        video.currentTime = t;
        await new Promise((r) => {
          const onSeeked = () => { video.removeEventListener('seeked', onSeeked); r(true); };
          video.addEventListener('seeked', onSeeked);
        });

        // Use the same interpolation function as the preview
        const filteredZooms = getExportReadyZooms(zoomEffects, duration);
        const zoom = getInterpolatedZoom(t, filteredZooms);
        
        ctx.save();
        ctx.clearRect(0, 0, width, height);
        
        // Apply zoom transformation - use the same logic as VideoPlayer
        const scale = Math.max(1.0, Math.min(zoom.scale, 5.0));
        const offsetX = (50 - zoom.x) * (scale - 1);
        const offsetY = (50 - zoom.y) * (scale - 1);
        
        // Apply the same transformation as VideoPlayer
        ctx.translate(width / 2, height / 2);
        ctx.scale(scale, scale);
        ctx.translate(offsetX * width / 100, offsetY * height / 100);
        ctx.drawImage(video, -width / 2, -height / 2, width, height);
        ctx.restore();

        // Apply text overlays - match VideoPlayer styling exactly
        textOverlays.filter(o => t >= o.startTime && t <= o.endTime).forEach((overlay) => {
          ctx.save();
          
          // Set font to match VideoPlayer
          const fontSize = overlay.fontSize || 24;
          const fontFamily = overlay.fontFamily || 'Arial, sans-serif';
          ctx.font = `bold ${fontSize}px ${fontFamily}`;
          
          // Set text alignment to match VideoPlayer
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          // Calculate position to match VideoPlayer's translate(-50%, -50%)
          const x = (overlay.x / 100) * width;
          const y = (overlay.y / 100) * height;
          
          // Draw background if specified (to match VideoPlayer's backgroundColor)
          if (overlay.backgroundColor && overlay.backgroundColor !== 'transparent') {
            ctx.fillStyle = overlay.backgroundColor;
            const padding = typeof overlay.padding === 'number' ? overlay.padding : 0;
            const borderRadius = overlay.borderRadius || 0;
            
            // Create background rectangle
            const bgWidth = ctx.measureText(overlay.text).width + (padding * 2);
            const bgHeight = fontSize + (padding * 2);
            const bgX = x - bgWidth / 2;
            const bgY = y - bgHeight / 2;
            
            // Draw rectangle (simplified without rounded corners for compatibility)
            ctx.fillRect(bgX, bgY, bgWidth, bgHeight);
            
            // Add box shadow if background exists
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
          }
          
          // Draw text shadow to match VideoPlayer's textShadow
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 4;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 2;
          
          // Draw the text
          ctx.fillStyle = overlay.color || '#ffffff';
          ctx.fillText(overlay.text, x, y);
          
          ctx.restore();
        });

        setExportProgress(10 + Math.floor((frame / totalFrames) * 70));
        await new Promise(r => setTimeout(r, 1000 / fps));
      }

      recorder.stop();
      const webmBlob = await recordingPromise;
      if (!webmBlob || webmBlob.size === 0) throw new Error("WebM export failed.");

      setExportProgress(85);
      setErrorMessage('Processing video...');

      // Check if export was cancelled before processing
      if (controller.signal.aborted) {
        throw new Error('Export cancelled');
      }

      // Try with audio first
      try {
        const formData = new FormData();
        formData.append('rendered', webmBlob, 'rendered.webm');
        formData.append('original', videoFile);

        const timeoutId = setTimeout(() => controller.abort(), 57000); // 57s timeout

        const response = await fetch(`${SERVER_URL}/mux-audio`, {
          method: 'POST',
          body: formData,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const mp4Blob = await response.blob();
        const url = URL.createObjectURL(mp4Blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `exported_${Date.now()}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (error) {
        // If muxing with audio fails, try without audio
        setErrorMessage('Audio processing failed, exporting without audio...');
        
        const fallbackForm = new FormData();
        fallbackForm.append('file', webmBlob, 'video.webm');
        
        const fallbackResponse = await fetch(`${SERVER_URL}/convert`, {
          method: 'POST',
          body: fallbackForm,
          signal: controller.signal
        });

        if (!fallbackResponse.ok) {
          throw new Error('Video export failed completely. Please try again.');
        }

        const fallbackBlob = await fallbackResponse.blob();
        const url = URL.createObjectURL(fallbackBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `exported_${Date.now()}_no_audio.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      setExportProgress(100);
      setExportStatus('complete');
      setErrorMessage('Export complete');
    } catch (err) {
      setExportProgress(100);
      setExportStatus('error');
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      setErrorMessage(errorMessage);
      console.error('Export error:', err);
    } finally {
      setIsExporting(false);
      setAbortController(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">Export Video</h3>
          <button onClick={handleClose} className="text-gray-400 hover:text-white">
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
              onClick={handleClose}
              className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors"
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