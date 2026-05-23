import type { Models } from "appwrite";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  Cloud,
  Command,
  Edit3,
  FileJson,
  FileSpreadsheet,
  Gauge,
  Github,
  Home,
  Info,
  LineChart,
  Loader2,
  LogIn,
  LogOut,
  MessageCircle,
  Plus,
  PoundSterling,
  RefreshCcw,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  TimerReset,
  Trash2,
  Upload,
  User,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart as RechartsLineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BUILT_IN_FLAVOURS, DEFAULT_FLAVOUR, accentForCustomFlavour, flavourMeta, mergedFlavours } from "./data/flavours";
import {
  APP_THEMES,
  THEME_CATEGORIES,
  THEME_STORAGE_KEY,
  getThemeById,
  readStoredThemeId,
  type AppTheme,
  type ThemeCategory,
} from "./data/themes";
import { themeTokensToStyle } from "./lib/themeTokens";
import { account, appwriteConfig, Channel, client, OAuthProvider, pingAppwrite } from "./lib/appwrite";
import {
  appwriteErrorMessage,
  createEntries,
  createEntry,
  deleteEntry as deleteEntryDocument,
  isDuplicateDraft,
  listEntries,
  updateEntry,
} from "./lib/appwriteEntries";
import { CoachPanel } from "./components/CoachPanel";
import { DailyLimitsCard } from "./components/DailyLimitsCard";
import { LimitsSettingsForm } from "./components/LimitsSettingsForm";
import { OnboardingScreen } from "./components/OnboardingScreen";
import { buildDynamicGreeting } from "./lib/greeting";
import {
  evaluateLimits,
  limitStatusMessage,
  mergePrefsWithLimits,
  parseUserLimits,
} from "./lib/userLimits";
import type { CoachSession } from "./lib/useCoachSession";
import { useCoachSession } from "./lib/useCoachSession";
import { createExcelExport, downloadBlob, parseExcelImport } from "./lib/excel";
import {
  caffeineFor,
  caffeinePerCan,
  currency,
  currentStreak,
  daysSinceLast,
  defaultPriceForSize,
  entriesInRange,
  formatLocalInput,
  groupByDay,
  groupByFlavour,
  groupByWeek,
  highestAveragePrice,
  humanDateTime,
  makeId,
  oneDecimal,
  spendFor,
  startOfDay,
  startOfMonth,
  startOfWeek,
  sugarFor,
  sum,
  topByCans,
  trackedWeeks,
  wholeNumber,
} from "./lib/metrics";
import { exportPayload, parseImport } from "./lib/storage";
import type {
  DateFilter,
  EntryDraft,
  Filters,
  Flavour,
  ImportPreview,
  LimitCheckResult,
  RedBullEntry,
  UserLimits,
} from "./types";

type AppView = "overview" | "logbook" | "trends" | "coach" | "settings";
type AuthMode = "login" | "signup";
type AuthUser = Models.User<Models.Preferences>;
type SetupStatus = { state: "checking" | "ok" | "error"; message: string };

type PendingLimitAction = {
  kind: "save" | "quick";
  draft: EntryDraft;
  editingId?: string;
  quickLabel?: string;
};

const DEFAULT_FILTERS: Filters = {
  flavour: "all",
  dateRange: "all",
  store: "",
  from: "",
  to: "",
};

const QUICK_ADDS = [
  { label: "Original", flavour: "Original", sizeMl: 250, pricePerCan: 1.75 },
  { label: "Sugar Free", flavour: "Sugar Free", sizeMl: 250, pricePerCan: 1.75 },
  { label: "Tropical", flavour: "Tropical", sizeMl: 250, pricePerCan: 1.75 },
  { label: "473ml Original", flavour: "Original", sizeMl: 473, pricePerCan: 2.85 },
];

const NAV_ITEMS: Array<{ id: AppView; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "logbook", label: "Logbook", icon: CalendarDays },
  { id: "trends", label: "Trends", icon: LineChart },
  { id: "coach", label: "Coach", icon: MessageCircle },
  { id: "settings", label: "Settings", icon: Settings2 },
];

const MATERIAL_ACCENTS = {
  primary: "var(--chart-primary)",
  secondary: "var(--chart-secondary)",
  tertiary: "var(--chart-tertiary)",
  error: "var(--chart-error)",
  custom: "#b85d84",
};

