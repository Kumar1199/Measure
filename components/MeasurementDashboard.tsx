"use client";
import { useState } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  FileDown,
  Info,
  Pencil,
  RotateCcw,
  Ruler,
} from "lucide-react";
import { convert, fitProfiles } from "@/lib/measurementCalculations";
import type { Measurement, ScanResult, Unit } from "@/lib/types";
import { BodyGuide } from "./BodyGuide";
export function MeasurementDashboard({
  result,
  onReset,
}: {
  result: ScanResult;
  onReset: () => void;
}) {
  const [tab, setTab] = useState<Measurement["category"]>("upper"),
    [unit, setUnit] = useState<Unit>(result.profile.unit);
  const [measurements, setMeasurements] = useState(result.measurements),
    [copied, setCopied] = useState(false),
    [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<number | null>(null),
    [input, setInput] = useState("");
  const format = (m: Measurement) =>
    m.valueCm === null
      ? "—"
      : (m.degrees ? m.valueCm : convert(m.valueCm, unit)).toFixed(1);
  const exportData = () => ({
    schemaVersion: 1,
    ...result,
    measurements,
    outputUnit: unit,
    fitAllowancesCm: fitProfiles[result.profile.gender],
    disclaimer:
      "Camera estimates are not validated for cutting. Confirm critical dimensions with a tape. Null values require manual input.",
  });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(exportData(), null, 2),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setNotice(
        "Clipboard access is unavailable. Use Download JSON to save your specification.",
      );
    }
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(exportData(), null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `form-${result.demo ? "sample" : "measurements"}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const save = (m: Measurement) => {
    const parsed = Number(input),
      value = m.degrees ? parsed : unit === "in" ? parsed * 2.54 : parsed;
    if (
      !input.trim() ||
      !Number.isFinite(value) ||
      value < (m.degrees ? 0 : 0.1) ||
      value > (m.degrees ? 90 : 300)
    ) {
      setNotice(
        "Enter a valid positive measurement (up to 300 cm), or an angle from 0–90°.",
      );
      return;
    }
    setMeasurements((old) => {
      const next = old.map((row) =>
        row.id === m.id
          ? {
              ...row,
              valueCm: value,
              status: "reference" as const,
              method: "Manually entered / confirmed by user.",
            }
          : row,
      );
      if (m.id === 27 || m.id === 28) {
        const a = next.find((r) => r.id === 27)!,
          b = next.find((r) => r.id === 28)!;
        if (a.valueCm !== null && b.valueCm !== null)
          return next.map((row) =>
            row.id === 29
              ? {
                  ...row,
                  valueCm: a.valueCm! + b.valueCm!,
                  status: "reference" as const,
                  method: "Sum of manually entered front and back rise.",
                }
              : row,
          );
      }
      return next;
    });
    setEditing(null);
    setNotice("Measurement updated.");
  };
  const manual = measurements.filter((m) => m.valueCm === null).length;
  return (
    <section className="results">
      <div className="section-heading">
        <div>
          <div className="eyebrow accent">
            {result.demo
              ? "SAMPLE SPECIFICATION"
              : "YOUR PERSONAL SPECIFICATION"}
          </div>
          <h1>
            A better fit, by the numbers<span>.</span>
          </h1>
          <p>
            {result.demo
              ? "Explore a synthetic sample. These are not your body measurements."
              : "Your two-view scan is complete. Review and confirm your measurements."}
          </p>
        </div>
        <button className="button secondary no-print" onClick={onReset}>
          <RotateCcw size={15} /> New scan
        </button>
      </div>
      <div className="result-overview">
        <div className="result-figure">
          <BodyGuide compact />
          <div>
            <span className="eyebrow">
              {result.demo
                ? "DEMO PROFILE"
                : `${result.profile.gender.toUpperCase()} FIT PROFILE`}
            </span>
            <strong>
              {convert(result.profile.heightCm, unit).toFixed(1)}{" "}
              <small>{unit}</small>
            </strong>
            <span>Calibrated height</span>
          </div>
        </div>
        <div className="result-stat">
          <span>MEASUREMENTS</span>
          <strong>40</strong>
          <p>A complete tailoring checklist</p>
        </div>
        <div className="result-stat">
          <span>TO CONFIRM MANUALLY</span>
          <strong>{manual.toString().padStart(2, "0")}</strong>
          <p>Fill in the missing dimensions below</p>
        </div>
      </div>
      <div className="result-note">
        <Info size={18} />
        <p>
          Camera-derived values are <strong>estimates</strong>. Clothing,
          perspective, and inferred anatomical levels affect accuracy. Confirm
          with a tape before cutting fabric. Fit allowances are separate from
          body measurements.
        </p>
      </div>
      {result.calibration?.reviewRequired && (
        <div
          className="result-note calibration-note"
          role="status"
          style={{ marginTop: 12 }}
        >
          <Info size={18} />
          <p>
            <strong>
              Calibration review ·{" "}
              {Math.round(result.calibration.relativeDifference * 100)}%
              difference.
            </strong>{" "}
            {result.calibration.message}
          </p>
        </div>
      )}
      <div className="results-toolbar no-print">
        <div className="tabs" role="tablist" aria-label="Measurement category">
          {(
            [
              ["upper", "Upper body"],
              ["lower", "Lower body"],
              ["full", "Full body / lengths"],
            ] as const
          ).map(([id, label]) => (
            <button
              role="tab"
              aria-selected={tab === id}
              key={id}
              onClick={() => {
                setTab(id);
                setEditing(null);
              }}
              className={tab === id ? "selected" : ""}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="unit-switch" aria-label="Measurement output unit">
          <button
            aria-pressed={unit === "cm"}
            className={unit === "cm" ? "selected" : ""}
            onClick={() => {
              setUnit("cm");
              setEditing(null);
            }}
          >
            cm
          </button>
          <button
            aria-pressed={unit === "in"}
            className={unit === "in" ? "selected" : ""}
            onClick={() => {
              setUnit("in");
              setEditing(null);
            }}
          >
            in
          </button>
        </div>
      </div>
      <div className="measurement-table">
        <div className="table-heading">
          <span>MEASUREMENT</span>
          <span>VALUE</span>
          <span>METHOD / STATUS</span>
          <span className="no-print" />
        </div>
        {measurements.map((m) => (
          <div
            key={m.id}
            className={`measurement-row ${tab !== m.category ? "inactive-category" : ""}`}
          >
            <div className="measurement-name">
              <span className="row-number">
                {String(m.id).padStart(2, "0")}
              </span>
              <span>{m.name}</span>
            </div>
            <div className="measurement-value">
              {editing === m.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    save(m);
                  }}
                >
                  <input
                    autoFocus
                    aria-label={`Enter ${m.name}`}
                    type="number"
                    step="0.1"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                  />
                  <button
                    className="icon-button"
                    type="submit"
                    aria-label="Save measurement"
                  >
                    <Check size={16} />
                  </button>
                </form>
              ) : (
                <>
                  {format(m)} <small>{m.degrees ? "°" : unit}</small>
                </>
              )}
            </div>
            <div className="measurement-method">
              <span className={`method-badge ${m.status}`}>
                {m.status === "manual"
                  ? "Needs measurement"
                  : m.status === "estimate"
                    ? "Estimated"
                    : m.status === "design"
                      ? "Design choice"
                      : "Confirmed / entered"}
              </span>
              <p>{m.method}</p>
            </div>
            <button
              className="icon-button no-print"
              aria-label={`Edit ${m.name}`}
              onClick={() => {
                setEditing(editing === m.id ? null : m.id);
                setInput(m.valueCm === null ? "" : format(m));
              }}
            >
              <Pencil size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="ease-panel">
        <Ruler size={20} />
        <div>
          <strong>{result.profile.gender} fit allowances</strong>
          <p>
            Suggested pattern starting points: chest +
            {fitProfiles[result.profile.gender].chestEase} cm · waist +
            {fitProfiles[result.profile.gender].waistEase} cm · hip +
            {fitProfiles[result.profile.gender].hipEase} cm · rise +
            {fitProfiles[result.profile.gender].riseAllowance} cm. Apply and
            refine during fitting; these are not added to the values above.
          </p>
        </div>
      </div>
      <div className="export-bar no-print">
        <span>
          {result.demo ? "Sample sheet" : "Spec sheet"} ·{" "}
          {new Date(result.capturedAt).toLocaleDateString()}
        </span>
        <div>
          <button className="text-button" onClick={download}>
            Download JSON <ArrowUpRight size={14} />
          </button>
          <button className="button secondary" onClick={copy}>
            {copied ? <Check size={15} /> : <Copy size={15} />}{" "}
            {copied ? "Copied" : "Copy JSON"}
          </button>
          <button className="button primary" onClick={() => window.print()}>
            <FileDown size={16} /> Export PDF / Print
          </button>
        </div>
      </div>
      {notice && (
        <div role="status" className="notice">
          {notice}
          <button
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}
    </section>
  );
}
