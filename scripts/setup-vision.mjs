import { mkdir, cp, writeFile, access } from "node:fs/promises";
const destination = new URL("../public/vision/", import.meta.url);
await mkdir(destination, { recursive: true });
await cp(
  new URL("../node_modules/@mediapipe/tasks-vision/wasm/", import.meta.url),
  destination,
  { recursive: true },
);
const target = new URL("pose_landmarker_full.task", destination);
try {
  await access(target);
} catch {
  console.log("Downloading the MediaPipe full pose model (one-time setup)…");
  const response = await fetch(
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
    { signal: AbortSignal.timeout(120000) },
  );
  if (!response.ok)
    throw new Error(`Model download failed: ${response.status}`);
  await writeFile(target, new Uint8Array(await response.arrayBuffer()));
}
console.log("Vision assets ready. Camera frames are processed locally.");