function App() {
  const [themeId, setThemeId] = useState(() => readStoredThemeId());
  const activeTheme = useMemo(() => getThemeById(themeId), [themeId]);
  const shellStyle = useMemo(() => themeTokensToStyle(activeTheme.tokens), [activeTheme]);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [setupStatus, setSetupStatus] = useState<SetupStatus>({
    state: "checking",
    message: "Pinging Appwrite...",
  });
  const [entries, setEntries] = useState<RedBullEntry[]>([]);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [activeView, setActiveView] = useState<AppView>("overview");
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<RedBullEntry | null>(null);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [notice, setNotice] = useState("Appwrite session pending.");
  const [dataLoading, setDataLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [dataError, setDataError] = useState("");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [userLimits, setUserLimits] = useState<UserLimits>({});
  const [limitConfirmOpen, setLimitConfirmOpen] = useState(false);
  const [limitConfirmMessage, setLimitConfirmMessage] = useState("");
  const [pendingLimitAction, setPendingLimitAction] = useState<PendingLimitAction | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const excelFileInputRef = useRef<HTMLInputElement>(null);
  const jsonFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, themeId);
  }, [themeId]);

  const refreshEntries = useCallback(async (userId: string, showLoader = true) => {
    if (showLoader) setDataLoading(true);
    setDataError("");
    try {
      const remoteEntries = await listEntries(userId);
      setEntries(sortEntries(remoteEntries));
      setNotice(`Synced ${remoteEntries.length} Appwrite entr${remoteEntries.length === 1 ? "y" : "ies"}.`);
    } catch (error) {
      const message = appwriteErrorMessage(error);
      setDataError(message);
      setNotice("Appwrite sync failed.");
    } finally {
      if (showLoader) setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      setAuthLoading(true);
      setAuthError("");
      try {
        await pingAppwrite();
        if (!mounted) return;
        setSetupStatus({ state: "ok", message: "Appwrite ping succeeded." });
      } catch (error) {
        if (!mounted) return;
        setSetupStatus({
          state: "error",
          message: error instanceof Error ? error.message : "Appwrite ping failed.",
        });
      }

      try {
        const currentUser = await account.get();
        if (!mounted) return;
        setUser(currentUser);
        setUserLimits(parseUserLimits(currentUser.prefs));
        if (typeof currentUser.prefs.themeId === "string" && currentUser.prefs.themeId) {
          setThemeId(currentUser.prefs.themeId);
        }
        setNotice(`Signed in as ${currentUser.email || currentUser.name || "Appwrite user"}.`);
        if (!currentUser.prefs.onboarded) {
          setShowOnboarding(true);
        }
      } catch {
        if (!mounted) return;
        setUser(null);
        setNotice("Sign in to sync entries across devices.");
      } finally {
        if (mounted) setAuthLoading(false);
      }
    }

    void bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setEntries([]);
      return;
    }
    void refreshEntries(user.$id);
  }, [refreshEntries, user]);

  useEffect(() => {
    if (!user) return undefined;

    const unsubscribe = client.subscribe<Record<string, unknown>>(
      Channel.tablesdb(appwriteConfig.databaseId).table(appwriteConfig.collectionId).row(),
      (event) => {
        if (event.payload?.userId === user.$id) {
          void refreshEntries(user.$id, false);
        }
      },
    );

    return () => unsubscribe();
  }, [refreshEntries, user]);

  const allFlavours = useMemo(
    () => mergedFlavours(entries.map((entry) => entry.flavour)),
    [entries],
  );
  const filteredEntries = useMemo(
    () => sortEntries(applyFilters(entries, filters)),
    [entries, filters],
  );
  const dashboard = useMemo(() => buildDashboard(entries), [entries]);
  const limitCheck = useMemo(() => evaluateLimits(userLimits, entries), [userLimits, entries]);
  const chartData = useMemo(() => groupByDay(filteredEntries), [filteredEntries]);
  const weekData = useMemo(() => groupByWeek(filteredEntries), [filteredEntries]);
  const flavourData = useMemo(() => groupByFlavour(filteredEntries), [filteredEntries]);
  const insights = useMemo(() => buildInsights(entries), [entries]);
  const recentEntries = useMemo(() => entries.slice(0, 5), [entries]);
  const coachSession = useCoachSession(
    user ?? ({ $id: "", email: "", name: "" } as AuthUser),
    dashboard,
    entries,
    userLimits,
    limitCheck,
  );

  async function login(email: string, password: string) {
    setActionLoading("auth");
    setAuthError("");
    try {
      await account.createEmailPasswordSession({ email, password });
      const currentUser = await account.get();
      setUser(currentUser);
      setUserLimits(parseUserLimits(currentUser.prefs));
      if (typeof currentUser.prefs.themeId === "string" && currentUser.prefs.themeId) {
        setThemeId(currentUser.prefs.themeId);
      }
      setNotice(`Signed in as ${currentUser.email}.`);
      if (!currentUser.prefs.onboarded) {
        setShowOnboarding(true);
      }
    } catch (error) {
      setAuthError(appwriteErrorMessage(error));
    } finally {
      setActionLoading(null);
    }
  }

  async function signup(name: string, email: string, password: string) {
    setActionLoading("auth");
    setAuthError("");
    try {
      await account.create({
        userId: makeId(),
        email,
        password,
        name: name.trim() || undefined,
      });
      await account.createEmailPasswordSession({ email, password });
      const currentUser = await account.get();
      setUser(currentUser);
      setUserLimits(parseUserLimits(currentUser.prefs));
      setNotice(`Welcome, ${currentUser.name || currentUser.email}.`);
      setShowOnboarding(true);
    } catch (error) {
      setAuthError(appwriteErrorMessage(error));
    } finally {
      setActionLoading(null);
    }
  }

  function startOAuth(provider: "github" | "google") {
    const selectedProvider = provider === "github" ? OAuthProvider.Github : OAuthProvider.Google;
    setActionLoading("oauth");
    account.createOAuth2Session({
      provider: selectedProvider,
      success: appwriteConfig.oauthSuccessUrl,
      failure: appwriteConfig.oauthFailureUrl,
    });
  }

  async function logout() {
    setActionLoading("logout");
    setDataError("");
    try {
      await account.deleteSession({ sessionId: "current" });
      setUser(null);
      setEntries([]);
      setUserLimits({});
      setNotice("Logged out.");
    } catch (error) {
      setDataError(appwriteErrorMessage(error));
    } finally {
      setActionLoading(null);
    }
  }

  function openNewEntry() {
    setEditingEntry(null);
    setIsEntryModalOpen(true);
  }

  async function saveUserLimits(next: UserLimits) {
    if (!user) return;
    setActionLoading("save-limits");
    setDataError("");
    try {
      const prefs = mergePrefsWithLimits(user.prefs, next);
      await account.updatePrefs(prefs);
      const currentUser = await account.get();
      setUser(currentUser);
      setUserLimits(parseUserLimits(currentUser.prefs));
      setNotice("Daily limits saved to your account.");
    } catch (error) {
      setDataError(appwriteErrorMessage(error));
    } finally {
      setActionLoading(null);
    }
  }

  async function saveOnboarding(limits: UserLimits, onboardingThemeId: string) {
    if (!user) return;
    setActionLoading("save-onboarding");
    setDataError("");
    try {
      const limitsPrefs = mergePrefsWithLimits(user.prefs, limits);
      const nextPrefs = {
        ...limitsPrefs,
        themeId: onboardingThemeId,
        onboarded: true,
      };
      await account.updatePrefs(nextPrefs);
      const currentUser = await account.get();
      setUser(currentUser);
      setUserLimits(parseUserLimits(currentUser.prefs));
      setThemeId(onboardingThemeId);
      setShowOnboarding(false);
      setNotice("Onboarding limits and theme saved successfully.");
    } catch (error) {
      setDataError(appwriteErrorMessage(error));
    } finally {
      setActionLoading(null);
    }
  }

  async function persistEntry(action: PendingLimitAction) {
    if (!user) return;
    const loadingKey = action.kind === "quick" ? `quick-${action.quickLabel ?? "add"}` : "save-entry";
    setActionLoading(loadingKey);
    setDataError("");
    try {
      const editing = action.editingId ? entries.find((entry) => entry.id === action.editingId) : null;
      const saved = editing
        ? await updateEntry(user.$id, editing.id, { ...action.draft, source: editing.source })
        : await createEntry(user.$id, { ...action.draft, source: action.draft.source ?? "manual" });
      setEntries((current) =>
        sortEntries(editing ? current.map((entry) => (entry.id === saved.id ? saved : entry)) : [saved, ...current]),
      );
      setNotice(editing ? "Entry updated in Appwrite." : "Entry saved to Appwrite.");
      setEditingEntry(null);
      setIsEntryModalOpen(false);
    } catch (error) {
      setDataError(appwriteErrorMessage(error));
    } finally {
      setActionLoading(null);
      setLimitConfirmOpen(false);
      setPendingLimitAction(null);
      setLimitConfirmMessage("");
    }
  }

  function requestEntrySave(draft: EntryDraft, editingId?: string) {
    const check = evaluateLimits(userLimits, entries, { draft, excludeEntryId: editingId });
    if (check.violations.length) {
      setPendingLimitAction({ kind: "save", draft, editingId });
      setLimitConfirmMessage(limitStatusMessage(check.violations, check, userLimits));
      setLimitConfirmOpen(true);
      return;
    }
    void persistEntry({ kind: "save", draft, editingId });
  }

  async function saveEntry(draft: EntryDraft) {
    if (!user) return;
    requestEntrySave(draft, editingEntry?.id);
  }

  async function quickAdd(item: (typeof QUICK_ADDS)[number]) {
    if (!user) return;
    const meta = flavourMeta(item.flavour);
    const draft: EntryDraft = {
      cans: 1,
      flavour: item.flavour,
      flavourAccent: meta.accent,
      sizeMl: item.sizeMl,
      pricePerCan: item.pricePerCan,
      dateTime: new Date().toISOString(),
      sugarFree: Boolean(meta.sugarFree),
      notes: "Quick add",
      store: "",
      source: "quick-add",
    };

    const check = evaluateLimits(userLimits, entries, { draft });
    if (check.violations.length) {
      setPendingLimitAction({ kind: "quick", draft, quickLabel: item.label });
      setLimitConfirmMessage(limitStatusMessage(check.violations, check, userLimits));
      setLimitConfirmOpen(true);
      return;
    }

    void persistEntry({ kind: "quick", draft, quickLabel: item.label });
  }

  function confirmLimitOverride() {
    if (!pendingLimitAction) return;
    void persistEntry(pendingLimitAction);
  }

  async function deleteEntry(id: string) {
    setActionLoading(`delete-${id}`);
    setDataError("");
    try {
      await deleteEntryDocument(id);
      setEntries((current) => current.filter((entry) => entry.id !== id));
      setNotice("Entry deleted from Appwrite.");
    } catch (error) {
      setDataError(appwriteErrorMessage(error));
    } finally {
      setActionLoading(null);
    }
  }

  async function resetAll() {
    setActionLoading("reset");
    setDataError("");
    try {
      await Promise.all(entries.map((entry) => deleteEntryDocument(entry.id)));
      setEntries([]);
      setFilters(DEFAULT_FILTERS);
      setIsResetOpen(false);
      setNotice("All Appwrite entries deleted.");
    } catch (error) {
      setDataError(appwriteErrorMessage(error));
    } finally {
      setActionLoading(null);
    }
  }

  async function exportExcel() {
    setActionLoading("excel-export");
    setDataError("");
    try {
      const blob = await createExcelExport(entries);
      downloadBlob(blob, `red-bull-intake-${new Date().toISOString().slice(0, 10)}.xlsx`);
      setNotice("Excel workbook exported.");
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Excel export failed.");
    } finally {
      setActionLoading(null);
    }
  }

  async function importExcel(file: File | undefined) {
    if (!file) return;
    setActionLoading("excel-import");
    setDataError("");
    try {
      const preview = await parseExcelImport(file, entries);
      setImportPreview(preview);
      setNotice(`${preview.rows.length} Excel row${preview.rows.length === 1 ? "" : "s"} parsed for review.`);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Excel import failed.");
    } finally {
      if (excelFileInputRef.current) excelFileInputRef.current.value = "";
      setActionLoading(null);
    }
  }

  async function confirmExcelImport() {
    if (!user || !importPreview) return;
    const drafts = importPreview.rows
      .filter((row) => row.entry && !row.errors.length && !row.duplicate)
      .map((row) => row.entry as EntryDraft);

    if (!drafts.length) {
      setNotice("No valid new Excel rows to import.");
      return;
    }

    setActionLoading("confirm-excel-import");
    setDataError("");
    try {
      const saved = await createEntries(user.$id, drafts);
      setEntries((current) => sortEntries([...saved, ...current]));
      setImportPreview(null);
      setNotice(`${saved.length} Excel row${saved.length === 1 ? "" : "s"} saved to Appwrite.`);
    } catch (error) {
      setDataError(appwriteErrorMessage(error));
    } finally {
      setActionLoading(null);
    }
  }

  function exportJson() {
    const blob = new Blob([exportPayload(entries)], { type: "application/json" });
    downloadBlob(blob, `red-bull-intake-${new Date().toISOString().slice(0, 10)}.json`);
    setNotice("JSON backup exported.");
  }

  async function importJson(file: File | undefined) {
    if (!file || !user) return;
    setActionLoading("json-import");
    setDataError("");
    try {
      const drafts = parseImport(await file.text());
      const uniqueDrafts = drafts.filter((draft) => !isDuplicateDraft(entries, draft));
      if (!uniqueDrafts.length) {
        setNotice("No new JSON entries found.");
        return;
      }
      const saved = await createEntries(user.$id, uniqueDrafts.map((draft) => ({ ...draft, source: "json" })));
      setEntries((current) => sortEntries([...saved, ...current]));
      setNotice(`${saved.length} JSON entr${saved.length === 1 ? "y" : "ies"} saved to Appwrite.`);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "JSON import failed.");
    } finally {
      if (jsonFileInputRef.current) jsonFileInputRef.current.value = "";
      setActionLoading(null);
    }
  }

  if (authLoading) {
    return <LoadingScreen setupStatus={setupStatus} shellStyle={shellStyle} themeId={themeId} />;
  }

  if (!user) {
    return (
      <AuthView
        authError={authError}
        busy={actionLoading === "auth" || actionLoading === "oauth"}
        setupStatus={setupStatus}
        shellStyle={shellStyle}
        themeId={themeId}
        onLogin={login}
        onOAuth={startOAuth}
        onSignup={signup}
      />
    );
  }

  return (
    <div
      className="app-shell min-h-screen overflow-x-hidden bg-[#050711] text-slate-100"
      data-theme={themeId}
      style={shellStyle}
    >
      {showOnboarding && user && (
        <OnboardingScreen
          userName={user.name || undefined}
          activeThemeId={themeId}
          onThemeChange={setThemeId}
          onSave={saveOnboarding}
          onClose={() => setShowOnboarding(false)}
        />
      )}
      <input
        ref={excelFileInputRef}
        className="hidden"
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(event) => void importExcel(event.currentTarget.files?.[0])}
      />
      <input
        ref={jsonFileInputRef}
        className="hidden"
        type="file"
        accept="application/json"
        onChange={(event) => void importJson(event.currentTarget.files?.[0])}
      />

      <ShellBackdrop />

      <div className="app-layout">
        <Sidebar
          activeView={activeView}
          dataLoading={dataLoading}
          notice={notice}
          setupStatus={setupStatus}
          user={user}
          onAdd={openNewEntry}
          onChange={setActiveView}
          onOpenSettings={() => setActiveView("settings")}
        />

        <div className="app-content">
          <MobileNav activeView={activeView} onChange={setActiveView} />

          <TopBar
            activeView={activeView}
            actionLoading={actionLoading}
            onAdd={openNewEntry}
          />

          <StatusRail actionLoading={actionLoading} dataError={dataError} setupStatus={setupStatus} />

          <AnimatePresence mode="wait">
            <motion.main
              key={activeView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="app-main"
            >
              {activeView === "overview" && user && (
                <OverviewView
                  dashboard={dashboard}
                  entries={entries}
                  insights={insights}
                  quickAdds={QUICK_ADDS}
                  recentEntries={recentEntries}
                  chartData={chartData}
                  flavourData={flavourData}
                  user={user}
                  userLimits={userLimits}
                  limitCheck={limitCheck}
                  coachSession={coachSession}
                  onQuickAdd={(item) => void quickAdd(item)}
                  onAdd={openNewEntry}
                  onOpenCoach={(prompt) => {
                    if (prompt) coachSession.queuePrompt(prompt);
                    setActiveView("coach");
                  }}
                  onOpenLogbook={() => setActiveView("logbook")}
                  onOpenSettings={() => setActiveView("settings")}
                />
              )}

              {activeView === "logbook" && (
                <LogbookView
                  entries={filteredEntries}
                  totalEntries={entries.length}
                  filters={filters}
                  flavours={allFlavours}
                  onFilterChange={setFilters}
                  onAdd={openNewEntry}
                  onEdit={(entry) => {
                    setEditingEntry(entry);
                    setIsEntryModalOpen(true);
                  }}
                  onDelete={(id) => void deleteEntry(id)}
                />
              )}

              {activeView === "trends" && (
                <TrendsView
                  chartData={chartData}
                  weekData={weekData}
                  flavourData={flavourData}
                  insights={insights}
                  entries={filteredEntries}
                  filters={filters}
                  flavours={allFlavours}
                  onFilterChange={setFilters}
                  userLimits={userLimits}
                  onSaveLimits={(next) => void saveUserLimits(next)}
                />
              )}

              {activeView === "coach" && user && (
                <CoachPanel
                  mode="full"
                  session={coachSession}
                  dashboard={dashboard}
                  userInitials={userInitials(user)}
                />
              )}

              {activeView === "settings" && (
                <SettingsView
                  activeTheme={activeTheme}
                  dashboard={dashboard}
                  dataLoading={dataLoading}
                  entries={entries}
                  notice={notice}
                  setupStatus={setupStatus}
                  themeId={themeId}
                  user={user}
                  userLimits={userLimits}
                  limitCheck={limitCheck}
                  actionLoading={actionLoading}
                  onExportExcel={() => void exportExcel()}
                  onImportExcel={() => excelFileInputRef.current?.click()}
                  onExportJson={exportJson}
                  onImportJson={() => jsonFileInputRef.current?.click()}
                  onLogout={() => void logout()}
                  onReset={() => setIsResetOpen(true)}
                  onThemeChange={setThemeId}
                  onSaveLimits={(next) => void saveUserLimits(next)}
                  onRerunOnboarding={() => setShowOnboarding(true)}
                />
              )}
            </motion.main>
          </AnimatePresence>
        </div>
      </div>

      <EntryModal
        entry={editingEntry}
        flavours={allFlavours}
        open={isEntryModalOpen}
        saving={actionLoading === "save-entry"}
        userLimits={userLimits}
        entries={entries}
        onClose={() => {
          setIsEntryModalOpen(false);
          setEditingEntry(null);
        }}
        onSave={(draft) => void saveEntry(draft)}
      />

      <ImportPreviewModal
        busy={actionLoading === "confirm-excel-import"}
        preview={importPreview}
        onClose={() => setImportPreview(null)}
        onConfirm={() => void confirmExcelImport()}
      />

      <ConfirmDialog
        busy={actionLoading === "reset"}
        open={isResetOpen}
        title="Delete all Appwrite entries?"
        body="This removes every intake entry owned by your current Appwrite user. Export first if you want a backup."
        confirmLabel="Delete all"
        onCancel={() => setIsResetOpen(false)}
        onConfirm={() => void resetAll()}
      />

      <ConfirmDialog
        busy={Boolean(actionLoading && pendingLimitAction)}
        open={limitConfirmOpen}
        title="Over your limit?"
        body={limitConfirmMessage || "This intake goes past one of your daily limits."}
        confirmLabel="Log anyway"
        onCancel={() => {
          setLimitConfirmOpen(false);
          setPendingLimitAction(null);
          setLimitConfirmMessage("");
        }}
        onConfirm={confirmLimitOverride}
      />
    </div>
  );
}

