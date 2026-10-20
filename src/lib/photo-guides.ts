import type { PhotoAngle } from "./types";

/** Exterior ends that can share one thin vehicle outline. */
export type SilhouetteKind = "front" | "rear";

export type GuideStyle = "silhouette" | "corners";

export interface PhotoGuide {
  style: GuideStyle;
  kind: SilhouetteKind;
  tip: string;
}

export interface OutlineShape {
  d?: string;
  cx?: number;
  cy?: number;
  r?: number;
}

const TIPS: Record<PhotoAngle, string> = {
  odometer_fuel: "Get close enough that the mileage is easy to read.",
  windshield: "Fill the frame with the glass, including the edges.",
  radio_climate: "Show the radio and the climate controls.",
  registration: "Lay the document flat so the date and the VIN can be read.",
  driver_door_in: "Show the driver seat from the open door.",
  driver_rear_door_in: "Show the rear seat from the open door.",
  passenger_front_in: "Show the front passenger seat from the open door.",
  passenger_rear_in: "Show the rear passenger seat from the open door.",
  trunk_interior: "Show the cargo area with the trunk or hatch open.",
  engine_oil: "Show the open bay with the dipstick in view.",
  driver_doors: "Line the side up from the front wheel to the rear wheel.",
  passenger_doors: "Line the side up from the front wheel to the rear wheel.",
  front: "Fill the outline with the whole front, from the bumper to the glass.",
  rear: "Fill the outline with the whole rear, from the bumper to the glass.",
  lf_corner: "Stand at the corner so the front and the side both show.",
  rf_corner: "Stand at the corner so the front and the side both show.",
  lr_corner: "Stand at the corner so the rear and the side both show.",
  rr_corner: "Stand at the corner so the rear and the side both show.",
  lf_fender: "Fill the frame with that panel and leave a little space around it.",
  rf_fender: "Fill the frame with that panel and leave a little space around it.",
  lr_quarter_panel: "Fill the frame with that panel and leave a little space around it.",
  rr_quarter_panel: "Fill the frame with that panel and leave a little space around it.",
  lf_tire: "Center the wheel and include the tire and the rim.",
  rf_tire: "Center the wheel and include the tire and the rim.",
  lr_tire: "Center the wheel and include the tire and the rim.",
  rr_tire: "Center the wheel and include the tire and the rim.",
  lf_wheel: "Center the wheel and include the tire and the rim.",
  rf_wheel: "Center the wheel and include the tire and the rim.",
  lr_wheel: "Center the wheel and include the tire and the rim.",
  rr_wheel: "Center the wheel and include the tire and the rim.",
};

/**
 * A side or corner drawing only fits one body style. Those angles use
 * corner marks. Front and rear can share one loose face outline.
 */
const SILHOUETTE: Partial<Record<PhotoAngle, SilhouetteKind>> = {
  front: "front",
  rear: "rear",
};

export function framingForAngle(angle: PhotoAngle): PhotoGuide {
  const kind = SILHOUETTE[angle];
  if (kind) return { style: "silhouette", kind, tip: TIPS[angle] };
  return { style: "corners", kind: "front", tip: TIPS[angle] };
}

/**
 * Thin exterior silhouettes in a 100×70 view box.
 * Outer mass only — no lights, gauges, or panel diagrams — so the same
 * line can sit over a car, an SUV, or a truck.
 */
export function outlineShapes(kind: SilhouetteKind): OutlineShape[] {
  switch (kind) {
    case "front":
      return [
        { d: "M22 58 V26 C22 14 34 8 50 8 C66 8 78 14 78 26 V58 C78 64 50 66 22 58 Z" },
        { d: "M34 30 L40 16 H60 L66 30 Z" },
      ];
    case "rear":
      return [
        { d: "M24 58 V24 C24 12 36 8 50 8 C64 8 76 12 76 24 V58 C76 64 50 66 24 58 Z" },
        { d: "M40 14 H60 V28 H40 Z" },
      ];
  }
}
