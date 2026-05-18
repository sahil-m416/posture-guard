# 🧘 PostureGuard

Real-time posture monitoring using your webcam. Alerts you when you're slouching — runs **100% locally**, zero data leaves your machine.

Built with [MediaPipe Pose](https://google.github.io/mediapipe/solutions/pose) + vanilla JS.

**[Live Demo →](https://posture-guard-ten.vercel.app)**

---

## Features

- 🎯 Real-time slouch detection (head-forward + shoulder droop)
- 🔔 Visual toast + sound + browser notifications
- 📊 Session stats — alerts count, session time, good posture %
- 🎛️ Calibration — set your personal "good posture" baseline
- 💀 Skeleton overlay on video feed
- 🌗 Light / dark theme
- 🔒 100% local — no server, no data collected, no tracking

---

## Usage

### Option 1 — Live Web App

Visit **[posture-guard-ten.vercel.app](https://posture-guard-ten.vercel.app)** — no install needed.

Or run locally:

```bash
open web/index.html
# or with a local server:
npx serve web/
```

### Option 2 — Chrome Extension (dev mode, Web Store coming soon)

The extension is not yet published on the Chrome Web Store. You can sideload it locally:

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle, top right)
3. Click **Load unpacked** → select the `extension/` folder
4. Pin PostureGuard to your toolbar and click the icon → **Start**

> Chrome Web Store release is pending Google review. Stay tuned.

---

## How it works

MediaPipe Pose detects 33 body landmarks in real-time via your webcam.

PostureGuard watches two signals:

| Signal | What it measures |
|---|---|
| **Head forward** | Nose Z-depth drift vs. your calibrated baseline |
| **Ear droop** | Vertical ear-to-shoulder distance vs. your calibrated baseline |

If either signal exceeds the threshold for **30 consecutive frames (~1s)**, a slouch is confirmed and an alert fires. Both checks require calibration — raw values vary too much across body types and camera distances.

**First time? Always calibrate first:** sit up straight and click **Calibrate** after starting.

---

## Project Structure

```
posture-guard/
├── web/
│   ├── index.html          # Standalone web app
│   ├── style.css
│   ├── app.js
│   └── shared/
│       └── posture.js      # Core detection logic
├── extension/
│   ├── manifest.json       # Chrome MV3 manifest
│   ├── popup.html          # Extension popup UI
│   ├── popup.js            # Detection logic (inlined for MV3)
│   ├── background.js       # Service worker — system notifications
│   └── icons/
├── shared/
│   └── posture.js          # Source of truth (extension reads this)
└── vercel.json
```

---

## Tech Stack

- **MediaPipe Pose** — landmark detection, runs in WebAssembly in-browser
- **Vanilla JS** — no framework, no build step
- **Web Audio API** — beep alerts
- **Notifications API** — browser/system alerts
- **Chrome Extensions Manifest V3**

---

## Privacy

PostureGuard processes your webcam feed entirely on your device using WebAssembly. No video, image, or landmark data is ever sent to a server. There is no backend.

---

*Built as a weekend vibe-coding project. Contributions welcome!*
