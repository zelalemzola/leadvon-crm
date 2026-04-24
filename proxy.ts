import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, isLocale, localeCookieKey } from "@/lib/i18n/messages";

function hasFileExtension(pathname: string) {
  return /\.[^/]+$/.test(pathname);
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (
    !pathname.startsWith("/api/") &&
    !pathname.startsWith("/_next/") &&
    pathname !== "/favicon.ico" &&
    !hasFileExtension(pathname)
  ) {
    const parts = pathname.split("/").filter(Boolean);
    const maybeLocale = parts[0];

    if (isLocale(maybeLocale)) {
      const response = NextResponse.next({ request });
      response.cookies.set(localeCookieKey, maybeLocale, { path: "/" });
      return response;
    }

    const cookieLocale = request.cookies.get(localeCookieKey)?.value;
    const activeLocale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;
    const redirectTo = request.nextUrl.clone();
    redirectTo.pathname = `/${activeLocale}${pathname === "/" ? "" : pathname}`;
    redirectTo.search = search;
    return NextResponse.redirect(redirectTo);
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
