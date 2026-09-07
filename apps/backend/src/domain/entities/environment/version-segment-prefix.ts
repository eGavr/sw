// A loose version ask names leading dotted segments and matches any version they open: "140" matches
// "140.0.7339.80" and "140" itself, never "1400.1". Versions are honestly full on the stored side,
// nobody types them whole on the asking side.
export function matchesSegmentPrefix(version: string, prefix: string): boolean {
    return version === prefix || version.startsWith(`${prefix}.`);
}
