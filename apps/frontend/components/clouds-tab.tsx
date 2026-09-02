"use client";

import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Code,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  CloudAccount,
  CloudType,
  ComputeBinding,
  connectCloud,
  createComputeBinding,
  deleteComputeBinding,
  disconnectCloud,
  listCloudAccounts,
  listCloudTypes,
  SubstrateOffer,
  testCloudAccount,
  updateComputeBinding,
} from "@/lib/sw";

const grantCommand = (folderId: string, role: string, serviceAccountId: string): string =>
  `yc resource-manager folder add-access-binding --id ${folderId || "<your-folder-id>"} --role ${role} --subject serviceAccount:${serviceAccountId}`;

export function CloudsTab({ project }: { project: string }) {
  const clouds = useQuery({ queryKey: ["cloudAccounts", project], queryFn: () => listCloudAccounts(project) });

  // The install-static catalogue of connectable clouds; it only changes with a server release.
  const cloudTypes = useQuery({ queryKey: ["cloudTypes"], queryFn: listCloudTypes, staleTime: Infinity });

  const catalogue = cloudTypes.data ?? [];
  const accounts = clouds.data ?? [];

  return (
    <Stack gap="sm">
      <Box>
        <Title order={4}>Cloud</Title>
        <Text size="sm" c="dimmed">
          Where this project&apos;s environments run. Connect a cloud, then add the platforms you need.
        </Text>
      </Box>

      {clouds.error && <Alert color="red">{(clouds.error as Error).message}</Alert>}
      {clouds.isLoading && <Loader size="sm" />}

      {accounts.map((account) => (
        <CloudAccountCard
          key={account.uid}
          project={project}
          account={account}
          catalogueEntry={catalogue.find((entry) => entry.type === account.type)}
        />
      ))}

      <ConnectCloud project={project} catalogue={catalogue} connected={accounts} />
    </Stack>
  );
}

