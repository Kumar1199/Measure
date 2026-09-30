"use client";
import { useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  Focus,
  Info,
  Lightbulb,
  LockKeyhole,
  Ruler,
  ScanLine,
  ShieldCheck,
  Shirt,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { CameraViewport } from "@/components/CameraViewport";
import { MeasurementDashboard } from "@/components/MeasurementDashboard";
import { BodyGuide } from "@/components/BodyGuide";
import { createResult } from "@/lib/measurementCalculations";
import { demoResult } from "@/lib/demo";
import type {
  Capture,
  CaptureState,
  Gender,
  Profile,
  ScanResult,
  Unit,
} from "@/lib/types";

export default function Studio() {
  const [height, setHeight] = useState("175"),
    [heightUnit, setHeightUnit] = useState<Unit>("cm"),
    [unit, setUnit] = useState<Unit>("cm"),
    [gender, setGender] = useState<Gender>("Unisex");
  const [shirtLength, setShirtLength] = useState("75"),
    [clearance, setClearance] = useState("2");
  const [state, setState] = useState<CaptureState>("IDLE"),
    [active, setActive] = useState(false),
    [result, setResult] = useState<ScanResult | null>(null),
    [error, setError] = useState(""),
    [help, setHelp] = useState(false),
    [preferences, setPreferences] = useState(false),
    [sessionKey, setSessionKey] = useState(0);
  const heightCm = heightUnit === "cm" ? Number(height) : Number(height) * 2.54;
  const valid =
    height.trim() !== "" &&
    Number.isFinite(heightCm) &&
    heightCm >= 100 &&
    heightCm <= 230 &&
    Number(shirtLength) >= 30 &&
    Number(shirtLength) <= 160 &&
    Number(clearance) >= 0 &&
    Number(clearance) <= 15;
  const profile: Profile = {
    heightCm,
    unit,
    gender,
    shirtLengthCm: Number(shirtLength),
    shoeClearanceCm: Number(clearance),
  };
  const side = [
    "TURN_INSTRUCTION",
    "SIDE_PROFILE",
    "HOLDING_SIDE",
    "PROCESSING",
  ].includes(state);
  const complete = (front: Capture, sideCapture: Capture) => {
    try {
      setError("");
      setResult(createResult(front, sideCapture, profile));
      setState("RESULTS");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The scan could not be measured. Please retry.",
      );
      setState("IDLE");
      setSessionKey((k) => k + 1);
    }
  };
  const reset = () => {
    setResult(null);
    setState("IDLE");
    setActive(false);
    setError("");
    setSessionKey((k) => k + 1);
  };
  return (
    <div className="app-shell">
      <aside className="sidebar no-print">
        <a className="brand" href="/" aria-label="Form studio home">
          <span className="brand-icon">
            <ScanLine size={22} />
          </span>
          form<span className="brand-period">.</span>
        </a>
        <span className="brand-caption">THE PERSONAL FITTING STUDIO</span>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          <button
            className={!result ? "nav-item selected" : "nav-item"}
            onClick={() => {
              if (!result) return;
              reset();
            }}
          >
            <ScanLine size={18} /> Body scan <span>01</span>
          </button>
          <button
            className={result ? "nav-item selected" : "nav-item"}
            disabled={!result}
            onClick={() =>
              document
                .querySelector(".results")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            <Ruler size={18} /> Measurements {result && <span>40</span>}
          </button>
          <button className="nav-item" onClick={() => setPreferences(true)}>
            <SlidersHorizontal size={18} /> Fit preferences
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <span className="privacy-icon">
              <ShieldCheck size={19} />
            </span>
            <strong>Your body. Your data.</strong>
            <p>
              Every frame is processed on your device. No uploads. No storage.
            </p>
            <span>
              PRIVACY BY DESIGN <LockKeyhole size={10} />
            </span>
          </div>
          <button className="nav-item help-link" onClick={() => setHelp(true)}>
            <CircleHelp size={17} /> Studio guide <ArrowUpRight size={14} />
          </button>
          <div className="sidebar-footer">
            <span className="avatar">F</span>
            <div>
              Personal workspace<small>Made to measure. Made for you.</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar no-print">
          <div>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{result ? "Measurements" : "Body scan"}</strong>
          </div>
          <div className="topbar-right">
            <span className="local-badge">
              <span className="status-dot live" /> LOCAL PROCESSING
            </span>
            <button
              className="icon-button"
              onClick={() => setHelp(true)}
              aria-label="Open studio guide"
            >
              <CircleHelp size={19} />
            </button>
            <span className="avatar">M</span>
          </div>
        </header>
        <main>
          {result ? (
            <MeasurementDashboard
              key={result.capturedAt}
              result={result}
              onReset={reset}
            />
          ) : (
            <>
              <div className="section-heading">
                <div>
                  <div className="eyebrow accent">
                    <span className="tiny-line" /> A NEW STANDARD OF FIT
                  </div>
                  <h1>
                    Great fit starts here<span>.</span>
                  </h1>
                  <p>
                    Your measurements, thoughtfully captured. Just you and your
                    camera.
                  </p>
                </div>
                <button
                  className="sample-link"
                  onClick={() => {
                    setResult(
                      demoResult(
                        valid
                          ? profile
                          : {
                              heightCm: 175,
                              unit,
                              gender,
                              shirtLengthCm: 75,
                              shoeClearanceCm: 2,
                            },
                      ),
                    );
                    setState("RESULTS");
                  }}
                  disabled={active}
                >
                  Explore sample results <ArrowUpRight size={16} />
                </button>
              </div>
              <div className="journey">
                <div className={`journey-step ${!side ? "current" : "done"}`}>
                  <span>{side ? <Check size={14} /> : "01"}</span>
                  <div>
                    <strong>Your profile</strong>
                    <small>A little context for your fit</small>
                  </div>
                </div>
                <div className="journey-line" />
                <div className={`journey-step ${active ? "current" : ""}`}>
                  <span>02</span>
                  <div>
                    <strong>Capture your pose</strong>
                    <small>Front view, then side view</small>
                  </div>
                </div>
                <div className="journey-line" />
                <div className="journey-step">
                  <span>03</span>
                  <div>
                    <strong>Meet your measurements</strong>
                    <small>40 dimensions. One clear picture.</small>
                  </div>
                </div>
              </div>
              <div className="studio-grid">
                <div className="capture-column">
                  <div className="panel-heading">
                    <h2>
                      <Focus size={17} /> Your fitting room
                    </h2>
                    <span>EST. 2 MIN</span>
                  </div>
                  <CameraViewport
                    key={sessionKey}
                    disabled={!valid}
                    onComplete={complete}
                    onState={setState}
                    onActive={setActive}
                  />
                  <div className="capture-steps">
                    <div className={!side ? "selected" : "complete"}>
                      <span className="pose-thumb">
                        <BodyGuide compact />
                      </span>
                      <div>
                        <strong>
                          01 <span>Front view</span>
                        </strong>
                        <small>
                          {side
                            ? "Captured successfully"
                            : "Arms relaxed into an A-pose"}
                        </small>
                      </div>
                      {side ? (
                        <Check size={17} />
                      ) : (
                        <span className="step-tag">
                          {active ? "IN PROGRESS" : "UP FIRST"}
                        </span>
                      )}
                    </div>
                    <div className={side ? "selected" : ""}>
                      <span className="pose-thumb">
                        <BodyGuide compact side />
                      </span>
                      <div>
                        <strong>
                          02 <span>Side view</span>
                        </strong>
                        <small>Turn 90° to your right</small>
                      </div>
                      {side ? (
                        <span className="step-tag">IN PROGRESS</span>
                      ) : (
                        <LockKeyhole size={13} />
                      )}
                    </div>
                  </div>
                  {error && (
                    <div className="inline-error" role="alert">
                      {error}
                    </div>
                  )}
                </div>
                <aside className="setup-column">
                  <section className="profile-card">
                    <div className="card-heading">
                      <span className="eyebrow">01 / THE BASICS</span>
                      <button
                        className="icon-button"
                        aria-label="Open fit preferences"
                        onClick={() => setPreferences(true)}
                      >
                        <SlidersHorizontal size={16} />
                      </button>
                    </div>
                    <h2>Let’s get to know you.</h2>
                    <p>Your height is our reference for every measurement.</p>
                    <fieldset disabled={active}>
                      <label htmlFor="height" className="field-label">
                        Your height <span>Without shoes</span>
                      </label>
                      <div className="height-input">
                        <input
                          id="height"
                          type="number"
                          step="0.1"
                          value={height}
                          aria-describedby={!valid ? "height-error" : undefined}
                          onChange={(e) => setHeight(e.target.value)}
                        />
                        <div className="unit-switch">
                          {(["cm", "in"] as const).map((u) => (
                            <button
                              key={u}
                              className={heightUnit === u ? "selected" : ""}
                              aria-pressed={heightUnit === u}
                              onClick={() => {
                                if (u !== heightUnit) {
                                  setHeight(
                                    (u === "cm"
                                      ? Number(height) * 2.54
                                      : Number(height) / 2.54
                                    ).toFixed(1),
                                  );
                                  setHeightUnit(u);
                                }
                              }}
                            >
                              {u}
                            </button>
                          ))}
                        </div>
                      </div>
                      {!valid && (
                        <span className="field-error" id="height-error">
                          Use a height of 100–230 cm and valid fit preferences.
                        </span>
                      )}
                      <label className="field-label">
                        Fit profile <span>For garment allowances</span>
                      </label>
                      <div className="gender-options">
                        {(["Men", "Women", "Unisex"] as const).map((g) => (
                          <button
                            key={g}
                            aria-pressed={gender === g}
                            onClick={() => setGender(g)}
                            className={gender === g ? "selected" : ""}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                      <label className="field-label">Measurement unit</label>
                      <div className="output-options">
                        <button
                          aria-pressed={unit === "cm"}
                          className={unit === "cm" ? "selected" : ""}
                          onClick={() => setUnit("cm")}
                        >
                          <span className="radio-dot" />
                          Centimeters <small>cm</small>
                        </button>
                        <button
                          aria-pressed={unit === "in"}
                          className={unit === "in" ? "selected" : ""}
                          onClick={() => setUnit("in")}
                        >
                          <span className="radio-dot" />
                          Inches <small>in</small>
                        </button>
                      </div>
                    </fieldset>
                    <div className="profile-foot">
                      <LockKeyhole size={12} /> Your profile stays in this
                      session.
                    </div>
                  </section>
                  <section className="ready-card">
                    <div className="card-heading">
                      <h3>A few things before you start</h3>
                      <Sparkles size={16} />
                    </div>
                    <div className="tip">
                      <span>
                        <Shirt size={17} />
                      </span>
                      <div>
                        <strong>Keep it close-fitting</strong>
                        <p>
                          Fitted clothing helps us see your natural silhouette.
                        </p>
                      </div>
                    </div>
                    <div className="tip">
                      <span>
                        <Lightbulb size={17} />
                      </span>
                      <div>
                        <strong>Find your light</strong>
                        <p>
                          Face a light source with a clear, plain background.
                        </p>
                      </div>
                    </div>
                    <div className="tip">
                      <span>
                        <ScanLine size={17} />
                      </span>
                      <div>
                        <strong>Give yourself some space</strong>
                        <p>
                          Stand 2–3 meters away. Keep the camera level, around
                          waist height.
                        </p>
                      </div>
                    </div>
                    <button
                      className="guide-link"
                      onClick={() => setHelp(true)}
                    >
                      View the capture guide <ArrowRight size={14} />
                    </button>
                  </section>
                </aside>
              </div>
              <section className="feature-strip">
                <div>
                  <span className="feature-number">40</span>
                  <div>
                    <strong>Dimensions of you</strong>
                    <p>From shoulder to hem.</p>
                  </div>
                </div>
                <div>
                  <span className="feature-icon">
                    <ScanLine size={23} />
                  </span>
                  <div>
                    <strong>Two views. A fuller picture.</strong>
                    <p>Guided by sight and sound.</p>
                  </div>
                </div>
                <div>
                  <span className="feature-icon">
                    <ShieldCheck size={23} />
                  </span>
                  <div>
                    <strong>Private by nature</strong>
                    <p>Your camera. Your device. Your data.</p>
                  </div>
                </div>
              </section>
              <div className="bottom-note">
                <span>PRECISION BEGINS WITH A GOOD FOUNDATION.</span>
                <span>
                  Camera estimates · Confirm before cutting{" "}
                  <ArrowDown size={12} />
                </span>
              </div>
            </>
          )}
        </main>
        <footer className="page-footer no-print">
          <span>
            form. <span>Considered technology. Better-fitting clothes.</span>
          </span>
          <span>DESIGNED AROUND YOU</span>
        </footer>
      </div>
      {(help || preferences) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setHelp(false);
            setPreferences(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setHelp(false);
                setPreferences(false);
              }
              if (e.key === "Tab") {
                const nodes = Array.from(
                  e.currentTarget.querySelectorAll<HTMLElement>(
                    "button:not(:disabled), input:not(:disabled)",
                  ),
                );
                const first = nodes[0],
                  last = nodes[nodes.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last?.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <button
              autoFocus
              className="icon-button modal-close"
              aria-label="Close dialog"
              onClick={() => {
                setHelp(false);
                setPreferences(false);
              }}
            >
              <X size={20} />
            </button>
            <div className="eyebrow accent">THE FORM STUDIO</div>
            <h2 id="modal-title">
              {help
                ? "A little preparation. A better scan."
                : "Make the fit your own."}
            </h2>
            {help ? (
              <>
                <ol className="guide-list">
                  <li>
                    Use a level, stationary camera and even light. Wear fitted
                    clothes, remove shoes, and make sure your head and feet fit
                    in the frame.
                  </li>
                  <li>
                    Enter your barefoot height. Enable the camera and allow
                    permission. Stand with your arms 30–45° from your sides and
                    your feet slightly apart.
                  </li>
                  <li>
                    Hold still for 1.5 seconds, then through the 3-second
                    countdown. If you move, the timer restarts.
                  </li>
                  <li>
                    Turn right by 90°, lower your arms, and stay on the same
                    floor mark. Hold for the second capture.
                  </li>
                  <li>
                    Review the estimates, enter missing measurements, and print
                    or export your sheet. Select “Save as PDF” in your print
                    dialog.
                  </li>
                </ol>
                <div className="result-note">
                  <Info size={18} />
                  <p>
                    This is an estimation tool, not a validated fitting
                    instrument. Two views cannot observe back creases, crotch
                    contours, or the middle fingertip. Those fields need a tape
                    measurement.
                  </p>
                </div>
                <p className="muted">
                  Frames and profiles stay in memory and are discarded when you
                  leave or start again. Nothing is uploaded.
                </p>
              </>
            ) : (
              <>
                <p>
                  These garment choices are separate from your body
                  measurements. All values below are in centimeters.
                </p>
                <fieldset disabled={active || !!result}>
                  <label className="field-label" htmlFor="shirt-length">
                    Desired shirt / kurta length (cm)
                  </label>
                  <input
                    className="plain-input"
                    id="shirt-length"
                    type="number"
                    min="30"
                    max="160"
                    value={shirtLength}
                    onChange={(e) => setShirtLength(e.target.value)}
                  />
                  <label className="field-label" htmlFor="clearance">
                    Trouser shoe clearance (cm)
                  </label>
                  <input
                    className="plain-input"
                    id="clearance"
                    type="number"
                    min="0"
                    max="15"
                    step="0.5"
                    value={clearance}
                    onChange={(e) => setClearance(e.target.value)}
                  />
                </fieldset>
                <p className="muted">
                  {active || result
                    ? "Start a new scan to change these preferences."
                    : "The selected fit profile supplies adjustable starting allowances for chest, waist, hips, and rise in your results."}
                </p>
              </>
            )}
            <button
              className="button primary"
              onClick={() => {
                setHelp(false);
                setPreferences(false);
              }}
            >
              Got it <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
