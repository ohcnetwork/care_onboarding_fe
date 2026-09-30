export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function initialsOf(name: string): string {
  const words = name
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  const parts = words.map((w) => (w.length <= 4 && w === w.toUpperCase() ? w : w[0]));
  return parts.join("").toUpperCase().slice(0, 4);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
