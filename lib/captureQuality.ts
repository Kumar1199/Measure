import type { Frame, Capture, CaptureLevels } from "./types";
import { bodyReference, visibleSideIndices } from "./bodyReference";

export const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function torsoAnchors(frame: Frame, side: boolean) {
  const l = frame.landmarks;
  if (side) {
    const near = visibleSideIndices(l);
    return { shoulder: l[near[0]], hip: l[near[3]] };
  }
  return {
    shoulder: { x: (l[11].x + l[12].x) / 2, y: (l[11].y + l[12].y) / 2 },
    hip: { x: (l[23].x + l[24].x) / 2, y: (l[23].y + l[24].y) / 2 },
  };
}

export const defaultLevels: CaptureLevels = {
  chest: 0.24,
  waist: 0.72,
  hip: 1,
};

export function levelY(
  capture: Capture,
  side: boolean,
  key: keyof CaptureLevels,
) {
  const { shoulder, hip } = torsoAnchors(capture, side);
  return (
    shoulder.y + (hip.y - shoulder.y) * (capture.levels ?? defaultLevels)[key]
  );
}

// Discard stale observations and reset on scale jumps instead of averaging a
// person moving towards the camera into an apparently stable measurement.
export function collectStableFrames(
  history: Frame[],
  frame: Frame,
  side: boolean,
  valid: boolean,
) {
  if (!valid) return [];
  const last = history.at(-1);
  if (!last) return [frame];
  const a = bodyReference(last, side),
    b = bodyReference(frame, side);
  const spanA = (a.heel ?? 0) - (a.crown ?? 0),
    spanB = (b.heel ?? 0) - (b.crown ?? 0);
  if (
    frame.timestamp <= last.timestamp ||
    frame.timestamp - last.timestamp > 2500 ||
    last.width !== frame.width ||
    last.height !== frame.height ||
    Math.abs(spanA - spanB) / Math.max(spanA, spanB, 0.01) > 0.04
  )
    return [frame];
  return [...history, frame].slice(-7);
}
