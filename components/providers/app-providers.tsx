"use client";

import { ThemeProvider } from "next-themes";
import { StoreProvider } from "@/components/providers/store-provider";
import { Toaster } from "@/components/ui/sonner";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      forcedTheme="dark"
    >
      <StoreProvider>
        {children}
        <Toaster position="top-center" richColors />
      </StoreProvider>
    </ThemeProvider>
  );
}
