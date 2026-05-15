import type { Models } from "appwrite";
import {
  Activity,
  AlertTriangle,
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
  LogIn,
  LogOut,
  Plus,
  PoundSterling,
  RefreshCcw,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
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

type AppView = "overview" | "logbook" | "trends" | "data";
type AuthMode = "login" | "signup";
type AccentTheme = "blue" | "pink";
type AuthUser = Models.User<Models.Preferences>;
type SetupStatus = { state: "checking" | "ok" | "error"; message: string };

const ACCENT_STORAGE_KEY = "red-bull-intake-tracker.accent.v1";

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
  { id: "data", label: "Data", icon: Settings2 },
];

const ACCENT_OPTIONS: Array<{ id: AccentTheme; label: string }> = [
  { id: "blue", label: "Baby blue" },
  { id: "pink", label: "Pastel pink" },
];

function App() {
  const [themeAccent, setThemeAccent] = useState<AccentTheme>(() => readStoredAccent());
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
    localStorage.setItem(ACCENT_STORAGE_KEY, themeAccent);
  }, [themeAccent]);

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
    return <LoadingScreen setupStatus={setupStatus} themeAccent={themeAccent} />;
  }

  if (!user) {
    return (
      <AuthView
        accent={themeAccent}
        authError={authError}
        busy={actionLoading === "auth" || actionLoading === "oauth"}
        setupStatus={setupStatus}
        onAccentChange={setThemeAccent}
        onLogin={login}
        onOAuth={startOAuth}
        onSignup={signup}
      />
    );
  }

  return (
    <div className="app-shell min-h-screen overflow-x-hidden bg-[#050711] text-slate-100" data-accent={themeAccent}>
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
          accent={themeAccent}
          activeView={activeView}
          dataLoading={dataLoading}
          notice={notice}
          setupStatus={setupStatus}
          user={user}
          onAccentChange={setThemeAccent}
          onChange={setActiveView}
          onLogout={() => void logout()}
        />

        <div className="min-w-0">
          <MobileNav activeView={activeView} onChange={setActiveView} />

          <TopBar
            accent={themeAccent}
            activeView={activeView}
            actionLoading={actionLoading}
            dataLoading={dataLoading}
            entries={entries}
            user={user}
            onAccentChange={setThemeAccent}
            onAdd={openNewEntry}
            onExportExcel={() => void exportExcel()}
            onImportExcel={() => excelFileInputRef.current?.click()}
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
              className="mt-4"
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
                  onQuickAdd={(item) => void quickAdd(item)}
                  onAdd={openNewEntry}
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

              {activeView === "data" && (
                <DataView
                  dashboard={dashboard}
                  entries={entries}
                  actionLoading={actionLoading}
                  onExportExcel={() => void exportExcel()}
                  onImportExcel={() => excelFileInputRef.current?.click()}
                  onExportJson={exportJson}
                  onImportJson={() => jsonFileInputRef.current?.click()}
                  onReset={() => setIsResetOpen(true)}
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

function LoadingScreen({ setupStatus, themeAccent }: { setupStatus: SetupStatus; themeAccent: AccentTheme }) {
  return (
    <div className="app-shell min-h-screen bg-[#050711] text-slate-100" data-accent={themeAccent}>
      <ShellBackdrop />
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="glass-panel w-full max-w-md p-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg border border-cyan-300/40 bg-cyan-300/10 text-cyan-200">
            <Loader2 className="animate-spin" size={24} aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">Red Bull command centre</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">{setupStatus.message}</p>
        </div>
      </div>
    </div>
  );
}

function AuthView({
  accent,
  authError,
  busy,
  setupStatus,
  onAccentChange,
  onLogin,
  onOAuth,
  onSignup,
}: {
  accent: AccentTheme;
  authError: string;
  busy: boolean;
  setupStatus: SetupStatus;
  onAccentChange: (accent: AccentTheme) => void;
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
    <div className="app-shell min-h-screen bg-[#050711] text-slate-100" data-accent={accent}>
      <ShellBackdrop />
      <main className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-6 px-4 py-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="min-w-0">
          <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-sm font-semibold text-cyan-100">
            <Cloud size={16} aria-hidden="true" />
            {setupStatus.state === "ok" ? "Appwrite sync online" : "Appwrite setup check"}
          </div>
          <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-white sm:text-6xl">
            Red Bull Tracker App
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
            Glossy intake telemetry with Appwrite authentication, device sync, and finance-grade Excel exports.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <AuthSignal icon={ShieldCheck} label="User scoped" value="Private entries" />
            <AuthSignal icon={Database} label="Database" value={appwriteConfig.databaseId} />
            <AuthSignal icon={CheckCircle2} label="Ping" value={setupStatus.state === "ok" ? "Connected" : "Check setup"} />
          </div>
          {setupStatus.state !== "ok" && (
            <div className="mt-4 rounded-lg border border-amber-300/40 bg-amber-300/10 p-3 text-sm leading-6 text-amber-100">
              {setupStatus.message}
            </div>
          )}
          <div className="mt-4 max-w-sm">
            <AccentPicker accent={accent} onChange={onAccentChange} />
          </div>
        </section>

        <section className="glass-panel p-5 sm:p-6">
          <div className="mb-5 flex rounded-md border border-white/10 bg-white/5 p-1">
            <button
              className={`flex-1 rounded px-3 py-2 text-sm font-semibold transition ${mode === "login" ? "bg-cyan-300 text-[#07101f]" : "text-slate-300 hover:bg-white/10"}`}
              type="button"
              onClick={() => setMode("login")}
            >
              Log in
            </button>
            <button
              className={`flex-1 rounded px-3 py-2 text-sm font-semibold transition ${mode === "signup" ? "bg-pink-200 text-[#07101f]" : "text-slate-300 hover:bg-white/10"}`}
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

function AccentPicker({
  accent,
  onChange,
}: {
  accent: AccentTheme;
  onChange: (accent: AccentTheme) => void;
}) {
  return (
    <div className="accent-picker" aria-label="Accent theme">
      {ACCENT_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className={accent === option.id ? "accent-picker-active" : ""}
          onClick={() => onChange(option.id)}
        >
          <span className={`accent-swatch accent-swatch-${option.id}`} aria-hidden="true" />
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Sidebar({
  accent,
  activeView,
  dataLoading,
  notice,
  setupStatus,
  user,
  onAccentChange,
  onChange,
  onLogout,
}: {
  accent: AccentTheme;
  activeView: AppView;
  dataLoading: boolean;
  notice: string;
  setupStatus: SetupStatus;
  user: AuthUser;
  onAccentChange: (accent: AccentTheme) => void;
  onChange: (view: AppView) => void;
  onLogout: () => void;
}) {
  return (
    <aside className="glass-panel sticky top-5 hidden h-[calc(100vh-2.5rem)] p-3 lg:flex lg:flex-col">
      <div className="mb-7 flex items-center gap-3 px-2 pt-1">
        <div className="can-emblem">
          <Command size={22} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">Red Bull</p>
          <p className="truncate text-xs text-cyan-100">Intake telemetry</p>
        </div>
      </div>

      <nav className="grid gap-1" aria-label="Main navigation">
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

      <div className="mt-4 px-1">
        <AccentPicker accent={accent} onChange={onAccentChange} />
      </div>

      <div className="mt-auto grid gap-3">
        <div className="rounded-lg border border-white/10 bg-white/[0.06] p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            {dataLoading ? <Loader2 className="animate-spin text-cyan-200" size={15} aria-hidden="true" /> : <Cloud className="text-cyan-200" size={15} aria-hidden="true" />}
            Sync
          </div>
          <p className="text-sm leading-5 text-slate-200">{notice}</p>
          <p className={`mt-2 text-xs ${setupStatus.state === "ok" ? "text-emerald-200" : "text-amber-200"}`}>{setupStatus.message}</p>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.06] p-3">
          <p className="truncate text-sm font-semibold text-white">{user.name || user.email || "Appwrite user"}</p>
          <p className="mt-1 truncate text-xs text-slate-400">{user.email}</p>
          <button className="secondary-button mt-3 w-full justify-center" type="button" onClick={onLogout}>
            <LogOut size={16} aria-hidden="true" />
            Log out
          </button>
        </div>
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
  accent,
  activeView,
  actionLoading,
  dataLoading,
  entries,
  user,
  onAccentChange,
  onAdd,
  onExportExcel,
  onImportExcel,
  onRefresh,
}: {
  accent: AccentTheme;
  activeView: AppView;
  actionLoading: string | null;
  dataLoading: boolean;
  entries: RedBullEntry[];
  user: AuthUser;
  onAccentChange: (accent: AccentTheme) => void;
  onAdd: () => void;
  onExportExcel: () => void;
  onImportExcel: () => void;
  onRefresh: () => void;
}) {
  const title = NAV_ITEMS.find((item) => item.id === activeView)?.label ?? "Overview";
  const subtitle = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <header className="glass-panel p-4 sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-cyan-100">
            <span>{subtitle}</span>
            <span className="rounded bg-white/10 px-2 py-1 text-xs text-slate-300">{user.email || "Synced user"}</span>
          </p>
          <h1 className="mt-1 text-4xl font-semibold tracking-tight text-white sm:text-5xl">{title}</h1>
        </div>

        <div className="flex flex-wrap gap-2">
          <AccentPicker accent={accent} onChange={onAccentChange} />
          <button className="primary-button" type="button" onClick={onAdd} disabled={Boolean(actionLoading)}>
            <Plus size={18} aria-hidden="true" />
            Add Intake
          </button>
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
  onQuickAdd,
  onAdd,
  onOpenLogbook,
}: {
  dashboard: Dashboard;
  entries: RedBullEntry[];
  insights: Insight[];
  quickAdds: typeof QUICK_ADDS;
  recentEntries: RedBullEntry[];
  chartData: Array<{ label: string; spend: number; cans: number; caffeine: number; sugar: number }>;
  flavourData: Array<{ name: string; value: number; spend: number; accent: string }>;
  onQuickAdd: (item: (typeof QUICK_ADDS)[number]) => void;
  onAdd: () => void;
  onOpenLogbook: () => void;
}) {
  return (
    <div className="grid gap-4">
      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <TodayPanel dashboard={dashboard} entries={entries} onAdd={onAdd} />
        <QuickAddPanel items={quickAdds} onQuickAdd={onQuickAdd} />
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile icon={CalendarDays} label="This Month" value={dashboard.monthCans} detail={`${dashboard.monthSpend} spent`} accent="#39d5ff" />
        <MetricTile icon={PoundSterling} label="Total Spend" value={dashboard.totalSpend} detail={`${dashboard.avgWeeklySpend} weekly average`} accent="#ffb7d9" />
        <MetricTile icon={Activity} label="Favourite" value={dashboard.favouriteFlavour} detail="by total cans" accent="#ffd84d" />
        <MetricTile icon={TimerReset} label="Days Without" value={dashboard.daysWithoutRedBull} detail={`${dashboard.currentStreak} day streak`} accent="#ff3448" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <AppCard title="Spend telemetry" subtitle="Last 30 logged days">
          {chartData.length ? (
            <ResponsiveContainer width="100%" height={280}>
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
                <Pie data={flavourData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={104} paddingAngle={4} stroke="#080d1f" strokeWidth={4}>
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
    <section className="can-panel relative overflow-hidden p-5 sm:p-7">
      <div className="absolute right-5 top-5 hidden h-24 w-16 rotate-6 rounded-[18px] border border-cyan-200/25 bg-[linear-gradient(120deg,rgba(255,255,255,0.20),rgba(57,213,255,0.14),rgba(255,52,72,0.12))] shadow-cyan sm:block" />
      <p className="text-sm font-medium uppercase tracking-[0.18em] text-cyan-100">Today</p>
      <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-7xl font-semibold tracking-tight text-white sm:text-8xl">{dashboard.todayCans}</p>
          <p className="mt-2 text-lg text-slate-300">cans logged</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[420px]">
          <MiniMetric label="Caffeine" value={dashboard.todayCaffeine} accent="#39d5ff" />
          <MiniMetric label="Sugar" value={dashboard.todaySugar} accent="#ffb7d9" />
          <MiniMetric label="Streak" value={dashboard.currentStreak} accent="#ffd84d" />
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
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
    </div>
  );
}

function DataView({
  dashboard,
  entries,
  actionLoading,
  onExportExcel,
  onImportExcel,
  onExportJson,
  onImportJson,
  onReset,
}: {
  dashboard: Dashboard;
  entries: RedBullEntry[];
  actionLoading: string | null;
  onExportExcel: () => void;
  onImportExcel: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
  onReset: () => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
      <AppCard title="Appwrite storage" subtitle={`${entries.length} entries synced for this user`}>
        <div className="grid gap-3 sm:grid-cols-3">
          <MiniMetric label="All-time cans" value={dashboard.allTimeCans} accent="#39d5ff" />
          <MiniMetric label="Total spend" value={dashboard.totalSpend} accent="#ffd84d" />
          <MiniMetric label="Favourite" value={dashboard.favouriteFlavour} accent="#ffb7d9" />
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
          </dl>
        </div>

        <button className="danger-button mt-5 justify-center" type="button" onClick={onReset} disabled={!entries.length || Boolean(actionLoading)}>
          <RotateCcw size={17} aria-hidden="true" />
          Delete all entries
        </button>
      </AppCard>

      <div className="grid gap-4">
        <AppCard title="Excel theme" subtitle="Pastel pink and Miku blue workbook">
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
  const [customAccent, setCustomAccent] = useState("#39d5ff");
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
    setCustomAccent(entry?.flavourAccent ?? "#39d5ff");
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

function readStoredAccent(): AccentTheme {
  const value = localStorage.getItem(ACCENT_STORAGE_KEY);
  return value === "pink" ? "pink" : "blue";
}

export default App;
