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
AUDIO_FS = 44100

frames = []
clicks = []
stop_event = threading.Event()
cursor_pos = [0, 0]

ctk.set_appearance_mode("system")
ctk.set_default_color_theme("blue")

# --- Main app window ---
app = ctk.CTk()
app.title("Screen Recorder (RAW + Smartzoom log)")
app.geometry("500x320")
status_var = ctk.StringVar(value="Ready.")
ctk.CTkLabel(app, textvariable=status_var).pack(pady=(12, 0))
window_titles = [t for t in gw.getAllTitles() if t.strip()]
dropdown = ctk.CTkComboBox(app, values=["Full Screen"] + window_titles, width=480)
dropdown.pack(pady=12)

click_log = ctk.CTkTextbox(app, width=480, height=80, state="normal")
click_log.pack(pady=6)
click_log.insert("end", "Click log will appear here.\n")
click_log.configure(state="disabled")

# --- Stop recording window ---
stop_app = None

def record_audio(duration, filename):
    print("Recording audio...")
    audio = sd.rec(int(duration * AUDIO_FS), samplerate=AUDIO_FS, channels=2)
    sd.wait()
    wav.write(filename, AUDIO_FS, audio)
    print("Audio saved to", filename)

def on_click(x, y, button, pressed):
    if pressed and not stop_event.is_set():
        t = time.time() - start_time
        click = {"time": t, "x": x, "y": y, "zoom": 2.0}
        clicks.append(click)
        app.after(0, lambda: log_click(click))

def log_click(click):
    click_log.configure(state="normal")
    click_log.insert("end", f"At {click['time']:.2f}s: ({click['x']}, {click['y']})\n")
    click_log.configure(state="disabled")
    click_log.see("end")

def show_stop_window():
    global stop_app
    stop_app = ctk.CTk()
    stop_app.title("Recording...")
    stop_app.geometry("300x120")
    ctk.CTkLabel(stop_app, text="Recording...").pack(pady=18)
    ctk.CTkButton(stop_app, text="🟥 Stop Recording", fg_color="red", command=stop_recording_btn).pack(pady=18)
    stop_app.attributes("-topmost", True)
    stop_app.protocol("WM_DELETE_WINDOW", stop_recording_btn)  # If closed, stop too
    stop_app.mainloop()

def stop_recording_btn():
    stop_event.set()
    if stop_app is not None:
        stop_app.destroy()

def start_record():
    global start_time, stop_app
    window = dropdown.get()
    if window == "Full Screen":
        mon = mss.mss().monitors[1]
        bbox = {"top": mon["top"], "left": mon["left"], "width": mon["width"], "height": mon["height"]}
    else:
        hwnd = gw.getWindowsWithTitle(window)[0]._hWnd
        win32gui.SetForegroundWindow(hwnd)
        rect = win32gui.GetWindowRect(hwnd)
        bbox = {"top": rect[1], "left": rect[0], "width": rect[2]-rect[0], "height": rect[3]-rect[1]}
    sct = mss.mss()
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter("original.mp4", fourcc, FPS, (bbox["width"], bbox["height"]))
    status_var.set("Recording... (see Stop window to end)")
    app.update()
    frames.clear()
    clicks.clear()
    click_log.configure(state="normal")
    click_log.delete("1.0", "end")
    click_log.insert("end", "Click log will appear here.\n")
    click_log.configure(state="disabled")
    stop_event.clear()
    start_time = time.time()
    listener = mouse.Listener(on_click=on_click)
    listener.start()

    # Minimize main window and show stop window
    app.iconify()
    stop_thread = threading.Thread(target=show_stop_window, daemon=True)
    stop_thread.start()

    duration = 0
    try:
        while not stop_event.is_set():
            frame = np.array(sct.grab(bbox))
            frame = cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)
            out.write(frame)
            # No preview window (to prevent focus loss)
        duration = time.time() - start_time
    finally:
        out.release()
        stop_event.set()
        listener.stop()
        if stop_app is not None:
            try: stop_app.destroy()
            except: pass
        app.deiconify()

    # Record audio (system + mic best effort)
    record_audio(duration, "original_audio.wav")
    # Save click/zoom keyframes
    with open("zoom_keyframes.json", "w") as f:
        json.dump(clicks, f, indent=2)
    status_var.set(f"Done! Video: original.mp4, Keyframes: zoom_keyframes.json")
    app.update()

ctk.CTkButton(app, text="Start Recording", command=start_record).pack(pady=20)

app.mainloop()
