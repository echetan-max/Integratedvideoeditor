# Enhanced version of sak.py that exports clicks.json for API integration
# This modifies the original sak.py to export click data

import time, queue, threading, subprocess, os, json
import numpy as np
import cv2
import mss
import sounddevice as sd
import scipy.io.wavfile as wav
import customtkinter as ctk
import pygetwindow as gw
from pynput import mouse
import win32gui, win32con

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
recording_start_time = None

ctk.set_appearance_mode("system")
ctk.set_default_color_theme("blue")
app = ctk.CTk()
app.title("AutoZoom Recorder Pro - API Mode")
app.geometry("520x580")

status_var = ctk.StringVar(value="Ready for API control.")
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

def get_region(window):
    if window:
        return {'left': window.left, 'top': window.top, 'width': window.width, 'height': window.height}
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
    buf = []
    try:
        apis = sd.query_hostapis()
        idx = next(i for i,a in enumerate(apis) if 'wasapi' in a['name'].lower())
        dev = next(i for i,d in enumerate(sd.query_devices())
                   if d['hostapi']==idx and 'loopback' in d['name'].lower())
    except Exception:
        dev = None

    if dev is None:
        status_var.set("Loopback not found, mic only.")
        device=None; ch=1
    else:
        device=dev
        ch=sd.query_devices(dev)['max_input_channels']

    def cb(ind,frames_count,ti,st):
        audio_q.put(ind.copy())

    with sd.InputStream(samplerate=AUDIO_FS, device=device, channels=ch, callback=cb):
        while not stop_event.is_set():
            sd.sleep(100)
    while not audio_q.empty():
        buf.append(audio_q.get())
    if buf:
        arr = np.concatenate(buf, axis=0)
        mv = np.abs(arr).max()
        if mv>0: arr = arr/mv*0.95
        wav.write("temp_audio.wav", AUDIO_FS, arr.astype(np.float32))

def on_move(x, y):
    cursor_pos[0], cursor_pos[1] = x, y

def on_click(x, y, button, pressed):
    global recording_start_time
    if pressed and not stop_event.is_set():
        window = get_selected_window()
        region = get_region(window)
        rel_x = x - region['left']
        rel_y = y - region['top']
        
        # Calculate relative time from recording start
        click_time = time.time()
        if recording_start_time:
            relative_time = click_time - recording_start_time
        else:
            relative_time = 0
            
        clicks.append((click_time, rel_x, rel_y, relative_time))
        
        def update_log():
            click_log.configure(state="normal")
            click_log.insert("end", f"{rel_x:.0f}, {rel_y:.0f} @ {relative_time:.1f}s\n")
            click_log.configure(state="disabled")
        app.after(0, update_log)

def export_clicks_json(region):
    """Export clicks data in JSON format for frontend integration"""
    try:
        clicks_data = {
            'clicks': [],
            'width': region['width'],
            'height': region['height'],
            'duration': 0,
            'recording_info': {
                'fps': FPS,
                'zoom_factor': ZOOM_FACTOR,
                'zoom_time': ZOOM_TIME,
                'idle_time': IDLE_TIME
            }
        }
        
        if frames and len(frames) > 1:
            clicks_data['duration'] = frames[-1][0] - frames[0][0]
        
        # Convert clicks to frontend format
        for click_time, x, y, relative_time in clicks:
            clicks_data['clicks'].append({
                'time': relative_time,
                'x': int(x),
                'y': int(y),
                'timestamp': click_time
            })
        
        # Save clicks.json
        with open('clicks.json', 'w') as f:
            json.dump(clicks_data, f, indent=2)
            
        print(f"Exported {len(clicks_data['clicks'])} clicks to clicks.json")
        
    except Exception as e:
        print(f"Error exporting clicks: {e}")

def cluster_clicks(clicks, time_eps=0.6, dist_eps=40):
    if not clicks: return []
    clicks = sorted(clicks, key=lambda c: c[0])
    clusters = [{"times": [clicks[0][0]], "xs": [clicks[0][1]], "ys": [clicks[0][2]]}]
    for t, x, y, _ in clicks[1:]:
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

