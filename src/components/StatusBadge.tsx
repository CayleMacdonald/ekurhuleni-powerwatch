import { STATUS_META } from "@/lib/constants";
import type { OutageStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: OutageStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`chip ${m.color} text-white`}>
      <span aria-hidden>{m.icon}</span>
      {m.label}
    </span>
  );
}
