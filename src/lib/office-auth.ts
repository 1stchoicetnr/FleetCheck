const OFFICE_UNLOCK_KEY = "fleetcheck-office-unlock";

export function isOfficeUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(OFFICE_UNLOCK_KEY) === "1";
}

export function unlockOffice(): void {
  sessionStorage.setItem(OFFICE_UNLOCK_KEY, "1");
}

export function lockOffice(): void {
  sessionStorage.removeItem(OFFICE_UNLOCK_KEY);
}

export function verifyOfficePin(entered: string, expected: string): boolean {
  return entered.trim() === expected.trim();
}
