"use client";

import { Badge } from "@/components/ui/badge";

type ContextPill = {
  label: string;
  value: string;
};

export function AdminContextPills({ pills }: { pills: ContextPill[] }) {
  if (!pills.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {pills.map((p) => (
        <Badge
          key={`${p.label}:${p.value}`}
          variant="outline"
          className="rounded-md border-border text-xs font-normal"
        >
          {p.label}: {p.value}
        </Badge>
      ))}
    </div>
  );
}
