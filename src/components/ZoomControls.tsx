import React, { useState } from 'react';
import { ZoomIn, ZoomOut, Move, Trash2, Plus, Settings } from 'lucide-react';
import { ZoomEffect } from '../types';

interface ZoomControlsProps {
  zoomEnabled: boolean;
  onToggleZoom: (enabled: boolean) => void;
  selectedZoom: ZoomEffect | null;
  onUpdateZoom: (zoom: ZoomEffect) => void;
  onDeleteZoom: (id: string) => void;
  onAddZoom: () => void;
  currentTime: number;
  duration: number;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
  zoomEnabled,
  onToggleZoom,
  selectedZoom,
  onUpdateZoom,
  onDeleteZoom,
  onAddZoom,
  currentTime,
  duration
}) => {
  const [dragPosition, setDragPosition] = useState({ x: 50, y: 50 });
  const [isDragging, setIsDragging] = useState(false);

  const handlePositionMouseDown = (e: React.MouseEvent) => {
    if (!selectedZoom) return;
    setIsDragging(true);
    e.preventDefault();
  };

  const handlePositionMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !selectedZoom) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    const clampedX = Math.max(0, Math.min(100, x));
    const clampedY = Math.max(0, Math.min(100, y));
    
    setDragPosition({ x: clampedX, y: clampedY });
    
    onUpdateZoom({
      ...selectedZoom,
      x: clampedX,
      y: clampedY
    });
  };

  const handlePositionMouseUp = () => {
    setIsDragging(false);
  };

  const updateZoomProperty = (property: keyof ZoomEffect, value: any) => {
    if (!selectedZoom) return;
    onUpdateZoom({ ...selectedZoom, [property]: value });
  };

  return (
    <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-4">Zoom Effects</h2>
        
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-gray-300">Add zoom effects</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={zoomEnabled}
              onChange={(e) => onToggleZoom(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
          </label>
        </div>

        <button
          onClick={onAddZoom}
          className="w-full flex items-center justify-center space-x-2 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Add Zoom at Current Time</span>
        </button>
      </div>

      {selectedZoom ? (
        <div className="flex-1 p-4 space-y-6">
          <div>
            <h3 className="text-white font-medium mb-2">Edit Selected Zoom</h3>
            <div className="text-sm text-gray-400 mb-4">
              {selectedZoom.startTime.toFixed(1)}s - {selectedZoom.endTime.toFixed(1)}s
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-2">Select zoom position</label>
            <div
              className="w-full h-32 bg-gray-700 rounded-lg relative cursor-crosshair border-2 border-gray-600"
              onMouseDown={handlePositionMouseDown}
              onMouseMove={handlePositionMouseMove}
              onMouseUp={handlePositionMouseUp}
              onMouseLeave={handlePositionMouseUp}
            >
              <div
                className="absolute w-3 h-3 bg-purple-500 rounded-full border-2 border-white transform -translate-x-1/2 -translate-y-1/2 cursor-move"
                style={{
                  left: `${selectedZoom.x}%`,
                  top: `${selectedZoom.y}%`
                }}
              />
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-20">
                {Array.from({ length: 9 }, (_, i) => (
                  <div key={i} className="border border-gray-500" />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-2">
                Zoom Scale: {selectedZoom.scale.toFixed(1)}x
              </label>
              <input
                type="range"
                min="1"
                max="5"
                step="0.1"
                value={selectedZoom.scale}
                onChange={(e) => updateZoomProperty('scale', parseFloat(e.target.value))}
                className="w-full accent-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-2">
                Start Time: {selectedZoom.startTime.toFixed(1)}s
              </label>
              <input
                type="range"
                min="0"
                max={duration}
                step="0.1"
                value={selectedZoom.startTime}
                onChange={(e) => updateZoomProperty('startTime', parseFloat(e.target.value))}
                className="w-full accent-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-2">
                End Time: {selectedZoom.endTime.toFixed(1)}s
              </label>
              <input
                type="range"
                min={selectedZoom.startTime + 0.1}
                max={duration}
                step="0.1"
                value={selectedZoom.endTime}
                onChange={(e) => updateZoomProperty('endTime', parseFloat(e.target.value))}
                className="w-full accent-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-2">Transition</label>
              <select
                value={selectedZoom.transition}
                onChange={(e) => updateZoomProperty('transition', e.target.value as 'smooth' | 'instant')}
                className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="smooth">Smooth</option>
                <option value="instant">Instant</option>
              </select>
            </div>
          </div>

          <button
            onClick={() => onDeleteZoom(selectedZoom.id)}
            className="w-full flex items-center justify-center space-x-2 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete Zoom</span>
          </button>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center text-gray-400">
            <ZoomIn className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No zoom effect selected</p>
            <p className="text-xs mt-1">Click on a zoom segment in the timeline or add a new one</p>
          </div>
        </div>
      )}
    </div>
  );
};