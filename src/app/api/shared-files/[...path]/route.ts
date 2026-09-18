import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { isLocalSharedStoreEnabled } from "@/lib/server/shared-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  if (!isLocalSharedStoreEnabled()) {
    return NextResponse.json(
      { error: "Local file fallback is only available in next dev" },
      { status: 404 }
    );
  }
  const { path: parts } = await params;
  const safe = parts.join("/").replace(/\.\./g, "");
  const filePath = path.join(process.cwd(), ".data", "blobs", safe);
  try {
    const data = await readFile(filePath);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
