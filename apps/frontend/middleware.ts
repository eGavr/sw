import { auth } from "@/lib/auth";

// Gate every PAGE behind a session: no session → bounce to /login. API routes are excluded — they
// handle auth themselves (the /api/sw/* proxy returns 401 JSON; /api/auth/* runs the sign-in flow),
// so a fetch() never gets an HTML redirect. Login page and static assets are excluded too.
export default auth((req) => {
  if (!req.auth) {
    return Response.redirect(new URL("/login", req.nextUrl.origin));
  }
});

export const config = {
  matcher: ["/((?!api|login|_next|favicon.ico).*)"],
};
