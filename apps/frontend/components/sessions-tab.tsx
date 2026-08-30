"use client";

import { Alert, Button, Code, Group, Loader, Stack, Tabs, Text, TextInput } from "@mantine/core";
import { IconExternalLink, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { SessionCommand, SessionCommandBar } from "@/components/session-command-bar";
import { addFreeing } from "@/lib/freeing-store";
import {
  getEnvironmentSession,
  getSessionLogs,
  interactiveViewerUrl,
  killSession,
  navigateSession,
  sessionVideoUrl,
} from "@/lib/sw";

// WebDriver's Navigate To wants an absolute URL; a pasted bare host gets the obvious scheme.
function absoluteUrl(url: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`;
}

// The project's session viewer — stateless capability access: whoever holds a session id may watch it.
// Works for the live session (VNC) and for past ones (logs/video, which only exist after a session
// ends). Session control (delete, navigate) lives with the live view, on the VNC tab.
export function SessionsTab({
  project,
  initialSessionId,
  environmentUid,
}: {
  project: string;
  initialSessionId?: string;
  // Known when deep-linked from an environment row: without an explicit session id the tab recovers
  // the row's live one itself (which is what makes the busy arrow a real, new-tab-able link), and a
  // kill marks that row as "freeing".
  environmentUid?: string;
}) {
  const queryClient = useQueryClient();

  const [sessionId, setSessionId] = useState(initialSessionId ?? "");
  const [killed, setKilled] = useState(false);

  // Deep-linked by environment only: ask the api for the environment's current session (creator-only
  // endpoint) and seed the input with it, as if the user pasted the id.
  const recovery = useQuery({
    queryKey: ["environmentSession", project, environmentUid],
    queryFn: () => getEnvironmentSession(project, environmentUid as string),
    enabled: !initialSessionId && !!environmentUid,
    retry: false,
  });

  useEffect(() => {
    if (recovery.data) {
      setSessionId(recovery.data.sessionId);
    }
  }, [recovery.data]);

  const id = sessionId.trim();
  // A session id is base64url(endpoint) + "." + node session id — open the viewer as soon as the
  // pasted value looks like one (no Open button; the length gate keeps half-typed input quiet).
  const looksLikeSessionId = id.length > 24 && /^[A-Za-z0-9_-]+\.\S+$/.test(id);

  // A deep link means a live session (the row was busy) — land on its live view; a hand-pasted id is
  // usually a finished session someone came to inspect — land on the logs.
  const deepLinked = Boolean(initialSessionId ?? environmentUid);

  const logs = useQuery({
    queryKey: ["sessionLogs", project, id],
    queryFn: () => getSessionLogs(project, id),
    enabled: looksLikeSessionId,
    retry: false,
  });

  const onKilled = (): void => {
    // Bridge the heartbeat gap on the environments table: the busy hint clears in ~3s, until then
    // the row shows "freeing" (only when we know which row this session lived on — whether the id
    // arrived in the deep link or was recovered from the row).
    if (environmentUid && (sessionId === initialSessionId || sessionId === recovery.data?.sessionId)) {
      addFreeing(environmentUid);
    }

    setKilled(true);
    void queryClient.invalidateQueries({ queryKey: ["environments", project] });
  };

  const commands: Array<SessionCommand> = [
    {
      key: "navigate",
      label: "Go",
      placeholder: "https://example.com",
      run: (url) => navigateSession(id, absoluteUrl(url)),
    },
    {
      key: "delete",
      label: "Delete",
      color: "red",
      icon: <IconTrash size={14} />,
      run: () => killSession(id),
      onSuccess: onKilled,
    },
  ];

  return (
    <Stack>
      <TextInput
        placeholder="session id…"
        value={sessionId}
        onChange={(e) => {
          setSessionId(e.currentTarget.value);
          setKilled(false);
        }}
      />

      {killed && <Alert color="green">Session deleted.</Alert>}
      {recovery.isLoading && <Loader size="sm" />}
      {recovery.error && (
        <Alert color="gray">Session not found — it may have just ended.</Alert>
      )}

      {!looksLikeSessionId && !recovery.isLoading && (
        <Text c="dimmed" size="sm">
          Paste a session id (or come from an environment row) to view its live VNC, logs and video.
          Nothing is stored — access is by possession of the id.
        </Text>
      )}

      {looksLikeSessionId && (
        <Tabs defaultValue={deepLinked ? "vnc" : "logs"}>
          <Tabs.List>
            <Tabs.Tab value="logs">Logs</Tabs.Tab>
            <Tabs.Tab value="video">Video</Tabs.Tab>
            <Tabs.Tab value="vnc">Live VNC</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="logs" pt="md">
            {logs.isLoading && <Loader size="sm" />}
            {!logs.isLoading && (logs.data === null || logs.data === undefined) && (
              <Alert color="gray">
                No logs yet — they appear after the session ends, and only when it was created with
                sw:logging.
              </Alert>
            )}
            {typeof logs.data === "string" && (
              <Code block style={{ maxHeight: "60vh", overflow: "auto", whiteSpace: "pre" }}>
                {logs.data}
              </Code>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="video" pt="md">
            <Stack gap="xs">
              <Alert color="gray">
                The recording appears after the session ends, and only when it was created with
                sw:video — if the player below stays empty, there is nothing recorded (yet).
              </Alert>
              {/* The BFF streams the mp4 with auth; the browser only needs its session cookie. */}
              <video
                controls
                src={sessionVideoUrl(project, id)}
                style={{ width: "100%", maxHeight: "60vh", background: "black" }}
              />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="vnc" pt="md">
            <Stack gap="xs">
              {/* Session control belongs to the live view: plain WebDriver commands on the left, the
                  viewer affordance on the right. */}
              <Group justify="space-between" align="center">
                <SessionCommandBar commands={commands} />
                <Button
                  component="a"
                  href={interactiveViewerUrl(id)}
                  target="_blank"
                  variant="default"
                  size="compact-sm"
                  leftSection={<IconExternalLink size={14} />}
                >
                  Open in new tab
                </Button>
              </Group>
              {/* Live only: once the session ends the node is gone and the frame goes dark. */}
              <iframe
                src={interactiveViewerUrl(id)}
                style={{ width: "100%", height: "60vh", border: "1px solid var(--mantine-color-gray-3)" }}
                title="Live VNC"
              />
            </Stack>
          </Tabs.Panel>
        </Tabs>
      )}
    </Stack>
  );
}
