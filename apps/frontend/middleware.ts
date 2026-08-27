import { auth } from "@/lib/auth";

// Gate every page behind a session: no session → bounce to /login. The matcher excludes the login page
// itself, the Auth.js endpoints, and static assets (else the sign-in flow would loop).
export default auth((req) => {
  if (!req.auth) {
    return Response.redirect(new URL("/login", req.nextUrl.origin));
  }
});

export const config = {
  matcher: ["/((?!login|api/auth|_next|favicon.ico).*)"],
};
