from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import tempfile, os, subprocess
from io import BytesIO
import json
import base64
import math
import re

app = Flask(__name__)
CORS(app)

@app.route('/convert', methods=['POST'])
def convert():
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            input_path = os.path.join(tmpdir, 'input.webm')
            output_path = os.path.join(tmpdir, 'output.mp4')
            file.save(input_path)
            
            if not os.path.exists(input_path) or os.path.getsize(input_path) == 0:
                return jsonify({"error": "Failed to save input file"}), 400

            cmd = [
                'ffmpeg', '-y',
                '-i', input_path,
                '-c:v', 'libx264',
                '-preset', 'faster',
                '-crf', '22',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-ar', '44100',
                '-ac', '2',
                '-movflags', '+faststart',
                '-avoid_negative_ts', 'make_zero',
                output_path
            ]
            
            print(f"Running FFmpeg command: {' '.join(cmd)}")
            result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            
            if result.returncode != 0:
                print(f"FFmpeg error: {result.stderr}")
                return jsonify({"error": f"FFmpeg conversion failed: {result.stderr}"}), 500
            
            if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
                return jsonify({"error": "FFmpeg did not produce output file"}), 500

            with open(output_path, 'rb') as f:
                mp4_bytes = f.read()
                
            print(f"Conversion successful, output size: {len(mp4_bytes)} bytes")
            return send_file(
                BytesIO(mp4_bytes),
                mimetype='video/mp4',
                as_attachment=True,
                download_name='exported.mp4'
            )
    except Exception as e:
        print(f"Conversion error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy", "service": "video-converter"})

def build_zoom_filter(zoom_effects, duration, fps):
    """Build FFmpeg crop filter for all zooms (manual and autozoom), frame-perfect, matches preview/export math"""
    if not zoom_effects:
        return None
    
    # Sort zooms by start time
    sorted_zooms = sorted(zoom_effects, key=lambda z: z['startTime'])
    
    # Build complex filter with time-based zoom changes
    filter_parts = []
    
    for i, zoom in enumerate(sorted_zooms):
        start_time = zoom['startTime']
        end_time = zoom['endTime']
        x_percent = zoom['x'] / 100
        y_percent = zoom['y'] / 100
        scale = zoom['scale']
        
        # Calculate crop dimensions based on scale
        crop_width = 1.0 / scale
        crop_height = 1.0 / scale
        
        # Calculate crop position to center on the zoom point
        crop_x = x_percent - (crop_width / 2)
        crop_y = y_percent - (crop_height / 2)
        
        # Ensure crop stays within bounds
        crop_x = max(0, min(crop_x, 1 - crop_width))
        crop_y = max(0, min(crop_y, 1 - crop_height))
        
        # Build crop filter for this zoom period
        crop_filter = (
            f"crop=w=iw*{crop_width}:h=ih*{crop_height}:x=iw*{crop_x}:y=ih*{crop_y}"
            f":enable='between(t,{start_time},{end_time})'"
        )
        filter_parts.append(crop_filter)
    
    if filter_parts:
        return ','.join(filter_parts)
    return None

def build_text_filter(text_overlays):
    """Build FFmpeg drawtext filter for overlays (styled, pixel-perfect, matches preview/export)"""
    if not text_overlays:
        return None
    
    text_filters = []
    for overlay in text_overlays:
        x_percent = overlay['x'] / 100
        y_percent = overlay['y'] / 100
        font_size = overlay.get('fontSize', 24)
        color = overlay.get('color', 'white')
        font_family = overlay.get('fontFamily', None)
        background_color = overlay.get('backgroundColor', None)
        padding = overlay.get('padding', 0)
        
        # Escape special characters in text
        text_content = overlay['text'].replace("'", "\\'").replace(':', '\\:').replace(',', '\\,').replace('%', '\\%')
        
        # Build font file string
        fontfile_str = f":fontfile={font_family}" if font_family else ""
        
        # Build background box string
        box_str = ""
        if background_color:
            box_str = f":box=1:boxcolor={background_color}@0.8:boxborderw={padding}"
        else:
            # Add shadow for better visibility when no background
            box_str = ":shadowcolor=black@0.8:shadowx=2:shadowy=2"
        
        # Build text filter with proper positioning and timing
        text_filter = (
            f"drawtext=text='{text_content}'"
            f":x=w*{x_percent}-text_w/2"
            f":y=h*{y_percent}-text_h/2"
            f":fontsize={font_size}"
            f":fontcolor={color}"
            f"{fontfile_str}"
            f"{box_str}"
            f":enable='between(t,{overlay['startTime']},{overlay['endTime']})'"
        )
        text_filters.append(text_filter)
    
    return ','.join(text_filters)

