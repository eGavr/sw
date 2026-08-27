import "next-auth/jwt";

declare module "next-auth/jwt" {
  interface JWT {
    // Held server-side only (BFF); never exposed to the browser.
    accessToken?: string;
    idToken?: string;
  }
}
