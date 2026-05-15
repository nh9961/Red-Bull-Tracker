import type { RedBullEntry } from "../types";

export const CAFFEINE_PER_250ML = 80;
export const SUGAR_PER_250ML = 27;
export const STANDARD_CAN_VALUES = {
  250: { pricePerCan: 1.75, caffeineMg: 80 },
  355: { pricePerCan: 2.2, caffeineMg: 114 },
  473: { pricePerCan: 2.85, caffeineMg: 151 },
} as const;

export function spendFor(entry: RedBullEntry) {
  return entry.cans * entry.pricePerCan;
}

export function defaultPriceForSize(sizeMl: number) {
  if (sizeMl === 250 || sizeMl === 355 || sizeMl === 473) {
    return STANDARD_CAN_VALUES[sizeMl].pricePerCan;
  }
  return 0;
}

export function caffeinePerCan(sizeMl: number, override?: number) {
  if (typeof override === "number" && Number.isFinite(override) && override >= 0) {
    return override;
  }
  if (sizeMl === 250 || sizeMl === 355 || sizeMl === 473) {
    return STANDARD_CAN_VALUES[sizeMl].caffeineMg;
  }
  return (sizeMl / 250) * CAFFEINE_PER_250ML;
}

export function caffeineFor(entry: RedBullEntry) {
  return entry.cans * caffeinePerCan(entry.sizeMl, entry.caffeineMgPerCan);
}

export function sugarFor(entry: RedBullEntry) {
  if (entry.sugarFree) return 0;
  return entry.cans * (entry.sizeMl / 250) * SUGAR_PER_250ML;
}

export function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function startOfWeek(date: Date) {
  const next = startOfDay(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function isSameDay(left: Date, right: Date) {
  return startOfDay(left).getTime() === startOfDay(right).getTime();
}

export function isWithin(date: Date, start: Date, end: Date) {
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

export function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatLocalInput(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function humanDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export const currency = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

export const wholeNumber = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 0,
});

export const oneDecimal = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 1,
});

export function sum(entries: RedBullEntry[], selector: (entry: RedBullEntry) => number) {
  return entries.reduce((total, entry) => total + selector(entry), 0);
}

export function entriesInRange(entries: RedBullEntry[], start: Date, end: Date) {
  return entries.filter((entry) => isWithin(new Date(entry.dateTime), start, end));
}

export function daysBetween(left: Date, right: Date) {
  return Math.floor(
    (startOfDay(right).getTime() - startOfDay(left).getTime()) / 86_400_000,
  );
}

export function trackedWeeks(entries: RedBullEntry[]) {
  if (!entries.length) return 1;
  const first = entries
    .map((entry) => new Date(entry.dateTime))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  return Math.max(1, Math.ceil((Date.now() - first.getTime()) / (7 * 86_400_000)));
}

export function groupByDay(entries: RedBullEntry[]) {
  const grouped = new Map<
    string,
    { label: string; spend: number; cans: number; caffeine: number; sugar: number }
  >();

  entries.forEach((entry) => {
    const date = new Date(entry.dateTime);
    const key = formatDateKey(date);
    const existing =
      grouped.get(key) ??
      ({
        label: new Intl.DateTimeFormat("en-GB", {
          day: "2-digit",
          month: "short",
        }).format(date),
        spend: 0,
        cans: 0,
        caffeine: 0,
        sugar: 0,
      } satisfies { label: string; spend: number; cans: number; caffeine: number; sugar: number });

    existing.spend += spendFor(entry);
    existing.cans += entry.cans;
    existing.caffeine += caffeineFor(entry);
    existing.sugar += sugarFor(entry);
    grouped.set(key, existing);
  });

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-30)
    .map(([, value]) => value);
}

export function groupByWeek(entries: RedBullEntry[]) {
  const grouped = new Map<string, { label: string; spend: number; cans: number }>();

  entries.forEach((entry) => {
    const date = new Date(entry.dateTime);
    const week = startOfWeek(date);
    const key = formatDateKey(week);
    const label = `W/C ${new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
    }).format(week)}`;
    const existing = grouped.get(key) ?? { label, spend: 0, cans: 0 };
    existing.spend += spendFor(entry);
    existing.cans += entry.cans;
    grouped.set(key, existing);
  });

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-10)
    .map(([, value]) => value);
}

export function groupByFlavour(entries: RedBullEntry[]) {
  const grouped = new Map<string, { name: string; value: number; spend: number; accent: string }>();

  entries.forEach((entry) => {
    const existing =
      grouped.get(entry.flavour) ??
      ({
        name: entry.flavour,
        value: 0,
        spend: 0,
        accent: entry.flavourAccent,
      } satisfies { name: string; value: number; spend: number; accent: string });
    existing.value += entry.cans;
    existing.spend += spendFor(entry);
    grouped.set(entry.flavour, existing);
  });

  return [...grouped.values()].sort((a, b) => b.value - a.value);
}

export function topByCans(entries: RedBullEntry[]) {
  return groupByFlavour(entries)[0]?.name ?? "None yet";
}

export function highestAveragePrice(entries: RedBullEntry[], key: "flavour" | "store") {
  const grouped = new Map<string, { total: number; cans: number }>();

  entries.forEach((entry) => {
    const label = key === "flavour" ? entry.flavour : entry.store?.trim();
    if (!label) return;
    const existing = grouped.get(label) ?? { total: 0, cans: 0 };
    existing.total += spendFor(entry);
    existing.cans += entry.cans;
    grouped.set(label, existing);
  });

  return [...grouped.entries()]
    .map(([label, value]) => ({
      label,
      average: value.cans > 0 ? value.total / value.cans : 0,
    }))
    .sort((a, b) => b.average - a.average)[0];
}

export function currentStreak(entries: RedBullEntry[]) {
  if (!entries.length) return 0;
  const days = new Set(entries.map((entry) => formatDateKey(startOfDay(new Date(entry.dateTime)))));
  let cursor = startOfDay(new Date());
  let streak = 0;

  while (days.has(formatDateKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 86_400_000);
  }

  return streak;
}

export function daysSinceLast(entries: RedBullEntry[]) {
  if (!entries.length) return 0;
  const latest = entries
    .map((entry) => new Date(entry.dateTime))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  return Math.max(0, daysBetween(latest, new Date()));
}

export function makeId() {
  return crypto.randomUUID?.() ?? `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function makeImportKey(entry: Pick<RedBullEntry, "dateTime" | "flavour" | "sizeMl" | "cans" | "pricePerCan" | "store" | "notes">) {
  return [
    new Date(entry.dateTime).toISOString(),
    entry.flavour.trim().toLowerCase(),
    entry.sizeMl,
    Number(entry.cans).toFixed(3),
    Number(entry.pricePerCan).toFixed(2),
    (entry.store ?? "").trim().toLowerCase(),
    (entry.notes ?? "").trim().toLowerCase(),
  ].join("|");
}
