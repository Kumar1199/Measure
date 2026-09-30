"use client";
import { useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  RotateCcw,
  ShieldCheck,
  Volume2,
  VolumeX,
  Maximize,
  LoaderCircle,
} from "lucide-react";
import { BodyGuide } from "./BodyGuide";
import { PoseGuidanceOverlay } from "./PoseGuidanceOverlay";
import { PoseDetector } from "@/lib/poseDetector";
import { voiceDirector } from "@/lib/voiceDirector";
import { advance, initialMachine, type Machine } from "@/lib/captureMachine";
import { validatePose } from "@/lib/poseValidation";
import type { Capture, CaptureState, Frame, Validation } from "@/lib/types";

const connections = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
  [27, 29],
  [28, 30],
  [29, 31],
  [30, 32],
];
export function CameraViewport({
  onComplete,
  onState,
  disabled,
  onActive,
}: {
  onComplete: (front: Capture, side: Capture) => void;
  onState: (state: CaptureState) => void;
  disabled: boolean;
  onActive: (value: boolean) => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    panel = useRef<HTMLDivElement>(null);
  const stream = useRef<MediaStream | null>(null),
    detector = useRef<PoseDetector | null>(null),
    running = useRef(false),
    session = useRef(0),
    starting = useRef(false);
  const machine = useRef<Machine>(initialMachine()),
    front = useRef<Capture | null>(null),
    previous = useRef<Frame | undefined>(undefined),
    countdownRef = useRef<number | null>(null);
  const [state, setState] = useState<CaptureState>("IDLE"),
    [validation, setValidation] = useState<Validation | null>(null),
    [countdown, setCountdown] = useState<number | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [analysisMs, setAnalysisMs] = useState(0);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [muted, setMuted] = useState(false);
  const stop = () => {
    session.current++;
    running.current = false;
    starting.current = false;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    detector.current?.close();
    detector.current = null;
    voiceDirector.stop();
    if (video.current) video.current.srcObject = null;
  };
  const reset = () => {
    stop();
    machine.current = initialMachine();
    front.current = null;
    previous.current = undefined;
    countdownRef.current = null;
    setState("IDLE");
    onState("IDLE");
    setLoading(false);
    setValidation(null);
    setCountdown(null);
    setHoldProgress(0);
    setAnalysisMs(0);
    onActive(false);
  };
  // A hidden tab cannot maintain an uninterrupted hold or leave the camera running.
  useEffect(() => {
    const hidden = () => {
      if (document.hidden && (running.current || starting.current)) {
        reset();
        setError(
          "Capture paused because the page was hidden. Start again when you are ready.",
        );
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", hidden);
    };
    // Callbacks are only used to report status, not to own the camera lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    reset();
    starting.current = true;
    setError("");
    setLoading(true);
    onActive(true);
    const token = session.current;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Camera access requires HTTPS or localhost and a browser with camera support.",
        );
      if (!("OffscreenCanvas" in window) || !("createImageBitmap" in window))
        throw new Error(
          "This browser does not support local pose analysis. Use an updated Chrome, Edge, or Safari.",
        );
      voiceDirector.speak(
        "Please step back until your whole body is visible on screen.",
        true,
      );
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 60 },
          facingMode: "user",
        },
      });
      if (token !== session.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      for (const track of media.getVideoTracks())
        track.onended = () => {
          if (running.current) {
            reset();
            setError("The camera disconnected. Reconnect it and start again.");
          }
        };
      const v = video.current!;
      v.srcObject = media;
      await v.play();
      if (token !== session.current) return;
      const pose = new PoseDetector();
      detector.current = pose;
      await pose.initialize();
      if (token !== session.current) return;
      running.current = true;
      starting.current = false;
      setLoading(false);
      machine.current = { ...initialMachine(), state: "CALIBRATING" };
      setState("CALIBRATING");
      onState("CALIBRATING");
      let lastTime = -1;
      const loop = async () => {
        if (!running.current || token !== session.current) return;
        try {
          if (!v.videoWidth || lastTime === v.currentTime) {
            requestAnimationFrame(loop);
            return;
          }
          lastTime = v.currentTime;
          // Retain the exact high-resolution analyzed frame for capture, avoiding a
          // moving live-video frame paired with landmarks from an earlier image.
          const snapshot = document.createElement("canvas");
          snapshot.width = v.videoWidth;
          snapshot.height = v.videoHeight;
          snapshot.getContext("2d")!.drawImage(v, 0, 0);
          // Run inference on a smaller copy. Normalized landmarks/masks still
          // map to the retained, full-resolution snapshot used for measurements.
          const inferenceWidth = Math.min(640, snapshot.width);
          const bitmap = await createImageBitmap(snapshot, {
            resizeWidth: inferenceWidth,
            resizeHeight: Math.round(
              (snapshot.height * inferenceWidth) / snapshot.width,
            ),
            resizeQuality: "high",
          });
          if (!running.current || token !== session.current) {
            bitmap.close();
            return;
          }
          const inferenceStarted = performance.now();
          const detected = await pose.detect(bitmap, inferenceStarted);
          const frame = {
            ...detected,
            width: snapshot.width,
            height: snapshot.height,
          };
          if (!running.current || token !== session.current) return;
          const side = [
            "TURN_INSTRUCTION",
            "SIDE_PROFILE",
            "HOLDING_SIDE",
          ].includes(machine.current.state);
          const result = validatePose(frame, side, previous.current);
          result.checks.push({
            label: "Body contour ready",
            valid: !!frame.mask,
          });
          if (result.valid && !frame.mask) {
            result.valid = false;
            result.message =
              "Finding your body outline. Use a plain background and even lighting.";
          }
          previous.current = frame;
          const next = advance(machine.current, result.valid, frame.timestamp);
          const oldState = machine.current.state;
          machine.current = next.machine;
          setState(next.machine.state);
          onState(next.machine.state);
          setValidation(result);
          setCountdown(next.machine.countdown);
          setHoldProgress(Math.min(100, (next.machine.stableMs / 4500) * 100));
          setAnalysisMs(Math.round(performance.now() - inferenceStarted));
          const c = canvas.current!;
          c.width = frame.width;
          c.height = frame.height;
          const ctx = c.getContext("2d")!;
          ctx.clearRect(0, 0, c.width, c.height);
          ctx.strokeStyle = result.valid
            ? next.machine.countdown
              ? "#aedaad"
              : "#e5bc79"
            : "#f08b7a";
          ctx.fillStyle = ctx.strokeStyle;
          ctx.lineWidth = Math.max(2, c.width / 600);
          const visiblePoints = frame.landmarks.filter(
            (p) => p.visibility > 0.65,
          );
          if (visiblePoints.length > 10) {
            const left =
              Math.max(
                0.01,
                Math.min(...visiblePoints.map((p) => p.x)) - 0.025,
              ) * c.width;
            const right =
              Math.min(
                0.99,
                Math.max(...visiblePoints.map((p) => p.x)) + 0.025,
              ) * c.width;
            const top =
              Math.max(
                0.01,
                Math.min(...visiblePoints.map((p) => p.y)) - 0.065,
              ) * c.height;
            const bottom =
              Math.min(
                0.99,
                Math.max(...visiblePoints.map((p) => p.y)) + 0.02,
              ) * c.height;
            ctx.globalAlpha = 0.5;
            ctx.setLineDash([10, 8]);
            ctx.strokeRect(left, top, right - left, bottom - top);
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
          }
          for (const [a, b] of connections) {
            const p = frame.landmarks[a],
              q = frame.landmarks[b];
            if (!p || !q || Math.min(p.visibility, q.visibility) < 0.5)
              continue;
            ctx.beginPath();
            ctx.moveTo(p.x * c.width, p.y * c.height);
            ctx.lineTo(q.x * c.width, q.y * c.height);
            ctx.stroke();
          }
          for (const p of frame.landmarks)
            if (p.visibility > 0.65) {
              ctx.beginPath();
              ctx.arc(
                p.x * c.width,
                p.y * c.height,
                c.width / 280,
                0,
                Math.PI * 2,
              );
              ctx.fill();
            }
          if (frame.landmarks.length >= 33) {
            const sy = (frame.landmarks[11].y + frame.landmarks[12].y) / 2,
              hy = (frame.landmarks[23].y + frame.landmarks[24].y) / 2;
            const center = (frame.landmarks[23].x + frame.landmarks[24].x) / 2;
            [0.24, 0.72, 1].forEach((fraction, i) => {
              ctx.strokeStyle = ["#b1d0b5", "#d4b387", "#ac9fc7"][i];
              ctx.setLineDash([8, 6]);
              ctx.beginPath();
              ctx.moveTo(
                (center - 0.13) * c.width,
                (sy + (hy - sy) * fraction) * c.height,
              );
              ctx.lineTo(
                (center + 0.13) * c.width,
                (sy + (hy - sy) * fraction) * c.height,
              );
              ctx.stroke();
            });
            ctx.setLineDash([]);
            if (!side) {
              const knee = (frame.landmarks[25].y + frame.landmarks[26].y) / 2;
              ctx.strokeStyle = "#92bfc6";
              ctx.setLineDash([8, 6]);
              ctx.beginPath();
              ctx.moveTo(
                center * c.width,
                (hy + (knee - hy) * 0.23) * c.height,
              );
              ctx.lineTo(
                center * c.width,
                Math.min(frame.landmarks[27].y, frame.landmarks[28].y) *
                  c.height,
              );
              ctx.stroke();
              ctx.setLineDash([]);
            }
          }
          if (next.capture === "front") {
            front.current = {
              ...frame,
              image: snapshot.toDataURL("image/jpeg", 0.92),
            };
            previous.current = undefined;
            voiceDirector.speak(
              "Front view captured. Turn 90 degrees to your right for the side view. Keep your arms relaxed.",
              true,
            );
          } else if (next.capture === "side" && front.current) {
            const sideCapture = {
              ...frame,
              image: snapshot.toDataURL("image/jpeg", 0.92),
            };
            const frontCapture = front.current;
            stop();
            onActive(false);
            onComplete(frontCapture, sideCapture);
            return;
          } else if (
            next.machine.countdown !== null &&
            oldState !== next.machine.state
          )
            voiceDirector.speak("Hold still. Capturing in 3.", true);
          else if (
            next.machine.countdown !== null &&
            next.machine.countdown !== countdownRef.current
          )
            voiceDirector.speak(String(next.machine.countdown), true);
          else if (
            next.machine.state !== "TURN_INSTRUCTION" &&
            next.machine.countdown === null
          )
            voiceDirector.speak(result.message);
          countdownRef.current = next.machine.countdown;
          if (running.current)
            setTimeout(() => requestAnimationFrame(loop), 40);
        } catch (e) {
          if (token === session.current) {
            reset();
            setError(
              e instanceof Error
                ? e.message
                : "Camera analysis failed. Please retry.",
            );
          }
        }
      };
      requestAnimationFrame(loop);
    } catch (e) {
      if (token !== session.current) return;
      reset();
      const name = e instanceof DOMException ? e.name : "";
      setError(
        name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access in your browser settings, then try again."
          : name === "NotFoundError"
            ? "No camera was found. Connect a webcam and try again."
            : name === "NotReadableError"
              ? "Your camera is in use by another app. Close that app and try again."
              : e instanceof Error
                ? e.message
                : "Unable to start the camera.",
      );
    }
  };
  const active = state !== "IDLE";
  return (
    <div className="camera-card" ref={panel}>
      <div className="camera-top">
        <span className="eyebrow">
          <span className={`status-dot ${active ? "live" : ""}`} />
          {loading
            ? "PREPARING CAMERA"
            : active
              ? "LIVE CAMERA"
              : "CAMERA PREVIEW"}
        </span>
        <span className="camera-mode">
          {["SIDE_PROFILE", "HOLDING_SIDE", "TURN_INSTRUCTION"].includes(state)
            ? "02 / SIDE VIEW"
            : "01 / FRONT VIEW"}
        </span>
      </div>
      <div className={`camera-stage ${active || loading ? "streaming" : ""}`}>
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          className="camera-video"
        />
        <canvas ref={canvas} className="skeleton-canvas" />
        {!active && !loading && (
          <>
            <div className="guide-top">YOUR FIT STARTS WITH YOU</div>
            <BodyGuide />
            <div className="guide-floor" />
            <div className="height-marker">
              <span>FULL BODY IN FRAME</span>
            </div>
          </>
        )}
        <div className="frame-corners">
          <i />
          <i />
          <i />
          <i />
        </div>
        <PoseGuidanceOverlay
          validation={validation}
          countdown={countdown}
          active={active && state !== "TURN_INSTRUCTION"}
          progress={holdProgress}
          analysisMs={analysisMs}
        />
        {state === "TURN_INSTRUCTION" && (
          <div className="turn-prompt">
            <RotateCcw size={36} />
            <strong>Front view captured</strong>
            <span>
              Turn 90° to your right.
              <br />
              Relax your arms at your sides.
            </span>
          </div>
        )}
        {loading && (
          <div className="camera-loading">
            <LoaderCircle className="spin" size={30} />
            <strong>Preparing your fitting room</strong>
            <span>Loading the local pose model…</span>
          </div>
        )}
        {!active && !loading && (
          <div className="camera-start">
            <button
              className="button primary"
              onClick={start}
              disabled={disabled}
            >
              <Camera size={17} /> Enable camera <span>↗</span>
            </button>
            <p>Your camera stays off until you’re ready.</p>
          </div>
        )}
        {error && (
          <div className="camera-error" role="alert">
            <CameraOff size={18} />
            <span>{error}</span>
          </div>
        )}
      </div>
      <div className="camera-bottom">
        <span>
          <ShieldCheck size={15} /> Private, on-device processing
        </span>
        <div>
          <button
            className="icon-button"
            aria-label={muted ? "Enable voice guidance" : "Mute voice guidance"}
            aria-pressed={muted}
            onClick={() => {
              setMuted(!muted);
              voiceDirector.enabled = muted;
              if (!muted) voiceDirector.stop();
            }}
          >
            {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
          <button
            className="icon-button"
            aria-label="Expand camera preview"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else
                void panel.current
                  ?.requestFullscreen?.()
                  .catch(() =>
                    setError("Fullscreen is not available in this browser."),
                  );
            }}
          >
            <Maximize size={16} />
          </button>
          {(active || loading) && (
            <button className="text-button" onClick={reset}>
              Cancel scan
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
