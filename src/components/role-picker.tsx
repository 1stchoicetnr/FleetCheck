"use client";

import { ROLE_DETAILS, roleChoices, type AccessMemberRole } from "@/lib/role-access";

const LABELS: Record<AccessMemberRole, string> = {
  driver: "Driver",
  office: "Office",
  manager: "Manager",
  owner: "Owner",
};

export function RolePicker({
  id,
  value,
  includeOwner,
  onChange,
}: {
  id: string;
  value: string;
  includeOwner: boolean;
  onChange: (role: string) => void;
}) {
  const choices = roleChoices(includeOwner);
  const selected = choices.includes(value as AccessMemberRole) ? value : "driver";
  const detail = ROLE_DETAILS[selected as AccessMemberRole];
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-ink">
        Role
      </label>
      <select
        id={id}
        value={selected}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[48px] w-full rounded-xl border border-line bg-canvas px-3 text-ink"
      >
        {choices.map((role) => (
          <option key={role} value={role}>
            {LABELS[role]}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </div>
  );
}
