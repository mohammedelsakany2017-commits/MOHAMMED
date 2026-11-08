// Procedural documentary sound design (WebAudio). The same graph renders live and offline (WAV / MP4 export).
const noiseCache = new WeakMap();
function noiseBuffer(ctx, kind = 'white') {
  let m = noiseCache.get(ctx); if (!m) noiseCache.set(ctx, (m = {}));
  if (m[kind]) return m[kind];
  const len = ctx.sampleRate * 4, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
  let seed = 987654321, last = 0;
  for (let i = 0; i < len; i++) {
    seed = (seed * 16807) % 2147483647; const w = seed / 2147483647 * 2 - 1;
    if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return (m[kind] = b);
}

class Mixer {
  constructor(ctx, dest) { this.ctx = ctx; this.src = []; this.out = ctx.createGain(); this.out.connect(dest); }
  keep(n, w, stop) { n.start(w); if (stop != null) n.stop(stop); this.src.push(n); return n; }
  osc(type, f, w, d) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, w); return this.keep(o, w, w + d + 0.05); }
  noise(w, d, kind = 'white', off = 0) {
    const s = this.ctx.createBufferSource(); s.buffer = noiseBuffer(this.ctx, kind); s.loop = true;
    s.start(w, off % 3.5); s.stop(w + d + 0.05); this.src.push(s); return s;
  }
  filt(type, f, q = 0.7) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  gain(v = 1) { const g = this.ctx.createGain(); g.gain.value = v; return g; }
  pan(v = 0) { const p = this.ctx.createStereoPanner(); p.pan.value = v; return p; }
  bed(w, d, peak, fin = 1, fout = 1) {
    const g = this.ctx.createGain(), G = g.gain; fin = Math.min(fin, d / 2); fout = Math.min(fout, d / 2);
    G.setValueAtTime(0, w); G.linearRampToValueAtTime(peak, w + fin); G.setValueAtTime(peak, w + d - fout); G.linearRampToValueAtTime(0, w + d);
    return g;
  }
  perc(w, d, peak, a = 0.005) {
    const g = this.ctx.createGain(), G = g.gain;
    G.setValueAtTime(0.0001, w); G.exponentialRampToValueAtTime(peak, w + a); G.exponentialRampToValueAtTime(0.0001, w + Math.max(d, a + 0.01));
    return g;
  }
  lfo(f, depth, target, w, d) { const o = this.osc('sine', f, w, d), g = this.gain(depth); o.connect(g); g.connect(target); }
  chain(...n) { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; }
  stop() { try { this.out.disconnect(); } catch (e) { /* already disconnected */ } for (const s of this.src) { try { s.stop(); } catch (e) { /* not started */ } } this.src = []; }
}

const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);

