# FORM — Personal fitting studio

Next.js App Router, TypeScript, Tailwind CSS and MediaPipe application with local pose inference, two-view guided capture, and a 40-field tailoring specification.

## Run

Use **Node.js 22.12 or newer**.

```sh
npm ci
npm run setup:vision
npm run dev
```

Open http://localhost:3000. Camera access requires localhost or HTTPS. Setup downloads Google's pose model and copies the installed MediaPipe WASM files into `public/vision`. Serve these assets with the application; there are no model CDN requests at runtime. `public/vision` is ignored in Git, so run setup in CI before building/deploying too.

```sh
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm start
```

This workspace also has a portable Node 22 executable at `.runtime/node.exe`, because the system Node is older. In PowerShell:

```powershell
$env:Path = 'D:\tailor\.runtime;' + $env:Path
.\.runtime\node.exe node_modules/next/dist/bin/next dev --hostname 0.0.0.0
```

## Deploy to Render

The root `render.yaml` defines a free Node web service in Singapore, tracking `main`. The build installs development dependencies, downloads the MediaPipe model/WASM assets, and builds Next.js. `npm start` binds to `0.0.0.0` and uses Render's `PORT` environment variable. No application secrets or database are needed. HTTPS on the deployed domain supports camera permissions.

Create a Render Blueprint from this repository to apply the configuration. Render assigns the public URL when the service is created. Free services can sleep when idle, so an initial visit may take longer. See [Render's Next.js guide](https://render.com/docs/deploy-nextjs-app).

## Capture workflow

1. Enter barefoot height, output unit and fit profile. Fit preferences set shirt hem length and trouser clearance.
2. Enable the camera. Use fitted clothing, even light, a level camera and a plain background. Keep the full body visible.
3. Hold an A-pose with arms 30–45° from the torso. Validation must pass for 1.5 seconds followed by a three-second countdown. Any invalid pose or detection gap over 2.5 seconds resets stability. Slow inference is supported: each observation credits at most one second and capture requires at least six valid observations, so slow devices may take longer. The progress bar shows the actual hold progress.
4. Turn 90° right, lower arms, and remain on the same floor mark. Capture the side view.
5. Review estimates, manually complete missing fields, switch units, copy/download JSON or print all 40 measurements. In the print dialog, select Save as PDF.

Sample results use synthetic geometry, are clearly labeled, and never replace a failed real scan.

## Architecture

- `components/CameraViewport.tsx`: camera permissions, lifecycle, exact-frame snapshots, skeleton rendering and capture orchestration.
- `components/PoseGuidanceOverlay.tsx`: validation checks and countdown.
- `components/MeasurementDashboard.tsx`: categorized results, manual input, rise summation and exports.
- `lib/poseDetector.ts` / `lib/pose.worker.ts`: worker client and MediaPipe VIDEO inference with segmentation. CPU execution in a worker keeps inference off the UI thread.
- `lib/captureMachine.ts`: deterministic FSM and time-based stability, independent of inference FPS.
- Inference uses an aspect-preserving copy at up to 640 pixels wide; snapshots and measurement coordinate dimensions retain the full camera resolution.
- `lib/poseValidation.ts`: visibility, light, person count, A-pose, profile, posture and motion checks. Angles account for image aspect ratio.
- `lib/bodyReference.ts`: shared head/heel reference for framing and calibration. Side views use the more visible shoulder-to-foot chain; hidden-side ankle/wrist confidence and jitter do not block capture. Cropping, excessive distance and uncertain tracking have separate prompts. The target A-pose is 30–45 degrees with a three-degree estimation tolerance.
- `lib/measurementCalculations.ts`: crown-to-heel calibration, seeded contour slicing, geometry and all 40 measurement definitions.
- `lib/voiceDirector.ts`: throttled, cancellable Web Speech instructions.

## Measurement limitations

**This is an implemented estimation workflow, not a validated measuring instrument. Do not promise exact results or cut fabric without verification.** Production use requires field validation against tape measurements across devices, body shapes, clothing, mobility needs and lighting conditions.

All 40 requested fields are present. The engine returns `null` with a reason for values that cannot be observed reliably: across back, armhole, back length, front/back/full rise, garment leg opening and the middle fingertip endpoint. Users can enter these manually; full rise is calculated after both rise values are entered. The index-finger landmark is not substituted for the middle fingertip.

- Torso circumferences use Ramanujan's ellipse approximation from contiguous front and side segmentation runs. Anatomical slice levels are inferred from shoulders/hips, not detected bust points, natural waist, C7 or crotch.
- Limb circumference uses a disclosed circular approximation from front-view perpendicular contours; overlapping side limbs cannot supply independent depth.
- Height scales each view separately. Apparent normalized body-height differences above 12% produce a review notice in the results and export, rather than discarding both captures or claiming the user moved. Differences above 30% withhold combined-view circumferences for manual confirmation while preserving front-view lengths. These are review thresholds, not validated accuracy bounds. Invalid individual calibration still fails.
- Hair affects crown segmentation; clothing affects contours. Camera tilt, perspective and side-view arm occlusion can bias results. No statistically calibrated confidence or accuracy is claimed.
- Shoulder slope is the inter-shoulder line angle, as specified, and is labeled distinctly from each shoulder's neck-to-acromion slope.
- Outseam is a vertical projection, not a surface curve. Crotch-dependent lengths are modeled estimates.
- Shirt length, shoe clearance and leg opening are garment choices. Fit profile affects separate illustrative ease/rise allowances; it does not alter inferred anatomy. Pattern rise curves need manually confirmed rise values and fitting; they are not invented from gender.

## Privacy and deployment

No accounts, backend image uploads, analytics or browser persistence. Camera frames, masks and profile values exist only in memory. Tracks stop after capture, cancellation, page hiding, errors or component unmount. Export is user initiated. JSON records canonical centimeters, degree exceptions, methodology, source status, sample flag and garment allowances. Browsers need workers, WASM, OffscreenCanvas and getUserMedia. Voice depends on browser speech support.

The application sets camera-only Permissions Policy, anti-framing, MIME sniffing and referrer headers. Use HTTPS in deployment. Missing or failed vision assets produce a retryable error.

## Verification

Unit tests cover countdown timing, interruptions, camera gaps, both capture stages, ellipse math, unit conversion, calibration guards, missing anatomy, contour isolation and pose checks. Browser tests cover profile validation, sample editing, rise calculation, JSON download, 40-row print output, mobile layout, permission denial and real model inference on a synthetic webcam stream. Live human measurement accuracy needs physical validation.

## References

- [MediaPipe Pose Landmarker for Web](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js)
- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
- [MediaPipe model bundle](https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task)
