# Enhanced AutoZoom Recorder - Exports raw video + click data for timeline editing
# pip install customtkinter mss pynput opencv-python numpy sounddevice scipy pygetwindow pywin32

import time, queue, threading, subprocess, os, json
import numpy as np
import cv2
import mss
import sounddevice as sd
import noisereduce as nr
import scipy.io.wavfile as wav
import customtkinter as ctk
import pygetwindow as gw
from pynput import mouse
import win32gui, win32con
from scipy.signal import butter, sosfiltfilt, iirnotch, filtfilt

FPS = 30
ZOOM_FACTOR = 2.0
ZOOM_TIME = 1.0
IDLE_TIME = 1.0
AUDIO_FS = 44100

frames = []
clicks = []
audio_q = queue.Queue()
stop_event = threading.Event()
cursor_pos = [0, 0]
mouse_listener = None

ctk.set_appearance_mode("system")
ctk.set_default_color_theme("blue")
app = ctk.CTk()
app.title("AutoZoom Recorder Pro - Enhanced")
app.geometry("520x580")

status_var = ctk.StringVar(value="Ready.")
ctk.CTkLabel(app, textvariable=status_var).pack(pady=(12, 0))
window_titles = [t for t in gw.getAllTitles() if t.strip()]
dropdown = ctk.CTkComboBox(app, values=["Full Screen"] + window_titles, width=480)
dropdown.pack(pady=12)

click_log = ctk.CTkTextbox(app, width=480, height=120)
click_log.configure(state="disabled")
click_log.pack(pady=6)

def get_selected_window():
    title = dropdown.get()
    if title == "Full Screen":
        return None
    wins = gw.getWindowsWithTitle(title)
    return wins[0] if wins else None

def focus_window(window):
    try:
        if window and win32gui.IsIconic(window._hWnd):
            win32gui.ShowWindow(window._hWnd, win32con.SW_RESTORE)
        if window:
            win32gui.SetForegroundWindow(window._hWnd)
    except Exception as e:
        print("Window focus error:", e)

def is_window_valid(window):
    try:
        if not window:
            return False
        hwnd = window._hWnd
        return win32gui.IsWindow(hwnd) and win32gui.IsWindowVisible(hwnd)
    except:
        return False

def get_region(window):
    if window:
        return {'left': window.left, 'top': window.top, 'width': window.width, 'height': window.height}
    # Full screen fallback
    with mss.mss() as sct:
        monitor = sct.monitors[1]
        return {'left': monitor['left'], 'top': monitor['top'], 'width': monitor['width'], 'height': monitor['height']}

def record_screen(region):
    global frames
    frames.clear()
    with mss.mss() as sct:
        while not stop_event.is_set():
            try:
                t = time.time()
                img = np.array(sct.grab(region))
                img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
                rx, ry = cursor_pos[0] - region['left'], cursor_pos[1] - region['top']
                if 0 <= rx < region['width'] and 0 <= ry < region['height']:
                    cv2.circle(img, (int(rx), int(ry)), 8, (0, 255, 0), -1)
                frames.append((t, img, rx, ry))
                time.sleep(1/FPS)
            except Exception as e:
                status_var.set("Error capturing screen: " + str(e))
                stop_event.set()
                break

