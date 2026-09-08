"use client";

import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Code,
  CopyButton,
  Group,
  Loader,
  Menu,
  Modal,
  NumberInput,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconCheck,
  IconCircleCheck,
  IconCopy,
  IconDots,
  IconLogout,
  IconPencil,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconTerminal2,
  IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { relativeTime, shortId } from "@/lib/format";
import {
  attachMachine,
  CloudAccount,
  detachMachine,
  generateMachineRegistrationToken,
  Machine,
  MachineRegistration,
  platformLabel,
  setMachineAdmission,
  Substrate,
  updateMachine,
} from "@/lib/sw";
import { machinesQueryKey, useMachines } from "@/lib/use-machines";

const STATE_COLOR: Record<Machine["state"], string> = {
  pending: "blue",
  online: "green",
  offline: "red",
};

const ADMISSION_COLOR: Record<Machine["admission"], string> = {
  open: "green",
  cordoned: "yellow",
  draining: "orange",
};

const substrateLabel = (substrate: Substrate): string => `${platformLabel(substrate.platform)} · ${substrate.execution}`;

// A machine "ready" means the pool may take it now; the headline of a self-hosted cloud is how many
// of the attached boxes are.
export function MachineCountBadge({ project, account }: { project: string; account: string }) {
  const machines = useMachines(project, account);
  const attached = machines.data ?? [];
  const ready = attached.filter((machine) => machine.ready).length;

  if (machines.isLoading) {
    return null;
  }

  return (
    <Badge variant="light" color={attached.length === 0 ? "gray" : ready > 0 ? "green" : "red"}>
      {ready} ready / {attached.length} attached
    </Badge>
  );
}

