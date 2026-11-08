/* Procedural sound design (WebAudio). Every effect is synthesized so the
   project has no audio assets and the same graph renders live or offline. */
(function () {
  'use strict';

  function noiseBuffer(ctx) {
    if (ctx.__noise) return ctx.__noise;
    const len = ctx.sampleRate * 3;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < len; i++) { seed = (seed * 16807) % 2147483647; d[i] = seed / 2147483647 * 2 - 1; }
    ctx.__noise = b;
    return b;
  }

  class Mixer {
    constructor(ctx, dest) {
      this.ctx = ctx; this.sources = [];
      this.out = ctx.createGain(); this.out.connect(dest);
    }
    track(n, when, stop) { n.start(when); if (stop != null) n.stop(stop); this.sources.push(n); return n; }
    osc(type, f, when, dur) {
      const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, when);
      return this.track(o, when, when + dur + 0.05);
    }
    noise(when, dur, off = 0) {
      const s = this.ctx.createBufferSource(); s.buffer = noiseBuffer(this.ctx); s.loop = true;
      s.start(when, off % 2.9); s.stop(when + dur + 0.05); this.sources.push(s); return s;
    }
    filter(type, f, q = 1) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
    gain(v = 1) { const g = this.ctx.createGain(); g.gain.value = v; return g; }
    pan(v = 0) { const p = this.ctx.createStereoPanner(); p.pan.value = v; return p; }
    // percussive envelope: attack then exponential decay to silence at when+dur
    perc(when, dur, peak, a = 0.005) {
      const g = this.ctx.createGain(); const G = g.gain;
      G.setValueAtTime(0.0001, when); G.exponentialRampToValueAtTime(peak, when + a);
      G.exponentialRampToValueAtTime(0.0001, when + Math.max(dur, a + 0.01));
      return g;
    }
    // sustained envelope with fade in / fade out
    bed(when, dur, peak, fin = 1, fout = 1) {
      const g = this.ctx.createGain(); const G = g.gain;
      fin = Math.min(fin, dur / 2); fout = Math.min(fout, dur / 2);
      G.setValueAtTime(0, when); G.linearRampToValueAtTime(peak, when + fin);
      G.setValueAtTime(peak, when + dur - fout); G.linearRampToValueAtTime(0, when + dur);
      return g;
    }
    lfo(f, depth, target, when, dur, type = 'sine') {
      const o = this.osc(type, f, when, dur); const g = this.gain(depth); o.connect(g); g.connect(target); return o;
    }
    echo(time, fb, lp = 2500) {
      const d = this.ctx.createDelay(2); d.delayTime.value = time;
      const f = this.gain(fb), l = this.filter('lowpass', lp);
      d.connect(l); l.connect(f); f.connect(d);
      const inp = this.gain(1); inp.connect(d); inp.connect(this.out); d.connect(this.out);
      return inp;
    }
    stop() {
      try { this.out.disconnect(); } catch (e) { /* already disconnected */ }
      for (const s of this.sources) { try { s.stop(); } catch (e) { /* not started / already stopped */ } }
      this.sources = [];
    }
  }

  const ramp = (p, v0, v1, t0, t1) => { p.setValueAtTime(v0, t0); p.exponentialRampToValueAtTime(v1, t1); };

  const FX = {
    ambient(m, w, d) {
      const g = m.bed(w, d, 0.16, 3, 0.3); g.connect(m.out);
      const lp = m.filter('lowpass', 420, 0.7); lp.connect(g);
      [[55, 'sine', 0.5], [82.4, 'sine', 0.3], [110.3, 'triangle', 0.12], [41.2, 'sine', 0.4]].forEach(([f, ty, v]) => {
        const o = m.osc(ty, f, w, d); const og = m.gain(v); o.connect(og); og.connect(lp);
      });
      const n = m.noise(w, d); const nf = m.filter('bandpass', 180, 0.6); const ng = m.gain(0.25);
      n.connect(nf); nf.connect(ng); ng.connect(g);
      m.lfo(0.07, 160, lp.frequency, w, d);
    },
    whoosh(m, w, d, ev) {
      const n = m.noise(w, d, 0.3); const bp = m.filter('bandpass', 300, ev.q || 1.1);
      const f0 = ev.f0 || 250, f1 = ev.f1 || 5200;
      ramp(bp.frequency, f0, f1, w, w + d * 0.62); bp.frequency.exponentialRampToValueAtTime(f0 * 1.2, w + d);
      const g = m.ctx.createGain(); const G = g.gain; const pk = ev.v || 0.55;
      G.setValueAtTime(0.0001, w); G.exponentialRampToValueAtTime(pk, w + d * 0.6); G.exponentialRampToValueAtTime(0.0001, w + d);
      const p = m.pan(0); p.pan.setValueAtTime(ev.pan0 || -0.6, w); p.pan.linearRampToValueAtTime(ev.pan1 || 0.6, w + d);
      n.connect(bp); bp.connect(g); g.connect(p); p.connect(m.out);
      const s = m.osc('sine', 90, w, d); ramp(s.frequency, 140, 38, w, w + d);
      const sg = m.perc(w + d * 0.5, d * 0.5, (ev.v || 0.55) * 0.6, d * 0.1); s.connect(sg); sg.connect(m.out);
    },
    radar(m, w, d, ev) {
      const v = ev.v || 1; const e = m.echo(0.31, 0.42, 3000);
      const o = m.osc('sine', 1180, w, 1.8); const g = m.perc(w, 1.7, 0.32 * v); o.connect(g); g.connect(e);
      const o2 = m.osc('sine', 2360, w, 0.6); const g2 = m.perc(w, 0.5, 0.06 * v); o2.connect(g2); g2.connect(e);
      const th = m.osc('sine', 95, w, 0.6); ramp(th.frequency, 120, 42, w, w + 0.5);
      const tg = m.perc(w, 0.55, 0.75 * v, 0.004); th.connect(tg); tg.connect(m.out);
    },
    click(m, w, d, ev) {
      const n = m.noise(w, 0.05, ev.t * 7.3); const hp = m.filter('highpass', 2600); const g = m.perc(w, 0.035, 0.22);
      n.connect(hp); hp.connect(g); g.connect(m.out);
      const o = m.osc('square', 1700 + (ev.t * 997 % 400), w, 0.02); const og = m.perc(w, 0.018, 0.03); o.connect(og); og.connect(m.out);
    },
    blip(m, w, d, ev) {
      const o = m.osc('sine', ev.f || 880, w, 0.2); const g = m.perc(w, 0.16, ev.v || 0.1);
      const p = m.pan(ev.pan || 0); o.connect(g); g.connect(p); p.connect(m.out);
    },
    mech(m, w, d) {
      const g = m.bed(w, d, 0.32, 1.2, 1.2); g.connect(m.out);
      const s = m.osc('sawtooth', 46, w, d); const lp = m.filter('lowpass', 240, 2); const am = m.gain(0.6);
      s.connect(lp); lp.connect(am); am.connect(g); m.lfo(9, 0.4, am.gain, w, d, 'square');
      const n = m.noise(w, d, 1.1); const bp = m.filter('bandpass', 950, 4); const nm = m.gain(0.5);
      n.connect(bp); bp.connect(nm); nm.connect(g); m.lfo(13.5, 0.5, nm.gain, w, d, 'square');
      const r = m.noise(w, d, 2.2); const rl = m.filter('lowpass', 110); const rg = m.gain(0.9);
      r.connect(rl); rl.connect(rg); rg.connect(g);
    },
    droneMotor(m, w, d, ev) {
      const g = m.bed(w, d, ev.v || 0.075, 1.5, 1.5); const p = m.pan(0);
      p.pan.setValueAtTime(-0.7, w); p.pan.linearRampToValueAtTime(0.7, w + d);
      g.connect(p); p.connect(m.out);
      const lp = m.filter('lowpass', 1500, 1); lp.connect(g);
      [158, 161.5].forEach(f => {
        const o = m.osc('sawtooth', f, w, d); o.frequency.linearRampToValueAtTime(f * 1.12, w + d);
        m.lfo(5.5, 3, o.frequency, w, d); o.connect(lp);
      });
    },
    sonar(m, w) {
      const e = m.echo(0.46, 0.5, 1800);
      const o = m.osc('sine', 1350, w, 2.6); const g = m.perc(w, 2.4, 0.3, 0.008); o.connect(g); g.connect(e);
      const o2 = m.osc('sine', 675, w, 1.2); const g2 = m.perc(w, 1.0, 0.08); o2.connect(g2); g2.connect(e);
    },
    waves(m, w, d) {
      const g = m.bed(w, d, 0.3, 1.5, 0.8); g.connect(m.out);
      const n = m.noise(w, d, 0.7); const lp = m.filter('lowpass', 520, 0.8); const sw = m.gain(0.5);
      n.connect(lp); lp.connect(sw); sw.connect(g); m.lfo(0.19, 0.45, sw.gain, w, d);
      const crush = m.ctx.createWaveShaper(); const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) curve[i] = Math.round((i / 512 - 1) * 6) / 6;
      crush.curve = curve; const hp = m.filter('bandpass', 2400, 1.5); const cg = m.gain(0.05);
      n.connect(hp); hp.connect(crush); crush.connect(cg); cg.connect(g); m.lfo(0.31, 0.04, cg.gain, w, d);
    },
    riser(m, w, d) {
      const n = m.noise(w, d, 1.7); const bp = m.filter('bandpass', 300, 2); ramp(bp.frequency, 300, 3500, w, w + d);
      const g = m.ctx.createGain(); g.gain.setValueAtTime(0.0001, w); g.gain.exponentialRampToValueAtTime(0.35, w + d * 0.95);
      g.gain.exponentialRampToValueAtTime(0.0001, w + d + 0.3);
      n.connect(bp); bp.connect(g); g.connect(m.out);
      const s = m.osc('sawtooth', 90, w, d); ramp(s.frequency, 90, 360, w, w + d); const sl = m.filter('lowpass', 900);
      const sg = m.bed(w, d + 0.2, 0.05, d * 0.8, 0.2); s.connect(sl); sl.connect(sg); sg.connect(m.out);
    },
    warn(m, w, d) {
      const g = m.bed(w, d, 0.05, 1.5, 0.6); g.connect(m.out);
      const o = m.osc('square', 220, w, d); const lp = m.filter('lowpass', 800); const tr = m.gain(0.5);
      o.connect(lp); lp.connect(tr); tr.connect(g); m.lfo(3.2, 0.5, tr.gain, w, d);
    },
    rumble(m, w, d) {
      const g = m.bed(w, d, 0.4, 1.5, 1); g.connect(m.out);
      const n = m.noise(w, d, 0.9); const lp = m.filter('lowpass', 140, 0.7); n.connect(lp); lp.connect(g);
      const o = m.osc('sine', 38, w, d); const og = m.gain(0.25); o.connect(og); og.connect(g);
    },
    laser(m, w, d, ev) {
      const o = m.osc('sawtooth', 2200, w, 0.35); ramp(o.frequency, 2200, 260, w, w + 0.3);
      const lp = m.filter('lowpass', 3000); const g = m.perc(w, 0.32, ev.v || 0.07); const p = m.pan(ev.pan || 0);
      o.connect(lp); lp.connect(g); g.connect(p); p.connect(m.out);
    },
    jet(m, w, d, ev) {
      const v = ev.v || 1; const p = m.pan(0); p.pan.setValueAtTime(ev.pan0 ?? 0.9, w); p.pan.linearRampToValueAtTime(ev.pan1 ?? -0.9, w + d);
      p.connect(m.out);
      const env = m.ctx.createGain(); const G = env.gain;
      G.setValueAtTime(0.0001, w); G.exponentialRampToValueAtTime(0.8 * v, w + d * 0.42); G.exponentialRampToValueAtTime(0.0001, w + d);
      env.connect(p);
      const n = m.noise(w, d, 2.4); const bp = m.filter('bandpass', 500, 0.7);
      bp.frequency.setValueAtTime(450, w); bp.frequency.exponentialRampToValueAtTime(2800, w + d * 0.42); bp.frequency.exponentialRampToValueAtTime(380, w + d);
      n.connect(bp); bp.connect(env);
      const r = m.noise(w, d, 0.4); const rl = m.filter('lowpass', 260); const rg = m.gain(1.2); r.connect(rl); rl.connect(rg); rg.connect(env);
      const s = m.osc('sawtooth', 170, w, d); s.frequency.setValueAtTime(190, w); s.frequency.linearRampToValueAtTime(175, w + d * 0.4);
      s.frequency.exponentialRampToValueAtTime(95, w + d * 0.55); s.frequency.linearRampToValueAtTime(85, w + d);
      const sl = m.filter('lowpass', 900); const sg = m.gain(0.15); s.connect(sl); sl.connect(sg); sg.connect(env);
    },
    boom(m, w, d, ev) {
      const v = ev.v || 0.6;
      const o = m.osc('sine', 70, w, 1.2); ramp(o.frequency, 85, 30, w, w + 1.0); const g = m.perc(w, 1.1, v, 0.004);
      o.connect(g); g.connect(m.out);
      const n = m.noise(w, 0.8, ev.t); const lp = m.filter('lowpass', 500); const ng = m.perc(w, 0.6, v * 0.5, 0.002);
      n.connect(lp); lp.connect(ng); ng.connect(m.out);
    },
    glitch(m, w, d, ev) {
      const steps = Math.floor(d / 0.045);
      for (let i = 0; i < steps; i++) {
        const h = Math.abs(Math.sin((ev.t + i) * 91.7) * 1e4) % 1;
        if (h < 0.45) continue;
        const ww = w + i * 0.045; const o = m.osc('square', 200 + h * 2400, ww, 0.04);
        const g = m.perc(ww, 0.035, 0.04 + h * 0.03, 0.001); o.connect(g); g.connect(m.out);
      }
      const n = m.noise(w, d, 0.2); const hp = m.filter('highpass', 3500); const ng = m.bed(w, d, 0.05, 0.02, 0.05);
      n.connect(hp); hp.connect(ng); ng.connect(m.out);
    },
    alarm(m, w, d) {
      const n = Math.floor(d / 0.5);
      for (let i = 0; i < n; i++) {
        const ww = w + i * 0.5; const o = m.osc('square', i % 2 ? 660 : 880, ww, 0.24);
        const lp = m.filter('lowpass', 1800); const g = m.bed(ww, 0.24, 0.035, 0.01, 0.04);
        o.connect(lp); lp.connect(g); g.connect(m.out);
      }
    },
    bass(m, w, d) {
      const sh = m.ctx.createWaveShaper(); const c = new Float32Array(2048);
      for (let i = 0; i < 2048; i++) { const x = i / 1024 - 1; c[i] = Math.tanh(x * 2.5); }
      sh.curve = c; sh.connect(m.out);
      const o = m.osc('sine', 120, w, d); ramp(o.frequency, 120, 26, w, w + 1.6);
      const g = m.ctx.createGain(); g.gain.setValueAtTime(0.0001, w); g.gain.exponentialRampToValueAtTime(0.95, w + 0.02);
      g.gain.setValueAtTime(0.95, w + 0.4); g.gain.exponentialRampToValueAtTime(0.35, w + d);
      o.connect(g); g.connect(sh);
      const n = m.noise(w, 1.2, 1.3); const lp = m.filter('lowpass', 700); const ng = m.perc(w, 1.0, 0.6, 0.002);
      n.connect(lp); lp.connect(ng); ng.connect(m.out);
    },
  };

  // Schedule every event of the timeline that is still audible from `from` seconds.
  // Long beds started earlier resume with their remaining duration; one-shots in the past are skipped.
  function schedule(ctx, dest, events, from, ctxStart, cutAt) {
    const m = new Mixer(ctx, dest);
    for (const ev of events) {
      const dur = ev.dur || 1;
      if (ev.t + dur <= from) continue;
      if (ev.t < from - 0.05 && !ev.bed) continue;
      const late = Math.max(0, from - ev.t);
      const when = ctxStart + Math.max(0, ev.t - from);
      const d = dur - late;
      if (d < 0.05) continue;
      FX[ev.type](m, when, d, ev);
    }
    if (cutAt != null && cutAt > from) {
      // hard cut to silence together with the black frame
      m.out.gain.setValueAtTime(1, ctxStart + (cutAt - from) - 0.004);
      m.out.gain.linearRampToValueAtTime(0, ctxStart + (cutAt - from));
    }
    return m;
  }

  function masterChain(ctx) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 8; comp.attack.value = 0.004; comp.release.value = 0.25;
    const g = ctx.createGain(); g.gain.value = 0.5;
    comp.connect(g); g.connect(ctx.destination);
    return { input: comp, gain: g };
  }

  async function renderOffline(events, duration, cutAt, sampleRate = 48000) {
    const oc = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
    const mc = masterChain(oc);
    schedule(oc, mc.input, events, 0, 0, cutAt);
    return oc.startRendering();
  }

  function toWav(buf) {
    const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
    const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); data.setUint32(4, 36 + len * ch * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
    data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
    data.setUint32(24, sr, true); data.setUint32(28, sr * ch * 2, true); data.setUint16(32, ch * 2, true);
    data.setUint16(34, 16, true); ws(36, 'data'); data.setUint32(40, len * ch * 2, true);
    const chans = []; for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i])); data.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
    }
    return new Blob([data.buffer], { type: 'audio/wav' });
  }

  window.SFX = { schedule, masterChain, renderOffline, toWav };
})();
