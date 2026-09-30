import type { Frame, Landmark } from "./types";

export function visibleSideIndices(landmarks: Landmark[]) {
  const left = [11, 13, 15, 23, 25, 27, 29];
  const right = [12, 14, 16, 24, 26, 28, 30];
  const score = (indices: number[]) =>
    indices.reduce((sum, i) => sum + (landmarks[i]?.visibility ?? 0), 0);
  return score(left) >= score(right) ? left : right;
}

// Use the same observable head and foot for framing and calibration. A hidden
// foot in a profile view is not a trustworthy calibration anchor.
export function bodyReference(frame: Frame, side = false) {
  const l = frame.landmarks;
  const near = visibleSideIndices(l);
  const headIndex =
    l[0]?.visibility >= 0.5
      ? 0
      : (l[7]?.visibility ?? 0) >= (l[8]?.visibility ?? 0)
        ? 7
        : 8;
  const head = l[headIndex];
  const heelIndices = side ? [near[6]] : [29, 30];
  const heels = heelIndices
    .map((i) => l[i])
    .filter((p) => p && p.visibility >= 0.45 && Number.isFinite(p.y));
  const heel = heels.length ? Math.max(...heels.map((p) => p.y)) : null;
  let crown: number | null = null;
  const mask = frame.mask;
  if (head && mask && Number.isFinite(head.x) && Number.isFinite(head.y)) {
    const lo = Math.max(0, Math.floor((head.x - 0.06) * mask.width));
    const hi = Math.min(
      mask.width - 1,
      Math.ceil((head.x + 0.06) * mask.width),
    );
    const requiredPixels = Math.max(3, Math.round(mask.width * 0.01));
    for (
      let y = Math.max(0, Math.floor((head.y - 0.18) * mask.height));
      y < Math.min(mask.height, head.y * mask.height);
      y++
    ) {
      let count = 0;
      for (let x = lo; x <= hi; x++)
        if (mask.data[y * mask.width + x] >= 0.65) count++;
      if (count >= requiredPixels) {
        crown = y / mask.height;
        break;
      }
    }
  }
  return { head, headIndex, heel, crown, near };
}
