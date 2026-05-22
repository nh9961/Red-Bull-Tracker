import type { Models } from "appwrite";
import {
  Activity,
  AlertTriangle,
  Brain,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Command,
  Database,
  Edit3,
  FileJson,
  FileSpreadsheet,
  Gauge,
  Github,
  Home,
  LineChart,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  MessageCircle,
  MessageSquarePlus,
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
import {
  chatStorageErrorMessage,
  createEncryptedChat,
  deleteEncryptedChat,
  listEncryptedChats,
  updateEncryptedChat,
} from "./lib/encryptedChats";
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
import type { CoachChat, CoachMessage, DateFilter, EntryDraft, Filters, Flavour, ImportPreview, RedBullEntry } from "./types";

type AppView = "overview" | "logbook" | "trends" | "coach" | "settings";
type AuthMode = "login" | "signup";
type AuthUser = Models.User<Models.Preferences>;
type SetupStatus = { state: "checking" | "ok" | "error"; message: string };
type OllamaStreamChunk = { error?: string; message?: { content?: string; thinking?: string } };
const OLLAMA_MODEL = "deepseek-v4-pro:cloud";
const OLLAMA_PROXY_URL = import.meta.env.VITE_OLLAMA_PROXY_URL?.trim() || "/api/ollama-chat";

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
        setNotice(`Signed in as ${currentUser.email || currentUser.name || "Appwrite user"}.`);
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
  const chartData = useMemo(() => groupByDay(filteredEntries), [filteredEntries]);
  const weekData = useMemo(() => groupByWeek(filteredEntries), [filteredEntries]);
  const flavourData = useMemo(() => groupByFlavour(filteredEntries), [filteredEntries]);
  const insights = useMemo(() => buildInsights(entries), [entries]);
  const recentEntries = useMemo(() => entries.slice(0, 5), [entries]);

  async function login(email: string, password: string) {
    setActionLoading("auth");
    setAuthError("");
    try {
      await account.createEmailPasswordSession({ email, password });
      const currentUser = await account.get();
      setUser(currentUser);
      setNotice(`Signed in as ${currentUser.email}.`);
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
      setNotice(`Welcome, ${currentUser.name || currentUser.email}.`);
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

  async function saveEntry(draft: EntryDraft) {
    if (!user) return;
    setActionLoading("save-entry");
    setDataError("");
    try {
      const saved = editingEntry
        ? await updateEntry(user.$id, editingEntry.id, { ...draft, source: editingEntry.source })
        : await createEntry(user.$id, { ...draft, source: "manual" });
      setEntries((current) =>
        sortEntries(editingEntry ? current.map((entry) => (entry.id === saved.id ? saved : entry)) : [saved, ...current]),
      );
      setNotice(editingEntry ? "Entry updated in Appwrite." : "Entry saved to Appwrite.");
      setEditingEntry(null);
      setIsEntryModalOpen(false);
    } catch (error) {
      setDataError(appwriteErrorMessage(error));
    } finally {
      setActionLoading(null);
    }
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
            activeTheme={activeTheme}
            activeView={activeView}
            actionLoading={actionLoading}
            dataLoading={dataLoading}
            entries={entries}
            user={user}
            onAdd={openNewEntry}
            onExportExcel={() => void exportExcel()}
            onImportExcel={() => excelFileInputRef.current?.click()}
            onOpenSettings={() => setActiveView("settings")}
            onRefresh={() => void refreshEntries(user.$id)}
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
              {activeView === "overview" && (
                <OverviewView
                  dashboard={dashboard}
                  entries={entries}
                  insights={insights}
                  quickAdds={QUICK_ADDS}
                  recentEntries={recentEntries}
                  chartData={chartData}
                  flavourData={flavourData}
                  user={user}
                  onQuickAdd={(item) => void quickAdd(item)}
                  onAdd={openNewEntry}
                  onOpenCoach={() => setActiveView("coach")}
                  onOpenLogbook={() => setActiveView("logbook")}
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
                />
              )}

              {activeView === "coach" && <CoachView dashboard={dashboard} entries={entries} user={user} />}

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
                  actionLoading={actionLoading}
                  onExportExcel={() => void exportExcel()}
                  onImportExcel={() => excelFileInputRef.current?.click()}
                  onExportJson={exportJson}
                  onImportJson={() => jsonFileInputRef.current?.click()}
                  onLogout={() => void logout()}
                  onReset={() => setIsResetOpen(true)}
                  onThemeChange={setThemeId}
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
      <main className="auth-layout">
        <section className="auth-hero">
          <div className="state-chip mb-4">
            <Cloud size={16} aria-hidden="true" />
            {setupStatus.state === "ok" ? "Appwrite sync online" : "Appwrite setup check"}
          </div>
          <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-white sm:text-6xl">
            Red Bull Tracker App
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
            Soft Material You intake tracking with Appwrite authentication, device sync, and polished Excel exports.
          </p>
          <div className="auth-signal-grid">
            <AuthSignal icon={ShieldCheck} label="User scoped" value="Private entries" />
            <AuthSignal icon={Database} label="Database" value={appwriteConfig.databaseId} />
            <AuthSignal icon={CheckCircle2} label="Ping" value={setupStatus.state === "ok" ? "Connected" : "Check setup"} />
          </div>
          {setupStatus.state !== "ok" && (
            <div className="mt-4 rounded-lg border border-amber-300/40 bg-amber-300/10 p-3 text-sm leading-6 text-amber-100">
              {setupStatus.message}
            </div>
          )}
        </section>

        <section className="auth-panel">
          <div className="segmented-control mb-5">
            <button
              className={mode === "login" ? "segmented-control-active" : ""}
              type="button"
              onClick={() => setMode("login")}
            >
              Log in
            </button>
            <button
              className={mode === "signup" ? "segmented-control-active" : ""}
              type="button"
              onClick={() => setMode("signup")}
            >
              Sign up
            </button>
          </div>

          <form className="grid gap-4" onSubmit={submit}>
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
              <div className="rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                {authError}
              </div>
            )}

            <button className="primary-button w-full" type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" size={17} aria-hidden="true" /> : <LogIn size={17} aria-hidden="true" />}
              {mode === "signup" ? "Create account" : "Log in"}
            </button>
          </form>

          <div className="my-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs uppercase tracking-[0.22em] text-slate-500">
            <span className="h-px bg-white/10" />
            OAuth
            <span className="h-px bg-white/10" />
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
  activeTheme,
  activeView,
  actionLoading,
  dataLoading,
  entries,
  user,
  onAdd,
  onExportExcel,
  onImportExcel,
  onOpenSettings,
  onRefresh,
}: {
  activeTheme: AppTheme;
  activeView: AppView;
  actionLoading: string | null;
  dataLoading: boolean;
  entries: RedBullEntry[];
  user: AuthUser;
  onAdd: () => void;
  onExportExcel: () => void;
  onImportExcel: () => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
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

        <div className="top-meta-row">
          <span className="account-chip">{user.email || "Synced user"}</span>
          <CurrentThemeIndicator theme={activeTheme} onClick={onOpenSettings} />
        </div>
      </div>

      <div className="top-action-row">
        <div className="top-action-primary">
          <button className="primary-button" type="button" onClick={onAdd} disabled={Boolean(actionLoading)}>
            <Plus size={18} aria-hidden="true" />
            Add Intake
          </button>
        </div>
        <div className="top-action-secondary">
          <button className="secondary-button" type="button" onClick={onRefresh} disabled={dataLoading}>
            {dataLoading ? <Loader2 className="animate-spin" size={17} aria-hidden="true" /> : <RefreshCcw size={17} aria-hidden="true" />}
            Sync
          </button>
          <button className="excel-button" type="button" onClick={onExportExcel} disabled={!entries.length || Boolean(actionLoading)}>
            <FileSpreadsheet size={17} aria-hidden="true" />
            Export XLSX
          </button>
          <button className="excel-button" type="button" onClick={onImportExcel} disabled={Boolean(actionLoading)}>
            <Upload size={17} aria-hidden="true" />
            Import XLSX
          </button>
        </div>
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
  onQuickAdd,
  onAdd,
  onOpenCoach,
  onOpenLogbook,
}: {
  dashboard: Dashboard;
  entries: RedBullEntry[];
  insights: Insight[];
  quickAdds: typeof QUICK_ADDS;
  recentEntries: RedBullEntry[];
  chartData: Array<{ label: string; spend: number; cans: number; caffeine: number; sugar: number }>;
  flavourData: Array<{ name: string; value: number; spend: number; accent: string }>;
  user: AuthUser;
  onQuickAdd: (item: (typeof QUICK_ADDS)[number]) => void;
  onAdd: () => void;
  onOpenCoach: () => void;
  onOpenLogbook: () => void;
}) {
  return (
    <div className="grid gap-4">
      <GreetingPanel dashboard={dashboard} entries={entries} user={user} onOpenCoach={onOpenCoach} />

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <TodayPanel dashboard={dashboard} entries={entries} onAdd={onAdd} />
        <QuickAddPanel items={quickAdds} onQuickAdd={onQuickAdd} />
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile icon={CalendarDays} label="This Month" value={dashboard.monthCans} detail={`${dashboard.monthSpend} spent`} accent={MATERIAL_ACCENTS.primary} />
        <MetricTile icon={PoundSterling} label="Total Spend" value={dashboard.totalSpend} detail={`${dashboard.avgWeeklySpend} weekly average`} accent={MATERIAL_ACCENTS.secondary} />
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
  entries,
  user,
  onOpenCoach,
}: {
  dashboard: Dashboard;
  entries: RedBullEntry[];
  user: AuthUser;
  onOpenCoach: () => void;
}) {
  const todayNumber = Number.parseFloat(dashboard.todayCans) || 0;
  const progress = Math.min(100, Math.round((todayNumber / 4) * 100));
  const name = firstName(user);
  const favourite = dashboard.favouriteFlavour === "None yet" ? "still forming" : dashboard.favouriteFlavour;
  const redBullLabel = todayNumber === 1 ? "Red Bull" : "Red Bulls";

  return (
    <section className="oura-hero glass-panel p-5 sm:p-6">
      <div className="grid gap-5 xl:grid-cols-[auto_1fr_auto] xl:items-center">
        <div className="oura-ring" style={{ "--progress": `${progress}%` } as CSSProperties} aria-label={`${progress}% of daily guide`}>
          <div>
            <span>{dashboard.todayCans}</span>
            <small>today</small>
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-semibold text-slate-400">
            <Sparkles size={14} aria-hidden="true" />
            Daily readiness
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Hey {name}, you've had {dashboard.todayCans} {redBullLabel} today and your favourite flavour is {favourite}.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Clean caffeine, sugar, spend, and streak signals in one glance.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[390px] xl:grid-cols-1">
          <WellnessPill label="Caffeine" value={dashboard.todayCaffeine} />
          <WellnessPill label="Sugar" value={dashboard.todaySugar} />
          <WellnessPill label="Entries" value={`${entries.length}`} />
        </div>
      </div>

      <div className="mt-5 grid gap-2 md:grid-cols-3">
        <button className="suggestion-chip" type="button" onClick={onOpenCoach}>
          Ask Coach for today's pace
        </button>
        <button className="suggestion-chip" type="button" onClick={onOpenCoach}>
          Get a sugar-free swap idea
        </button>
        <button className="suggestion-chip" type="button" onClick={onOpenCoach}>
          Review weekly spend trend
        </button>
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
  onAdd,
}: {
  dashboard: Dashboard;
  entries: RedBullEntry[];
  onAdd: () => void;
}) {
  return (
    <section className="can-panel today-panel relative overflow-hidden p-5 sm:p-7">
      <p className="text-sm font-medium uppercase tracking-[0.18em] text-cyan-100">Today</p>
      <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-7xl font-semibold tracking-tight text-white sm:text-8xl">{dashboard.todayCans}</p>
          <p className="mt-2 text-lg text-slate-300">cans logged</p>
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [activeChatId, messages]);

  const quickPrompts = [
    "what does my red bull pattern say about today?",
    "give me one lower-sugar swap based on my favourite flavour.",
    "how should i pace caffeine for the rest of the day?",
  ];

  async function unlockChats(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const passphrase = chatKeyInput.trim();
    if (!passphrase) return;

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

    upsertChatState(draftChat);
    setActiveChatId(draftChat.id);
    setInput("");
    setBusy(true);
    setError("");

    let streamedContent = "";
    let streamedThinking = "";
    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const requestMessages: Array<{ role: string; content: string; thinking?: string }> = [
        { role: "system", content: buildCoachSystemPrompt(user, dashboard, entries) },
        ...conversation
          .filter((message) => message.content.trim().length > 0)
          .map((message) => ({
            role: message.role,
            content: message.content,
            ...(message.thinking ? { thinking: message.thinking } : {}),
          })),
      ];

      const response = await fetch(OLLAMA_PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: requestMessages,
          stream: true,
          think: true,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `Ollama request failed with status ${response.status}.`);
      }
      if (!response.body) {
        throw new Error("Streaming response was empty.");
      }

      await readOllamaStream(response.body, (chunk) => {
        if (chunk.error) throw new Error(chunk.error);
        if (chunk.message?.thinking) streamedThinking += chunk.message.thinking;
        if (chunk.message?.content) streamedContent += chunk.message.content.toLocaleLowerCase();

        patchAssistantMessage(draftChat.id, assistantId, {
          content: streamedContent,
          thinking: streamedThinking,
          pending: true,
        });
      });

      const finalChat = withAssistantMessage(draftChat, assistantId, {
        content: streamedContent || "no answer returned.",
        thinking: streamedThinking,
        pending: false,
      });
      upsertChatState(finalChat);
      await persistChat(finalChat);
    } catch (caught) {
      const aborted = abortController.signal.aborted;
      const message = caught instanceof Error ? caught.message : "Coach request failed.";
      const finalChat = withAssistantMessage(draftChat, assistantId, {
        content: aborted ? streamedContent || "stopped thinking." : `coach unavailable: ${message}`.toLocaleLowerCase(),
        thinking: streamedThinking,
        pending: false,
        stopped: aborted,
      });
      upsertChatState(finalChat);
      await persistChat(finalChat);
      if (!aborted) setError(message);
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  function stopThinking() {
    abortRef.current?.abort();
  }

  function toggleThinking(id: string) {
    setOpenThinkingIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  function upsertChatState(chat: CoachChat) {
    setChats((current) => {
      const exists = current.some((item) => item.id === chat.id);
      return exists ? current.map((item) => (item.id === chat.id ? chat : item)) : [chat, ...current];
    });
  }

  function patchAssistantMessage(chatId: string, messageId: string, patch: Partial<CoachMessage>) {
    setChats((current) =>
      current.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              updatedAt: new Date().toISOString(),
              messages: chat.messages.map((message) => (message.id === messageId ? { ...message, ...patch } : message)),
            }
          : chat,
      ),
    );
  }

  function withAssistantMessage(chat: CoachChat, messageId: string, patch: Partial<CoachMessage>): CoachChat {
    return {
      ...chat,
      updatedAt: new Date().toISOString(),
      messages: chat.messages.map((message) => (message.id === messageId ? { ...message, ...patch } : message)),
    };
  }

  async function persistChat(chat: CoachChat) {
    if (!chatKey) return;
    try {
      const saved = savedChatIds.has(chat.id)
        ? await updateEncryptedChat(user.$id, chatKey, chat)
        : await createEncryptedChat(user.$id, chatKey, chat);
      setSavedChatIds((current) => new Set(current).add(saved.id));
      upsertChatState(saved);
      setChatStorageStatus("encrypted chat saved to appwrite");
    } catch (caught) {
      setChatStorageStatus("encrypted chat save failed");
      setError(chatStorageErrorMessage(caught));
    }
  }

  async function removeChat(chatId: string) {
    if (busy) return;
    try {
      if (savedChatIds.has(chatId)) await deleteEncryptedChat(chatId);
      setSavedChatIds((current) => {
        const next = new Set(current);
        next.delete(chatId);
        return next;
      });
      setChats((current) => {
        const next = current.filter((chat) => chat.id !== chatId);
        const fallback = buildNewCoachChat(user);
        setActiveChatId(next[0]?.id ?? fallback.id);
        return next.length ? next : [fallback];
      });
      setChatStorageStatus("encrypted chat deleted");
    } catch (caught) {
      setError(chatStorageErrorMessage(caught));
    }
  }

  if (!chatKey) {
    return (
      <section className="coach-shell coach-locked-shell">
        <div className="coach-empty-state">
          <div className="coach-empty-icon">
            <Lock size={28} aria-hidden="true" />
          </div>
          <h2>unlock coach</h2>
          <p>
            messages are encrypted before appwrite stores them. your passphrase is never saved — use the same one on every device.
          </p>
          <form className="coach-unlock-card" onSubmit={unlockChats}>
            <input
              className="coach-input"
              type="password"
              value={chatKeyInput}
              onChange={(event) => setChatKeyInput(event.target.value)}
              placeholder="encryption passphrase"
              autoComplete="current-password"
            />
            <button className="primary-button" type="submit" disabled={busy || !chatKeyInput.trim()}>
              {busy ? <Loader2 className="animate-spin" size={17} aria-hidden="true" /> : <Lock size={17} aria-hidden="true" />}
              unlock
            </button>
          </form>
          {error && <p className="mt-4 max-w-md text-sm" style={{ color: "var(--error)" }}>{error}</p>}
        </div>
      </section>
    );
  }

  const userInitials = user.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : (user.email?.[0] ?? "U").toUpperCase();

  return (
    <section className="coach-shell">
      <div className="coach-layout">
        <aside className="coach-sidebar">
          <div className="coach-sidebar-header">
            <div className="coach-sidebar-icon">
              <Brain size={18} aria-hidden="true" />
            </div>
            <div className="coach-sidebar-label">
              <p>coach</p>
              <p>{chatStorageStatus}</p>
            </div>
          </div>

          <button className="coach-new-chat" type="button" onClick={startNewChat} disabled={busy}>
            <Plus size={16} aria-hidden="true" />
            new chat
          </button>

          <div className="coach-chat-list">
            {chats.map((chat) => (
              <div key={chat.id} className={`coach-chat-row ${chat.id === activeChatId ? "coach-chat-row-active" : ""}`}>
                <button type="button" onClick={() => setActiveChatId(chat.id)}>
                  <span>{chat.title}</span>
                  <small>{new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(chat.updatedAt))}</small>
                </button>
                <button type="button" aria-label={`delete ${chat.title}`} onClick={() => void removeChat(chat.id)} disabled={busy}>
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>

          <div className="coach-context-card">
            <p className="text-xs font-semibold uppercase" style={{ color: "var(--muted)" }}>today</p>
            <div className="mt-2 grid gap-2">
              <WellnessPill label="cans" value={dashboard.todayCans} />
              <WellnessPill label="caffeine" value={dashboard.todayCaffeine} />
              <WellnessPill label="favourite" value={dashboard.favouriteFlavour} />
            </div>
          </div>
        </aside>

        <section className="coach-main">
          <div className="coach-topbar">
            <span className="coach-topbar-status">
              <span className={`coach-topbar-status-dot ${busy ? "coach-topbar-status-dot-busy" : "coach-topbar-status-dot-ready"}`} />
              {busy ? "thinking" : "ready"}
            </span>
            <span className="coach-topbar-status" style={{ color: "var(--muted)" }}>{OLLAMA_MODEL}</span>
          </div>

          <div className="coach-messages" aria-live="polite">
            <div className="coach-messages-inner">
              {!visibleMessages.length ? (
                <div className="coach-empty-state">
                  <div className="coach-empty-icon">
                    <Sparkles size={28} aria-hidden="true" />
                  </div>
                  <h2>how can I help?</h2>
                  <p>ask about caffeine, sugar, spending, or your flavour patterns.</p>
                  <div className="coach-prompt-grid">
                    {quickPrompts.map((prompt) => (
                      <button key={prompt} className="chat-suggestion-chip" type="button" disabled={busy} onClick={() => void sendPrompt(prompt)}>
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                visibleMessages.map((message) => (
                  <CoachMessageBubble
                    key={message.id}
                    message={message}
                    userInitials={userInitials}
                    thinkingOpen={openThinkingIds.includes(message.id)}
                    onToggleThinking={() => toggleThinking(message.id)}
                  />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {error && (
            <div className="coach-error">
              <div className="coach-error-inner">
                {error}
              </div>
            </div>
          )}

          <form className="coach-composer" onSubmit={submit}>
            <div className="coach-composer-inner">
              <button className="composer-icon-button" type="button" onClick={startNewChat} disabled={busy} aria-label="new chat">
                <Plus size={18} aria-hidden="true" />
              </button>
              <textarea
                className="coach-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendPrompt(input);
                  }
                }}
                placeholder="ask coach"
                disabled={busy}
                rows={1}
              />
              {busy ? (
                <button className="composer-send-button composer-stop-button" type="button" onClick={stopThinking} aria-label="stop thinking">
                  <Square size={16} aria-hidden="true" />
                </button>
              ) : (
                <button className="composer-send-button" type="submit" disabled={!input.trim()} aria-label="send message">
                  <Send size={16} aria-hidden="true" />
                </button>
              )}
            </div>
            <p className="coach-hint">coach can make mistakes. check important info.</p>
          </form>
        </section>
      </div>
    </section>
  );
}

function CoachMessageBubble({
  message,
  userInitials,
  thinkingOpen,
  onToggleThinking,
}: {
  message: CoachMessage;
  userInitials: string;
  thinkingOpen: boolean;
  onToggleThinking: () => void;
}) {
  const isAssistant = message.role === "assistant";
  const canShowThinking = isAssistant && (message.pending || Boolean(message.thinking));
  const thinkingLabel = message.stopped ? "stopped thinking" : message.pending ? "thinking" : "view reasoning";

  return (
    <article className={`coach-message ${isAssistant ? "coach-message-assistant" : "coach-message-user"}`}>
      {isAssistant ? (
        <div className="coach-message-avatar coach-message-avatar-assistant">
          <Brain size={16} aria-hidden="true" />
        </div>
      ) : (
        <div className="coach-message-avatar coach-message-avatar-user">
          {userInitials}
        </div>
      )}
      <div className="coach-message-bubble">
        <div className="coach-bubble-content">
          {message.content || (message.pending ? (
            <div className="coach-typing-dots"><span /><span /><span /></div>
          ) : "")}
        </div>

        {canShowThinking && (
          <div className="mt-2">
            <button className={`thinking-slider ${message.pending ? "thinking-slider-active" : ""}`} type="button" onClick={onToggleThinking}>
              {thinkingLabel}
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
  dashboard,
  dataLoading,
  entries,
  notice,
  setupStatus,
  themeId,
  user,
  actionLoading,
  onExportExcel,
  onImportExcel,
  onExportJson,
  onImportJson,
  onLogout,
  onReset,
  onThemeChange,
}: {
  activeTheme: AppTheme;
  dashboard: Dashboard;
  dataLoading: boolean;
  entries: RedBullEntry[];
  notice: string;
  setupStatus: SetupStatus;
  themeId: string;
  user: AuthUser;
  actionLoading: string | null;
  onExportExcel: () => void;
  onImportExcel: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
  onLogout: () => void;
  onReset: () => void;
  onThemeChange: (id: string) => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
      <div className="grid gap-4">
        <AppCard title="Account" subtitle="Your Appwrite profile and sync status">
          <div className="rounded-lg border border-white/10 bg-white/[0.05] p-4">
            <p className="text-lg font-semibold text-white">{user.name || "Appwrite user"}</p>
            <p className="mt-1 text-sm text-slate-400">{user.email}</p>
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
  onClose,
  onSave,
}: {
  open: boolean;
  entry: RedBullEntry | null;
  flavours: Flavour[];
  saving: boolean;
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
      source: entry?.source ?? "manual",
    });
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
