"use server";

import { signIn, signOut } from "@/lib/auth";

export async function signInAction(): Promise<void> {
  await signIn("keycloak", { redirectTo: "/projects" });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
