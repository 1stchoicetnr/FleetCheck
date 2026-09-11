const OFFICE_UNLOCK_KEY = "fleetcheck-office-unlock";
const OFFICE_PIN_KEY = "fleetcheck-office-pin";

export function isOfficeUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(OFFICE_UNLOCK_KEY) === "1";
}

export function unlockOffice(pin?: string): void {
  sessionStorage.setItem(OFFICE_UNLOCK_KEY, "1");
  if (pin) sessionStorage.setItem(OFFICE_PIN_KEY, pin.trim());
}

export function getStoredOfficePin(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(OFFICE_PIN_KEY) || "";
}

export function lockOffice(): void {
  sessionStorage.removeItem(OFFICE_UNLOCK_KEY);
  sessionStorage.removeItem(OFFICE_PIN_KEY);
}

export function verifyOfficePin(entered: string, expected: string): boolean {
  return entered.trim() === expected.trim();
}