def record_audio():
    import noisereduce as nr
    import numpy as np
    import sounddevice as sd
    import scipy.io.wavfile as wav
    from scipy.signal import iirnotch, butter, filtfilt

    buf = []
    def cb(indata, frames, t, status):
        buf.append(indata.copy())

    # 1) Calibrate ambient noise (0.5 s)
    with sd.InputStream(samplerate=AUDIO_FS, device=None, channels=1, callback=cb):
        status_var.set("Calibrating noise (0.5 s)…")
        sd.sleep(int(0.5 * 1000))
    noise_profile = np.concatenate(buf, axis=0).flatten()
    buf.clear()

    # 2) Record your voice until stopped
    with sd.InputStream(samplerate=AUDIO_FS, device=None, channels=1, callback=cb):
        status_var.set("Recording voice…")
        while not stop_event.is_set():
            sd.sleep(100)

    if not buf:
        status_var.set("No audio captured.")
        return
    arr = np.concatenate(buf, axis=0).flatten()

    # 3) Notch at 50 Hz
    b_notch, a_notch = iirnotch(50.0, Q=30.0, fs=AUDIO_FS)
    arr = filtfilt(b_notch, a_notch, arr)

    # 4) Band-pass 100 Hz–8 kHz
    nyq = 0.5 * AUDIO_FS
    sos = butter(4, [100/nyq, 8000/nyq], btype='band', output='sos')
    arr = sosfiltfilt(sos, arr)

    # 5) Noise reduction with your true profile
    try:
        arr = nr.reduce_noise(
            y=arr,
            y_noise=noise_profile,
            sr=AUDIO_FS,
            stationary=True,
            prop_decrease=0.6
        )
    except Exception as e:
        print("Noise reduction failed:", e)

    # 6) Smooth noise gate (10 ms attack, 100 ms release)
    frame_len = int(0.02 * AUDIO_FS)  # 20 ms
    hop_len   = int(0.01 * AUDIO_FS)  # 10 ms
    rms_vals = []
    for i in range(0, len(arr), hop_len):
        frame = arr[i:i+frame_len]
        rms_vals.append(np.sqrt(np.mean(frame**2)) if frame.size else 0)
    rms = np.array(rms_vals)
    gate_thresh = np.mean(np.sqrt(np.mean(noise_profile[:frame_len]**2))) * 1.5
    mask = np.repeat(rms > gate_thresh, hop_len)[:len(arr)]

    # envelope smoothing
    aA = np.exp(-1/(0.01* AUDIO_FS))  # attack
    aR = np.exp(-1/(0.1 * AUDIO_FS))  # release
    env = np.zeros_like(mask, dtype=float)
    for i in range(1, len(mask)):
        env[i] = aA * env[i-1] + (1 - aA) if mask[i] else aR * env[i-1]
    arr = arr * env

    # 7) Normalize to 85% full scale
    peak = np.max(np.abs(arr))
    if peak > 0:
        arr = arr / peak * 0.85

    # 8) Write 16-bit PCM
    pcm = (arr * 32767).astype(np.int16)
    wav.write("temp_audio.wav", AUDIO_FS, pcm)

    status_var.set("Audio cleanly saved.")



        
def on_move(x, y):
    cursor_pos[0], cursor_pos[1] = x, y

# Fix: Only register click on mouse down, not on release, and prevent double logging
last_click_time: list[float] = [0.0]
def on_click(x, y, button, pressed):
    if pressed and not stop_event.is_set():
        # Debounce: ignore if last click was very recent (e.g., <0.2s)
        now = time.time()
        if now - last_click_time[0] < 0.2:
            return
        last_click_time[0] = now
        window = get_selected_window()
        region = get_region(window)
        rel_x = x - region['left']
        rel_y = y - region['top']
        clicks.append((now, rel_x, rel_y))
        def update_log():
            click_log.configure(state="normal")
            click_log.insert("end", f"{rel_x:.0f}, {rel_y:.0f}\n")
            click_log.configure(state="disabled")
        app.after(0, update_log)

def cluster_clicks(clicks, time_eps=0.6, dist_eps=40):
    if not clicks: return []
    clicks = sorted(clicks, key=lambda c: c[0])
    clusters = [{"times": [clicks[0][0]], "xs": [clicks[0][1]], "ys": [clicks[0][2]]}]
    for t, x, y in clicks[1:]:
        last = clusters[-1]
        lt   = last["times"][-1]
        cx   = sum(last["xs"]) / len(last["xs"])
        cy   = sum(last["ys"]) / len(last["ys"])
        if (t - lt <= time_eps and ((x-cx)**2 + (y-cy)**2)**0.5 <= dist_eps):
            last["times"].append(t)
            last["xs"].append(x)
            last["ys"].append(y)
        else:
            clusters.append({"times":[t],"xs":[x],"ys":[y]})
    out = []
    for cl in clusters:
        out.append((min(cl["times"]), sum(cl["xs"]) / len(cl["xs"]), sum(cl["ys"]) / len(cl["ys"])))
    return out

