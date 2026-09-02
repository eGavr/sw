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
  CloudGrant,
  CloudType,
  ComputeBinding,
  ComputeKindOffer,
  connectCloud,
  createComputeBinding,
  deleteComputeBinding,
  disconnectCloud,
  listCloudAccounts,
  listCloudTypes,
  SubstrateOffer,
  testComputeBinding,
  updateComputeBinding,
} from "@/lib/sw";

// The grant targets what the kind names: the cluster for a kubernetes binding, the folder otherwise —
// picked by the kind's required keys so the right command shows even before the id is typed.
const grantCommand = (grant: CloudGrant, kindOffer: ComputeKindOffer, config: Record<string, string>): string =>
  kindOffer.requiredConfig.some((requirement) => requirement.key === "clusterId")
    ? `yc managed-kubernetes cluster add-access-binding --id ${(config.clusterId ?? "").trim() || "<your-cluster-id>"} --role ${grant.role} --subject serviceAccount:${grant.serviceAccountId}`
    : `yc resource-manager folder add-access-binding --id ${(config.folderId ?? "").trim() || "<your-folder-id>"} --role ${grant.role} --subject serviceAccount:${grant.serviceAccountId}`;

export function CloudsTab({ project }: { project: string }) {
  const clouds = useQuery({ queryKey: ["cloudAccounts", project], queryFn: () => listCloudAccounts(project) });

  // The install-static catalogue of connectable clouds; it only changes with a server release.
  const cloudTypes = useQuery({ queryKey: ["cloudTypes"], queryFn: listCloudTypes, staleTime: Infinity });

  // Adding flows straight into picking a platform (user decision): the freshly added card opens in
  // manage mode with the binding form already up — no extra pencil click. Until that setup is closed
  // (Done or disconnect), a second cloud cannot be added.
  const [settingUp, setSettingUp] = useState<string | null>(null);

  const catalogue = cloudTypes.data ?? [];
  const accounts = clouds.data ?? [];
  const settingUpActive = settingUp !== null && accounts.some((account) => account.uid === settingUp);

  return (
    <Stack gap="sm">
      <Box>
        <Title order={4}>Cloud</Title>
        <Text size="sm" c="dimmed">
          Where this project&apos;s environments run. Add a cloud, then the platforms you need.
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
          startOpen={account.uid === settingUp}
          onDone={() => {
            if (account.uid === settingUp) {
              setSettingUp(null);
            }
          }}
        />
      ))}

      {!settingUpActive && (
        <ConnectCloud project={project} catalogue={catalogue} connected={accounts} onConnected={setSettingUp} />
      )}
    </Stack>
  );
}

