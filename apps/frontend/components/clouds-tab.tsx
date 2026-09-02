"use client";

import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Code,
  Group,
  Loader,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
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
  ComputeKindOffer,
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

// What the user has staged for one substrate: the picked kind and its config fields. `enabled` models the
// single-kind checkbox (bind/unbind); multi-kind substrates are enabled by picking a kind.
type StagedBinding = { enabled: boolean; kind: string | null; config: Record<string, string> };

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
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Box>
          <Title order={4}>Cloud</Title>
          <Text size="sm" c="dimmed">
            Where this project&apos;s environments run. Connect a cloud, then pick how each platform runs.
          </Text>
        </Box>
        <ConnectCloud project={project} catalogue={catalogue} connected={accounts} />
      </Group>

      {clouds.error && <Alert color="red">{(clouds.error as Error).message}</Alert>}
      {clouds.isLoading && <Loader size="sm" />}

      {!clouds.isLoading && accounts.length === 0 && (
        <Text c="dimmed" size="sm">
          No clouds connected — connect one to create environments.
        </Text>
      )}

      {accounts.map((account) => (
        <CloudAccountCard
          key={account.uid}
          project={project}
          account={account}
          catalogueEntry={catalogue.find((entry) => entry.type === account.type)}
        />
      ))}
    </Stack>
  );
}

// One connected cloud: the delegation unit (type + folder + availability) and a catalogue-driven section
// per substrate the cloud offers — no managed tables, the catalogue IS the form.
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
  const [editing, setEditing] = useState(false);
  const [staged, setStaged] = useState<Record<string, StagedBinding>>({});

  const offers = catalogueEntry?.provides ?? [];
  const folderId = typeof account.config.folderId === "string" ? account.config.folderId : "";

  const substrateKey = (offer: SubstrateOffer): string => `${offer.platform}/${offer.execution}`;
  const boundFor = (offer: SubstrateOffer) =>
    account.computeBindings.find(
      (binding) => binding.platform === offer.platform && binding.execution === offer.execution,
    );

  const stagedFor = (offer: SubstrateOffer): StagedBinding => {
    const existing = staged[substrateKey(offer)];

    if (existing) {
      return existing;
    }

    const bound = boundFor(offer);

    return {
      enabled: bound !== undefined,
      kind: bound?.kind ?? null,
      config: Object.fromEntries(
        Object.entries(bound?.config ?? {}).map(([key, value]) => [key, String(value)]),
      ),
    };
  };

  const stage = (offer: SubstrateOffer, patch: Partial<StagedBinding>): void =>
    setStaged({ ...staged, [substrateKey(offer)]: { ...stagedFor(offer), ...patch } });

  // A staged substrate is saveable when disabled, or when its kind is picked and the kind's required
  // config fields are filled.
  const offerValid = (offer: SubstrateOffer): boolean => {
    const current = stagedFor(offer);

    if (!current.enabled) {
      return true;
    }

    const kindOffer = offer.compute.find((candidate) => candidate.kind === current.kind);

    return kindOffer !== undefined
      && kindOffer.requiredConfig.every((key) => (current.config[key] ?? "").trim() !== "");
  };

  const allValid = offers.every(offerValid);

  const save = useMutation({
    mutationFn: async () => {
      for (const offer of offers) {
        const current = stagedFor(offer);
        const bound = boundFor(offer);

        if (!current.enabled) {
          if (bound) {
            await deleteComputeBinding(project, account.uid, bound.uid);
          }
          continue;
        }

        const config = Object.fromEntries(
          Object.entries(current.config).filter(([, value]) => value.trim() !== ""),
        );

        if (!bound) {
          await createComputeBinding(project, account.uid, {
            platform: offer.platform,
            execution: offer.execution,
            kind: current.kind as string,
            config,
          });
        } else if (bound.kind !== current.kind
          || JSON.stringify(bound.config) !== JSON.stringify(config)) {
          await updateComputeBinding(project, account.uid, bound.uid, { kind: current.kind as string, config });
        }
      }
    },
    onError: (error) =>
      notifications.show({ color: "red", title: "Cloud changes failed", message: (error as Error).message }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["cloudAccounts", project] });
      void queryClient.invalidateQueries({ queryKey: ["cloudAccess", project, account.uid] });
      setStaged({});
      setEditing(false);
    },
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
          {editing ? (
            <Group gap="xs">
              <Button variant="default" size="compact-sm" onClick={() => { setStaged({}); setEditing(false); }}>
                Cancel
              </Button>
              <Button
                variant="light"
                size="compact-sm"
                loading={save.isPending}
                disabled={!allValid || Object.keys(staged).length === 0}
                onClick={() => save.mutate()}
              >
                Save
              </Button>
            </Group>
          ) : (
            <Group gap="xs">
              <Tooltip label="Edit">
                <ActionIcon variant="subtle" color="gray" aria-label="Edit cloud" onClick={() => setEditing(true)}>
                  <IconPencil size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Disconnect">
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
            </Group>
          )}
        </Group>

        {offers.map((offer) => (
          <SubstrateSection
            key={substrateKey(offer)}
            offer={offer}
            editing={editing}
            folderId={folderId}
            staged={stagedFor(offer)}
            onStage={(patch) => stage(offer, patch)}
          />
        ))}
      </Stack>
    </Box>
  );
}

