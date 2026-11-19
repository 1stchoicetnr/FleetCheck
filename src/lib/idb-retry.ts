/**
 * iPhone home-screen apps: when the app sits in the background, iOS can kill
 * the process that holds the phone's database. Every read and write then fails
 * with "Connection to Indexed Database server lost" until the connection is
 * opened again, and the app used to keep the dead connection forever. Checks
 * waiting on the phone could not be read, saved, or sent until the app was
 * force-closed.
 */
export function isLostDbConnection(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const bag = err as { name?: string; message?: string };
  const message = String(bag.message ?? "");
  if (/connection to indexed database server lost/i.test(message)) return true;
  if (/database connection is closing|connection is closed|database is closing/i.test(message)) return true;
  if (/internal error was encountered in the indexed database server/i.test(message)) return true;
  // Safari reports a dead connection as InvalidStateError on transaction().
  if (bag.name === "InvalidStateError" && /transaction|database|closing/i.test(message)) return true;
  return false;
}

/** Run one database step; on a lost connection, reopen once and try again. */
export async function withDbRetry<D, T>(
  open: () => Promise<D>,
  reset: () => void,
  step: (db: D) => Promise<T>
): Promise<T> {
  try {
    return await step(await open());
  } catch (err) {
    if (!isLostDbConnection(err)) throw err;
    console.info(`[storage] database connection lost; reopening (${(err as Error).message ?? err})`);
    reset();
    return step(await open());
  }
}
