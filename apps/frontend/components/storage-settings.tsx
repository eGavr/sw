"use client";

import { ActionIcon, Alert, Anchor, Box, Button, Group, Loader, Stack, Text, TextInput, Title, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconCircleCheck, IconPencil, IconPlant, IconPlus, IconRefresh, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  clearStorageDestination,
  getStorageDestination,
  testStorageDestination,
  updateStorageDestination,
} from "@/lib/sw";

// A local-disk install (LOG_STORAGE=fs) needs only a folder name; the flag lets the form pre-fill a
// sensible dev default so it is not busywork.
const localDev = process.env.NEXT_PUBLIC_STORAGE_LOCAL === "true";

// Format checks mirroring the backend — obvious-nonsense rejection, never a connectivity claim.
const bucketPattern = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const prefixPattern = /^[A-Za-z0-9._/-]*$/;
const regionPattern = /^[a-z0-9-]+$/;

function isUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

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
// identity via a bucket policy, so the form is only the location. Not configuring one is fine (removing
// one is the "I don't want storage" path). A Test probe verifies the config actually works.
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
    const c = destination.data;
    setBucket(c?.bucket ?? "");
    setPrefix(c?.prefix ?? "");
    setEndpoint(c?.endpoint ?? "");
    setRegion(c?.region ?? "");
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
    // Local dev: a fresh destination is just a folder — pre-fill the bucket so there is nothing to type.
    if (localDev && !destination.data) {
      setBucket(project);
      setPrefix("");
      setEndpoint("");
      setRegion("");
    }
    setEditing(true);
  };

  const errors = {
    bucket: bucket.trim() === "" ? "Bucket is required" : bucketPattern.test(bucket.trim())
      ? null
      : "3-63 chars: lowercase letters, digits, dots and hyphens",
    prefix: prefixPattern.test(prefix.trim()) ? null : "Only letters, digits, and . _ - /",
    endpoint: endpoint.trim() === "" || isUrl(endpoint.trim()) ? null : "Must be a URL like https://host",
    region: region.trim() === "" || regionPattern.test(region.trim()) ? null : "Lowercase letters, digits, hyphens",
  };
  const valid = !errors.bucket && !errors.prefix && !errors.endpoint && !errors.region;

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
      // Verify the just-saved config actually works — a wrong bucket or missing policy shows up here.
      void queryClient.invalidateQueries({ queryKey: ["storageProbe", project] });
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

  // A real write probe, run automatically whenever the configured destination is shown — so access that
  // was lost, or a bucket that no longer exists, surfaces as a red health badge instead of silently
  // failing at the next session's upload. Refetchable on demand and re-run after a save.
  const probe = useQuery({
    queryKey: ["storageProbe", project],
    queryFn: () => testStorageDestination(project),
    enabled: !editing && !!current,
    retry: false,
  });

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
      {/* The pencil turns into the edit controls in place — Cancel/Save where it was. */}
      {editing && (
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
            disabled={!valid}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        </Group>
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

  // View: configured — a compact read-only summary and a live health check.
  if (!editing && current) {
    const health = probe.isFetching ? (
      <Group gap={6} c="dimmed">
        <Loader size={14} />
        <Text size="sm">Checking storage…</Text>
      </Group>
    ) : probe.isError ? (
      <Group gap={6} c="red">
        <IconAlertTriangle size={16} />
        <Text size="sm">{(probe.error as Error).message}</Text>
      </Group>
    ) : probe.data?.ok ? (
      <Group gap={6} c="green">
        <IconCircleCheck size={16} />
        <Text size="sm">Reachable — we can write to it</Text>
      </Group>
    ) : probe.data ? (
      <Group gap={6} c="red">
        <IconAlertTriangle size={16} />
        <Text size="sm">Not reachable: {probe.data.message ?? "the write probe failed"}</Text>
      </Group>
    ) : null;

    return (
      <Stack gap="sm">
        {header}
        <Group gap="xl">
          <Field label="Bucket" value={current.bucket} />
          <Field label="Prefix" value={current.prefix} />
          <Field label="Endpoint" value={current.endpoint ?? ""} />
          <Field label="Region" value={current.region ?? ""} />
        </Group>
        <Group justify="space-between" align="center">
          {health}
          <Tooltip label="Re-check">
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label="Re-check storage"
              loading={probe.isFetching}
              onClick={() => probe.refetch()}
            >
              <IconRefresh size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Stack>
    );
  }

  // Edit: the location form (no credentials).
  return (
    <Stack gap="sm">
      {header}

      {localDev ? (
        <Alert color="gray" variant="light" icon={<IconPlant size={16} />}>
          Local development — the bucket is just a folder under the dev storage directory; endpoint and
          region are ignored.
        </Alert>
      ) : (
        <Alert color="gray" variant="light">
          We write under our own identity — grant it access with a bucket policy on your bucket. No
          credentials are entered or stored here. Works with AWS S3 and S3-compatible endpoints (e.g.
          Yandex Object Storage).
        </Alert>
      )}

      <TextInput
        label="Bucket"
        placeholder="my-sessions-bucket"
        required
        value={bucket}
        error={bucket !== "" ? errors.bucket : null}
        onChange={(e) => setBucket(e.currentTarget.value)}
      />
      <TextInput
        label="Prefix"
        description="Optional path prefix under the bucket."
        placeholder="sw/"
        value={prefix}
        error={errors.prefix}
        onChange={(e) => setPrefix(e.currentTarget.value)}
      />
      <Group grow align="flex-start">
        <TextInput
          label="Endpoint"
          placeholder="https://storage.yandexcloud.net"
          value={endpoint}
          error={errors.endpoint}
          onChange={(e) => setEndpoint(e.currentTarget.value)}
        />
        <TextInput
          label="Region"
          placeholder="ru-central1"
          value={region}
          error={errors.region}
          onChange={(e) => setRegion(e.currentTarget.value)}
        />
      </Group>
      <Text size="xs" c="dimmed">
        Endpoint is optional — leave it empty for AWS S3.
      </Text>

      {/* The destructive action sits apart, bottom-right, away from Save. */}
      <Group justify="space-between" align="center" mt="xs">
        <Anchor
          href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-policies.html"
          target="_blank"
          size="xs"
          c="dimmed"
        >
          How to grant access with a bucket policy
        </Anchor>
        {current && (
          <Tooltip label="Remove storage">
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label="Remove storage"
              loading={remove.isPending}
              onClick={() => remove.mutate()}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    </Stack>
  );
}
