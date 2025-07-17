from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import tempfile, os, subprocess
from io import BytesIO

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

            cmd = [
                'ffmpeg', '-y',
                '-i', input_path,
                '-c:v', 'libx264',
                '-preset', 'slow',
                '-crf', '22',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-movflags', '+faststart',
                output_path
            ]
            subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

            with open(output_path, 'rb') as f:
                mp4_bytes = f.read()
            return send_file(
                BytesIO(mp4_bytes),
                mimetype='video/mp4',
                as_attachment=True,
                download_name='exported.mp4'
            )
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5001, debug=True)
