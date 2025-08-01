from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
import subprocess
import threading
import time
import json
import os
import signal
import sys
import tempfile
from werkzeug.utils import secure_filename
import base64

app = Flask(__name__)
CORS(app, origins=["http://localhost:3000", "http://localhost:5173"])

# Global variables to track recording state
recording_process = None
recording_thread = None
is_recording = False

def run_sak_recording():
    """Run the sak_enhanced.py script in a separate process"""
    global recording_process, is_recording
    try:
        # Start the sak_enhanced.py script (exports raw video + click data)
        recording_process = subprocess.Popen([
            sys.executable, 'sak_enhanced.py'
        ], cwd=os.path.dirname(os.path.abspath(__file__)))
        
        is_recording = True
        recording_process.wait()  # Wait for the process to complete
        is_recording = False
        
    except Exception as e:
        print(f"Error running sak_enhanced.py: {e}")
        is_recording = False

# Find latest outN.mp4 and clicksN.json and rename to out.mp4/clicks.json
def find_and_rename_latest_outputs(timeout=10):
    """Wait for and rename the latest outN.mp4 and clicksN.json to out.mp4 and clicks.json."""
    start_time = time.time()
    outs, clicks = [], []
    while time.time() - start_time < timeout:
        outs = [f for f in os.listdir('.') if f.startswith('out') and f.endswith('.mp4')]
        clicks = [f for f in os.listdir('.') if f.startswith('clicks') and f.endswith('.json')]
        if outs and clicks:
            break
        time.sleep(1)  # Wait a bit and try again

    if outs:
        latest_out = max(outs, key=os.path.getctime)
        if latest_out != 'out.mp4':
            if os.path.exists('out.mp4'):
                os.remove('out.mp4')
            os.replace(latest_out, 'out.mp4')
    if clicks:
        latest_clicks = max(clicks, key=os.path.getctime)
        if latest_clicks != 'clicks.json':
            if os.path.exists('clicks.json'):
                os.remove('clicks.json')
            os.replace(latest_clicks, 'clicks.json')
    # Return whether files were found
    return bool(outs), bool(clicks)

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
        
        # Wait for file processing and rename outputs
        video_found, clicks_found = find_and_rename_latest_outputs(timeout=10)

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

