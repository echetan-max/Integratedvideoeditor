import React from 'react';
import { Upload, Download, FileVideo, Sparkles, FileText, Video } from 'lucide-react';

interface HeaderProps {
  videoFile: File;
  onExport: () => void;
  onNewProject: () => void;
  onSakImport: () => void;
  onAutoZoomRecord: () => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  videoFile, 
  onExport, 
  onNewProject, 
  onSakImport, 
  onAutoZoomRecord 
}) => {
  return (
    <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-6 h-6 text-purple-400" />
            <h1 className="text-xl font-bold text-white">Smart Zoom Editor</h1>
          </div>
          <div className="flex items-center space-x-2 text-gray-300">
            <FileVideo className="w-4 h-4" />
            <span className="text-sm">{videoFile.name}</span>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={onAutoZoomRecord}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <Video className="w-4 h-4" />
            <span>AutoZoom Recorder</span>
          </button>
          
          <button
            onClick={onSakImport}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
          >
            <FileText className="w-4 h-4" />
            <span>Import Data</span>
          </button>
          
          <button
            onClick={onNewProject}
            className="flex items-center space-x-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>New Project</span>
          </button>
          
          <button
            onClick={onExport}
            className="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Export Video</span>
          </button>
        </div>
      </div>
    </header>
  );
};