@app.route('/export-with-effects', methods=['POST'])
def export_with_effects():
    try:
        # Handle both JSON and FormData
        if request.content_type and 'multipart/form-data' in request.content_type:
            # FormData request
            video_file = request.files.get('videoFile')
            if not video_file:
                return jsonify({'error': 'No video file provided'}), 400
            
            requested_duration = float(request.form.get('duration', 0))
            zoom_effects = json.loads(request.form.get('zoomEffects', '[]'))
            text_overlays = json.loads(request.form.get('textOverlays', '[]'))
            fps = int(request.form.get('fps', 30))
            
            # Save uploaded video
            with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as input_file:
                video_file.save(input_file.name)
                input_path = input_file.name
        else:
            # JSON request (fallback)
            data = request.get_json()
            video_base64 = data['videoFile']
            requested_duration = float(data['duration'])
            zoom_effects = data['zoomEffects']
            text_overlays = data['textOverlays']
            fps = int(data.get('fps', 30))
            
            # Save input video
            with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as input_file:
                video_data = base64.b64decode(video_base64)
                input_file.write(video_data)
                input_path = input_file.name
        
        print(f"Processing export: requested {requested_duration}s, {len(zoom_effects)} zooms (baked in WebM), {len(text_overlays)} texts")
        print(f"Input file size: {os.path.getsize(input_path)} bytes")
        print(f"Request content type: {request.content_type}")
        
        # Verify the input file exists and has content
        if not os.path.exists(input_path) or os.path.getsize(input_path) == 0:
            return jsonify({'error': 'Invalid video file or empty video data'}), 400
        
        # Prepare output path
        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as output_file:
            output_path = output_file.name
        
        try:
            # Get actual video duration
            probe_cmd = [
                'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1', input_path
            ]
            probe_result = subprocess.run(probe_cmd, capture_output=True, text=True)
            actual_duration = None
            if probe_result.returncode == 0:
                try:
                    actual_duration = float(probe_result.stdout.strip())
                    print(f"Detected video duration: {actual_duration:.3f}s")
                except Exception as e:
                    print(f"Error parsing duration: {e}")
                    actual_duration = requested_duration
            else:
                print(f"FFprobe failed: {probe_result.stderr}")
                actual_duration = requested_duration
                
            if not actual_duration or actual_duration <= 0:
                print(f"Invalid duration detected: {actual_duration}, using requested: {requested_duration}")
                actual_duration = requested_duration
            
            print(f"FFprobe detected duration: {actual_duration:.3f}s (requested: {requested_duration:.3f}s)")
            export_duration = min(actual_duration, requested_duration)
            print(f"Exporting with duration: {export_duration:.3f}s")
            
            # Build FFmpeg command
            ffmpeg_cmd = ['ffmpeg', '-y', '-i', input_path]
            
            # Build video filters
            video_filters = []
            
            # Skip zoom processing - WebM already has zooms baked in from client-side export
            # Only process text overlays if needed
            text_filter = build_text_filter(text_overlays)
            if text_filter:
                video_filters.append(text_filter)
            
            # Combine filters
            if video_filters:
                combined_filter = ','.join(video_filters)
                print(f"Combined filter: {combined_filter}")
                ffmpeg_cmd.extend(['-vf', combined_filter])
            
            # Add output options
            ffmpeg_cmd.extend([
                '-c:v', 'libx264',
                '-preset', 'medium',
                '-crf', '23',
                '-pix_fmt', 'yuv420p',
                '-c:a', 'copy',  # Copy original audio stream
                '-map', '0:v:0',  # Map video from first input
                '-map', '0:a?',   # Map audio from first input (if exists)
                '-movflags', '+faststart',
                '-avoid_negative_ts', 'make_zero',
                '-t', f'{export_duration:.3f}',  # Limit to exact duration
                '-y',  # Overwrite output file
                output_path
            ])
            
            print(f"Running FFmpeg: {' '.join(ffmpeg_cmd)}")
            try:
                result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True, timeout=120)
            except FileNotFoundError:
                return jsonify({'error': 'FFmpeg not found. Please install FFmpeg and ensure it is in your PATH.'}), 500
            except subprocess.TimeoutExpired:
                return jsonify({'error': 'FFmpeg processing timed out. Try with a shorter video or simpler effects.'}), 500
            
            if result.returncode != 0:
                print(f"FFmpeg error: {result.stderr}")
                print(f"FFmpeg stdout: {result.stdout}")
                return jsonify({'error': f'FFmpeg failed: {result.stderr}'}), 500
            
            if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
                return jsonify({'error': 'Output file was not created or is empty'}), 500
            
            print(f"Export successful: {os.path.getsize(output_path)} bytes")
            return send_file(output_path, as_attachment=True, download_name='exported_video.mp4')
            
        finally:
            # Clean up temporary files
            try:
                os.unlink(input_path)
                if os.path.exists(output_path):
                    os.unlink(output_path)
            except:
                pass
                
    except Exception as e:
        print(f"Export error: {str(e)}")
        return jsonify({'error': str(e)}), 500

