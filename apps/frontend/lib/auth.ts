import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import Keycloak from "next-auth/providers/keycloak";

// BFF (token-mediating backend): the sw access token is captured into the encrypted, httpOnly session
// JWT and used server-side only (the BFF proxy reads it) — it is NEVER surfaced to the browser via the
// session() callback. Keycloak creds/issuer come from AUTH_KEYCLOAK_ID/SECRET/ISSUER. See PLAN.md → UI.

// Refresh a minute early so a token never expires mid-flight between the check and the upstream call.
const refreshSkewSeconds = 60;

// Keycloak access tokens live minutes; the session cookie lives much longer. Without rotation every
// sw call starts failing with a dead bearer soon after sign-in (the eternal-spinner bug).
async function refreshAccessToken(token: JWT): Promise<JWT> {
  const response = await fetch(`${process.env.AUTH_KEYCLOAK_ISSUER}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token.refreshToken ?? "",
      client_id: process.env.AUTH_KEYCLOAK_ID ?? "",
      client_secret: process.env.AUTH_KEYCLOAK_SECRET ?? "",
    }),
  });

  const refreshed = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in: number;
  };

  if (!response.ok) {
    throw new Error("refresh failed");
  }

  return {
    ...token,
    accessToken: refreshed.access_token,
    idToken: refreshed.id_token ?? token.idToken,
    // Keycloak rotates refresh tokens; fall back to the old one if the response omits it.
    refreshToken: refreshed.refresh_token ?? token.refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + refreshed.expires_in,
    error: undefined,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [Keycloak],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          idToken: account.id_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
        };
      }

      const freshUntil = ((token.expiresAt ?? 0) - refreshSkewSeconds) * 1000;

      if (Date.now() < freshUntil) {
        return token;
      }

      try {
        return await refreshAccessToken(token);
      } catch {
        // The session cookie outlived Keycloak's SSO session — the BFF turns this into 401 and the
        // UI sends the user through the login flow again.
        return { ...token, error: "RefreshTokenError" as const };
      }
    },
    async session({ session }) {
      // Deliberately expose only the user profile — the access token stays on the server.
      return session;
    },
  },
});
