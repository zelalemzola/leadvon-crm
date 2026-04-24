"use client";

import { ThemeProvider } from "next-themes";
import { StoreProvider } from "@/components/providers/store-provider";
import { I18nProvider } from "@/components/providers/i18n-provider";
import { Toaster } from "@/components/ui/sonner";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      forcedTheme="dark"
    >
      <I18nProvider>
        <StoreProvider>
          {children}
          <Toaster position="top-center" richColors />
        </StoreProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
