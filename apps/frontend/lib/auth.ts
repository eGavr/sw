import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";

// BFF (token-mediating backend): the sw access token is captured into the encrypted, httpOnly session
// JWT and used server-side only (the BFF proxy reads it) — it is NEVER surfaced to the browser via the
// session() callback. Keycloak creds/issuer come from AUTH_KEYCLOAK_ID/SECRET/ISSUER. See PLAN.md → UI.
export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [Keycloak],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.idToken = account.id_token;
      }

      return token;
    },
    async session({ session }) {
      // Deliberately expose only the user profile — the access token stays on the server.
      return session;
    },
  },
});
