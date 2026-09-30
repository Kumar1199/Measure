import { Check, Circle, ScanLine } from "lucide-react";
import type { Validation } from "@/lib/types";
export function PoseGuidanceOverlay({
  validation,
  countdown,
  active,
  progress,
  analysisMs,
}: {
  validation: Validation | null;
  countdown: number | null;
  active: boolean;
  progress: number;
  analysisMs: number;
}) {
  if (!active) return null;
  return (
    <>
      <div
        className={`guidance-banner ${validation?.valid ? "valid" : "invalid"}`}
        role="status"
      >
        <ScanLine size={17} />
        {countdown
          ? `Hold still. Capturing in ${countdown}…`
          : (validation?.message ?? "Finding your pose…")}
      </div>
      {countdown && (
        <div className="countdown" aria-hidden="true">
          {countdown}
        </div>
      )}
      <div className="capture-progress">
        <div>
          <span>
            {validation?.valid
              ? countdown
                ? "Capturing shortly — keep still"
                : "Pose ready — stabilizing"
              : "Waiting for a valid pose"}
          </span>
          <span>{Math.round(progress)}%</span>
        </div>
        <progress
          aria-label="Capture hold progress"
          value={progress}
          max={100}
        />
        {analysisMs > 500 && (
          <small>
            Analysis is taking {(analysisMs / 1000).toFixed(1)}s per frame. Keep
            holding; progress continues.
          </small>
        )}
      </div>
      <div className="live-checks">
        {validation?.checks.map((check) => (
          <span key={check.label} className={check.valid ? "passed" : ""}>
            {check.valid ? <Check size={12} /> : <Circle size={10} />}{" "}
            {check.label}
          </span>
        ))}
      </div>
    </>
  );
}
