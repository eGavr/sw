"use client";

import { Button } from "@mantine/core";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useState } from "react";

// Copy with a persistent confirmation: once copied it stays "Copied" — no timer flipping it back.
export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      variant="default"
      size="compact-sm"
      leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
      }}
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}
