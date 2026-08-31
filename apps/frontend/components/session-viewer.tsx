"use client";

import { Alert, Anchor, Box, Button, Center, Group, Loader, Stack, Tabs, Text } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

import { SessionLiveView } from "@/components/session-live-view";
import { SessionLogs } from "@/components/session-logs";
import { SessionVideo } from "@/components/session-video";
import { addFreeing } from "@/lib/freeing-store";
import { getEnvironmentSession, isSessionAlive } from "@/lib/sw";

// The full-screen live view: nothing but the session's screen and its command rail. Liveness is
// watched, not sampled once — when the session dies (our delete or anything external), the page turns
// into the session's afterlife (logs and video) instead of leaving noVNC's dark placeholder filling
// the window.
export function SessionViewer({
  project,
  initialSessionId,
  environmentUid,
}: {
  project: string;
  initialSessionId?: string;
  environmentUid?: string;
}) {
  const queryClient = useQueryClient();
  const [killed, setKilled] = useState(false);

  // Deep-linked by environment: recover its current session (creator-only endpoint) on open.
  const recovery = useQuery({
    queryKey: ["environmentSession", project, environmentUid],
    queryFn: () => getEnvironmentSession(project, environmentUid as string),
    enabled: !initialSessionId && !!environmentUid,
    retry: false,
  });

  const sessionId = (initialSessionId ?? recovery.data?.sessionId ?? "").trim();

  useEffect(() => {
    if (recovery.data) {
      // Recovery came off the node's live status — it IS the first liveness answer.
      queryClient.setQueryData(["sessionAlive", recovery.data.sessionId.trim()], true);
    }
  }, [recovery.data, queryClient]);

  const probe = useQuery({
    queryKey: ["sessionAlive", sessionId],
    queryFn: () => isSessionAlive(sessionId),
    enabled: sessionId !== "",
    retry: false,
    refetchInterval: (query) => (query.state.data === false ? false : 5_000),
  });
  const alive = probe.isError ? false : probe.data;

  // Back lands on the Sessions tab with this very session pre-filled; liveness decides the tab there
  // (a live session reopens its view, a finished one lands on the logs).
  const backHref = sessionId
    ? `/projects/${project}?tab=sessions&session=${encodeURIComponent(sessionId)}`
    : `/projects/${project}?tab=sessions`;

  const onKilled = (): void => {
    // Bridge the heartbeat gap on the environments table: the row shows "freeing" until the agent's
    // word clears busy (~3s).
    if (environmentUid) {
      addFreeing(environmentUid);
    }

    queryClient.setQueryData(["sessionAlive", sessionId], false);
    setKilled(true);
  };

  const back = (
    <Anchor component={Link} href={backHref} size="sm" c="dimmed">
      <Group gap={4} wrap="nowrap">
        <IconArrowLeft size={14} />
        Back
      </Group>
    </Anchor>
  );

  if (recovery.isLoading || (sessionId !== "" && alive === undefined)) {
    return (
      <Center h="100vh">
        <Loader size="sm" />
      </Center>
    );
  }

  if (!sessionId) {
    return (
      <Center h="100vh">
        <Stack align="center" gap="sm">
          <Alert color="gray">Session not found — it may have just ended.</Alert>
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

  if (killed || alive === false) {
    return (
      <Box p="md" maw={960} mx="auto">
        <Stack gap="sm">
          {back}
          <Text c={killed ? "green" : "dimmed"} size="sm">
            {killed ? "Session deleted." : "The session is not active."}
          </Text>
          <Tabs defaultValue="logs">
            <Tabs.List>
              <Tabs.Tab value="logs">Logs</Tabs.Tab>
              <Tabs.Tab value="video">Video</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="logs" pt="md">
              <SessionLogs project={project} sessionId={sessionId} />
            </Tabs.Panel>
            <Tabs.Panel value="video" pt="md">
              <SessionVideo key={sessionId} project={project} sessionId={sessionId} />
            </Tabs.Panel>
          </Tabs>
        </Stack>
      </Box>
    );
  }

  return (
    <Box p="sm" h="100vh">
      <SessionLiveView sessionId={sessionId} onKilled={onKilled} height="100%" railHeader={back} />
    </Box>
  );
}
