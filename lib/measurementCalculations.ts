import type {
  Capture,
  Landmark,
  Measurement,
  Profile,
  ScanResult,
} from "./types";
import { midpoint } from "./poseValidation";
import { bodyReference } from "./bodyReference";
import { defaultLevels, median, torsoAnchors } from "./captureQuality";

export function ellipsePerimeter(width: number, depth: number): number {
  if (![width, depth].every((v) => Number.isFinite(v) && v > 0))
    throw new Error("Ellipse dimensions must be positive.");
  const a = width / 2,
    b = depth / 2;
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}
export function convert(valueCm: number, unit: "in" | "cm") {
  return unit === "in" ? valueCm / 2.54 : valueCm;
}

// Locate only the contiguous foreground run nearest the landmark seed. This avoids
// adding the separated arms to torso breadths or both legs to thigh breadths.
export function contourSlice(
  capture: Capture,
  y: number,
  seedX: number,
  threshold = 0.65,
): { left: number; right: number } | null {
  const mask = capture.mask;
  if (!mask || y <= 0 || y >= 1) return null;
  const row = Math.round(y * (mask.height - 1));
  const seed = Math.round(seedX * (mask.width - 1));
  const runs: { left: number; right: number }[] = [];
  let start = -1;
  for (let x = 0; x <= mask.width; x++) {
    const inside =
      x < mask.width && mask.data[row * mask.width + x] >= threshold;
    if (inside && start < 0) start = x;
    if (!inside && start >= 0) {
      if (x - start >= 3) runs.push({ left: start, right: x - 1 });
      start = -1;
    }
  }
  const run = runs.sort(
    (a, b) =>
      Math.abs((a.left + a.right) / 2 - seed) -
      Math.abs((b.left + b.right) / 2 - seed),
  )[0];
  if (
    !run ||
    seed < run.left - mask.width * 0.025 ||
    seed > run.right + mask.width * 0.025 ||
    run.left <= 1 ||
    run.right >= mask.width - 2
  )
    return null;
  return { left: run.left / mask.width, right: run.right / mask.width };
}

// Use neighboring rows and reject uncertain mask boundaries. One stray row
// should not inflate a circumference or determine the maximum hip slice.
export function robustContourSlice(c: Capture, y: number, seedX: number) {
  if (!c.mask) return null;
  const slices = [-2, -1, 0, 1, 2].map((offset) =>
    contourSlice(c, y + offset / c.mask!.height, seedX),
  );
  const good = slices.filter((s): s is NonNullable<typeof s> => s !== null);
  if (good.length < 4) return null;
  const left = median(good.map((s) => s.left)),
    right = median(good.map((s) => s.right));
  const widths = good.map((s) => s.right - s.left);
  const sorted = [...widths].sort((a, b) => a - b);
  if (sorted[sorted.length - 2] - sorted[1] > (right - left) * 0.12)
    return null;
  const loose = contourSlice(c, y, seedX, 0.5),
    strict = contourSlice(c, y, seedX, 0.8);
  if (
    !loose ||
    !strict ||
    loose.right - loose.left - (strict.right - strict.left) >
      (right - left) * 0.12
  )
    return null;
  return { left, right };
}

export function armObscuresSlice(
  c: Capture,
  y: number,
  slice: { left: number; right: number },
) {
  const { crown, heel } = bodyReference(c, true);
  const radius = (((heel ?? 1) - (crown ?? 0)) * 0.025 * c.height) / c.width;
  return [
    [11, 13],
    [13, 15],
    [12, 14],
    [14, 16],
  ].some(([a, b]) => {
    const p = c.landmarks[a],
      q = c.landmarks[b];
    if (
      Math.min(p.visibility, q.visibility) < 0.55 ||
      Math.abs(q.y - p.y) < 0.001
    )
      return false;
    const t = (y - p.y) / (q.y - p.y);
    if (t < 0.15 || t > 1) return false;
    const x = p.x + (q.x - p.x) * t;
    return (
      Math.min(Math.abs(x - slice.left), Math.abs(x - slice.right)) < radius
    );
  });
}
export function calibrate(c: Capture, heightCm: number, side = false) {
  if (!Number.isFinite(heightCm) || heightCm < 100 || heightCm > 230)
    throw new Error("Enter a height between 100 and 230 cm.");
  if (c.landmarks.length < 33 || !c.mask)
    throw new Error(
      "The body contour was not captured. Please retry with even lighting.",
    );
  const reference = bodyReference(c, side);
  const offsets = c.heightOffsets ?? { crown: 0, heel: 0 };
  if (
    !Object.values(offsets).every(
      (v) => Number.isFinite(v) && Math.abs(v) <= 0.08,
    )
  )
    throw new Error(
      "Invalid height reference adjustment. Review head and floor lines.",
    );
  const crown =
    reference.crown === null ? null : reference.crown + offsets.crown;
  const heel = reference.heel === null ? null : reference.heel + offsets.heel;
  if (
    crown === null ||
    heel === null ||
    crown < 0.01 ||
    heel - crown < 0.45 ||
    heel >= 0.985
  )
    throw new Error(
      "Keep your head and feet fully visible, and stand closer to the guide.",
    );
  return { scale: heightCm / ((heel - crown) * c.height), crown, heel };
}

