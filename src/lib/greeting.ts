import type { LimitCheckResult } from "../types";
import { formatStopTimeLabel } from "./userLimits";
import { groupByFlavour } from "./metrics";

type GreetingInput = {
  name: string;
  todayCans: number;
  favouriteFlavour: string;
  currentStreak: number;
  todayCaffeineMg: number;
  allTimeCans: number;
  dailyCanLimit?: number;
  limitCheck?: LimitCheckResult;
};

type GreetingResult = {
  badge: string;
  headline: string;
  subline: string;
};

export function getBstHour(date = new Date()) {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "numeric",
    hour12: false,
  }).format(date);
  return Number.parseInt(hour, 10);
}

export function buildDynamicGreeting(input: GreetingInput): GreetingResult {
  const hour = getBstHour();
  const timeLabel = timeOfDayLabel(hour);
  const cans = input.todayCans;
  const favourite =
    input.favouriteFlavour === "None yet" ? null : input.favouriteFlavour;
  const streak = input.currentStreak;

  const badge = cans === 0 ? `${timeLabel} · clear slate` : `${timeLabel} · ${cans} today`;

  let headline: string;
  if (cans === 0) {
    headline =
      streak > 0
        ? `${input.name}, nothing logged yet today. ${streak}-day streak still alive.`
        : `${input.name}, no Red Bulls logged yet this ${hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"}.`;
  } else if (cans === 1) {
    headline = `${input.name}, one Red Bull in so far today.`;
  } else if (input.dailyCanLimit != null) {
    if (cans >= input.dailyCanLimit) {
      headline = `${input.name}, you're at your ${input.dailyCanLimit}-can daily limit.`;
    } else if (cans >= input.dailyCanLimit - 1) {
      headline = `${input.name}, ${cans} Red Bulls today. One under your limit.`;
    } else {
      headline = `${input.name}, ${cans} Red Bulls today. Steady pace.`;
    }
  } else if (cans <= 3) {
    headline = `${input.name}, ${cans} Red Bulls today. Steady pace.`;
  } else {
    headline = `${input.name}, ${cans} Red Bulls today. Worth watching the caffeine curve.`;
  }

  const flavourLine = favourite
    ? cans > 0
      ? `Today's top pick looks like ${favourite}.`
      : `All-time favourite: ${favourite} (${input.allTimeCans} cans logged).`
    : "Your flavour story is just getting started.";

  const stopLine =
    input.limitCheck?.pastStopTime && input.limitCheck?.violations.includes("stopTime")
      ? "You're past your stop time for today."
      : null;

  const caffeineLine =
    stopLine ??
    (cans > 0 && input.todayCaffeineMg > 0
      ? `~${Math.round(input.todayCaffeineMg)}mg caffeine so far.`
      : hour >= 17 && cans === 0
        ? "Evening reset. Clean slate if you want it."
        : hour >= 22
          ? "Late night. Pace yourself if you're still going."
          : "Log an intake to unlock today's signals.");

  const limitLine =
    input.dailyCanLimit != null && cans > 0
      ? `${cans}/${input.dailyCanLimit} cans toward your daily limit.`
      : null;

  return {
    badge,
    headline,
    subline: [flavourLine, limitLine ?? caffeineLine].filter(Boolean).join(" "),
  };
}

export function stopTimeGreetingHint(stopTime?: string, pastStopTime?: boolean) {
  if (!stopTime || !pastStopTime) return null;
  return `Past your ${formatStopTimeLabel(stopTime)} stop time.`;
}

export function buildFlavourHistorySummary(entries: Parameters<typeof groupByFlavour>[0]) {
  const breakdown = groupByFlavour(entries);
  if (!breakdown.length) return "No flavour history yet.";

  return breakdown
    .map((item, index) => {
      const rank = index === 0 ? " (all-time favourite)" : "";
      return `- ${item.name}: ${item.value} cans${rank}`;
    })
    .join("\n");
}

function timeOfDayLabel(hour: number) {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}
