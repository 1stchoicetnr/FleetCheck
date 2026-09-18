# Example reference photos (30-step walkaround)

JPGs are keyed by **angle id** in `src/lib/photo-examples.ts`. Filenames keep the original policy numbers so older seeded reports still load.

Required driver order (after dropping the four tire-tread slots) is `walkaroundPhotoSteps(PHOTO_ANGLES)` in `src/lib/types.ts` — one clockwise lap grouped by station:

| Step | Angle | File |
|------|-------|------|
| 1 | Odometer & Fuel | `28-odometer-fuel.jpg` |
| 2 | Windshield | `29-windshield.jpg` |
| 3 | Radio & Climate | `30-radio-climate.jpg` |
| 4 | Registration & Insurance | `26-registration.jpg` |
| 5 | Driver Door Interior | `21-driver-door-in.jpg` |
| 6 | Driver Side Doors | `05-driver-doors.jpg` |
| 7 | LF Fender | `02-lf-fender.jpg` |
| 8 | LF Wheel | `04-lf-wheel.jpg` |
| 9 | Front 3/4 Left | `01-lf-corner.jpg` |
| 10 | Front | `11-front.jpg` |
| 11 | Front 3/4 Right | `12-rf-corner.jpg` |
| 12 | RF Fender | `13-rf-fender.jpg` |
| 13 | RF Wheel | `15-rf-wheel.jpg` |
| 14 | Passenger Front Interior | `25-passenger-front-in.jpg` |
| 15 | Passenger Doors | `16-passenger-doors.jpg` |
| 16 | RR Quarter Panel | `17-rr-quarter-panel.jpg` |
| 17 | RR Wheel | `19-rr-wheel.jpg` |
| 18 | Rear 3/4 Right | `20-rr-corner.jpg` |
| 19 | Passenger Rear Interior | `24-passenger-rear-in.jpg` |
| 20 | Rear | `10-rear.jpg` |
| 21 | Trunk / Rear Hatch | `23-trunk-interior.jpg` |
| 22 | Rear 3/4 Left | `09-lr-corner.jpg` |
| 23 | LR Quarter Panel | `06-lr-quarter-panel.jpg` |
| 24 | LR Wheel | `08-lr-wheel.jpg` |
| 25 | Driver Rear Door Interior | `22-driver-rear-door-in.jpg` |
| 26 | Engine Oil Level | `27-engine-oil.jpg` |

Legacy tread files (`03-lf-tire.jpg`, `14-rf-tire.jpg`, `18-rr-tire.jpg`, `07-lr-tire.jpg`) stay on disk for old reports. Tread rating is Precheck (LF/RF/LR/RR), not a photo slot.
