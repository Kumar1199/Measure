import type { Capture, Landmark, Profile, ScanResult } from "./types";
import { calculateMeasurements } from "./measurementCalculations";
// Synthetic geometry for an explicitly labeled sample; never used as a fallback
// for failed camera detection or mixed with a person's captures.
export function syntheticCapture(side = false): Capture {
  const width = 400,
    height = 600;
  const l: Landmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.13,
    visibility: 0.99,
  }));
  const coords: Record<number, number[]> = {
    0: [0.5, 0.13],
    7: [0.47, 0.13],
    8: [0.53, 0.13],
    11: [0.37, 0.25],
    12: [0.63, 0.25],
    13: [0.26, 0.4],
    14: [0.74, 0.4],
    15: [0.16, 0.54],
    16: [0.84, 0.54],
    23: [0.42, 0.52],
    24: [0.58, 0.52],
    25: [0.41, 0.72],
    26: [0.59, 0.72],
    27: [0.39, 0.92],
    28: [0.61, 0.92],
    29: [0.39, 0.94],
    30: [0.61, 0.94],
    31: [0.36, 0.95],
    32: [0.64, 0.95],
  };
  for (const [key, [x, y]] of Object.entries(coords))
    l[Number(key)] = {
      x: side ? 0.5 + (x - 0.5) * 0.08 : x,
      y,
      visibility: 0.99,
    };
  const data = new Float32Array(width * height);
  const ellipse = (cx: number, cy: number, rx: number, ry: number) => {
    for (
      let y = Math.max(0, Math.floor((cy - ry) * height));
      y < Math.min(height, (cy + ry) * height);
      y++
    )
      for (
        let x = Math.max(0, Math.floor((cx - rx) * width));
        x < Math.min(width, (cx + rx) * width);
        x++
      )
        if (((x / width - cx) / rx) ** 2 + ((y / height - cy) / ry) ** 2 <= 1)
          data[y * width + x] = 1;
  };
  const limb = (a: Landmark, b: Landmark, r: number) => {
    for (let t = 0; t <= 1; t += 0.025)
      ellipse(
        a.x + (b.x - a.x) * t,
        a.y + (b.y - a.y) * t,
        r,
        (r * width) / height,
      );
  };
  ellipse(0.5, 0.12, side ? 0.06 : 0.065, 0.066);
  ellipse(0.5, 0.21, 0.035, 0.07);
  ellipse(0.5, 0.36, side ? 0.085 : 0.14, 0.16);
  ellipse(0.5, 0.52, side ? 0.1 : 0.125, 0.09);
  for (const [a, b, r] of [
    [11, 13, 0.032],
    [13, 15, 0.024],
    [23, 25, 0.052],
    [25, 27, 0.036],
    [12, 14, 0.032],
    [14, 16, 0.024],
    [24, 26, 0.052],
    [26, 28, 0.036],
  ])
    limb(l[a], l[b], r);
  return {
    landmarks: l,
    mask: { data, width, height },
    width,
    height,
    timestamp: 0,
    brightness: 130,
    people: 1,
    image: "",
  };
}
export function demoResult(profile: Profile): ScanResult {
  return {
    measurements: calculateMeasurements(
      syntheticCapture(),
      syntheticCapture(true),
      profile,
    ),
    profile,
    capturedAt: new Date().toISOString(),
    demo: true,
  };
}
