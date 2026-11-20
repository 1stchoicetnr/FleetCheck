import { getVercelOidcToken } from "@vercel/oidc";

export { compareOnce, runPhotoCheck, type PhotoCheckDeps } from "@/lib/photo-check-core";

/** AI Gateway auth: AI_GATEWAY_API_KEY, else the Vercel OIDC token (automatic on Vercel). Never logged. */
export async function gatewayToken(): Promise<string | undefined> {
  if (process.env.AI_GATEWAY_API_KEY) return process.env.AI_GATEWAY_API_KEY;
  try {
    return await getVercelOidcToken();
  } catch {
    return process.env.VERCEL_OIDC_TOKEN || undefined;
  }
}

/** True when a gateway credential could be found here (does not call the gateway). */
export function gatewayLikelyConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL);
}