export function assessCapturePair(
  front: Capture,
  side: Capture,
  heightCm: number,
) {
  const f = calibrate(front, heightCm),
    s = calibrate(side, heightCm, true);
  // Compare normalized body heights, not cm/pixel: camera resolution alone
  // changes cm/pixel. Each view already has its own height-based calibration.
  const frontSpan = f.heel - f.crown,
    sideSpan = s.heel - s.crown;
  const relativeDifference =
    Math.abs(frontSpan - sideSpan) / Math.max(frontSpan, sideSpan);
  const reviewRequired = relativeDifference > 0.12;
  const severeMismatch = relativeDifference > 0.3;
  const message = !reviewRequired
    ? null
    : severeMismatch
      ? "The views have substantially different apparent heights. Your front-view measurements are preserved, but combined-view circumferences need manual measurement or a new scan with the camera fixed."
      : "Your apparent height differs between views. Each view was calibrated separately using your entered height. Pose, framing or camera movement can cause this difference. Review combined-view circumferences with a tape before use.";
  return {
    front: f,
    side: s,
    relativeDifference,
    reviewRequired,
    severeMismatch,
    message,
  };
}

function calculateSingleFrame(
  front: Capture,
  side: Capture,
  profile: Profile,
): Measurement[] {
  const {
    front: f,
    side: s,
    reviewRequired,
    severeMismatch,
  } = assessCapturePair(front, side, profile.heightCm);
  const l = front.landmarks;
  const shoulder = midpoint(l[11], l[12]),
    hip = midpoint(l[23], l[24]);
  const { shoulder: sideShoulder, hip: sideHip } = torsoAnchors(side, true);
  const fl = front.levels ?? defaultLevels,
    scl = side.levels ?? defaultLevels;
  const neck = { ...shoulder, y: shoulder.y - (hip.y - shoulder.y) * 0.1 };
  const chestY = shoulder.y + (hip.y - shoulder.y) * fl.chest;
  const waistY = shoulder.y + (hip.y - shoulder.y) * fl.waist;
  const hipY = shoulder.y + (hip.y - shoulder.y) * fl.hip;
  const crotchY = hip.y + (midpoint(l[25], l[26]).y - hip.y) * 0.23;
  const bodyX = (shoulder.x + hip.x) / 2;
  const dist = (a: Landmark, b: Landmark) =>
    Math.hypot((a.x - b.x) * front.width, (a.y - b.y) * front.height) * f.scale;
  const vertical = (a: number, b: number) =>
    Math.abs(a - b) * front.height * f.scale;
  const sideY = (y: number) => {
    const fraction = (y - shoulder.y) / (hip.y - shoulder.y);
    const keys =
      fraction <= fl.waist
        ? (["chest", "waist"] as const)
        : (["waist", "hip"] as const);
    const [a, b] = keys;
    const mapped =
      scl[a] + ((fraction - fl[a]) / (fl[b] - fl[a])) * (scl[b] - scl[a]);
    return sideShoulder.y + mapped * (sideHip.y - sideShoulder.y);
  };
  const width = (c: Capture, y: number, x: number, scale: number) => {
    const slice = robustContourSlice(c, y, x);
    return slice ? (slice.right - slice.left) * c.width * scale : null;
  };
  const circumference = (
    y: number,
    x = bodyX,
    sy = sideY(y),
    sx = sideShoulder.x +
      (sideHip.x - sideShoulder.x) *
        ((sy - sideShoulder.y) / (sideHip.y - sideShoulder.y)),
  ): number | null => {
    const sideSlice = robustContourSlice(side, sy, sx);
    if (!sideSlice || armObscuresSlice(side, sy, sideSlice)) return null;
    const a = width(front, y, x, f.scale),
      b = width(side, sy, sx, s.scale);
    return a && b ? ellipsePerimeter(a, b) : null;
  };
  const maxCirc = (from: number, to: number) => {
    const values = Array.from({ length: 13 }, (_, i) =>
      circumference(from + ((to - from) * i) / 12),
    ).filter((v): v is number => v !== null);
    // Require support from adjacent slices instead of selecting a lone maximum.
    const sorted = values.sort((a, b) => a - b);
    return values.length >= 8
      ? sorted[Math.floor((sorted.length - 1) * 0.9)]
      : null;
  };
  const hipCirc = front.levels
    ? circumference(hipY)
    : maxCirc(hipY - 0.025, hipY + 0.025);
  const waistCirc = circumference(waistY);
  // Side-view limbs overlap. Use a clearly disclosed circular cross-section
  // approximation from a perpendicular front-view contour, not a false ellipse.
  const limbCirc = (a: number, b: number, t: number) => {
    const mask = front.mask!;
    if (Math.min(l[a].visibility, l[b].visibility) < 0.8) return null;
    const x = (l[a].x + (l[b].x - l[a].x) * t) * front.width;
    const y = (l[a].y + (l[b].y - l[a].y) * t) * front.height;
    const dx = (l[b].x - l[a].x) * front.width,
      dy = (l[b].y - l[a].y) * front.height,
      length = Math.hypot(dx, dy);
    if (!length) return null;
    const inside = (d: number) => {
      const xx = Math.round(
          ((x + (dy / length) * d) / front.width) * mask.width,
        ),
        yy = Math.round(((y - (dx / length) * d) / front.height) * mask.height);
      return (
        xx >= 0 &&
        xx < mask.width &&
        yy >= 0 &&
        yy < mask.height &&
        mask.data[yy * mask.width + xx] >= 0.65
      );
    };
    if (!inside(0)) return null;
    const limit = front.width * 0.13;
    let left = 0,
      right = 0;
    while (left < limit && inside(-left)) left++;
    while (right < limit && inside(right)) right++;
    return left >= limit || right >= limit
      ? null
      : Math.PI * (left + right) * f.scale;
  };
  const slope =
    (Math.atan2(
      Math.abs(l[11].y - l[12].y) * front.height,
      Math.abs(l[11].x - l[12].x) * front.width,
    ) *
      180) /
    Math.PI;
  const modelLevel = front.levels
    ? "Anatomical levels reviewed on captured images; verify with a tape."
    : "Estimated anatomical level from pose landmarks; verify with a tape.";
  const ellipse =
    "Median contour breadth and depth from neighboring rows; Ramanujan ellipse. Uncertain boundaries or arm overlap require manual measurement. " +
    modelLevel;
  const limb =
    "Circular approximation from perpendicular front contour; side limb is occluded. Verify manually.";
  const m: Measurement[] = [];
  const add = (
    id: number,
    name: string,
    category: Measurement["category"],
    valueCm: number | null,
    method: string,
    status: Measurement["status"] = "estimate",
    degrees = false,
  ) => {
    const valid =
      valueCm !== null &&
      Number.isFinite(valueCm) &&
      (degrees ? valueCm >= 0 : valueCm > 0);
    m.push({
      id,
      name,
      category,
      valueCm: valid ? valueCm : null,
      method: valid ? method : `Manual measurement required. ${method}`,
      status: valid ? status : "manual",
      degrees,
    });
  };
  add(
    1,
    "Height",
    "full",
    profile.heightCm,
    "Entered barefoot height; calibration reference.",
    "reference",
  );
  add(2, "Neck Circumference", "upper", circumference(neck.y), ellipse);
  add(
    3,
    "Shoulder Width",
    "upper",
    dist(l[11], l[12]),
    "Image-plane acromion-to-acromion distance.",
  );
  add(
    4,
    "Left Shoulder",
    "upper",
    dist(neck, l[11]),
    "Estimated neck base to left acromion; neck base is not a detected landmark.",
  );
  add(
    5,
    "Right Shoulder",
    "upper",
    dist(neck, l[12]),
    "Estimated neck base to right acromion; neck base is not a detected landmark.",
  );
  add(
    6,
    "Shoulder Slope",
    "upper",
    slope,
    "Angle of the line between shoulders to horizontal; indicates shoulder tilt, not individual neck-to-acromion slope.",
    "estimate",
    true,
  );
  add(7, "Chest Circumference", "upper", circumference(chestY), ellipse);
  add(
    8,
    "Upper Chest Circumference",
    "upper",
    circumference(chestY - 5.08 / (front.height * f.scale)),
    ellipse + " Slice 5.08 cm above estimated chest.",
  );
  add(9, "Waist Circumference", "upper", waistCirc, ellipse);
  add(
    10,
    "Abdomen/Stomach Circumference",
    "upper",
    maxCirc(waistY, hipY),
    ellipse + " Robust upper width across 13 slices.",
  );
  add(
    11,
    "Hip/Seat Circumference",
    "upper",
    hipCirc,
    ellipse +
      (front.levels
        ? " Reviewed hip level."
        : " Robust upper width around hip landmark level."),
  );
  add(
    12,
    "Across Chest",
    "upper",
    width(front, chestY, bodyX, f.scale),
    "Front torso contour breadth at estimated axilla level; creases are not detected.",
  );
  add(
    13,
    "Across Back",
    "upper",
    null,
    "Posterior armpit creases cannot be observed in a front and side scan.",
  );
  add(
    14,
    "Armhole Circumference",
    "upper",
    null,
    "A 3D armhole loop cannot be recovered reliably from these two views.",
  );
  add(15, "Bicep Circumference", "upper", limbCirc(11, 13, 0.5), limb);
  add(16, "Elbow Circumference", "upper", limbCirc(11, 13, 0.98), limb);
  add(17, "Wrist Circumference", "upper", limbCirc(13, 15, 0.98), limb);
  add(
    18,
    "Sleeve Length",
    "upper",
    dist(l[11], l[13]) + dist(l[13], l[15]),
    "Sum of shoulder–elbow and elbow–wrist distances.",
  );
  add(
    19,
    "Shoulder-to-Elbow",
    "upper",
    dist(l[11], l[13]),
    "Left acromion to elbow landmark.",
  );
  add(
    20,
    "Front Length",
    "full",
    vertical(neck.y, crotchY),
    "Estimated neck base vertically to modeled crotch level.",
  );
  add(
    21,
    "Back Length",
    "full",
    null,
    "C7 is not detected and there is no back view.",
  );
  add(
    22,
    "Shoulder-to-Waist",
    "full",
    vertical(shoulder.y, waistY),
    modelLevel,
  );
  add(23, "Chest-to-Waist", "full", vertical(chestY, waistY), modelLevel);
  add(
    24,
    "Shirt/Kurta Length",
    "full",
    profile.shirtLengthCm,
    "User-selected shoulder-to-hem design length.",
    "design",
  );
  add(
    25,
    "Waist Circumference (Trouser)",
    "lower",
    circumference(waistY + 2.54 / (front.height * f.scale)),
    ellipse + " Waistband assumed 2.54 cm below natural waist.",
  );
  add(26, "Hip/Seat Circumference (Trouser)", "lower", hipCirc, ellipse);
  add(
    27,
    "Front Rise",
    "lower",
    null,
    "Front waist-to-crotch contour is occluded. Enter a tape measurement.",
  );
  add(
    28,
    "Back Rise",
    "lower",
    null,
    "Back waist-to-crotch contour is occluded. Enter a tape measurement.",
  );
  add(
    29,
    "Full Rise",
    "lower",
    null,
    "Sum of manually confirmed front rise and back rise.",
  );
  add(
    30,
    "Thigh Circumference",
    "lower",
    limbCirc(
      23,
      25,
      Math.min(
        0.8,
        (crotchY + 2.54 / (front.height * f.scale) - l[23].y) /
          (l[25].y - l[23].y),
      ),
    ),
    limb,
  );
  add(31, "Knee Circumference", "lower", limbCirc(23, 25, 0.99), limb);
  const calfValues = [0.2, 0.3, 0.4, 0.5, 0.6]
    .map((t) => limbCirc(25, 27, t))
    .filter((v): v is number => v !== null);
  add(
    32,
    "Calf Circumference",
    "lower",
    calfValues.length ? Math.max(...calfValues) : null,
    limb + " Maximum of five calf slices.",
  );
  add(33, "Ankle Circumference", "lower", limbCirc(25, 27, 0.95), limb);
  add(
    34,
    "Inseam",
    "lower",
    vertical(crotchY, l[27].y),
    "Modeled crotch level to ankle; not a detected crotch landmark.",
  );
  const outseam = vertical(waistY, l[27].y);
  add(
    35,
    "Outseam",
    "lower",
    outseam,
    "Vertical waist-to-ankle projection; excludes surface curvature.",
  );
  add(
    36,
    "Waist-to-Knee",
    "lower",
    vertical(waistY, midpoint(l[25], l[26]).y),
    modelLevel,
  );
  add(37, "Waist-to-Floor", "full", vertical(waistY, f.heel), modelLevel);
  add(
    38,
    "Trouser/Pant Length",
    "lower",
    outseam - profile.shoeClearanceCm,
    `Projected outseam minus selected ${profile.shoeClearanceCm} cm clearance.`,
    "design",
  );
  add(
    39,
    "Bottom/Leg Opening",
    "lower",
    null,
    "Garment design choice, not a body measurement. Enter your desired finished hem circumference.",
  );
  add(
    40,
    "Shoulder-to-Fingertip",
    "full",
    null,
    "Pose detects the index finger, not the middle fingertip. Measure manually for the requested endpoint.",
  );
  const combinedViewIds = new Set([2, 7, 8, 9, 10, 11, 25, 26]);
  return m.map((row) => {
    if (!reviewRequired || !combinedViewIds.has(row.id)) return row;
    if (severeMismatch)
      return {
        ...row,
        valueCm: null,
        status: "manual" as const,
        method:
          "The view calibrations differ substantially. Enter a tape measurement or retake the scan. " +
          row.method,
      };
    return {
      ...row,
      method:
        row.method +
        " View calibration differs: confirm this circumference manually.",
    };
  });
}

