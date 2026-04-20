import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** RTK Query + Supabase errors may use `message`, `data`, or nested shapes. */
export function formatQueryError(error: unknown): string {
  if (error == null) return "Unknown error";
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const e = error as Record<string, unknown>;
    if (typeof e.message === "string" && e.message.trim()) return e.message;
    if (e.data != null) {
      if (typeof e.data === "string") return e.data;
      if (typeof e.data === "object" && e.data !== null) {
        const d = e.data as Record<string, unknown>;
        if (typeof d.message === "string" && d.message.trim()) return d.message;
        if (typeof d.error === "string") return d.error;
      }
    }
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}
