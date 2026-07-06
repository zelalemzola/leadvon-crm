export function startOfUtcDayIso(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function parseTimestampMs(value: string | null | undefined) {
  if (!value?.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Latest UTC instant from env `LEAD_INGEST_FROM_UTC` (ISO) or `LEAD_INGEST_FROM_DATE` (YYYY-MM-DD). */
export function ingestFromEnv(): string | null {
  const iso = process.env.LEAD_INGEST_FROM_UTC?.trim();
  if (iso) return iso;
  const day = process.env.LEAD_INGEST_FROM_DATE?.trim();
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return startOfUtcDayIso(new Date(`${day}T00:00:00.000Z`));
  }
  return null;
}

/** Most recent (restrictive) ingest floor across DB cursor + env. */
export function resolveIngestFrom(cursorIngestFrom?: string | null) {
  const floors = [cursorIngestFrom, ingestFromEnv()].filter((value): value is string =>
    Boolean(value?.trim())
  );
  if (floors.length === 0) return null;
  return floors.reduce((latest, value) => (value > latest ? value : latest));
}

export function isOnOrAfterIngestFrom(
  sourceTimestamp: string | null | undefined,
  ingestFromIso: string | null
) {
  if (!ingestFromIso) return true;
  const floorMs = parseTimestampMs(ingestFromIso);
  if (floorMs === null) return true;
  const sourceMs = parseTimestampMs(sourceTimestamp);
  if (sourceMs === null) return false;
  return sourceMs >= floorMs;
}

export function maxIsoTimestamp(...values: Array<string | null | undefined>) {
  const parsed = values
    .filter((value): value is string => Boolean(value?.trim()))
    .sort((a, b) => a.localeCompare(b));
  return parsed.at(-1) ?? null;
}
