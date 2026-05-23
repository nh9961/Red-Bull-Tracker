import type { EntryDraft, LimitCheckResult, LimitViolation, RedBullEntry, UserLimits } from "../types";
import { getBstHour } from "./greeting";
import { currency, spendFor, sum } from "./metrics";

export const DEFAULT_LIMITS: UserLimits = {};

const PREFS_CAN_KEY = "dailyCanLimit";
const PREFS_SPEND_KEY = "dailySpendLimit";
const PREFS_STOP_KEY = "stopTime";

export function parseUserLimits(prefs: Record<string, unknown> | null | undefined): UserLimits {
  if (!prefs) return { ...DEFAULT_LIMITS };

  const limits: UserLimits = {};
  const canLimit = Number(prefs[PREFS_CAN_KEY]);
  const spendLimit = Number(prefs[PREFS_SPEND_KEY]);
  const stopTime = typeof prefs[PREFS_STOP_KEY] === "string" ? prefs[PREFS_STOP_KEY] : undefined;

  if (Number.isFinite(canLimit) && canLimit > 0) limits.dailyCanLimit = canLimit;
  if (Number.isFinite(spendLimit) && spendLimit >= 0) limits.dailySpendLimit = spendLimit;
  if (stopTime && /^\d{2}:\d{2}$/.test(stopTime)) limits.stopTime = stopTime;

  return limits;
}

export function serializeUserLimits(limits: UserLimits): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (limits.dailyCanLimit != null && limits.dailyCanLimit > 0) {
    data[PREFS_CAN_KEY] = limits.dailyCanLimit;
  }
  if (limits.dailySpendLimit != null && limits.dailySpendLimit >= 0) {
    data[PREFS_SPEND_KEY] = limits.dailySpendLimit;
  }
  if (limits.stopTime) {
    data[PREFS_STOP_KEY] = limits.stopTime;
  }
  return data;
}

export function mergePrefsWithLimits(
  existing: Record<string, unknown> | null | undefined,
  limits: UserLimits,
): Record<string, unknown> {
  const next = { ...(existing ?? {}) };
  delete next[PREFS_CAN_KEY];
  delete next[PREFS_SPEND_KEY];
  delete next[PREFS_STOP_KEY];
  return { ...next, ...serializeUserLimits(limits) };
}

export function formatBstDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getBstMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function parseStopTimeMinutes(stopTime: string) {
  const [hours, minutes] = stopTime.split(":").map((value) => Number(value));
  return hours * 60 + minutes;
}

export function isPastStopTime(stopTime: string | undefined, date = new Date()) {
  if (!stopTime) return false;
  return getBstMinutes(date) >= parseStopTimeMinutes(stopTime);
}

export function formatStopTimeLabel(stopTime: string) {
  const [hours, minutes] = stopTime.split(":").map((value) => Number(value));
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function entriesTodayBst(entries: RedBullEntry[], ref = new Date()) {
  const key = formatBstDateKey(ref);
  return entries.filter((entry) => formatBstDateKey(new Date(entry.dateTime)) === key);
}

function spendForDraft(draft: EntryDraft) {
  return draft.cans * draft.pricePerCan;
}

function todayTotals(entries: RedBullEntry[], excludeEntryId?: string, ref = new Date()) {
  const todayEntries = entriesTodayBst(entries, ref).filter((entry) => entry.id !== excludeEntryId);
  return {
    todayCans: sum(todayEntries, (entry) => entry.cans),
    todaySpend: sum(todayEntries, spendFor),
  };
}

export function evaluateLimits(
  limits: UserLimits,
  entries: RedBullEntry[],
  options?: { draft?: EntryDraft; excludeEntryId?: string; at?: Date },
): LimitCheckResult {
  const ref = options?.at ?? new Date();
  const { todayCans, todaySpend } = todayTotals(entries, options?.excludeEntryId, ref);
  const draft = options?.draft;
  const projectedCans = draft ? todayCans + draft.cans : todayCans;
  const projectedSpend = draft ? todaySpend + spendForDraft(draft) : todaySpend;
  const checkTime = draft?.dateTime ? new Date(draft.dateTime) : ref;
  const pastStopTime = limits.stopTime ? isPastStopTime(limits.stopTime, checkTime) : false;

  const violations: LimitViolation[] = [];

  if (limits.dailyCanLimit != null) {
    const over = draft ? projectedCans > limits.dailyCanLimit : todayCans >= limits.dailyCanLimit;
    if (over) violations.push("cans");
  }

  if (limits.dailySpendLimit != null) {
    const over = draft ? projectedSpend > limits.dailySpendLimit : todaySpend >= limits.dailySpendLimit;
    if (over) violations.push("spend");
  }

  if (limits.stopTime && pastStopTime) {
    violations.push("stopTime");
  }

  return {
    violations,
    projectedCans,
    projectedSpend,
    todayCans,
    todaySpend,
    pastStopTime,
  };
}

export function limitProgress(current: number, limit?: number) {
  if (!limit || limit <= 0) return 0;
  return Math.min(100, Math.round((current / limit) * 100));
}

export function limitStatusMessage(
  violations: LimitViolation[],
  check: LimitCheckResult,
  limits: UserLimits,
): string {
  const lines: string[] = [];

  if (violations.includes("cans") && limits.dailyCanLimit != null) {
    lines.push(
      `This would bring you to ${check.projectedCans.toFixed(1)}/${limits.dailyCanLimit} cans today (BST).`,
    );
  }

  if (violations.includes("spend") && limits.dailySpendLimit != null) {
    lines.push(
      `This would bring today's spend to ${currency.format(check.projectedSpend)} of your ${currency.format(limits.dailySpendLimit)} limit.`,
    );
  }

  if (violations.includes("stopTime") && limits.stopTime) {
    lines.push(`You're past your stop time (${formatStopTimeLabel(limits.stopTime)} BST).`);
  }

  return lines.join(" ");
}

export function limitsSummaryForCoach(limits: UserLimits, check: LimitCheckResult): string {
  const parts: string[] = [];

  if (limits.dailyCanLimit != null) {
    parts.push(`daily can limit: ${limits.dailyCanLimit} (${check.todayCans} logged today)`);
  }
  if (limits.dailySpendLimit != null) {
    parts.push(`daily spend limit: ${currency.format(limits.dailySpendLimit)} (${currency.format(check.todaySpend)} today)`);
  }
  if (limits.stopTime) {
    parts.push(
      `stop drinking by: ${formatStopTimeLabel(limits.stopTime)} bst (${check.pastStopTime ? "past stop time now" : "before stop time"})`,
    );
  }

  if (!parts.length) return "no personal daily limits configured yet.";
  return parts.join(". ");
}

export function hasAnyLimit(limits: UserLimits) {
  return Boolean(limits.dailyCanLimit != null || limits.dailySpendLimit != null || limits.stopTime);
}

export { getBstHour };
