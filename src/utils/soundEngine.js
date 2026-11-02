class CourtSoundEngine {
  constructor() {
    this.ctx = null;
    this.ambientGain = null;
    this.ambientOsc = null;
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
    if (!this.ctx || this.ambientOsc) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(110, this.ctx.currentTime); // Subtle courtroom hall resonance (A2)
      gain.gain.setValueAtTime(0.012, this.ctx.currentTime);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      this.ambientOsc = osc;
      this.ambientGain = gain;
    } catch {
      // Ignore WebAudio restrictions if blocked
    }
  }

  _stopAmbientDrone() {
    if (this.ambientOsc) {
      try {
        this.ambientOsc.stop();
        this.ambientOsc.disconnect();
      } catch {
        // noop
      }
      this.ambientOsc = null;
      this.ambientGain = null;
    }
  }

  /**
   * Called on the user's first pointer/click interaction with the document.
   * Never runs on page load; never re-enables if user manually turned audio off.
   */
  handleFirstUserInteraction() {
    if (this.manuallyDisabled || this.hasAutoUnlockedOnce) {
      return;
    }
    this.hasAutoUnlockedOnce = true;
    this._initContext();
    this.isEnabled = true;
    this._startAmbientDrone();
    this.playPaperRustle();
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
      this.playPaperRustle();
    }
    this.notify();
  }

  /**
   * Subtle tactile feedback when switching courtroom benches or dossier cards.
   */
  playPaperRustle() {
    if (!this.isEnabled || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.06);
      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.07);
    } catch {
      // noop
    }
  }

  /**
   * Double wooden gavel strike played ONLY when a ruling reaches FINALIZED
   * and audio is currently enabled.
   */
  playGavelStrike() {
    if (!this.isEnabled || !this.ctx) return;
    const strikeAt = (offsetSec, peakGain) => {
      const now = this.ctx.currentTime + offsetSec;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(195, now);
      osc.frequency.exponentialRampToValueAtTime(58, now + 0.14);
      gain.gain.setValueAtTime(peakGain, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.17);
    };
    try {
      strikeAt(0, 0.18);
      strikeAt(0.22, 0.24);
    } catch {
      // noop
    }
  }
}

export const soundEngine = new CourtSoundEngine();
