/**
 * Core posture detection logic using MediaPipe Pose landmarks.
 * Works in both the standalone web app and the Chrome extension.
 *
 * Slouch criteria:
 *  1. Head forward: nose is significantly ahead of the midpoint of shoulders (z-axis)
 *  2. Shoulder droop: ear-to-shoulder vertical ratio is too large
 */

const SLOUCH_THRESHOLDS = {
  // How much further forward the nose can drift from the calibrated baseline before flagging.
  // Only meaningful relative to a calibration snapshot — never used raw.
  headForward: 0.06,
  // How much the ear-to-shoulder distance must DROP below the calibrated baseline to flag.
  // Without calibration this check is skipped; the raw Z values are not reliable.
  earShoulderDrop: 0.07,
  // Frames in a row needed to confirm slouch (debounce ~1s at 30fps)
  confirmFrames: 30,
};

export class PostureDetector {
  constructor(onSlouch, onGoodPosture) {
    this.onSlouch = onSlouch;
    this.onGoodPosture = onGoodPosture;
    this.slouchFrames = 0;
    this.isSlouching = false;
    this.calibration = null;
  }

  /**
   * Call this with a "good posture" frame to set baseline.
   */
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

  /**
   * Analyze a frame's landmarks. Returns { slouching, score, details }.
   */
  analyze(landmarks) {
    const data = this._extract(landmarks);
    if (!data) return null;

    const { noseZ, leftShoulderZ, rightShoulderZ, leftEarY, rightEarY, leftShoulderY, rightShoulderY } = data;

    const shoulderMidZ = (leftShoulderZ + rightShoulderZ) / 2;
    const headForwardOffset = shoulderMidZ - noseZ;

    const leftEarShoulderDist  = Math.abs(leftEarY  - leftShoulderY);
    const rightEarShoulderDist = Math.abs(rightEarY - rightShoulderY);
    const avgEarShoulderDist   = (leftEarShoulderDist + rightEarShoulderDist) / 2;

    // Without calibration both checks are skipped — raw Z values are unreliable
    // because the nose is always in front of the shoulders in normalized depth.
    // Calibration captures the user's natural baseline so we flag *relative* changes.
    let isHeadForward = false;
    let isEarDropped  = false;

    if (this.calibration) {
      // Head drifted forward relative to calibrated position
      isHeadForward = headForwardOffset > this.calibration.headForwardOffset + SLOUCH_THRESHOLDS.headForward;
      // Ears dropped closer to shoulders relative to calibrated position
      isEarDropped  = avgEarShoulderDist < this.calibration.avgEarShoulderDist - SLOUCH_THRESHOLDS.earShoulderDrop;
    }

    const slouching = isHeadForward || isEarDropped;

    if (slouching) {
      this.slouchFrames++;
      if (this.slouchFrames >= SLOUCH_THRESHOLDS.confirmFrames && !this.isSlouching) {
        this.isSlouching = true;
        this.onSlouch?.({ isHeadForward, isEarDropped, headForwardOffset, avgEarShoulderDist });
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
      details: { isHeadForward, isEarDropped, headForwardOffset, avgEarShoulderDist },
    };
  }

  reset() {
    this.slouchFrames = 0;
    this.isSlouching = false;
  }

  _extract(landmarks) {
    if (!landmarks || landmarks.length < 13) return null;
    // MediaPipe Pose landmark indices
    const NOSE = 0, L_EAR = 7, R_EAR = 8, L_SHOULDER = 11, R_SHOULDER = 12;
    const get = (i) => landmarks[i];
    try {
      return {
        noseZ: get(NOSE).z,
        leftShoulderZ: get(L_SHOULDER).z,
        rightShoulderZ: get(R_SHOULDER).z,
        leftEarY: get(L_EAR).y,
        rightEarY: get(R_EAR).y,
        leftShoulderY: get(L_SHOULDER).y,
        rightShoulderY: get(R_SHOULDER).y,
        headForwardOffset: 0,
        avgEarShoulderDist: 0,
      };
    } catch {
      return null;
    }
  }
}
