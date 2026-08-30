"use client";

import { Button, Group, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation } from "@tanstack/react-query";
import { ReactNode, useState } from "react";

// One entry of the live session's control surface: a plain button, or (with `placeholder` set) an
// input feeding the command's single text argument.
export type SessionCommand = {
  key: string;
  label: string;
  color?: string;
  icon?: ReactNode;
  placeholder?: string;
  run: (argument: string) => Promise<void>;
  onSuccess?: () => void;
};

// Every command is one WebDriver call against the session, so extending the bar is adding one
// descriptor — the layout stays put. Failures land as notifications (the bar has no result surface).
export function SessionCommandBar({ commands }: { commands: Array<SessionCommand> }) {
  const [argumentByKey, setArgumentByKey] = useState<Record<string, string>>({});

  const execute = useMutation({
    mutationFn: ({ command, argument }: { command: SessionCommand; argument: string }) =>
      command.run(argument),
    onSuccess: (_, { command }) => command.onSuccess?.(),
    onError: (error, { command }) =>
      notifications.show({ color: "red", title: command.label, message: (error as Error).message }),
  });

  return (
    <Group gap="sm" wrap="wrap">
      {commands.map((command) => {
        const argument = (argumentByKey[command.key] ?? "").trim();
        const runnable = command.placeholder === undefined || argument !== "";
        const run = (): void => execute.mutate({ command, argument });

        return (
          <Group key={command.key} gap={4} wrap="nowrap">
            {command.placeholder !== undefined && (
              <TextInput
                size="xs"
                w={280}
                placeholder={command.placeholder}
                value={argumentByKey[command.key] ?? ""}
                onChange={(e) =>
                  setArgumentByKey({ ...argumentByKey, [command.key]: e.currentTarget.value })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && runnable) {
                    run();
                  }
                }}
              />
            )}
            <Button
              size="compact-sm"
              variant="light"
              color={command.color ?? "gray"}
              leftSection={command.icon}
              loading={execute.isPending && execute.variables?.command.key === command.key}
              disabled={!runnable}
              onClick={run}
            >
              {command.label}
            </Button>
          </Group>
        );
      })}
    </Group>
  );
}
