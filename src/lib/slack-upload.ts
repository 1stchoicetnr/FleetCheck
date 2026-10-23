import { SlackDeliveryError } from "./checkout-slack";
import type { SlackThreadFile } from "./slack-files";

export type SlackBinaryFile = SlackThreadFile & {
  bytes: Uint8Array;
  contentType: string;
};

export type SlackHttp = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string | Uint8Array;
    signal?: AbortSignal;
  }
) => Promise<{ ok: boolean; status?: number; text: () => Promise<string> }>;

const API = "https://slack.com/api";

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function slackJson(
  fetchImpl: SlackHttp,
  url: string,
  token: string,
  body: string,
  contentType: string
): Promise<Record<string, unknown>> {
  let response: { ok: boolean; status?: number; text: () => Promise<string> };
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": contentType },
      body,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") throw new SlackDeliveryError("timeout");
    throw new SlackDeliveryError("network");
  }
  if (response.status === 429) throw new SlackDeliveryError("HTTP 429");
  if (!response.ok) throw new SlackDeliveryError(`HTTP ${response.status || 0}`);
  let payload: { ok?: boolean; error?: string };
  try {
    payload = JSON.parse(await response.text()) as { ok?: boolean; error?: string };
  } catch {
    throw new SlackDeliveryError("slack");
  }
  if (!payload.ok) {
    throw new SlackDeliveryError(payload.error === "ratelimited" ? "HTTP 429" : payload.error || "slack");
  }
  return payload as Record<string, unknown>;
}

export async function postSlackApiMessage(
  fetchImpl: SlackHttp,
  input: { token: string; channel: string; text: string }
): Promise<{ ts: string; channel: string }> {
  const payload = await slackJson(
    fetchImpl,
    `${API}/chat.postMessage`,
    input.token,
    JSON.stringify({
      channel: input.channel,
      text: input.text,
      unfurl_links: false,
      unfurl_media: false,
    }),
    "application/json"
  );
  const ts = typeof payload.ts === "string" ? payload.ts : "";
  const channel = typeof payload.channel === "string" ? payload.channel : input.channel;
  if (!ts) throw new SlackDeliveryError("slack");
  return { ts, channel };
}

async function postBytes(fetchImpl: SlackHttp, url: string, bytes: Uint8Array): Promise<void> {
  let response: { ok: boolean; status?: number; text: () => Promise<string> };
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: bytes,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") throw new SlackDeliveryError("timeout");
    throw new SlackDeliveryError("network");
  }
  if (response.status === 429) throw new SlackDeliveryError("HTTP 429");
  if (!response.ok) throw new SlackDeliveryError(`HTTP ${response.status || 0}`);
}

/** Upload one batch into an existing message thread. Titles are the captions. */
export async function uploadSlackThreadBatch(
  fetchImpl: SlackHttp,
  input: { token: string; channel: string; threadTs: string; files: SlackBinaryFile[] }
): Promise<void> {
  if (!input.files.length) return;
  const uploaded: Array<{ id: string; title: string }> = [];
  for (const file of input.files) {
    const params = new URLSearchParams({
      filename: file.filename,
      length: String(file.bytes.byteLength),
    });
    const granted = await slackJson(
      fetchImpl,
      `${API}/files.getUploadURLExternal`,
      input.token,
      params.toString(),
      "application/x-www-form-urlencoded"
    );
    const uploadUrl = typeof granted.upload_url === "string" ? granted.upload_url : "";
    const fileId = typeof granted.file_id === "string" ? granted.file_id : "";
    if (!uploadUrl || !fileId) throw new SlackDeliveryError("slack");
    await postBytes(fetchImpl, uploadUrl, file.bytes);
    uploaded.push({ id: fileId, title: file.title });
  }
  await slackJson(
    fetchImpl,
    `${API}/files.completeUploadExternal`,
    input.token,
    JSON.stringify({
      files: uploaded,
      channel_id: input.channel,
      thread_ts: input.threadTs,
      initial_comment: input.files.map((file) => file.title).join("\n"),
    }),
    "application/json"
  );
}
