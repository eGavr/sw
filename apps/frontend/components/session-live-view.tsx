"use client";

import { Divider, Group, Stack } from "@mantine/core";
import { IconTrash, IconWorld } from "@tabler/icons-react";
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
  railHeader,
  railFooter,
}: {
  sessionId: string;
  onKilled: () => void;
  height: string;
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
      <iframe
        src={interactiveViewerUrl(sessionId)}
        style={{ flex: 1, height: "100%", border: "1px solid var(--mantine-color-gray-3)" }}
        title="Live VNC"
      />

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
