"use client";

import { Button, Code, Group, Modal, Stack, Switch, Text } from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { CopyButton } from "@/components/copy-button";
import { shortId } from "@/lib/format";
import { CreatedSession, createSession, Environment, environmentHandle } from "@/lib/sw";

// Creates a session pinned to one environment (sw:environmentId). The returned session id is a
// capability secret stored nowhere at rest: while the session lives its creator can recover it from
// the environment row; after it ends the id is gone for good.
export function NewSessionModal({
  project,
  environment,
  onClose,
}: {
  project: string;
  environment: Environment | null;
  onClose: () => void;
}) {
  const [logging, setLogging] = useState(false);
  const [video, setVideo] = useState(false);
  const [created, setCreated] = useState<CreatedSession | null>(null);

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
    onSuccess: setCreated,
  });

  const close = (): void => {
    onClose();
    setCreated(null);
    setLogging(false);
    setVideo(false);
    create.reset();
  };

  return (
    <Modal
      opened={environment !== null}
      onClose={close}
      size="lg"
      title={environment ? `New session on ${shortId(environmentHandle(environment))}` : "New session"}
    >
      {created ? (
        <Stack>
          <Text size="sm" c="dimmed">
            Save the id if you&apos;ll need logs or video after the session ends.
          </Text>
          <Group gap="xs" wrap="nowrap">
            <Code style={{ flex: 1, whiteSpace: "nowrap", overflowX: "auto" }}>{created.sessionId}</Code>
            <CopyButton value={created.sessionId} />
          </Group>
          {created.interactive && (
            <Button
              component="a"
              href={created.interactive}
              target="_blank"
              leftSection={<IconExternalLink size={16} />}
            >
              Open interactive viewer
            </Button>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              Done
            </Button>
          </Group>
        </Stack>
      ) : (
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
      )}
    </Modal>
  );
}
