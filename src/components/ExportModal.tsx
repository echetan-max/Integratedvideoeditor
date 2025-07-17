import React, { useState } from 'react';
import { X, Download, CheckCircle, AlertCircle } from 'lucide-react';
import { ZoomEffect, TextOverlay } from '../types';

interface ExportModalProps {
  videoFile: File;
  zoomEffects: ZoomEffect[];
  textOverlays: TextOverlay[];
  duration: number;
  onClose: () => void;
}

// --- Helper: Linear interpolation ---
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// --- Robust zoom interpolation (matches preview exactly) ---
function getInterpolatedZoom(time: number, zooms: ZoomEffect[]) {
  if (!zooms.length) return { x: 50, y: 50, scale: 1.0 };
  const sorted = [...zooms].sort((a, b) => a.startTime - b.startTime);

  // Before first zoom
  if (time <= sorted[0].startTime) return sorted[0];

  // After last zoom
  if (time >= sorted[sorted.length - 1].endTime) return sorted[sorted.length - 1];

  // Find the zoom window we're in
  for (let i = 0; i < sorted.length; i++) {
    const zA = sorted[i];
    const zB = sorted[i + 1];

    // Static hold within a zoom
    if (time >= zA.startTime && time <= zA.endTime) return zA;

    // Interpolate between zA (end) and zB (start)
    if (zB && time > zA.endTime && time < zB.startTime) {
      const t = (time - zA.endTime) / (zB.startTime - zA.endTime);
      return {
        x: lerp(zA.x, zB.x, t),
        y: lerp(zA.y, zB.y, t),
        scale: lerp(zA.scale, zB.scale, t),
      };
    }
  }
  return sorted[sorted.length - 1];
}

// --- ExportModal Component ---
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

  // --- Step 1: Bake all edits to a webm (browser, canvas+audio) ---
  async function bakeEditedWebM(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.src = URL.createObjectURL(videoFile);
      video.crossOrigin = 'anonymous';
      video.preload = 'auto';
      video.muted = false;

      video.onloadedmetadata = async () => {
        const w = video.videoWidth, h = video.videoHeight;
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d')!;

        // Audio context setup
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const srcNode = audioCtx.createMediaElementSource(video);
        const dest = audioCtx.createMediaStreamDestination();
        srcNode.connect(dest);

        // MediaRecorder setup
        const stream = canvas.captureStream(30);
        dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
        const rec = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9,opus' });
        const chunks: Blob[] = [];
        rec.ondataavailable = e => e.data.size && chunks.push(e.data);
        rec.onstop = () => {
          audioCtx.close();
          resolve(new Blob(chunks, { type: 'video/webm' }));
        };

        rec.start(100);

        // --- Frame Rendering Loop ---
        let stopped = false;
        let lastDrawTime = -1;

        function draw() {
          if (stopped) return;
          const t = video.currentTime;

          // Key: always use *interpolated* zoom at current time
          const { x: zx, y: zy, scale: zs } = getInterpolatedZoom(t, zoomEffects);

          ctx.clearRect(0, 0, w, h);
          const zw = w / zs, zh = h / zs;
          ctx.drawImage(
            video,
            Math.max(0, Math.min(w * zx / 100 - zw / 2, w - zw)),
            Math.max(0, Math.min(h * zy / 100 - zh / 2, h - zh)),
            Math.min(zw, w), Math.min(zh, h), 0, 0, w, h
          );

          // Draw text overlays
          textOverlays.filter(tx => t >= tx.startTime && t <= tx.endTime).forEach(tx => {
            ctx.save();
            ctx.font = `${tx.fontSize || 24}px ${tx.fontFamily || 'Arial'}`;
            ctx.fillStyle = tx.color || "#fff";
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            if (tx.backgroundColor) {
              const tm = ctx.measureText(tx.text);
              ctx.fillStyle = tx.backgroundColor;
              ctx.fillRect(
                w * tx.x / 100 - tm.width / 2 - 8,
                h * tx.y / 100 - (tx.fontSize || 24) / 2 - 8,
                tm.width + 16, (tx.fontSize || 24) + 16
              );
              ctx.fillStyle = tx.color || "#fff";
            }
            ctx.fillText(tx.text, w * tx.x / 100, h * tx.y / 100);
            ctx.restore();
          });

          // Progress
          setExportProgress(Math.floor((t / video.duration) * 80));

          // Keep drawing until video ends or exporting stops
          if (!video.paused && !video.ended && !stopped) {
            requestAnimationFrame(draw);
          }
        }

        // --- Safeguards ---
        let failTimeout = setTimeout(() => {
          stopped = true;
          rec.stop();
          reject(new Error("Rendering timed out."));
        }, (video.duration + 10) * 1000);

        video.onended = () => {
          if (!stopped) {
            stopped = true;
            clearTimeout(failTimeout);
            setExportProgress(90);
            setTimeout(() => rec.stop(), 100); // allow for last chunk
          }
        };

        video.onerror = () => {
          stopped = true;
          clearTimeout(failTimeout);
          rec.stop();
          reject(new Error("Failed to load video!"));
        };

        video.onpause = () => {
          // Don't stop recording! Just keep waiting
        };

        video.onplay = () => {
          if (!stopped) requestAnimationFrame(draw);
        };

        // Start playback and draw loop
        try {
          await video.play();
        } catch (e) {
          stopped = true;
          clearTimeout(failTimeout);
          rec.stop();
          reject(new Error("Playback error: " + e));
        }
      };

      video.onerror = () => reject(new Error("Failed to load video metadata!"));
    });
  }

  // --- Step 2: Send webm to backend and auto-download mp4 ---
  async function sendWebmAndDownloadMp4(webmBlob: Blob) {
    const formData = new FormData();
    formData.append('file', webmBlob, 'video.webm');
    const response = await fetch('http://localhost:5001/convert', {
      method: 'POST',
      body: formData
    });
    if (!response.ok) throw new Error('MP4 conversion failed');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'exported.mp4';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 600);
  }

  // --- Step 3: Main export handler ---
  const handleExport = async () => {
    setIsExporting(true); setExportStatus('processing'); setExportProgress(0); setErrorMessage('');
    try {
      setErrorMessage("Rendering all edits (zooms, overlays, audio)...");
      const webmBlob = await bakeEditedWebM();
      setExportProgress(90);
      setErrorMessage("Converting to MP4 and downloading...");
      await sendWebmAndDownloadMp4(webmBlob);
      setExportProgress(100);
      setExportStatus('complete');
      setErrorMessage('');
    } catch (e: any) {
      setExportStatus('error');
      setErrorMessage(e.message || 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  // --- UI ---
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
                <span>Processing video with all edits...</span>
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
                Video exported and downloaded as MP4 with all edits!
              </span>
            </div>
          )}
        </div>
        <div className="flex space-x-3 p-6 border-t border-gray-700 bg-gray-800 rounded-b-xl">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
            disabled={isExporting}
          >{exportStatus === 'complete' ? 'Close' : 'Cancel'}</button>
          <button
            onClick={handleExport}
            disabled={isExporting || exportStatus === 'complete'}
            className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-lg transition-colors font-medium ${
              !isExporting && exportStatus !== 'complete'
                ? 'bg-gradient-to-r from-purple-600 to-green-600 hover:from-purple-700 hover:to-green-700 text-white'
                : 'bg-gray-500 text-gray-300 cursor-not-allowed'
            }`}
          >
            <Download className="w-5 h-5" />
            <span>{isExporting ? "Exporting..." : "Export with All Edits"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
