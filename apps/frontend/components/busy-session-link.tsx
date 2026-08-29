"use client";

import { ActionIcon, Tooltip } from "@mantine/core";
import { IconArrowUpRight } from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";

import { getEnvironmentSession } from "@/lib/sw";

// The arrow next to a busy badge, shown only to the session's creator (capabilities flag): recovers
// the live session id and deep-links into the Sessions tab with the viewer open on it.
export function BusySessionLink({ project, environmentUid }: { project: string; environmentUid: string }) {
  const router = useRouter();
  const pathname = usePathname();

  const open = useMutation({
    mutationFn: () => getEnvironmentSession(project, environmentUid),
    onSuccess: ({ sessionId }) =>
      router.push(
        `${pathname}?tab=sessions&session=${encodeURIComponent(sessionId)}&env=${environmentUid}`,
      ),
  });

  return (
    <Tooltip label={open.error ? "Session not found — it may have just ended" : "Open the session"}>
      <ActionIcon
        variant="subtle"
        size="sm"
        aria-label="Open the session"
        loading={open.isPending}
        onClick={() => open.mutate()}
      >
        <IconArrowUpRight size={14} />
      </ActionIcon>
    </Tooltip>
  );
}
