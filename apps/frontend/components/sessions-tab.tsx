"use client";

import {
  Alert,
  Button,
  Code,
  Group,
  Loader,
  Stack,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import { IconExternalLink, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { addFreeing } from "@/lib/freeing-store";
import { getSessionLogs, interactiveViewerUrl, killSession, sessionVideoUrl } from "@/lib/sw";

// The project's session viewer — stateless capability access: whoever holds a session id may watch it.
// Works for the live session (VNC) and for past ones (logs/video, which only exist after a session
// ends). Killing also lives here: possession of the id is the authorization.
export function SessionsTab({
  project,
  initialSessionId,
  environmentUid,
}: {
  project: string;
  initialSessionId?: string;
  // Known when deep-linked from an environment row — lets a kill mark that row as "freeing".
  environmentUid?: string;
}) {
  const queryClient = useQueryClient();

  const [sessionId, setSessionId] = useState(initialSessionId ?? "");
  const [opened, setOpened] = useState(Boolean(initialSessionId));

  const id = sessionId.trim();

  const logs = useQuery({
    queryKey: ["sessionLogs", project, id],
    queryFn: () => getSessionLogs(project, id),
    enabled: opened && id.length > 0,
    retry: false,
  });

  const kill = useMutation({
    mutationFn: () => killSession(id),
    onSuccess: () => {
      // Bridge the heartbeat gap on the environments table: the busy hint clears in ~3s, until then
      // the row shows "freeing" (only when we know which row this session lived on).
      if (environmentUid && sessionId === initialSessionId) {
        addFreeing(environmentUid);
      }

      void queryClient.invalidateQueries({ queryKey: ["environments", project] });
    },
  });

  return (
    <Stack>
      <Group>
        <TextInput
          placeholder="session id…"
          style={{ flex: 1 }}
          value={sessionId}
          onChange={(e) => {
            setSessionId(e.currentTarget.value);
            setOpened(false);
            kill.reset();
          }}
        />
        <Button disabled={id.length === 0} onClick={() => setOpened(true)}>
          Open
        </Button>
        <Button
          color="red"
          variant="light"
          leftSection={<IconTrash size={16} />}
          disabled={id.length === 0}
          loading={kill.isPending}
          onClick={() => kill.mutate()}
        >
          Kill session
        </Button>
      </Group>

      {kill.isSuccess && <Alert color="green">Session terminated.</Alert>}
      {kill.error && <Alert color="red">{(kill.error as Error).message}</Alert>}

      {!opened && (
        <Text c="dimmed" size="sm">
          Paste a session id (or come from an environment row) to view its live VNC, logs and video.
          Nothing is stored — access is by possession of the id.
        </Text>
      )}

      {opened && id.length > 0 && (
        <Tabs defaultValue="vnc">
          <Tabs.List>
            <Tabs.Tab value="vnc">Live VNC</Tabs.Tab>
            <Tabs.Tab value="logs">Logs</Tabs.Tab>
            <Tabs.Tab value="video">Video</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="vnc" pt="md">
            <Stack gap="xs">
              <Group justify="flex-end">
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
        </Tabs>
      )}
    </Stack>
  );
}
