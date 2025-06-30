from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
import subprocess
import threading
import time
import json
import os
import signal
import sys

app = Flask(__name__)
CORS(app, origins=["http://localhost:3000", "http://localhost:5173"])

# Global variables to track recording state
recording_process = None
recording_thread = None
is_recording = False

def run_sak_recording():
    """Run the sak.py script in a separate process"""
    global recording_process, is_recording
    try:
        # Start the sak.py script
        recording_process = subprocess.Popen([
            sys.executable, 'sak.py'
        ], cwd=os.path.dirname(os.path.abspath(__file__)))
        
        is_recording = True
        recording_process.wait()  # Wait for the process to complete
        is_recording = False
        
    except Exception as e:
        print(f"Error running sak.py: {e}")
        is_recording = False

@app.route('/start-recording', methods=['POST'])
def start_recording():
    """Start the AutoZoom recording"""
    global recording_thread, is_recording
    
    if is_recording:
        return jsonify({
            'success': False,
            'message': 'Recording is already in progress'
        }), 400
    
    try:
        # Clean up any existing output files
        for file in ['out.mp4', 'clicks.json', 'temp_audio.wav', 'out_tmp.mp4']:
            if os.path.exists(file):
                os.remove(file)
        
        # Start recording in a separate thread
        recording_thread = threading.Thread(target=run_sak_recording)
        recording_thread.daemon = True
        recording_thread.start()
        
        # Give it a moment to start
        time.sleep(1)
        
        return jsonify({
            'success': True,
            'message': 'Recording started successfully',
            'status': 'recording'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Failed to start recording: {str(e)}'
        }), 500

@app.route('/stop-recording', methods=['POST'])
def stop_recording():
    """Stop the AutoZoom recording"""
    global recording_process, is_recording
    
    if not is_recording:
        return jsonify({
            'success': False,
            'message': 'No recording in progress'
        }), 400
    
    try:
        if recording_process:
            # Terminate the recording process gracefully
            recording_process.terminate()
            
            # Wait a bit for graceful shutdown
            try:
                recording_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                # Force kill if it doesn't stop gracefully
                recording_process.kill()
                recording_process.wait()
        
        is_recording = False
        
        # Wait a moment for file processing to complete
        time.sleep(2)
        
        # Check if output files were created
        video_exists = os.path.exists('out.mp4')
        clicks_exists = os.path.exists('clicks.json')
        
        return jsonify({
            'success': True,
            'message': 'Recording stopped successfully',
            'status': 'completed',
            'files': {
                'video': video_exists,
                'clicks': clicks_exists
            }
        })
        
    except Exception as e:
        is_recording = False
        return jsonify({
            'success': False,
            'message': f'Failed to stop recording: {str(e)}'
        }), 500

@app.route('/recording-status', methods=['GET'])
def get_recording_status():
    """Get the current recording status"""
    return jsonify({
        'is_recording': is_recording,
        'files': {
            'video': os.path.exists('out.mp4'),
            'clicks': os.path.exists('clicks.json')
        }
    })

@app.route('/video', methods=['GET'])
def get_video():
    """Serve the generated video file"""
    video_path = 'out.mp4'
    
    if not os.path.exists(video_path):
        return jsonify({
            'success': False,
            'message': 'Video file not found'
        }), 404
    
    try:
        return send_file(
            video_path,
            mimetype='video/mp4',
            as_attachment=False,
            download_name='autozoom_recording.mp4'
        )
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Failed to serve video: {str(e)}'
        }), 500

@app.route('/clicks', methods=['GET'])
def get_clicks():
    """Serve the clicks data as JSON"""
    clicks_path = 'clicks.json'
    
    # If clicks.json doesn't exist, try to generate it from the sak.py data
    if not os.path.exists(clicks_path):
        # Create a basic clicks.json structure
        # Note: This would need to be populated by modifying sak.py to export clicks
        clicks_data = {
            'clicks': [],
            'width': 1920,
            'height': 1080,
            'duration': 0,
            'message': 'No click data available - ensure sak.py exports clicks.json'
        }
        
        with open(clicks_path, 'w') as f:
            json.dump(clicks_data, f, indent=2)
    
    try:
        return send_file(
            clicks_path,
            mimetype='application/json',
            as_attachment=False,
            download_name='clicks.json'
        )
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Failed to serve clicks data: {str(e)}'
        }), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'message': 'AutoZoom API is running'
    })

if __name__ == '__main__':
    print("Starting AutoZoom API server...")
    print("Make sure sak.py is in the same directory as this script")
    app.run(host='0.0.0.0', port=5000, debug=True)