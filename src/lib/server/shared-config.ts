
export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

export function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

export function getDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL;
}

/**
 * BLOB_READ_WRITE_TOKEN is the original (public) Blob store. Older photos and
 * feedback screenshots live there. PRIVATE_BLOB_READ_WRITE_TOKEN is the private
 * store new checkout photos go to.
 */
export function hasBlobToken(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.PRIVATE_BLOB_READ_WRITE_TOKEN);
}

/** Token for writing and reading private checkout photos. */
export function privatePhotoBlobToken(): string | undefined {
  return process.env.PRIVATE_BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN || undefined;
}

/** Token for the original public store (old photos, feedback screenshots). */
export function publicBlobToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN || undefined;
}

export function getOfficePin(): string {
  // No fallback: unset OFFICE_PIN means office access is closed.
  return (process.env.OFFICE_PIN || "").trim();
}

/** Production / Vercel preview must use Postgres. File store is next-dev only. */
export function isLocalSharedStoreEnabled(): boolean {
  return !hasDatabaseUrl() && !isProductionRuntime();
}

export function sharedBackendMode(): "postgres" | "local-dev" | "unconfigured" {
  if (hasDatabaseUrl()) return "postgres";
  if (isLocalSharedStoreEnabled()) return "local-dev";
  return "unconfigured";
}
