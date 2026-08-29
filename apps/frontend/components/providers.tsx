"use client";

import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { useState } from "react";

import { theme } from "@/lib/theme";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 5_000, refetchOnWindowFocus: false } },
      }),
  );

  return (
    // The periodic session ping is what drives access-token refresh for a page that sits still: each
    // ping runs the jwt callback on the server (rotating the Keycloak token near expiry) and re-sets
    // the cookie. Without it only navigations refresh, and a parked tab goes stale into 401s.
    <SessionProvider refetchInterval={60}>
      <QueryClientProvider client={queryClient}>
        <MantineProvider theme={theme}>{children}</MantineProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
