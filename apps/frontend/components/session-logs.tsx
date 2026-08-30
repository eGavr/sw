"use client";

import { Code, Loader, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";

import { getSessionLogs } from "@/lib/sw";

// The session's posthumous log. The agent ships it a few seconds after the session ends, so while
// nothing has arrived yet the query keeps a gentle poll — the "no logs" text upgrades itself to the
// real thing without a reload.
export function SessionLogs({ project, sessionId }: { project: string; sessionId: string }) {
  const logs = useQuery({
    queryKey: ["sessionLogs", project, sessionId],
    queryFn: () => getSessionLogs(project, sessionId),
    retry: false,
    refetchInterval: (query) => (query.state.data ? false : 5_000),
  });

  if (logs.isLoading) {
    return <Loader size="sm" />;
  }

  if (typeof logs.data !== "string") {
    return (
      <Text c="dimmed" size="sm">
        No logs — they appear after the session ends, and only when it was created with sw:logging.
      </Text>
    );
  }

  return (
    <Code block style={{ maxHeight: "60vh", overflow: "auto", whiteSpace: "pre" }}>
      {logs.data}
    </Code>
  );
}