// One connected cloud: the delegation line (type + folder + availability) and its platform bindings —
// each an explicit row the user added; nothing appears behind their back.
function CloudAccountCard({
  project,
  account,
  catalogueEntry,
}: {
  project: string;
  account: CloudAccount;
  catalogueEntry?: CloudType;
}) {
  const queryClient = useQueryClient();
  // Quiet by default: the row/disconnect controls only show while managing (the pencil), matching the
  // Storage section. Binding operations apply immediately, so leaving is a single Done.
  const [managing, setManaging] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingBinding, setEditingBinding] = useState<ComputeBinding | null>(null);

  const offers = catalogueEntry?.provides ?? [];
  const folderId = typeof account.config.folderId === "string" ? account.config.folderId : "";

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ["cloudAccounts", project] });
    void queryClient.invalidateQueries({ queryKey: ["cloudAccess", project, account.uid] });
  };

  const removeBinding = useMutation({
    mutationFn: (binding: ComputeBinding) => deleteComputeBinding(project, account.uid, binding.uid),
    onError: (error) =>
      notifications.show({ color: "red", title: "Remove platform failed", message: (error as Error).message }),
    onSettled: refresh,
  });

  const disconnect = useMutation({
    mutationFn: () => disconnectCloud(project, account.uid),
    onError: (error) =>
      notifications.show({ color: "red", title: "Disconnect failed", message: (error as Error).message }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["cloudAccounts", project] }),
  });

  return (
    <Box p="md" style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8 }}>
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm">
            <Badge variant="light">{account.type}</Badge>
            {folderId && (
              <Text size="sm" c="dimmed">
                folder <Text span ff="monospace">{folderId}</Text>
              </Text>
            )}
            <CloudReachabilityBadge project={project} uid={account.uid} />
          </Group>
          {managing ? (
            <Group gap="xs">
              <Tooltip label="Disconnect cloud">
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label="Disconnect cloud"
                  loading={disconnect.isPending}
                  onClick={() => disconnect.mutate()}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
              <Button
                variant="default"
                size="compact-sm"
                onClick={() => { setManaging(false); setAdding(false); setEditingBinding(null); }}
              >
                Done
              </Button>
            </Group>
          ) : (
            <Tooltip label="Edit">
              <ActionIcon variant="subtle" color="gray" aria-label="Edit cloud" onClick={() => setManaging(true)}>
                <IconPencil size={16} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>

        {account.computeBindings.length === 0 && !adding && (
          <Text size="sm" c="dimmed">
            No platforms yet — add one to create environments on this cloud.
          </Text>
        )}

        {account.computeBindings.map((binding) =>
          editingBinding?.uid === binding.uid ? (
            <BindingForm
              key={binding.uid}
              offers={offers}
              folderId={folderId}
              existing={binding}
              pending={false}
              onCancel={() => setEditingBinding(null)}
              onSubmit={async (kind, config) => {
                await updateComputeBinding(project, account.uid, binding.uid, { kind, config });
                setEditingBinding(null);
                refresh();
              }}
            />
          ) : (
            <Group key={binding.uid} gap="sm" pl="xs" style={{ borderLeft: "2px solid var(--mantine-color-gray-2)" }}>
              <Text size="sm" fw={600}>
                {binding.platform} · {binding.execution}
              </Text>
              <Badge variant="light" color="green">{binding.kind}</Badge>
              {Object.entries(binding.config).map(([key, value]) => (
                <Text key={key} size="xs" c="dimmed" ff="monospace">
                  {key}={String(value)}
                </Text>
              ))}
              {managing && (
                <>
                  <Tooltip label="Change how it runs">
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="sm"
                      aria-label="Edit platform"
                      onClick={() => setEditingBinding(binding)}
                    >
                      <IconPencil size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Remove platform">
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="sm"
                      aria-label="Remove platform"
                      loading={removeBinding.isPending && removeBinding.variables?.uid === binding.uid}
                      onClick={() => removeBinding.mutate(binding)}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Tooltip>
                </>
              )}
            </Group>
          ),
        )}

        {adding ? (
          <BindingForm
            offers={offers.filter((offer) =>
              !account.computeBindings.some(
                (binding) => binding.platform === offer.platform && binding.execution === offer.execution,
              ))}
            folderId={folderId}
            pending
            onCancel={() => setAdding(false)}
            onSubmit={async (kind, config, substrate) => {
              await createComputeBinding(project, account.uid, {
                platform: substrate!.platform,
                execution: substrate!.execution,
                kind,
                config,
              });
              setAdding(false);
              refresh();
            }}
          />
        ) : (
          managing && (
            <Group>
              <Button variant="subtle" size="compact-sm" leftSection={<IconPlus size={14} />} onClick={() => setAdding(true)}>
                Add platform
              </Button>
            </Group>
          )
        )}
      </Stack>
    </Box>
  );
}

