/**
 * Web Audio API звук (GDD §11): без внешних библиотек.
 * Контекст создаётся лениво после первого пользовательского жеста.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private musicNodes: AudioNode[] = [];
  private musicTimer: number | null = null;
  private volume = 0.6;
  private enabled = true;
  onSubtitle: ((text: string) => void) | null = null;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? this.volume : 0;
    this.master.connect(this.ctx.destination);
    this.noiseBuffer = this.createNoise();
    this.createEngine();
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.ctx.currentTime, 0.05);
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(enabled ? this.volume : 0, this.ctx.currentTime, 0.05);
    }
  }

  private createNoise(): AudioBuffer | null {
    if (!this.ctx) return null;
    const length = Math.floor(this.ctx.sampleRate * 0.8);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private createEngine(): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.02;
    osc.connect(filter).connect(gain).connect(this.master);
    osc.start();
    this.engineOsc = osc;
    this.engineGain = gain;
    this.engineFilter = filter;
  }

  updateEngine(speedRatio: number, throttle: number, active: boolean): void {
    if (!this.ctx || !this.engineOsc || !this.engineGain || !this.engineFilter) return;
    const targetFreq = 48 + speedRatio * 150 + throttle * 30;
    const now = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(targetFreq, now, 0.08);
    this.engineFilter.frequency.setTargetAtTime(600 + speedRatio * 2200, now, 0.1);
    this.engineGain.gain.setTargetAtTime(active ? 0.022 + speedRatio * 0.025 : 0, now, 0.1);
  }

  private blip(frequency: number, duration: number, type: OscillatorType = 'square', gainValue = 0.08): void {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  shoot(kind: 'front' | 'rear' | 'rocket'): void {
    if (kind === 'front') this.blip(880, 0.05, 'square', 0.035);
    else if (kind === 'rear') this.blip(220, 0.12, 'sawtooth', 0.05);
    else this.blip(140, 0.25, 'sawtooth', 0.07);
  }

  explosion(): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1600, now);
    filter.frequency.exponentialRampToValueAtTime(120, now + 0.7);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now);
    source.stop(now + 0.85);
    this.blip(70, 0.5, 'sine', 0.2);
  }

  pickup(): void {
    this.blip(660, 0.09, 'triangle', 0.06);
    window.setTimeout(() => this.blip(990, 0.12, 'triangle', 0.05), 70);
  }

  countdown(final = false): void {
    this.blip(final ? 880 : 440, final ? 0.4 : 0.16, 'square', 0.08);
  }

  impact(): void {
    this.blip(90, 0.18, 'sawtooth', 0.12);
  }

  say(text: string): void {
    this.onSubtitle?.(text);
    if (typeof window.speechSynthesis === 'undefined') return;
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ru-RU';
      utterance.volume = Math.min(1, this.volume);
      utterance.rate = 1.05;
      window.speechSynthesis.speak(utterance);
    } catch {
      /* синтез речи необязателен */
    }
  }

  startMusic(): void {
    if (!this.ctx || !this.master || this.musicTimer !== null) return;
    const ctx = this.ctx;
    const drone = ctx.createOscillator();
    drone.type = 'sawtooth';
    drone.frequency.value = 42;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.012;
    drone.connect(droneGain).connect(this.master);
    drone.start();
    this.musicNodes.push(drone, droneGain);

    const playPulse = (): void => {
      if (!this.ctx || !this.master) return;
      this.blip(55, 0.22, 'square', 0.018);
    };
    this.musicTimer = window.setInterval(playPulse, 640);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    for (const node of this.musicNodes) {
      try {
        if (node instanceof OscillatorNode) node.stop();
      } catch {
        /* ignore */
      }
      node.disconnect();
    }
    this.musicNodes = [];
  }

  dispose(): void {
    this.stopMusic();
    try {
      this.engineOsc?.stop();
    } catch {
      /* ignore */
    }
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
  }
}
