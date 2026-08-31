"use client";

import { Divider, Stack, Text, Title } from "@mantine/core";

import { CloudsTab } from "@/components/clouds-tab";
import { StorageSettings } from "@/components/storage-settings";

// The project's settings, section by section: where environments run (Cloud), and where session
// artifacts are written (Storage).
export function SettingsTab({ project }: { project: string }) {
  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Title order={4}>Cloud</Title>
        <Text size="sm" c="dimmed">
          Where this project&apos;s environments run. Connect a cloud to create environments on it.
        </Text>
        <CloudsTab project={project} />
      </Stack>

      <Divider />

      <Stack gap="xs">
        <Title order={4}>Storage</Title>
        <Text size="sm" c="dimmed">
          Where this project&apos;s session logs and video are written.
        </Text>
        <StorageSettings project={project} />
      </Stack>
    </Stack>
  );
}
