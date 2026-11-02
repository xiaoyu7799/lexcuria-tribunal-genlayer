class CourtSoundEngine {
  constructor() {
    this.ctx = null;
    this.ambientMaster = null;
    this.ambientOscA = null;
    this.ambientOscB = null;
    this.isEnabled = false;
    this.hasAutoUnlockedOnce = false;
    this.manuallyDisabled = false;
    this.listeners = new Set();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    for (const fn of this.listeners) {
      fn({
        isEnabled: this.isEnabled,
        manuallyDisabled: this.manuallyDisabled,
        hasAutoUnlockedOnce: this.hasAutoUnlockedOnce,
      });
    }
  }

  _initContext() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  _startAmbientDrone() {
    if (!this.ctx || this.ambientOscA) return;
    try {
      const now = this.ctx.currentTime;
      const master = this.ctx.createGain();
      master.gain.setValueAtTime(0.001, now);
      master.gain.exponentialRampToValueAtTime(0.045, now + 0.6);

      // Warm low-pass filter so the courtroom pad is clearly audible on laptop/mobile speakers
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(520, now);

      const oscA = this.ctx.createOscillator();
      const oscB = this.ctx.createOscillator();
      oscA.type = "triangle";
      oscB.type = "sine";
      oscA.frequency.setValueAtTime(196.0, now); // G3 warm fundamental
      oscB.frequency.setValueAtTime(293.66, now); // D4 fifth harmonic

      oscA.connect(filter);
      oscB.connect(filter);
      filter.connect(master);
      master.connect(this.ctx.destination);

      oscA.start(now);
      oscB.start(now);

      this.ambientMaster = master;
      this.ambientOscA = oscA;
      this.ambientOscB = oscB;
    } catch {
      // Ignore if browser blocks audio
    }
  }

  _stopAmbientDrone() {
    if (this.ambientOscA) {
      try {
        this.ambientOscA.stop();
        this.ambientOscB.stop();
        this.ambientMaster.disconnect();
      } catch {
        // noop
      }
      this.ambientOscA = null;
      this.ambientOscB = null;
      this.ambientMaster = null;
    }
  }

  /**
   * Audible brass bell chime when courtroom audio is first unlocked or toggled ON.
   */
  playUnlockChime() {
    if (!this.isEnabled || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.18); // A5
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.46);
    } catch {
      // noop
    }
  }

  /**
   * Called on the user's first click anywhere on the page (excluding the manual audio toggle button).
   */
  handleFirstUserInteraction() {
    if (this.manuallyDisabled || this.hasAutoUnlockedOnce) {
      return;
    }
    this.hasAutoUnlockedOnce = true;
    this._initContext();
    this.isEnabled = true;
    this._startAmbientDrone();
    this.playUnlockChime();
    this.notify();
  }

  /**
   * Explicit manual toggle button handler.
   */
  toggleManual() {
    this.hasAutoUnlockedOnce = true;
    if (this.isEnabled) {
      this.isEnabled = false;
      this.manuallyDisabled = true;
      this._stopAmbientDrone();
    } else {
      this._initContext();
      this.isEnabled = true;
      this.manuallyDisabled = false;
      this._startAmbientDrone();
      this.playUnlockChime();
    }
    this.notify();
  }

  /**
   * Audible crisp page flip / dossier switch sound.
   */
  playPaperRustle() {
    if (!this.isEnabled || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.09);
    } catch {
      // noop
    }
  }

  /**
   * Realistic Double Wooden Gavel Strike (Wood crack transient + resonant hardwood body).
   * Clearly audible on all speakers when a ruling reaches FINALIZED or when testing gavel.
   */
  playGavelStrike() {
    this._initContext();
    if (!this.isEnabled) {
      // If user hasn't manually muted, auto-enable when explicitly testing gavel
      if (!this.manuallyDisabled) {
        this.hasAutoUnlockedOnce = true;
        this.isEnabled = true;
        this._startAmbientDrone();
        this.notify();
      } else {
        return;
      }
    }
    if (!this.ctx) return;

    const triggerWoodKnock = (offsetSec, peakGain) => {
      const now = this.ctx.currentTime + offsetSec;

      // 1. Resonant Hardwood Body (Low-Mid Punch)
      const bodyOsc = this.ctx.createOscillator();
      const bodyGain = this.ctx.createGain();
      bodyOsc.type = "triangle";
      bodyOsc.frequency.setValueAtTime(280, now);
      bodyOsc.frequency.exponentialRampToValueAtTime(72, now + 0.16);
      bodyGain.gain.setValueAtTime(peakGain, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
      bodyOsc.connect(bodyGain);
      bodyGain.connect(this.ctx.destination);
      bodyOsc.start(now);
      bodyOsc.stop(now + 0.2);

      // 2. Crisp Wooden Impact Click (High-Mid Transient)
      const clickOsc = this.ctx.createOscillator();
      const clickGain = this.ctx.createGain();
      clickOsc.type = "square";
      clickOsc.frequency.setValueAtTime(920, now);
      clickOsc.frequency.exponentialRampToValueAtTime(210, now + 0.045);
      clickGain.gain.setValueAtTime(peakGain * 0.45, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      clickOsc.connect(clickGain);
      clickGain.connect(this.ctx.destination);
      clickOsc.start(now);
      clickOsc.stop(now + 0.055);
    };

    try {
      triggerWoodKnock(0, 0.42);
      triggerWoodKnock(0.24, 0.52);
    } catch {
      // noop
    }
  }
}

export const soundEngine = new CourtSoundEngine();