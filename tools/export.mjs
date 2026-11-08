// Renders the animation frame-by-frame in headless Chrome and encodes an MP4 with ffmpeg.
//   node tools/export.mjs                      -> out/iran-escalation-map.mp4 (1920x1080, 30fps, with SFX)
//   node tools/export.mjs --fps 60 --nosubs    -> 60fps, without VO subtitles
//   node tools/export.mjs --stills 5,20,30     -> PNG stills in out/stills (quick review)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const fps = +(opt('--fps') || 30);
const stills = opt('--stills');
const out = resolve(root, opt('--out') || 'out/iran-escalation-map.mp4');
const chrome = process.env.CHROME_PATH || ['/usr/local/bin/google-chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);

const browser = await puppeteer.launch({
  executablePath: chrome, headless: true,
  args: ['--no-sandbox', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
page.on('pageerror', e => console.error('page error:', e.message));
const url = pathToFileURL(resolve(root, 'index.html')).href + '?export=1' + (args.includes('--nosubs') ? '&nosubs=1' : '');
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => window.__ready);

const frame = (t, type) => page.evaluate((t, type) => {
  window.__renderAt(t);
  return document.getElementById('stage').toDataURL(type, 0.95).split(',')[1];
}, t, type);

if (stills) {
  const dir = resolve(root, 'out/stills'); mkdirSync(dir, { recursive: true });
  for (const s of stills.split(',').map(Number)) {
    writeFileSync(resolve(dir, `t${String(s).padStart(5, '0')}.png`), Buffer.from(await frame(s, 'image/png'), 'base64'));
  }
  console.log('stills written to', dir);
} else {
  mkdirSync(dirname(out), { recursive: true });
  const wav = resolve(dirname(out), 'sfx.wav');
  writeFileSync(wav, Buffer.from(await page.evaluate(() => window.__audioWavBase64()), 'base64'));
  const dur = await page.evaluate(() => window.__duration);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', '-i', wav,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out],
  { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => (c ? rej(new Error('ffmpeg exit ' + c)) : res())));
  const n = Math.round(dur * fps);
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const buf = Buffer.from(await frame(i / fps, 'image/jpeg'), 'base64');
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % (fps * 5) === 0) console.log(`frame ${i}/${n}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  ff.stdin.end(); await done;
  console.log('video written to', out);
}
await browser.close();
