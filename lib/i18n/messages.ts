export type Locale = "en" | "fr";

export const defaultLocale: Locale = "en";
export const localeCookieKey = "leadvon.locale";

import en from "@/locales/en.json";
import fr from "@/locales/fr.json";

export const locales: Locale[] = ["en", "fr"];
export const messages = { en, fr } as const;

export type Messages = (typeof messages)[Locale];

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "fr";
}
