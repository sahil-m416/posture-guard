# 🧘 PostureGuard

Real-time posture monitoring using your webcam. Alerts you when you're slouching — runs **100% locally**, zero data leaves your machine.

Built with [MediaPipe Pose](https://google.github.io/mediapipe/solutions/pose) + vanilla JS.

---

## Features

- 🎯 Real-time slouch detection (head-forward + shoulder droop)
- 🔔 Visual toast + sound + browser notifications
- 📊 Session stats — alerts count, session time, good posture %
- 🎛️ Calibration — set your personal "good posture" baseline
- 💀 Skeleton overlay on video feed
- 🔒 100% local — no server, no data sent anywhere
- 🌐 Works as a standalone web app **and** as a Chrome extension

---

## Usage

### Option 1 — Standalone Web App (no install needed)

Just open `web/index.html` in Chrome/Edge/Firefox:

```bash
open web/index.html
# or serve it locally:
npx serve web/
```

### Option 2 — Chrome Extension

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `extension/` folder
4. Pin PostureGuard to your toolbar
5. Click the icon → **Start**

---

## How it works

MediaPipe Pose detects 33 body landmarks in real-time via your webcam.

PostureGuard watches two signals:

| Signal | What it measures |
|---|---|
| **Head forward** | Nose Z-depth vs. shoulder midpoint Z-depth |
| **Ear droop** | Vertical distance between ear and shoulder |

If either exceeds the threshold for **15 consecutive frames** (~0.5s), a slouch is confirmed and an alert fires. Calibrating your "good posture" adjusts the thresholds to your body proportions.

---

## Project Structure

```
posture-guard/
├── shared/
│   └── posture.js        # Core detection logic (used by web app)
├── web/
│   ├── index.html        # Standalone web app
│   ├── style.css
│   └── app.js
└── extension/
    ├── manifest.json     # Chrome MV3 manifest
    ├── popup.html        # Extension popup UI
    ├── popup.js          # Popup logic (detection inlined for MV3)
    ├── background.js     # Service worker — system notifications
    └── icons/            # Extension icons (16, 48, 128px)
```

---

## Tech Stack

- **MediaPipe Pose** — landmark detection, runs in WebAssembly
- **Vanilla JS** — no framework, no build step
- **Web Audio API** — beep alerts
- **Notifications API** — browser/system alerts
- **Chrome Extensions Manifest V3**

---

*Built as a weekend project. Contributions welcome!*