def zoom_at(img, cx, cy, scale):
    h, w = img.shape[:2]
    cw, ch = int(w/scale), int(h/scale)
    x1 = max(0, min(w-cw, int(cx)-cw//2))
    y1 = max(0, min(h-ch, int(cy)-ch//2))
    crop = img[y1:y1+ch, x1:x1+cw]
    return cv2.resize(crop, (w, h), interpolation=cv2.INTER_LINEAR)

def smooth_point(prev, new, alpha=0.8):
    return [prev[0]*alpha + new[0]*(1-alpha), prev[1]*alpha + new[1]*(1-alpha)]

def apply_transition(seq, cx, cy, start_z, end_z):
    out = []
    n   = len(seq)
    if n == 0:
        return out
    for i, (_, f, _, _) in enumerate(seq):
        frac  = i / max(1, n-1)
        scale = start_z + (end_z - start_z) * frac
        out.append(zoom_at(f, cx, cy, scale))
    return out

def process_and_save():
    try:
        window = get_selected_window()
        region = get_region(window)
        
        # Export clicks data for API
        export_clicks_json(region)
        
        if not frames or len(frames) < 3:
            status_var.set("No frames captured or recording interrupted.")
            return
            
        final = []
        clusters = cluster_clicks(clicks)
        used = 0
        i = 0
        win_w, win_h = region['width'], region['height']
        center = [win_w/2, win_h/2]
        zoom_steps = int(FPS * ZOOM_TIME)

        while i < len(frames):
            ts, img, rx, ry = frames[i]
            if used < len(clusters):
                click_time, cx, cy = clusters[used]
                pre_zoom_start = click_time - ZOOM_TIME
                if ts >= pre_zoom_start and ts < click_time:
                    pre = [f for f in frames if pre_zoom_start <= f[0] < click_time]
                    final += apply_transition(pre, cx, cy, 1.0, ZOOM_FACTOR)
                    i += len(pre)
                    continue
                elif ts >= click_time:
                    center = [cx, cy]
                    j = i
                    last_move = frames[j][0]
                    prev_pos = [cx, cy]
                    while j < len(frames):
                        t2, f2, r2x, r2y = frames[j]
                        moved = (abs(r2x - prev_pos[0]) > 2 or abs(r2y - prev_pos[1]) > 2)
                        if moved:
                            last_move = t2
                        prev_pos = [r2x, r2y]
                        center = smooth_point(center, [r2x, r2y])
                        final.append(zoom_at(f2, center[0], center[1], ZOOM_FACTOR))
                        if t2 - last_move >= IDLE_TIME:
                            break
                        j += 1
                    post = frames[j:j+zoom_steps]
                    final += apply_transition(post, center[0], center[1], ZOOM_FACTOR, 1.0)
                    i = j + zoom_steps
                    used += 1
                    continue
            final.append(img)
            i += 1

        if len(final) > 2 and ZOOM_FACTOR > 1.0:
            for k in range(zoom_steps):
                frac = k / max(1, zoom_steps-1)
                scale = ZOOM_FACTOR - (ZOOM_FACTOR-1) * frac
                final.append(zoom_at(final[-1], center[0], center[1], scale))

        h, w = final[0].shape[:2]
        tmp  = "out_tmp.mp4"
        if len(frames) > 1:
            real_duration = frames[-1][0] - frames[0][0]
        else:
            real_duration = len(final) / FPS
        actual_fps = len(final) / real_duration if real_duration > 0 else FPS

        vw = cv2.VideoWriter(tmp, cv2.VideoWriter_fourcc(*"mp4v"), actual_fps, (w, h))
        for frame in final:
            vw.write(frame)
        vw.release()
        
        final_name = "out.mp4"
        if os.path.exists("temp_audio.wav"):
            subprocess.run(["ffmpeg","-y","-i",tmp,"-i","temp_audio.wav",
                            "-c:v","copy","-c:a","aac","-shortest",final_name], check=True)
            os.remove("temp_audio.wav"); os.remove(tmp)
        else:
            if os.path.exists(final_name): os.remove(final_name)
            os.replace(tmp, final_name)
            
        status_var.set(f"Saved: {final_name} and clicks.json")
        
    except Exception as e:
        status_var.set(f"Error: {e}")

def start_recording():
    global mouse_listener, recording_start_time
    stop_event.clear(); frames.clear(); clicks.clear()
    recording_start_time = time.time()
    click_log.configure(state="normal"); click_log.delete("0.0","end"); click_log.configure(state="disabled")
    status_var.set("Recording… (API Mode)")
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
    status_var.set("Processing… (Exporting clicks.json)")
    if mouse_listener is not None:
        mouse_listener.stop()
        mouse_listener = None
    threading.Thread(target=process_and_save, daemon=True).start()

ctk.CTkButton(app, text="Start Recording", command=start_recording).pack(pady=6)
ctk.CTkButton(app, text="Stop & Save",     command=stop_recording).pack(pady=6)

# API mode indicator
api_label = ctk.CTkLabel(app, text="🔗 API Integration Mode - clicks.json will be exported", 
                        text_color="green")
api_label.pack(pady=(6, 12))

if __name__ == "__main__":
    app.mainloop()