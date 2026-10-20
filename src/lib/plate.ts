/** Identity key: spaces and hyphens do not make a different unit. */
export function normalizePlate(plate: string): string {
  return plate.replace(/[\s-]/g, "").toUpperCase();
}

/** Plate as entered: trim, collapse spaces, keep hyphens, uppercase. */
export function displayPlate(plate: string): string {
  return plate.trim().replace(/\s+/g, " ").toUpperCase();
}
