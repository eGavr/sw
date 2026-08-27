"use client";

import { Center, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconFolderOpen } from "@tabler/icons-react";

export default function ProjectsIndexPage() {
  return (
    <Center h="60vh">
      <Stack align="center" gap="xs">
        <ThemeIcon variant="light" size={48} radius="xl">
          <IconFolderOpen size={26} />
        </ThemeIcon>
        <Text fw={500}>Select a project</Text>
        <Text size="sm" c="dimmed">
          Pick a project on the left, or create one.
        </Text>
      </Stack>
    </Center>
  );
}
