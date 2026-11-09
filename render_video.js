const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");

// Start local server if not running, render 24s @ 30fps (720 frames) via Chrome CDP into ffmpeg
const FPS = 30;
const DURATION = 24;
const TOTAL_FRAMES = FPS * DURATION;
const OUT_MP4 = path.join(__dirname, "public", "gaza_yellow_line_animation.mp4");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}

async function main() {
  // Ensure server is running on port 3099 for rendering
  process.env.PORT = "3099";
  require("./server.js");
  await sleep(400);

  const debugPort = 9233;
  const chrome = spawn("google-chrome", [
    "--headless",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--window-size=1920,1080",
    `--remote-debugging-port=${debugPort}`,
    "http://127.0.0.1:3099/?render=1"
  ], { stdio: "ignore" });

  let targets = null;
  for (let i = 0; i < 30; i++) {
    try {
      targets = await fetchJson(`http://127.0.0.1:${debugPort}/json`);
      if (targets && targets.length > 0) break;
    } catch (_) {}
    await sleep(200);
  }
  if (!targets || !targets.length) {
    throw new Error("Failed to connect to headless Chrome CDP");
  }

  const pageTarget = targets.find((t) => t.type === "page") || targets[0];
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  let msgId = 1;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  });

  await new Promise((res, rej) => {
    ws.addEventListener("open", res);
    ws.addEventListener("error", rej);
  });

  function sendCdp(method, params = {}) {
    const id = msgId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await sendCdp("Page.enable");
  await sendCdp("Runtime.enable");
  await sendCdp("Emulation.setDeviceMetricsOverride", {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false
  });

  // Wait for map image and fonts to load
  for (let i = 0; i < 50; i++) {
    const res = await sendCdp("Runtime.evaluate", {
      expression: "Boolean(window.isMapReady && window.isMapReady())",
      returnByValue: true
    });
    if (res?.result?.value === true) break;
    await sleep(100);
  }
  await sendCdp("Runtime.evaluate", {
    expression: "document.fonts.ready.then(() => true)",
    awaitPromise: true
  });

  console.log(`Rendering ${TOTAL_FRAMES} frames (${DURATION}s @ ${FPS}fps) at 1920x1080...`);

  const ffmpeg = spawn("ffmpeg", [
    "-y",
    "-f", "image2pipe",
    "-vcodec", "mjpeg",
    "-framerate", String(FPS),
    "-i", "-",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-profile:v", "high",
    "-crf", "18",
    "-preset", "fast",
    "-movflags", "+faststart",
    OUT_MP4
  ], { stdio: ["pipe", "inherit", "inherit"] });

  const sampleFrames = [
    { frame: Math.round(2.5 * FPS), name: "/tmp/verify/frame_scene1_overview.jpg" },
    { frame: Math.round(6.5 * FPS), name: "/tmp/verify/frame_scene2_zoom_in_north.jpg" },
    { frame: Math.round(11.0 * FPS), name: "/tmp/verify/frame_scene3_central.jpg" },
    { frame: Math.round(15.2 * FPS), name: "/tmp/verify/frame_scene4_khanyunis.jpg" },
    { frame: Math.round(18.0 * FPS), name: "/tmp/verify/frame_scene5_zoom_in_rafah.jpg" },
    { frame: Math.round(22.5 * FPS), name: "/tmp/verify/frame_scene6_zoom_out_summary.jpg" }
  ];

  for (let f = 0; f < TOTAL_FRAMES; f++) {
    const t = (f / (TOTAL_FRAMES - 1)) * DURATION;
    const evalRes = await sendCdp("Runtime.evaluate", {
      expression: `(() => {
        window.renderAtTime(${t.toFixed(4)});
        const c = document.getElementById("mapCanvas");
        return c.toDataURL("image/jpeg", 0.94).split(",")[1];
      })()`,
      returnByValue: true
    });

    const base64Data = evalRes.result.value;
    const buf = Buffer.from(base64Data, "base64");

    const sample = sampleFrames.find((s) => s.frame === f);
    if (sample) {
      fs.writeFileSync(sample.name, buf);
    }

    const canWrite = ffmpeg.stdin.write(buf);
    if (!canWrite) {
      await new Promise((r) => ffmpeg.stdin.once("drain", r));
    }
    if (f % 120 === 0 || f === TOTAL_FRAMES - 1) {
      console.log(`Rendered frame ${f + 1}/${TOTAL_FRAMES} (t=${t.toFixed(1)}s)`);
    }
  }

  ffmpeg.stdin.end();
  await new Promise((res, rej) => {
    ffmpeg.on("close", (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}`))));
  });

  ws.close();
  chrome.kill("SIGKILL");
  console.log("Video successfully rendered to:", OUT_MP4);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
