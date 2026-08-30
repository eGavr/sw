"use client";

import { Button, Group, Modal, Stack, Switch, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { shortId } from "@/lib/format";
import { createSession, Environment, environmentHandle } from "@/lib/sw";

// Creates a session pinned to one environment (sw:environmentId), fire-and-forget: the modal closes on
// the click and the environment row tells the story (reserved while the node creates, then busy). The
// session id is a capability secret stored nowhere at rest — while the session lives its creator can
// jump to it from the busy row's arrow, so nothing needs showing here. A failed create, having no
// modal left to land in, surfaces as a notification.
export function NewSessionModal({
  project,
  environment,
  onClose,
}: {
  project: string;
  environment: Environment | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [logging, setLogging] = useState(false);
  const [video, setVideo] = useState(false);

  const application = environment?.applications[0];

  const create = useMutation({
    mutationFn: () => {
      if (!environment || !application) {
        throw new Error("environment offers no application");
      }

      return createSession(project, {
        environmentId: environment.uid,
        application,
        logging,
        video,
      });
    },
    onError: (error) =>
      notifications.show({
        color: "red",
        title: "Session not created",
        message: (error as Error).message,
      }),
    // Occupancy is written on both outcomes (reserved->busy or released back to free), so an immediate
    // refetch keeps the row honest — no waiting for the next poll tick.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["environments", project] }),
  });

  const close = (): void => {
    onClose();
    setLogging(false);
    setVideo(false);
  };

  const start = (): void => {
    create.mutate();
    close();
  };

  return (
    <Modal
      opened={environment !== null}
      onClose={close}
      title={environment ? `New session on ${shortId(environmentHandle(environment))}` : "New session"}
    >
      <Stack>
        {environment && application && (
          <Text size="sm">
            {application.name} {application.version} · {environment.platform.name} ·{" "}
            {environment.execution}
          </Text>
        )}
        <Switch
          label="Collect logs (sw:logging)"
          checked={logging}
          onChange={(e) => setLogging(e.currentTarget.checked)}
        />
        <Switch
          label="Record video (sw:video)"
          checked={video}
          onChange={(e) => setVideo(e.currentTarget.checked)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={close}>
            Cancel
          </Button>
          <Button onClick={start}>Create session</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
