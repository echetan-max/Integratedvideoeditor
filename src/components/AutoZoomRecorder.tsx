import React, { useState, useEffect } from 'react';
import { Play, Square, Wifi, WifiOff, Download, FileVideo, AlertCircle, CheckCircle } from 'lucide-react';

interface AutoZoomRecorderProps {
  onVideoImported: (videoFile: File, clicksData: any) => void;
}

interface RecordingStatus {
  is_recording: boolean;
  files: {
    video: boolean;
    clicks: boolean;
  };
}

export const AutoZoomRecorder: React.FC<AutoZoomRecorderProps> = ({ onVideoImported }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState<'idle' | 'recording' | 'processing' | 'complete' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus | null>(null);
  const [hasAutoImported, setHasAutoImported] = useState(false);

  const API_BASE_URL = 'http://localhost:5000';

  // Check API connection on component mount
  useEffect(() => {
    checkApiConnection();
    const interval = setInterval(checkApiConnection, 5000); // Check every 5 seconds
    return () => clearInterval(interval);
  }, []);

  // Poll recording status when recording
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(checkRecordingStatus, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  // Automatically import recording when ready
  useEffect(() => {
    if (
      status === 'complete' &&
      recordingStatus?.files.video &&
      recordingStatus?.files.clicks &&
      !hasAutoImported
    ) {
      importRecording();
      setHasAutoImported(true);
    }
    // Reset auto-import flag if user starts a new recording
    if (status === 'recording' || status === 'processing') {
      setHasAutoImported(false);
    }
  }, [status, recordingStatus, hasAutoImported]);

  const checkApiConnection = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/health`);
      if (response.ok) {
        setIsConnected(true);
        setMessage('Connected to AutoZoom backend');
      } else {
        setIsConnected(false);
        setMessage('Backend API not responding');
      }
    } catch (error) {
      setIsConnected(false);
      setMessage('Backend API not available - make sure Flask server is running');
    }
  };

  const checkRecordingStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/recording-status`);
      if (response.ok) {
        const status: RecordingStatus = await response.json();
        setRecordingStatus(status);
        
        if (!status.is_recording && isRecording) {
          // Recording has stopped
          setIsRecording(false);
          if (status.files.video && status.files.clicks) {
            setStatus('complete');
            setMessage('Recording completed! Files are ready for import.');
          } else {
            setStatus('error');
            setMessage('Recording completed but files are missing.');
          }
        }
      }
    } catch (error) {
      console.error('Error checking recording status:', error);
    }
  };

  const startRecording = async () => {
    try {
      setStatus('recording');
      setMessage('Starting recording...');
      
      const response = await fetch(`${API_BASE_URL}/start-recording`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();
      
      if (result.success) {
        setIsRecording(true);
        setMessage('Recording started! Click around in your target application.');
      } else {
        setStatus('error');
        setMessage(result.message || 'Failed to start recording');
      }
    } catch (error) {
      setStatus('error');
      setMessage('Failed to connect to backend API');
      console.error('Start recording error:', error);
    }
  };

  const stopRecording = async () => {
    try {
      setStatus('processing');
      setMessage('Stopping recording and processing video...');
      
      const response = await fetch(`${API_BASE_URL}/stop-recording`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();
      
      if (result.success) {
        setIsRecording(false);
        if (result.files.video && result.files.clicks) {
          setStatus('complete');
          setMessage('Recording completed successfully!');
        } else {
          setStatus('error');
          setMessage('Recording stopped but output files are missing');
        }
      } else {
        setStatus('error');
        setMessage(result.message || 'Failed to stop recording');
      }
    } catch (error) {
      setStatus('error');
      setMessage('Failed to connect to backend API');
      console.error('Stop recording error:', error);
    }
  };

  const importRecording = async () => {
    try {
      setMessage('Importing video and click data...');
      
      // Fetch the video file
      const videoResponse = await fetch(`${API_BASE_URL}/video`);
      if (!videoResponse.ok) {
        throw new Error('Failed to fetch video file');
      }
      
      const videoBlob = await videoResponse.blob();
      const videoFile = new File([videoBlob], 'autozoom_recording.mp4', { type: 'video/mp4' });
      
      // Fetch the clicks data
      const clicksResponse = await fetch(`${API_BASE_URL}/clicks`);
      if (!clicksResponse.ok) {
        throw new Error('Failed to fetch clicks data');
      }
      
      const clicksData = await clicksResponse.json();
      
      // Import into the video editor
      onVideoImported(videoFile, clicksData);
      
      setStatus('idle');
      setMessage('Recording imported successfully!');
      
    } catch (error) {
      setStatus('error');
      setMessage('Failed to import recording: ' + (error as Error).message);
      console.error('Import error:', error);
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'recording':
        return <div className="animate-pulse w-3 h-3 bg-red-500 rounded-full" />;
      case 'processing':
        return <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />;
      case 'complete':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  const canStartRecording = isConnected && !isRecording && status !== 'processing';
  const canStopRecording = isRecording;
  const canImport = status === 'complete' && recordingStatus?.files.video && recordingStatus?.files.clicks;

  return (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
          <FileVideo className="w-5 h-5 text-purple-400" />
          <span>AutoZoom Recorder</span>
        </h3>
        <div className="flex items-center space-x-2">
          {isConnected ? (
            <Wifi className="w-4 h-4 text-green-500" />
          ) : (
            <WifiOff className="w-4 h-4 text-red-500" />
          )}
          <span className={`text-xs ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {/* Status Message */}
        <div className="flex items-center space-x-2 text-sm text-gray-300">
          {getStatusIcon()}
          <span>{message || 'Ready to record'}</span>
        </div>

        {/* Recording Controls */}
        <div className="flex space-x-3">
          <button
            onClick={startRecording}
            disabled={!canStartRecording}
            className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-lg transition-colors ${
              canStartRecording
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-gray-600 text-gray-400 cursor-not-allowed'
            }`}
          >
            <Play className="w-4 h-4" />
            <span>Start Recording</span>
          </button>

          <button
            onClick={stopRecording}
            disabled={!canStopRecording}
            className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-lg transition-colors ${
              canStopRecording
                ? 'bg-gray-600 hover:bg-gray-700 text-white'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Square className="w-4 h-4" />
            <span>Stop Recording</span>
          </button>
        </div>

        {/* Import Button */}
        {canImport && (
          <button
            onClick={importRecording}
            className="w-full flex items-center justify-center space-x-2 py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Import Recording to Editor</span>
          </button>
        )}

        {/* Recording Status */}
        {recordingStatus && (
          <div className="text-xs text-gray-400 bg-gray-700 p-3 rounded-lg">
            <div className="flex justify-between items-center">
              <span>Status:</span>
              <span className={recordingStatus.is_recording ? 'text-red-400' : 'text-green-400'}>
                {recordingStatus.is_recording ? 'Recording...' : 'Stopped'}
              </span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span>Files:</span>
              <span>
                Video: {recordingStatus.files.video ? '✓' : '✗'} | 
                Clicks: {recordingStatus.files.clicks ? '✓' : '✗'}
              </span>
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="text-xs text-gray-500 bg-gray-700 p-3 rounded-lg">
          <p className="font-medium mb-1">How to use:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Make sure the Flask backend is running (python backend/app.py)</li>
            <li>Click "Start Recording" to begin screen capture</li>
            <li>Click around in your target application to create zoom points</li>
            <li>Click "Stop Recording" when finished</li>
            <li>Import the recording to edit zoom effects in the timeline</li>
          </ol>
        </div>
      </div>
    </div>
  );
};