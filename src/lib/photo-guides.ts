import type { PhotoAngle } from "./types";

/** Generic framing shape. It is not tied to one vehicle body. */
export type FramingKind =
  | "front"
  | "rear"
  | "side"
  | "corner"
  | "wheel"
  | "panel"
  | "odometer"
  | "cabin"
  | "windshield"
  | "document"
  | "engine"
  | "controls";

export interface OutlineShape {
  d?: string;
  cx?: number;
  cy?: number;
  r?: number;
  rect?: { x: number; y: number; width: number; height: number; rx?: number };
}

const TIPS: Record<FramingKind, string> = {
  front: "Fill the outline with the whole front. Keep the bumper and glass inside it.",
  rear: "Fill the outline with the whole rear. Keep the bumper and glass inside it.",
  side: "Line the side up from the front wheel to the rear wheel.",
  corner: "Stand at the corner so the front and the side both sit in the outline.",
  wheel: "Center the wheel in the circle. Include the tire and the rim.",
  panel: "Fill the box with that panel and leave a little space around it.",
  odometer: "Fit the gauges in the box so the mileage is easy to read.",
  cabin: "Show the seat and the door opening inside the box.",
  windshield: "Fill the trapezoid with the glass, including the frame edges.",
  document: "Lay the document flat in the box so the text can be read.",
  engine: "Show the open bay in the box, with the dipstick in view.",
  controls: "Fit the radio and climate controls inside the box.",
};

export function framingForAngle(angle: PhotoAngle): {
  kind: FramingKind;
  tip: string;
} {
  switch (angle) {
    case "front":
      return { kind: "front", tip: TIPS.front };
    case "rear":
      return { kind: "rear", tip: TIPS.rear };
    case "lf_corner":
    case "rf_corner":
    case "lr_corner":
    case "rr_corner":
      return { kind: "corner", tip: TIPS.corner };
    case "driver_doors":
    case "passenger_doors":
      return { kind: "side", tip: TIPS.side };
    case "lf_tire":
    case "lr_tire":
    case "rf_tire":
    case "rr_tire":
    case "lf_wheel":
    case "lr_wheel":
    case "rf_wheel":
    case "rr_wheel":
      return { kind: "wheel", tip: TIPS.wheel };
    case "odometer_fuel":
      return { kind: "odometer", tip: TIPS.odometer };
    case "windshield":
      return { kind: "windshield", tip: TIPS.windshield };
    case "registration":
      return { kind: "document", tip: TIPS.document };
    case "engine_oil":
      return { kind: "engine", tip: TIPS.engine };
    case "radio_climate":
      return { kind: "controls", tip: TIPS.controls };
    case "driver_door_in":
    case "driver_rear_door_in":
    case "passenger_front_in":
    case "passenger_rear_in":
    case "trunk_interior":
      return { kind: "cabin", tip: TIPS.cabin };
    default:
      return { kind: "panel", tip: TIPS.panel };
  }
}

/** Simple silhouettes in a 100×70 view box. */
export function outlineShapes(kind: FramingKind): OutlineShape[] {
  switch (kind) {
    case "front":
      return [
        { d: "M22 50 L30 30 Q50 18 70 30 L78 50 Q50 56 22 50 Z" },
        { d: "M36 32 L50 24 L64 32 L60 40 L40 40 Z" },
        { d: "M26 46 H74" },
      ];
    case "rear":
      return [
        { d: "M24 50 L30 32 H70 L76 50 Q50 56 24 50 Z" },
        { d: "M36 34 H64 V42 H36 Z" },
        { d: "M28 47 H72" },
      ];
    case "side":
      return [
        { d: "M12 42 L24 28 H76 L90 42 L82 52 H18 Z" },
        { cx: 32, cy: 50, r: 7 },
        { cx: 72, cy: 50, r: 7 },
        { d: "M40 30 L46 28 H68 L74 36 H42 Z" },
      ];
    case "corner":
      return [
        { d: "M18 50 L28 32 Q42 20 58 26 L78 34 L86 48 L70 54 H28 Z" },
        { d: "M34 34 L46 26 L58 30 L54 40 L36 40 Z" },
        { cx: 36, cy: 52, r: 6 },
        { cx: 68, cy: 50, r: 6 },
      ];
    case "wheel":
      return [
        { cx: 50, cy: 35, r: 18 },
        { cx: 50, cy: 35, r: 8 },
        { d: "M50 17 V27 M50 43 V53 M32 35 H42 M58 35 H68" },
      ];
    case "odometer":
      return [
        { rect: { x: 18, y: 18, width: 64, height: 36, rx: 6 } },
        { cx: 36, cy: 36, r: 8 },
        { cx: 64, cy: 36, r: 8 },
      ];
    case "cabin":
      return [
        { rect: { x: 22, y: 14, width: 56, height: 44, rx: 4 } },
        { d: "M30 46 Q50 32 70 46" },
        { d: "M34 28 H66" },
      ];
    case "windshield":
      return [{ d: "M22 50 L34 18 H66 L78 50 Z" }];
    case "document":
      return [
        { rect: { x: 28, y: 12, width: 44, height: 48, rx: 2 } },
        { d: "M34 24 H66 M34 32 H66 M34 40 H58" },
      ];
    case "engine":
      return [
        { rect: { x: 16, y: 16, width: 68, height: 40, rx: 4 } },
        { d: "M62 22 V40" },
        { cx: 40, cy: 36, r: 8 },
      ];
    case "controls":
      return [
        { rect: { x: 16, y: 22, width: 68, height: 28, rx: 4 } },
        { rect: { x: 22, y: 28, width: 28, height: 16, rx: 2 } },
        { cx: 62, cy: 36, r: 4 },
        { cx: 74, cy: 36, r: 4 },
      ];
    case "panel":
      return [{ rect: { x: 18, y: 16, width: 64, height: 40, rx: 8 } }];
  }
}
