// Extension popup — mirrors web/app.js but scoped to the popup window.
// Shared posture logic is inlined here (no ES module support in MV3 popups via CDN).

// ── Slouch detection (inlined from shared/posture.js) ──
const SLOUCH_THRESHOLDS = {
  headForward: 0.06,
  earShoulderDrop: 0.07,
  confirmFrames: 30,
};

class PostureDetector {
  constructor(onSlouch, onGoodPosture) {
    this.onSlouch = onSlouch;
    this.onGoodPosture = onGoodPosture;
    this.slouchFrames = 0;
    this.isSlouching = false;
    this.calibration = null;
  }

  calibrate(landmarks) {
    const data = this._extract(landmarks);
    if (!data) return false;
    const { noseZ, leftShoulderZ, rightShoulderZ, leftEarY, rightEarY, leftShoulderY, rightShoulderY } = data;
    const shoulderMidZ = (leftShoulderZ + rightShoulderZ) / 2;
    this.calibration = {
      headForwardOffset: shoulderMidZ - noseZ,
      avgEarShoulderDist: (Math.abs(leftEarY - leftShoulderY) + Math.abs(rightEarY - rightShoulderY)) / 2,
    };
    return true;
  }

  analyze(landmarks) {
    const data = this._extract(landmarks);
    if (!data) return null;

    const { noseZ, leftShoulderZ, rightShoulderZ, leftEarY, rightEarY, leftShoulderY, rightShoulderY } = data;
    const shoulderMidZ = (leftShoulderZ + rightShoulderZ) / 2;
    const headForwardOffset = shoulderMidZ - noseZ;
    const leftEarShoulderDist  = Math.abs(leftEarY  - leftShoulderY);
    const rightEarShoulderDist = Math.abs(rightEarY - rightShoulderY);
    const avgEarShoulderDist   = (leftEarShoulderDist + rightEarShoulderDist) / 2;

    let isHeadForward = false;
    let isEarDropped  = false;

    if (this.calibration) {
      isHeadForward = headForwardOffset > this.calibration.headForwardOffset + SLOUCH_THRESHOLDS.headForward;
      isEarDropped  = avgEarShoulderDist < this.calibration.avgEarShoulderDist - SLOUCH_THRESHOLDS.earShoulderDrop;
    }

    const slouching = isHeadForward || isEarDropped;

    if (slouching) {
      this.slouchFrames++;
      if (this.slouchFrames >= SLOUCH_THRESHOLDS.confirmFrames && !this.isSlouching) {
        this.isSlouching = true;
        this.onSlouch?.({ isHeadForward, isEarDropped });
      }
    } else {
      if (this.slouchFrames > 0) this.slouchFrames = Math.max(0, this.slouchFrames - 2);
      if (this.isSlouching && this.slouchFrames === 0) {
        this.isSlouching = false;
        this.onGoodPosture?.();
      }
    }

    return {
      slouching: this.isSlouching,
      pending: slouching && !this.isSlouching,
      score: Math.min(100, Math.round((this.slouchFrames / SLOUCH_THRESHOLDS.confirmFrames) * 100)),
      details: { isHeadForward, isEarDropped },
    };
  }

  reset() { this.slouchFrames = 0; this.isSlouching = false; }

  _extract(landmarks) {
    if (!landmarks || landmarks.length < 13) return null;
    const NOSE = 0, L_EAR = 7, R_EAR = 8, L_SHOULDER = 11, R_SHOULDER = 12;
    try {
      return {
        noseZ: landmarks[NOSE].z,
        leftShoulderZ: landmarks[L_SHOULDER].z,
        rightShoulderZ: landmarks[R_SHOULDER].z,
        leftEarY: landmarks[L_EAR].y,
        rightEarY: landmarks[R_EAR].y,
        leftShoulderY: landmarks[L_SHOULDER].y,
        rightShoulderY: landmarks[R_SHOULDER].y,
        headForwardOffset: 0,
        avgEarShoulderDist: 0,
      };
    } catch { return null; }
  }
}

// ── DOM refs ──
const video       = document.getElementById('popup-video');
const canvas      = document.getElementById('popup-canvas');
const ctx         = canvas.getContext('2d');
const placeholder = document.getElementById('cam-placeholder');
const statusPill  = document.getElementById('status-pill');
const postureEl   = document.getElementById('posture-status');
const psTitle     = document.getElementById('ps-title');
const psSub       = document.getElementById('ps-sub');
const scoreFill   = document.getElementById('popup-score-fill');
const pAlerts     = document.getElementById('p-alerts');
const pDuration   = document.getElementById('p-duration');
const pGoodPct    = document.getElementById('p-good-pct');
const btnStart    = document.getElementById('p-btn-start');
const btnCal      = document.getElementById('p-btn-calibrate');
const btnStop     = document.getElementById('p-btn-stop');
const openFull    = document.getElementById('open-full-app');

// ── State ──
let pose = null;
let camera = null;
let isMonitoring = false;
let alertCount = 0;
let sessionStart = null;
let sessionTimer = null;
let goodFrames = 0;
let totalFrames = 0;
let lastAlertTime = 0;
let latestLandmarks = null;
let audioCtx = null;
const COOLDOWN_MS = 30000;

const detector = new PostureDetector(
  (details) => onSlouch(details),
  ()        => onGoodPosture()
);

