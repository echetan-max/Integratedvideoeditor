# AutoZoom Backend API

This Flask API provides integration between the sak.py AutoZoom recorder and the web-based video editor.

## Setup

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. Make sure you have all the sak.py dependencies installed:
```bash
pip install customtkinter mss pynput opencv-python numpy sounddevice scipy pygetwindow pywin32
```

3. Ensure FFmpeg is installed and available in your system PATH for audio processing.

## Running the API

1. Start the Flask server:
```bash
python app.py
```

The API will run on `http://localhost:5000`

2. The frontend (running on `http://localhost:3000` or `http://localhost:5173`) can now communicate with the backend.

## API Endpoints

- `POST /start-recording` - Start AutoZoom recording
- `POST /stop-recording` - Stop recording and process video
- `GET /recording-status` - Get current recording status
- `GET /video` - Download the generated video file
- `GET /clicks` - Download the clicks data JSON
- `GET /health` - Health check endpoint

## Files Generated

- `out.mp4` - Final processed video with zoom effects
- `clicks.json` - Click coordinates and timing data for frontend integration
- `temp_audio.wav` - Temporary audio file (cleaned up automatically)

## Integration Flow

1. Frontend calls `/start-recording` to begin screen capture
2. User clicks around in their application to create zoom points
3. Frontend calls `/stop-recording` to finish and process the video
4. Frontend fetches the video and clicks data via `/video` and `/clicks`
5. Video and zoom data are imported into the timeline editor for further editing

## Notes

- The API enables CORS for localhost:3000 and localhost:5173
- Recording runs in a separate process to avoid blocking the API
- Files are automatically cleaned up between recordings
- The backend requires Windows for the current sak.py implementation