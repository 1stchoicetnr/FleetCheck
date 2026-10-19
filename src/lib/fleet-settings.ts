export interface FleetSettings {
  /** When false (default), drivers cannot add units on Checkout start. */
  allowDriverAddVehicles: boolean;
}

export const DEFAULT_FLEET_SETTINGS: FleetSettings = {
  allowDriverAddVehicles: false,
};
