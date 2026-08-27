"use client";

import { Button, Group, Stack, Text, TextInput, Title } from "@mantine/core";

export default function InspectPage() {
  return (
    <Stack>
      <Title order={2}>Inspect session</Title>
      <Text c="dimmed">
        Paste a session id to view its live VNC, logs and video. Nothing is stored — access is by
        possession of the id (capability). Wired in step 5.
      </Text>
      <Group>
        <TextInput placeholder="session id…" style={{ flex: 1 }} disabled />
        <Button disabled>Open</Button>
      </Group>
    </Stack>
  );
}