def save_raw_video_and_clicks():
    """Save raw video without zoom effects + click data for timeline editing"""
    try:
        if not frames or len(frames) < 3:
            status_var.set("No frames captured or recording interrupted.")
            return
        
        # Get window dimensions
        window = get_selected_window()
        region = get_region(window)
        win_w, win_h = region['width'], region['height']
        
        # Save raw video (no zoom effects applied)
        h, w = frames[0][1].shape[:2]
        tmp = "out_tmp.mp4"
        
        if len(frames) > 1:
            real_duration = frames[-1][0] - frames[0][0]
        else:
            real_duration = len(frames) / FPS
        actual_fps = len(frames) / real_duration if real_duration > 0 else FPS

        # Compatibility for VideoWriter_fourcc
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')  # type: ignore
        vw = cv2.VideoWriter(tmp, fourcc, actual_fps, (w, h))
        for _, frame, _, _ in frames:
            if frame.shape[1] != w or frame.shape[0] != h:
                frame = cv2.resize(frame, (w, h))
            vw.write(frame)
        vw.release()

        # Find next available N for outN.mp4 and clicksN.json
        n = 1
        while os.path.exists(f"out{n}.mp4") or os.path.exists(f"clicks{n}.json"):
            n += 1
        final_name = f"out{n}.mp4"
        clicks_name = f"clicks{n}.json"

        # Add audio if available
        if os.path.exists("temp_audio.wav"):
            try:
                subprocess.run([
                    "ffmpeg", "-y",
                    "-i", tmp,
                    "-i", "temp_audio.wav",
                    "-c:v", "libx264",
                    "-preset", "fast",
                    "-crf", "23",
                    "-c:a", "aac",
                    "-movflags", "+faststart",
                    "-shortest", final_name
                ], check=True)
            except FileNotFoundError:
                status_var.set("Error: ffmpeg not found. Please install ffmpeg and ensure it is in your PATH.")
                print("Error: ffmpeg not found. Please install ffmpeg and ensure it is in your PATH.")
                return
            os.remove("temp_audio.wav")
            os.remove(tmp)
        else:
            if os.path.exists(final_name):
                os.remove(final_name)
            os.replace(tmp, final_name)

        # Process clicks and save as JSON
        clusters = cluster_clicks(clicks)
        clicks_data = []
        
        for i, (click_time, cx, cy) in enumerate(clusters):
            clicks_data.append({
                "id": f"autozoom-{i}",
                "time": click_time,
                "x": cx,
                "y": cy,
                "width": win_w,
                "height": win_h,
                "zoomLevel": ZOOM_FACTOR,
                "duration": ZOOM_TIME + IDLE_TIME,  # Total zoom duration
                "type": "autozoom"
            })

        # Save clicks data
        output_data = {
            "clicks": clicks_data,
            "width": win_w,
            "height": win_h,
            "duration": real_duration,
            "fps": FPS,
            "zoomFactor": ZOOM_FACTOR,
            "zoomTime": ZOOM_TIME,
            "idleTime": IDLE_TIME,
            "totalClicks": len(clusters),
            "exportedAt": time.time()
        }
        
        with open(clicks_name, "w") as f:
            json.dump(output_data, f, indent=2)

        status_var.set(f"Saved: {final_name} + {clicks_name} ({len(clusters)} zooms)")
        print(f"Exported {len(clusters)} auto-zoom effects for timeline editing as {final_name} and {clicks_name}")
        
    except Exception as e:
        status_var.set(f"Error: {e}")
        print(f"Error saving raw video and clicks: {e}")

def start_recording():
    global mouse_listener
    stop_event.clear(); frames.clear(); clicks.clear()
    click_log.configure(state="normal"); click_log.delete("0.0","end"); click_log.configure(state="disabled")
    status_var.set("Recording…")
    window = get_selected_window()
    region = get_region(window)
    focus_window(window)
    threading.Thread(target=record_screen, args=(region,), daemon=True).start()
    threading.Thread(target=record_audio, daemon=True).start()
    mouse_listener = mouse.Listener(on_click=on_click, on_move=on_move)
    mouse_listener.start()

def stop_recording():
    global mouse_listener
    stop_event.set()
    status_var.set("Processing…")
    if mouse_listener is not None:
        mouse_listener.stop()
        mouse_listener = None
    threading.Thread(target=save_raw_video_and_clicks, daemon=True).start()

ctk.CTkButton(app, text="Start Recording", command=start_recording).pack(pady=6)
ctk.CTkButton(app, text="Stop & Save Raw Video", command=stop_recording).pack(pady=6)

app.mainloop()