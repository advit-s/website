"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SORT_OPTIONS } from "@/domain/catalog";
import { Select } from "@/components/ui/field";

export function SortSelect({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sort" className="hidden text-sm text-ink-muted sm:block">
        Sort by
      </label>
      <Select
        id="sort"
        value={value}
        className="min-h-9 w-auto py-1 text-sm"
        onChange={(e) => {
          const sp = new URLSearchParams(params.toString());
          if (e.target.value === "featured") sp.delete("sort");
          else sp.set("sort", e.target.value);
          sp.delete("page");
          const s = sp.toString();
          router.push(s ? `${pathname}?${s}` : pathname, { scroll: false });
        }}
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
