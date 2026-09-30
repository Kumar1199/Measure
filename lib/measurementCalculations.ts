import type {
  Capture,
  Landmark,
  Measurement,
  Profile,
  ScanResult,
} from "./types";
import { midpoint } from "./poseValidation";
import { bodyReference } from "./bodyReference";

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
): { left: number; right: number } | null {
  const mask = capture.mask;
  if (!mask || y <= 0 || y >= 1) return null;
  const row = Math.round(y * (mask.height - 1));
  const seed = Math.round(seedX * (mask.width - 1));
  const runs: { left: number; right: number }[] = [];
  let start = -1;
  for (let x = 0; x <= mask.width; x++) {
    const inside = x < mask.width && mask.data[row * mask.width + x] >= 0.65;
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
export function calibrate(c: Capture, heightCm: number, side = false) {
  if (!Number.isFinite(heightCm) || heightCm < 100 || heightCm > 230)
    throw new Error("Enter a height between 100 and 230 cm.");
  if (c.landmarks.length < 33 || !c.mask)
    throw new Error(
      "The body contour was not captured. Please retry with even lighting.",
    );
  const { crown, heel } = bodyReference(c, side);
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

export function calculateMeasurements(
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
  const l = front.landmarks,
    sl = side.landmarks;
  const shoulder = midpoint(l[11], l[12]),
    hip = midpoint(l[23], l[24]);
  const sideShoulder = midpoint(sl[11], sl[12]),
    sideHip = midpoint(sl[23], sl[24]);
  const neck = { ...shoulder, y: shoulder.y - (hip.y - shoulder.y) * 0.1 };
  const chestY = shoulder.y + (hip.y - shoulder.y) * 0.24;
  const waistY = shoulder.y + (hip.y - shoulder.y) * 0.72;
  const crotchY = hip.y + (midpoint(l[25], l[26]).y - hip.y) * 0.23;
  const bodyX = (shoulder.x + hip.x) / 2;
  const dist = (a: Landmark, b: Landmark) =>
    Math.hypot((a.x - b.x) * front.width, (a.y - b.y) * front.height) * f.scale;
  const vertical = (a: number, b: number) =>
    Math.abs(a - b) * front.height * f.scale;
  const sideY = (y: number) =>
    sideShoulder.y +
    ((y - shoulder.y) / (hip.y - shoulder.y)) * (sideHip.y - sideShoulder.y);
  const width = (c: Capture, y: number, x: number, scale: number) => {
    const slice = contourSlice(c, y, x);
    return slice ? (slice.right - slice.left) * c.width * scale : null;
  };
  const circumference = (
    y: number,
    x = bodyX,
    sy = sideY(y),
    sx = sideHip.x,
  ): number | null => {
    const a = width(front, y, x, f.scale),
      b = width(side, sy, sx, s.scale);
    return a && b ? ellipsePerimeter(a, b) : null;
  };
  const maxCirc = (from: number, to: number) => {
    const values = Array.from({ length: 13 }, (_, i) =>
      circumference(from + ((to - from) * i) / 12),
    ).filter((v): v is number => v !== null);
    return values.length >= 8 ? Math.max(...values) : null;
  };
  const hipCirc = maxCirc(hip.y - 0.025, hip.y + 0.025);
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
  const modelLevel =
    "Estimated anatomical level from pose landmarks; verify with a tape.";
  const ellipse =
    "Front contour breadth + side contour depth; Ramanujan ellipse. " +
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
    maxCirc(waistY, hip.y),
    ellipse + " Maximum of 13 slices.",
  );
  add(
    11,
    "Hip/Seat Circumference",
    "upper",
    hipCirc,
    ellipse + " Maximum around hip landmark level.",
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
    },
  };
}
