import { anyOwnerHasPassword } from "./org-data";
import { orgFromSession } from "./org-scope";
import { pgDb, pgMigrateAndSeed } from "./postgres-store";
import { hasDatabaseUrl } from "./shared-config";

/**
 * The office PIN stays available until some owner has set a password.
 * A database miss keeps the PIN available so Ashley and James are not locked out.
 */
export async function pinFallbackOpen(): Promise<boolean> {
  if (!hasDatabaseUrl()) return true;
  await pgMigrateAndSeed();
  const ownerHasPassword = await anyOwnerHasPassword(pgDb(), orgFromSession());
  return !ownerHasPassword;
}
