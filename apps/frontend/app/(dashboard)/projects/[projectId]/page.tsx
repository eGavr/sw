"use client";

import { Stack, Tabs, Text, Title } from "@mantine/core";
import { useParams } from "next/navigation";

import { EnvironmentsTab } from "@/components/environments-tab";
import { ProvidersTab } from "@/components/providers-tab";

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();

  return (
    <Stack>
      <Title order={2}>{projectId}</Title>

      <Tabs defaultValue="environments">
        <Tabs.List>
          <Tabs.Tab value="environments">Environments</Tabs.Tab>
          <Tabs.Tab value="providers">Providers</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="environments" pt="md">
          <EnvironmentsTab project={projectId} />
        </Tabs.Panel>

        <Tabs.Panel value="providers" pt="md">
          <ProvidersTab />
        </Tabs.Panel>
      </Tabs>

      <Text size="xs" c="dimmed">
        Providers are still mock — the real Providers UI comes after the CloudAccount × ComputeBinding
        refactor.
      </Text>
    </Stack>
  );
}