// One substrate of the cloud: a checkbox when there is nothing to choose, a kind picker (plus the picked
// kind's config fields and grants) when the catalogue offers several.
function SubstrateSection({
  offer,
  editing,
  folderId,
  staged,
  onStage,
}: {
  offer: SubstrateOffer;
  editing: boolean;
  folderId: string;
  staged: StagedBinding;
  onStage: (patch: Partial<StagedBinding>) => void;
}) {
  const single = offer.compute.length === 1;
  const kindOffer: ComputeKindOffer | undefined = offer.compute.find((candidate) => candidate.kind === staged.kind);

  return (
    <Box pl="xs" style={{ borderLeft: "2px solid var(--mantine-color-gray-2)" }}>
      <Group gap="sm" mb={4}>
        <Text size="sm" fw={600}>
          {offer.platform} · {offer.execution}
        </Text>
        {!editing && (
          <Badge variant="light" color={staged.enabled ? "green" : "gray"}>
            {staged.enabled ? (staged.kind ?? "on") : "off"}
          </Badge>
        )}
      </Group>

      {editing && single && (
        <Checkbox
          label={`use (${offer.compute[0].kind})`}
          checked={staged.enabled}
          onChange={(e) => onStage({ enabled: e.currentTarget.checked, kind: offer.compute[0].kind })}
        />
      )}

      {editing && !single && (
        <Stack gap={6}>
          <Group gap="sm">
            <SegmentedControl
              size="xs"
              data={[
                { label: "off", value: "" },
                ...offer.compute.map((candidate) => ({ label: candidate.kind, value: candidate.kind })),
              ]}
              value={staged.enabled ? (staged.kind ?? "") : ""}
              onChange={(value) =>
                onStage(value === "" ? { enabled: false } : { enabled: true, kind: value })}
            />
          </Group>

          {staged.enabled && kindOffer && kindOffer.requiredConfig.map((key) => (
            <TextInput
              key={key}
              label={key}
              required
              size="xs"
              value={staged.config[key] ?? ""}
              onChange={(e) => onStage({ config: { ...staged.config, [key]: e.currentTarget.value } })}
            />
          ))}

          {staged.enabled && kindOffer && kindOffer.grants.length > 0 && (
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
        </Stack>
      )}
    </Box>
  );
}

// Connect a new cloud: the type plus its ACCOUNT-level requirements (folder + grants). The substrates are
// configured on the card afterwards; ones with nothing to ask are bound automatically.
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
  const [opened, { open, close }] = useDisclosure(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [config, setConfig] = useState<Record<string, string>>({});

  const entry = catalogue.find((candidate) => candidate.type === selectedType);
  const required = entry?.connect.requiredConfig ?? [];
  const valid = selectedType !== null && required.every((key) => (config[key] ?? "").trim() !== "");

  const reset = (): void => {
    close();
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

  return (
    <>
      <Button variant="light" size="compact-sm" leftSection={<IconPlus size={14} />} onClick={open}>
        Connect a cloud
      </Button>

      <Modal opened={opened} onClose={reset} title="Connect cloud" size="lg">
        <Stack>
          <Select
            label="Cloud"
            placeholder="Pick a cloud type"
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

          <Group justify="flex-end">
            <Button variant="default" onClick={reset}>
              Cancel
            </Button>
            <Button variant="light" disabled={!valid} loading={connect.isPending} onClick={() => connect.mutate()}>
              Connect
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
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
