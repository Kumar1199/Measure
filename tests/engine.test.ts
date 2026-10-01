import { describe, it, expect } from "vitest";
import { advance, initialMachine } from "../lib/captureMachine";
import {
  calibrate,
  calculateMeasurements,
  contourSlice,
  convert,
  ellipsePerimeter,
  assessCapturePair,
  createResult,
  robustContourSlice,
  armObscuresSlice,
} from "../lib/measurementCalculations";
import { bodyReference } from "../lib/bodyReference";
import { collectStableFrames, defaultLevels } from "../lib/captureQuality";
import { syntheticCapture } from "../lib/demo";
import { angle, validatePose } from "../lib/poseValidation";
import type { Profile } from "../lib/types";
import { scaledCapture } from "./fixtures";
const profile: Profile = {
  heightCm: 175,
  unit: "cm",
  gender: "Unisex",
  shirtLengthCm: 75,
  shoeClearanceCm: 2,
};
describe("Measurement robustness", () => {
  it("uses reviewed head and floor endpoints for scale and rejects invalid offsets", () => {
    const frame = syntheticCapture();
    const before = calibrate(frame, 175);
    frame.heightOffsets = { crown: 0.01, heel: 0.02 };
    const after = calibrate(frame, 175);
    expect(after.crown).toBeCloseTo(before.crown + 0.01);
    expect(after.heel).toBeCloseTo(before.heel + 0.02);
    expect(after.scale).toBeLessThan(before.scale);
    frame.heightOffsets.heel = NaN;
    expect(() => calibrate(frame, 175)).toThrow("Invalid height");
  });
  it("ignores isolated foreground above the crown", () => {
    const frame = syntheticCapture();
    const expected = bodyReference(frame).crown;
    for (let x = 185; x < 215; x++) frame.mask!.data[12 * 400 + x] = 1;
    expect(bodyReference(frame).crown).toBe(expected);
  });
  it("does not let a single wide mask row inflate a torso width", () => {
    const frame = syntheticCapture();
    const before = robustContourSlice(frame, 0.35, 0.5)!;
    for (let x = 80; x < 320; x++) frame.mask!.data[210 * 400 + x] = 1;
    const after = robustContourSlice(frame, 0.35, 0.5)!;
    expect(after.right - after.left).toBeCloseTo(before.right - before.left, 2);
  });
  it("rejects boundaries whose location depends strongly on mask confidence", () => {
    const frame = syntheticCapture();
    for (let y = 207; y <= 213; y++)
      for (let x = 120; x <= 280; x++)
        frame.mask!.data[y * 400 + x] = x > 160 && x < 240 ? 1 : 0.6;
    expect(robustContourSlice(frame, 0.35, 0.5)).toBeNull();
  });
  it("detects an arm touching a side contour boundary", () => {
    const frame = syntheticCapture(true);
    [12, 14, 16].forEach((i) => (frame.landmarks[i].visibility = 0.1));
    frame.landmarks[13] = { x: 0.6, y: 0.3, visibility: 1 };
    frame.landmarks[15] = { x: 0.6, y: 0.6, visibility: 1 };
    expect(armObscuresSlice(frame, 0.45, { left: 0.4, right: 0.61 })).toBe(
      true,
    );
    expect(armObscuresSlice(frame, 0.45, { left: 0.4, right: 0.5 })).toBe(
      false,
    );
  });
  it("ignores hidden far-side shoulder and hip jitter in circumference levels", () => {
    const front = syntheticCapture(),
      side = syntheticCapture(true);
    [12, 14, 16, 24, 26, 28, 30].forEach(
      (i) => (side.landmarks[i].visibility = 0.1),
    );
    const before = calculateMeasurements(front, side, profile);
    side.landmarks[12].y = 0.1;
    side.landmarks[24].y = 0.8;
    const after = calculateMeasurements(front, side, profile);
    expect(after[6].valueCm).toBe(before[6].valueCm);
    expect(after[8].valueCm).toBe(before[8].valueCm);
  });
  it("resets burst history on bad frames, camera stalls, and scale changes", () => {
    const a = { ...syntheticCapture(), timestamp: 1000 };
    const b = { ...syntheticCapture(), timestamp: 1700 };
    expect(collectStableFrames([a], b, false, true)).toHaveLength(2);
    expect(collectStableFrames([a], b, false, false)).toHaveLength(0);
    expect(
      collectStableFrames([a], { ...b, timestamp: 4000 }, false, true),
    ).toHaveLength(1);
    expect(
      collectStableFrames(
        [a],
        { ...scaledCapture(b, 0.8), timestamp: 1700 },
        false,
        true,
      ),
    ).toHaveLength(1);
  });
  it("uses the median of calibrated observations, suppressing a length outlier", () => {
    const front = syntheticCapture(),
      side = syntheticCapture(true);
    front.samples = Array.from({ length: 5 }, () => syntheticCapture());
    side.samples = Array.from({ length: 5 }, () => syntheticCapture(true));
    front.samples[0].landmarks[11].x -= 0.1;
    const rows = calculateMeasurements(front, side, profile);
    expect(rows[2].valueCm).toBeCloseTo(
      calculateMeasurements(
        syntheticCapture(),
        syntheticCapture(true),
        profile,
      )[2].valueCm!,
      5,
    );
    expect(rows[2].method).toContain("Median of 5");
  });
  it("withholds unstable burst measurements instead of presenting an average", () => {
    const front = syntheticCapture(),
      side = syntheticCapture(true);
    front.samples = Array.from({ length: 5 }, (_, i) => {
      const frame = syntheticCapture();
      frame.landmarks[11].x -= i * 0.025;
      return frame;
    });
    side.samples = Array.from({ length: 5 }, () => syntheticCapture(true));
    expect(calculateMeasurements(front, side, profile)[2].valueCm).toBeNull();
  });
  it("applies reviewed levels and rejects crossed lines", () => {
    const front = syntheticCapture(),
      side = syntheticCapture(true);
    const before = calculateMeasurements(front, side, profile)[21].valueCm!;
    front.levels = { ...defaultLevels, waist: 0.85 };
    side.levels = { ...defaultLevels, waist: 0.85 };
    expect(
      calculateMeasurements(front, side, profile)[21].valueCm,
    ).toBeGreaterThan(before);
    front.levels.waist = 0.15;
    expect(() => calculateMeasurements(front, side, profile)).toThrow(
      "Place chest",
    );
  });
  it("scales dimensions proportionally to entered height without changing angles", () => {
    const a = calculateMeasurements(
      syntheticCapture(),
      syntheticCapture(true),
      profile,
    );
    const b = calculateMeasurements(
      syntheticCapture(),
      syntheticCapture(true),
      { ...profile, heightCm: 192.5 },
    );
    expect(b[2].valueCm! / a[2].valueCm!).toBeCloseTo(1.1, 8);
    expect(b[5].valueCm).toBe(a[5].valueCm);
  });
});
describe("Capture safety", () => {
  it("captures with valid CPU inference slower than 500 ms per frame", () => {
    let machine = {
      ...initialMachine(),
      state: "A_POSE_FRONT" as const,
    } as ReturnType<typeof initialMachine>;
    let captured = false;
    for (let t = 0; t <= 5400; t += 600) {
      const next = advance(machine, true, t);
      machine = next.machine;
      if (next.capture === "front") {
        captured = true;
        break;
      }
    }
    expect(captured).toBe(true);
  });
  it("requires several valid observations even when inference is very slow", () => {
    let machine = {
      ...initialMachine(),
      state: "A_POSE_FRONT" as const,
    } as ReturnType<typeof initialMachine>;
    for (let t = 0; t < 10000; t += 2000) {
      const next = advance(machine, true, t);
      expect(next.capture).toBeUndefined();
      machine = next.machine;
    }
    expect(advance(machine, true, 10000).capture).toBe("front");
  });
  it("does not capture stale frames after a three-second feed gap", () => {
    let machine = {
      ...initialMachine(),
      state: "A_POSE_FRONT" as const,
    } as ReturnType<typeof initialMachine>;
    for (let t = 0; t <= 3000; t += 200)
      machine = advance(machine, true, t).machine;
    const next = advance(machine, true, 6000);
    expect(next.capture).toBeUndefined();
    expect(next.machine.stableMs).toBe(0);
  });
  it("requires a continuous 1.5-second hold plus a 3-second countdown", () => {
    let machine = {
      ...initialMachine(),
      state: "A_POSE_FRONT" as const,
    } as ReturnType<typeof initialMachine>;
    for (let t = 0; t < 4500; t += 100) {
      const next = advance(machine, true, t);
      expect(next.capture).toBeUndefined();
      machine = next.machine;
      if (t === 1500) expect(machine.countdown).toBe(3);
    }
    const next = advance(machine, true, 4500);
    expect(next.capture).toBe("front");
    expect(next.machine.state).toBe("TURN_INSTRUCTION");
  });
  it("resets countdown if the pose is lost", () => {
    let machine = {
      ...initialMachine(),
      state: "A_POSE_FRONT" as const,
    } as ReturnType<typeof initialMachine>;
    for (let t = 0; t <= 3000; t += 100)
      machine = advance(machine, true, t).machine;
    const next = advance(machine, false, 3100);
    expect(next.machine.stableSince).toBeNull();
    expect(next.machine.countdown).toBeNull();
    expect(next.capture).toBeUndefined();
  });
  it("does not count a frozen or backgrounded camera as a stable pose", () => {
    const machine = advance(
      { ...initialMachine(), state: "A_POSE_FRONT" },
      true,
      0,
    ).machine;
    const next = advance(machine, true, 10000);
    expect(next.capture).toBeUndefined();
    expect(next.machine.stableSince).toBeNull();
  });
  it("requires the side capture and transitions to processing", () => {
    let machine = {
      ...initialMachine(),
      state: "TURN_INSTRUCTION" as const,
      turnSince: 0,
    } as ReturnType<typeof initialMachine>;
    expect(advance(machine, true, 3000).machine.state).toBe("TURN_INSTRUCTION");
    for (let t = 4000; t < 8500; t += 100)
      machine = advance(machine, true, t).machine;
    const next = advance(machine, true, 8500);
    expect(next.capture).toBe("side");
    expect(next.machine.state).toBe("PROCESSING");
  });
});
describe("Geometry and honest measurement output", () => {
  it("keeps a completed scan when view sizes differ by 20%, with a review notice", () => {
    const result = createResult(
      syntheticCapture(),
      scaledCapture(syntheticCapture(true), 0.8),
      profile,
    );
    expect(result.measurements).toHaveLength(40);
    expect(result.calibration?.reviewRequired).toBe(true);
    expect(result.calibration?.severeMismatch).toBe(false);
    expect(result.measurements.find((m) => m.id === 7)?.valueCm).not.toBeNull();
    expect(result.measurements.find((m) => m.id === 7)?.method).toContain(
      "confirm this circumference",
    );
  });
  it("does not mistake a camera resolution change for a distance change", () => {
    const front = syntheticCapture(),
      side = syntheticCapture(true);
    const doubled = { ...side, width: side.width * 2, height: side.height * 2 };
    expect(assessCapturePair(front, doubled, 175).reviewRequired).toBe(false);
    const a = calculateMeasurements(front, side, profile),
      b = calculateMeasurements(front, doubled, profile);
    expect(b.find((m) => m.id === 7)?.valueCm).toBeCloseTo(
      a.find((m) => m.id === 7)!.valueCm!,
      6,
    );
  });
  it("preserves front-view lengths but withholds combined circumferences for a severe mismatch", () => {
    const result = createResult(
      syntheticCapture(),
      scaledCapture(syntheticCapture(true), 0.6),
      profile,
    );
    expect(result.calibration?.severeMismatch).toBe(true);
    expect(
      result.measurements.find((m) => m.id === 3)?.valueCm,
    ).toBeGreaterThan(0);
    for (const id of [2, 7, 8, 9, 10, 11, 25, 26]) {
      expect(result.measurements.find((m) => m.id === id)?.valueCm).toBeNull();
      expect(result.measurements.find((m) => m.id === id)?.status).toBe(
        "manual",
      );
    }
  });
  it("still rejects an individually unusable side calibration", () => {
    expect(() =>
      createResult(
        syntheticCapture(),
        { ...syntheticCapture(true), mask: undefined },
        profile,
      ),
    ).toThrow("body contour");
  });
  it.each([true, false])(
    "accepts a complete side profile when the far side is occluded (left visible: %s)",
    (leftVisible) => {
      const frame = syntheticCapture(true);
      const hidden = leftVisible
        ? [12, 14, 16, 24, 26, 28, 30]
        : [11, 13, 15, 23, 25, 27, 29];
      hidden.forEach((i) => (frame.landmarks[i].visibility = 0.1));
      frame.landmarks[hidden[2]].x = 1.1;
      frame.landmarks[hidden[5]].y = 1.2;
      frame.landmarks[hidden[6]].y = 1.3;
      const result = validatePose(frame, true);
      expect(result.valid, result.message).toBe(true);
      expect(calibrate(frame, 175, true).heel).toBeCloseTo(0.94);
    },
  );
  it("does not classify hidden-side landmark jitter as body movement", () => {
    const previous = syntheticCapture(true),
      frame = syntheticCapture(true);
    for (const f of [previous, frame])
      [12, 14, 16, 24, 26, 28, 30].forEach(
        (i) => (f.landmarks[i].visibility = 0.1),
      );
    frame.landmarks[26].x += 0.2;
    frame.landmarks[28].y += 0.3;
    const result = validatePose(frame, true, previous);
    expect(result.valid, result.message).toBe(true);
  });
  it("continues to reject movement of the visible body", () => {
    const previous = syntheticCapture(true),
      frame = syntheticCapture(true);
    frame.landmarks.forEach((p) => (p.x += 0.07));
    expect(
      validatePose(frame, true, previous).checks.find(
        (c) => c.label === "Holding still",
      )?.valid,
    ).toBe(false);
  });
  it("distinguishes uncertain tracking from a cropped body", () => {
    const frame = syntheticCapture(true);
    frame.landmarks[27].visibility = 0.2;
    frame.landmarks[28].visibility = 0.2;
    const result = validatePose(frame, true);
    expect(result.valid).toBe(false);
    expect(result.message).toContain("track");
    expect(result.message).not.toContain("step back");
    expect(
      result.checks.find((c) => c.label === "Full body inside frame")?.valid,
    ).toBe(true);
  });
  it("asks a distant, fully framed person to move closer instead of farther away", () => {
    const frame = syntheticCapture();
    frame.landmarks.forEach((p) => {
      p.x = 0.3 + p.x * 0.4;
      p.y = 0.3 + p.y * 0.4;
    });
    const source = frame.mask!,
      data = new Float32Array(source.data.length);
    for (let y = 0; y < source.height; y++)
      for (let x = 0; x < source.width; x++) {
        const sx = Math.round(((x / source.width - 0.3) / 0.4) * source.width),
          sy = Math.round(((y / source.height - 0.3) / 0.4) * source.height);
        if (sx >= 0 && sx < source.width && sy >= 0 && sy < source.height)
          data[y * source.width + x] = source.data[sy * source.width + sx];
      }
    frame.mask = { ...source, data };
    const result = validatePose(frame, false);
    expect(result.valid).toBe(false);
    expect(result.message).toContain("step closer");
  });
  it("still rejects genuinely cropped feet", () => {
    const frame = syntheticCapture(true);
    [27, 28, 29, 30].forEach((i) => (frame.landmarks[i].y = 1.03));
    const result = validatePose(frame, true);
    expect(result.valid).toBe(false);
    expect(result.message).toContain("feet are near the bottom edge");
  });
  it("accepts visible feet below the old arbitrary 95% ankle cutoff", () => {
    const frame = syntheticCapture();
    frame.landmarks[27].y = 0.955;
    frame.landmarks[28].y = 0.96;
    frame.landmarks[29].y = 0.97;
    frame.landmarks[30].y = 0.975;
    const result = validatePose(frame, false);
    expect(result.valid, result.message).toBe(true);
  });
  it("reduces an ellipse to a circle perimeter", () =>
    expect(ellipsePerimeter(10, 10)).toBeCloseTo(Math.PI * 10, 8));
  it("rejects degenerate ellipses and calibration", () => {
    expect(() => ellipsePerimeter(0, 10)).toThrow();
    expect(() => calibrate(syntheticCapture(), NaN)).toThrow();
    expect(() =>
      calibrate({ ...syntheticCapture(), mask: undefined }, 175),
    ).toThrow();
  });
  it("converts inches without touching canonical cm", () =>
    expect(convert(25.4, "in")).toBeCloseTo(10));
  it("corrects landmark angles for image aspect ratio", () => {
    const origin = { x: 0, y: 0, visibility: 1 };
    expect(
      angle(
        { x: 0, y: 1, visibility: 1 },
        origin,
        { x: 0.5, y: 1, visibility: 1 },
        2,
      ),
    ).toBeCloseTo(45);
  });
  it("returns exactly 40 unique ordered measurement fields", () => {
    const rows = calculateMeasurements(
      syntheticCapture(),
      syntheticCapture(true),
      profile,
    );
    expect(rows).toHaveLength(40);
    expect(rows.map((r) => r.id)).toEqual(
      Array.from({ length: 40 }, (_, i) => i + 1),
    );
    expect(
      rows.every((r) => r.valueCm === null || Number.isFinite(r.valueCm)),
    ).toBe(true);
    expect(rows[0].valueCm).toBe(175);
    expect(rows[23].status).toBe("design");
  });
  it("does not invent hidden anatomical landmarks", () => {
    const rows = calculateMeasurements(
      syntheticCapture(),
      syntheticCapture(true),
      profile,
    );
    for (const id of [13, 14, 21, 27, 28, 29, 39, 40])
      expect(rows.find((r) => r.id === id)?.valueCm).toBeNull();
  });
  it("isolates one connected mask run instead of summing arms", () => {
    const c = syntheticCapture();
    const w = 100,
      h = 100;
    const data = new Float32Array(w * h);
    for (let x = 10; x < 20; x++) data[50 * w + x] = 1;
    for (let x = 40; x < 60; x++) data[50 * w + x] = 1;
    for (let x = 80; x < 90; x++) data[50 * w + x] = 1;
    c.mask = { width: w, height: h, data };
    expect(contourSlice(c, 0.5, 0.5)).toEqual({ left: 0.4, right: 0.59 });
  });
  it("flags multiple people, darkness, and an absent body", () => {
    const frame = syntheticCapture();
    expect(validatePose({ ...frame, people: 2 }, false).valid).toBe(false);
    expect(
      validatePose({ ...frame, brightness: 5 }, false).checks.find(
        (c) => c.label === "Even lighting",
      )?.valid,
    ).toBe(false);
    expect(validatePose({ ...frame, landmarks: [] }, false).valid).toBe(false);
  });
  it("requires profile narrowing and front A-pose independently", () => {
    expect(validatePose(syntheticCapture(), true).valid).toBe(false);
    expect(validatePose(syntheticCapture(true), true).valid).toBe(true);
  });
});
