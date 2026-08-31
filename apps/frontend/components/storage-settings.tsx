"use client";

import { Alert, Anchor, Button, Group, Loader, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { getStorageDestination, updateStorageDestination } from "@/lib/sw";

// Configures where the project's session logs/video are written. We never take credentials: the user
// grants our service identity write access via a bucket policy, so this form is just the location.
export function StorageSettings({ project }: { project: string }) {
  const queryClient = useQueryClient();

  const destination = useQuery({
    queryKey: ["storageDestination", project],
    queryFn: () => getStorageDestination(project),
    retry: false,
  });

  const [bucket, setBucket] = useState("");
  const [prefix, setPrefix] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [region, setRegion] = useState("");

  // Seed the form once the current destination loads (or leave it empty when none is configured).
  useEffect(() => {
    const current = destination.data;
    if (current) {
      setBucket(current.bucket);
      setPrefix(current.prefix ?? "");
      setEndpoint(current.endpoint ?? "");
      setRegion(current.region ?? "");
    }
  }, [destination.data]);

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
      notifications.show({ color: "green", message: "Storage destination saved", autoClose: 3_000 });
    },
    onError: (error) =>
      notifications.show({ color: "red", title: "Save failed", message: (error as Error).message }),
  });

  if (destination.isLoading) {
    return <Loader size="sm" />;
  }

  return (
    <Stack gap="sm">
      {!destination.data && (
        <Alert color="gray">
          No storage destination yet — session logs and video are not saved until one is configured.
        </Alert>
      )}

      <Text size="sm" c="dimmed">
        We write under our own identity — grant it access with a bucket policy on your bucket. No
        credentials are entered or stored here. Works with AWS S3 and S3-compatible endpoints (e.g.
        Yandex Object Storage).
      </Text>

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
      <Group grow>
        <TextInput
          label="Endpoint"
          description="Optional — leave empty for AWS S3."
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

      <Group justify="space-between" align="center">
        <Anchor
          href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-policies.html"
          target="_blank"
          size="xs"
          c="dimmed"
        >
          How to grant access with a bucket policy
        </Anchor>
        <Button
          onClick={() => save.mutate()}
          loading={save.isPending}
          disabled={bucket.trim() === ""}
        >
          Save
        </Button>
      </Group>
    </Stack>
  );
}
