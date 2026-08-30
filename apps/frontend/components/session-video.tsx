"use client";

import { Loader, Text } from "@mantine/core";
import { useState } from "react";

import { sessionVideoUrl } from "@/lib/sw";

// The session's posthumous recording. The <video> element probes its own source and only shows once
// real data loaded, so a session without a recording never renders a dead black player. Remount
// (key by session id) to re-probe.
export function SessionVideo({ project, sessionId }: { project: string; sessionId: string }) {
  const [available, setAvailable] = useState<boolean | null>(null);

  return (
    <>
      {available === null && <Loader size="sm" />}
      {available === false && (
        <Text c="dimmed" size="sm">
          No video — the recording appears after the session ends, and only when it was created with
          sw:video.
        </Text>
      )}
      {/* The BFF streams the mp4 with auth; the browser only needs its session cookie. */}
      <video
        controls
        src={sessionVideoUrl(project, sessionId)}
        onLoadedData={() => setAvailable(true)}
        onError={() => setAvailable(false)}
        style={{
          width: "100%",
          maxHeight: "60vh",
          background: "black",
          display: available === true ? "block" : "none",
        }}
      />
    </>
  );
}
