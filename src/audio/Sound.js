// Procedurally synthesised, spatialised sound effects (no audio files needed).

function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.loops = new Set();
    this.muted = false;
    this.volume = 0.9;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      this.generate();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  buffer(duration, fn, channels = 1) {
    const sr = this.ctx.sampleRate;
    const n = Math.max(1, Math.floor(duration * sr));
    const buf = this.ctx.createBuffer(channels, n, sr);
    for (let c = 0; c < channels; c++) {
      const d = buf.getChannelData(c);
      const r = rand(1234 + c * 77);
      for (let i = 0; i < n; i++) d[i] = fn(i / sr, i, r, n / sr);
    }
    return buf;
  }

  generate() {
    const TAU = Math.PI * 2;
    const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
    const B = (name, dur, fn) => { this.buffers[name] = this.buffer(dur, fn); };

    B('click', 0.05, (t) => Math.sin(TAU * 1900 * t) * env(t, 0.001, 0.008) * 0.6);
    B('grab', 0.09, (t) => Math.sin(TAU * (240 - 600 * t) * t) * env(t, 0.002, 0.02) * 0.6);
    B('panelGrab', 0.18, (t, i, r) => (Math.sin(TAU * 140 * t) * 0.6 + (r() - 0.5) * 0.25) * env(t, 0.003, 0.04));
    B('rotate', 0.25, (t, i, r) => (r() - 0.5) * Math.sin(Math.PI * t / 0.25) * 0.35);
    B('pickAtom', 0.08, (t) => Math.sin(TAU * (600 + 3000 * t) * t) * env(t, 0.002, 0.025) * 0.45);
    B('spawn', 0.4, (t) => (Math.sin(TAU * (520 + 900 * t) * t) * 0.5 + Math.sin(TAU * 2 * (520 + 900 * t) * t) * 0.2) * env(t, 0.01, 0.1));
    B('bond', 0.35, (t, i, r) => (Math.sin(TAU * 880 * t) * 0.5 + Math.sin(TAU * 1320 * t) * 0.35 + Math.sin(TAU * 1760 * t) * 0.15) * env(t, 0.002, 0.07) + (t < 0.006 ? (r() - 0.5) * 0.8 : 0));
    B('unbond', 0.32, (t, i, r) => Math.sin(TAU * (760 - 900 * t) * t) * env(t, 0.002, 0.08) * 0.6 + (t < 0.012 ? (r() - 0.5) * 0.9 : 0));
    B('discover', 0.9, (t) => {
      let s = 0;
      [[523.25, 0], [659.25, 0.11], [783.99, 0.22], [1046.5, 0.33]].forEach(([f, st]) => {
        if (t >= st) s += (Math.sin(TAU * f * (t - st)) + 0.3 * Math.sin(TAU * f * 2.01 * (t - st))) * Math.exp(-(t - st) / 0.25) * 0.3;
      });
      return s;
    });
    B('denied', 0.16, (t) => (Math.sign(Math.sin(TAU * 150 * t)) * 0.25) * env(t, 0.005, 0.05));
    B('clear', 0.6, (t, i, r) => (r() - 0.5) * Math.sin(Math.PI * t / 0.6) * 0.4);
    B('glass', 1.1, (t, i, r) => {
      const noise = (r() - 0.5) * Math.exp(-t / 0.05) * 0.9;
      let ping = 0;
      const freqs = [2630, 3410, 4210, 5170, 6330, 2980, 3870];
      freqs.forEach((f, k) => {
        const st = k * 0.035 + (k % 3) * 0.02;
        if (t > st) ping += Math.sin(TAU * f * (t - st)) * Math.exp(-(t - st) / (0.12 + k * 0.03)) * 0.16;
      });
      return noise + ping;
    });
    B('crunch', 0.5, (t, i, r) => (r() - 0.5) * Math.exp(-t / 0.08) * 0.8 * (0.6 + 0.4 * Math.sin(TAU * 40 * t)));
    B('thud', 0.15, (t, i, r) => (Math.sin(TAU * 90 * t) * 0.8 + (r() - 0.5) * 0.4) * env(t, 0.002, 0.03));
    B('clink', 0.25, (t) => (Math.sin(TAU * 3150 * t) * 0.5 + Math.sin(TAU * 4720 * t) * 0.3) * env(t, 0.001, 0.05));
    B('pop', 0.3, (t, i, r) => ((r() - 0.5) * 1.2 + Math.sin(TAU * 70 * t)) * env(t, 0.001, 0.04));
    B('bang', 1.2, (t, i, r) => ((r() - 0.5) * 1.4 + Math.sin(TAU * 45 * t) * 0.8) * env(t, 0.002, 0.18));
    B('whoosh', 0.6, (t, i, r) => (r() - 0.5) * Math.sin(Math.PI * t / 0.6) * 0.6);
    B('machineStart', 1.2, (t) => (Math.sin(TAU * (180 + 500 * t * t) * t) * 0.35 + Math.sin(TAU * (90 + 250 * t * t) * t) * 0.2) * Math.min(1, t * 8) * Math.exp(-Math.max(0, t - 0.9) / 0.1));
    B('ding', 1.4, (t) => (Math.sin(TAU * 1318.5 * t) * 0.4 + Math.sin(TAU * 2637 * t) * 0.12 + Math.sin(TAU * 659.25 * t) * 0.2) * env(t, 0.003, 0.4));
    B('error', 0.5, (t) => Math.sin(TAU * (t < 0.2 ? 440 : 330) * t) * env(t % 0.25, 0.005, 0.08) * 0.5);
    B('reset', 1.4, (t, i, r) => (Math.sin(TAU * (900 - 600 * t) * t) * 0.25 + (r() - 0.5) * 0.2) * Math.sin(Math.PI * t / 1.4));
    B('drip', 0.12, (t) => Math.sin(TAU * (1400 - 6000 * t) * t) * env(t, 0.001, 0.02) * 0.4);
    B('suck', 0.5, (t, i, r) => ((r() - 0.5) * 0.4 + Math.sin(TAU * (300 + 900 * t) * t) * 0.3) * Math.sin(Math.PI * t / 0.5));
    // Match strike: a short scratch, then the flare of the head catching.
    B('strike', 0.7, (t, i, r) => (t < 0.12 ? (r() - 0.5) * (0.6 + 0.4 * Math.sin(TAU * 60 * t)) : 0) + (t > 0.08 ? (r() - 0.5) * 0.7 * env(t - 0.08, 0.02, 0.18) : 0));
    B('hiss', 0.6, (t, i, r) => (r() - 0.5) * 0.5 * env(t, 0.01, 0.18) * (0.6 + 0.4 * Math.sin(TAU * 900 * t)));
    B('lid', 0.3, (t, i, r) => (Math.sin(TAU * 70 * t) * 0.7 + (r() - 0.5) * 0.3) * env(t, 0.002, 0.05));
    B('tick', 0.03, (t) => Math.sin(TAU * 2600 * t) * env(t, 0.0005, 0.004) * 0.5);

    // Loops (1–2 s, seamless enough with fade-free noise)
    const L = (name, dur, fn) => { this.buffers[name] = this.buffer(dur, fn); };
    let lp = 0;
    L('pour', 2, (t, i, r) => { const x = r() - 0.5; lp += (x - lp) * 0.18; return lp * 1.2 * (0.8 + 0.2 * Math.sin(TAU * 6 * t)); });
    let hp = 0, prev = 0;
    L('fizz', 2, (t, i, r) => { const x = r() - 0.5; hp = 0.85 * (hp + x - prev); prev = x; return hp * 0.35 + (r() > 0.9985 ? (r() - 0.5) * 1.5 : 0); });
    L('hum', 2, (t, i, r) => Math.sin(TAU * 110 * t) * 0.18 + Math.sin(TAU * 220 * t) * 0.08 + Math.sin(TAU * 330 * t) * 0.04 + (r() - 0.5) * 0.03);
    let lp2 = 0;
    L('flame', 2, (t, i, r) => { const x = r() - 0.5; lp2 += (x - lp2) * 0.05; return lp2 * 2.2; });
    L('boil', 2, (t, i, r) => {
      const k = Math.floor(t * 23);
      const local = t * 23 - k;
      const rr = rand(k * 97)();
      return rr > 0.4 ? Math.sin(TAU * (150 + rr * 250) * local / 23) * Math.exp(-local * 6) * 0.4 : 0;
    });
    let hp2 = 0, prev2 = 0;
    L('sizzle', 2, (t, i, r) => { const x = r() - 0.5; hp2 = 0.6 * (hp2 + x - prev2); prev2 = x; return hp2 * 0.5 * (0.7 + 0.3 * Math.sin(TAU * 13 * t)); });
  }

  makeChain(position, volume) {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    let panner = null;
    if (position) {
      panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 0.6;
      panner.rolloffFactor = 1.2;
      panner.maxDistance = 30;
      this.setPannerPos(panner, position);
      gain.connect(panner);
      panner.connect(this.master);
    } else {
      gain.connect(this.master);
    }
    return { gain, panner };
  }

  setPannerPos(panner, p) {
    if (panner.positionX) {
      panner.positionX.value = p.x;
      panner.positionY.value = p.y;
      panner.positionZ.value = p.z;
    } else {
      panner.setPosition(p.x, p.y, p.z);
    }
  }

  play(name, { position = null, volume = 0.5, rate = 1 } = {}) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const buf = this.buffers[name];
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
    const { gain } = this.makeChain(position, volume);
    src.connect(gain);
    src.start();
  }

  loop(name, { position = null, volume = 0 } = {}) {
    const handle = {
      engine: this, name, volume, position, src: null, gain: null, panner: null,
      setVolume(v) {
        this.volume = v;
        if (this.gain) this.gain.gain.setTargetAtTime(v, this.engine.ctx.currentTime, 0.05);
      },
      setPosition(p) {
        this.position = p;
        if (this.panner) this.engine.setPannerPos(this.panner, p);
      },
      stop() {
        if (this.src) { try { this.src.stop(); } catch { /* already stopped */ } }
        this.src = null;
        this.engine.loops.delete(this);
      },
    };
    this.loops.add(handle);
    this.startLoop(handle);
    return handle;
  }

  startLoop(h) {
    if (!this.ctx || h.src) return;
    const buf = this.buffers[h.name];
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const { gain, panner } = this.makeChain(h.position, h.volume);
    src.connect(gain);
    src.start(0, Math.random() * buf.duration);
    h.src = src;
    h.gain = gain;
    h.panner = panner;
  }

  updateListener(camera) {
    if (!this.ctx) return;
    for (const h of this.loops) if (!h.src) this.startLoop(h);
    const l = this.ctx.listener;
    const e = camera.matrixWorld.elements;
    const px = e[12], py = e[13], pz = e[14];
    const fx = -e[8], fy = -e[9], fz = -e[10];
    const ux = e[4], uy = e[5], uz = e[6];
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setTargetAtTime(px, t, 0.02);
      l.positionY.setTargetAtTime(py, t, 0.02);
      l.positionZ.setTargetAtTime(pz, t, 0.02);
      l.forwardX.setTargetAtTime(fx, t, 0.02);
      l.forwardY.setTargetAtTime(fy, t, 0.02);
      l.forwardZ.setTargetAtTime(fz, t, 0.02);
      l.upX.setTargetAtTime(ux, t, 0.02);
      l.upY.setTargetAtTime(uy, t, 0.02);
      l.upZ.setTargetAtTime(uz, t, 0.02);
    } else {
      l.setPosition(px, py, pz);
      l.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }
}
