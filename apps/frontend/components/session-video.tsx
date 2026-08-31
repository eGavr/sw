"use client";

import { ActionIcon, Box, Loader, Text, Tooltip } from "@mantine/core";
import { IconArrowUpRight } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { sessionVideoUrl } from "@/lib/sw";

const reprobeMs = 4_000;

// The session's posthumous recording. The <video> element probes its own source and only shows once
// real data loaded — and while there is nothing yet, it quietly re-probes: the recording lands a few
// seconds after the session ends, and it should appear without a reload.
export function SessionVideo({ project, sessionId }: { project: string; sessionId: string }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (available !== false) {
      return;
    }

    const timer = setTimeout(() => setAttempt((current) => current + 1), reprobeMs);

    return () => clearTimeout(timer);
  }, [available, attempt]);

  const url = sessionVideoUrl(project, sessionId);

  return (
    <>
      {available === null && <Loader size="sm" />}
      {available === false && (
        <Text c="dimmed" size="sm">
          No video — the recording appears after the session ends, and only when it was created with
          sw:video.
        </Text>
      )}
      {/* The BFF streams the mp4 with auth; the browser only needs its session cookie. Keyed by the
          probe attempt so a failed source is retried with a fresh element. */}
      <Box pos="relative" display={available === true ? "block" : "none"}>
        <video
          key={attempt}
          controls
          src={`${url}?probe=${attempt}`}
          onLoadedData={() => setAvailable(true)}
          onError={() => setAvailable(false)}
          style={{ width: "100%", maxHeight: "60vh", background: "black", display: "block" }}
        />
        <Tooltip label="Open the video in a new tab">
          <ActionIcon
            component="a"
            href={url}
            target="_blank"
            variant="default"
            aria-label="Open the video in a new tab"
            style={{ position: "absolute", top: 8, right: 8 }}
          >
            <IconArrowUpRight size={16} />
          </ActionIcon>
        </Tooltip>
      </Box>
    </>
  );
}
