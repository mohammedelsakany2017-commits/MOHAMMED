// Frame-by-frame export in headless Chrome + ffmpeg.
//   node b2-simulation/tools/export.mjs                  -> b2-simulation/out/b2-simulation.mp4 (1920x1080, 30 fps, with sound)
//   node b2-simulation/tools/export.mjs --stills 5,20,40 -> PNG stills in b2-simulation/out/stills
//   --fps 24|30|60   --from 30 --to 45 (partial render)   --vol 0.5 (volumetric resolution scale)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const fps = +(opt('--fps') || 30);
const stills = opt('--stills');
const out = resolve(root, opt('--out') || 'out/b2-simulation.mp4');
const chrome = process.env.CHROME_PATH || ['/usr/local/bin/google-chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);

const port = 8700 + Math.floor(Math.random() * 200);
const server = await serve(port);
const browser = await puppeteer.launch({
  executablePath: chrome, headless: true, protocolTimeout: 0,
  args: ['--no-sandbox', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
page.on('pageerror', e => console.error('page error:', e.message));
page.on('console', m => { if (['error', 'warning'].includes(m.type())) console.error('console:', m.text()); });
await page.goto(`http://127.0.0.1:${port}/b2-simulation/index.html?export=1${opt('--vol') ? '&vol=' + opt('--vol') : ''}`, { waitUntil: 'load', timeout: 0 });
await page.evaluate(() => window.__ready);

const frame = (t, type) => page.evaluate((t, type) => {
  window.__renderAt(t);
  return document.getElementById('stage').toDataURL(type, 0.94).split(',')[1];
}, t, type);

try {
  if (stills) {
    const dir = resolve(root, 'out/stills'); mkdirSync(dir, { recursive: true });
    for (const s of stills.split(',').map(Number)) {
      const t0 = Date.now();
      writeFileSync(resolve(dir, `t${s.toFixed(2).padStart(6, '0')}.png`), Buffer.from(await frame(s, 'image/png'), 'base64'));
      console.log(`t=${s}s  ${Date.now() - t0} ms`);
    }
  } else {
    mkdirSync(dirname(out), { recursive: true });
    const dur = await page.evaluate(() => window.__duration);
    const from = +(opt('--from') || 0), to = +(opt('--to') || dur);
    const wav = resolve(dirname(out), 'sfx.wav');
    writeFileSync(wav, Buffer.from(await page.evaluate(() => window.__audioWavBase64()), 'base64'));
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
      '-ss', String(from), '-t', String(to - from), '-i', wav,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', out],
    { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((res, rej) => ff.on('close', c => (c ? rej(new Error('ffmpeg exit ' + c)) : res())));
    const n0 = Math.round(from * fps), n1 = Math.round(to * fps), t0 = Date.now();
    for (let i = n0; i < n1; i++) {
      const buf = Buffer.from(await frame(i / fps, 'image/jpeg'), 'base64');
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if ((i - n0) % (fps * 2) === 0) {
        const el = (Date.now() - t0) / 1000, k = (i - n0 + 1) / (n1 - n0);
        console.log(`frame ${i - n0}/${n1 - n0}  t=${(i / fps).toFixed(1)}s  elapsed ${el.toFixed(0)}s  eta ${(el / k - el).toFixed(0)}s`);
      }
    }
    ff.stdin.end(); await done;
    console.log('video written to', out);
  }
} finally {
  await browser.close();
  server.close();
}