def sanitize_filename(filename):
    name = os.path.basename(filename)
    reserved = {'aux', 'con', 'prn', 'nul', 'com1', 'lpt1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'}
    base, ext = os.path.splitext(name)
    if base.lower() in reserved:
        base = 'safe_' + base
    base = re.sub(r'[^a-zA-Z0-9._-]', '_', base)
    return base + ext

@app.route('/mux-audio', methods=['POST'])
def mux_audio():
    """Mux audio from original video with rendered video"""
    try:
        if 'rendered' not in request.files or 'original' not in request.files:
            return jsonify({"error": "Missing rendered or original video"}), 400
        
        rendered_file = request.files['rendered']
        original_file = request.files['original']
        
        with tempfile.TemporaryDirectory() as tmpdir:
            rendered_filename = sanitize_filename(rendered_file.filename or 'rendered.webm')
            original_filename = sanitize_filename(original_file.filename or 'original.mp4')
            rendered_path = os.path.join(tmpdir, rendered_filename)
            original_path = os.path.join(tmpdir, original_filename)
            output_path = os.path.join(tmpdir, 'final.mp4')
            
            rendered_file.save(rendered_path)
            original_file.save(original_path)
            
            # Get original video duration
            duration_cmd = ['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', original_path]
            duration_result = subprocess.run(duration_cmd, capture_output=True, text=True)
            original_duration = float(duration_result.stdout.strip()) if duration_result.stdout.strip() else 0
            
            # Check if original has audio
            probe_cmd = ['ffprobe', '-v', 'quiet', '-show_streams', '-select_streams', 'a', original_path]
            probe_result = subprocess.run(probe_cmd, capture_output=True, text=True)
            has_audio = len(probe_result.stdout.strip()) > 0
            
            if has_audio:
                # Mux video from rendered with audio from original
                cmd = [
                    'ffmpeg', '-y',
                    '-i', rendered_path,  # Video source
                    '-i', original_path,  # Audio source
                    '-c:v', 'libx264',
                    '-preset', 'ultrafast',
                    '-crf', '28',
                    '-c:a', 'aac',
                    '-b:a', '128k',
                    '-map', '0:v:0',  # Video from first input
                    '-map', '1:a:0',  # Audio from second input
                    '-shortest',      # Match shortest stream
                    '-t', str(original_duration),  # Force exact duration
                    '-avoid_negative_ts', 'make_zero',
                    '-movflags', '+faststart',
                    output_path
                ]
            else:
                # Just convert rendered video to MP4
                cmd = [
                    'ffmpeg', '-y',
                    '-i', rendered_path,
                    '-c:v', 'libx264',
                    '-preset', 'ultrafast',
                    '-crf', '28',
                    '-an',  # No audio
                    '-t', str(original_duration),  # Force exact duration
                    '-avoid_negative_ts', 'make_zero',
                    '-movflags', '+faststart',
                    output_path
                ]
            
            print(f"Running mux command: {' '.join(cmd)}")
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            print(f"FFmpeg stdout: {result.stdout}")
            print(f"FFmpeg stderr: {result.stderr}")
            
            if result.returncode != 0:
                print(f"Mux error: {result.stderr}")
                return jsonify({"error": f"Audio muxing failed: {result.stderr}"}), 500
            
            if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
                return jsonify({"error": "Mux output file was not created"}), 500

            # Fix for Windows file locking: read file into memory, then delete
            with open(output_path, 'rb') as f:
                data = f.read()
            os.remove(output_path)
            return send_file(BytesIO(data), as_attachment=True, download_name='final_video.mp4')
            
    except Exception as e:
        print(f"Mux error: {str(e)}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5002, debug=True)