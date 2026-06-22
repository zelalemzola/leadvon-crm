"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { type DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type DatePreset = "7" | "30" | "90" | "all";

export type DateFilterValue = {
  preset: DatePreset;
  customRange?: DateRange;
};

type DateRangeFilterProps = {
  value: DateFilterValue;
  onChange: (value: DateFilterValue) => void;
  presetLabels: Record<DatePreset, string>;
  customRangeLabel: string;
  className?: string;
};

export function DateRangeFilter({
  value,
  onChange,
  presetLabels,
  customRangeLabel,
  className,
}: DateRangeFilterProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);

  const customLabel = useMemo(() => {
    const from = value.customRange?.from;
    const to = value.customRange?.to;
    if (!from || !to) return customRangeLabel;
    return `${format(from, "MMM d, yyyy")} – ${format(to, "MMM d, yyyy")}`;
  }, [value.customRange, customRangeLabel]);

  const activePresetLabel = presetLabels[value.preset];
  const usingCustomRange = Boolean(value.customRange?.from && value.customRange?.to);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="lg"
            className={cn(
              "h-9 shrink-0 gap-2 px-3 font-normal",
              !usingCustomRange && "border-primary/40"
            )}
          >
            <CalendarIcon className="size-4" />
            <span className="max-w-[10rem] truncate sm:max-w-none">{activePresetLabel}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[10rem]">
          {(["7", "30", "90", "all"] as const).map((preset) => (
            <DropdownMenuItem
              key={preset}
              onClick={() => onChange({ preset, customRange: undefined })}
            >
              {presetLabels[preset]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="lg"
            className={cn(
              "h-9 shrink-0 gap-2 px-3 font-normal",
              usingCustomRange && "border-primary/40"
            )}
          >
            <CalendarIcon className="size-4" />
            <span className="max-w-[12rem] truncate sm:max-w-none">{customLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            selected={value.customRange}
            onSelect={(range) => {
              onChange({ preset: value.preset, customRange: range });
              if (range?.from && range?.to) {
                setCalendarOpen(false);
              }
            }}
            numberOfMonths={2}
            defaultMonth={value.customRange?.from}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function dateFilterToRange(value: DateFilterValue): {
  dateFrom?: string;
  dateTo?: string;
} {
  if (value.customRange?.from && value.customRange?.to) {
    return {
      dateFrom: format(value.customRange.from, "yyyy-MM-dd"),
      dateTo: format(value.customRange.to, "yyyy-MM-dd"),
    };
  }
  if (value.preset === "all") return {};
  const days = Number(value.preset);
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return {
    dateFrom: format(from, "yyyy-MM-dd"),
    dateTo: format(to, "yyyy-MM-dd"),
  };
}
