"use client";

import { Loader, Stack, Tabs, Title } from "@mantine/core";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { EnvironmentsTab } from "@/components/environments-tab";
import { SessionsTab } from "@/components/sessions-tab";
import { SettingsTab } from "@/components/settings-tab";

// Tabs live in the URL (?tab=…&session=…) so environment rows and modals can deep-link into the
// Sessions viewer with the id prefilled.
function ProjectContent() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const tab = params.get("tab") ?? "environments";
  const session = params.get("session") ?? undefined;
  const environmentUid = params.get("env") ?? undefined;

  const switchTab = (next: string | null): void => {
    router.replace(next && next !== "environments" ? `${pathname}?tab=${next}` : pathname);
  };

  return (
    <Stack>
      <Title order={2}>{projectId}</Title>

      <Tabs value={tab} onChange={switchTab}>
        <Tabs.List>
          <Tabs.Tab value="environments">Environments</Tabs.Tab>
          <Tabs.Tab value="sessions">Sessions</Tabs.Tab>
          <Tabs.Tab value="settings">Settings</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="environments" pt="md">
          <EnvironmentsTab project={projectId} />
        </Tabs.Panel>

        <Tabs.Panel value="sessions" pt="md">
          {/* Keyed by the deep link (explicit session or environment to recover from) so a new link
              re-seeds the input. */}
          <SessionsTab
            key={session ?? environmentUid ?? "manual"}
            project={projectId}
            initialSessionId={session}
            environmentUid={environmentUid}
          />
        </Tabs.Panel>

        <Tabs.Panel value="settings" pt="md">
          <SettingsTab project={projectId} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

export default function ProjectPage() {
  return (
    <Suspense fallback={<Loader size="sm" />}>
      <ProjectContent />
    </Suspense>
  );
}
