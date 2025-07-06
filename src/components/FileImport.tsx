import React, { useRef } from 'react';
import { Upload, FileVideo, Sparkles, FileText, Video, Zap } from 'lucide-react';

interface FileImportProps {
  onFileSelect: (file: File) => void;
  onSakImport: () => void;
  onAutoZoomRecord: () => void;
  onClicksImport?: (clicksData: any) => void;
}

export const FileImport: React.FC<FileImportProps> = ({ 
  onFileSelect, 
  onSakImport, 
  onAutoZoomRecord,
  onClicksImport 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const clicksInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      console.log('File selected:', {
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified
      });
      onFileSelect(file);
    }
  };

  const handleClicksFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/json') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const clicksData = JSON.parse(e.target?.result as string);
          if (onClicksImport) {
            onClicksImport(clicksData);
          }
        } catch (error) {
          console.error('Error parsing clicks file:', error);
          alert('Invalid JSON file. Please select a valid clicks.json file.');
        }
      };
      reader.readAsText(file);
    } else {
      alert('Please select a valid JSON file.');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0];
      console.log('File dropped:', {
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified
      });
      if (file.type.startsWith('video/')) {
        onFileSelect(file);
      } else if (file.type === 'application/json') {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const clicksData = JSON.parse(e.target?.result as string);
            if (onClicksImport) {
              onClicksImport(clicksData);
            }
          } catch (error) {
            console.error('Error parsing clicks file:', error);
            alert('Invalid JSON file. Please select a valid clicks.json file.');
          }
        };
        reader.readAsText(file);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-8">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <Sparkles className="w-8 h-8 text-purple-400" />
            <h1 className="text-3xl font-bold text-white">Smart Zoom Video Editor</h1>
          </div>
          <p className="text-gray-400 text-lg">
            Import your video or record with AutoZoom to start adding intelligent zoom effects
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* File Import */}
          <div
            className="border-2 border-dashed border-gray-600 rounded-xl p-8 text-center hover:border-purple-500 transition-colors cursor-pointer"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileVideo className="w-12 h-12 text-gray-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Import Video File</h3>
            <p className="text-gray-400 mb-4">
              Drag and drop your video here, or click to browse
            </p>
            <button className="flex items-center space-x-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors mx-auto">
              <Upload className="w-5 h-5" />
              <span>Choose File</span>
            </button>
            <p className="text-sm text-gray-500 mt-3">
              Supports MP4, WebM, MOV, AVI, and other common video formats
            </p>
          </div>

          {/* Clicks Data Import */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="flex items-center space-x-3 mb-4">
              <FileText className="w-6 h-6 text-blue-400" />
              <h3 className="text-lg font-semibold text-white">Import Clicks Data</h3>
            </div>
            <p className="text-gray-400 text-sm mb-4">
              Upload clicks.json to add auto-zoom effects
            </p>
            <button
              onClick={() => clicksInputRef.current?.click()}
              className="w-full flex items-center justify-center space-x-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Upload className="w-5 h-5" />
              <span>Choose Clicks.json</span>
            </button>
            <input
              ref={clicksInputRef}
              type="file"
              accept=".json"
              onChange={handleClicksFileSelect}
              className="hidden"
            />
          </div>

          {/* AutoZoom Recorder */}
          <div className="border-2 border-dashed border-blue-600 rounded-xl p-8 text-center hover:border-blue-500 transition-colors">
            <Video className="w-12 h-12 text-blue-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">AutoZoom Recorder</h3>
            <p className="text-gray-400 mb-4">
              Record your screen with automatic zoom effects
            </p>
            <button 
              onClick={onAutoZoomRecord}
              className="flex items-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors mx-auto"
            >
              <Video className="w-5 h-5" />
              <span>Start Recording</span>
            </button>
            <p className="text-sm text-gray-500 mt-3">
              Captures screen with click-based zoom points
            </p>
          </div>
        </div>

        {/* Additional Options */}
        <div className="flex justify-center">
          <button 
            onClick={onSakImport}
            className="flex items-center space-x-2 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            <FileText className="w-5 h-5" />
            <span>Import sak.py Data</span>
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,.webm,.mp4,.mov,.avi,.mkv"
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="mt-8 p-6 bg-gray-800 rounded-xl">
          <h4 className="text-white font-semibold mb-3">Integration with sak.py AutoZoom Recorder</h4>
          <p className="text-gray-300 text-sm mb-3">
            This editor works seamlessly with your AutoZoom Recorder Pro:
          </p>
          <ul className="text-gray-400 text-sm space-y-1">
            <li>• <strong>AutoZoom Recorder:</strong> Record directly from the web interface</li>
            <li>• <strong>Import videos:</strong> Load existing recordings from your sak.py script</li>
            <li>• <strong>Load click data:</strong> Import zoom positions from JSON exports</li>
            <li>• <strong>Manual editing:</strong> Adjust and fine-tune zoom effects</li>
            <li>• <strong>Professional export:</strong> Generate high-quality videos with smart zoom transitions</li>
          </ul>
        </div>
      </div>
    </div>
  );
};