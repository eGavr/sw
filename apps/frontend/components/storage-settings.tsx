"use client";

import { ActionIcon, Alert, Anchor, Box, Button, Group, Loader, Stack, Text, TextInput, Title, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { clearStorageDestination, getStorageDestination, updateStorageDestination } from "@/lib/sw";

// A read-only row of the configured destination.
function Field({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text size="sm" ff="monospace">
        {value || "—"}
      </Text>
    </Box>
  );
}

// Where the project's session logs/video are written. Quiet by default — the current destination reads
// as a summary; a pencil opens the editable form. We never take credentials: access is delegated to our
// identity via a bucket policy, so the form is only the location. Not configuring one is fine (and
// removing one is the "I don't want storage" path — nothing is written until a destination is set).
export function StorageSettings({ project }: { project: string }) {
  const queryClient = useQueryClient();

  const destination = useQuery({
    queryKey: ["storageDestination", project],
    queryFn: () => getStorageDestination(project),
    retry: false,
  });

  const [editing, setEditing] = useState(false);
  const [bucket, setBucket] = useState("");
  const [prefix, setPrefix] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [region, setRegion] = useState("");

  const seedForm = (): void => {
    const current = destination.data;
    setBucket(current?.bucket ?? "");
    setPrefix(current?.prefix ?? "");
    setEndpoint(current?.endpoint ?? "");
    setRegion(current?.region ?? "");
  };

  // Keep the form seeded from the loaded destination while not editing.
  useEffect(() => {
    if (!editing) {
      seedForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination.data]);

  const startEdit = (): void => {
    seedForm();
    setEditing(true);
  };

  const save = useMutation({
    mutationFn: () =>
      updateStorageDestination(project, {
        bucket: bucket.trim(),
        prefix: prefix.trim() || undefined,
        endpoint: endpoint.trim() || undefined,
        region: region.trim() || undefined,
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(["storageDestination", project], saved);
      setEditing(false);
      notifications.show({ color: "green", message: "Storage destination saved", autoClose: 3_000 });
    },
    onError: (error) =>
      notifications.show({ color: "red", title: "Save failed", message: (error as Error).message }),
  });

  const remove = useMutation({
    mutationFn: () => clearStorageDestination(project),
    onSuccess: () => {
      queryClient.setQueryData(["storageDestination", project], null);
      setEditing(false);
      notifications.show({ color: "green", message: "Storage destination removed", autoClose: 3_000 });
    },
    onError: (error) =>
      notifications.show({ color: "red", title: "Remove failed", message: (error as Error).message }),
  });

  const current = destination.data;

  const header = (
    <Group justify="space-between" align="flex-start" wrap="nowrap">
      <Box>
        <Title order={4}>Storage</Title>
        <Text size="sm" c="dimmed">
          Where this project&apos;s session logs and video are written.
        </Text>
      </Box>
      {!editing && current && (
        <Tooltip label="Edit">
          <ActionIcon variant="subtle" color="gray" aria-label="Edit storage" onClick={startEdit}>
            <IconPencil size={16} />
          </ActionIcon>
        </Tooltip>
      )}
      {editing && current && (
        <Button
          variant="subtle"
          color="red"
          size="compact-sm"
          leftSection={<IconTrash size={14} />}
          loading={remove.isPending}
          onClick={() => remove.mutate()}
        >
          Remove
        </Button>
      )}
    </Group>
  );

  if (destination.isLoading) {
    return (
      <Stack gap="sm">
        {header}
        <Loader size="sm" />
      </Stack>
    );
  }

  // View: not configured — a quiet note and a subtle way to set one.
  if (!editing && !current) {
    return (
      <Stack gap="sm">
        {header}
        <Text size="sm" c="dimmed">
          No destination — session logs and video are not saved until one is set.
        </Text>
        <Group>
          <Button variant="light" size="compact-sm" leftSection={<IconPlus size={14} />} onClick={startEdit}>
            Set storage
          </Button>
        </Group>
      </Stack>
    );
  }

  // View: configured — a compact read-only summary.
  if (!editing && current) {
    return (
      <Stack gap="sm">
        {header}
        <Group gap="xl">
          <Field label="Bucket" value={current.bucket} />
          <Field label="Prefix" value={current.prefix} />
          <Field label="Endpoint" value={current.endpoint ?? ""} />
          <Field label="Region" value={current.region ?? ""} />
        </Group>
      </Stack>
    );
  }

  // Edit: the location form (no credentials).
  return (
    <Stack gap="sm">
      {header}

      <Alert color="gray" variant="light">
        We write under our own identity — grant it access with a bucket policy on your bucket. No
        credentials are entered or stored here. Works with AWS S3 and S3-compatible endpoints (e.g.
        Yandex Object Storage).
      </Alert>

      <TextInput
        label="Bucket"
        placeholder="my-sessions-bucket"
        required
        value={bucket}
        onChange={(e) => setBucket(e.currentTarget.value)}
      />
      <TextInput
        label="Prefix"
        description="Optional path prefix under the bucket."
        placeholder="sw/"
        value={prefix}
        onChange={(e) => setPrefix(e.currentTarget.value)}
      />
      <Group grow align="flex-start">
        <TextInput
          label="Endpoint"
          placeholder="https://storage.yandexcloud.net"
          value={endpoint}
          onChange={(e) => setEndpoint(e.currentTarget.value)}
        />
        <TextInput
          label="Region"
          placeholder="ru-central1"
          value={region}
          onChange={(e) => setRegion(e.currentTarget.value)}
        />
      </Group>
      <Text size="xs" c="dimmed">
        Endpoint is optional — leave it empty for AWS S3.
      </Text>

      <Group justify="space-between" align="center" mt="xs">
        <Anchor
          href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-policies.html"
          target="_blank"
          size="xs"
          c="dimmed"
        >
          How to grant access with a bucket policy
        </Anchor>
        <Group gap="xs">
          <Button
            variant="default"
            size="compact-sm"
            onClick={() => {
              seedForm();
              setEditing(false);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="light"
            size="compact-sm"
            loading={save.isPending}
            disabled={bucket.trim() === ""}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}
