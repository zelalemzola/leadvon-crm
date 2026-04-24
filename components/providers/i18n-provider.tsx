"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  defaultLocale,
  isLocale,
  localeCookieKey,
  messages,
  type Locale,
  type Messages,
} from "@/lib/i18n/messages";

const storageKey = localeCookieKey;

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (path: string) => string;
  localizePath: (path: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function lookupMessage(dict: Messages, path: string): string | undefined {
  const parts = path.split(".");
  let current: unknown = dict;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  useEffect(() => {
    const firstSegment = pathname.split("/").filter(Boolean)[0];
    if (isLocale(firstSegment)) {
      setLocaleState(firstSegment);
      window.localStorage.setItem(storageKey, firstSegment);
      document.cookie = `${storageKey}=${firstSegment}; path=/; max-age=31536000`;
      return;
    }

    const saved = window.localStorage.getItem(storageKey);
    if (isLocale(saved)) {
      setLocaleState(saved);
    }
  }, [pathname]);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(storageKey, next);
    document.cookie = `${storageKey}=${next}; path=/; max-age=31536000`;

    const segments = pathname.split("/").filter(Boolean);
    const currentHasLocale = isLocale(segments[0]);
    const suffix = currentHasLocale ? segments.slice(1) : segments;
    const nextPath = `/${next}${suffix.length ? `/${suffix.join("/")}` : ""}`;
    router.replace(nextPath);
  };

  const value = useMemo<I18nContextValue>(() => {
    const localizePath = (path: string) => {
      const normalized = path.startsWith("/") ? path : `/${path}`;
      return `/${locale}${normalized}`;
    };
    return {
      locale,
      setLocale,
      t: (path: string) =>
        lookupMessage(messages[locale], path) ??
        lookupMessage(messages[defaultLocale], path) ??
        path,
      localizePath,
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
