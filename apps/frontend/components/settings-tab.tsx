"use client";

import { Divider, Stack } from "@mantine/core";

import { CloudsTab } from "@/components/clouds-tab";
import { StorageSettings } from "@/components/storage-settings";

// The project's settings, section by section: where environments run (Cloud), and where session
// artifacts are written (Storage). Each section owns its own header and controls.
export function SettingsTab({ project }: { project: string }) {
  return (
    <Stack gap="xl">
      <CloudsTab project={project} />
      <Divider />
      <StorageSettings project={project} />
    </Stack>
  );
}
