"use client";

import {
  Alert,
  Button,
  Code,
  Group,
  Loader,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import {
  getSessionLogs,
  interactiveViewerUrl,
  listProjects,
  projectHandle,
  sessionVideoUrl,
} from "@/lib/sw";

// Stateless capability viewer: whoever holds a session id may watch it. VNC is the live view (works
// while the session runs); logs and video only exist after the session ends, so they lead with a
// placeholder until then. Logs/video readback is project-scoped, hence the project picker.
function InspectContent() {
  const params = useSearchParams();

  const [sessionId, setSessionId] = useState(params.get("session") ?? "");
  const [project, setProject] = useState<string | null>(params.get("project"));
  const [opened, setOpened] = useState(params.get("session") !== null);

  const projects = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const projectOptions = (projects.data ?? []).map((p) => ({
    value: projectHandle(p),
    label: p.displayName,
  }));
  const selectedProject = project ?? projectOptions[0]?.value ?? null;

  const logs = useQuery({
    queryKey: ["sessionLogs", selectedProject, sessionId],
    queryFn: () => getSessionLogs(selectedProject ?? "", sessionId.trim()),
    enabled: opened && selectedProject !== null,
    retry: false,
  });

  const id = sessionId.trim();

  return (
    <Stack>
      <Title order={2}>Inspect session</Title>
      <Text c="dimmed">
        Paste a session id to view its live VNC, logs and video. Nothing is stored — access is by
        possession of the id (capability).
      </Text>

      <Group>
        <TextInput
          placeholder="session id…"
          style={{ flex: 1 }}
          value={sessionId}
          onChange={(e) => {
            setSessionId(e.currentTarget.value);
            setOpened(false);
          }}
        />
        <Select
          placeholder="project (for logs/video)"
          data={projectOptions}
          value={selectedProject}
          onChange={setProject}
          w={220}
        />
        <Button disabled={id.length === 0} onClick={() => setOpened(true)}>
          Open
        </Button>
      </Group>

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
            {selectedProject ? (
              <Stack gap="xs">
                <Alert color="gray">
                  The recording appears after the session ends, and only when it was created with
                  sw:video — if the player below stays empty, there is nothing recorded (yet).
                </Alert>
                {/* The BFF streams the mp4 with auth; the browser only needs its session cookie. */}
                <video
                  controls
                  src={sessionVideoUrl(selectedProject, id)}
                  style={{ width: "100%", maxHeight: "60vh", background: "black" }}
                />
              </Stack>
            ) : (
              <Alert color="gray">Pick a project to load the video.</Alert>
            )}
          </Tabs.Panel>
        </Tabs>
      )}
    </Stack>
  );
}

export default function InspectPage() {
  return (
    <Suspense fallback={<Loader size="sm" />}>
      <InspectContent />
    </Suspense>
  );
}
