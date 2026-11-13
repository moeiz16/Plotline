/** Short, readable check code from a fingerprint: "27af5206ac10…" → "27AF-5206-AC10". Never show the raw value. */
export function checkCode(digest: string | null | undefined, chars = 12) {
  if (!digest) return "–";
  return (digest.slice(0, chars).toUpperCase().match(/.{1,4}/g) ?? []).join("-");
}

/** Version labels in plain words, with any embedded fingerprint shortened to a check code. */
export function plainVersion(v: string | null | undefined, kind?: "signal") {
  if (!v) return "–";
  const fp = v.match(/\((?:sha-?256|hash)\s*([0-9a-f]{6,})\)/i)?.[1];
  let text = v.replace(/\((?:sha-?256|hash)[^)]*\)/i, "").trim();
  const colon = text.indexOf(": ");
  if (colon > 0 && kind !== "signal") text = text.slice(colon + 2).replace(/^./, (c) => c.toUpperCase());
  if (kind === "signal") {
    const ver = text.match(/v\d+(?:\.\d+)*/i)?.[0];
    text = `Land-change signal ${ver ?? ""}`.trim();
  }
  return fp ? `${text} · ${checkCode(fp)}` : text;
}
