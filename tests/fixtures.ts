import type { Capture } from "../lib/types";

/** Rescale a synthetic person within the same image, as a distance/zoom change. */
export function scaledCapture(source: Capture, factor: number): Capture {
  const mask = source.mask!;
  const data = new Float32Array(mask.data.length);
  for (let y = 0; y < mask.height; y++)
    for (let x = 0; x < mask.width; x++) {
      const sx = Math.round(
        ((x / mask.width - 0.5) / factor + 0.5) * mask.width,
      );
      const sy = Math.round(
        ((y / mask.height - 0.5) / factor + 0.5) * mask.height,
      );
      if (sx >= 0 && sx < mask.width && sy >= 0 && sy < mask.height)
        data[y * mask.width + x] = mask.data[sy * mask.width + sx];
    }
  return {
    ...source,
    landmarks: source.landmarks.map((p) => ({
      ...p,
      x: 0.5 + (p.x - 0.5) * factor,
      y: 0.5 + (p.y - 0.5) * factor,
    })),
    mask: { ...mask, data },
  };
}
