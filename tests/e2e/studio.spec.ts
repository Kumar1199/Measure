import { test, expect } from "@playwright/test";
import { syntheticCapture } from "../../lib/demo";
import { scaledCapture } from "../fixtures";
import { readFile } from "node:fs/promises";

for (const sideScale of [1, 0.8]) {
  test(`auto-captures both views with occlusion, slow inference and side scale ${sideScale}`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    const profile = scaledCapture(syntheticCapture(true), sideScale);
    [12, 14, 16, 24, 26, 28, 30].forEach(
      (i) => (profile.landmarks[i].visibility = 0.1),
    );
    profile.landmarks[16].x = 1.1;
    profile.landmarks[28].y = 1.2;
    profile.landmarks[30].y = 1.3;
    const frames = [syntheticCapture(), profile].map((frame) => ({
      ...frame,
      mask: { ...frame.mask!, data: Array.from(frame.mask!.data) },
    }));
    await page.addInitScript(
      ({ frames }) => {
        // Replace only inference, leaving real camera acquisition, validation, the
        // FSM, snapshots, measurement calculation, and results rendering intact.
        window.Worker = class {
          onmessage: ((event: { data: unknown }) => void) | null = null;
          onerror = null;
          closed = false;
          postMessage(message: {
            type: string;
            bitmap: ImageBitmap;
            timestamp: number;
          }) {
            if (message.type === "init") {
              setTimeout(
                () => this.onmessage?.({ data: { type: "ready" } }),
                0,
              );
              return;
            }
            const side = document
              .querySelector(".camera-mode")
              ?.textContent?.includes("SIDE VIEW");
            const fixture = frames[side ? 1 : 0];
            const ratio =
              fixture.width /
              fixture.height /
              (message.bitmap.width / message.bitmap.height);
            const landmarks = fixture.landmarks.map((p) => ({
              ...p,
              x: 0.5 + (p.x - 0.5) * ratio,
            }));
            const mask = {
              ...fixture.mask,
              data: new Float32Array(fixture.mask.data.length),
            };
            for (let y = 0; y < mask.height; y++)
              for (let x = 0; x < mask.width; x++) {
                const sourceX = Math.round(
                  ((x / mask.width - 0.5) / ratio + 0.5) * mask.width,
                );
                if (sourceX >= 0 && sourceX < mask.width)
                  mask.data[y * mask.width + x] =
                    fixture.mask.data[y * mask.width + sourceX];
              }
            const frame = {
              ...fixture,
              landmarks,
              mask,
              timestamp: message.timestamp,
            };
            message.bitmap.close();
            setTimeout(() => {
              if (!this.closed)
                this.onmessage?.({ data: { type: "result", frame } });
            }, 650);
          }
          terminate() {
            this.closed = true;
          }
        } as unknown as typeof Worker;
      },
      { frames },
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Enable camera" }).click();
    await expect(
      page.getByRole("progressbar", { name: "Capture hold progress" }),
    ).toBeVisible();
    await expect(page.locator(".guidance-banner")).toContainText(
      "Capturing in",
      {
        timeout: 25000,
      },
    );
    await expect(
      page.getByText("Front view captured", { exact: true }),
    ).toBeVisible({ timeout: 25000 });
    await expect(
      page.getByText("YOUR PERSONAL SPECIFICATION", { exact: true }),
    ).toBeVisible({ timeout: 40000 });
    await expect(page.locator(".measurement-row")).toHaveCount(40);
    await expect(page.locator(".inline-error")).toHaveCount(0);
    if (sideScale < 1) {
      await expect(page.locator(".calibration-note")).toContainText(
        "calibrated separately",
      );
      const downloading = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download JSON" }).click();
      const download = await downloading;
      const exported = JSON.parse(
        await readFile((await download.path())!, "utf8"),
      );
      expect(exported.calibration.reviewRequired).toBe(true);
      expect(exported.measurements).toHaveLength(40);
    }
  });
}
test("profile validation, sample review, manual rise, and export", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Great fit starts here." }),
  ).toBeVisible();
  await page.getByLabel("Your height").fill("20");
  await expect(
    page.getByRole("button", { name: "Enable camera" }),
  ).toBeDisabled();
  await page.getByLabel("Your height").fill("175");
  await page.getByRole("button", { name: "Explore sample results" }).click();
  await expect(page.getByText("SAMPLE SPECIFICATION")).toBeVisible();
  await page.getByRole("tab", { name: "Lower body" }).click();
  await page
    .getByRole("button", { name: "Edit Front Rise", exact: true })
    .click();
  await page.getByRole("spinbutton", { name: "Enter Front Rise" }).fill("25");
  await page.getByRole("button", { name: "Save measurement" }).click();
  await page
    .getByRole("button", { name: "Edit Back Rise", exact: true })
    .click();
  await page.getByRole("spinbutton", { name: "Enter Back Rise" }).fill("35");
  await page.getByRole("button", { name: "Save measurement" }).click();
  const fullRise = page
    .locator(".measurement-row")
    .filter({ has: page.getByText("Full Rise", { exact: true }) });
  await expect(fullRise).toContainText("60.0");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("form-sample.json");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".measurement-row:visible")).toHaveCount(40);
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "New scan" }).click();
  await expect(
    page.getByRole("button", { name: "Enable camera" }),
  ).toBeVisible();
});
test("camera permission error is actionable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        throw new DOMException("Denied", "NotAllowedError");
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Enable camera" }).click();
  await expect(page.locator(".camera-error")).toContainText(
    "Camera permission was denied",
  );
  await expect(
    page.getByRole("button", { name: "Enable camera" }),
  ).toBeEnabled();
});
test("mobile fits the viewport and the help dialog closes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open studio guide" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/studio-mobile.png",
    fullPage: true,
  });
});
test("desktop studio renders without runtime errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await page.screenshot({
    path: "test-results/studio-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("loads the real local model, analyzes a camera feed, and releases the camera", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/");
  await page.getByRole("button", { name: "Enable camera" }).click();
  await expect(page.getByText("LIVE CAMERA", { exact: true })).toBeVisible({
    timeout: 90000,
  });
  await expect(
    page.getByText("Step into the frame so we can find your pose."),
  ).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Cancel scan" }).click();
  expect(
    await page
      .locator("video")
      .evaluate((v) => (v as HTMLVideoElement).srcObject),
  ).toBeNull();
  await expect(
    page.getByRole("button", { name: "Enable camera" }),
  ).toBeEnabled();
});