// The cascade the user asked for: platform -> execution -> kind -> the kind's fields. Every select shows
// only what the catalogue offers (emulator rides along disabled until it is real); a sole option is
// preselected — nothing to decide, nothing hidden.
function BindingForm({
  offers,
  folderId,
  existing,
  pending,
  onCancel,
  onSubmit,
}: {
  offers: Array<SubstrateOffer>;
  folderId: string;
  existing?: ComputeBinding;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (kind: string, config: Record<string, string>, substrate?: SubstrateOffer) => Promise<void>;
}) {
  const [platform, setPlatform] = useState<string | null>(existing?.platform ?? null);
  const [execution, setExecution] = useState<string | null>(existing?.execution ?? null);
  const [kind, setKind] = useState<string | null>(existing?.kind ?? null);
  const [config, setConfig] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(existing?.config ?? {}).map(([key, value]) => [key, String(value)])),
  );
  const [saving, setSaving] = useState(false);

  const platforms = [...new Set(offers.map((offer) => offer.platform))];
  const executionsFor = (p: string): Array<{ value: string; label: string; disabled?: boolean }> => {
    const available = offers.filter((offer) => offer.platform === p).map((offer) => offer.execution);
    const options = available.map((value) => ({ value, label: value }));

    // The emulator substrate exists in the model but is not offered until live-verified.
    if (p === "android" && !available.includes("emulator")) {
      options.push({ value: "emulator", label: "emulator (soon)", disabled: true } as never);
    }

    return options;
  };

  const substrate = offers.find((offer) => offer.platform === platform && offer.execution === execution);
  const kinds = substrate?.compute ?? [];
  const kindOffer = kinds.find((candidate) => candidate.kind === kind);

  // A sole option needs no decision — preselect it.
  if (platform && !execution) {
    const options = offers.filter((offer) => offer.platform === platform);
    if (options.length === 1) {
      setExecution(options[0].execution);
    }
  }
  if (substrate && !kind && kinds.length === 1) {
    setKind(kinds[0].kind);
  }

  const valid = kindOffer !== undefined
    && kindOffer.requiredConfig.every((key) => (config[key] ?? "").trim() !== "");

  return (
    <Stack gap={6} pl="xs" py={4} style={{ borderLeft: "2px solid var(--mantine-color-blue-3)" }}>
      <Group gap="sm" align="flex-end">
        <Select
          label="Platform"
          size="xs"
          data={platforms}
          value={platform}
          disabled={!pending}
          onChange={(value) => { setPlatform(value); setExecution(null); setKind(null); setConfig({}); }}
        />
        {platform && (
          <Select
            label="Execution"
            size="xs"
            data={executionsFor(platform)}
            value={execution}
            disabled={!pending}
            onChange={(value) => { setExecution(value); setKind(null); setConfig({}); }}
          />
        )}
        {substrate && (
          <Select
            label="Runs on"
            size="xs"
            data={kinds.map((candidate) => ({ value: candidate.kind, label: candidate.kind }))}
            value={kind}
            onChange={(value) => { setKind(value); setConfig({}); }}
          />
        )}
      </Group>

      {kindOffer && kindOffer.requiredConfig.map((key) => (
        <TextInput
          key={key}
          label={key}
          required
          size="xs"
          value={config[key] ?? ""}
          onChange={(e) => setConfig({ ...config, [key]: e.currentTarget.value })}
        />
      ))}

      {kindOffer && kindOffer.grants.length > 0 && (
        <Box>
          <Text size="xs" c="dimmed" mb={2}>
            Grant our identity access first:
          </Text>
          {kindOffer.grants.map((grant) => (
            <Code key={grant.role} block style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {grantCommand(folderId, grant.role, grant.serviceAccountId)}
            </Code>
          ))}
        </Box>
      )}

      <Group gap="xs">
        <Button variant="default" size="compact-xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="light"
          size="compact-xs"
          disabled={!valid}
          loading={saving}
          onClick={() => {
            setSaving(true);
            onSubmit(
              kind as string,
              Object.fromEntries(Object.entries(config).filter(([, value]) => value.trim() !== "")),
              substrate,
            )
              .catch((error: Error) =>
                notifications.show({ color: "red", title: "Platform change failed", message: error.message }))
              .finally(() => setSaving(false));
          }}
        >
          {pending ? "Add" : "Save"}
        </Button>
      </Group>
    </Stack>
  );
}

