"use client";
import { useState } from "react";
import type { Capture, CaptureLevels } from "@/lib/types";
import { defaultLevels, levelY } from "@/lib/captureQuality";
import { bodyReference } from "@/lib/bodyReference";

const labels = {
  chest: "Chest",
  waist: "Natural waist",
  hip: "Fullest hip / seat",
};
const colors = { chest: "#b1d0b5", waist: "#f1c38a", hip: "#c8b9ef" };

export function CaptureReview({
  captures,
  heightCm,
  onComplete,
  onRetake,
}: {
  captures: [Capture, Capture];
  heightCm: number;
  onComplete: (front: Capture, side: Capture) => void;
  onRetake: () => void;
}) {
  const [levels, setLevels] = useState<CaptureLevels[]>([
    { ...defaultLevels },
    { ...defaultLevels },
  ]);
  const [confirmed, setConfirmed] = useState(false);
  const [offsets, setOffsets] = useState([
    { crown: 0, heel: 0 },
    { crown: 0, heel: 0 },
  ]);
  const ordered = levels.every(
    (l) => l.waist - l.chest >= 0.1 && l.hip - l.waist >= 0.1,
  );
  return (
    <section className="capture-review">
      <div className="eyebrow">CHECK YOUR CAPTURE</div>
      <h1>Check the measurement lines.</h1>
      <p>
        Height reference: <strong>{heightCm.toFixed(1)} cm, barefoot.</strong>{" "}
        Align the dashed lines with the top of your head (excluding raised hair)
        and the floor beneath your feet. Use the height reference controls below
        if needed. Retake if either endpoint is outside the image, or if you
        wore shoes.
      </p>
      <p>
        Move the colored lines to the same anatomical level in both views:
        fullest chest, natural waist, and fullest hip / seat. Clothing must
        follow your body; check that an arm is not extending the side outline at
        these levels.
      </p>
      <div className="capture-review-grid">
        {captures.map((capture, index) => {
          const current = { ...capture, levels: levels[index] };
          const reference = bodyReference(capture, index === 1);
          return (
            <div className="profile-card" key={index}>
              <h2>{index === 0 ? "Front view" : "Side view"}</h2>
              <div className="capture-review-image">
                {/* Local in-memory data URL; never uploaded. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={capture.image}
                  alt={`${index === 0 ? "Front" : "Side"} capture for measurement review`}
                />
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  {[reference.crown, reference.heel].map(
                    (y, i) =>
                      y !== null && (
                        <line
                          key={i}
                          x1="0"
                          x2="100"
                          y1={
                            (y + offsets[index][i === 0 ? "crown" : "heel"]) *
                            100
                          }
                          y2={
                            (y + offsets[index][i === 0 ? "crown" : "heel"]) *
                            100
                          }
                          stroke="white"
                          strokeWidth="0.3"
                          strokeDasharray="1 1"
                        />
                      ),
                  )}
                  {(Object.keys(labels) as (keyof CaptureLevels)[]).map(
                    (key) => (
                      <line
                        key={key}
                        x1="0"
                        x2="100"
                        y1={levelY(current, index === 1, key) * 100}
                        y2={levelY(current, index === 1, key) * 100}
                        stroke={colors[key]}
                        strokeWidth="0.5"
                      />
                    ),
                  )}
                </svg>
              </div>
              <details>
                <summary>Adjust height reference</summary>
                {(["crown", "heel"] as const).map((key) => (
                  <label className="review-slider" key={key}>
                    {key === "crown" ? "Top of head" : "Floor beneath feet"}
                    <input
                      type="range"
                      aria-label={`${index === 0 ? "Front" : "Side"} ${key === "crown" ? "head" : "floor"} reference`}
                      min="-0.05"
                      max="0.05"
                      step="0.001"
                      value={offsets[index][key]}
                      onChange={(e) => {
                        setConfirmed(false);
                        setOffsets((previous) =>
                          previous.map((v, i) =>
                            i === index
                              ? { ...v, [key]: Number(e.target.value) }
                              : v,
                          ),
                        );
                      }}
                    />
                  </label>
                ))}
              </details>
              {(Object.keys(labels) as (keyof CaptureLevels)[]).map((key) => (
                <label
                  className="review-slider"
                  key={key}
                  style={{ color: colors[key] }}
                >
                  {labels[key]}
                  <input
                    type="range"
                    aria-label={`${index === 0 ? "Front" : "Side"} ${labels[key]} level`}
                    min={key === "chest" ? 0.05 : key === "waist" ? 0.4 : 0.8}
                    max={key === "chest" ? 0.55 : key === "waist" ? 1 : 1.4}
                    step="0.01"
                    value={levels[index][key]}
                    onChange={(e) => {
                      setConfirmed(false);
                      setLevels((previous) =>
                        previous.map((l, i) =>
                          i === index
                            ? { ...l, [key]: Number(e.target.value) }
                            : l,
                        ),
                      );
                    }}
                  />
                </label>
              ))}
            </div>
          );
        })}
      </div>
      {!ordered && (
        <p role="alert">
          Keep chest above waist and waist above hips, with space between the
          lines.
        </p>
      )}
      <label className="review-confirm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />{" "}
        I checked my height, head and heels, and the measurement lines in both
        views.
      </label>
      <div className="review-actions">
        <button
          className="button primary"
          disabled={!confirmed || !ordered}
          onClick={() =>
            onComplete(
              { ...captures[0], levels: levels[0], heightOffsets: offsets[0] },
              { ...captures[1], levels: levels[1], heightOffsets: offsets[1] },
            )
          }
        >
          Calculate measurements
        </button>
        <button className="button" onClick={onRetake}>
          Retake scan
        </button>
      </div>
      <p>
        Review improves placement; it does not verify circumference accuracy.
        Unclear measurements will require tape confirmation.
      </p>
    </section>
  );
}
