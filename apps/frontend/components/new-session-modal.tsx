"use client";

import { Button, Group, Modal, Stack, Switch, Text } from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { shortId } from "@/lib/format";
import { createSession, Environment, environmentHandle } from "@/lib/sw";

// Creates a session pinned to one environment (sw:environmentId) and simply closes: the session id is
// a capability secret stored nowhere at rest, and while the session lives its creator can jump to it
// from the busy row's arrow — so nothing needs showing here. The refreshed row (busy) is the receipt.
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
    // Occupancy is written on the create path, so an immediate refetch shows the busy row — no
    // waiting for the next poll tick.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["environments", project] });
      close();
    },
  });

  const close = (): void => {
    onClose();
    setLogging(false);
    setVideo(false);
    create.reset();
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
        {create.error && (
          <Text c="red" size="sm">
            {(create.error as Error).message}
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={close}>
            Cancel
          </Button>
          <Button loading={create.isPending} onClick={() => create.mutate()}>
            Create session
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
