"use client";

import { Button, Code, Group, Loader, Text } from "@mantine/core";
import { IconCopy } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { getSessionLogs } from "@/lib/sw";

const copiedResetMs = 1_500;

// The session's posthumous log. The agent ships it on its first tick after the session ends (~3s), so
// while nothing has arrived yet the query keeps a matching poll — the "no logs" text upgrades itself
// to the real thing without a reload.
export function SessionLogs({ project, sessionId }: { project: string; sessionId: string }) {
  const [copied, setCopied] = useState(false);

  const logs = useQuery({
    queryKey: ["sessionLogs", project, sessionId],
    queryFn: () => getSessionLogs(project, sessionId),
    retry: false,
    refetchInterval: (query) => (query.state.data ? false : 3_000),
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

  const content = logs.data;

  const copy = (): void => {
    void navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), copiedResetMs);
    });
  };

  return (
    <>
      <Group justify="flex-end" mb="xs">
        <Button
          variant="default"
          size="compact-sm"
          w={96}
          leftSection={<IconCopy size={14} />}
          onClick={copy}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </Group>
      <Code block style={{ maxHeight: "60vh", overflow: "auto", whiteSpace: "pre" }}>
        {content}
      </Code>
    </>
  );
}
