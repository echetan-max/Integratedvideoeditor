import React, { useState } from 'react';
import { X, Type, Palette, Settings } from 'lucide-react';
import { TextOverlay } from '../types';

interface TextOverlayProps {
  textOverlays: TextOverlay[];
  onAddText: (textOverlay: TextOverlay) => void;
  onUpdateText: (id: string, textOverlay: Partial<TextOverlay>) => void;
  onDeleteText: (id: string) => void;
  currentTime: number;
  duration: number;
}

export const TextOverlayComponent: React.FC<TextOverlayProps> = ({
  textOverlays,
  onAddText,
  onUpdateText,
  onDeleteText,
  currentTime,
  duration
}) => {
  const [isAddingText, setIsAddingText] = useState(false);
  const [newText, setNewText] = useState('');
  const [fontSize, setFontSize] = useState(24);
  const [color, setColor] = useState('#ffffff');
  const [backgroundColor, setBackgroundColor] = useState('#000000');
  const [fontFamily, setFontFamily] = useState('Arial');
  const [padding, setPadding] = useState(8);
  const [borderRadius, setBorderRadius] = useState(4);

  const handleAddText = () => {
    if (newText.trim()) {
      const textOverlay: TextOverlay = {
        id: Date.now().toString(),
        startTime: currentTime,
        endTime: Math.min(currentTime + 3, duration),
        x: 50,
        y: 50,
        text: newText,
        fontSize,
        color,
        fontFamily,
        backgroundColor,
        padding,
        borderRadius
      };
      onAddText(textOverlay);
      setNewText('');
      setIsAddingText(false);
    }
  };

  const handleUpdateText = (id: string, field: keyof TextOverlay, value: any) => {
    onUpdateText(id, { [field]: value });
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
          <Type className="w-5 h-5" />
          <span>Text Overlays</span>
        </h3>
        <button
          onClick={() => setIsAddingText(true)}
          className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors"
        >
          Add Text
        </button>
      </div>

      {isAddingText && (
        <div className="bg-gray-700 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-white font-medium">Add New Text</h4>
            <button
              onClick={() => setIsAddingText(false)}
              className="text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-300 mb-1">Text</label>
              <textarea
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="Enter your text... (spaces and line breaks supported)"
                rows={3}
                className="w-full bg-gray-600 border border-gray-500 text-white rounded px-3 py-2 focus:ring-2 focus:ring-purple-500 resize-none"
                onKeyDown={(e) => {
                  // Prevent keyboard shortcuts from interfering with text input
                  if (e.key === ' ' || e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Delete') {
                    e.stopPropagation();
                  }
                  if (e.key === 'Enter' && e.shiftKey) {
                    e.preventDefault();
                    const cursor = e.currentTarget.selectionStart;
                    const textBefore = newText.substring(0, cursor);
                    const textAfter = newText.substring(cursor);
                    setNewText(textBefore + '\n' + textAfter);
                  }
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-300 mb-1">Font Size</label>
                <input
                  type="number"
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  min="12"
                  max="72"
                  className="w-full bg-gray-600 border border-gray-500 text-white rounded px-3 py-2 focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Font Family</label>
                <select
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="w-full bg-gray-600 border border-gray-500 text-white rounded px-3 py-2 focus:ring-2 focus:ring-purple-500"
                >
                  <option value="Arial">Arial</option>
                  <option value="Helvetica">Helvetica</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Verdana">Verdana</option>
                  <option value="Courier New">Courier New</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-300 mb-1">Text Color</label>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-full h-10 bg-gray-600 border border-gray-500 rounded cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Background Color</label>
                <input
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="w-full h-10 bg-gray-600 border border-gray-500 rounded cursor-pointer"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-300 mb-1">Padding</label>
                <input
                  type="number"
                  value={padding}
                  onChange={(e) => setPadding(Number(e.target.value))}
                  min="0"
                  max="20"
                  className="w-full bg-gray-600 border border-gray-500 text-white rounded px-3 py-2 focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Border Radius</label>
                <input
                  type="number"
                  value={borderRadius}
                  onChange={(e) => setBorderRadius(Number(e.target.value))}
                  min="0"
                  max="20"
                  className="w-full bg-gray-600 border border-gray-500 text-white rounded px-3 py-2 focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                onClick={handleAddText}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-medium transition-colors"
              >
                Add Text
              </button>
              <button
                onClick={() => setIsAddingText(false)}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {textOverlays.map((textOverlay) => (
          <div key={textOverlay.id} className="bg-gray-700 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-white font-medium truncate">{textOverlay.text}</span>
              <button
                onClick={() => onDeleteText(textOverlay.id)}
                className="text-red-400 hover:text-red-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div>
              <label className="block text-gray-400 mb-1 text-xs">Edit Text</label>
              <textarea
                value={textOverlay.text}
                onChange={(e) => handleUpdateText(textOverlay.id, 'text', e.target.value)}
                rows={2}
                className="w-full bg-gray-600 border border-gray-500 text-white rounded px-2 py-1 text-xs focus:ring-1 focus:ring-purple-500 resize-none"
                placeholder="Edit text content..."
                onKeyDown={(e) => {
                  // Prevent keyboard shortcuts from interfering with text input
                  if (e.key === ' ' || e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Delete') {
                    e.stopPropagation();
                  }
                }}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block text-gray-400 mb-1">Start Time</label>
                <input
                  type="number"
                  value={textOverlay.startTime}
                  onChange={(e) => handleUpdateText(textOverlay.id, 'startTime', Number(e.target.value))}
                  step="0.1"
                  min="0"
                  max={duration}
                  className="w-full bg-gray-600 border border-gray-500 text-white rounded px-2 py-1 focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-gray-400 mb-1">End Time</label>
                <input
                  type="number"
                  value={textOverlay.endTime}
                  onChange={(e) => handleUpdateText(textOverlay.id, 'endTime', Number(e.target.value))}
                  step="0.1"
                  min="0"
                  max={duration}
                  className="w-full bg-gray-600 border border-gray-500 text-white rounded px-2 py-1 focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block text-gray-400 mb-1">X Position (%)</label>
                <div className="flex items-center space-x-1">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={textOverlay.x}
                    onChange={(e) => handleUpdateText(textOverlay.id, 'x', Number(e.target.value))}
                    className="flex-1 accent-purple-500"
                  />
                  <input
                    type="number"
                    value={textOverlay.x}
                    onChange={(e) => handleUpdateText(textOverlay.id, 'x', Number(e.target.value))}
                    min="0"
                    max="100"
                    step="1"
                    className="w-16 bg-gray-600 border border-gray-500 text-white rounded px-1 py-1 text-xs focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-gray-400 mb-1">Y Position (%)</label>
                <div className="flex items-center space-x-1">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={textOverlay.y}
                    onChange={(e) => handleUpdateText(textOverlay.id, 'y', Number(e.target.value))}
                    className="flex-1 accent-purple-500"
                  />
                  <input
                    type="number"
                    value={textOverlay.y}
                    onChange={(e) => handleUpdateText(textOverlay.id, 'y', Number(e.target.value))}
                    min="0"
                    max="100"
                    step="1"
                    className="w-16 bg-gray-600 border border-gray-500 text-white rounded px-1 py-1 text-xs focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex space-x-2">
              <input
                type="color"
                value={textOverlay.color}
                onChange={(e) => handleUpdateText(textOverlay.id, 'color', e.target.value)}
                className="w-8 h-8 bg-gray-600 border border-gray-500 rounded cursor-pointer"
                title="Text Color"
              />
              <input
                type="color"
                value={textOverlay.backgroundColor || '#000000'}
                onChange={(e) => handleUpdateText(textOverlay.id, 'backgroundColor', e.target.value)}
                className="w-8 h-8 bg-gray-600 border border-gray-500 rounded cursor-pointer"
                title="Background Color"
              />
              <input
                type="number"
                value={textOverlay.fontSize}
                onChange={(e) => handleUpdateText(textOverlay.id, 'fontSize', Number(e.target.value))}
                min="12"
                max="72"
                className="w-16 bg-gray-600 border border-gray-500 text-white rounded px-2 py-1 text-xs focus:ring-1 focus:ring-purple-500"
                title="Font Size"
              />
            </div>
          </div>
        ))}
      </div>

      {textOverlays.length === 0 && !isAddingText && (
        <div className="text-center text-gray-400 py-8">
          <Type className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No text overlays added yet</p>
          <p className="text-sm">Click "Add Text" to get started</p>
        </div>
      )}
    </div>
  );
}; 