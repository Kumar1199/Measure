/// <reference lib="webworker" />
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Frame } from "./types";
const scope = self as unknown as DedicatedWorkerGlobalScope;
let detector: PoseLandmarker | undefined;
scope.onmessage = async (event: MessageEvent) => {
  const { type, bitmap, timestamp, baseUrl } = event.data;
  try {
    if (type === "init") {
      const vision = await FilesetResolver.forVisionTasks(`${baseUrl}/vision`);
      detector = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `${baseUrl}/vision/pose_landmarker_full.task`,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numPoses: 2,
        outputSegmentationMasks: true,
        minPoseDetectionConfidence: 0.65,
        minPosePresenceConfidence: 0.65,
        minTrackingConfidence: 0.65,
      });
      scope.postMessage({ type: "ready" });
    }
    if (type === "frame" && detector) {
      const canvas = new OffscreenCanvas(32, 32);
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(bitmap, 0, 0, 32, 32);
      const pixels = ctx.getImageData(0, 0, 32, 32).data;
      let light = 0;
      for (let i = 0; i < pixels.length; i += 4)
        light +=
          0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
      detector.detectForVideo(bitmap, timestamp, (result) => {
        const mask = result.segmentationMasks?.[0];
        const frame: Frame = {
          landmarks: result.landmarks[0] ?? [],
          width: bitmap.width,
          height: bitmap.height,
          timestamp,
          brightness: light / 1024,
          people: result.landmarks.length,
          mask: mask
            ? {
                data: new Float32Array(mask.getAsFloat32Array()),
                width: mask.width,
                height: mask.height,
              }
            : undefined,
        };
        scope.postMessage(
          { type: "result", frame },
          frame.mask ? [frame.mask.data.buffer] : [],
        );
      });
    }
  } catch (error) {
    scope.postMessage({
      type: "error",
      message:
        error instanceof Error ? error.message : "Pose detection failed.",
    });
  } finally {
    bitmap?.close();
  }
};
