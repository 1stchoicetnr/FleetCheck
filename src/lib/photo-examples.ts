import { PhotoAngle } from "./types";

/**
 * Reference photos keyed by angle id (not checklist index).
 * Filenames keep the original policy numbers so seeded CRs still resolve.
 * Walkaround order lives in PHOTO_ANGLES.
 */
export const PHOTO_EXAMPLE_PATHS: Record<PhotoAngle, string> = {
  odometer_fuel: "/photo-examples/28-odometer-fuel.jpg",
  registration: "/photo-examples/26-registration.jpg",
  windshield: "/photo-examples/29-windshield.jpg",
  radio_climate: "/photo-examples/30-radio-climate.jpg",
  lf_corner: "/photo-examples/01-lf-corner.jpg",
  lf_fender: "/photo-examples/02-lf-fender.jpg",
  lf_tire: "/photo-examples/03-lf-tire.jpg",
  lf_wheel: "/photo-examples/04-lf-wheel.jpg",
  front: "/photo-examples/11-front.jpg",
  rf_corner: "/photo-examples/12-rf-corner.jpg",
  rf_fender: "/photo-examples/13-rf-fender.jpg",
  rf_tire: "/photo-examples/14-rf-tire.jpg",
  rf_wheel: "/photo-examples/15-rf-wheel.jpg",
  passenger_doors: "/photo-examples/16-passenger-doors.jpg",
  rr_quarter_panel: "/photo-examples/17-rr-quarter-panel.jpg",
  rr_tire: "/photo-examples/18-rr-tire.jpg",
  rr_wheel: "/photo-examples/19-rr-wheel.jpg",
  rr_corner: "/photo-examples/20-rr-corner.jpg",
  rear: "/photo-examples/10-rear.jpg",
  lr_corner: "/photo-examples/09-lr-corner.jpg",
  lr_quarter_panel: "/photo-examples/06-lr-quarter-panel.jpg",
  lr_tire: "/photo-examples/07-lr-tire.jpg",
  lr_wheel: "/photo-examples/08-lr-wheel.jpg",
  driver_doors: "/photo-examples/05-driver-doors.jpg",
  driver_door_in: "/photo-examples/21-driver-door-in.jpg",
  driver_rear_door_in: "/photo-examples/22-driver-rear-door-in.jpg",
  trunk_interior: "/photo-examples/23-trunk-interior.jpg",
  passenger_rear_in: "/photo-examples/24-passenger-rear-in.jpg",
  passenger_front_in: "/photo-examples/25-passenger-front-in.jpg",
  engine_oil: "/photo-examples/27-engine-oil.jpg",
};
