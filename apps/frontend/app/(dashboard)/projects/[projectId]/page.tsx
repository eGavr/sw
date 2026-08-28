"use client";

import { Stack, Tabs, Title } from "@mantine/core";
import { useParams } from "next/navigation";

import { CloudsTab } from "@/components/clouds-tab";
import { EnvironmentsTab } from "@/components/environments-tab";

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();

  return (
    <Stack>
      <Title order={2}>{projectId}</Title>

      <Tabs defaultValue="environments">
        <Tabs.List>
          <Tabs.Tab value="environments">Environments</Tabs.Tab>
          <Tabs.Tab value="clouds">Clouds</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="environments" pt="md">
          <EnvironmentsTab project={projectId} />
        </Tabs.Panel>

        <Tabs.Panel value="clouds" pt="md">
          <CloudsTab project={projectId} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
