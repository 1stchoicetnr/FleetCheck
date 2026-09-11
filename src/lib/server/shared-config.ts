import { DEFAULT_OFFICE_PIN } from "@/lib/companies";

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

export function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

export function getDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL;
}

export function hasBlobToken(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function getOfficePin(): string {
  return (process.env.OFFICE_PIN || DEFAULT_OFFICE_PIN).trim();
}

/** Production / Vercel preview must use Postgres. File store is next-dev only. */
export function useLocalSharedStore(): boolean {
  return !hasDatabaseUrl() && !isProductionRuntime();
}

export function sharedBackendMode(): "postgres" | "local-dev" | "unconfigured" {
  if (hasDatabaseUrl()) return "postgres";
  if (useLocalSharedStore()) return "local-dev";
  return "unconfigured";
}
