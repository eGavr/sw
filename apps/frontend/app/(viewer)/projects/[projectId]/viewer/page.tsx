"use client";

import { Loader } from "@mantine/core";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { SessionViewer } from "@/components/session-viewer";

// Chrome-free by design (the route group has no dashboard shell): the whole window belongs to the
// session's screen and its command rail. Addressed by ?env= (recover the live id) or ?session=.
function ViewerContent() {
  const { projectId } = useParams<{ projectId: string }>();
  const params = useSearchParams();

  return (
    <SessionViewer
      project={projectId}
      initialSessionId={params.get("session") ?? undefined}
      environmentUid={params.get("env") ?? undefined}
    />
  );
}

export default function ViewerPage() {
  return (
    <Suspense fallback={<Loader size="sm" />}>
      <ViewerContent />
    </Suspense>
  );
}