function ShellBackdrop() {
  return (
    <>
      <div className="backdrop-wash pointer-events-none fixed inset-0 -z-10" />
      <div className="backdrop-grid pointer-events-none fixed inset-0 -z-10" />
      <div className="backdrop-rail pointer-events-none fixed inset-x-0 top-0 -z-10 h-1" />
    </>
  );
}

function LoadingScreen({
  setupStatus,
  shellStyle,
  themeId,
}: {
  setupStatus: SetupStatus;
  shellStyle: CSSProperties;
  themeId: string;
}) {
  return (
    <div className="app-shell min-h-screen bg-[#050711] text-slate-100" data-theme={themeId} style={shellStyle}>
      <ShellBackdrop />
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="glass-panel w-full max-w-md p-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg border border-cyan-300/40 bg-cyan-300/10 text-cyan-200">
            <Loader2 className="animate-spin" size={24} aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">Red Bull tracker</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">{setupStatus.message}</p>
        </div>
      </div>
    </div>
  );
}

function AuthView({
  authError,
  busy,
  setupStatus,
  shellStyle,
  themeId,
  onLogin,
  onOAuth,
  onSignup,
}: {
  authError: string;
  busy: boolean;
  setupStatus: SetupStatus;
  shellStyle: CSSProperties;
  themeId: string;
  onLogin: (email: string, password: string) => Promise<void>;
  onOAuth: (provider: "github" | "google") => void;
  onSignup: (name: string, email: string, password: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "signup") {
      void onSignup(name, email, password);
      return;
    }
    void onLogin(email, password);
  }

  return (
    <div className="app-shell min-h-screen bg-[#050711] text-slate-100" data-theme={themeId} style={shellStyle}>
      <ShellBackdrop />
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-white">Red Bull Tracker</h1>
            <p className="mt-2 text-sm text-slate-400">Track intake, sync across devices.</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
            {setupStatus.state !== "ok" && (
              <div className="mb-4 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
                {setupStatus.message}
              </div>
            )}

            <div className="mb-5 grid grid-cols-2 gap-2 rounded-full border border-white/10 bg-white/[0.04] p-1">
              <button
                className={`min-h-9 rounded-full text-sm font-medium transition ${mode === "login" ? "bg-white/[0.08] text-white" : "text-slate-400 hover:text-slate-200"}`}
                type="button"
                onClick={() => setMode("login")}
              >
                Log in
              </button>
              <button
                className={`min-h-9 rounded-full text-sm font-medium transition ${mode === "signup" ? "bg-white/[0.08] text-white" : "text-slate-400 hover:text-slate-200"}`}
                type="button"
                onClick={() => setMode("signup")}
              >
                Sign up
              </button>
            </div>

            <form className="grid gap-3" onSubmit={submit}>
              {mode === "signup" && (
                <label className="grid gap-1 text-sm text-slate-300">
                  Name
                  <input className="field-control" type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ned" />
                </label>
              )}
              <label className="grid gap-1 text-sm text-slate-300">
                Email
                <input className="field-control" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
              </label>
              <label className="grid gap-1 text-sm text-slate-300">
                Password
                <input className="field-control" minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="8+ characters" required />
              </label>

              {authError && (
                <div className="rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                  {authError}
                </div>
              )}

              <button className="primary-button w-full mt-1" type="submit" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" size={17} aria-hidden="true" /> : <LogIn size={17} aria-hidden="true" />}
                {mode === "signup" ? "Create account" : "Log in"}
              </button>
            </form>

            <div className="my-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs uppercase tracking-[0.22em] text-slate-600">
              <span className="h-px bg-white/10" />
              or
              <span className="h-px bg-white/10" />
            </div>

            <div className="grid gap-2">
              <button className="secondary-button justify-center" type="button" disabled={busy} onClick={() => onOAuth("github")}>
                <Github size={17} aria-hidden="true" />
                Continue with GitHub
              </button>
              <button className="secondary-button justify-center" type="button" disabled={busy} onClick={() => onOAuth("google")}>
                <User size={17} aria-hidden="true" />
                Continue with Google
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function AuthSignal({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.06] p-3">
      <Icon className="mb-3 text-cyan-200" size={18} aria-hidden="true" />
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function CurrentThemeIndicator({
  theme,
  onClick,
}: {
  theme: AppTheme;
  onClick: () => void;
}) {
  return (
    <button className="theme-indicator" type="button" onClick={onClick} aria-label={`Theme: ${theme.label}. Open settings.`}>
      <span className="theme-indicator-swatch" style={{ background: theme.swatch }} aria-hidden="true" />
      <span className="theme-indicator-label">{theme.label}</span>
    </button>
  );
}

function ThemePicker({
  themeId,
  onChange,
}: {
  themeId: string;
  onChange: (id: string) => void;
}) {
  const [category, setCategory] = useState<ThemeCategory>("vocaloid");
  const activeTheme = getThemeById(themeId);
  const visibleThemes = APP_THEMES.filter((theme) => theme.category === category);

  return (
    <div className="settings-section">
      <div className="settings-tabs" role="tablist" aria-label="Theme categories">
        {THEME_CATEGORIES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={category === entry.id}
            className={category === entry.id ? "settings-tab-active" : ""}
            onClick={() => setCategory(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="theme-preview-strip">
        <div className="theme-preview-chip primary-button px-4 py-2 text-sm">Primary</div>
        <div className="theme-preview-chip glass-panel px-4 py-2 text-sm">Surface</div>
        <div className="theme-preview-chip rounded-lg px-4 py-2 text-sm" style={{ background: "var(--chart-secondary)", color: "#fff" }}>
          Chart
        </div>
      </div>

      <div className="theme-picker-grid" role="listbox" aria-label="App themes">
        {visibleThemes.map((theme) => (
          <button
            key={theme.id}
            type="button"
            role="option"
            aria-selected={themeId === theme.id}
            className={`theme-tile ${themeId === theme.id ? "theme-tile-active" : ""}`}
            onClick={() => onChange(theme.id)}
          >
            <span className="theme-tile-swatch" style={{ background: theme.swatch }} aria-hidden="true" />
            <span className="theme-tile-label">{theme.label}</span>
          </button>
        ))}
      </div>

      <p className="mt-3 text-sm text-slate-400">
        Current theme: <span className="font-semibold text-white">{activeTheme.label}</span>
      </p>
    </div>
  );
}

function Sidebar({
  activeView,
  dataLoading,
  notice,
  setupStatus,
  user,
  onAdd,
  onChange,
  onOpenSettings,
}: {
  activeView: AppView;
  dataLoading: boolean;
  notice: string;
  setupStatus: SetupStatus;
  user: AuthUser;
  onAdd: () => void;
  onChange: (view: AppView) => void;
  onOpenSettings: () => void;
}) {
  return (
    <aside className="material-drawer">
      <div className="drawer-brand">
        <div className="can-emblem">
          <Command size={22} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">Red Bull</p>
          <p className="truncate text-xs text-cyan-100">Intake tracker</p>
        </div>
      </div>

      <button className="drawer-primary-action" type="button" onClick={onAdd}>
        <Plus size={19} aria-hidden="true" />
        Add intake
      </button>

      <nav className="drawer-nav" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item ${activeView === item.id ? "nav-item-active" : ""}`}
            onClick={() => onChange(item.id)}
          >
            <item.icon size={18} aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="drawer-footer">
        <div className="drawer-info-card">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            {dataLoading ? <Loader2 className="animate-spin text-cyan-200" size={15} aria-hidden="true" /> : <Cloud className="text-cyan-200" size={15} aria-hidden="true" />}
            Sync
          </div>
          <p className="text-sm leading-5 text-slate-200">{notice}</p>
          <p className={`mt-2 text-xs ${setupStatus.state === "ok" ? "text-emerald-200" : "text-amber-200"}`}>{setupStatus.message}</p>
        </div>

        <button className="secondary-button w-full justify-center" type="button" onClick={onOpenSettings}>
          <User size={16} aria-hidden="true" />
          {user.name || user.email || "Account & settings"}
        </button>
      </div>
    </aside>
  );
}

function MobileNav({ activeView, onChange }: { activeView: AppView; onChange: (view: AppView) => void }) {
  return (
    <nav className="mobile-nav-bar lg:hidden" aria-label="Main navigation">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`mobile-nav-item ${activeView === item.id ? "mobile-nav-item-active" : ""}`}
          onClick={() => onChange(item.id)}
        >
          <item.icon size={16} aria-hidden="true" />
          {item.label}
        </button>
      ))}
    </nav>
  );
}

function TopBar({
  activeView,
  actionLoading,
  onAdd,
}: {
  activeView: AppView;
  actionLoading: string | null;
  onAdd: () => void;
}) {
  const activeItem = NAV_ITEMS.find((item) => item.id === activeView) ?? NAV_ITEMS[0];
  const title = activeItem.label;
  const ActiveIcon = activeItem.icon;
  const subtitle = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <header className="top-app-bar">
      <div className="top-app-bar-main">
        <div className="top-title-cluster">
          <span className="top-app-icon">
            <ActiveIcon size={24} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="top-kicker">{subtitle}</p>
            <h1 className="top-title">{title}</h1>
          </div>
        </div>
      </div>

      <div className="top-action-row">
        <button className="primary-button justify-center min-h-12 text-sm active:scale-95" type="button" onClick={onAdd} disabled={Boolean(actionLoading)}>
          <Plus size={18} aria-hidden="true" />
          Add Intake
        </button>
      </div>
    </header>
  );
}

function StatusRail({
  actionLoading,
  dataError,
  setupStatus,
}: {
  actionLoading: string | null;
  dataError: string;
  setupStatus: SetupStatus;
}) {
  if (!actionLoading && !dataError && setupStatus.state === "ok") return null;
  return (
    <div className="mt-3 grid gap-2">
      {actionLoading && (
        <div className="status-card border-cyan-300/30 bg-cyan-300/10 text-cyan-50">
          <Loader2 className="animate-spin" size={17} aria-hidden="true" />
          Working on {actionLabel(actionLoading)}...
        </div>
      )}
      {dataError && (
        <div className="status-card border-red-400/40 bg-red-500/10 text-red-100">
          <AlertTriangle size={17} aria-hidden="true" />
          {dataError}
        </div>
      )}
      {setupStatus.state === "error" && (
        <div className="status-card border-amber-300/40 bg-amber-300/10 text-amber-100">
          <AlertTriangle size={17} aria-hidden="true" />
          {setupStatus.message}
        </div>
      )}
    </div>
  );
}

function OverviewView({
  dashboard,
  entries,
  insights,
  quickAdds,
  recentEntries,
  chartData,
  flavourData,
  user,
  coachSession,
  userLimits,
  limitCheck,
  onQuickAdd,
  onAdd,
  onOpenCoach,
  onOpenLogbook,
  onOpenSettings,
}: {
  dashboard: Dashboard;
  entries: RedBullEntry[];
  insights: Insight[];
  quickAdds: typeof QUICK_ADDS;
  recentEntries: RedBullEntry[];
  chartData: Array<{ label: string; spend: number; cans: number; caffeine: number; sugar: number }>;
  flavourData: Array<{ name: string; value: number; spend: number; accent: string }>;
  user: AuthUser;
  userLimits: UserLimits;
  limitCheck: LimitCheckResult;
  coachSession: CoachSession;
  onQuickAdd: (item: (typeof QUICK_ADDS)[number]) => void;
  onAdd: () => void;
  onOpenCoach: (prompt?: string) => void;
  onOpenLogbook: () => void;
  onOpenSettings: () => void;
}) {
  const todaySpendRaw = limitCheck.todaySpend;
  const spendLimitDetail =
    userLimits.dailySpendLimit != null
      ? `${currency.format(todaySpendRaw)} of ${currency.format(userLimits.dailySpendLimit)} today`
      : `${dashboard.monthSpend} this month`;

  return (
    <div className="grid gap-4">
      <GreetingPanel dashboard={dashboard} user={user} userLimits={userLimits} limitCheck={limitCheck} onOpenCoach={onOpenCoach} />

      <DailyLimitsCard limits={userLimits} check={limitCheck} onOpenSettings={onOpenSettings} />

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <CoachPanel
          mode="compact"
          session={coachSession}
          dashboard={dashboard}
          userInitials={userInitials(user)}
          onExpand={() => onOpenCoach()}
        />
        <QuickAddPanel items={quickAdds} onQuickAdd={onQuickAdd} />
      </section>

      <TodayPanel dashboard={dashboard} entries={entries} userLimits={userLimits} limitCheck={limitCheck} onAdd={onAdd} />

      {limitCheck.violations.length ? (
        <section className="glass-panel border border-amber-200/20 bg-amber-200/10 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0 text-amber-200" size={20} aria-hidden="true" />
            <div>
              <p className="font-semibold text-white">Limit alerts</p>
              <p className="mt-1 text-sm leading-6 text-slate-300">
                {limitStatusMessage(limitCheck.violations, limitCheck, userLimits)}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile icon={CalendarDays} label="This Month" value={dashboard.monthCans} detail={`${dashboard.monthSpend} spent`} accent={MATERIAL_ACCENTS.primary} />
        <MetricTile
          icon={PoundSterling}
          label={userLimits.dailySpendLimit != null ? "Today's budget" : "Total Spend"}
          value={userLimits.dailySpendLimit != null ? currency.format(todaySpendRaw) : dashboard.totalSpend}
          detail={spendLimitDetail}
          accent={MATERIAL_ACCENTS.secondary}
        />
        <MetricTile icon={Activity} label="Favourite" value={dashboard.favouriteFlavour} detail="by total cans" accent={MATERIAL_ACCENTS.tertiary} />
        <MetricTile icon={TimerReset} label="Days Without" value={dashboard.daysWithoutRedBull} detail={`${dashboard.currentStreak} day streak`} accent={MATERIAL_ACCENTS.error} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <AppCard title="Spend overview" subtitle="Last 30 logged days">
          {chartData.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData} margin={{ top: 12, right: 12, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="spendGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={MATERIAL_ACCENTS.primary} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={MATERIAL_ACCENTS.primary} stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--subtle)" tickLine={false} axisLine={false} />
                <YAxis stroke="var(--subtle)" tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="spend" name="Spend" stroke={MATERIAL_ACCENTS.primary} fill="url(#spendGradient)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No spend data yet" copy="Add an intake or use quick add to start the chart." actionLabel="Add intake" onAction={onAdd} />
          )}
        </AppCard>

        <AppCard title="Recent entries" subtitle={`${recentEntries.length} shown`}>
          {recentEntries.length ? (
            <div className="grid gap-2">
              {recentEntries.map((entry) => (
                <MiniEntry key={entry.id} entry={entry} />
              ))}
              <button className="list-button" type="button" onClick={onOpenLogbook}>
                Open logbook
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <EmptyState title="Nothing logged" copy="Your newest entries will appear here." actionLabel="Add intake" onAction={onAdd} />
          )}
        </AppCard>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        {insights.map((insight) => (
          <InsightCard key={insight.label} insight={insight} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <AppCard title="Flavour mix" subtitle="Cans by flavour">
          {flavourData.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={flavourData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={104} paddingAngle={4} stroke="var(--surface-container)" strokeWidth={4}>
                  {flavourData.map((entry) => (
                    <Cell key={entry.name} fill={entry.accent} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No flavours yet" copy="Flavour breakdown appears after your first entry." />
          )}
        </AppCard>

        <DisclaimerCard />
      </section>
    </div>
  );
}

function GreetingPanel({
  dashboard,
  user,
  userLimits,
  limitCheck,
  onOpenCoach,
}: {
  dashboard: Dashboard;
  user: AuthUser;
  userLimits: UserLimits;
  limitCheck: LimitCheckResult;
  onOpenCoach: (prompt?: string) => void;
}) {
  const todayNumber = Number.parseFloat(dashboard.todayCans) || 0;
  const canLimit = userLimits.dailyCanLimit;
  const progress = canLimit ? Math.min(100, Math.round((todayNumber / canLimit) * 100)) : 0;
  const ringState = limitCheck.violations.includes("cans")
    ? "over"
    : canLimit && todayNumber >= canLimit * 0.75
      ? "warn"
      : "ok";
  const name = firstName(user);
  const greeting = buildDynamicGreeting({
    name,
    todayCans: todayNumber,
    favouriteFlavour: dashboard.favouriteFlavour,
    currentStreak: Number.parseInt(dashboard.currentStreak, 10) || 0,
    todayCaffeineMg: Number.parseFloat(dashboard.todayCaffeine.replace(/[^\d.]/g, "")) || 0,
    allTimeCans: Number.parseFloat(dashboard.allTimeCans) || 0,
    dailyCanLimit: canLimit,
    limitCheck,
  });

  const coachPrompts = [
    {
      label: "Pace today's caffeine",
      prompt: "what does my red bull pattern say about today?",
    },
    {
      label: "Sugar-free swap",
      prompt: "give me one lower-sugar swap based on my favourite flavour.",
    },
    {
      label: "Weekly spend trend",
      prompt: "review my weekly spend trend and suggest one saving.",
    },
  ];

  return (
    <section className="oura-hero glass-panel p-5 sm:p-6">
      <div className="grid gap-5 xl:grid-cols-[auto_1fr_auto] xl:items-center">
        <div
          className={`oura-ring${ringState === "over" ? " oura-ring--over" : ringState === "warn" ? " oura-ring--warn" : ""}`}
          style={{ "--progress": `${progress}%` } as CSSProperties}
          aria-label={
            canLimit ? `${progress}% of ${canLimit} can daily limit` : `${dashboard.todayCans} cans logged today`
          }
        >
          <div>
            <span>{dashboard.todayCans}</span>
            <small>{canLimit ? `of ${canLimit}` : "today"}</small>
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-semibold text-slate-400">
            <Sparkles size={14} aria-hidden="true" />
            {greeting.badge}
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{greeting.headline}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">{greeting.subline}</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[390px] xl:grid-cols-1">
          <WellnessPill label="Caffeine" value={dashboard.todayCaffeine} />
          <WellnessPill label="Sugar" value={dashboard.todaySugar} />
          <WellnessPill label="Streak" value={`${dashboard.currentStreak} days`} />
        </div>
      </div>

      <div className="mt-5 grid gap-2 md:grid-cols-3">
        {coachPrompts.map((item) => (
          <button key={item.label} className="suggestion-chip" type="button" onClick={() => onOpenCoach(item.prompt)}>
            {item.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function WellnessPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="wellness-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TodayPanel({
  dashboard,
  entries,
  userLimits,
  limitCheck,
  onAdd,
}: {
  dashboard: Dashboard;
  entries: RedBullEntry[];
  userLimits: UserLimits;
  limitCheck: LimitCheckResult;
  onAdd: () => void;
}) {
  const limitSummary = [
    userLimits.dailyCanLimit != null ? `${limitCheck.todayCans.toFixed(1)}/${userLimits.dailyCanLimit} cans` : null,
    userLimits.dailySpendLimit != null
      ? `${currency.format(limitCheck.todaySpend)} of ${currency.format(userLimits.dailySpendLimit)} spend`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="can-panel today-panel relative overflow-hidden p-5 sm:p-7">
      <p className="text-sm font-medium uppercase tracking-[0.18em] text-cyan-100">Today</p>
      <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-7xl font-semibold tracking-tight text-white sm:text-8xl">{dashboard.todayCans}</p>
          <p className="mt-2 text-lg text-slate-300">cans logged</p>
          {limitSummary ? <p className="mt-2 text-sm text-cyan-100/90">{limitSummary}</p> : null}
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[420px]">
          <MiniMetric label="Caffeine" value={dashboard.todayCaffeine} accent={MATERIAL_ACCENTS.primary} />
          <MiniMetric label="Sugar" value={dashboard.todaySugar} accent={MATERIAL_ACCENTS.secondary} />
          <MiniMetric label="Streak" value={dashboard.currentStreak} accent={MATERIAL_ACCENTS.tertiary} />
        </div>
      </div>
      <div className="today-action-row mt-6 hidden flex-wrap items-center gap-2 lg:flex">
        <button className="primary-button" type="button" onClick={onAdd}>
          <Plus size={18} aria-hidden="true" />
          Add intake
        </button>
        <span className="rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm text-slate-300">
          {entries.length ? `${dashboard.allTimeCans} all-time cans` : "Ready for your first entry"}
        </span>
      </div>
    </section>
  );
}

function QuickAddPanel({ items, onQuickAdd }: { items: typeof QUICK_ADDS; onQuickAdd: (item: (typeof QUICK_ADDS)[number]) => void }) {
  return (
    <AppCard title="Quick add" subtitle="One tap entries">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        {items.map((item) => {
          const meta = flavourMeta(item.flavour);
          return (
            <button
              key={item.label}
              className="group grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-white/10 bg-white/[0.06] p-3 text-left transition hover:border-cyan-300/40 hover:bg-white/[0.10]"
              type="button"
              onClick={() => onQuickAdd(item)}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-300/10 text-cyan-100 shadow-sm">
                <Zap size={17} aria-hidden="true" />
              </span>
              <span>
                <span className="block font-semibold text-white">{item.label}</span>
                <span className="text-sm text-slate-400">
                  {item.sizeMl}ml · {item.flavour}
                </span>
              </span>
              <span className="text-sm font-semibold" style={{ color: meta.accent }}>
                {currency.format(item.pricePerCan)}
              </span>
            </button>
          );
        })}
      </div>
    </AppCard>
  );
}

function LogbookView({
  entries,
  totalEntries,
  filters,
  flavours,
  onFilterChange,
  onAdd,
  onEdit,
  onDelete,
}: {
  entries: RedBullEntry[];
  totalEntries: number;
  filters: Filters;
  flavours: Flavour[];
  onFilterChange: (filters: Filters) => void;
  onAdd: () => void;
  onEdit: (entry: RedBullEntry) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <FiltersPanel filters={filters} flavours={flavours} onChange={onFilterChange} />
      <EntryLedger entries={entries} totalEntries={totalEntries} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} />
    </section>
  );
}

function TrendsView({
  chartData,
  weekData,
  flavourData,
  insights,
  entries,
  filters,
  flavours,
  onFilterChange,
  userLimits,
  onSaveLimits,
}: {
  chartData: Array<{ label: string; spend: number; cans: number; caffeine: number; sugar: number }>;
  weekData: Array<{ label: string; spend: number; cans: number }>;
  flavourData: Array<{ name: string; value: number; spend: number; accent: string }>;
  insights: Insight[];
  entries: RedBullEntry[];
  filters: Filters;
  flavours: Flavour[];
  onFilterChange: (filters: Filters) => void;
  userLimits: UserLimits;
  onSaveLimits: (limits: UserLimits) => void;
}) {
  return (
    <div className="grid gap-4">
      <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <FiltersPanel filters={filters} flavours={flavours} onChange={onFilterChange} compact />
        <AppCard title="Cans and spend" subtitle={`${entries.length} entries in view`}>
          {chartData.length ? (
            <ResponsiveContainer width="100%" height={340}>
              <AreaChart data={chartData} margin={{ top: 12, right: 16, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="trendSpend" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={MATERIAL_ACCENTS.primary} stopOpacity={0.26} />
                    <stop offset="100%" stopColor={MATERIAL_ACCENTS.primary} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="trendCans" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={MATERIAL_ACCENTS.secondary} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={MATERIAL_ACCENTS.secondary} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--subtle)" tickLine={false} axisLine={false} />
                <YAxis stroke="var(--subtle)" tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="spend" name="Spend" stroke={MATERIAL_ACCENTS.primary} fill="url(#trendSpend)" strokeWidth={3} />
                <Area type="monotone" dataKey="cans" name="Cans" stroke={MATERIAL_ACCENTS.secondary} fill="url(#trendCans)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No trend data" copy="Filtered chart data appears here." />
          )}
        </AppCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <AppCard title="Caffeine by day" subtitle="Estimated mg">
          {chartData.length ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ top: 12, right: 16, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--subtle)" tickLine={false} axisLine={false} />
                <YAxis stroke="var(--subtle)" tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="caffeine" name="Caffeine" fill={MATERIAL_ACCENTS.primary} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No caffeine data" copy="Add entries to estimate caffeine over time." />
          )}
        </AppCard>

        <AppCard title="Weekly comparison" subtitle="Spend and cans">
          {weekData.length ? (
            <ResponsiveContainer width="100%" height={300}>
              <RechartsLineChart data={weekData} margin={{ top: 12, right: 16, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--subtle)" tickLine={false} axisLine={false} />
                <YAxis stroke="var(--subtle)" tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="spend" name="Spend" stroke={MATERIAL_ACCENTS.tertiary} strokeWidth={3} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="cans" name="Cans" stroke={MATERIAL_ACCENTS.primary} strokeWidth={3} dot={{ r: 3 }} />
              </RechartsLineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No weekly comparison" copy="Weekly comparisons appear as your history grows." />
          )}
        </AppCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <AppCard title="Flavour split" subtitle="Cans by flavour">
          {flavourData.length ? (
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie data={flavourData} dataKey="value" nameKey="name" innerRadius={76} outerRadius={118} paddingAngle={4} stroke="var(--surface-container)" strokeWidth={4}>
                  {flavourData.map((entry) => (
                    <Cell key={entry.name} fill={entry.accent} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No flavour split" copy="Entries will form a flavour mix here." />
          )}
        </AppCard>

        <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-1">
          {insights.map((insight) => (
            <InsightCard key={insight.label} insight={insight} />
          ))}
        </div>
      </section>

      <section className="grid gap-4">
        <SpendingPredictionsCard
          entries={entries}
          userLimits={userLimits}
          onSaveLimits={onSaveLimits}
        />
      </section>
    </div>
  );
}


function SpendingPredictionsCard({
  entries,
  userLimits,
  onSaveLimits,
}: {
  entries: RedBullEntry[];
  userLimits: UserLimits;
  onSaveLimits?: (limits: UserLimits) => void;
}) {
  const [projectionDays, setProjectionDays] = useState<7 | 30 | 90 | 365>(30);
  const now = new Date();

  // Establish typical daily averages over last 30 calendar days (or all time if tracked less than 30 days)
  const firstEntryDate = useMemo(() => {
    if (!entries.length) return now;
    return new Date(
      [...entries].sort(
        (a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()
      )[0].dateTime
    );
  }, [entries]);

  const trackingDays = useMemo(() => {
    const diffTime = Math.abs(now.getTime() - firstEntryDate.getTime());
    return Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  }, [firstEntryDate]);

  const activePeriodDays = Math.min(30, trackingDays);

  const stats = useMemo(() => {
    const cutoff = new Date(now.getTime() - activePeriodDays * 24 * 60 * 60 * 1000);
    const recent = entries.filter((e) => new Date(e.dateTime) >= cutoff);
    const totalSpend = recent.reduce((sum, e) => sum + e.cans * e.pricePerCan, 0);
    const totalCans = recent.reduce((sum, e) => sum + e.cans, 0);

    return {
      avgDailySpend: totalSpend / activePeriodDays,
      avgDailyCans: totalCans / activePeriodDays,
      hasData: entries.length > 0,
    };
  }, [entries, activePeriodDays]);

  const projectionData = useMemo(() => {
    return Array.from({ length: projectionDays }).map((_, index) => {
      const day = index + 1;
      const dataPoint: any = {
        label: `Day ${day}`,
        "Current Path": Number((day * stats.avgDailySpend).toFixed(2)),
        "Optimal Path (-20%)": Number((day * stats.avgDailySpend * 0.8).toFixed(2)),
      };
      if (userLimits.dailySpendLimit != null) {
        dataPoint["Daily Limit Path"] = Number((day * userLimits.dailySpendLimit).toFixed(2));
      }
      return dataPoint;
    });
  }, [projectionDays, stats, userLimits.dailySpendLimit]);

  if (!stats.hasData) {
    return (
      <AppCard title="Spending predictions" subtitle="Simulated forecast based on past spending">
        <EmptyState title="Awaiting intake logs" copy="Predictions require historical logs. Add your first intake to unlock projections!" />
      </AppCard>
    );
  }

  const projectedSpend = stats.avgDailySpend * projectionDays;
  const projectedCans = stats.avgDailyCans * projectionDays;
  const optimalSpend = projectedSpend * 0.8;
  const potentialSavings = projectedSpend - optimalSpend;

  const handleApplyOptimalLimit = () => {
    if (!onSaveLimits) return;
    const optimalDailySpendLimit = Math.round(stats.avgDailySpend * 0.8 * 100) / 100;
    onSaveLimits({
      ...userLimits,
      dailySpendLimit: optimalDailySpendLimit,
    });
  };

  return (
    <AppCard
      title="Future spending predictions"
      subtitle={`Based on last ${activePeriodDays} days: average daily spend of ${currency.format(stats.avgDailySpend)}`}
    >
      <div className="space-y-6">
        {/* Toggle Range */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/5 pb-4">
          <p className="text-sm text-slate-400">Select projection window:</p>
          <div className="segmented-control max-w-xs self-start" role="tablist">
            {([7, 30, 90, 365] as const).map((days) => (
              <button
                key={days}
                type="button"
                role="tab"
                aria-selected={projectionDays === days}
                onClick={() => setProjectionDays(days)}
                className={projectionDays === days ? "segmented-control-active" : ""}
              >
                {days === 365 ? "1 Year" : `${days} Days`}
              </button>
            ))}
          </div>
        </div>

        {/* Projections Stats Grid */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Projected spend</span>
            <p className="text-2xl font-black text-white">{currency.format(projectedSpend)}</p>
            <span className="text-[10px] text-slate-400 block font-medium">
              ~{oneDecimal.format(projectedCans)} cans logged
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 space-y-1">
            <span className="text-[10px] font-bold text-emerald-400/80 uppercase tracking-wider block">Optimal path (-20%)</span>
            <p className="text-2xl font-black text-emerald-400">{currency.format(optimalSpend)}</p>
            <span className="text-[10px] text-emerald-500 block font-medium">
              ~{oneDecimal.format(projectedCans * 0.8)} cans logged
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-gradient-to-tr from-emerald-500/10 to-teal-500/5 border border-emerald-500/20 space-y-1 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold text-teal-300 uppercase tracking-wider block">Potential savings</span>
              <p className="text-2xl font-black text-teal-300">{currency.format(potentialSavings)}</p>
            </div>
            {onSaveLimits && (
              <button
                type="button"
                onClick={handleApplyOptimalLimit}
                className="text-[10px] text-left font-bold text-emerald-400 hover:text-emerald-300 underline mt-1 block transition active:scale-[0.98]"
              >
                Lock daily limit to {currency.format(stats.avgDailySpend * 0.8)}/day
              </button>
            )}
          </div>
        </div>

        {/* Projections Recharts AreaChart */}
        <div className="relative p-2 rounded-2xl bg-black/20 border border-white/5">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={projectionData} margin={{ top: 12, right: 16, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="currentProj" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="optimalProj" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="label" stroke="var(--subtle)" tickLine={false} axisLine={false} />
              <YAxis stroke="var(--subtle)" tickLine={false} axisLine={false} tickFormatter={(val) => `£${val}`} />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="Current Path"
                stroke="var(--primary)"
                fill="url(#currentProj)"
                strokeWidth={3}
              />
              <Area
                type="monotone"
                dataKey="Optimal Path (-20%)"
                stroke="#10b981"
                fill="url(#optimalProj)"
                strokeWidth={3}
                strokeDasharray="4 4"
              />
              {userLimits.dailySpendLimit != null && (
                <Line
                  type="monotone"
                  dataKey="Daily Limit Path"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="6 6"
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="text-xs text-slate-400 bg-white/[0.01] p-3 rounded-xl border border-white/5 flex items-start gap-2.5 leading-relaxed">
          <Info size={16} className="text-cyan-400 shrink-0 mt-0.5" />
          <span>
            The <strong>Optimal Path</strong> models a sustainable 20% reduction target, which fits guidelines for a healthy energy drink moderation pace. If a budget is active, the <strong>Limit Path</strong> displays the projection if you exhaust your daily limit budget completely every day.
          </span>
        </div>
      </div>
    </AppCard>
  );
}


function SettingsView({
  activeTheme,
  dashboard,
  dataLoading,
  entries,
  notice,
  setupStatus,
  themeId,
  user,
  userLimits,
  limitCheck,
  actionLoading,
  onExportExcel,
  onImportExcel,
  onExportJson,
  onImportJson,
  onLogout,
  onReset,
  onThemeChange,
  onSaveLimits,
  onRerunOnboarding,
}: {
  activeTheme: AppTheme;
  dashboard: Dashboard;
  dataLoading: boolean;
  entries: RedBullEntry[];
  notice: string;
  setupStatus: SetupStatus;
  themeId: string;
  user: AuthUser | null;
  userLimits: UserLimits;
  limitCheck: LimitCheckResult;
  actionLoading: string | null;
  onExportExcel: () => void;
  onImportExcel: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
  onLogout: () => void;
  onReset: () => void;
  onThemeChange: (id: string) => void;
  onSaveLimits: (limits: UserLimits) => void;
  onRerunOnboarding: () => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
      <div className="grid gap-4">
        <AppCard title="Daily limits" subtitle="Personal caps for cans, spend, and stop time (BST)">
          <LimitsSettingsForm
            limits={userLimits}
            check={limitCheck}
            saving={actionLoading === "save-limits"}
            onSave={onSaveLimits}
          />
          <div className="mt-4 border-t border-white/5 pt-4 flex justify-end">
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 text-xs font-bold text-slate-300 hover:bg-white/10 transition active:scale-95"
              type="button"
              onClick={onRerunOnboarding}
            >
              <Sparkles size={14} className="text-cyan-400" />
              Re-run onboarding wizard
            </button>
          </div>
        </AppCard>

        <AppCard title="Account" subtitle="Your Appwrite profile and sync status">
          <div className="rounded-lg border border-white/10 bg-white/[0.05] p-4">
            <p className="text-lg font-semibold text-white">{user?.name || "Appwrite user"}</p>
            <p className="mt-1 text-sm text-slate-400">{user?.email}</p>
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-300">
              {dataLoading ? <Loader2 className="animate-spin text-cyan-200" size={16} aria-hidden="true" /> : <Cloud className="text-cyan-200" size={16} aria-hidden="true" />}
              {notice}
            </div>
            <p className={`mt-2 text-xs ${setupStatus.state === "ok" ? "text-emerald-200" : "text-amber-200"}`}>{setupStatus.message}</p>
            <button className="secondary-button mt-4 justify-center" type="button" onClick={onLogout}>
              <LogOut size={17} aria-hidden="true" />
              Log out
            </button>
          </div>
        </AppCard>

        <AppCard title="Appearance" subtitle={`${activeTheme.label} theme active`}>
          <ThemePicker themeId={themeId} onChange={onThemeChange} />
        </AppCard>

        <AppCard title="Data & sync" subtitle={`${entries.length} entries synced for this user`}>
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniMetric label="All-time cans" value={dashboard.allTimeCans} accent={MATERIAL_ACCENTS.primary} />
            <MiniMetric label="Total spend" value={dashboard.totalSpend} accent={MATERIAL_ACCENTS.tertiary} />
            <MiniMetric label="Favourite" value={dashboard.favouriteFlavour} accent={MATERIAL_ACCENTS.secondary} />
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <button className="secondary-button justify-center" type="button" onClick={() => { typeof window !== 'undefined' && window.location.reload(); }} disabled={dataLoading}>
              {dataLoading ? <Loader2 className="animate-spin" size={17} aria-hidden="true" /> : <RefreshCcw size={17} aria-hidden="true" />}
              Sync now
            </button>
            <button className="excel-button justify-center" type="button" onClick={onExportExcel} disabled={!entries.length || Boolean(actionLoading)}>
              <FileSpreadsheet size={17} aria-hidden="true" />
              Export XLSX
            </button>
            <button className="excel-button justify-center" type="button" onClick={onImportExcel} disabled={Boolean(actionLoading)}>
              <Upload size={17} aria-hidden="true" />
              Import XLSX
            </button>
            <button className="secondary-button justify-center" type="button" onClick={onExportJson} disabled={!entries.length || Boolean(actionLoading)}>
              <FileJson size={17} aria-hidden="true" />
              Export JSON
            </button>
            <button className="secondary-button justify-center" type="button" onClick={onImportJson} disabled={Boolean(actionLoading)}>
              <Upload size={17} aria-hidden="true" />
              Import JSON
            </button>
          </div>

          <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.05] p-4">
            <p className="text-sm font-semibold text-white">Configured Appwrite IDs</p>
            <dl className="mt-3 grid gap-2 text-sm text-slate-300">
              <DataPair label="Endpoint" value={appwriteConfig.endpoint} />
              <DataPair label="Project" value={appwriteConfig.projectId} />
              <DataPair label="Database" value={appwriteConfig.databaseId} />
              <DataPair label="Collection" value={appwriteConfig.collectionId} />
              <DataPair label="Chats" value={appwriteConfig.chatCollectionId} />
            </dl>
          </div>

          <button className="danger-button mt-5 justify-center" type="button" onClick={onReset} disabled={!entries.length || Boolean(actionLoading)}>
            <RotateCcw size={17} aria-hidden="true" />
            Delete all entries
          </button>
        </AppCard>
      </div>

      <div className="grid gap-4">
        <AppCard title="Excel theme" subtitle="Pastel pink and soft blue workbook">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-cyan-200/30 bg-cyan-200/10 p-4">
              <FileSpreadsheet className="text-cyan-100" size={24} aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-white">Entries sheet</p>
              <p className="mt-1 text-sm leading-6 text-slate-300">Frozen headers, total row, auto-width columns.</p>
            </div>
            <div className="rounded-lg border border-pink-200/30 bg-pink-200/10 p-4">
              <Gauge className="text-pink-100" size={24} aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-white">Summary sheet</p>
              <p className="mt-1 text-sm leading-6 text-slate-300">Spend, caffeine, sugar, flavour totals.</p>
            </div>
          </div>
        </AppCard>
        <DisclaimerCard />
      </div>
    </div>
  );
}

function DataPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[110px_1fr]">
      <dt className="text-slate-500">{label}</dt>
      <dd className="truncate font-mono text-xs text-cyan-100">{value}</dd>
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  detail,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  accent: string;
}) {
  return (
    <motion.article
      className="glass-panel p-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-400">{label}</p>
          <p className="mt-3 break-words text-3xl font-semibold tracking-tight text-white">{value}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/10" style={{ color: accent }}>
          <Icon size={20} aria-hidden="true" />
        </div>
      </div>
      <p className="mt-4 text-sm text-slate-400">{detail}</p>
    </motion.article>
  );
}

function MiniMetric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.06] p-3">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-2 truncate text-xl font-semibold tracking-tight text-white" style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <article className="glass-panel p-4">
      <div className="mb-3 flex items-center gap-2 text-cyan-100">
        <Gauge size={17} aria-hidden="true" />
        <p className="text-sm font-medium">{insight.label}</p>
      </div>
      <p className="text-lg font-semibold text-white">{insight.value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{insight.detail}</p>
    </article>
  );
}

function AppCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="glass-panel p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="text-xl font-semibold tracking-tight text-white">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-[#080d1f]/95 px-3 py-2 shadow-fridge backdrop-blur-xl">
      <p className="mb-1 text-sm font-semibold text-white">{label}</p>
      {payload.map((item) => (
        <p key={item.name} className="text-sm text-slate-300">
          <span style={{ color: item.color }}>{item.name}</span>: {formatMetricValue(item.name, item.value)}
        </p>
      ))}
    </div>
  );
}

function EmptyState({
  title,
  copy,
  actionLabel,
  onAction,
}: {
  title: string;
  copy: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center rounded-lg border border-dashed border-cyan-200/30 bg-white/[0.04] p-6 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg border border-cyan-200/30 bg-cyan-200/10 text-cyan-100 shadow-sm">
        <Zap size={22} aria-hidden="true" />
      </div>
      <h3 className="text-xl font-semibold tracking-tight text-white">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">{copy}</p>
      {actionLabel && onAction && (
        <button className="primary-button mt-4" type="button" onClick={onAction}>
          <Plus size={17} aria-hidden="true" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function FiltersPanel({
  filters,
  flavours,
  compact = false,
  onChange,
}: {
  filters: Filters;
  flavours: Flavour[];
  compact?: boolean;
  onChange: (filters: Filters) => void;
}) {
  const set = <Key extends keyof Filters>(key: Key, value: Filters[Key]) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <AppCard title="Filters" subtitle={compact ? "Scope the charts" : "Search the logbook"}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <label className="field-label">
          Flavour
          <select className="field-control" value={filters.flavour} onChange={(event) => set("flavour", event.target.value)}>
            <option value="all">All flavours</option>
            {flavours.map((flavour) => (
              <option key={flavour.name} value={flavour.name}>
                {flavour.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field-label">
          Date range
          <select className="field-control" value={filters.dateRange} onChange={(event) => set("dateRange", event.target.value as DateFilter)}>
            <option value="all">All time</option>
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="custom">Custom range</option>
          </select>
        </label>

        {filters.dateRange === "custom" && (
          <>
            <label className="field-label">
              From
              <input className="field-control" type="date" value={filters.from} onChange={(event) => set("from", event.target.value)} />
            </label>
            <label className="field-label">
              To
              <input className="field-control" type="date" value={filters.to} onChange={(event) => set("to", event.target.value)} />
            </label>
          </>
        )}

        <label className="field-label sm:col-span-2 xl:col-span-1">
          Store or location
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} aria-hidden="true" />
            <input
              className="field-control pl-9"
              type="search"
              placeholder="Tesco, Shell, corner shop..."
              value={filters.store}
              onChange={(event) => set("store", event.target.value)}
            />
          </span>
        </label>

        <button className="secondary-button sm:col-span-2 xl:col-span-1" type="button" onClick={() => onChange(DEFAULT_FILTERS)}>
          <X size={17} aria-hidden="true" />
          Clear filters
        </button>
      </div>
    </AppCard>
  );
}

function EntryLedger({
  entries,
  totalEntries,
  onAdd,
  onEdit,
  onDelete,
}: {
  entries: RedBullEntry[];
  totalEntries: number;
  onAdd: () => void;
  onEdit: (entry: RedBullEntry) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <AppCard title="Entries" subtitle={`${entries.length} visible of ${totalEntries}`}>
      {entries.length ? (
        <div className="grid gap-2">
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      ) : (
        <EmptyState title="No entries found" copy="Add your first intake or clear the current filters." actionLabel="Add intake" onAction={onAdd} />
      )}
    </AppCard>
  );
}

function EntryRow({
  entry,
  onEdit,
  onDelete,
}: {
  entry: RedBullEntry;
  onEdit: (entry: RedBullEntry) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <article className="entry-row" style={{ "--accent": entry.flavourAccent } as CSSProperties}>
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[var(--accent)]" />
          <h3 className="text-lg font-semibold tracking-tight text-white">{entry.flavour}</h3>
          <span className="rounded-md border border-white/10 bg-white/10 px-2 py-1 text-xs font-medium text-slate-300">
            {entry.cans} can{entry.cans === 1 ? "" : "s"} · {entry.sizeMl}ml
          </span>
          <span className="rounded-md border border-cyan-200/20 bg-cyan-200/10 px-2 py-1 text-xs font-medium text-cyan-100">
            {entry.source}
          </span>
        </div>
        <p className="text-sm text-slate-400">{humanDateTime(entry.dateTime)}</p>
        <p className="mt-2 text-sm text-slate-200">
          {currency.format(spendFor(entry))} · {wholeNumber.format(caffeineFor(entry))}mg caffeine · {oneDecimal.format(sugarFor(entry))}g sugar
        </p>
        {(entry.store || entry.notes) && (
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {entry.store ? `${entry.store}` : ""}
            {entry.store && entry.notes ? " · " : ""}
            {entry.notes}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button className="icon-button" type="button" onClick={() => onEdit(entry)} aria-label={`Edit ${entry.flavour} entry`}>
          <Edit3 size={17} aria-hidden="true" />
        </button>
        <button className="icon-button text-red-200" type="button" onClick={() => onDelete(entry.id)} aria-label={`Delete ${entry.flavour} entry`}>
          <Trash2 size={17} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

function MiniEntry({ entry }: { entry: RedBullEntry }) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-white/10 bg-white/[0.06] p-3">
      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: entry.flavourAccent }} />
      <div className="min-w-0">
        <p className="truncate font-semibold text-white">{entry.flavour}</p>
        <p className="truncate text-sm text-slate-400">{humanDateTime(entry.dateTime)}</p>
      </div>
      <p className="text-sm font-semibold text-white">{currency.format(spendFor(entry))}</p>
    </div>
  );
}

function DisclaimerCard() {
  return (
    <section className="rounded-lg border border-cyan-200/20 bg-cyan-200/10 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-200/30 bg-[#07101f] text-cyan-100 shadow-sm">
          <Gauge size={19} aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white">Estimates</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Caffeine and sugar values are estimates. Check the can label for exact nutritional information.
          </p>
        </div>
      </div>
    </section>
  );
}

function EntryModal({
  open,
  entry,
  flavours,
  saving,
  userLimits,
  entries,
  onClose,
  onSave,
}: {
  open: boolean;
  entry: RedBullEntry | null;
  flavours: Flavour[];
  saving: boolean;
  userLimits: UserLimits;
  entries: RedBullEntry[];
  onClose: () => void;
  onSave: (draft: EntryDraft) => void;
}) {
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const initialFlavour = entry?.flavour ?? DEFAULT_FLAVOUR.name;
  const [selectedFlavour, setSelectedFlavour] = useState(initialFlavour);
  const [customFlavour, setCustomFlavour] = useState("");
  const [customAccent, setCustomAccent] = useState(MATERIAL_ACCENTS.custom);
  const [cans, setCans] = useState(entry?.cans.toString() ?? "1");
  const [sizePreset, setSizePreset] = useState(sizeToPreset(entry?.sizeMl ?? 250));
  const [customSize, setCustomSize] = useState(entry?.sizeMl.toString() ?? "250");
  const [pricePerCan, setPricePerCan] = useState(entry?.pricePerCan.toString() ?? "1.75");
  const [dateTime, setDateTime] = useState(formatLocalInput(entry ? new Date(entry.dateTime) : new Date()));
  const [store, setStore] = useState(entry?.store ?? "");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [sugarFree, setSugarFree] = useState(entry?.sugarFree ?? false);
  const [caffeineOverride, setCaffeineOverride] = useState(entry?.caffeineMgPerCan?.toString() ?? "");

  useEffect(() => {
    if (!open) return;
    const editingCustom = entry && !BUILT_IN_FLAVOURS.some((flavour) => flavour.name === entry.flavour);
    setSelectedFlavour(editingCustom ? entry.flavour : entry?.flavour ?? DEFAULT_FLAVOUR.name);
    setCustomFlavour(editingCustom ? entry.flavour : "");
    setCustomAccent(entry?.flavourAccent ?? MATERIAL_ACCENTS.custom);
    setCans(entry?.cans.toString() ?? "1");
    setSizePreset(sizeToPreset(entry?.sizeMl ?? 250));
    setCustomSize(entry?.sizeMl.toString() ?? "250");
    setPricePerCan(entry?.pricePerCan.toString() ?? defaultPriceForSize(250).toString());
    setDateTime(formatLocalInput(entry ? new Date(entry.dateTime) : new Date()));
    setStore(entry?.store ?? "");
    setNotes(entry?.notes ?? "");
    setSugarFree(entry?.sugarFree ?? false);
    setCaffeineOverride(entry?.caffeineMgPerCan?.toString() ?? "");
    window.setTimeout(() => firstFieldRef.current?.focus(), 80);
  }, [entry, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  const selectedMeta = flavourMeta(selectedFlavour);
  const isOther = selectedFlavour === "Other";
  const numericSize = Math.max(1, sizePreset === "custom" ? Number(customSize) || 250 : Number(sizePreset));
  const finalAccent = isOther ? customAccent : selectedMeta.accent;
  const caffeinePreview = caffeinePerCan(
    numericSize,
    sizePreset === "custom" && caffeineOverride.trim() ? Number(caffeineOverride) : undefined,
  );

  const draftPreview = useMemo((): EntryDraft | null => {
    if (!open) return null;
    const numericCans = Math.max(0.25, Number(cans) || 1);
    const numericPrice = Math.max(0, Number(pricePerCan) || 0);
    const finalFlavour = isOther ? customFlavour.trim() || "Other" : selectedFlavour;
    const meta = flavourMeta(finalFlavour);
    const override =
      sizePreset === "custom" && caffeineOverride.trim()
        ? Math.max(0, Number(caffeineOverride) || 0)
        : undefined;
    return {
      cans: numericCans,
      flavour: finalFlavour,
      flavourAccent: isOther ? customAccent || accentForCustomFlavour(finalFlavour) : meta.accent,
      sizeMl: numericSize,
      pricePerCan: numericPrice,
      dateTime: new Date(dateTime).toISOString(),
      notes: notes.trim(),
      store: store.trim(),
      sugarFree: sugarFree || Boolean(meta.sugarFree),
      caffeineMgPerCan: override,
      source: entry?.source ?? "manual",
    };
  }, [
    open,
    cans,
    pricePerCan,
    isOther,
    customFlavour,
    selectedFlavour,
    customAccent,
    numericSize,
    dateTime,
    notes,
    store,
    sugarFree,
    sizePreset,
    caffeineOverride,
    entry?.source,
  ]);

  const draftLimitCheck = useMemo(() => {
    if (!draftPreview) return null;
    return evaluateLimits(userLimits, entries, { draft: draftPreview, excludeEntryId: entry?.id });
  }, [draftPreview, entries, entry?.id, userLimits]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draftPreview) return;
    onSave(draftPreview);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="entry-modal-title"
        >
          <motion.form
            className="modal-panel"
            onSubmit={submit}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ duration: 0.22 }}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-cyan-100">Intake details</p>
                <h2 id="entry-modal-title" className="mt-1 text-3xl font-semibold tracking-tight text-white">
                  {entry ? "Edit entry" : "Add intake"}
                </h2>
              </div>
              <button className="icon-button" type="button" onClick={onClose} aria-label="Close entry modal">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {draftLimitCheck?.violations.length ? (
              <p className="limit-banner mb-4" role="status">
                {limitStatusMessage(draftLimitCheck.violations, draftLimitCheck, userLimits)} You can still save with
                confirmation.
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="field-label">
                Number of cans
                <input ref={firstFieldRef} className="field-control" min="0.25" step="0.25" type="number" value={cans} onChange={(event) => setCans(event.target.value)} required />
              </label>

              <label className="field-label">
                Price per can
                <input className="field-control" min="0" step="0.01" type="number" value={pricePerCan} onChange={(event) => setPricePerCan(event.target.value)} required />
              </label>

              <label className="field-label">
                Flavour
                <select
                  className="field-control"
                  value={selectedFlavour}
                  onChange={(event) => {
                    const flavour = event.target.value;
                    setSelectedFlavour(flavour);
                    const meta = flavourMeta(flavour);
                    setSugarFree(Boolean(meta.sugarFree));
                    if (flavour !== "Other") setCustomAccent(meta.accent);
                  }}
                >
                  {flavours.map((flavour) => (
                    <option key={flavour.name} value={flavour.name}>
                      {flavour.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-label">
                Can size
                <select
                  className="field-control"
                  value={sizePreset}
                  onChange={(event) => {
                    const next = event.target.value;
                    setSizePreset(next);
                    if (next !== "custom") {
                      const size = Number(next);
                      setCustomSize(next);
                      setPricePerCan(defaultPriceForSize(size).toFixed(2));
                      setCaffeineOverride("");
                    }
                  }}
                >
                  <option value="250">250ml</option>
                  <option value="355">355ml</option>
                  <option value="473">473ml</option>
                  <option value="custom">Custom</option>
                </select>
              </label>

              {isOther && (
                <>
                  <label className="field-label">
                    Custom flavour
                    <input className="field-control" type="text" value={customFlavour} onChange={(event) => setCustomFlavour(event.target.value)} placeholder="Fig Apple, Sea Blue..." />
                  </label>
                  <label className="field-label">
                    Accent colour
                    <input className="field-control h-12 p-1" type="color" value={customAccent} onChange={(event) => setCustomAccent(event.target.value)} aria-label="Custom flavour accent colour" />
                  </label>
                </>
              )}

              {sizePreset === "custom" && (
                <>
                  <label className="field-label">
                    Custom size in ml
                    <input className="field-control" min="1" step="1" type="number" value={customSize} onChange={(event) => setCustomSize(event.target.value)} />
                  </label>
                  <label className="field-label">
                    Caffeine override mg/can
                    <input className="field-control" min="0" step="1" type="number" value={caffeineOverride} onChange={(event) => setCaffeineOverride(event.target.value)} placeholder={wholeNumber.format(caffeinePerCan(numericSize))} />
                  </label>
                </>
              )}

              <label className="field-label">
                Date and time
                <input className="field-control" type="datetime-local" value={dateTime} onChange={(event) => setDateTime(event.target.value)} required />
              </label>

              <label className="field-label">
                Location or store
                <input className="field-control" type="text" value={store} onChange={(event) => setStore(event.target.value)} placeholder="BP, Tesco, airport..." />
              </label>

              <label className="field-label sm:col-span-2">
                Notes
                <textarea className="field-control min-h-24 resize-y" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Late drive, gym stop, exam fuel..." />
              </label>

              <div className="rounded-lg border border-cyan-200/20 bg-cyan-200/10 px-3 py-3 text-sm text-cyan-50 sm:col-span-2">
                Estimated caffeine per can: {wholeNumber.format(caffeinePreview)}mg
              </div>

              <label className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-3 text-sm text-slate-200 sm:col-span-2">
                <input className="h-4 w-4 accent-cyan-300" type="checkbox" checked={sugarFree} onChange={(event) => setSugarFree(event.target.checked)} />
                Count this entry as sugar-free / zero sugar
              </label>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button className="secondary-button justify-center" type="button" onClick={onClose}>
                Cancel
              </button>
              <button className="primary-button justify-center" type="submit" disabled={saving} style={{ "--accent": finalAccent } as CSSProperties}>
                {saving ? <Loader2 className="animate-spin" size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}
                {entry ? "Save changes" : "Log intake"}
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ImportPreviewModal({
  busy,
  preview,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  preview: ImportPreview | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const validRows = preview?.rows.filter((row) => row.entry && !row.errors.length && !row.duplicate) ?? [];
  const invalidRows = preview?.rows.filter((row) => row.errors.length) ?? [];
  const duplicateRows = preview?.rows.filter((row) => row.duplicate) ?? [];

  return (
    <AnimatePresence>
      {preview && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-preview-title"
        >
          <motion.div
            className="modal-panel max-w-5xl"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-pink-100">Excel import</p>
                <h2 id="import-preview-title" className="mt-1 text-3xl font-semibold tracking-tight text-white">
                  Preview rows
                </h2>
                <p className="mt-2 text-sm text-slate-400">{preview.fileName}</p>
              </div>
              <button className="icon-button" type="button" onClick={onClose} aria-label="Close import preview">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <MiniMetric label="Ready" value={`${validRows.length}`} accent={MATERIAL_ACCENTS.primary} />
              <MiniMetric label="Duplicates" value={`${duplicateRows.length}`} accent={MATERIAL_ACCENTS.tertiary} />
              <MiniMetric label="Invalid" value={`${invalidRows.length}`} accent={MATERIAL_ACCENTS.error} />
            </div>

            <div className="max-h-[48vh] overflow-auto rounded-lg border border-white/10">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="sticky top-0 bg-[#0d142c] text-xs uppercase tracking-[0.14em] text-slate-400">
                  <tr>
                    <th className="px-3 py-3">Row</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3">Flavour</th>
                    <th className="px-3 py-3">Size</th>
                    <th className="px-3 py-3">Cans</th>
                    <th className="px-3 py-3">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.rowNumber} className="border-t border-white/10">
                      <td className="px-3 py-3 text-slate-400">{row.rowNumber}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded px-2 py-1 text-xs font-semibold ${row.errors.length ? "bg-red-500/15 text-red-100" : row.duplicate ? "bg-amber-300/15 text-amber-100" : "bg-cyan-300/15 text-cyan-100"}`}>
                          {row.errors.length ? "Invalid" : row.duplicate ? "Duplicate" : "Ready"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-300">{row.entry ? humanDateTime(row.entry.dateTime) : "-"}</td>
                      <td className="px-3 py-3 text-white">{row.entry?.flavour ?? "-"}</td>
                      <td className="px-3 py-3 text-slate-300">{row.entry ? `${row.entry.sizeMl}ml` : "-"}</td>
                      <td className="px-3 py-3 text-slate-300">{row.entry?.cans ?? "-"}</td>
                      <td className="px-3 py-3 text-slate-400">{row.errors.join(" ") || row.duplicateReason || "Looks good."}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button className="secondary-button justify-center" type="button" onClick={onClose}>
                Cancel
              </button>
              <button className="excel-button justify-center" type="button" disabled={!validRows.length || busy} onClick={onConfirm}>
                {busy ? <Loader2 className="animate-spin" size={17} aria-hidden="true" /> : <FileSpreadsheet size={17} aria-hidden="true" />}
                Import {validRows.length} row{validRows.length === 1 ? "" : "s"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ConfirmDialog({
  busy,
  open,
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
        >
          <motion.div
            className="glass-panel w-full max-w-md p-5"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
          >
            <h2 id="confirm-title" className="text-2xl font-semibold tracking-tight text-white">
              {title}
            </h2>
            <p className="mt-3 text-slate-400">{body}</p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button className="secondary-button justify-center" type="button" onClick={onCancel}>
                Cancel
              </button>
              <button className="danger-button justify-center" type="button" onClick={onConfirm} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" size={17} aria-hidden="true" /> : <Trash2 size={17} aria-hidden="true" />}
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type Dashboard = ReturnType<typeof buildDashboard>;
type Insight = ReturnType<typeof buildInsights>[number];

function buildDashboard(entries: RedBullEntry[]) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrow = new Date(todayStart.getTime() + 86_400_000 - 1);
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);
  const todayEntries = entriesInRange(entries, todayStart, tomorrow);
  const weekEntries = entriesInRange(entries, weekStart, now);
  const monthEntries = entriesInRange(entries, monthStart, now);
  const totalSpend = sum(entries, spendFor);
  const priceyFlavour = highestAveragePrice(entries, "flavour");
  const priceyStore = highestAveragePrice(entries, "store");

  return {
    todayCans: oneDecimal.format(sum(todayEntries, (entry) => entry.cans)),
    weekCans: `${oneDecimal.format(sum(weekEntries, (entry) => entry.cans))} cans`,
    monthCans: oneDecimal.format(sum(monthEntries, (entry) => entry.cans)),
    allTimeCans: oneDecimal.format(sum(entries, (entry) => entry.cans)),
    totalSpend: currency.format(totalSpend),
    monthSpend: currency.format(sum(monthEntries, spendFor)),
    avgWeeklySpend: `${currency.format(totalSpend / trackedWeeks(entries))}`,
    todayCaffeine: `${wholeNumber.format(sum(todayEntries, caffeineFor))}mg`,
    monthCaffeine: `${wholeNumber.format(sum(monthEntries, caffeineFor))}mg`,
    todaySugar: `${oneDecimal.format(sum(todayEntries, sugarFor))}g`,
    monthSugar: `${oneDecimal.format(sum(monthEntries, sugarFor))}g`,
    favouriteFlavour: topByCans(entries),
    priciestFlavour: priceyFlavour ? `${priceyFlavour.label} ${currency.format(priceyFlavour.average)}` : "None yet",
    priciestStore: priceyStore ? `${priceyStore.label} ${currency.format(priceyStore.average)}` : "No store yet",
    currentStreak: `${currentStreak(entries)}`,
    daysWithoutRedBull: `${daysSinceLast(entries)}`,
  };
}

function buildInsights(entries: RedBullEntry[]) {
  const now = new Date();
  const weekStart = startOfWeek(now);
  const previousWeekStart = new Date(weekStart.getTime() - 7 * 86_400_000);
  const previousWeekEnd = new Date(weekStart.getTime() - 1);
  const monthStart = startOfMonth(now);
  const previousMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1);
  const previousMonthEnd = new Date(monthStart.getTime() - 1);

  const thisMonthSpend = sum(entriesInRange(entries, monthStart, now), spendFor);
  const lastMonthSpend = sum(entriesInRange(entries, previousMonthStart, previousMonthEnd), spendFor);
  const thisWeekCans = sum(entriesInRange(entries, weekStart, now), (entry) => entry.cans);
  const lastWeekCans = sum(entriesInRange(entries, previousWeekStart, previousWeekEnd), (entry) => entry.cans);
  const sugarFreeCans = sum(entries.filter((entry) => entry.sugarFree), (entry) => entry.cans);
  const allCans = sum(entries, (entry) => entry.cans);

  return [
    {
      label: "Month spend",
      value: `You spent ${currency.format(thisMonthSpend)} this month`,
      detail:
        lastMonthSpend > 0
          ? `${comparisonCopy(thisMonthSpend, lastMonthSpend, "vs last month")}`
          : "No previous-month baseline yet.",
    },
    {
      label: "Weekly pace",
      value: `${oneDecimal.format(thisWeekCans)} cans this week`,
      detail:
        lastWeekCans > 0
          ? `${comparisonCopy(thisWeekCans, lastWeekCans, "vs last week")}`
          : "The weekly comparator wakes up after another week of data.",
    },
    {
      label: "Zero sugar mix",
      value: allCans ? `${oneDecimal.format((sugarFreeCans / allCans) * 100)}% sugar-free` : "No mix yet",
      detail: allCans ? `${oneDecimal.format(sugarFreeCans)} of ${oneDecimal.format(allCans)} cans flagged sugar-free.` : "Log a sugar-free entry to track the split.",
    },
  ];
}

function applyFilters(entries: RedBullEntry[], filters: Filters) {
  const now = new Date();
  let start: Date | null = null;
  let end: Date | null = null;

  if (filters.dateRange === "today") {
    start = startOfDay(now);
    end = new Date(start.getTime() + 86_400_000 - 1);
  }
  if (filters.dateRange === "week") {
    start = startOfWeek(now);
    end = now;
  }
  if (filters.dateRange === "month") {
    start = startOfMonth(now);
    end = now;
  }
  if (filters.dateRange === "custom") {
    start = filters.from ? new Date(`${filters.from}T00:00:00`) : null;
    end = filters.to ? new Date(`${filters.to}T23:59:59`) : null;
  }

  return entries.filter((entry) => {
    const date = new Date(entry.dateTime);
    const flavourMatch = filters.flavour === "all" || entry.flavour === filters.flavour;
    const storeMatch = !filters.store || entry.store?.toLowerCase().includes(filters.store.toLowerCase());
    const startMatch = !start || date >= start;
    const endMatch = !end || date <= end;
    return flavourMatch && storeMatch && startMatch && endMatch;
  });
}

function sortEntries(entries: RedBullEntry[]) {
  return [...entries].sort((left, right) => new Date(right.dateTime).getTime() - new Date(left.dateTime).getTime());
}

function comparisonCopy(current: number, previous: number, suffix: string) {
  const difference = current - previous;
  const percent = previous === 0 ? 0 : (difference / previous) * 100;
  const direction = difference >= 0 ? "up" : "down";
  return `${direction} ${oneDecimal.format(Math.abs(percent))}% ${suffix}`;
}

function formatMetricValue(name: string, value: number) {
  if (/spend/i.test(name)) return currency.format(value);
  if (/caffeine/i.test(name)) return `${wholeNumber.format(value)}mg`;
  if (/sugar/i.test(name)) return `${oneDecimal.format(value)}g`;
  return oneDecimal.format(value);
}

function firstName(user: AuthUser) {
  const fallback = user.email?.split("@")[0] ?? "there";
  const value = (user.name || fallback).trim();
  return value.split(/\s+/)[0] || "there";
}

function userInitials(user: AuthUser) {
  if (user.name) {
    return user.name.split(" ").map((part) => part[0]).join("").toUpperCase().slice(0, 2);
  }
  return (user.email?.[0] ?? "U").toUpperCase();
}

function sizeToPreset(size: number) {
  if (size === 250 || size === 355 || size === 473) return size.toString();
  return "custom";
}

function actionLabel(value: string) {
  return value
    .replace(/^quick-/, "quick add ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default App;
