import type { Frame } from "./types";
export class PoseDetector {
  private worker: Worker;
  private pending?: {
    resolve: (frame: Frame) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  };
  private ready: Promise<void>;
  private initReject!: (error: Error) => void;
  private initTimer: ReturnType<typeof setTimeout>;
  constructor() {
    this.worker = new Worker(new URL("./pose.worker.ts", import.meta.url));
    this.initTimer = setTimeout(
      () =>
        this.fail(
          new Error(
            "The pose model took too long to load. Check the vision assets and try again.",
          ),
        ),
      90000,
    );
    this.ready = new Promise((resolve, reject) => {
      this.initReject = reject;
      this.worker.onmessage = (event) => {
        const { type, frame, message } = event.data;
        if (type === "ready") {
          clearTimeout(this.initTimer);
          resolve();
        }
        if (type === "error") this.fail(new Error(message));
        if (type === "result" && this.pending) {
          clearTimeout(this.pending.timer);
          this.pending.resolve(frame);
          this.pending = undefined;
        }
      };
      this.worker.onerror = () =>
        this.fail(
          new Error(
            "Vision could not start in this browser. Try an updated Chrome, Edge, or Safari.",
          ),
        );
    });
    this.worker.postMessage({ type: "init", baseUrl: location.origin });
  }
  private fail(error: Error) {
    clearTimeout(this.initTimer);
    this.initReject(error);
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(error);
      this.pending = undefined;
    }
  }
  async initialize() {
    await this.ready;
  }
  async detect(bitmap: ImageBitmap, timestamp: number): Promise<Frame> {
    await this.ready;
    if (this.pending) {
      bitmap.close();
      throw new Error("A frame is already being processed.");
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          this.fail(
            new Error("Camera analysis stopped responding. Please retry."),
          ),
        12000,
      );
      this.pending = { resolve, reject, timer };
      this.worker.postMessage({ type: "frame", bitmap, timestamp }, [bitmap]);
    });
  }
  close() {
    this.fail(new Error("Camera session closed."));
    this.worker.terminate();
  }
}
