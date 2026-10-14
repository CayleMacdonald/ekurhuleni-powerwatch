import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let res = NextResponse.next({ request: req });
  if (!url || !anon) return res; // demo mode: no auth available

  const sb = createServerClient(url, anon, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list: CookieToSet[]) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const {
    data: { user },
  } = await sb.auth.getUser();

  const p = req.nextUrl.pathname;
  if (!user && (p.startsWith("/settings") || p.startsWith("/admin"))) {
    const to = req.nextUrl.clone();
    to.pathname = "/login";
    to.searchParams.set("next", p);
    return NextResponse.redirect(to);
  }
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|.*\\.(?:png|svg|jpg|ico)$|api/cron).*)"] };

type CookieToSet = { name: string; value: string; options?: any };
