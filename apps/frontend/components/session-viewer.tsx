"use client";

import { Alert, Anchor, Box, Button, Center, Group, Loader, Stack, Text } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { SessionLiveView } from "@/components/session-live-view";
import { addFreeing } from "@/lib/freeing-store";
import { getEnvironmentSession } from "@/lib/sw";

// The full-screen live view: nothing but the session's screen and its command rail — navigation back
// lands on the project's Sessions tab, which re-opens this session's view.
export function SessionViewer({
  project,
  initialSessionId,
  environmentUid,
}: {
  project: string;
  initialSessionId?: string;
  environmentUid?: string;
}) {
  const [killed, setKilled] = useState(false);

  // Deep-linked by environment: recover its current session (creator-only endpoint) on open.
  const recovery = useQuery({
    queryKey: ["environmentSession", project, environmentUid],
    queryFn: () => getEnvironmentSession(project, environmentUid as string),
    enabled: !initialSessionId && !!environmentUid,
    retry: false,
  });

  const sessionId = initialSessionId ?? recovery.data?.sessionId ?? "";
  const backHref = `/projects/${project}?tab=sessions&${
    environmentUid ? `env=${environmentUid}` : `session=${encodeURIComponent(sessionId)}`
  }`;

  const onKilled = (): void => {
    // Bridge the heartbeat gap on the environments table: the row shows "freeing" until the agent's
    // word clears busy (~3s).
    if (environmentUid) {
      addFreeing(environmentUid);
    }

    setKilled(true);
  };

  if (recovery.isLoading) {
    return (
      <Center h="100vh">
        <Loader size="sm" />
      </Center>
    );
  }

  if (killed || !sessionId) {
    return (
      <Center h="100vh">
        <Stack align="center" gap="sm">
          <Alert color={killed ? "green" : "gray"}>
            {killed ? "Session deleted." : "Session not found — it may have just ended."}
          </Alert>
          <Button
            component={Link}
            href={backHref}
            variant="default"
            leftSection={<IconArrowLeft size={16} />}
          >
            Back
          </Button>
        </Stack>
      </Center>
    );
  }

  return (
    <Box p="sm" h="100vh">
      <SessionLiveView
        sessionId={sessionId}
        onKilled={onKilled}
        height="100%"
        railHeader={
          <>
            <Anchor component={Link} href={backHref} size="sm" c="dimmed">
              <Group gap={4} wrap="nowrap">
                <IconArrowLeft size={14} />
                Back
              </Group>
            </Anchor>
            <Text size="xs" c="dimmed" ff="monospace" truncate title={sessionId}>
              {sessionId}
            </Text>
          </>
        }
      />
    </Box>
  );
}
