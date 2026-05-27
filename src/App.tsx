import type { Models } from "appwrite";
import {
  Activity,
  AlertTriangle,
  Brain,
  CalendarDays,
  Camera,
  ChevronRight,
  Cloud,
  Command,
  Database,
  Edit3,
  FileJson,
  FileSpreadsheet,
  Gauge,
  Home,
  LineChart,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  Plus,
  PoundSterling,
  RefreshCcw,
  RotateCcw,
  Send,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
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
  THEME_STORAGE_KEY,
  getThemeById,
  normaliseThemeId,
  readStoredThemeId,
  type AppTheme,
} from "./data/themes";
import { themeTokensToStyle } from "./lib/themeTokens";
import { account, appwriteConfig, Channel, client, pingAppwrite } from "./lib/appwrite";
import {
  appwriteErrorMessage,
  createEntries,
  createEntry,
  deleteEntry as deleteEntryDocument,
  isDuplicateDraft,
  listEntries,
  updateEntry,
} from "./lib/appwriteEntries";
import { BarcodeScannerModal } from "./components/BarcodeScannerModal";
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
import type { DateFilter, EntryDraft, Filters, Flavour, ImportPreview, RedBullEntry } from "./types";

type CoachMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  thinking?: string;
};

type CoachChat = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: CoachMessage[];
};

type AppView = "overview" | "logbook" | "trends" | "settings";
type AuthMode = "login" | "signup";
type AuthUser = Models.User<Models.Preferences>;
type SetupStatus = { state: "checking" | "ok" | "error"; message: string };
type OllamaStreamChunk = { error?: string; message?: { content?: string; thinking?: string } };
const OLLAMA_MODEL = "deepseek-v4-pro:cloud";
const OLLAMA_PROXY_URL = import.meta.env.VITE_OLLAMA_PROXY_URL?.trim() || "/api/ollama-chat";

