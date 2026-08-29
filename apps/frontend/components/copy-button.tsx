"use client";

import { Button } from "@mantine/core";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useState } from "react";

// Copy with a brief confirmation: flips to "Copied" for a moment and back. Fixed width so the
// label change never shifts the layout.
export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      variant="default"
      size="compact-sm"
      w={96}
      leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1_500);
      }}
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}
