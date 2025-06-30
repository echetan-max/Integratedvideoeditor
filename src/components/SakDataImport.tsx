import React, { useState, useRef } from 'react';
import { X, Upload, FileText, AlertCircle } from 'lucide-react';

interface SakDataImportProps {
  onImport: (data: any) => void;
  onClose: () => void;
}

export const SakDataImport: React.FC<SakDataImportProps> = ({ onImport, onClose }) => {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    try {
      setError(null);
      
      if (file.type === 'application/json' || file.name.endsWith('.json')) {
        const text = await file.text();
        const data = JSON.parse(text);
        onImport(data);
      } else {
        setError('Please select a JSON file exported from sak.py');
      }
    } catch (err) {
      setError('Invalid JSON file format');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">Import sak.py Data</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive 
                ? 'border-blue-500 bg-blue-500/10' 
                : 'border-gray-600 hover:border-blue-500'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileText className="w-12 h-12 text-gray-500 mx-auto mb-4" />
            <h4 className="text-white font-medium mb-2">Import Zoom Data</h4>
            <p className="text-gray-400 text-sm mb-4">
              Drop your sak.py JSON export file here or click to browse
            </p>
            <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
              <Upload className="w-4 h-4 inline mr-2" />
              Choose JSON File
            </button>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-900/50 border border-red-700 rounded-lg flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <span className="text-red-300 text-sm">{error}</span>
            </div>
          )}

          <div className="mt-6 p-4 bg-gray-700 rounded-lg">
            <h5 className="text-white font-medium mb-2">Expected JSON Format:</h5>
            <pre className="text-xs text-gray-300 overflow-x-auto">
{`{
  "clicks": [
    {"time": 5.2, "x": 640, "y": 360},
    {"time": 12.8, "x": 320, "y": 180}
  ],
  "width": 1920,
  "height": 1080,
  "duration": 30.5
}`}
            </pre>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
};