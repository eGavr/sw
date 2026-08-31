"use client";

import { ActionIcon, Box, Divider, Group, Stack, Tooltip } from "@mantine/core";
import { IconArrowUpRight, IconTrash, IconWorld } from "@tabler/icons-react";
import { ReactNode } from "react";

import { SessionCommand, SessionCommandBar } from "@/components/session-command-bar";
import { interactiveViewerUrl, killSession, navigateSession } from "@/lib/sw";

const railWidth = 240;

// The live session layout used everywhere it appears — the screen with the command rail on its right.
// The rail is the one control surface (commands scale downward in it); hosts only add their own
// header/footer around it (a full-screen link inside the tab, navigation chrome on the viewer page).
export function SessionLiveView({
  sessionId,
  onKilled,
  height,
  fullScreenHref,
  railHeader,
  railFooter,
}: {
  sessionId: string;
  onKilled: () => void;
  height: string;
  // When set, an arrow overlays the screen's corner and opens the full-screen view in a new tab —
  // the affordance other services use, right where the eye already is.
  fullScreenHref?: string;
  railHeader?: ReactNode;
  railFooter?: ReactNode;
}) {
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

  return (
    <Group align="stretch" gap="sm" wrap="nowrap" style={{ height, minHeight: 360 }}>
      {/* Live only: once the session ends the node is gone and the frame goes dark. */}
      <Box pos="relative" style={{ flex: 1 }}>
        <iframe
          src={interactiveViewerUrl(sessionId)}
          style={{ width: "100%", height: "100%", border: "1px solid var(--mantine-color-gray-3)" }}
          title="Live VNC"
        />
        {fullScreenHref && (
          <Tooltip label="Open full screen">
            <ActionIcon
              component="a"
              href={fullScreenHref}
              target="_blank"
              variant="default"
              aria-label="Open full screen"
              style={{ position: "absolute", top: 8, right: 8 }}
            >
              <IconArrowUpRight size={16} />
            </ActionIcon>
          </Tooltip>
        )}
      </Box>

      <Stack w={railWidth} gap="sm" style={{ flexShrink: 0 }}>
        {/* The header is view chrome (full screen, back), not session control — a divider keeps the
            two zones from reading as one block. */}
        {railHeader && (
          <>
            {railHeader}
            <Divider />
          </>
        )}
        <SessionCommandBar vertical commands={commands} />
        {railFooter}
      </Stack>
    </Group>
  );
}
