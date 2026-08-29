"use client";

import { Alert, Button, Group, Stack, Text, TextInput, Title } from "@mantine/core";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { killSession } from "@/lib/sw";

// Stateless capability access: whoever holds a session id may act on the session. Nothing is stored —
// paste the id you copied at creation. VNC / logs / video views arrive in step 5; kill works today.
export default function InspectPage() {
  const [sessionId, setSessionId] = useState("");

  const kill = useMutation({ mutationFn: () => killSession(sessionId.trim()) });

  return (
    <Stack>
      <Title order={2}>Inspect session</Title>
      <Text c="dimmed">
        Paste a session id to act on the session. Nothing is stored — access is by possession of the
        id (capability). Live VNC, logs and video are wired in step 5.
      </Text>
      <Group>
        <TextInput
          placeholder="session id…"
          style={{ flex: 1 }}
          value={sessionId}
          onChange={(e) => {
            setSessionId(e.currentTarget.value);
            kill.reset();
          }}
        />
        <Button
          color="red"
          disabled={sessionId.trim().length === 0}
          loading={kill.isPending}
          onClick={() => kill.mutate()}
        >
          Kill session
        </Button>
      </Group>
      {kill.isSuccess && <Alert color="green">Session terminated.</Alert>}
      {kill.error && <Alert color="red">{(kill.error as Error).message}</Alert>}
    </Stack>
  );
}