// The inventory of a self-hosted cloud: every box the user attached, live from the agents' syncs.
// Unlike other clouds, what is attached IS the capacity, so the section shows all of it — and every
// action on a box (cordon, drain, detach) sits on its row.
export function MachinesSection({ project, account }: { project: string; account: CloudAccount }) {
  const queryClient = useQueryClient();
  const machines = useMachines(project, account.uid);
  const [attaching, setAttaching] = useState(false);
  const [registration, setRegistration] = useState<{ machine: Machine; grant: MachineRegistration } | null>(null);
  const [editing, setEditing] = useState<Machine | null>(null);
  const [confirm, setConfirm] = useState<{ machine: Machine; action: "drain" | "detach" } | null>(null);

  const refresh = (): Promise<void> => queryClient.invalidateQueries({ queryKey: machinesQueryKey(project, account.uid) });

  const failed = (title: string) => (error: unknown): void => {
    notifications.show({ color: "red", title, message: (error as Error).message });
  };

  const admission = useMutation({
    mutationFn: ({ machine, verb }: { machine: Machine; verb: "cordon" | "uncordon" | "drain" }) =>
      setMachineAdmission(project, account.uid, machine.uid, verb),
    onError: failed("Machine admission change failed"),
    onSettled: refresh,
  });

  const detach = useMutation({
    mutationFn: ({ machine, force }: { machine: Machine; force: boolean }) =>
      detachMachine(project, account.uid, machine.uid, force),
    onError: failed("Detach machine failed"),
    onSettled: refresh,
  });

  // A fresh registration token invalidates the previous one — for a box that never registered (the
  // command was lost, or its token expired).
  const regenerate = useMutation({
    mutationFn: (machine: Machine) => generateMachineRegistrationToken(project, account.uid, machine.uid),
    onSuccess: (grant, machine) => setRegistration({ machine, grant }),
    onError: failed("Registration token failed"),
  });

  const rows = machines.data ?? [];
  const busy = (machine: Machine): boolean =>
    (admission.isPending && admission.variables?.machine.uid === machine.uid)
    || (detach.isPending && detach.variables?.machine.uid === machine.uid)
    || (regenerate.isPending && regenerate.variables?.uid === machine.uid);

  return (
    <Stack gap="xs" pt="xs" style={{ borderTop: "1px solid var(--mantine-color-gray-2)" }}>
      <Group justify="space-between">
        <Group gap="xs">
          <Text size="sm" fw={600}>Machines</Text>
          <Text size="xs" c="dimmed">
            Your own boxes, run by our agent. Environments of this cloud are placed on them.
          </Text>
        </Group>
        <Tooltip label="Add a platform first" disabled={account.computeBindings.length > 0}>
          <Button
            variant="light"
            size="compact-sm"
            leftSection={<IconPlus size={14} />}
            data-disabled={account.computeBindings.length === 0 || undefined}
            onClick={(event) => (account.computeBindings.length === 0 ? event.preventDefault() : setAttaching(true))}
          >
            Attach machine
          </Button>
        </Tooltip>
      </Group>

      {machines.error && <Alert color="red">{(machines.error as Error).message}</Alert>}
      {machines.isLoading && <Loader size="sm" />}

      {!machines.isLoading && (
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Machine</Table.Th>
              <Table.Th>Provides</Table.Th>
              <Table.Th>State</Table.Th>
              <Table.Th>Ready</Table.Th>
              <Table.Th>Slots</Table.Th>
              <Table.Th>Last sync</Table.Th>
              <Table.Th>Agent</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((machine) => (
              <Table.Tr key={machine.uid}>
                <Table.Td>
                  <MachineIdentity machine={machine} />
                </Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    {machine.provides.map((substrate) => (
                      <Badge key={substrateLabel(substrate)} variant="outline" color="gray" size="sm">
                        {substrateLabel(substrate)}
                      </Badge>
                    ))}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    <Badge color={STATE_COLOR[machine.state]} variant="light">{machine.state}</Badge>
                    {machine.admission !== "open" && (
                      <Badge color={ADMISSION_COLOR[machine.admission]} variant="light">{machine.admission}</Badge>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Readiness machine={machine} />
                </Table.Td>
                <Table.Td>
                  <Text size="sm" ff="monospace">
                    {machine.lease?.environments.length ?? 0}/{machine.slotCapacity ?? "?"}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {machine.lastSyncTime ? (
                    <Tooltip label={machine.lastSyncTime}>
                      <Text size="sm" style={{ cursor: "default", width: "fit-content" }}>
                        {relativeTime(machine.lastSyncTime)}
                      </Text>
                    </Tooltip>
                  ) : (
                    <Text size="sm" c="dimmed">never</Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c={machine.facts ? undefined : "dimmed"}>{machine.facts?.agentVersion ?? "—"}</Text>
                </Table.Td>
                <Table.Td>
                  <Menu position="bottom-end" withinPortal>
                    <Menu.Target>
                      <ActionIcon variant="subtle" color="gray" aria-label="Machine actions" loading={busy(machine)}>
                        <IconDots size={16} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      {machine.state === "pending" && (
                        <Menu.Item leftSection={<IconTerminal2 size={14} />} onClick={() => regenerate.mutate(machine)}>
                          Install command
                        </Menu.Item>
                      )}
                      <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setEditing(machine)}>
                        What it serves
                      </Menu.Item>
                      {machine.admission === "open" && (
                        <Menu.Item
                          leftSection={<IconPlayerPause size={14} />}
                          onClick={() => admission.mutate({ machine, verb: "cordon" })}
                        >
                          Cordon
                        </Menu.Item>
                      )}
                      {machine.admission === "cordoned" && (
                        <Menu.Item
                          leftSection={<IconPlayerPlay size={14} />}
                          onClick={() => admission.mutate({ machine, verb: "uncordon" })}
                        >
                          Uncordon
                        </Menu.Item>
                      )}
                      {machine.admission !== "draining" && (
                        <Menu.Item
                          leftSection={<IconLogout size={14} />}
                          onClick={() => setConfirm({ machine, action: "drain" })}
                        >
                          Drain
                        </Menu.Item>
                      )}
                      <Menu.Divider />
                      <Menu.Item
                        color="red"
                        leftSection={<IconTrash size={14} />}
                        onClick={() => (machine.lease ? setConfirm({ machine, action: "detach" }) : detach.mutate({ machine, force: false }))}
                      >
                        Detach
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Table.Td>
              </Table.Tr>
            ))}
            {rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={8}>
                  <Text c="dimmed" size="sm" ta="center" py="sm">
                    No machines yet — attach one and run the install command on it.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <AttachMachineModal
        project={project}
        account={account}
        opened={attaching}
        onClose={() => setAttaching(false)}
        onAttached={(machine, grant) => {
          setAttaching(false);
          setRegistration({ machine, grant });
          void refresh();
        }}
      />

      <EditProvidesModal
        project={project}
        account={account}
        machine={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void refresh();
        }}
      />

      <InstallCommandModal registration={registration} onClose={() => setRegistration(null)} />

      <Modal
        opened={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.action === "drain" ? "Drain this machine?" : "Detach a machine in use?"}
      >
        {confirm && (
          <Stack>
            <Text size="sm">
              {confirm.action === "drain"
                ? confirm.machine.lease
                  ? `${confirm.machine.fqdn} stops taking new environments and is detached once the ${confirm.machine.lease.environments.length} it holds are gone. This cannot be undone.`
                  : `${confirm.machine.fqdn} holds no environments, so draining detaches it right now.`
                : `${confirm.machine.fqdn} holds ${confirm.machine.lease?.environments.length ?? 0} environment(s). Detaching kills them with their sessions; logs and video will not be saved.`}
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setConfirm(null)}>Cancel</Button>
              <Button
                color="red"
                variant="light"
                onClick={() => {
                  if (confirm.action === "drain") {
                    admission.mutate({ machine: confirm.machine, verb: "drain" });
                  } else {
                    detach.mutate({ machine: confirm.machine, force: true });
                  }
                  setConfirm(null);
                }}
              >
                {confirm.action === "drain" ? "Drain" : "Detach"}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}

// The address, with the agent's facts a hover away once it has reported them.
function MachineIdentity({ machine }: { machine: Machine }) {
  const facts = machine.facts;
  const summary = facts
    ? [
      `${facts.cores} cores`,
      `${Math.round(facts.memoryMb / 1024)} GB`,
      facts.virtualization === "none" ? "no virtualization" : facts.virtualization,
      facts.emulator ? `emulator (${facts.avds.join(", ") || "no AVDs"})` : "no emulator",
      facts.docker ? "docker" : "no docker",
      facts.vncStack ? "vnc stack" : "no vnc stack",
    ].join(" · ")
    : "The agent has not reported yet";

  return (
    <Tooltip label={`${summary} · ${machine.uid}`} multiline w={320}>
      <Box style={{ cursor: "default", width: "fit-content" }}>
        <Text size="sm" fw={600}>{machine.fqdn}</Text>
        <Text size="xs" c="dimmed" ff="monospace">{shortId(machine.uid)}</Text>
      </Box>
    </Tooltip>
  );
}

// Whether the pool may take the machine, and if not, why: the conditions the domain judged from the
// agent's facts (blocking ones red, degrading ones yellow), or the state/admission that holds it back.
function Readiness({ machine }: { machine: Machine }) {
  const conditions = machine.conditions.map((condition) => (
    <Tooltip key={condition.type} label={condition.message} multiline w={280}>
      <Badge variant="light" color={condition.blocking ? "red" : "yellow"} size="sm" style={{ cursor: "default" }}>
        {condition.type}
      </Badge>
    </Tooltip>
  ));

  if (machine.ready) {
    return (
      <Group gap={4}>
        <Group gap={4} c="green">
          <IconCircleCheck size={14} />
          <Text size="xs">ready</Text>
        </Group>
        {conditions}
      </Group>
    );
  }

  const reason = machine.state === "pending"
    ? "waiting for the agent to register"
    : machine.state === "offline"
      ? "the agent went silent"
      : machine.admission !== "open"
        ? machine.admission
        : machine.conditions.some((condition) => condition.blocking)
          ? "cannot run what it provides"
          : "not ready";

  return (
    <Group gap={4}>
      <Group gap={4} c="dimmed">
        <IconAlertTriangle size={14} />
        <Text size="xs">{reason}</Text>
      </Group>
      {conditions}
    </Group>
  );
}

// Attaching names the box and what it serves; the registration token is generated at once and the
// install command shown next, since a pending machine is useless until its agent registers.
function AttachMachineModal({
  project,
  account,
  opened,
  onClose,
  onAttached,
}: {
  project: string;
  account: CloudAccount;
  opened: boolean;
  onClose: () => void;
  onAttached: (machine: Machine, grant: MachineRegistration) => void;
}) {
  const bound: Array<Substrate> = account.computeBindings.map((binding) => ({
    platform: binding.platform,
    execution: binding.execution,
  }));
  const [fqdn, setFqdn] = useState("");
  const [provides, setProvides] = useState<Array<string> | null>(null);
  const [slotCapacity, setSlotCapacity] = useState<number | string>("");

  const selected = provides ?? bound.map(substrateLabel);
  const fqdnValid = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i.test(fqdn.trim());

  const attach = useMutation({
    mutationFn: async () => {
      const machine = await attachMachine(project, account.uid, {
        fqdn: fqdn.trim(),
        provides: bound.filter((substrate) => selected.includes(substrateLabel(substrate))),
        ...(typeof slotCapacity === "number" ? { slotCapacity } : {}),
      });
      const grant = await generateMachineRegistrationToken(project, account.uid, machine.uid);

      return { machine, grant };
    },
    onSuccess: ({ machine, grant }) => {
      setFqdn("");
      setProvides(null);
      setSlotCapacity("");
      onAttached(machine, grant);
    },
    onError: (error) =>
      notifications.show({ color: "red", title: "Attach machine failed", message: (error as Error).message }),
  });

  return (
    <Modal opened={opened} onClose={onClose} title="Attach a machine">
      <Stack>
        <TextInput
          label="Address"
          description="Hostname or IP the control plane and your clients reach the machine at"
          placeholder="build-42.corp.example.com"
          value={fqdn}
          error={fqdn.trim() !== "" && !fqdnValid ? "Doesn't look like a hostname or an IPv4 address" : undefined}
          onChange={(event) => setFqdn(event.currentTarget.value)}
        />
        <ProvidesPicker bound={bound} value={selected} onChange={setProvides} />
        <NumberInput
          label="Slots"
          description="How many environments may run on it at once; empty = derived from the cores the agent reports"
          placeholder="auto"
          min={1}
          allowDecimal={false}
          value={slotCapacity}
          onChange={setSlotCapacity}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button
            loading={attach.isPending}
            disabled={!fqdnValid || selected.length === 0}
            onClick={() => attach.mutate()}
          >
            Attach
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// Which of the cloud's platforms a machine runs. A box is not bought for one substrate: the same
// machine takes emulator seats or browser seats, so this is a plain multi-choice over what the cloud
// binds — and the same control serves attaching and editing.
function ProvidesPicker({
  bound,
  value,
  onChange,
}: {
  bound: Array<Substrate>;
  value: Array<string>;
  onChange: (next: Array<string>) => void;
}) {
  return (
    <Checkbox.Group
      label="Provides"
      description="Which of the cloud's platforms this machine can run"
      value={value}
      onChange={onChange}
    >
      <Stack gap={6} mt={6}>
        {bound.map((substrate) => (
          <Checkbox key={substrateLabel(substrate)} value={substrateLabel(substrate)} label={substrateLabel(substrate)} />
        ))}
      </Stack>
    </Checkbox.Group>
  );
}

// Editing what an attached machine serves: a box that gained docker starts taking browser seats
// without being detached, which would mean reinstalling its agent.
function EditProvidesModal({
  project,
  account,
  machine,
  onClose,
  onSaved,
}: {
  project: string;
  account: CloudAccount;
  machine: Machine | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const bound: Array<Substrate> = account.computeBindings.map((binding) => ({
    platform: binding.platform,
    execution: binding.execution,
  }));
  const [selected, setSelected] = useState<Array<string> | null>(null);
  const current = machine?.provides.map(substrateLabel) ?? [];
  const value = selected ?? current;

  const save = useMutation({
    mutationFn: () =>
      updateMachine(project, account.uid, (machine as Machine).uid, {
        provides: bound.filter((substrate) => value.includes(substrateLabel(substrate))),
      }),
    onSuccess: () => {
      setSelected(null);
      onSaved();
    },
    onError: (error) =>
      notifications.show({ color: "red", title: "Change failed", message: (error as Error).message }),
  });

  return (
    <Modal
      opened={machine !== null}
      onClose={() => {
        setSelected(null);
        onClose();
      }}
      title={machine ? `What ${machine.fqdn} serves` : ""}
    >
      {machine && (
        <Stack>
          <ProvidesPicker bound={bound} value={value} onChange={setSelected} />
          <Text size="xs" c="dimmed">
            Dropping a platform stops new environments of it landing here; what the machine already runs
            stays until it is released.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => { setSelected(null); onClose(); }}>Cancel</Button>
            <Button loading={save.isPending} disabled={value.length === 0} onClick={() => save.mutate()}>
              Save
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

// The install command is shown exactly once: it carries a one-time registration token whose only
// server-side trace is a hash. Losing it means generating a new one from the machine's menu.
function InstallCommandModal({
  registration,
  onClose,
}: {
  registration: { machine: Machine; grant: MachineRegistration } | null;
  onClose: () => void;
}) {
  return (
    <Modal
      opened={registration !== null}
      onClose={onClose}
      title={registration ? `Install the agent on ${registration.machine.fqdn}` : ""}
      size="lg"
    >
      {registration && (
        <Stack>
          <Text size="sm">
            Run this on the machine as a user who can sudo. It installs our machine agent, which registers
            with a one-time token and then keeps syncing. The command is shown once — copy it now.
          </Text>
          <Code block style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {registration.grant.installCommand}
          </Code>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              Token valid until {new Date(registration.grant.expireTime).toLocaleString()}
            </Text>
            <Group gap="xs">
              <CopyButton value={registration.grant.installCommand}>
                {({ copied, copy }) => (
                  <Button
                    variant="light"
                    size="compact-sm"
                    color={copied ? "teal" : "blue"}
                    leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                    onClick={copy}
                  >
                    {copied ? "Copied" : "Copy command"}
                  </Button>
                )}
              </CopyButton>
              <Button variant="default" size="compact-sm" onClick={onClose}>Done</Button>
            </Group>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