// Connecting a cloud is inline too: the button becomes a cloud select plus the account-level fields
// (folder + grants). Platforms are added on the card afterwards.
function ConnectCloud({
  project,
  catalogue,
  connected,
}: {
  project: string;
  catalogue: Array<CloudType>;
  connected: Array<CloudAccount>;
}) {
  const queryClient = useQueryClient();
  const [opened, setOpened] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [config, setConfig] = useState<Record<string, string>>({});

  const entry = catalogue.find((candidate) => candidate.type === selectedType);
  const required = entry?.connect.requiredConfig ?? [];
  const valid = selectedType !== null && required.every((key) => (config[key] ?? "").trim() !== "");

  const reset = (): void => {
    setOpened(false);
    setSelectedType(null);
    setConfig({});
  };

  const connect = useMutation({
    mutationFn: () =>
      connectCloud(
        project,
        selectedType as string,
        required.length > 0
          ? Object.fromEntries(required.map((key) => [key, config[key].trim()]))
          : undefined,
      ),
    onSuccess: reset,
    onError: (error) =>
      notifications.show({ color: "red", title: "Connect failed", message: (error as Error).message }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["cloudAccounts", project] }),
  });

  if (!opened) {
    return (
      <Group>
        <Button variant="light" size="compact-sm" leftSection={<IconPlus size={14} />} onClick={() => setOpened(true)}>
          Connect a cloud
        </Button>
      </Group>
    );
  }

  return (
    <Box p="md" style={{ border: "1px dashed var(--mantine-color-gray-4)", borderRadius: 8 }}>
      <Stack gap="sm">
        <Select
          label="Cloud"
          placeholder="Pick a cloud"
          data={catalogue.map((candidate) => ({
            value: candidate.type,
            label: candidate.type,
            disabled: connected.some((account) => account.type === candidate.type),
          }))}
          value={selectedType}
          onChange={setSelectedType}
        />

        {required.map((key) => (
          <TextInput
            key={key}
            label={key}
            description={key === "folderId"
              ? "Your own cloud folder — environments are created there, at your cost."
              : undefined}
            required
            value={config[key] ?? ""}
            onChange={(e) => setConfig({ ...config, [key]: e.currentTarget.value })}
          />
        ))}

        {(entry?.connect.grants.length ?? 0) > 0 && (
          <Box>
            <Text size="xs" c="dimmed" mb={4}>
              In your cloud, grant these roles to our service accounts (we hold no keys of yours —
              access is delegation you control and can revoke):
            </Text>
            <Stack gap={6}>
              {entry!.connect.grants.map((grant) => (
                <Code key={grant.role} block style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {grantCommand((config.folderId ?? "").trim(), grant.role, grant.serviceAccountId)}
                </Code>
              ))}
            </Stack>
          </Box>
        )}

        <Group gap="xs">
          <Button variant="default" size="compact-sm" onClick={reset}>
            Cancel
          </Button>
          <Button variant="light" size="compact-sm" disabled={!valid} loading={connect.isPending} onClick={() => connect.mutate()}>
            Connect
          </Button>
        </Group>
      </Stack>
    </Box>
  );
}

// Whether the cloud is usable with its current settings — probed under our identity on load (for a
// delegated cloud, that the user has granted us access to the folder and, per binding, the cluster).
function CloudReachabilityBadge({ project, uid }: { project: string; uid: string }) {
  const probe = useQuery({
    queryKey: ["cloudAccess", project, uid],
    queryFn: () => testCloudAccount(project, uid),
    retry: false,
  });

  const detail = probe.isError
    ? (probe.error as Error).message
    : probe.data?.ok
      ? undefined
      : probe.data?.message;

  const status = probe.isFetching ? (
    <Group gap={4} c="dimmed">
      <Loader size={12} />
      <Text size="xs">checking…</Text>
    </Group>
  ) : probe.data?.ok ? (
    <Group gap={4} c="green">
      <IconCircleCheck size={14} />
      <Text size="xs">available</Text>
    </Group>
  ) : (
    <Tooltip
      multiline
      w={280}
      label={
        <Stack gap={2}>
          <Text size="xs">We can&apos;t reach this cloud with its current settings — check that access is granted, then re-check.</Text>
          {detail && <Text size="xs" style={{ opacity: 0.7 }}>{detail}</Text>}
        </Stack>
      }
    >
      <Group gap={4} c="red">
        <IconAlertTriangle size={14} />
        <Text size="xs">unavailable</Text>
      </Group>
    </Tooltip>
  );

  return (
    <Group gap={4} wrap="nowrap">
      {status}
      <Tooltip label="Re-check">
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          aria-label="Re-check cloud"
          loading={probe.isFetching}
          onClick={() => void probe.refetch()}
        >
          <IconRefresh size={12} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
