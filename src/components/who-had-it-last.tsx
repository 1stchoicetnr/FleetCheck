"use client";

import Link from "next/link";
import type { CheckRef, WhoHadItLast } from "@/lib/repair-report";
import { formatCheckoutTime } from "@/lib/checkout-slack";

function CheckLink({ check }: { check: CheckRef }) {
  return (
    <Link href={`/office/${check.reportId}`} className="underline underline-offset-2">
      {formatCheckoutTime(check.completedAt)} · {check.driverName}
    </Link>
  );
}

/** Who had the car last: who found the damage, the last clean check, and every check in between. */
export function WhoHadItLastBlock({ info }: { info: WhoHadItLast }) {
  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700 space-y-1">
      <p>
        <span className="font-semibold">Found by:</span> <CheckLink check={info.foundBy} />
      </p>
      <p>
        <span className="font-semibold">Last clean check:</span>{" "}
        {info.lastClean ? <CheckLink check={info.lastClean} /> : "none on record"}
      </p>
      <p className="font-semibold">Had it since then:</p>
      <ul className="list-disc pl-4 space-y-0.5">
        {info.more > 0 && <li>…{info.more} earlier check{info.more === 1 ? "" : "s"}</li>}
        {info.between.length ? (
          info.between.map((c) => (
            <li key={c.reportId}>
              <CheckLink check={c} />
            </li>
          ))
        ) : (
          <li>nobody in between</li>
        )}
      </ul>
    </div>
  );
}
