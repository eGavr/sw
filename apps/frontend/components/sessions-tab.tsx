"use client";

import { Alert, Button, Loader, Stack, Tabs, Text, TextInput } from "@mantine/core";
import { IconMaximize } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { SessionLiveView } from "@/components/session-live-view";
import { SessionLogs } from "@/components/session-logs";
import { SessionVideo } from "@/components/session-video";
import { addFreeing } from "@/lib/freeing-store";
import { getEnvironmentSession, isSessionAlive } from "@/lib/sw";

// The project's session viewer — stateless capability access: whoever holds a session id may watch it.
// Works for the live session (VNC) and for past ones (logs/video, which only exist after a session
// ends). Session control (delete, navigate) lives with the live view, on the VNC tab.
export function SessionsTab({
  project,
  initialSessionId,
  environmentUid,
  initialView,
}: {
  project: string;
  initialSessionId?: string;
  // Known when deep-linked from an environment row: without an explicit session id the tab recovers
  // the row's live one itself (which is what makes the busy arrow a real, new-tab-able link), and a
  // kill marks that row as "freeing".
  environmentUid?: string;
  // A deep link may ask for a specific view (e.g. Back from full screen lands on logs); otherwise
  // liveness decides.
  initialView?: string;
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

  // Which tab to land on is decided by whether the session actually lives, not by how we got here: a
  // recovered id is alive by construction, anything else gets the cheap probe (one read-only WebDriver
  // command through the stateless proxy). Alive -> the live view; over -> its logs.
  const recovered = Boolean(recovery.data && sessionId === recovery.data.sessionId);
  const probe = useQuery({
    queryKey: ["sessionAlive", id],
    queryFn: () => isSessionAlive(id),
    enabled: looksLikeSessionId && !recovered,
    retry: false,
    staleTime: Infinity,
  });
  const alive = recovered ? true : probe.isError ? false : probe.data;

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
        <Text c="dimmed" size="sm">
          Session not found — it may have just ended.
        </Text>
      )}

      {!looksLikeSessionId && !recovery.isLoading && (
        <Text c="dimmed" size="sm">
          Paste a session id (or come from an environment row) to view its live VNC, logs and video.
          Nothing is stored — access is by possession of the id.
        </Text>
      )}

      {looksLikeSessionId && alive === undefined && <Loader size="sm" />}

      {looksLikeSessionId && alive !== undefined && (
        <Tabs defaultValue={initialView ?? (alive ? "vnc" : "logs")}>
          <Tabs.List>
            <Tabs.Tab value="logs">Logs</Tabs.Tab>
            <Tabs.Tab value="video">Video</Tabs.Tab>
            <Tabs.Tab value="vnc">VNC</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="logs" pt="md">
            <SessionLogs project={project} sessionId={id} />
          </Tabs.Panel>

          <Tabs.Panel value="video" pt="md">
            <SessionVideo key={id} project={project} sessionId={id} />
          </Tabs.Panel>

          <Tabs.Panel value="vnc" pt="md">
            {!alive && (
              <Text c="dimmed" size="sm">
                The session is not active — there is no live screen.
              </Text>
            )}
            {/* The same live layout as the full-screen page, at tab scale: the screen with the whole
                command rail beside it; full screen is one click away. */}
            {alive && <SessionLiveView
              sessionId={id}
              onKilled={onKilled}
              height="calc(100vh - 26rem)"
              railHeader={
                <Button
                  component="a"
                  href={`/projects/${project}/viewer?${
                    environmentUid ? `env=${environmentUid}` : `session=${encodeURIComponent(id)}`
                  }`}
                  target="_blank"
                  variant="default"
                  size="compact-sm"
                  leftSection={<IconMaximize size={14} />}
                >
                  Open full screen
                </Button>
              }
            />}
          </Tabs.Panel>
        </Tabs>
      )}
    </Stack>
  );
}
