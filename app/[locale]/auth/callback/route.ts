import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { defaultLocale, isLocale } from "@/lib/i18n/messages";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const fallback = `/${defaultLocale}/client`;
      const redirectPath = next && next.startsWith("/") ? next : fallback;
      return NextResponse.redirect(`${origin}${redirectPath}`);
    }
  }

  const localeFromNext = next?.split("/").filter(Boolean)[0];
  const locale = isLocale(localeFromNext) ? localeFromNext : defaultLocale;
  return NextResponse.redirect(`${origin}/${locale}/login?error=auth`);
}