// One connected cloud: the type line and its platform bindings — each an explicit row the user added
// with its own availability badge; nothing appears behind their back.
function CloudAccountCard({
  project,
  account,
  catalogueEntry,
  startOpen,
  onDone,
}: {
  project: string;
  account: CloudAccount;
  catalogueEntry?: CloudType;
  startOpen: boolean;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  // Quiet by default: the row/disconnect controls only show while managing (the pencil), matching the
  // Storage section. Binding operations apply immediately, so leaving is a single Done.
  const [managing, setManaging] = useState(startOpen);
  const [adding, setAdding] = useState(startOpen);
  const [editingBinding, setEditingBinding] = useState<ComputeBinding | null>(null);

  const offers = catalogueEntry?.provides ?? [];
  const remaining = offers.filter((offer) =>
    !account.computeBindings.some(
      (binding) => binding.platform === offer.platform && binding.execution === offer.execution,
    ));

  // The folder already named by a sibling binding of this connection — new vm bindings prefill it, so
  // one folder serves every platform unless the user says otherwise.
  const knownFolderId = account.computeBindings
    .map((binding) => binding.config.folderId)
    .find((value): value is string => typeof value === "string") ?? "";

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ["cloudAccounts", project] });
    void queryClient.invalidateQueries({ queryKey: ["computeAccess", project, account.uid] });
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
          <Badge variant="light">{account.type}</Badge>
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
                onClick={() => { setManaging(false); setAdding(false); setEditingBinding(null); onDone(); }}
              >
                Done
              </Button>
            </Group>
          ) : (
            <Tooltip label="Edit">
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label="Edit cloud"
                onClick={() => {
                  setManaging(true);

                  // An empty connection has exactly one useful next step — open the platform form at
                  // once instead of asking for an "Add platform" click.
                  if (account.computeBindings.length === 0 && remaining.length > 0) {
                    setAdding(true);
                  }
                }}
              >
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
              knownFolderId={knownFolderId}
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
              <BindingReachabilityBadge project={project} account={account.uid} binding={binding.uid} />
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

        {adding && remaining.length > 0 ? (
          <BindingForm
            offers={remaining}
            knownFolderId={knownFolderId}
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
          managing && remaining.length > 0 && (
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

// The cascade: platform -> execution -> kind -> the kind's fields (with their grant commands). Every
// select shows only what the catalogue offers (emulator rides along disabled until it is real); a sole
// option is preselected — nothing to decide, nothing hidden. Adding is never blocked on the grants:
// the row appears with its badge and turns available once access is granted.
function BindingForm({
  offers,
  knownFolderId,
  existing,
  pending,
  onCancel,
  onSubmit,
}: {
  offers: Array<SubstrateOffer>;
  knownFolderId: string;
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

  // A fresh kind starts from the folder a sibling binding already named — one folder serves every
  // platform unless the user overrides it.
  const initialConfigFor = (offer: ComputeKindOffer): Record<string, string> =>
    Object.fromEntries(
      offer.requiredConfig
        .filter((requirement) => requirement.key === "folderId" && knownFolderId !== "")
        .map((requirement) => [requirement.key, knownFolderId]),
    );

  // A sole option needs no decision — preselect it (the whole cascade collapses for a
  // single-platform cloud like local).
  if (!platform && platforms.length === 1) {
    setPlatform(platforms[0]);
  }
  if (platform && !execution) {
    const options = offers.filter((offer) => offer.platform === platform);
    if (options.length === 1) {
      setExecution(options[0].execution);
    }
  }
  if (substrate && !kind && kinds.length === 1) {
    setKind(kinds[0].kind);
    setConfig(initialConfigFor(kinds[0]));
  }

  const misformatted = (requirement: { key: string; pattern?: string }): boolean => {
    const value = (config[requirement.key] ?? "").trim();

    return value !== "" && requirement.pattern !== undefined && !new RegExp(requirement.pattern).test(value);
  };

  const valid = kindOffer !== undefined
    && kindOffer.requiredConfig.every((requirement) =>
      (config[requirement.key] ?? "").trim() !== "" && !misformatted(requirement));

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
            onChange={(value) => {
              setKind(value);

              const picked = kinds.find((candidate) => candidate.kind === value);
              setConfig(picked ? initialConfigFor(picked) : {});
            }}
          />
        )}
      </Group>

      {kindOffer && kindOffer.requiredConfig.map((requirement) => (
        <TextInput
          key={requirement.key}
          label={requirement.key}
          required
          size="xs"
          value={config[requirement.key] ?? ""}
          error={misformatted(requirement) ? `Doesn't look like a valid ${requirement.key}` : undefined}
          onChange={(e) => setConfig({ ...config, [requirement.key]: e.currentTarget.value })}
        />
      ))}

      {kindOffer && kindOffer.grants.length > 0 && (
        <Box>
          <Text size="xs" c="dimmed" mb={2}>
            Grant our identity access (we hold no keys of yours — access is delegation you control and
            can revoke). You can add the platform first and grant later — it shows as unavailable until
            then:
          </Text>
          {kindOffer.grants.map((grant) => (
            <Code key={grant.role} block style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {grantCommand(grant, kindOffer, config)}
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
              Object.fromEntries(
                Object.entries(config)
                  .map(([key, value]) => [key, value.trim()])
                  .filter(([, value]) => value !== ""),
              ),
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

// Adding a cloud is just picking the type — the pick itself creates the connection and the flow
// continues straight into the new card's platform cascade, no confirm button. Only types not yet
// connected are offered; when a single one remains, the "Add cloud" click connects it right away.
function ConnectCloud({
  project,
  catalogue,
  connected,
  onConnected,
}: {
  project: string;
  catalogue: Array<CloudType>;
  connected: Array<CloudAccount>;
  onConnected: (uid: string) => void;
}) {
  const queryClient = useQueryClient();
  const [opened, setOpened] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const available = catalogue.filter(
    (candidate) => !connected.some((account) => account.type === candidate.type),
  );

  const reset = (): void => {
    setOpened(false);
    setSelectedType(null);
  };

  const connect = useMutation({
    mutationFn: (type: string) => connectCloud(project, type),
    onSuccess: (account) => {
      onConnected(account.uid);
      reset();
    },
    onError: (error) =>
      notifications.show({ color: "red", title: "Add cloud failed", message: (error as Error).message }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["cloudAccounts", project] }),
  });

  if (available.length === 0) {
    return null;
  }

  if (!opened) {
    return (
      <Group>
        <Button
          variant="light"
          size="compact-sm"
          leftSection={<IconPlus size={14} />}
          onClick={() => {
            setOpened(true);

            if (available.length === 1) {
              setSelectedType(available[0].type);
              connect.mutate(available[0].type);
            }
          }}
        >
          Add cloud
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
          data={available.map((candidate) => candidate.type)}
          value={selectedType}
          disabled={connect.isPending}
          onChange={(value) => {
            setSelectedType(value);

            if (value) {
              connect.mutate(value);
            }
          }}
        />

        <Group gap="xs">
          <Button variant="default" size="compact-sm" onClick={reset}>
            Cancel
          </Button>
        </Group>
      </Stack>
    </Box>
  );
}

// Whether the platform is usable with its current settings — the binding's folder/cluster probed under
// our identity on load, so a missing grant or a vanished resource shows right on the row.
function BindingReachabilityBadge({
  project,
  account,
  binding,
}: {
  project: string;
  account: string;
  binding: string;
}) {
  const probe = useQuery({
    queryKey: ["computeAccess", project, account, binding],
    queryFn: () => testComputeBinding(project, account, binding),
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
          <Text size="xs">We can&apos;t use this platform with its current settings — check that access is granted, then re-check.</Text>
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
          aria-label="Re-check platform"
          loading={probe.isFetching}
          onClick={() => void probe.refetch()}
        >
          <IconRefresh size={12} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
