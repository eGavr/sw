"use client";

import { Alert, Button, Code, Group, Loader, Modal, Stack, Text } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { CopyButton } from "@/components/copy-button";
import { shortId } from "@/lib/format";
import { Environment, environmentHandle, getEnvironmentSession, killSession } from "@/lib/sw";

// Recovers the live session id of a busy environment — the API answers only to the session's creator
// (404 otherwise), so this is also where the creator kills their session.
export function CurrentSessionModal({
  project,
  environment,
  onClose,
}: {
  project: string;
  environment: Environment | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const session = useQuery({
    queryKey: ["environmentSession", project, environment?.uid],
    queryFn: () => getEnvironmentSession(project, environment?.uid ?? ""),
    enabled: environment !== null,
    retry: false,
  });

  const kill = useMutation({
    mutationFn: (sessionId: string) => killSession(sessionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["environments", project] });
      close();
    },
  });

  const close = (): void => {
    onClose();
    kill.reset();
  };

  return (
    <Modal
      opened={environment !== null}
      onClose={close}
      title={environment ? `Current session on ${shortId(environmentHandle(environment))}` : "Current session"}
    >
      <Stack>
        {session.isLoading && <Loader size="sm" />}

        {session.error && (
          <Alert color="gray">
            No session found — either it already ended, or it was created by someone else (only the
            session&apos;s creator can access it here).
          </Alert>
        )}

        {session.data && (
          <>
            <Group gap="xs" wrap="nowrap">
              <Code style={{ flex: 1, overflowWrap: "anywhere" }}>{session.data.sessionId}</Code>
              <CopyButton value={session.data.sessionId} />
            </Group>
            {kill.error && (
              <Text c="red" size="sm">
                {(kill.error as Error).message}
              </Text>
            )}
            <Group justify="flex-end">
              <Button variant="default" onClick={close}>
                Close
              </Button>
              <Button
                color="red"
                leftSection={<IconTrash size={16} />}
                loading={kill.isPending}
                onClick={() => kill.mutate(session.data.sessionId)}
              >
                Kill session
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
