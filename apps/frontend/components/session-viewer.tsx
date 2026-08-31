"use client";

import { Anchor, Box, Center, Group, Loader } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { SessionLiveView } from "@/components/session-live-view";
import { addFreeing } from "@/lib/freeing-store";
import { getEnvironmentSession } from "@/lib/sw";

// The full-screen view is a dumb window on the session's VNC path (user decision): exactly what a
// hand-built viewer URL would show — a dead or silent session is noVNC's own placeholder, nothing of
// ours replaces it. No liveness watching here; the Sessions tab is where state is interpreted.
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

  const sessionId = (initialSessionId ?? recovery.data?.sessionId ?? "").trim();

  // Back lands on the Sessions tab with this very session pre-filled; liveness decides the tab there
  // (a live session reopens its view, a finished one lands on the logs).
  const backHref = sessionId
    ? `/projects/${project}?tab=sessions&session=${encodeURIComponent(sessionId)}`
    : `/projects/${project}?tab=sessions`;

  const onKilled = (): void => {
    // Bridge the heartbeat gap on the environments table: the row shows "freeing" until the agent's
    // word clears busy (~3s). The view itself stays put — the frame goes dark on its own.
    if (environmentUid) {
      addFreeing(environmentUid);
    }

    notifications.show({ color: "green", message: "Session deleted", autoClose: 4_000 });
    setKilled(true);
  };

  if (recovery.isLoading) {
    return (
      <Center h="100vh">
        <Loader size="sm" />
      </Center>
    );
  }

  // No session recovered (it just ended, or never was): the very same window a delete leaves behind —
  // the raw frame with noVNC's own placeholder, controls withdrawn, only Back in the rail.
  return (
    <Box p="sm" h="100vh">
      <SessionLiveView
        sessionId={sessionId}
        onKilled={onKilled}
        height="100%"
        controls={!killed && sessionId !== ""}
        railHeader={
          <Anchor component={Link} href={backHref} size="sm" c="dimmed">
            <Group gap={4} wrap="nowrap">
              <IconArrowLeft size={14} />
              Back
            </Group>
          </Anchor>
        }
      />
    </Box>
  );
}