// ── MediaPipe ──
function initPose() {
  pose = new Pose({
    locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`,
  });
  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6,
  });
  pose.onResults(onResults);
}

const POSE_CONNECTIONS = [
  [11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24]
];
const KEY_POINTS = [0, 7, 8, 11, 12, 13, 14, 23, 24];

function onResults(results) {
  canvas.width  = video.videoWidth  || 320;
  canvas.height = video.videoHeight || 240;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!results.poseLandmarks) {
    setStatus('', 'No pose detected', 'Move closer to camera');
    return;
  }

  latestLandmarks = results.poseLandmarks;
  totalFrames++;

  const result = detector.analyze(latestLandmarks);
  if (!result) return;

  drawSkeleton(results.poseLandmarks, result);

  const pct = result.score;
  scoreFill.style.width = pct + '%';
  scoreFill.style.background = pct > 70 ? 'var(--bad)' : pct > 35 ? 'var(--warn)' : 'var(--good)';

  if (!detector.calibration) {
    setStatus('warn', 'Needs calibration', 'Sit straight → click Calibrate');
    statusPill.className = 'status-pill';
    statusPill.textContent = 'Uncalibrated';
  } else if (!result.slouching) {
    goodFrames++;
    setStatus('good', 'Great posture! 🎉', 'Keep it up');
    statusPill.className = 'status-pill active';
    statusPill.textContent = 'Active';
  } else if (result.pending) {
    setStatus('warn', 'Posture slipping...', 'Straighten up!');
  } else {
    setStatus('bad', 'Slouching!', 'Sit up & pull shoulders back');
    statusPill.className = 'status-pill bad';
    statusPill.textContent = 'Slouching!';
  }

  if (totalFrames > 0) pGoodPct.textContent = Math.round((goodFrames / totalFrames) * 100) + '%';
}

function drawSkeleton(landmarks, result) {
  const w = canvas.width, h = canvas.height;
  const color = result.slouching ? '#ef4444' : result.pending ? '#f59e0b' : '#22c55e';
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineCap = 'round';

  for (const [a, b] of POSE_CONNECTIONS) {
    const lA = landmarks[a], lB = landmarks[b];
    if (!lA || !lB || lA.visibility < 0.4 || lB.visibility < 0.4) continue;
    ctx.beginPath();
    ctx.moveTo(lA.x * w, lA.y * h);
    ctx.lineTo(lB.x * w, lB.y * h);
    ctx.globalAlpha = 0.8;
    ctx.stroke();
  }
  for (const i of KEY_POINTS) {
    const lm = landmarks[i];
    if (!lm || lm.visibility < 0.4) continue;
    ctx.beginPath();
    ctx.arc(lm.x * w, lm.y * h, 4, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.globalAlpha = 1; ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function setStatus(type, title, sub) {
  postureEl.className = 'posture-status ' + type;
  psTitle.textContent = title;
  psSub.textContent   = sub;
}

// ── Alerts ──
function onSlouch(details) {
  const now = Date.now();
  if (now - lastAlertTime < COOLDOWN_MS) return;
  lastAlertTime = now;
  alertCount++;
  pAlerts.textContent = alertCount;
  playBeep();

  // Send to background for system notification
  chrome.runtime.sendMessage({
    type: 'SLOUCH_ALERT',
    message: details.isHeadForward ? 'Head too far forward!' : 'Shoulders rounded — sit up!',
  });
}

function onGoodPosture() {}

function playBeep() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.frequency.value = 880; osc.type = 'sine';
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    osc.start(); osc.stop(audioCtx.currentTime + 0.4);
  } catch {}
}

// ── Start / Stop ──
async function startMonitoring() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    video.srcObject = stream;
    await new Promise(r => (video.onloadedmetadata = r));

    if (!pose) initPose();

    camera = new Camera(video, {
      onFrame: async () => { if (isMonitoring) await pose.send({ image: video }); },
      width: 320, height: 240,
    });
    await camera.start();

    isMonitoring = true;
    placeholder.classList.add('hidden');
    btnStart.disabled = true;
    btnStop.disabled  = false;
    btnCal.disabled   = false;
    statusPill.className = 'status-pill active';
    statusPill.textContent = 'Active';
    setStatus('good', 'Monitoring...', 'Analyzing posture');

    sessionStart = Date.now();
    sessionTimer = setInterval(() => {
      const s = Math.floor((Date.now() - sessionStart) / 1000);
      pDuration.textContent = s >= 60 ? `${Math.floor(s/60)}m` : `${s}s`;
    }, 1000);
  } catch {
    alert('Camera access denied. Check extension permissions.');
  }
}

function stopMonitoring() {
  isMonitoring = false;
  if (camera) { camera.stop(); camera = null; }
  if (video.srcObject) { video.srcObject.getTracks().forEach(t => t.stop()); video.srcObject = null; }
  clearInterval(sessionTimer);
  detector.reset();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  placeholder.classList.remove('hidden');
  btnStart.disabled = false; btnStop.disabled = true; btnCal.disabled = true;
  statusPill.className = 'status-pill'; statusPill.textContent = 'Inactive';
  setStatus('', 'Not monitoring', 'Press start below');
  goodFrames = 0; totalFrames = 0;
}

function startCalibration() {
  if (!latestLandmarks) return;
  btnCal.textContent = 'Hold...';
  btnCal.disabled = true;
  setTimeout(() => {
    detector.calibrate(latestLandmarks);
    btnCal.textContent = 'Calibrate';
    btnCal.disabled = false;
  }, 3000);
}

btnStart.addEventListener('click', startMonitoring);
btnStop.addEventListener('click', stopMonitoring);
btnCal.addEventListener('click', startCalibration);

openFull.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('../web/index.html') });
});
