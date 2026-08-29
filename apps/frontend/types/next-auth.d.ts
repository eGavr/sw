import "next-auth/jwt";

declare module "next-auth/jwt" {
  interface JWT {
    // Held server-side only (BFF); never exposed to the browser.
    accessToken?: string;
    idToken?: string;
    refreshToken?: string;
    // Unix seconds the access token expires at (from Keycloak's expires_in).
    expiresAt?: number;
    // Set when a refresh attempt failed — the BFF answers 401 and the UI re-authenticates.
    error?: "RefreshTokenError";
  }
}
