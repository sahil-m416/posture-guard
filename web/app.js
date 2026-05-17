import { PostureDetector } from './shared/posture.js';

// ── DOM refs ──
const video       = document.getElementById('video');
const canvas      = document.getElementById('canvas');
const ctx         = canvas.getContext('2d');
const overlay     = document.getElementById('video-overlay');
const statusBar   = document.getElementById('status-bar');
const statusTitle = document.getElementById('status-title');
const statusSub   = document.getElementById('status-sub');
const scoreFill   = document.getElementById('score-fill');
const btnStart    = document.getElementById('btn-start');
const btnStop     = document.getElementById('btn-stop');
const btnCal      = document.getElementById('btn-calibrate');
const slouchAlert = document.getElementById('slouch-alert');
const calOverlay  = document.getElementById('calibration-overlay');
const calCountEl  = document.getElementById('cal-countdown');
const calFill     = document.getElementById('cal-progress-fill');
const btnCancelCal = document.getElementById('btn-cancel-cal');
const alertLog    = document.getElementById('alert-log');
const logEmpty    = document.getElementById('log-empty');

// Stats
const statAlerts   = document.getElementById('stat-alerts');
const statDuration = document.getElementById('stat-duration');
const statGoodPct  = document.getElementById('stat-good-pct');
const statLastAlert = document.getElementById('stat-last-alert');

// Config
const cfgSound    = document.getElementById('cfg-sound');
const cfgNotify   = document.getElementById('cfg-notify');
const cfgSkeleton = document.getElementById('cfg-skeleton');
const cfgCooldown = document.getElementById('cfg-cooldown');
const cfgCooldownVal = document.getElementById('cfg-cooldown-val');

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
let alertTimeout = null;
let audioCtx = null;
let latestLandmarks = null;

cfgCooldown.addEventListener('input', () => {
  cfgCooldownVal.textContent = cfgCooldown.value + 's';
});

cfgNotify.addEventListener('change', () => {
  if (cfgNotify.checked) Notification.requestPermission();
});

// ── Posture detector callbacks ──
const detector = new PostureDetector(
  (details) => onSlouch(details),
  ()        => onGoodPosture()
);

// ── MediaPipe setup ──
function initPose() {
  pose = new Pose({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
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

function onResults(results) {
  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!results.poseLandmarks) {
    setStatus('idle', 'No pose detected', 'Move into frame');
    return;
  }

  latestLandmarks = results.poseLandmarks;
  totalFrames++;

  const result = detector.analyze(latestLandmarks);
  if (!result) return;

  if (cfgSkeleton.checked) drawSkeleton(results.poseLandmarks, result);

  // Update score bar
  const pct = result.score;
  scoreFill.style.width = pct + '%';
  scoreFill.style.background = pct > 70 ? 'var(--bad)' : pct > 35 ? 'var(--warn)' : 'var(--good)';

  if (!detector.calibration) {
    setStatus('warn', 'Calibration needed', 'Sit straight then click Calibrate');
  } else if (!result.slouching) {
    goodFrames++;
    setStatus('good', 'Great posture! 🎉', 'Keep it up');
  } else if (result.pending) {
    setStatus('warn', 'Posture slipping...', 'Straighten up!');
  } else {
    setStatus('bad', 'Slouching detected!', 'Sit up & pull shoulders back');
  }

  updateGoodPct();
}

// ── Drawing ──
const POSE_CONNECTIONS = [
  [11, 12], // shoulders
  [11, 13], [13, 15], // left arm
  [12, 14], [14, 16], // right arm
  [11, 23], [12, 24], // torso sides
  [23, 24], // hips
];

const KEY_POINTS = [0, 7, 8, 11, 12, 13, 14, 23, 24];

function drawSkeleton(landmarks, result) {
  const w = canvas.width;
  const h = canvas.height;
  const color = result.slouching ? '#ef4444' : result.pending ? '#f59e0b' : '#22c55e';

  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';

  for (const [a, b] of POSE_CONNECTIONS) {
    const lA = landmarks[a];
    const lB = landmarks[b];
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
    ctx.arc(lm.x * w, lm.y * h, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 1;
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

// ── Status helpers ──
function setStatus(type, title, sub) {
  statusBar.className = 'status-bar ' + (type === 'idle' ? '' : type);
  statusTitle.textContent = title;
  statusSub.textContent = sub;
}

function updateGoodPct() {
  if (totalFrames === 0) { statGoodPct.textContent = '—'; return; }
  statGoodPct.textContent = Math.round((goodFrames / totalFrames) * 100) + '%';
}

// ── Slouch alert ──
function onSlouch(details) {
  const now = Date.now();
  const cooldown = parseInt(cfgCooldown.value) * 1000;
  if (now - lastAlertTime < cooldown) return;
  lastAlertTime = now;

  alertCount++;
  statAlerts.textContent = alertCount;
  statLastAlert.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  addLogEntry('bad', buildAlertMessage(details));
  showToast();
  if (cfgSound.checked) playBeep();
  if (cfgNotify.checked && Notification.permission === 'granted') {
    new Notification('PostureGuard 🚨', {
      body: 'You\'re slouching! Sit up and pull your shoulders back.',
      icon: '../extension/icons/icon128.png',
    });
  }
}

function onGoodPosture() {
  // Only log recovery if there was a previous alert
  if (alertCount > 0) addLogEntry('good', 'Posture corrected ✓');
}

function buildAlertMessage(details) {
  if (details.isHeadForward && details.isEarDropped) return 'Head forward + shoulders rolled';
  if (details.isHeadForward) return 'Head too far forward';
  if (details.isEarDropped) return 'Shoulders rounded / hunching';
  return 'Slouch detected';
}

function showToast() {
  slouchAlert.classList.add('visible');
  clearTimeout(alertTimeout);
  alertTimeout = setTimeout(() => slouchAlert.classList.remove('visible'), 4000);
}

function playBeep() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.4);
  } catch {}
}

// ── Alert log ──
function addLogEntry(type, message) {
  logEmpty.style.display = 'none';
  const item = document.createElement('div');
  item.className = 'log-item';
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  item.innerHTML = `
    <span class="log-dot ${type}"></span>
    <span>${message}</span>
    <span class="log-time">${time}</span>
  `;
  alertLog.prepend(item);
  // Keep max 30 entries
  while (alertLog.children.length > 31) alertLog.removeChild(alertLog.lastChild);
}

// ── Session timer ──
function startSessionTimer() {
  sessionStart = Date.now();
  sessionTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    statDuration.textContent = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }, 1000);
}

