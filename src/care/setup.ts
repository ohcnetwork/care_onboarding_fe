import { request, type Paginated } from "@/lib/api";

export async function needsSetup(signal: AbortSignal): Promise<boolean> {
  const user = await request<{ is_superuser: boolean }>("GET", "/users/getcurrentuser/", undefined, signal);
  if (typeof user?.is_superuser !== "boolean") {
    throw new Error("CARE returned an unexpected account. Reload CARE and try again.");
  }
  if (!user.is_superuser) return false;

  const facilities = await request<Paginated<{ id: string }>>(
    "GET", "/facility/?limit=1&offset=0", undefined, signal,
  );
  if (!Number.isInteger(facilities?.count) || facilities.count < 0 ||
    !Array.isArray(facilities.results) ||
    facilities.results.length !== Math.min(facilities.count, 1) ||
    facilities.results.some((facility) => typeof facility?.id !== "string" || !facility.id)) {
    throw new Error("CARE returned an unexpected clinic list. Try again before starting setup.");
  }
  return facilities.count === 0;
}
