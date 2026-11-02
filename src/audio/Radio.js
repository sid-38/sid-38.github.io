// The speaker on the cabinet: one lo-fi track on loop, started by clicking the speaker.
//
// The file only downloads on the first click (it isn't part of the loading screen). It plays
// through an <audio> element, so it streams instead of being decoded into memory all at once,
// and through Web Audio so the scene can read how loud the beat is (`level`) and pulse to it.
export class Radio {
  /**
   * @param src the track
   * @param beat { bpm, offset }: its tempo and where the first beat falls (seconds), so the
   *   avatar can tap along (measured from the file's kick drum)
   */
  constructor(src, beat = null) {
    this.src = src;
    this.beatInfo = beat;
    this.audio = null;
    this.ctx = null;
    this.gain = null;
    this.analyser = null;
    this.bins = null;
    this.playing = false;
    this.listeners = new Set();
    this._level = 0;
  }

  /** Called with `true`/`false` whenever playback starts or stops */
  onChange(cb) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  _emit() { for (const cb of this.listeners) cb(this.playing); }

  _setup() {
    const audio = new Audio(this.src);
    audio.loop = true;
    audio.preload = 'auto';
    audio.addEventListener('pause', () => { if (this.playing) { this.playing = false; this._emit(); } });
    this.audio = audio;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      const source = this.ctx.createMediaElementSource(audio);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.6;
      this.bins = new Uint8Array(this.analyser.frequencyBinCount);
      this.gain = this.ctx.createGain();
      source.connect(this.analyser).connect(this.gain).connect(this.ctx.destination);
    } catch {
      // No Web Audio: the track still plays, the speaker just doesn't pulse to it
      this.ctx = null;
    }
  }

  async play() {
    if (!this.audio) this._setup();
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
    this._fade(1, 0.6);
    this.playing = true;
    this._emit();
    try {
      await this.audio.play();
    } catch (err) {
      console.warn('Music could not start:', err);
      this.playing = false;
      this._emit();
    }
  }

  pause() {
    if (!this.audio || !this.playing) return;
    this.playing = false;
    this._emit();
    // Fade out rather than cut, then actually pause so nothing keeps downloading or decoding
    this._fade(0, 0.35);
    const a = this.audio;
    setTimeout(() => { if (!this.playing) a.pause(); }, this.gain ? 380 : 0);
  }

  toggle() { return this.playing ? this.pause() : this.play(); }

  _fade(to, seconds) {
    if (!this.gain) return;
    const g = this.gain.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(to, now + seconds);
  }

  /**
   * Where the music is within its current beat, 0 (on the beat) … 1, or null when it isn't
   * playing. Read off the track's own clock, stepped at 12 fps like the animation.
   */
  get beatPhase() {
    if (!this.playing || !this.beatInfo || !this.audio || this.audio.paused) return null;
    const time = Math.floor(this.audio.currentTime * 12) / 12;
    const beats = ((time - this.beatInfo.offset) * this.beatInfo.bpm) / 60;
    return ((beats % 1) + 1) % 1;
  }

  /** How hard the beat is hitting right now, 0..1. Updated by `update(dt)` once a frame. */
  get level() { return this._level; }

  update(dt) {
    let v = 0;
    if (this.analyser && this.playing) {
      this.analyser.getByteFrequencyData(this.bins);
      // The two lowest bins (~0–340 Hz) are where the kick drum lands: they jump to the top on
      // each hit and sink to about half in between, so map the top of that swing onto 0..1.
      const raw = (this.bins[0] + this.bins[1]) / 2 / 255;
      v = Math.min(1, Math.max(0, (raw - 0.7) / 0.3));
    }
    // Snap up on a hit, ease back down between them (rates in seconds, so frame rate doesn't matter)
    const tau = v > this._level ? 0.03 : 0.2;
    this._level += (v - this._level) * (1 - Math.exp(-dt / tau));
  }
}
