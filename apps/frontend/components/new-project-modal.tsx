"use client";

import { Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createProject, projectHandle } from "@/lib/sw";

export function NewProjectModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState("");

  const close = (): void => {
    onClose();
    create.reset();
  };

  // The AIP-133 client-chosen projectId stays an API-only affordance (scripts/IaC); the UI keeps the
  // form down to the one thing a person actually names.
  const create = useMutation({
    mutationFn: () => createProject({ displayName }),
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      setDisplayName("");
      onClose();
      router.push(`/projects/${projectHandle(project)}`);
    },
  });

  return (
    <Modal opened={opened} onClose={close} title="New project">
      <Stack>
        <TextInput
          label="Name"
          placeholder="My project"
          value={displayName}
          onChange={(e) => setDisplayName(e.currentTarget.value)}
          data-autofocus
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
          <Button
            disabled={displayName.trim().length === 0}
            loading={create.isPending}
            onClick={() => create.mutate()}
          >
            Create
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
