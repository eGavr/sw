"use client";

import { ActionIcon, Tooltip } from "@mantine/core";
import { IconKey } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";

import { Environment, getEnvironmentSession } from "@/lib/sw";

// The key icon appears only for the session's creator: the row probes the recovery endpoint once per
// busy phase (the server answers 404 to everyone else) and simply renders nothing on refusal — the
// server stays the authority, the UI just avoids advertising a door the caller cannot open.
export function CurrentSessionAction({
  project,
  environment,
  onOpen,
}: {
  project: string;
  environment: Environment;
  onOpen: () => void;
}) {
  const probe = useQuery({
    queryKey: ["environmentSession", project, environment.uid, environment.busy],
    queryFn: () => getEnvironmentSession(project, environment.uid),
    retry: false,
    staleTime: Infinity,
  });

  if (!probe.data) {
    return null;
  }

  return (
    <Tooltip label="Current session">
      <ActionIcon variant="subtle" aria-label="Current session" onClick={onOpen}>
        <IconKey size={16} />
      </ActionIcon>
    </Tooltip>
  );
}
