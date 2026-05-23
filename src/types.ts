export type BuiltInSize = 250 | 355 | 473;

export type RedBullEntry = {
  id: string;
  userId: string;
  cans: number;
  flavour: string;
  flavourAccent: string;
  sizeMl: number;
  pricePerCan: number;
  dateTime: string;
  notes?: string;
  store?: string;
  sugarFree: boolean;
  caffeineMgPerCan?: number;
  importKey: string;
  source: "manual" | "quick-add" | "excel" | "json";
  createdAt?: string;
  updatedAt?: string;
};

export type Flavour = {
  name: string;
  accent: string;
  sugarFree?: boolean;
};

export type DateFilter = "all" | "today" | "week" | "month" | "custom";

export type EntryDraft = Omit<
  RedBullEntry,
  "id" | "userId" | "importKey" | "source" | "createdAt" | "updatedAt"
> & {
  source?: RedBullEntry["source"];
};

export type Filters = {
  flavour: string;
  dateRange: DateFilter;
  store: string;
  from: string;
  to: string;
};

export type ImportPreviewRow = {
  rowNumber: number;
  entry?: EntryDraft;
  errors: string[];
  duplicate: boolean;
  duplicateReason?: string;
};

export type ImportPreview = {
  fileName: string;
  rows: ImportPreviewRow[];
};

export type ChatRole = "user" | "assistant";

export type CoachMessage = {
  id: string;
  role: ChatRole;
  content: string;
  thinking?: string;
  pending?: boolean;
  stopped?: boolean;
};

export type CoachChat = {
  id: string;
  userId: string;
  title: string;
  messages: CoachMessage[];
  createdAt: string;
  updatedAt: string;
};

export type UserLimits = {
  dailyCanLimit?: number;
  dailySpendLimit?: number;
  stopTime?: string;
};

export type LimitViolation = "cans" | "spend" | "stopTime";

export type LimitCheckResult = {
  violations: LimitViolation[];
  projectedCans: number;
  projectedSpend: number;
  todayCans: number;
  todaySpend: number;
  pastStopTime: boolean;
};
