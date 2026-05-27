import { useMemo, useState } from "react";
import { ArrowRight, Check, ChevronLeft } from "lucide-react";
import { APP_THEMES } from "../data/themes";
import { currency } from "../lib/metrics";
import type { UserLimits } from "../types";

type OnboardingScreenProps = {
  onSave: (limits: UserLimits, themeId: string) => Promise<void>;
  onClose: () => void;
  activeThemeId: string;
  onThemeChange: (themeId: string) => void;
  userName?: string;
};

const STEP_COUNT = 6;

const curfewOptions: Array<{ id: string; label: string; hint: string }> = [
  { id: "16:00", label: "4:00 PM", hint: "Early cut-off" },
  { id: "18:00", label: "6:00 PM", hint: "Balanced default" },
  { id: "20:00", label: "8:00 PM", hint: "Late schedule" },
  { id: "none", label: "No curfew", hint: "Only track intake" },
];

export function OnboardingScreen({
  onSave,
  onClose,
  activeThemeId,
  onThemeChange,
  userName,
}: OnboardingScreenProps) {
  const [step, setStep] = useState(1);
  const [dailyCanLimit, setDailyCanLimit] = useState<number | "none">(2);
  const [dailySpendLimit, setDailySpendLimit] = useState<number | "none">(3.5);
  const [stopTime, setStopTime] = useState<string | "none">("18:00");
  const [saving, setSaving] = useState(false);
  const activeTheme = useMemo(() => {
    return APP_THEMES.find((theme) => theme.id === activeThemeId) ?? APP_THEMES[0];
  }, [activeThemeId]);

  const progress = `${(step / STEP_COUNT) * 100}%`;

  async function handleFinish() {
    setSaving(true);
    try {
      const limits: UserLimits = {};
      if (dailyCanLimit !== "none") limits.dailyCanLimit = dailyCanLimit;
      if (dailySpendLimit !== "none") limits.dailySpendLimit = dailySpendLimit;
      if (stopTime !== "none") limits.stopTime = stopTime;

      await onSave(limits, activeThemeId);
      onClose();
    } catch (err) {
      console.error("setup save failed", err);
    } finally {
      setSaving(false);
    }
  }

  function incrementCans() {
    if (dailyCanLimit === "none") {
      setDailyCanLimit(1);
      return;
    }
    if (dailyCanLimit < 10) setDailyCanLimit(Number((dailyCanLimit + 0.5).toFixed(1)));
  }

  function decrementCans() {
    if (dailyCanLimit === "none") return;
    if (dailyCanLimit <= 0.5) {
      setDailyCanLimit("none");
      return;
    }
    setDailyCanLimit(Number((dailyCanLimit - 0.5).toFixed(1)));
  }

  function incrementSpend() {
    if (dailySpendLimit === "none") {
      setDailySpendLimit(1);
      return;
    }
    if (dailySpendLimit < 30) setDailySpendLimit(Number((dailySpendLimit + 0.5).toFixed(2)));
  }

  function decrementSpend() {
    if (dailySpendLimit === "none") return;
    if (dailySpendLimit <= 0.5) {
      setDailySpendLimit("none");
      return;
    }
    setDailySpendLimit(Number((dailySpendLimit - 0.5).toFixed(2)));
  }

  function goNext() {
    setStep((current) => Math.min(current + 1, STEP_COUNT));
  }

  function goBack() {
    setStep((current) => Math.max(current - 1, 1));
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex min-h-screen flex-col overflow-y-auto px-5 py-6 sm:px-8"
      style={{
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "inherit",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--primary-container) 24%, transparent), transparent 36%)",
        }}
      />

      <header className="relative z-10 mx-auto flex w-full max-w-3xl items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-3 h-1 overflow-hidden rounded-full bg-[var(--surface-container-high)]">
            <div className="h-full rounded-full bg-[var(--primary)] transition-all duration-500" style={{ width: progress }} />
          </div>
          <p className="text-xs font-normal uppercase tracking-[0.18em] text-[var(--muted)]">
            step {step} of {STEP_COUNT}
          </p>
        </div>
        <p className="hidden text-xs font-normal text-[var(--muted)] sm:block">Red Bull tracker</p>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center py-10 sm:py-16">
        {step === 1 && (
          <section className="grid gap-9">
            <div className="grid gap-5">
              <p className="text-sm font-normal text-[var(--primary)]">setup</p>
              <h1 className="max-w-2xl text-5xl font-normal leading-[0.95] tracking-[-0.055em] sm:text-7xl">
                Hey {userName || "there"}. Set your baseline.
              </h1>
              <p className="max-w-xl text-lg font-normal leading-8 text-[var(--muted)]">
                Pick a theme, then set optional limits for cans, spend, and time.
              </p>
            </div>
            <button
              type="button"
              onClick={goNext}
              className="inline-flex min-h-12 w-fit items-center gap-3 rounded-full px-6 text-sm font-medium transition active:scale-[0.98]"
              style={{ background: "var(--primary)", color: "var(--on-primary)" }}
            >
              Start
              <ArrowRight size={16} />
            </button>
          </section>
        )}

        {step === 2 && (
          <section className="grid gap-8">
            <div className="grid gap-4">
              <p className="text-sm font-normal text-[var(--primary)]">theme</p>
              <h2 className="max-w-2xl text-4xl font-normal leading-tight tracking-[-0.04em] sm:text-6xl">
                Choose the app color.
              </h2>
            </div>

            <div className="grid max-h-[48vh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {APP_THEMES.map((theme) => {
                const isActive = activeThemeId === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => onThemeChange(theme.id)}
                    className="flex min-h-16 items-center justify-between rounded-2xl border px-4 text-left text-sm font-normal transition"
                    style={{
                      background: isActive ? "var(--surface-container-low)" : "var(--surface-container-lowest)",
                      borderColor: isActive ? "var(--primary)" : "var(--outline-variant)",
                      color: "var(--text)",
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="h-6 w-6 shrink-0 rounded-full border border-white/40" style={{ background: theme.swatch }} />
                      <span className="truncate">{theme.label}</span>
                    </span>
                    {isActive && <Check size={16} style={{ color: "var(--primary)" }} />}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={goNext}
              className="inline-flex min-h-12 w-fit items-center gap-3 rounded-full px-6 text-sm font-medium transition active:scale-[0.98]"
              style={{ background: "var(--primary)", color: "var(--on-primary)" }}
            >
              Continue
              <ArrowRight size={16} />
            </button>
          </section>
        )}

        {step === 3 && (
          <section className="grid gap-9">
            <div className="grid gap-4">
              <p className="text-sm font-normal text-[var(--primary)]">daily cans</p>
              <h2 className="max-w-2xl text-4xl font-normal leading-tight tracking-[-0.04em] sm:text-6xl">
                What is your daily can ceiling?
              </h2>
              <p className="max-w-lg text-base leading-7 text-[var(--muted)]">
                The app warns before saving an entry over this number. You can change it later.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-5">
              <button
                type="button"
                onClick={decrementCans}
                className="grid h-12 w-12 place-items-center rounded-full border text-2xl font-normal transition active:scale-95"
                style={{ borderColor: "var(--outline-variant)", color: "var(--text)" }}
              >
                -
              </button>
              <div className="min-w-44">
                <p className="text-7xl font-normal leading-none tracking-[-0.06em] sm:text-8xl" style={{ color: "var(--primary)" }}>
                  {dailyCanLimit === "none" ? "No cap" : dailyCanLimit}
                </p>
                <p className="mt-3 text-sm font-normal text-[var(--muted)]">
                  {dailyCanLimit === "none" ? "Unlimited daily volume" : dailyCanLimit === 1 ? "can per day" : "cans per day"}
                </p>
              </div>
              <button
                type="button"
                onClick={incrementCans}
                className="grid h-12 w-12 place-items-center rounded-full border text-2xl font-normal transition active:scale-95"
                style={{ borderColor: "var(--outline-variant)", color: "var(--text)" }}
              >
                +
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDailyCanLimit("none")}
                className="rounded-full border px-4 py-2 text-sm font-normal transition"
                style={{
                  background: dailyCanLimit === "none" ? "var(--primary-container)" : "var(--surface-container-lowest)",
                  borderColor: dailyCanLimit === "none" ? "var(--primary)" : "var(--outline-variant)",
                  color: dailyCanLimit === "none" ? "var(--on-primary-container)" : "var(--muted)",
                }}
              >
                No daily cap
              </button>
              {dailyCanLimit === "none" && (
                <button
                  type="button"
                  onClick={() => setDailyCanLimit(2)}
                  className="rounded-full border px-4 py-2 text-sm font-normal transition"
                  style={{ borderColor: "var(--outline-variant)", color: "var(--text)" }}
                >
                  Use 2 cans
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={goNext}
              className="inline-flex min-h-12 w-fit items-center gap-3 rounded-full px-6 text-sm font-medium transition active:scale-[0.98]"
              style={{ background: "var(--primary)", color: "var(--on-primary)" }}
            >
              Continue
              <ArrowRight size={16} />
            </button>
          </section>
        )}

        {step === 4 && (
          <section className="grid gap-9">
            <div className="grid gap-4">
              <p className="text-sm font-normal text-[var(--primary)]">daily spend</p>
              <h2 className="max-w-2xl text-4xl font-normal leading-tight tracking-[-0.04em] sm:text-6xl">
                Set a daily spend line.
              </h2>
              <p className="max-w-lg text-base leading-7 text-[var(--muted)]">
                Useful if you want a spending line for the day.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-5">
              <button
                type="button"
                onClick={decrementSpend}
                className="grid h-12 w-12 place-items-center rounded-full border text-2xl font-normal transition active:scale-95"
                style={{ borderColor: "var(--outline-variant)", color: "var(--text)" }}
              >
                -
              </button>
              <div className="min-w-52">
                <p className="text-7xl font-normal leading-none tracking-[-0.06em] sm:text-8xl" style={{ color: "var(--primary)" }}>
                  {dailySpendLimit === "none" ? "No cap" : currency.format(dailySpendLimit)}
                </p>
                <p className="mt-3 text-sm font-normal text-[var(--muted)]">
                  {dailySpendLimit === "none" ? "No daily budget" : "maximum per day"}
                </p>
              </div>
              <button
                type="button"
                onClick={incrementSpend}
                className="grid h-12 w-12 place-items-center rounded-full border text-2xl font-normal transition active:scale-95"
                style={{ borderColor: "var(--outline-variant)", color: "var(--text)" }}
              >
                +
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDailySpendLimit("none")}
                className="rounded-full border px-4 py-2 text-sm font-normal transition"
                style={{
                  background: dailySpendLimit === "none" ? "var(--primary-container)" : "var(--surface-container-lowest)",
                  borderColor: dailySpendLimit === "none" ? "var(--primary)" : "var(--outline-variant)",
                  color: dailySpendLimit === "none" ? "var(--on-primary-container)" : "var(--muted)",
                }}
              >
                No spend cap
              </button>
              {dailySpendLimit === "none" && (
                <button
                  type="button"
                  onClick={() => setDailySpendLimit(3.5)}
                  className="rounded-full border px-4 py-2 text-sm font-normal transition"
                  style={{ borderColor: "var(--outline-variant)", color: "var(--text)" }}
                >
                  Use £3.50
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={goNext}
              className="inline-flex min-h-12 w-fit items-center gap-3 rounded-full px-6 text-sm font-medium transition active:scale-[0.98]"
              style={{ background: "var(--primary)", color: "var(--on-primary)" }}
            >
              Continue
              <ArrowRight size={16} />
            </button>
          </section>
        )}

        {step === 5 && (
          <section className="grid gap-8">
            <div className="grid gap-4">
              <p className="text-sm font-normal text-[var(--primary)]">time limit</p>
              <h2 className="max-w-2xl text-4xl font-normal leading-tight tracking-[-0.04em] sm:text-6xl">
                When should the app warn you?
              </h2>
              <p className="max-w-lg text-base leading-7 text-[var(--muted)]">
                Pick a time. The app will warn when an entry is later than this.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {curfewOptions.map((timeOption) => {
                const isSelected = stopTime === timeOption.id;
                return (
                  <button
                    key={timeOption.id}
                    type="button"
                    onClick={() => setStopTime(timeOption.id)}
                    className="flex min-h-20 items-center justify-between rounded-2xl border px-4 text-left transition"
                    style={{
                      background: isSelected ? "var(--surface-container-low)" : "var(--surface-container-lowest)",
                      borderColor: isSelected ? "var(--primary)" : "var(--outline-variant)",
                    }}
                  >
                    <span>
                      <span className="block text-lg font-normal text-[var(--text)]">{timeOption.label}</span>
                      <span className="mt-1 block text-sm font-normal text-[var(--muted)]">{timeOption.hint}</span>
                    </span>
                    {isSelected && <Check size={16} style={{ color: "var(--primary)" }} />}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={goNext}
              className="inline-flex min-h-12 w-fit items-center gap-3 rounded-full px-6 text-sm font-medium transition active:scale-[0.98]"
              style={{ background: "var(--primary)", color: "var(--on-primary)" }}
            >
              Review
              <ArrowRight size={16} />
            </button>
          </section>
        )}

        {step === 6 && (
          <section className="grid gap-8">
            <div className="grid gap-4">
              <p className="text-sm font-normal text-[var(--primary)]">done</p>
              <h2 className="max-w-2xl text-4xl font-normal leading-tight tracking-[-0.04em] sm:text-6xl">
                This is your tracking profile.
              </h2>
            </div>

            <div className="grid max-w-xl gap-3 rounded-3xl border p-5" style={{ background: "var(--surface-container-lowest)", borderColor: "var(--outline-variant)" }}>
              <div className="flex items-center justify-between gap-4 border-b pb-3" style={{ borderColor: "var(--outline-variant)" }}>
                <span className="text-sm font-normal text-[var(--muted)]">Theme</span>
                <span className="flex items-center gap-2 text-sm font-normal text-[var(--text)]">
                  <span className="h-3 w-3 rounded-full" style={{ background: activeTheme.swatch }} />
                  {activeTheme.label}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 border-b pb-3" style={{ borderColor: "var(--outline-variant)" }}>
                <span className="text-sm font-normal text-[var(--muted)]">Daily cans</span>
                <span className="text-sm font-normal text-[var(--text)]">
                  {dailyCanLimit === "none" ? "No cap" : `${dailyCanLimit} ${dailyCanLimit === 1 ? "can" : "cans"}`}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 border-b pb-3" style={{ borderColor: "var(--outline-variant)" }}>
                <span className="text-sm font-normal text-[var(--muted)]">Daily spend</span>
                <span className="text-sm font-normal text-[var(--text)]">
                  {dailySpendLimit === "none" ? "No cap" : currency.format(dailySpendLimit)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-normal text-[var(--muted)]">Caffeine curfew</span>
                <span className="text-sm font-normal text-[var(--text)]">{stopTime === "none" ? "No curfew" : stopTime}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleFinish()}
              disabled={saving}
              className="inline-flex min-h-12 w-fit items-center gap-3 rounded-full px-6 text-sm font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: "var(--primary)", color: "var(--on-primary)" }}
            >
              {saving ? "Saving..." : "Start tracking"}
              {!saving && <ArrowRight size={16} />}
            </button>
          </section>
        )}
      </main>

      <footer className="relative z-10 mx-auto flex w-full max-w-3xl items-center justify-between gap-4 pb-2">
        {step > 1 ? (
          <button
            type="button"
            onClick={goBack}
            disabled={saving}
            className="inline-flex min-h-10 items-center gap-2 text-sm font-normal text-[var(--muted)] transition hover:text-[var(--text)] disabled:opacity-50"
          >
            <ChevronLeft size={16} />
            Back
          </button>
        ) : (
          <span />
        )}
        <p className="text-xs font-normal text-[var(--muted)]">you can edit this later.</p>
      </footer>
    </div>
  );
}
