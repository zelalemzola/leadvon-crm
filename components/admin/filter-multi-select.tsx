"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type FilterMultiSelectOption = {
  value: string;
  label: string;
};

type FilterMultiSelectProps = {
  label: string;
  placeholder?: string;
  options: FilterMultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  className?: string;
  emptyMeansAllHint?: string;
};

export function FilterMultiSelect({
  label,
  placeholder = "All",
  options,
  value,
  onChange,
  className,
  emptyMeansAllHint = "Leave empty to include all.",
}: FilterMultiSelectProps) {
  const selectedLabels = options
    .filter((option) => value.includes(option.value))
    .map((option) => option.label);

  const triggerLabel =
    selectedLabels.length === 0
      ? placeholder
      : selectedLabels.length <= 2
        ? selectedLabels.join(", ")
        : `${selectedLabels.length} selected`;

  function toggleOption(optionValue: string, checked: boolean) {
    if (checked) {
      onChange([...value, optionValue]);
      return;
    }
    onChange(value.filter((item) => item !== optionValue));
  }

  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-sm font-medium">{label}</p>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            className="h-9 w-full justify-between font-normal"
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
          <div className="max-h-56 space-y-1 overflow-y-auto">
            {options.map((option) => {
              const checked = value.includes(option.value);
              return (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(next) => toggleOption(option.value, next === true)}
                  />
                  <span>{option.label}</span>
                  {checked ? <Check className="ml-auto size-3.5 opacity-60" /> : null}
                </label>
              );
            })}
          </div>
          {value.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 h-7 w-full"
              onClick={() => onChange([])}
            >
              Clear selection
            </Button>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">{emptyMeansAllHint}</p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
