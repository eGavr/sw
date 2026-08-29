"use client";

import { Stack, Text, Title } from "@mantine/core";

import { CloudsTab } from "@/components/clouds-tab";

// The project's settings, section by section. Cloud connections come first; storage (S3 bucket for
// logs/video) and further settings join here over time.
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
    </Stack>
  );
}