// ── Start / Stop ──
async function startMonitoring() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    video.srcObject = stream;
    await new Promise(r => video.onloadedmetadata = r);

    if (!pose) initPose();

    camera = new Camera(video, {
      onFrame: async () => { if (isMonitoring) await pose.send({ image: video }); },
      width: 640,
      height: 480,
    });

    await camera.start();
    isMonitoring = true;
    overlay.classList.add('hidden');
    btnStart.disabled = true;
    btnStop.disabled = false;
    btnCal.disabled = false;

    setStatus('warn', 'Calibration needed', 'Sit straight then click Calibrate');
    startSessionTimer();
    addLogEntry('good', 'Session started — click Calibrate to set your baseline');
  } catch (err) {
    alert('Camera access denied. Please allow camera permission and reload.');
    console.error(err);
  }
}

function stopMonitoring() {
  isMonitoring = false;
  if (camera) { camera.stop(); camera = null; }
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }
  clearInterval(sessionTimer);
  detector.reset();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  overlay.classList.remove('hidden');
  btnStart.disabled = false;
  btnStop.disabled = true;
  btnCal.disabled = true;
  setStatus('idle', 'Not monitoring', 'Press start to begin');
  addLogEntry('good', 'Session ended');
  goodFrames = 0;
  totalFrames = 0;
}

// ── Calibration ──
function startCalibration() {
  calOverlay.classList.add('visible');
  let count = 3;
  calCountEl.textContent = count;
  calFill.style.width = '0%';

  const tick = setInterval(() => {
    count--;
    calCountEl.textContent = count;
    calFill.style.width = ((3 - count) / 3 * 100) + '%';

    if (count <= 0) {
      clearInterval(tick);
      if (latestLandmarks) {
        const ok = detector.calibrate(latestLandmarks);
        if (ok) addLogEntry('good', 'Calibrated to your posture ✓');
      }
      calOverlay.classList.remove('visible');
    }
  }, 1000);

  btnCancelCal.onclick = () => {
    clearInterval(tick);
    calOverlay.classList.remove('visible');
  };
}

// ── Theme toggle ──
const themeToggle = document.getElementById('theme-toggle');
const savedTheme = localStorage.getItem('theme') || 'dark';
applyTheme(savedTheme);

themeToggle.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  applyTheme(next);
  localStorage.setItem('theme', next);
});

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.textContent = theme === 'light' ? '🌙' : '☀️';
}

// ── Event listeners ──
btnStart.addEventListener('click', startMonitoring);
btnStop.addEventListener('click', stopMonitoring);
btnCal.addEventListener('click', startCalibration);