@app.route('/export-with-effects', methods=['POST'])
def export_with_effects():
    """Efficient segment-based export: applies zooms/overlays per segment, not per frame, for fast and accurate output."""
    try:
        import math
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'message': 'No JSON data received'}), 400

        # Extract base64 video, zoomEffects, textOverlays, duration, fps
        video_b64 = data.get('videoFile')
        zoom_effects = data.get('zoomEffects', [])
        text_overlays = data.get('textOverlays', [])
        duration = float(data.get('duration'))
        fps = int(data.get('fps', 30))

        if not video_b64 or not duration:
            return jsonify({'success': False, 'message': 'Missing video or duration'}), 400

        # Save uploaded video to temp file
        import base64, tempfile
        video_bytes = base64.b64decode(video_b64)
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as video_file:
            video_file.write(video_bytes)
            video_path = video_file.name

        # Prepare output path
        out_path = tempfile.NamedTemporaryFile(delete=False, suffix='.mp4').name

        # --- Improved segment-based filter generation ---
        # 1. Gather all change points (start/end of zooms and overlays)
        change_points = set([0, duration])
        for z in zoom_effects:
            change_points.add(float(z['startTime']))
            change_points.add(float(z['endTime']))
        for o in text_overlays:
            change_points.add(float(o['startTime']))
            change_points.add(float(o['endTime']))
        change_points = sorted([t for t in change_points if 0 <= t <= duration])

        # 2. Build segments: (start, end, zoom, overlays)
        segments = []
        for i in range(len(change_points)-1):
            seg_start = change_points[i]
            seg_end = change_points[i+1]
            
            # Find active zoom for this segment (use the one that covers the most of this segment)
            active_zoom = None
            max_coverage = 0
            for z in zoom_effects:
                z_start = float(z['startTime'])
                z_end = float(z['endTime'])
                # Calculate overlap with this segment
                overlap_start = max(seg_start, z_start)
                overlap_end = min(seg_end, z_end)
                if overlap_end > overlap_start:
                    coverage = overlap_end - overlap_start
                    if coverage > max_coverage:
                        max_coverage = coverage
                        active_zoom = z
            
            # If no zoom found, use default
            if not active_zoom:
                active_zoom = {'x': 50, 'y': 50, 'scale': 1.0}
            
            # Find active overlays for this segment
            active_overlays = []
            for o in text_overlays:
                o_start = float(o['startTime'])
                o_end = float(o['endTime'])
                if o_start <= seg_end and o_end >= seg_start:
                    active_overlays.append(o)
            
            segments.append({
                'start': seg_start,
                'end': seg_end,
                'zoom': active_zoom,
                'overlays': active_overlays
            })

        # 3. For each segment, build FFmpeg filter
        filter_parts = []
        concat_inputs = []
        for idx, seg in enumerate(segments):
            start = seg['start']
            end = seg['end']
            zoom = seg['zoom']
            overlays = seg['overlays']
            label_in = f'[0:v]'
            trim = f'trim=start={start}:end={end},setpts=PTS-STARTPTS'
            scale = zoom.get('scale', 1.0)
            x = zoom.get('x', 50)
            y = zoom.get('y', 50)
            
            # Improved crop calculation
            crop_w = f'iw/{scale}'
            crop_h = f'ih/{scale}'
            crop_x = f'iw*{x/100}-(iw/{scale})/2'
            crop_y = f'ih*{y/100}-(ih/{scale})/2'
            crop = f'crop={crop_w}:{crop_h}:{crop_x}:{crop_y}'
            filters = [trim, crop]
            prev = f'[seg{idx}in]'
            filter_parts.append(f'{label_in}{" "+" ".join(filters)}[seg{idx}c];')
            prev = f'[seg{idx}c]'
            
            # Improved text overlays
            for j, o in enumerate(overlays):
                # Escape text properly
                text_content = o['text'].replace("'", "\\'").replace(':', '\\:').replace(',', '\\,').replace('%', '\\%')
                
                # Calculate position relative to segment
                x_pos = o['x'] / 100
                y_pos = o['y'] / 100
                font_size = o.get('fontSize', 24)
                color = o.get('color', 'white')
                font_family = o.get('fontFamily', 'Arial')
                background_color = o.get('backgroundColor', None)
                padding = o.get('padding', 0)
                
                # Build text filter with proper positioning and timing
                drawtext = f"drawtext=text='{text_content}':x=w*{x_pos}-text_w/2:y=h*{y_pos}-text_h/2:fontsize={font_size}:fontcolor={color}"
                
                # Add font family if specified
                if font_family and font_family != 'Arial':
                    drawtext += f":fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
                
                # Add background if specified
                if background_color:
                    drawtext += f":box=1:boxcolor={background_color}@0.8:boxborderw={padding}"
                else:
                    # Add shadow for better visibility
                    drawtext += ":shadowcolor=black@0.8:shadowx=2:shadowy=2"
                
                # Add timing filter to show text only during its active period within this segment
                text_start = max(start, float(o['startTime']))
                text_end = min(end, float(o['endTime']))
                drawtext += f":enable='between(t,{text_start-start},{text_end-start})'"
                
                prev_out = f'[seg{idx}t{j}]'
                filter_parts.append(f'{prev}{drawtext}{prev_out};')
                prev = prev_out
            
            filter_parts.append(f'{prev}[seg{idx}out];')
            concat_inputs.append(f'[seg{idx}out]')
        
        # 4. Concatenate all segments
        filter_str = ''.join(filter_parts) + ''.join(concat_inputs) + f'concat=n={len(segments)}:v=1:a=0[vout]'
        print('FFmpeg filter:', filter_str)
        
        # FFmpeg command with improved settings
        ffmpeg_cmd = [
            'ffmpeg', '-y', '-i', video_path,
            '-filter_complex', filter_str,
            '-map', '[vout]', '-map', '0:a?',
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-c:a', 'aac', '-movflags', '+faststart',
            '-avoid_negative_ts', 'make_zero',
            '-t', f'{duration}',  # Ensure exact duration
            out_path
        ]
        print('FFmpeg command:', ' '.join(ffmpeg_cmd))
        
        # Run FFmpeg
        import subprocess
        proc = subprocess.run(ffmpeg_cmd, capture_output=True)
        if proc.returncode != 0:
            print(f"FFmpeg stderr: {proc.stderr.decode()}")
            return jsonify({'success': False, 'message': 'FFmpeg failed', 'stderr': proc.stderr.decode()}), 500
        
        # Return the processed video
        return send_file(out_path, mimetype='video/mp4', as_attachment=True, download_name='exported_video.mp4')
    except Exception as e:
        print(f"Export error: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/mux-audio', methods=['POST'])
def mux_audio():
    """Mux audio from the original video into the rendered video (webm or mp4)."""
    import tempfile
    from flask import request, send_file
    import subprocess
    import os
    rendered = request.files.get('rendered')
    original = request.files.get('original')
    if not rendered or not original:
        return {'success': False, 'message': 'Missing files'}, 400
    with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as rendered_file:
        rendered.save(rendered_file)
        rendered_path = rendered_file.name
    with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as original_file:
        original.save(original_file)
        original_path = original_file.name
    out_path = tempfile.NamedTemporaryFile(delete=False, suffix='.mp4').name
    # Extract audio from original and mux with rendered
    # Convert webm to mp4 if needed, then mux audio
    temp_video_path = rendered_path
    if rendered_path.endswith('.webm'):
        temp_video_path = rendered_path + '.mp4'
        subprocess.run([
            'ffmpeg', '-y', '-i', rendered_path, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-an', temp_video_path
        ], check=True)
    # Now mux audio
    ffmpeg_cmd = [
        'ffmpeg', '-y',
        '-i', temp_video_path,
        '-i', original_path,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-map', '0:v:0',
        '-map', '1:a:0?',
        '-shortest',
        out_path
    ]
    proc = subprocess.run(ffmpeg_cmd, capture_output=True)
    if proc.returncode != 0:
        return {'success': False, 'message': 'FFmpeg mux failed', 'stderr': proc.stderr.decode()}, 500
    return send_file(out_path, mimetype='video/mp4', as_attachment=True, download_name='exported_video_with_audio.mp4')

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'message': 'AutoZoom API is running'
    })

if __name__ == '__main__':
    print("Starting AutoZoom API server...")
    print("Make sure sak_enhanced.py is in the same directory as this script")
    print("Enhanced version exports raw video + click data for timeline editing")
    app.run(host='0.0.0.0', port=5000, debug=True)