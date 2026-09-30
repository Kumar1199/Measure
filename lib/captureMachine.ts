import type { CaptureState } from "./types";
export type Machine = {
  state: CaptureState;
  stableSince: number | null;
  lastFrame: number | null;
  countdown: number | null;
  turnSince: number | null;
  stableMs: number;
  stableFrames: number;
};
export const initialMachine = (): Machine => ({
  state: "IDLE",
  stableSince: null,
  lastFrame: null,
  countdown: null,
  turnSince: null,
  stableMs: 0,
  stableFrames: 0,
});
export function advance(
  machine: Machine,
  valid: boolean,
  now: number,
): { machine: Machine; capture?: "front" | "side" } {
  const m = { ...machine };
  if (m.state === "CALIBRATING") m.state = "A_POSE_FRONT";
  if (m.state === "TURN_INSTRUCTION") {
    if (now - (m.turnSince ?? now) < 4000) return { machine: m };
    m.state = "SIDE_PROFILE";
  }
  if (
    !["A_POSE_FRONT", "HOLDING_FRONT", "SIDE_PROFILE", "HOLDING_SIDE"].includes(
      m.state,
    )
  )
    return { machine: m };
  const front = m.state === "A_POSE_FRONT" || m.state === "HOLDING_FRONT";
  // Inference is sequential and can legitimately take >500 ms on a laptop.
  // Allow low inference rates, but never credit an unbounded stall as a hold.
  const elapsed = m.lastFrame === null ? 0 : now - m.lastFrame;
  const gap = elapsed > 2500 || elapsed < 0;
  m.lastFrame = now;
  if (!valid || gap) {
    m.stableSince = null;
    m.countdown = null;
    m.stableMs = 0;
    m.stableFrames = 0;
    m.state = front ? "A_POSE_FRONT" : "SIDE_PROFILE";
    return { machine: m };
  }
  m.stableMs += m.stableSince === null ? 0 : Math.min(elapsed, 1000);
  m.stableSince ??= now;
  m.stableFrames++;
  const held = m.stableMs;
  if (held >= 1500 && m.stableFrames >= 3) {
    m.state = front ? "HOLDING_FRONT" : "HOLDING_SIDE";
    m.countdown = Math.max(1, Math.ceil((4500 - held) / 1000));
  }
  if (held >= 4500 && m.stableFrames >= 6) {
    m.state = front ? "TURN_INSTRUCTION" : "PROCESSING";
    m.turnSince = front ? now : null;
    m.stableSince = null;
    m.countdown = null;
    m.lastFrame = null;
    m.stableMs = 0;
    m.stableFrames = 0;
    return { machine: m, capture: front ? "front" : "side" };
  }
  return { machine: m };
}