const FX = {
  drone(m, w, d, ev) {
    const g = m.bed(w, d, ev.v ?? 0.16, ev.fin ?? 3, ev.fout ?? 1.5); g.connect(m.out);
    const lp = m.filt('lowpass', 300, 0.8); lp.connect(g);
    for (const [f, v] of [[36.7, 0.5], [55, 0.35], [73.4, 0.15], [110.2, 0.05]]) {
      const o = m.osc('sawtooth', f, w, d); const og = m.gain(v); m.chain(o, og, lp);
      const o2 = m.osc('sine', f * 1.003, w, d); const og2 = m.gain(v); m.chain(o2, og2, lp);
    }
    m.lfo(0.05, 120, lp.frequency, w, d);
    const n = m.noise(w, d, 'brown'); const nf = m.filt('bandpass', 140, 0.5); const ng = m.gain(0.3); m.chain(n, nf, ng, g);
  },
  hum(m, w, d, ev) {  // electronic mains-like hum of an ops room
    const g = m.bed(w, d, ev.v ?? 0.03, 2, 1); g.connect(m.out);
    for (const [f, v] of [[100, 0.6], [200, 0.25], [300, 0.1]]) { const o = m.osc('sine', f, w, d); const og = m.gain(v); m.chain(o, og, g); }
    m.lfo(0.3, 0.012, g.gain, w, d);
  },
  data(m, w, d, ev) {
    const o = m.osc('sine', ev.f ?? 1500, w, 0.1); const g = m.perc(w, 0.08, ev.v ?? 0.035, 0.002); const p = m.pan(ev.pan ?? 0);
    m.chain(o, g, p, m.out);
  },
  pad(m, w, d, ev) {  // dark string pad: detuned saws through a slowly opening low-pass
    const g = m.bed(w, d, ev.v ?? 0.05, ev.fin ?? 2, ev.fout ?? 2); g.connect(m.out);
    const lp = m.filt('lowpass', ev.f0 ?? 500, 0.6); lp.connect(g);
    if (ev.f1) { lp.frequency.setValueAtTime(ev.f0, w); lp.frequency.linearRampToValueAtTime(ev.f1, w + d); }
    for (const n of ev.notes) for (const det of [-6, 0, 7]) {
      const o = m.osc('sawtooth', NOTE(n), w, d); o.detune.value = det; const og = m.gain(0.12); const p = m.pan(det / 10);
      m.chain(o, og, p, lp);
    }
  },
  pulse(m, w, d, ev) {  // low timpani-like heartbeat for the music build
    const o = m.osc('sine', 62, w, 0.9); o.frequency.exponentialRampToValueAtTime(40, w + 0.6);
    const g = m.perc(w, 0.8, ev.v ?? 0.3, 0.004); m.chain(o, g, m.out);
  },
  whoosh(m, w, d, ev) {
    const n = m.noise(w, d, 'white', 1.3); const bp = m.filt('bandpass', 300, 0.9);
    bp.frequency.setValueAtTime(ev.f0 ?? 200, w); bp.frequency.exponentialRampToValueAtTime(ev.f1 ?? 2500, w + d * 0.7);
    const g = m.ctx.createGain(); g.gain.setValueAtTime(0.0001, w); g.gain.exponentialRampToValueAtTime(ev.v ?? 0.25, w + d * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, w + d);
    m.chain(n, bp, g, m.out);
  },
  jet(m, w, d, ev) {  // deep, distant turbofan roar
    const g = m.bed(w, d, ev.v ?? 0.5, ev.fin ?? 2.5, ev.fout ?? 0.05); g.connect(m.out);
    const n = m.noise(w, d, 'brown', 0.4); const lp = m.filt('lowpass', 260, 0.9); m.chain(n, lp, g);
    const n2 = m.noise(w, d, 'white', 2.1); const bp = m.filt('bandpass', 700, 0.6); const g2 = m.gain(0.07); m.chain(n2, bp, g2, g);
    for (const [f, v] of [[48, 0.12], [96.5, 0.05]]) { const o = m.osc('sawtooth', f, w, d); const f2 = m.filt('lowpass', 180); const og = m.gain(v); m.chain(o, f2, og, g); }
    m.lfo(0.11, 70, lp.frequency, w, d);
  },
  wind(m, w, d, ev) {
    const g = m.bed(w, d, ev.v ?? 0.18, ev.fin ?? 2, ev.fout ?? 0.05); g.connect(m.out);
    for (const [pan, off, f] of [[-0.6, 0.3, 500], [0.6, 1.9, 800]]) {
      const n = m.noise(w, d, 'white', off); const bp = m.filt('bandpass', f, 1.6); const p = m.pan(pan); const gg = m.gain(0.6);
      m.chain(n, bp, gg, p, g); m.lfo(0.13 + off * 0.05, f * 0.45, bp.frequency, w, d); m.lfo(0.2 + off * 0.04, 0.35, gg.gain, w, d);
    }
  },
  boom(m, w, d, ev) {  // the delayed blast arrival: sub drop + broadband crack + long rumble tail
    const v = ev.v ?? 1;
    const sh = m.ctx.createWaveShaper(); const c = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) { const x = i / 1024 - 1; c[i] = Math.tanh(x * 2.2); }
    sh.curve = c; sh.connect(m.out);
    const o = m.osc('sine', 70, w, 6); o.frequency.exponentialRampToValueAtTime(24, w + 3.5);
    const og = m.ctx.createGain(); og.gain.setValueAtTime(0.0001, w); og.gain.exponentialRampToValueAtTime(0.9 * v, w + 0.03); og.gain.exponentialRampToValueAtTime(0.0001, w + 6);
    m.chain(o, og, sh);
    const n = m.noise(w, 1.5, 'white', 0.9); const lp = m.filt('lowpass', 2500); lp.frequency.exponentialRampToValueAtTime(200, w + 1.2);
    const ng = m.perc(w, 1.3, 0.7 * v, 0.002); m.chain(n, lp, ng, m.out);
    const r = m.noise(w, d, 'brown', 2.4); const rl = m.filt('lowpass', 160); const rg = m.ctx.createGain();
    rg.gain.setValueAtTime(0.0001, w); rg.gain.exponentialRampToValueAtTime(0.9 * v, w + 0.3); rg.gain.exponentialRampToValueAtTime(0.0001, w + d);
    m.chain(r, rl, rg, m.out);
  },
  flash(m, w) {  // a very short high transient right at the flash, then silence
    const n = m.noise(w, 0.12, 'white', 0.1); const hp = m.filt('highpass', 3000); const g = m.perc(w, 0.09, 0.25, 0.001);
    m.chain(n, hp, g, m.out);
  },
  geiger(m, w, d, ev) {
    let t = 0, k = 0;
    while (t < d) {
      const h = Math.abs(Math.sin((ev.seed + k) * 91.37) * 1e4) % 1; k++;
      t += 0.04 + h * h * (ev.rate ?? 0.45);
      if (t >= d) break;
      const ww = w + t; const n = m.noise(ww, 0.01, 'white', k * 0.13); const hp = m.filt('highpass', 2500); const g = m.perc(ww, 0.006, ev.v ?? 0.05, 0.0005);
      m.chain(n, hp, g, m.out);
    }
  },
};

