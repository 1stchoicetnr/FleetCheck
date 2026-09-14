const DISPATCHER_KEY = "fleetcheck.lastDispatcherName";

function unitKey(companyId: string): string {
  return `fleetcheck.lastVehicleId.${companyId}`;
}

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function write(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Private mode / blocked storage — skip remember.
  }
}

export function getLastDispatcherName(): string {
  return read(DISPATCHER_KEY);
}

export function saveLastDispatcherName(name: string) {
  write(DISPATCHER_KEY, name.trim());
}

export function getLastVehicleId(companyId: string): string {
  if (!companyId) return "";
  return read(unitKey(companyId));
}

export function saveLastVehicleId(companyId: string, vehicleId: string) {
  if (!companyId) return;
  write(unitKey(companyId), vehicleId);
}
