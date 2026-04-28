import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, isLocale, localeCookieKey } from "@/lib/i18n/messages";

type AppSurface = "all" | "client" | "admin";

function hasFileExtension(pathname: string) {
  return /\.[^/]+$/.test(pathname);
}

function getAppSurface(): AppSurface {
  const raw = (process.env.APP_SURFACE ?? "all").toLowerCase();
  if (raw === "client" || raw === "admin") return raw;
  return "all";
}

function getSegmentAfterLocale(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  const first = parts[0];
  if (isLocale(first)) {
    return parts[1] ?? null;
  }

  return first;
}

function getLocaleFromPathname(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const first = parts[0];
  return isLocale(first) ? first : null;
}

function isAllowedAdminPage(pathname: string) {
  const segment = getSegmentAfterLocale(pathname);
  return segment === "admin" || segment === "login" || segment === "setup";
}

function getRequestHost(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const hostHeader = forwardedHost ?? request.headers.get("host") ?? "";
  return hostHeader.split(":")[0]?.toLowerCase() ?? "";
}

function parseHostPatterns(raw: string | undefined) {
  if (!raw) return [] as string[];
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function matchesHost(host: string, pattern: string) {
  if (!host || !pattern) return false;
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1);
    return host.endsWith(suffix);
  }
  return host === pattern;
}

function matchesAnyHost(host: string, patterns: string[]) {
  return patterns.some((pattern) => matchesHost(host, pattern));
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const appSurface = getAppSurface();
  const requestHost = getRequestHost(request);
  const adminAllowedHosts = parseHostPatterns(process.env.ADMIN_ALLOWED_HOSTS);
  const clientAllowedHosts = parseHostPatterns(process.env.CLIENT_ALLOWED_HOSTS);

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

  if (appSurface === "client") {
    if (adminAllowedHosts.length > 0 && matchesAnyHost(requestHost, adminAllowedHosts)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (
      clientAllowedHosts.length > 0 &&
      !matchesAnyHost(requestHost, clientAllowedHosts) &&
      requestHost !== "localhost"
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (pathname.includes("/admin")) {
      const redirectTo = request.nextUrl.clone();
      const localeFromPath = getLocaleFromPathname(pathname);
      if (localeFromPath) {
        redirectTo.pathname = `/${localeFromPath}/login`;
      } else {
        const cookieLocale = request.cookies.get(localeCookieKey)?.value;
        const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;
        redirectTo.pathname = `/${locale}/login`;
      }
      redirectTo.search = "error=forbidden";
      return NextResponse.redirect(redirectTo);
    }
    if (pathname.startsWith("/api/admin/")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  if (appSurface === "admin") {
    if (
      adminAllowedHosts.length > 0 &&
      !matchesAnyHost(requestHost, adminAllowedHosts) &&
      requestHost !== "localhost"
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (clientAllowedHosts.length > 0 && matchesAnyHost(requestHost, clientAllowedHosts)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (pathname.startsWith("/api/client/")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!pathname.startsWith("/api/") && !isAllowedAdminPage(pathname)) {
      const cookieLocale = request.cookies.get(localeCookieKey)?.value;
      const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;
      const redirectTo = request.nextUrl.clone();
      redirectTo.pathname = `/${locale}/login`;
      redirectTo.search = "";
      return NextResponse.redirect(redirectTo);
    }
    if (pathname.includes("/client")) {
      const cookieLocale = request.cookies.get(localeCookieKey)?.value;
      const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;
      const redirectTo = request.nextUrl.clone();
      redirectTo.pathname = `/${locale}/login`;
      redirectTo.search = "error=forbidden";
      return NextResponse.redirect(redirectTo);
    }
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
