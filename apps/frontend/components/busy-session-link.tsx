"use client";

import { ActionIcon, Tooltip } from "@mantine/core";
import { IconArrowUpRight } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// The arrow next to a busy badge, shown only to the session's creator (capabilities flag). A real
// link — not a click handler — so the browser's open-in-new-tab affordances all work; the Sessions
// tab recovers the live session id itself from the ?env deep link.
export function BusySessionLink({ environmentUid }: { environmentUid: string }) {
  const pathname = usePathname();

  return (
    <Tooltip label="Open the session">
      <ActionIcon
        component={Link}
        href={`${pathname}?tab=sessions&env=${environmentUid}`}
        variant="subtle"
        color="gray"
        size="sm"
        aria-label="Open the session"
      >
        <IconArrowUpRight size={14} />
      </ActionIcon>
    </Tooltip>
  );
}
