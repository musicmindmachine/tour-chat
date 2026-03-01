const MENTION_PATTERN = /(?:^|\s)@([a-z0-9_]{3,32})/gi;

export function normalizeForSearch(value: string) {
  return value.normalize("NFKC").trim().toLowerCase();
}

export function normalizeUsername(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 32);
}

export function extractMentionUsernames(value: string) {
  const usernames = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = MENTION_PATTERN.exec(value)) !== null) {
    const mention = normalizeUsername(match[1] ?? "");
    if (mention.length >= 3) {
      usernames.add(mention);
    }
  }

  return Array.from(usernames);
}