// Schedule all events audible from `from` (s) on a context; long beds resume mid-way, past one-shots are skipped.
export function schedule(ctx, dest, events, from, ctxStart, silences = []) {
  const m = new Mixer(ctx, dest);
  for (const ev of events) {
    const dur = ev.dur ?? 1;
    if (ev.t + dur <= from) continue;
    if (ev.t < from - 0.05 && !ev.bed) continue;
    const late = Math.max(0, from - ev.t), d = dur - late;
    if (d < 0.05) continue;
    FX[ev.type](m, ctxStart + Math.max(0, ev.t - from), d, ev);
  }
  // hard mutes (e.g. the 2 s of silence after the flash)
  for (const [a, b] of silences) {
    if (b <= from) continue;
    const A = ctxStart + Math.max(0, a - from), B = ctxStart + (b - from);
    m.out.gain.setValueAtTime(1, Math.max(ctxStart, A - 0.003)); m.out.gain.linearRampToValueAtTime(0, A + 0.002);
    m.out.gain.setValueAtTime(0, B - 0.002); m.out.gain.linearRampToValueAtTime(1, B);
  }
  return m;
}

export function masterChain(ctx) {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 6; comp.attack.value = 0.005; comp.release.value = 0.3;
  const g = ctx.createGain(); g.gain.value = 0.7; comp.connect(g); g.connect(ctx.destination);
  return { input: comp };
}

export async function renderOffline(events, duration, silences, sr = 48000) {
  const oc = new OfflineAudioContext(2, Math.ceil(duration * sr), sr);
  schedule(oc, masterChain(oc).input, events, 0, 0, silences);
  return oc.startRendering();
}

export function toWav(buf) {
  const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate, dv = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); dv.setUint32(4, 36 + len * ch * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
  dv.setUint16(22, ch, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true);
  ws(36, 'data'); dv.setUint32(40, len * ch * 2, true);
  const c = Array.from({ length: ch }, (_, i) => buf.getChannelData(i)); let o = 44;
  for (let i = 0; i < len; i++) for (let k = 0; k < ch; k++) { const s = Math.max(-1, Math.min(1, c[k][i])); dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Blob([dv.buffer], { type: 'audio/wav' });
}
