import type { Frame, Landmark, Validation } from "./types";
import { bodyReference } from "./bodyReference";

export const midpoint = (a: Landmark, b: Landmark): Landmark => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  visibility: Math.min(a.visibility, b.visibility),
});
export function angle(a: Landmark, origin: Landmark, b: Landmark, aspect = 1) {
  const ax = (a.x - origin.x) * aspect,
    ay = a.y - origin.y;
  const bx = (b.x - origin.x) * aspect,
    by = b.y - origin.y;
  const denominator = Math.hypot(ax, ay) * Math.hypot(bx, by);
  return denominator
    ? (Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / denominator))) *
        180) /
        Math.PI
    : 0;
}
const inFrame = (p: Landmark) =>
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  p.x > 0.01 &&
  p.x < 0.99 &&
  p.y > 0.01 &&
  p.y < 0.985;

export function validatePose(
  frame: Frame,
  side: boolean,
  previous?: Frame,
): Validation {
  const l = frame.landmarks,
    aspect = frame.width / frame.height;
  if (l.length < 33)
    return {
      valid: false,
      message: "Step into the frame so we can find your pose.",
      checks: [{ label: "Body detected", valid: false }],
    };
  const { head, headIndex, heel, crown, near } = bodyReference(frame, side);
  const height = heel !== null ? heel - (crown ?? head.y) : 0;
  const anchors = side
    ? [near[0], near[3], near[4], near[5]]
    : [11, 12, 23, 24, 25, 26, 27, 28];
  const tracked =
    head.visibility >= 0.5 &&
    heel !== null &&
    anchors.every((i) => l[i].visibility >= 0.55);
  // Low confidence is not evidence of cropping. Ignore hidden profile joints
  // for framing; their estimated positions can jitter or leave the image.
  const framingPoints = [
    headIndex,
    ...anchors,
    ...(side ? [near[1], near[2], near[6]] : [13, 14, 15, 16, 29, 30]),
  ].filter((i) => l[i].visibility >= 0.55);
  const topCropped = (crown !== null && crown < 0.01) || head.y <= 0.035;
  const bottomCropped = heel !== null && heel >= 0.985;
  const framed =
    !topCropped && !bottomCropped && framingPoints.every((i) => inFrame(l[i]));
  const sizeOk = heel === null || crown === null || height >= 0.45;
  const shoulders = side ? l[near[0]] : midpoint(l[11], l[12]);
  const hips = side ? l[near[3]] : midpoint(l[23], l[24]);
  const aligned =
    height > 0 &&
    Math.abs(shoulders.x - hips.x) * aspect < height * 0.09 &&
    Math.abs(head.x - shoulders.x) * aspect < height * 0.16 &&
    (side || Math.abs(l[7].y - l[8].y) < height * 0.05);
  const pose = side
    ? Math.abs(l[11].x - l[12].x) * aspect < 0.09 * height &&
      Math.abs(l[23].x - l[24].x) * aspect < 0.09 * height
    : [11, 12, 13, 14, 15, 16, 23, 24].every((i) => l[i].visibility >= 0.6) &&
      Math.abs(l[11].x - l[12].x) * aspect > height * 0.14 &&
      [
        [11, 13, 23, 15],
        [12, 14, 24, 16],
      ].every(([s, e, h, w]) => {
        const degrees = angle(l[h], l[s], l[e], aspect);
        // Target 30–45°, with a small allowance for landmark estimation jitter.
        return (
          degrees >= 27 &&
          degrees <= 48 &&
          Math.hypot((l[w].x - l[h].x) * aspect, l[w].y - l[h].y) >
            height * 0.12
        );
      }) &&
      Math.abs(l[27].x - l[28].x) * aspect > height * 0.05;
  const motion =
    !previous || previous.landmarks.length < 33
      ? []
      : [headIndex, ...anchors]
          .filter(
            (i) =>
              l[i].visibility >= 0.55 &&
              previous.landmarks[i].visibility >= 0.55,
          )
          .map(
            (i) =>
              Math.hypot(
                (l[i].x - previous.landmarks[i].x) * aspect,
                l[i].y - previous.landmarks[i].y,
              ) / Math.max(height, 0.1),
          )
          .sort((a, b) => a - b);
  // Hidden-side estimates do not indicate motion. Still reject coherent body
  // movement or a large displacement at any confidently visible anchor.
  const still =
    !motion.length ||
    (motion[Math.floor(motion.length / 2)] < 0.015 &&
      motion[motion.length - 1] < 0.04);
  const checks = [
    { label: "One person in frame", valid: frame.people === 1 },
    {
      label: "Even lighting",
      valid: frame.brightness >= 45 && frame.brightness <= 235,
    },
    { label: "Full body inside frame", valid: framed },
    { label: "Camera distance", valid: sizeOk },
    {
      label: side ? "Visible side tracked" : "Body landmarks tracked",
      valid: tracked,
    },
    { label: "Head outline visible", valid: crown !== null },
    { label: side ? "Side profile · 90°" : "Arms in an A-pose", valid: pose },
    { label: "Standing straight", valid: aligned },
    { label: "Holding still", valid: still },
  ];
  const framingMessage = topCropped
    ? "Your head is near the top edge. Tilt the camera up slightly or take a small step back."
    : bottomCropped
      ? "Your feet are near the bottom edge. Tilt the camera down slightly or take a small step back."
      : "A visible arm or leg is outside the frame. Move toward the center or take a small step back.";
  const messages = [
    "Only one person should be visible.",
    "Face a light source and avoid strong backlighting.",
    framingMessage,
    "You are too far from the camera. Take a small step closer while keeping your head and feet visible.",
    side
      ? "I cannot track the side facing the camera clearly. Keep your near-side shoulder, knee and foot unobstructed; improve lighting."
      : "I cannot track your body clearly. Keep both feet and knees unobstructed and improve lighting; do not step farther back.",
    "I cannot see your head outline clearly. Use a plain background and even lighting.",
    side
      ? "Turn 90 degrees to your right for the side view. Keep your arms relaxed."
      : "Open your arms slightly into an A-shape, about 30–45 degrees from your sides, and separate your feet slightly.",
    "Stand straight with your head level.",
    "Hold your position and stay still.",
  ];
  const failed = checks.findIndex((c) => !c.valid);
  return {
    valid: failed < 0,
    checks,
    message: failed < 0 ? "Perfect. Hold your position." : messages[failed],
  };
}
