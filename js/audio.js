export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = false;
    this.muted = false;
    this.lastBeat = 0;
  }

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
      this.enabled = true;
    } catch {
      this.enabled = false;
    }
  }

  resume() {
    this.init();
    if (this.ctx?.state === 'suspended') this.ctx.resume();
    this.unmute();
  }

  silence() {
    this.muted = true;
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(0, t);
  }

  unmute() {
    this.muted = false;
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(1, t);
  }

  playHeartbeat(intervalMs, intensity = 0.5) {
    if (!this.enabled || this.muted) return;
    const now = performance.now();
    if (now - this.lastBeat < intervalMs * 0.85) return;
    this.lastBeat = now;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(55 + intensity * 30, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.08);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.15 + intensity * 0.2, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  playSwoosh() {
    if (!this.enabled || this.muted) return;
    const t = this.ctx.currentTime;
    const duration = 0.2;
    const samples = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, samples, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < samples; i++) {
      const env = 1 - i / samples;
      data[i] = (Math.random() * 2 - 1) * env * env;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(1400, t);
    filter.frequency.exponentialRampToValueAtTime(180, t + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.42, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(t);
    source.stop(t + duration + 0.01);
  }

  playSwordHit() {
    if (!this.enabled || this.muted) return;
    const t = this.ctx.currentTime;

    const noiseSamples = Math.floor(this.ctx.sampleRate * 0.06);
    const buffer = this.ctx.createBuffer(1, noiseSamples, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < noiseSamples; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / noiseSamples);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 900;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.35, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.master);
    noise.start(t);
    noise.stop(t + 0.07);

    const clang = this.ctx.createOscillator();
    const clangGain = this.ctx.createGain();
    clang.type = 'triangle';
    clang.frequency.setValueAtTime(920, t);
    clang.frequency.exponentialRampToValueAtTime(220, t + 0.09);
    clangGain.gain.setValueAtTime(0.22, t);
    clangGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    clang.connect(clangGain);
    clangGain.connect(this.master);
    clang.start(t);
    clang.stop(t + 0.11);

    const ring = this.ctx.createOscillator();
    const ringGain = this.ctx.createGain();
    ring.type = 'square';
    ring.frequency.setValueAtTime(1800, t);
    ring.frequency.exponentialRampToValueAtTime(600, t + 0.05);
    ringGain.gain.setValueAtTime(0.06, t);
    ringGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    ring.connect(ringGain);
    ringGain.connect(this.master);
    ring.start(t);
    ring.stop(t + 0.06);
  }

  playSound(kind) {
    if (!this.enabled || this.muted) return;
    const t = this.ctx.currentTime;

    if (kind === 'hit') {
      this.playSwordHit();
      return;
    }

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const freqs = {
      squeak: 1200, rattle: 400, growl: 90, beoop: 220,
      klank: 180, grawl: 70, hiss: 800, kklank: 150,
      wraith: 300, snarl: 100, wizard: 60, clank: 200,
      miss: 60, boom: 50, incant: 440,
    };
    const f = freqs[kind] ?? 200;
    osc.type = kind === 'boom' ? 'sawtooth' : 'square';
    osc.frequency.setValueAtTime(f, t);
    if (kind === 'boom') {
      osc.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    }
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'boom' ? 0.5 : 0.15));
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.5);
  }
}