"use client";

import { Alert, Anchor, Button, Center, Group, Loader, Stack, Text } from "@mantine/core";
import { IconArrowLeft, IconTrash, IconWorld } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { SessionCommand, SessionCommandBar } from "@/components/session-command-bar";
import { addFreeing } from "@/lib/freeing-store";
import { getEnvironmentSession, interactiveViewerUrl, killSession, navigateSession } from "@/lib/sw";

const railWidth = 260;

// The dedicated live view: nothing but the session's screen, full height, with a slim command rail on
// the right — commands scale downward in the rail, so however many arrive, the screen stays the star.
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
  const projectHref = `/projects/${project}`;
  const sessionsHref = `${projectHref}?tab=sessions&${
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

  const commands: Array<SessionCommand> = [
    {
      key: "navigate",
      label: "Open URL",
      placeholder: "https://…",
      inputIcon: <IconWorld size={14} />,
      run: (url) => navigateSession(sessionId, url),
    },
    {
      key: "delete",
      label: "Delete session",
      color: "red",
      destructive: true,
      icon: <IconTrash size={14} />,
      run: () => killSession(sessionId),
      onSuccess: onKilled,
    },
  ];

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
            href={projectHref}
            variant="default"
            leftSection={<IconArrowLeft size={16} />}
          >
            Back to project
          </Button>
        </Stack>
      </Center>
    );
  }

  return (
    <Group align="stretch" gap="sm" wrap="nowrap" p="sm" h="100vh">
      <iframe
        src={interactiveViewerUrl(sessionId)}
        style={{ flex: 1, height: "100%", border: "1px solid var(--mantine-color-gray-3)" }}
        title="Live VNC"
      />

      <Stack w={railWidth} gap="sm" style={{ flexShrink: 0 }}>
        <Anchor component={Link} href={projectHref} size="sm" c="dimmed">
          <Group gap={4} wrap="nowrap">
            <IconArrowLeft size={14} />
            Back to project
          </Group>
        </Anchor>

        <Text fw={600} size="sm">
          Session
        </Text>
        <Text size="xs" c="dimmed" ff="monospace" truncate title={sessionId}>
          {sessionId}
        </Text>

        <SessionCommandBar vertical commands={commands} />

        <Anchor component={Link} href={sessionsHref} size="xs" c="dimmed">
          Logs &amp; video
        </Anchor>
      </Stack>
    </Group>
  );
}
