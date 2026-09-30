export type Unit = "cm" | "in";
export type Gender = "Men" | "Women" | "Unisex";
export type Profile = {
  heightCm: number;
  unit: Unit;
  gender: Gender;
  shirtLengthCm: number;
  shoeClearanceCm: number;
};
export type Landmark = { x: number; y: number; z?: number; visibility: number };
export type Mask = { data: Float32Array; width: number; height: number };
export type Frame = {
  landmarks: Landmark[];
  mask?: Mask;
  width: number;
  height: number;
  timestamp: number;
  brightness: number;
  people: number;
};
export type Capture = Frame & { image: string };
export type CaptureState =
  | "IDLE"
  | "CALIBRATING"
  | "A_POSE_FRONT"
  | "HOLDING_FRONT"
  | "TURN_INSTRUCTION"
  | "SIDE_PROFILE"
  | "HOLDING_SIDE"
  | "PROCESSING"
  | "RESULTS";
export type Check = { label: string; valid: boolean };
export type Validation = { valid: boolean; message: string; checks: Check[] };
export type Measurement = {
  id: number;
  name: string;
  category: "upper" | "lower" | "full";
  valueCm: number | null;
  status: "reference" | "estimate" | "manual" | "design";
  method: string;
  degrees?: boolean;
};
export type ScanResult = {
  measurements: Measurement[];
  profile: Profile;
  capturedAt: string;
  demo: boolean;
  calibration?: {
    relativeDifference: number;
    reviewRequired: boolean;
    severeMismatch: boolean;
    message: string | null;
  };
};