export function calculateMeasurements(
  front: Capture,
  side: Capture,
  profile: Profile,
): Measurement[] {
  for (const capture of [front, side]) {
    const levels = capture.levels;
    if (
      levels &&
      (!Object.values(levels).every(Number.isFinite) ||
        levels.chest < 0.05 ||
        levels.hip > 1.4 ||
        levels.waist - levels.chest < 0.1 ||
        levels.hip - levels.waist < 0.1)
    ) {
      throw new Error(
        "Place chest, waist and hip lines in order with space between them.",
      );
    }
  }
  const base = calculateSingleFrame(front, side, profile);
  const count = Math.min(front.samples?.length ?? 0, side.samples?.length ?? 0);
  if (count < 3) return base;
  const observations = Array.from({ length: count }, (_, i) => {
    // Every observation has its own landmarks, mask and height calibration.
    // Never average masks with differently positioned bodies.
    try {
      return calculateSingleFrame(
        {
          ...front.samples![i],
          image: "",
          levels: front.levels,
          heightOffsets: front.heightOffsets,
        },
        {
          ...side.samples![i],
          image: "",
          levels: side.levels,
          heightOffsets: side.heightOffsets,
        },
        profile,
      );
    } catch {
      return [];
    }
  });
  return base.map((row) => {
    if (row.status === "reference" || row.status === "design") return row;
    const values = observations
      .map((rows) => rows.find((r) => r.id === row.id)?.valueCm)
      .filter(
        (v): v is number => v !== null && v !== undefined && Number.isFinite(v),
      );
    if (values.length < Math.ceil(count * 0.7))
      return {
        ...row,
        valueCm: null,
        status: "manual" as const,
        method:
          "Too few clear observations in the capture burst. " + row.method,
      };
    const center = median(values);
    const deviations = values.map((v) => Math.abs(v - center));
    if (
      median(deviations) >
      Math.max(row.degrees ? 1 : 0.5, Math.abs(center) * 0.025)
    )
      return {
        ...row,
        valueCm: null,
        status: "manual" as const,
        method:
          "Measurement varied during the hold. Retake or confirm with a tape. " +
          row.method,
      };
    // Preserve a failed representative-frame safety check (e.g. pair mismatch).
    if (row.valueCm === null) return row;
    return {
      ...row,
      valueCm: center,
      method: `Median of ${values.length} stable observations. ` + row.method,
    };
  });
}

export const fitProfiles = {
  Men: { chestEase: 10, waistEase: 8, hipEase: 6, riseAllowance: 2.5 },
  Women: { chestEase: 8, waistEase: 6, hipEase: 6, riseAllowance: 2 },
  Unisex: { chestEase: 12, waistEase: 10, hipEase: 8, riseAllowance: 3 },
};
export function createResult(
  front: Capture,
  side: Capture,
  profile: Profile,
): ScanResult {
  const { relativeDifference, reviewRequired, severeMismatch, message } =
    assessCapturePair(front, side, profile.heightCm);
  return {
    measurements: calculateMeasurements(front, side, profile),
    profile,
    capturedAt: new Date().toISOString(),
    demo: false,
    calibration: {
      relativeDifference,
      reviewRequired,
      severeMismatch,
      message,
      observations: {
        front: front.samples?.length ?? 1,
        side: side.samples?.length ?? 1,
      },
      reviewedLevels: { front: front.levels, side: side.levels },
      heightOffsets: { front: front.heightOffsets, side: side.heightOffsets },
    },
  };
}
