"use client";

import { Button, Divider, Group, Stack, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation } from "@tanstack/react-query";
import { ReactNode, useState } from "react";

// One entry of the live session's control surface: a plain button, or (with `placeholder` set) an
// input feeding the command's single text argument. Destructive commands render apart from the rest —
// after a divider, at the bottom of a vertical rail — so "delete" never reads as part of a neighbour.
export type SessionCommand = {
  key: string;
  label: string;
  color?: string;
  icon?: ReactNode;
  placeholder?: string;
  inputIcon?: ReactNode;
  destructive?: boolean;
  run: (argument: string) => Promise<void>;
  onSuccess?: () => void;
};

// Every command is one WebDriver call against the session, so extending the bar is adding one
// descriptor — the layout stays put: a vertical rail grows downward and never crowds the screen it
// sits next to. Failures land as notifications (the bar has no result surface).
export function SessionCommandBar({
  commands,
  vertical = false,
}: {
  commands: Array<SessionCommand>;
  vertical?: boolean;
}) {
  const [argumentByKey, setArgumentByKey] = useState<Record<string, string>>({});

  const execute = useMutation({
    mutationFn: ({ command, argument }: { command: SessionCommand; argument: string }) =>
      command.run(argument),
    onSuccess: (_, { command }) => command.onSuccess?.(),
    onError: (error, { command }) =>
      notifications.show({ color: "red", title: command.label, message: (error as Error).message }),
  });

  const renderCommand = (command: SessionCommand): ReactNode => {
    const argument = (argumentByKey[command.key] ?? "").trim();
    const runnable = command.placeholder === undefined || argument !== "";
    const run = (): void => execute.mutate({ command, argument });

    const input = command.placeholder !== undefined && (
      <TextInput
        size="xs"
        w={vertical ? undefined : 300}
        leftSection={command.inputIcon}
        placeholder={command.placeholder}
        value={argumentByKey[command.key] ?? ""}
        onChange={(e) => setArgumentByKey({ ...argumentByKey, [command.key]: e.currentTarget.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter" && runnable) {
            run();
          }
        }}
      />
    );

    const button = (
      <Button
        size="compact-sm"
        // A coloured command (destructive red) reads fine as a light button; a neutral one needs
        // the bordered default look, or its enabled state is indistinguishable from disabled.
        variant={command.color ? "light" : "default"}
        color={command.color}
        fullWidth={vertical}
        leftSection={command.icon}
        loading={execute.isPending && execute.variables?.command.key === command.key}
        disabled={!runnable}
        onClick={run}
      >
        {command.label}
      </Button>
    );

    return vertical ? (
      <Stack key={command.key} gap={4}>
        {input}
        {button}
      </Stack>
    ) : (
      <Group key={command.key} gap={4} wrap="nowrap">
        {input}
        {button}
      </Group>
    );
  };

  const neutral = commands.filter((command) => !command.destructive);
  const destructive = commands.filter((command) => command.destructive);

  if (vertical) {
    return (
      <Stack gap="sm" style={{ flex: 1 }}>
        {neutral.map(renderCommand)}
        {destructive.length > 0 && (
          <>
            <Divider mt="auto" />
            {destructive.map(renderCommand)}
          </>
        )}
      </Stack>
    );
  }

  return (
    <Group gap="sm" wrap="wrap">
      {neutral.map(renderCommand)}
      {destructive.length > 0 && <Divider orientation="vertical" />}
      {destructive.map(renderCommand)}
    </Group>
  );
}