type ForecastPoint = {
  label: string;
  current: number;
  lower: number;
  limit?: number;
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
  { id: "settings", label: "Settings", icon: Settings2 },
];

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
  const [entryInitialDraft, setEntryInitialDraft] = useState<EntryDraft | null>(null);
  const [editingEntry, setEditingEntry] = useState<RedBullEntry | null>(null);
  const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [notice, setNotice] = useState("Appwrite session pending.");
  const [dataLoading, setDataLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [syncError, setSyncError] = useState("");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [userLimits, setUserLimits] = useState<UserLimits>({});
  const [limitConfirmOpen, setLimitConfirmOpen] = useState(false);
  const [limitConfirmMessage, setLimitConfirmMessage] = useState("");
  const [pendingLimitAction, setPendingLimitAction] = useState<PendingLimitAction | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const excelFileInputRef = useRef<HTMLInputElement>(null);
  const jsonFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, normaliseThemeId(themeId));
  }, [themeId]);

  const refreshEntries = useCallback(async (userId: string, showLoader = true) => {
    if (showLoader) setDataLoading(true);
    setSyncError("");
    try {
      const remoteEntries = await listEntries(userId);
      setEntries(sortEntries(remoteEntries));
      setNotice(`Synced ${remoteEntries.length} Appwrite entr${remoteEntries.length === 1 ? "y" : "ies"}.`);
    } catch (error) {
      const message = appwriteErrorMessage(error);
      setSyncError(message);
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
          setThemeId(normaliseThemeId(currentUser.prefs.themeId));
        }
        setNotice(`Signed in as ${currentUser.email || currentUser.name || "Appwrite user"}.`);
        if (!currentUser.prefs.onboarded) {
          setSetupOpen(true);
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
  const entriesInView = useMemo(
    () => sortEntries(applyFilters(entries, filters)),
    [entries, filters],
  );
  const summary = useMemo(() => buildDashboard(entries), [entries]);
  const limitCheck = useMemo(() => evaluateLimits(userLimits, entries), [userLimits, entries]);
  const chartData = useMemo(() => groupByDay(entriesInView), [entriesInView]);
  const weekData = useMemo(() => groupByWeek(entriesInView), [entriesInView]);
  const flavourData = useMemo(() => groupByFlavour(entriesInView), [entriesInView]);
  const insights = useMemo(() => buildInsights(entries), [entries]);
  const recentEntries = useMemo(() => entries.slice(0, 5), [entries]);

  async function login(email: string, password: string) {
    setBusyAction("auth");
    setAuthError("");
    try {
      await account.createEmailPasswordSession({ email, password });
      const currentUser = await account.get();
      setUser(currentUser);
      setUserLimits(parseUserLimits(currentUser.prefs));
      if (typeof currentUser.prefs.themeId === "string" && currentUser.prefs.themeId) {
        setThemeId(normaliseThemeId(currentUser.prefs.themeId));
      }
      setNotice(`Signed in as ${currentUser.email}.`);
      if (!currentUser.prefs.onboarded) {
        setSetupOpen(true);
      }
    } catch (error) {
      setAuthError(appwriteErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function signup(name: string, email: string, password: string) {
    setBusyAction("auth");
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
      setNotice(`Welcome, ${currentUser.name || currentUser.email}.`);
      setSetupOpen(true);
    } catch (error) {
      setAuthError(appwriteErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function logout() {
    setBusyAction("logout");
    setSyncError("");
    try {
      await account.deleteSession({ sessionId: "current" });
      setUser(null);
      setEntries([]);
      setNotice("Logged out.");
    } catch (error) {
      setSyncError(appwriteErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  function openNewEntry() {
    setEditingEntry(null);
    setEntryInitialDraft(null);
    setIsEntryModalOpen(true);
  }

  function openBarcodeScanner() {
    setIsBarcodeScannerOpen(true);
  }

  function addBarcodeDraft(draft: EntryDraft) {
    setIsBarcodeScannerOpen(false);
    saveDraftWithLimitCheck(draft);
  }

  function editBarcodeDraft(draft: EntryDraft) {
    setIsBarcodeScannerOpen(false);
    setEditingEntry(null);
    setEntryInitialDraft(draft);
    setIsEntryModalOpen(true);
  }

  async function saveEntry(draft: EntryDraft) {
    if (!user) return;
    setBusyAction("save-limits");
    setSyncError("");
    try {
      const prefs = mergePrefsWithLimits(user.prefs, next);
      await account.updatePrefs(prefs);
      const currentUser = await account.get();
      setUser(currentUser);
      setUserLimits(parseUserLimits(currentUser.prefs));
      setNotice("Daily limits saved to your account.");
    } catch (error) {
      setSyncError(appwriteErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function saveOnboarding(limits: UserLimits, onboardingThemeId: string) {
    if (!user) return;
    setBusyAction("save-onboarding");
    setSyncError("");
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
      setSetupOpen(false);
      setNotice("Setup saved.");
    } catch (error) {
      setSyncError(appwriteErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function saveDraft(action: PendingLimitAction) {
    if (!user) return;
    const loadingKey = action.kind === "quick" ? `quick-${action.quickLabel ?? "add"}` : "save-entry";
    setBusyAction(loadingKey);
    setSyncError("");
    try {
      const editing = action.editingId ? entries.find((entry) => entry.id === action.editingId) : null;
      const saved = editing
        ? await updateEntry(user.$id, editing.id, { ...action.draft, source: editing.source })
        : await createEntry(user.$id, { ...action.draft, source: action.draft.source ?? "manual" });
      setEntries((current) =>
        sortEntries(editingEntry ? current.map((entry) => (entry.id === saved.id ? saved : entry)) : [saved, ...current]),
      );
      setNotice(editingEntry ? "Entry updated in Appwrite." : "Entry saved to Appwrite.");
      setEditingEntry(null);
      setEntryInitialDraft(null);
      setIsEntryModalOpen(false);
    } catch (error) {
      setSyncError(appwriteErrorMessage(error));
    } finally {
      setBusyAction(null);
      setLimitConfirmOpen(false);
      setPendingLimitAction(null);
      setLimitConfirmMessage("");
    }
  }

  function saveDraftWithLimitCheck(draft: EntryDraft, editingId?: string) {
    const check = evaluateLimits(userLimits, entries, { draft, excludeEntryId: editingId });
    if (check.violations.length) {
      setPendingLimitAction({ kind: "save", draft, editingId });
      setLimitConfirmMessage(limitStatusMessage(check.violations, check, userLimits));
      setLimitConfirmOpen(true);
      return;
    }
    void saveDraft({ kind: "save", draft, editingId });
  }

  async function saveEntryDraft(draft: EntryDraft) {
    if (!user) return;
    saveDraftWithLimitCheck(draft, editingEntry?.id);
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

    setActionLoading(`quick-${item.label}`);
    setDataError("");
    try {
      const saved = await createEntry(user.$id, draft);
      setEntries((current) => sortEntries([saved, ...current]));
      setNotice(`${item.label} saved to Appwrite.`);
    } catch (error) {
      setDataError(appwriteErrorMessage(error));
    } finally {
      setActionLoading(null);
    }

    void saveDraft({ kind: "quick", draft, quickLabel: item.label });
  }

  function confirmLimitOverride() {
    if (!pendingLimitAction) return;
    void saveDraft(pendingLimitAction);
  }

  async function deleteEntry(id: string) {
    setBusyAction(`delete-${id}`);
    setSyncError("");
    try {
      await deleteEntryDocument(id);
      setEntries((current) => current.filter((entry) => entry.id !== id));
      setNotice("Entry deleted from Appwrite.");
    } catch (error) {
      setSyncError(appwriteErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function resetAll() {
    setBusyAction("reset");
    setSyncError("");
    try {
      await Promise.all(entries.map((entry) => deleteEntryDocument(entry.id)));
      setEntries([]);
      setFilters(DEFAULT_FILTERS);
      setIsResetOpen(false);
      setNotice("All Appwrite entries deleted.");
    } catch (error) {
      setSyncError(appwriteErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function exportExcel() {
    setBusyAction("excel-export");
    setSyncError("");
    try {
      const blob = await createExcelExport(entries);
      downloadBlob(blob, `red-bull-intake-${new Date().toISOString().slice(0, 10)}.xlsx`);
      setNotice("Excel workbook exported.");
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Excel export failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function importExcel(file: File | undefined) {
    if (!file) return;
    setBusyAction("excel-import");
    setSyncError("");
    try {
      const preview = await parseExcelImport(file, entries);
      setImportPreview(preview);
      setNotice(`${preview.rows.length} Excel row${preview.rows.length === 1 ? "" : "s"} parsed for review.`);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Excel import failed.");
    } finally {
      if (excelFileInputRef.current) excelFileInputRef.current.value = "";
      setBusyAction(null);
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

    setBusyAction("confirm-excel-import");
    setSyncError("");
    try {
      const saved = await createEntries(user.$id, drafts);
      setEntries((current) => sortEntries([...saved, ...current]));
      setImportPreview(null);
      setNotice(`${saved.length} Excel row${saved.length === 1 ? "" : "s"} saved to Appwrite.`);
    } catch (error) {
      setSyncError(appwriteErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  function exportJson() {
    const blob = new Blob([exportPayload(entries)], { type: "application/json" });
    downloadBlob(blob, `red-bull-intake-${new Date().toISOString().slice(0, 10)}.json`);
    setNotice("JSON backup exported.");
  }

  async function importJson(file: File | undefined) {
    if (!file || !user) return;
    setBusyAction("json-import");
    setSyncError("");
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
      setSyncError(error instanceof Error ? error.message : "JSON import failed.");
    } finally {
      if (jsonFileInputRef.current) jsonFileInputRef.current.value = "";
      setBusyAction(null);
    }
  }

  if (authLoading) {
    return <LoadingScreen setupStatus={setupStatus} shellStyle={shellStyle} themeId={themeId} />;
  }

  if (!user) {
    return (
      <AuthView
        authError={authError}
        busy={busyAction === "auth"}
        setupStatus={setupStatus}
        shellStyle={shellStyle}
        themeId={themeId}
        onLogin={login}
        onSignup={signup}
      />
    );
  }

  return (
    <div
      className="app-shell min-h-screen overflow-x-hidden"
      data-theme={themeId}
      style={shellStyle}
    >
      {setupOpen && user && (
        <OnboardingScreen
          userName={user.name || undefined}
          activeThemeId={themeId}
          onThemeChange={setThemeId}
          onSave={saveOnboarding}
          onClose={() => setSetupOpen(false)}
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

      <div className="mx-auto grid w-full max-w-[1680px] gap-4 px-3 py-3 lg:grid-cols-[280px_1fr] lg:px-5 lg:py-5">
        <Sidebar
          activeView={activeView}
          dataLoading={dataLoading}
          notice={notice}
          setupStatus={setupStatus}
          user={user}
          onAdd={openNewEntry}
          onScan={openBarcodeScanner}
          onChange={setActiveView}
          onOpenSettings={() => setActiveView("settings")}
        />

        <div className="min-w-0">
          <MobileNav activeView={activeView} onChange={setActiveView} />

          <TopBar
            activeTheme={activeTheme}
            activeView={activeView}
            busyAction={busyAction}
            onAdd={openNewEntry}
            onScan={openBarcodeScanner}
            className={activeView === "overview" ? "top-app-bar--overview" : ""}
          />

          <StatusRail busyAction={busyAction} syncError={syncError} setupStatus={setupStatus} />

          <AnimatePresence mode="wait">
            <motion.main
              key={activeView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="mt-4"
            >
              {activeView === "overview" && (
                <OverviewView
                  summary={summary}
                  entries={entries}
                  insights={insights}
                  quickAdds={QUICK_ADDS}
                  recentEntries={recentEntries}
                  chartData={chartData}
                  flavourData={flavourData}
                  user={user}
                  userLimits={userLimits}
                  limitCheck={limitCheck}
                  onQuickAdd={(item) => void quickAdd(item)}
                  onAdd={openNewEntry}
                  onScan={openBarcodeScanner}
                  onOpenLogbook={() => setActiveView("logbook")}
                />
              )}

              {activeView === "logbook" && (
                <LogbookView
                  entries={entriesInView}
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
                  entries={entriesInView}
                  filters={filters}
                  flavours={allFlavours}
                  onFilterChange={setFilters}
                />
              )}

              {activeView === "settings" && (
                <SettingsView
                  activeTheme={activeTheme}
                  summary={summary}
                  dataLoading={dataLoading}
                  entries={entries}
                  notice={notice}
                  setupStatus={setupStatus}
                  themeId={themeId}
                  user={user}
                  userLimits={userLimits}
                  limitCheck={limitCheck}
                  busyAction={busyAction}
                  onExportExcel={() => void exportExcel()}
                  onImportExcel={() => excelFileInputRef.current?.click()}
                  onExportJson={exportJson}
                  onImportJson={() => jsonFileInputRef.current?.click()}
                  onLogout={() => void logout()}
                  onReset={() => setIsResetOpen(true)}
                  onThemeChange={setThemeId}
                  onSaveLimits={(next) => void saveUserLimits(next)}
                  onRerunOnboarding={() => setSetupOpen(true)}
                />
              )}
            </motion.main>
          </AnimatePresence>
        </div>
      </div>

      <EntryModal
        entry={editingEntry}
        initialDraft={entryInitialDraft}
        flavours={allFlavours}
        open={isEntryModalOpen}
        saving={busyAction === "save-entry"}
        userLimits={userLimits}
        entries={entries}
        onClose={() => {
          setIsEntryModalOpen(false);
          setEditingEntry(null);
          setEntryInitialDraft(null);
        }}
        onSave={(draft) => void saveEntryDraft(draft)}
      />

      <BarcodeScannerModal
        busy={busyAction === "save-entry"}
        flavours={allFlavours}
        open={isBarcodeScannerOpen}
        userId={user.$id}
        onAddNow={addBarcodeDraft}
        onClose={() => setIsBarcodeScannerOpen(false)}
        onEditBeforeAdding={editBarcodeDraft}
      />

      <ImportPreviewModal
        busy={busyAction === "confirm-excel-import"}
        preview={importPreview}
        onClose={() => setImportPreview(null)}
        onConfirm={() => void confirmExcelImport()}
      />

      <ConfirmDialog
        busy={busyAction === "reset"}
        open={isResetOpen}
        title="Delete all Appwrite entries?"
        body="This removes every intake entry owned by your current Appwrite user. Export first if you want a backup."
        confirmLabel="Delete all"
        onCancel={() => setIsResetOpen(false)}
        onConfirm={() => void resetAll()}
      />

      <ConfirmDialog
        busy={Boolean(busyAction && pendingLimitAction)}
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
    <div className="app-shell min-h-screen" data-theme={themeId} style={shellStyle}>
      <ShellBackdrop />
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="glass-panel w-full max-w-md p-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg metric-tile-icon">
            <Loader2 className="animate-spin" size={24} aria-hidden="true" />
          </div>
          <h1 className="app-card-title mt-5 text-2xl">Red Bull tracker</h1>
          <p className="app-card-subtitle mt-3 leading-6">{setupStatus.message}</p>
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
  onSignup,
}: {
  authError: string;
  busy: boolean;
  setupStatus: SetupStatus;
  shellStyle: CSSProperties;
  themeId: string;
  onLogin: (email: string, password: string) => Promise<void>;
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
    <div className="app-shell min-h-screen" data-theme={themeId} style={shellStyle}>
      <ShellBackdrop />
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="auth-panel-shell">
          <div className="mb-8 text-center">
            <h1 className="hero-name text-3xl">Red Bull tracker</h1>
            <p className="hero-copy mt-2 text-sm">Track intake, sync across devices.</p>
          </div>

          <div className="auth-panel-card">
            {setupStatus.state !== "ok" && (
              <div className="limit-alert mb-4 px-3 py-2 text-xs">
                {setupStatus.message}
              </div>
            )}

            <div className="auth-mode-toggle mb-5">
              <button className={mode === "login" ? "auth-mode-active" : ""} type="button" onClick={() => setMode("login")}>
                Log in
              </button>
              <button className={mode === "signup" ? "auth-mode-active" : ""} type="button" onClick={() => setMode("signup")}>
                Sign up
              </button>
            </div>

            <form className="grid gap-3" onSubmit={submit}>
              {mode === "signup" && (
                <label className="field-label">
                  Name
                  <input className="field-control" type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ned" />
                </label>
              )}
              <label className="field-label">
                Email
                <input className="field-control" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
              </label>
              <label className="field-label">
                Password
                <input className="field-control" minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="8+ characters" required />
              </label>

              {authError && (
                <div className="rounded-md px-3 py-2 text-sm" style={{ border: "1px solid #ffc9c2", background: "#fff3f1", color: "#9f1c16" }}>
                  {authError}
                </div>
              )}

              <button className="primary-button w-full mt-1" type="submit" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" size={17} aria-hidden="true" /> : <LogIn size={17} aria-hidden="true" />}
                {mode === "signup" ? "Create account" : "Log in"}
              </button>
            </form>

          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button className="secondary-button justify-center" type="button" disabled={busy} onClick={() => onOAuth("github")}>
              <Github size={17} aria-hidden="true" />
              GitHub
            </button>
            <button className="secondary-button justify-center" type="button" disabled={busy} onClick={() => onOAuth("google")}>
              <User size={17} aria-hidden="true" />
              Google
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

function ThemePicker({
  themeId,
  onChange,
}: {
  themeId: string;
  onChange: (id: string) => void;
}) {
  const activeTheme = getThemeById(themeId);

  return (
    <div className="settings-section">
      <div className="theme-preview-strip">
        <div className="theme-preview-chip primary-button px-4 py-2 text-sm">Button</div>
        <div className="theme-preview-chip glass-panel px-4 py-2 text-sm">Panel</div>
        <div className="theme-preview-chip rounded-lg px-4 py-2 text-sm" style={{ background: "var(--chart-secondary)", color: "#fff" }}>
          Chart
        </div>
      </div>

      <div className="theme-picker-grid" role="listbox" aria-label="App themes">
        {APP_THEMES.map((theme) => (
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

      <p className="mt-3 text-sm text-slate-500">
        Current theme: <span className="font-semibold text-slate-900">{activeTheme.label}</span>
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
  onScan,
  onChange,
  onOpenSettings,
}: {
  activeView: AppView;
  dataLoading: boolean;
  notice: string;
  setupStatus: SetupStatus;
  user: AuthUser;
  onAdd: () => void;
  onScan: () => void;
  onChange: (view: AppView) => void;
  onOpenSettings: () => void;
}) {
  return (
    <aside className="glass-panel sticky top-5 hidden h-[calc(100vh-2.5rem)] p-3 lg:flex lg:flex-col">
      <div className="mb-7 flex items-center gap-3 px-2 pt-1">
        <div className="can-emblem">
          <Command size={22} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-medium text-slate-950">Red Bull</p>
          <p className="truncate text-sm text-slate-600">Intake tracker</p>
        </div>
      </div>

      <button className="drawer-primary-action" type="button" onClick={onAdd}>
        <Plus size={19} aria-hidden="true" />
        Add intake
      </button>

      <button className="secondary-button w-full justify-center" type="button" onClick={onScan}>
        <Camera size={18} aria-hidden="true" />
        Scan barcode
      </button>

      <nav className="drawer-nav" aria-label="Main navigation">
        {NAV_ITEMS.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item ${activeView === item.id ? "nav-item-active" : ""}`}
            onClick={() => onChange(item.id)}
          >
            <span className={`nav-icon-dot nav-icon-dot-${index}`} aria-hidden="true">
              <item.icon size={21} />
            </span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="drawer-footer">
        <div className="drawer-info-card">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            {dataLoading ? <Loader2 className="animate-spin" size={15} aria-hidden="true" /> : <Cloud size={15} aria-hidden="true" />}
            Sync
          </div>
          <p className="text-sm leading-5 text-slate-700">{notice}</p>
          <p className={`mt-2 text-xs ${setupStatus.state === "ok" ? "text-emerald-700" : "text-amber-700"}`}>{setupStatus.message}</p>
        </div>

        <button className="account-pill" type="button" onClick={onOpenSettings}>
          <User size={16} aria-hidden="true" />
          {user.name || user.email || "Account & settings"}
        </button>
      </div>
    </aside>
  );
}

function MobileNav({ activeView, onChange }: { activeView: AppView; onChange: (view: AppView) => void }) {
  return (
    <nav className="sticky top-3 z-30 mb-3 grid grid-cols-4 gap-1 rounded-lg border border-white/10 bg-[#090f22]/90 p-1 shadow-fridge backdrop-blur-xl lg:hidden" aria-label="Main navigation">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-md text-[11px] font-medium transition ${
            activeView === item.id ? "bg-cyan-300 text-[#07101f] shadow-cyan" : "text-slate-300 hover:bg-white/10"
          }`}
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
  activeTheme,
  activeView,
  busyAction,
  onAdd,
  onScan,
  className = "",
}: {
  activeTheme: AppTheme;
  activeView: AppView;
  busyAction: string | null;
  onAdd: () => void;
  onScan: () => void;
  className?: string;
}) {
  const title = NAV_ITEMS.find((item) => item.id === activeView)?.label ?? "Overview";
  const subtitle = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <header className={`top-app-bar ${className}`.trim()} data-view={activeView}>
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
        <button
          className="secondary-button top-action-button justify-center active:scale-95"
          type="button"
          onClick={onScan}
          disabled={Boolean(busyAction)}
          aria-label="Scan barcode"
        >
          <Camera size={18} aria-hidden="true" />
          <span className="top-action-label">Scan</span>
        </button>
        <button
          className="primary-button top-action-button justify-center active:scale-95"
          type="button"
          onClick={onAdd}
          disabled={Boolean(busyAction)}
          aria-label="Add intake"
        >
          <Plus size={18} aria-hidden="true" />
          <span className="top-action-label">Add intake</span>
        </button>
      </div>
    </header>
  );
}

function StatusRail({
  busyAction,
  syncError,
  setupStatus,
}: {
  busyAction: string | null;
  syncError: string;
  setupStatus: SetupStatus;
}) {
  if (!busyAction && !syncError && setupStatus.state === "ok") return null;
  return (
    <div className="mt-3 grid gap-2">
      {busyAction && (
        <div className="status-card">
          <Loader2 className="animate-spin" size={17} aria-hidden="true" />
          Working on {actionLabel(busyAction)}...
        </div>
      )}
      {syncError && (
        <div className="status-card" style={{ borderColor: "#ffc9c2", background: "#fff3f1", color: "#9f1c16" }}>
          <AlertTriangle size={17} aria-hidden="true" />
          {syncError}
        </div>
      )}
      {setupStatus.state === "error" && (
        <div className="status-card" style={{ borderColor: "#f9e3b0", background: "#fff8e8", color: "#7a4e00" }}>
          <AlertTriangle size={17} aria-hidden="true" />
          {setupStatus.message}
        </div>
      )}
    </div>
  );
}

function OverviewView({
  summary,
  entries,
  insights,
  quickAdds,
  recentEntries,
  chartData,
  flavourData,
  user,
  userLimits,
  limitCheck,
  onQuickAdd,
  onAdd,
  onScan,
  onOpenLogbook,
}: {
  summary: Dashboard;
  entries: RedBullEntry[];
  insights: Insight[];
  quickAdds: typeof QUICK_ADDS;
  recentEntries: RedBullEntry[];
  chartData: Array<{ label: string; spend: number; cans: number; caffeine: number; sugar: number }>;
  flavourData: Array<{ name: string; value: number; spend: number; accent: string }>;
  user: AuthUser;
  userLimits: UserLimits;
  limitCheck: LimitCheckResult;
  onQuickAdd: (item: (typeof QUICK_ADDS)[number]) => void;
  onAdd: () => void;
  onScan: () => void;
  onOpenLogbook: () => void;
}) {
  const todaySpendRaw = limitCheck.todaySpend;
  const spendLimitDetail =
    userLimits.dailySpendLimit != null
      ? `${currency.format(todaySpendRaw)} of ${currency.format(userLimits.dailySpendLimit)} today`
      : `${summary.monthSpend} this month`;

  return (
    <div className="grid gap-4">
      <GreetingPanel summary={summary} user={user} userLimits={userLimits} limitCheck={limitCheck} onAdd={onAdd} onScan={onScan} />

      <DailyLimitsCard limits={userLimits} check={limitCheck} onOpenSettings={onOpenSettings} />

      <QuickAddPanel items={quickAdds} onQuickAdd={onQuickAdd} />

      <TodayPanel summary={summary} entries={entries} userLimits={userLimits} limitCheck={limitCheck} onAdd={onAdd} onScan={onScan} />

      {limitCheck.violations.length ? (
        <section className="limit-alert">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0" size={20} aria-hidden="true" style={{ color: "#b06000" }} />
            <div>
              <p className="limit-alert-title">Limit alerts</p>
              <p className="limit-alert-copy mt-1">
                {limitStatusMessage(limitCheck.violations, limitCheck, userLimits)}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="overview-metrics-grid grid gap-3">
        <MetricTile icon={CalendarDays} label="This month" value={summary.monthCans} detail={`${summary.monthSpend} spent`} accent={MATERIAL_ACCENTS.primary} />
        <MetricTile
          icon={PoundSterling}
          label={userLimits.dailySpendLimit != null ? "Today's budget" : "Total spend"}
          value={userLimits.dailySpendLimit != null ? currency.format(todaySpendRaw) : summary.totalSpend}
          detail={spendLimitDetail}
          accent={MATERIAL_ACCENTS.secondary}
        />
        <MetricTile icon={Activity} label="Favourite" value={summary.favouriteFlavour} detail="by total cans" accent={MATERIAL_ACCENTS.tertiary} />
        <MetricTile icon={TimerReset} label="Days without" value={summary.daysWithoutRedBull} detail={`${summary.currentStreak} day streak`} accent={MATERIAL_ACCENTS.error} />
      </section>

      <section className="overview-charts-grid grid gap-4">
        <AppCard title="Spend overview" subtitle="Last 30 logged days">
          {chartData.length ? (
            <div className="chart-shell chart-shell--area">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 12, right: 12, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="mikuSpend" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#39d5ff" stopOpacity={0.36} />
                    <stop offset="100%" stopColor="#39d5ff" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(203,213,225,0.12)" vertical={false} />
                <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="spend" name="Spend" stroke="#39d5ff" fill="url(#mikuSpend)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
            </div>
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

      <section className="overview-insights-grid grid gap-3">
        {insights.map((insight) => (
          <InsightCard key={insight.label} insight={insight} />
        ))}
      </section>

      <section className="grid gap-4">
        <AppCard title="Flavour mix" subtitle="Cans by flavour">
          {flavourData.length ? (
            <div className="chart-shell chart-shell--pie">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={flavourData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={104} paddingAngle={4} stroke="#080d1f" strokeWidth={4}>
                  {flavourData.map((entry) => (
                    <Cell key={entry.name} fill={entry.accent} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No flavours yet" copy="Flavour breakdown appears after your first entry." />
          )}
        </AppCard>
      </section>
    </div>
  );
}

function GreetingPanel({
  summary,
  user,
  userLimits,
  limitCheck,
  onAdd,
  onScan,
}: {
  summary: Dashboard;
  user: AuthUser;
  userLimits: UserLimits;
  limitCheck: LimitCheckResult;
  onAdd: () => void;
  onScan: () => void;
}) {
  const todayNumber = Number.parseFloat(summary.todayCans) || 0;
  const canLimit = userLimits.dailyCanLimit;
  const name = firstName(user);
  const greeting = buildDynamicGreeting({
    name,
    todayCans: todayNumber,
    favouriteFlavour: summary.favouriteFlavour,
    currentStreak: Number.parseInt(summary.currentStreak, 10) || 0,
    todayCaffeineMg: Number.parseFloat(summary.todayCaffeine.replace(/[^\d.]/g, "")) || 0,
    allTimeCans: Number.parseFloat(summary.allTimeCans) || 0,
    dailyCanLimit: canLimit,
    limitCheck,
  });

  return (
    <section className="home-hero">
      <div className="hero-icon-row" aria-hidden="true">
        <span><Zap size={22} /></span>
        <span><PoundSterling size={22} /></span>
        <span><CalendarDays size={22} /></span>
        <span><Activity size={22} /></span>
      </div>

      <div className="hero-avatar">{userInitial(user)}</div>
      <p className="hero-kicker">{greeting.badge}</p>
      <h2 className="hero-name">{name}</h2>
      <p className="hero-copy">{greeting.subline}</p>

      <div className="hero-action-row">
        <button className="hero-search-button" type="button" onClick={onAdd}>
          <Plus size={22} aria-hidden="true" />
          Add intake
        </button>
        <button className="hero-scan-button secondary-button" type="button" onClick={onScan}>
          <Camera size={22} aria-hidden="true" />
          Scan barcode
        </button>
      </div>

      <div className="hero-stat-row">
        <WellnessPill label="Today" value={`${summary.todayCans} cans`} />
        <WellnessPill label="Caffeine" value={summary.todayCaffeine} />
        <WellnessPill label="Sugar" value={summary.todaySugar} />
        <WellnessPill label="Streak" value={`${summary.currentStreak} days`} />
      </div>
    </section>
  );
}

function statHint(label: string) {
  return label === "Caffeine" || label === "Sugar"
    ? "estimated from the logged can. check the label if it matters."
    : undefined;
}

function WellnessPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="wellness-pill" title={statHint(label)}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TodayPanel({
  summary,
  entries,
  onAdd,
  onScan,
}: {
  summary: Dashboard;
  entries: RedBullEntry[];
  onAdd: () => void;
  onScan: () => void;
}) {
  return (
    <section className="can-panel today-panel relative overflow-hidden p-5 sm:p-7">
      <p className="section-kicker">Today</p>
      <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="today-stat-value">{summary.todayCans}</p>
          <p className="today-stat-label mt-2">cans logged</p>
          {limitSummary ? <p className="today-limit-summary mt-2">{limitSummary}</p> : null}
        </div>
        <div className="today-panel-metrics lg:min-w-[420px]">
          <MiniMetric label="Caffeine" value={summary.todayCaffeine} accent={MATERIAL_ACCENTS.primary} />
          <MiniMetric label="Sugar" value={summary.todaySugar} accent={MATERIAL_ACCENTS.secondary} />
          <MiniMetric label="Streak" value={summary.currentStreak} accent={MATERIAL_ACCENTS.tertiary} />
        </div>
      </div>
      <div className="today-action-row mt-6 flex flex-wrap items-center gap-2">
        <button className="primary-button" type="button" onClick={onAdd}>
          <Plus size={18} aria-hidden="true" />
          Add intake
        </button>
        <button className="secondary-button" type="button" onClick={onScan}>
          <Camera size={18} aria-hidden="true" />
          Scan barcode
        </button>
        <span className="entry-chip px-3 py-2 text-sm">
          {entries.length ? `${summary.allTimeCans} all-time cans` : "Ready for your first entry"}
        </span>
      </div>
    </section>
  );
}

function QuickAddPanel({ items, onQuickAdd }: { items: typeof QUICK_ADDS; onQuickAdd: (item: (typeof QUICK_ADDS)[number]) => void }) {
  return (
    <AppCard title="Quick add" subtitle="One tap entries">
      <div className="quick-add-grid grid gap-2">
        {items.map((item) => {
          const meta = flavourMeta(item.flavour);
          return (
            <button key={item.label} className="quick-add-button" type="button" onClick={() => onQuickAdd(item)}>
              <span className="quick-add-icon">
                <Zap size={17} aria-hidden="true" />
              </span>
              <span>
                <span className="block font-medium">{item.label}</span>
                <span className="quick-add-meta">
                  {item.sizeMl}ml · {item.flavour}
                </span>
              </span>
              <span className="text-sm font-medium" style={{ color: meta.accent }}>
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
    <section className="logbook-layout grid gap-4">
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
}: {
  chartData: Array<{ label: string; spend: number; cans: number; caffeine: number; sugar: number }>;
  weekData: Array<{ label: string; spend: number; cans: number }>;
  flavourData: Array<{ name: string; value: number; spend: number; accent: string }>;
  insights: Insight[];
  entries: RedBullEntry[];
  filters: Filters;
  flavours: Flavour[];
  onFilterChange: (filters: Filters) => void;
}) {
  return (
    <div className="grid gap-4">
      <section className="logbook-layout grid gap-4">
        <FiltersPanel filters={filters} flavours={flavours} onChange={onFilterChange} compact />
        <AppCard title="Cans and spend" subtitle={`${entries.length} entries in view`}>
          {chartData.length ? (
            <ResponsiveContainer width="100%" height={340}>
              <AreaChart data={chartData} margin={{ top: 12, right: 16, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="trendSpend" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#39d5ff" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#39d5ff" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="trendCans" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#ff3448" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#ff3448" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(203,213,225,0.12)" vertical={false} />
                <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="spend" name="Spend" stroke="#39d5ff" fill="url(#trendSpend)" strokeWidth={3} />
                <Area type="monotone" dataKey="cans" name="Cans" stroke="#ff3448" fill="url(#trendCans)" strokeWidth={3} />
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
                <CartesianGrid stroke="rgba(203,213,225,0.12)" vertical={false} />
                <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="caffeine" name="Caffeine" fill="#39d5ff" radius={[8, 8, 0, 0]} />
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
                <CartesianGrid stroke="rgba(203,213,225,0.12)" vertical={false} />
                <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="spend" name="Spend" stroke="#ffd84d" strokeWidth={3} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="cans" name="Cans" stroke="#ffb7d9" strokeWidth={3} dot={{ r: 3 }} />
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
                <Pie data={flavourData} dataKey="value" nameKey="name" innerRadius={76} outerRadius={118} paddingAngle={4} stroke="#080d1f" strokeWidth={4}>
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
        <SpendForecastCard
          entries={entries}
          userLimits={userLimits}
          onSaveLimits={onSaveLimits}
        />
      </section>
    </div>
  );
}

function CoachView({ dashboard, entries, user }: { dashboard: Dashboard; entries: RedBullEntry[]; user: AuthUser }) {
  const [chats, setChats] = useState<CoachChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [savedChatIds, setSavedChatIds] = useState<Set<string>>(() => new Set());
  const [chatKey, setChatKey] = useState("");
  const [chatKeyInput, setChatKeyInput] = useState("");
  const [chatStorageStatus, setChatStorageStatus] = useState("unlock encrypted chat storage");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openThinkingIds, setOpenThinkingIds] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? null;
  const messages = useMemo(() => activeChat?.messages ?? [], [activeChat]);
  const visibleMessages = useMemo(() => messages.filter((message) => message.id !== "coach-welcome"), [messages]);

function SpendForecastCard({
  entries,
  userLimits,
  onSaveLimits,
}: {
  entries: RedBullEntry[];
  userLimits: UserLimits;
  onSaveLimits?: (limits: UserLimits) => void;
}) {
  const [projectionDays, setProjectionDays] = useState<7 | 30 | 90 | 365>(30);
  const now = useMemo(() => new Date(), []);

  const firstEntryDate = useMemo(() => {
    if (!entries.length) return now;
    return new Date(
      [...entries].sort(
        (a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()
      )[0].dateTime
    );
  }, [entries, now]);

  const trackingDays = useMemo(() => {
    const diffTime = Math.abs(now.getTime() - firstEntryDate.getTime());
    return Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  }, [firstEntryDate, now]);

    setBusy(true);
    setError("");
    setChatStorageStatus("opening encrypted appwrite chats...");
    try {
      const savedChats = await listEncryptedChats(user.$id, passphrase);
      const initialChats = savedChats.length ? savedChats : [buildNewCoachChat(user)];
      setChatKey(passphrase);
      setChats(initialChats);
      setSavedChatIds(new Set(savedChats.map((chat) => chat.id)));
      setActiveChatId(initialChats[0].id);
      setChatStorageStatus(savedChats.length ? `${savedChats.length} encrypted chat${savedChats.length === 1 ? "" : "s"} loaded` : "new encrypted chat ready");
    } catch (caught) {
      const message = chatStorageErrorMessage(caught);
      setError(message);
      setChatKey("");
      setChatStorageStatus("encrypted chat unlock failed");
    } finally {
      setBusy(false);
    }
  }

  function startNewChat() {
    if (!chatKey) return;
    const chat = buildNewCoachChat(user);
    setChats((current) => [chat, ...current]);
    setActiveChatId(chat.id);
    setInput("");
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendPrompt(input);
  }

  async function sendPrompt(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed || busy) return;
    if (!chatKey) {
      setError("unlock encrypted chat storage first.");
      return;
    }

    const currentChat = activeChat ?? buildNewCoachChat(user);
    const userMessage: CoachMessage = { id: makeId(), role: "user", content: trimmed };
    const assistantId = makeId();
    const assistantMessage: CoachMessage = { id: assistantId, role: "assistant", content: "", thinking: "", pending: true };
    const conversation = [...currentChat.messages, userMessage];
    const now = new Date().toISOString();
    const draftChat: CoachChat = {
      ...currentChat,
      title: titleForChat(currentChat.title, trimmed),
      messages: [...conversation, assistantMessage],
      updatedAt: now,
    };
  }, [entries, activePeriodDays, now]);

  const projectionData = useMemo<ForecastPoint[]>(() => {
    return Array.from({ length: projectionDays }).map((_, index) => {
      const day = index + 1;
      const dataPoint: ForecastPoint = {
        label: `day ${day}`,
        current: Number((day * stats.avgDailySpend).toFixed(2)),
        lower: Number((day * stats.avgDailySpend * 0.8).toFixed(2)),
      };
      if (userLimits.dailySpendLimit != null) {
        dataPoint.limit = Number((day * userLimits.dailySpendLimit).toFixed(2));
      }

  if (!stats.hasData) {
    return (
      <AppCard title="Spend forecast" subtitle="Based on past spending">
        <EmptyState title="No spend forecast yet" copy="Add an intake first." />
      </AppCard>
    );
  }

  const projectedSpend = stats.avgDailySpend * projectionDays;
  const projectedCans = stats.avgDailyCans * projectionDays;
  const lowerSpend = projectedSpend * 0.8;
  const possibleSavings = projectedSpend - lowerSpend;

  const saveLowerLimit = () => {
    if (!onSaveLimits) return;
    const lowerDailyLimit = Math.round(stats.avgDailySpend * 0.8 * 100) / 100;
    onSaveLimits({
      ...userLimits,
      dailySpendLimit: lowerDailyLimit,
    });
  };

  return (
    <AppCard
      title="Spend forecast"
      subtitle={`${activePeriodDays} day average: ${currency.format(stats.avgDailySpend)} per day`}
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "#d8e1ee" }}>
          <p className="app-card-subtitle">Forecast window</p>
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
                {days === 365 ? "1 year" : `${days} days`}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="forecast-stat space-y-1">
            <span className="forecast-stat-label">Projected spend</span>
            <p className="forecast-stat-value">{currency.format(projectedSpend)}</p>
            <span className="forecast-stat-note">
              ~{oneDecimal.format(projectedCans)} cans logged
            </span>
          </div>

          <div className="forecast-stat forecast-stat--positive space-y-1">
            <span className="forecast-stat-label">20 percent lower</span>
            <p className="forecast-stat-value">{currency.format(lowerSpend)}</p>
            <span className="forecast-stat-note">
              ~{oneDecimal.format(projectedCans * 0.8)} cans logged
            </span>
          </div>

          <div className="forecast-stat forecast-stat--positive flex flex-col justify-between space-y-1">
            <div>
              <span className="forecast-stat-label">Possible savings</span>
              <p className="forecast-stat-value">{currency.format(possibleSavings)}</p>
            </div>
            {onSaveLimits && (
              <button
                type="button"
                onClick={saveLowerLimit}
                className="forecast-stat-note mt-1 block text-left underline"
                style={{ color: "#0d652d" }}
              >
                Lock daily limit to {currency.format(stats.avgDailySpend * 0.8)}/day
              </button>
            )}
          </div>
        </div>
      </aside>

        <div className="forecast-chart-wrap relative">
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
                dataKey="current"
                name="current"
                stroke="var(--primary)"
                fill="url(#currentProj)"
                strokeWidth={3}
              />
              <Area
                type="monotone"
                dataKey="lower"
                name="20 percent lower"
                stroke="#10b981"
                fill="url(#optimalProj)"
                strokeWidth={3}
                strokeDasharray="4 4"
              />
              {userLimits.dailySpendLimit != null && (
                <Line
                  type="monotone"
                  dataKey="limit"
                  name="daily limit"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="6 6"
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>

      </div>
    </AppCard>
  );
}

function CoachMessageBubble({
  message,
  thinkingOpen,
  onToggleThinking,
}: {
  message: CoachMessage;
  thinkingOpen: boolean;
  onToggleThinking: () => void;
}) {
  const isAssistant = message.role === "assistant";
  const canShowThinking = isAssistant && (message.pending || Boolean(message.thinking));
  const thinkingLabel = message.stopped ? "stopped thinking" : message.pending ? "thinking" : "thinking";

  return (
    <article className={`coach-message coach-message-${message.role}`}>
      <div className="coach-message-bubble">
        <p className="text-xs font-semibold uppercase text-slate-500">{isAssistant ? "coach" : "you"}</p>
        <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white">
          {message.content || (message.pending ? "streaming response..." : "")}
        </div>

        {canShowThinking && (
          <div className="mt-3">
            <button className={`thinking-slider ${message.pending ? "thinking-slider-active" : ""}`} type="button" onClick={onToggleThinking}>
              <span className="thinking-slider-track">
                <span>{thinkingLabel} · click to reveal reasoning</span>
              </span>
            </button>
            <AnimatePresence>
              {thinkingOpen && (
                <motion.pre
                  className="thinking-trace"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  {message.thinking || "waiting for reasoning trace..."}
                </motion.pre>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </article>
  );
}

function SettingsView({
  activeTheme,
  summary,
  dataLoading,
  entries,
  notice,
  setupStatus,
  themeId,
  user,
  userLimits,
  limitCheck,
  busyAction,
  onExportExcel,
  onImportExcel,
  onExportJson,
  onImportJson,
  onLogout,
  onReset,
  onThemeChange,
}: {
  activeTheme: AppTheme;
  summary: Dashboard;
  dataLoading: boolean;
  entries: RedBullEntry[];
  notice: string;
  setupStatus: SetupStatus;
  themeId: string;
  user: AuthUser | null;
  userLimits: UserLimits;
  limitCheck: LimitCheckResult;
  busyAction: string | null;
  onExportExcel: () => void;
  onImportExcel: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
  onLogout: () => void;
  onReset: () => void;
  onThemeChange: (id: string) => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
      <div className="grid gap-4">
        <AppCard title="Daily limits" subtitle="Personal caps for cans, spend, and stop time (BST)">
          <LimitsSettingsForm
            limits={userLimits}
            check={limitCheck}
            saving={busyAction === "save-limits"}
            onSave={onSaveLimits}
          />
          <div className="mt-4 border-t border-white/5 pt-4 flex justify-end">
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 text-xs font-bold text-slate-300 hover:bg-white/10 transition active:scale-95"
              type="button"
              onClick={onRerunOnboarding}
            >
              <Sparkles size={14} className="text-cyan-400" />
              Run setup again
            </button>
          </div>
        </AppCard>

        <AppCard title="Appearance" subtitle={`${activeTheme.label} theme active`}>
          <ThemePicker themeId={themeId} onChange={onThemeChange} />
        </AppCard>

        <AppCard title="Data & sync" subtitle={`${entries.length} entries synced for this user`}>
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniMetric label="All-time cans" value={summary.allTimeCans} accent={MATERIAL_ACCENTS.primary} />
            <MiniMetric label="Total spend" value={summary.totalSpend} accent={MATERIAL_ACCENTS.tertiary} />
            <MiniMetric label="Favourite" value={summary.favouriteFlavour} accent={MATERIAL_ACCENTS.secondary} />
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <button className="secondary-button justify-center" type="button" onClick={() => window.location.reload()} disabled={dataLoading}>
              {dataLoading ? <Loader2 className="animate-spin" size={17} aria-hidden="true" /> : <RefreshCcw size={17} aria-hidden="true" />}
              Sync now
            </button>
            <button className="excel-button justify-center" type="button" onClick={onExportExcel} disabled={!entries.length || Boolean(busyAction)}>
              <FileSpreadsheet size={17} aria-hidden="true" />
              Export XLSX
            </button>
            <button className="excel-button justify-center" type="button" onClick={onImportExcel} disabled={Boolean(busyAction)}>
              <Upload size={17} aria-hidden="true" />
              Import XLSX
            </button>
            <button className="secondary-button justify-center" type="button" onClick={onExportJson} disabled={!entries.length || Boolean(busyAction)}>
              <FileJson size={17} aria-hidden="true" />
              Export JSON
            </button>
            <button className="secondary-button justify-center" type="button" onClick={onImportJson} disabled={Boolean(busyAction)}>
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
            </dl>
          </div>

          <button className="danger-button mt-5 justify-center" type="button" onClick={onReset} disabled={!entries.length || Boolean(busyAction)}>
            <RotateCcw size={17} aria-hidden="true" />
            Delete all entries
          </button>
        </AppCard>
      </div>

      <div className="grid gap-4">
        <AppCard title="Account" subtitle="Signed in with Appwrite">
          <div className="account-card">
            <div className="account-avatar">{userInitial(user)}</div>
            <div className="min-w-0">
              <p className="truncate text-lg font-medium text-slate-950">{user?.name || "Appwrite user"}</p>
              <p className="truncate text-sm text-slate-500">{user?.email}</p>
            </div>
          </div>
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.05] p-4">
            <div className="flex items-center gap-2 text-sm text-slate-700">
              {dataLoading ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <Cloud size={16} aria-hidden="true" />}
              {notice}
            </div>
            <p className={`mt-2 text-xs ${setupStatus.state === "ok" ? "text-emerald-700" : "text-amber-700"}`}>{setupStatus.message}</p>
          </div>
          <button className="secondary-button mt-4 justify-center" type="button" onClick={onLogout}>
            <LogOut size={17} aria-hidden="true" />
            Log out
          </button>
        </AppCard>
      </div>
    </div>
  );
}

function DataPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[110px_1fr]">
      <dt className="text-slate-500">{label}</dt>
      <dd className="truncate font-mono text-xs" style={{ color: "#174ea6" }}>{value}</dd>
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
      className="glass-panel metric-tile"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="metric-tile-label">{label}</p>
          <p className="metric-tile-value break-words">{value}</p>
        </div>
        <div className="metric-tile-icon" style={{ color: accent }}>
          <Icon size={20} aria-hidden="true" />
        </div>
      </div>
      <p className="metric-tile-detail mt-4">{detail}</p>
    </motion.article>
  );
}

function MiniMetric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="mini-metric-card metric-soft" title={statHint(label)}>
      <p className="mini-metric-label">{label}</p>
      <p className="mini-metric-value truncate" style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <article className="glass-panel p-4">
      <div className="mb-3 flex items-center gap-2" style={{ color: "var(--primary, #2563c7)" }}>
        <Gauge size={17} aria-hidden="true" />
        <p className="insight-card-label">{insight.label}</p>
      </div>
      <p className="insight-card-value text-lg">{insight.value}</p>
      <p className="insight-card-detail mt-2">{insight.detail}</p>
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
    <section className="app-card p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="app-card-title text-xl">{title}</h2>
        {subtitle && <p className="app-card-subtitle mt-1">{subtitle}</p>}
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
    <div className="chart-tooltip">
      <p className="mb-1 text-sm font-medium" style={{ color: "#202124" }}>{label}</p>
      {payload.map((item) => (
        <p key={item.name} className="text-sm" style={{ color: "#5f6670" }}>
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
    <div className="empty-state">
      <div className="empty-state-icon">
        <Zap size={22} aria-hidden="true" />
      </div>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-copy mt-2 max-w-sm">{copy}</p>
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
          <h3 className="entry-title">{entry.flavour}</h3>
          <span className="entry-chip">
            {entry.cans} can{entry.cans === 1 ? "" : "s"} · {entry.sizeMl}ml
          </span>
          <span className="source-badge">
            {entry.source}
          </span>
        </div>
        <p className="entry-meta">{humanDateTime(entry.dateTime)}</p>
        <p className="entry-summary mt-2">
          {currency.format(spendFor(entry))} · {wholeNumber.format(caffeineFor(entry))}mg caffeine · {oneDecimal.format(sugarFor(entry))}g sugar
        </p>
        {(entry.store || entry.notes) && (
          <p className="entry-meta mt-2 leading-6">
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
        <button className="icon-button" type="button" style={{ color: "#9f1c16" }} onClick={() => onDelete(entry.id)} aria-label={`Delete ${entry.flavour} entry`}>
          <Trash2 size={17} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

function MiniEntry({ entry }: { entry: RedBullEntry }) {
  return (
    <div className="mini-entry-card">
      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: entry.flavourAccent }} />
      <div className="min-w-0">
        <p className="mini-entry-title truncate">{entry.flavour}</p>
        <p className="mini-entry-meta truncate">{humanDateTime(entry.dateTime)}</p>
      </div>
      <p className="mini-entry-price">{currency.format(spendFor(entry))}</p>
    </div>
  );
}

function EntryModal({
  open,
  entry,
  initialDraft,
  flavours,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  entry: RedBullEntry | null;
  initialDraft: EntryDraft | null;
  flavours: Flavour[];
  saving: boolean;
  onClose: () => void;
  onSave: (draft: EntryDraft) => void;
}) {
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const activeDraft = entry ?? initialDraft;
  const initialFlavour = activeDraft?.flavour ?? DEFAULT_FLAVOUR.name;
  const [selectedFlavour, setSelectedFlavour] = useState(initialFlavour);
  const [customFlavour, setCustomFlavour] = useState("");
  const [customAccent, setCustomAccent] = useState(MATERIAL_ACCENTS.custom);
  const [cans, setCans] = useState(activeDraft?.cans.toString() ?? "1");
  const [sizePreset, setSizePreset] = useState(sizeToPreset(activeDraft?.sizeMl ?? 250));
  const [customSize, setCustomSize] = useState(activeDraft?.sizeMl.toString() ?? "250");
  const [pricePerCan, setPricePerCan] = useState(activeDraft?.pricePerCan.toString() ?? "1.75");
  const [dateTime, setDateTime] = useState(formatLocalInput(activeDraft ? new Date(activeDraft.dateTime) : new Date()));
  const [store, setStore] = useState(activeDraft?.store ?? "");
  const [notes, setNotes] = useState(activeDraft?.notes ?? "");
  const [sugarFree, setSugarFree] = useState(activeDraft?.sugarFree ?? false);
  const [caffeineOverride, setCaffeineOverride] = useState(activeDraft?.caffeineMgPerCan?.toString() ?? "");

  useEffect(() => {
    if (!open) return;
    const draft = entry ?? initialDraft;
    const editingCustom = draft && !BUILT_IN_FLAVOURS.some((flavour) => flavour.name === draft.flavour);
    setSelectedFlavour(editingCustom ? draft.flavour : draft?.flavour ?? DEFAULT_FLAVOUR.name);
    setCustomFlavour(editingCustom ? draft.flavour : "");
    setCustomAccent(draft?.flavourAccent ?? MATERIAL_ACCENTS.custom);
    setCans(draft?.cans.toString() ?? "1");
    setSizePreset(sizeToPreset(draft?.sizeMl ?? 250));
    setCustomSize(draft?.sizeMl.toString() ?? "250");
    setPricePerCan(draft?.pricePerCan.toString() ?? defaultPriceForSize(250).toString());
    setDateTime(formatLocalInput(draft ? new Date(draft.dateTime) : new Date()));
    setStore(draft?.store ?? "");
    setNotes(draft?.notes ?? "");
    setSugarFree(draft?.sugarFree ?? false);
    setCaffeineOverride(draft?.caffeineMgPerCan?.toString() ?? "");
    window.setTimeout(() => firstFieldRef.current?.focus(), 80);
  }, [entry, initialDraft, open]);

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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericCans = Math.max(0.25, Number(cans) || 1);
    const numericPrice = Math.max(0, Number(pricePerCan) || 0);
    const finalFlavour = isOther ? customFlavour.trim() || "Other" : selectedFlavour;
    const meta = flavourMeta(finalFlavour);
    const override =
      sizePreset === "custom" && caffeineOverride.trim()
        ? Math.max(0, Number(caffeineOverride) || 0)
        : undefined;

    onSave({
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
      source: entry?.source ?? initialDraft?.source ?? "manual",
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
    initialDraft?.source,
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
          className="modal-backdrop fixed inset-0 z-50 flex justify-center bg-black/60 backdrop-blur-xl"
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
                <p className="section-kicker">Intake details</p>
                <h2 id="entry-modal-title" className="app-card-title mt-1 text-3xl">
                  {entry ? "Edit entry" : "Add intake"}
                </h2>
              </div>
              <button className="icon-button" type="button" onClick={onClose} aria-label="Close entry modal">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

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

              <div className="rounded-lg px-3 py-3 text-sm sm:col-span-2" style={{ border: "1px solid #d8e1ee", background: "#f7faff", color: "#3c4043" }}>
                Estimated caffeine per can: {wholeNumber.format(caffeinePreview)}mg
              </div>

              <label className="field-label flex-row items-center gap-3 rounded-lg border px-3 py-3 sm:col-span-2" style={{ borderColor: "#d8e1ee", background: "#ffffff" }}>
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
          className="modal-backdrop fixed inset-0 z-50 flex justify-center bg-black/60 backdrop-blur-xl"
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
              <MiniMetric label="Ready" value={`${validRows.length}`} accent="#39d5ff" />
              <MiniMetric label="Duplicates" value={`${duplicateRows.length}`} accent="#ffd84d" />
              <MiniMetric label="Invalid" value={`${invalidRows.length}`} accent="#ff3448" />
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
          className="modal-backdrop fixed inset-0 z-50 flex justify-center bg-black/60 backdrop-blur-xl"
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

async function readOllamaStream(stream: ReadableStream<Uint8Array>, onChunk: (chunk: OllamaStreamChunk) => void) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  function processLine(line: string) {
    const chunk = parseOllamaLine(line);
    if (chunk) onChunk(chunk);
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(processLine);
  }

  buffer += decoder.decode();
  if (buffer.trim()) processLine(buffer);
}

function parseOllamaLine(line: string): OllamaStreamChunk | null {
  const trimmed = line.trim().replace(/^data:\s*/, "");
  if (!trimmed || trimmed === "[DONE]") return null;
  try {
    return JSON.parse(trimmed) as OllamaStreamChunk;
  } catch {
    return null;
  }
}

function buildCoachSystemPrompt(user: AuthUser, dashboard: Dashboard, entries: RedBullEntry[]) {
  const recent = entries
    .slice(0, 12)
    .map(
      (entry) =>
        `- ${humanDateTime(entry.dateTime)}: ${entry.cans} can(s), ${entry.flavour}, ${entry.sizeMl}ml, ${currency.format(spendFor(entry))}, ${wholeNumber.format(caffeineFor(entry))}mg caffeine, ${oneDecimal.format(sugarFor(entry))}g sugar`,
    )
    .join("\n");

  return [
    "You are an upbeat Red Bull intake coach inside a tracking app.",
    "Respond entirely in lower case, including headings and short labels.",
    "Give concise, practical suggestions based only on the logged data provided.",
    "Do not give medical advice; suggest checking labels and using personal judgement for caffeine tolerance.",
    `User: ${user.name || user.email || "Appwrite user"}`,
    `Today: ${dashboard.todayCans} cans, ${dashboard.todayCaffeine} caffeine, ${dashboard.todaySugar} sugar.`,
    `Favourite flavour: ${dashboard.favouriteFlavour}. Current streak: ${dashboard.currentStreak} day(s). Total spend: ${dashboard.totalSpend}.`,
    `Recent entries:\n${recent || "No entries logged yet."}`,
  ].join("\n");
}

function buildNewCoachChat(user: AuthUser): CoachChat {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    userId: user.$id,
    title: "new chat",
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: "coach-welcome",
        role: "assistant",
        content: `hey ${firstName(user).toLocaleLowerCase()}, i can help with caffeine pace, sugar swaps, spend trends, and smarter quick-add choices.`,
      },
    ],
  };
}

function titleForChat(currentTitle: string, prompt: string) {
  if (currentTitle !== "new chat") return currentTitle;
  const cleaned = prompt.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  return cleaned.length > 48 ? `${cleaned.slice(0, 45)}...` : cleaned || "new chat";
}

function firstName(user: AuthUser) {
  const fallback = user.email?.split("@")[0] ?? "there";
  const value = (user.name || fallback).trim();
  return value.split(/\s+/)[0] || "there";
}

function userInitial(user: AuthUser | null) {
  const value = user?.name || user?.email || "r";
  return value.trim().charAt(0).toUpperCase();
}

function sizeToPreset(size: number) {
  if (size === 250 || size === 355 || size === 473) return size.toString();
  return "custom";
}

function actionLabel(value: string) {
  return value
    .replace(/^quick-/, "quick add ")
    .replace(/-/g, " ");
}

export default App;
