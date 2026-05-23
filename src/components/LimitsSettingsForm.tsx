import { Loader2, Target } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { LimitCheckResult, UserLimits } from "../types";
import { currency } from "../lib/metrics";

type LimitsSettingsFormProps = {
  limits: UserLimits;
  check: LimitCheckResult;
  saving: boolean;
  onSave: (limits: UserLimits) => void;
};

export function LimitsSettingsForm({ limits, check, saving, onSave }: LimitsSettingsFormProps) {
  const [canInput, setCanInput] = useState(limits.dailyCanLimit?.toString() ?? "");
  const [spendInput, setSpendInput] = useState(limits.dailySpendLimit?.toString() ?? "");
  const [stopInput, setStopInput] = useState(limits.stopTime ?? "");

  useEffect(() => {
    setCanInput(limits.dailyCanLimit?.toString() ?? "");
    setSpendInput(limits.dailySpendLimit?.toString() ?? "");
    setStopInput(limits.stopTime ?? "");
  }, [limits.dailyCanLimit, limits.dailySpendLimit, limits.stopTime]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: UserLimits = {};

    const canTrim = canInput.trim();
    if (canTrim) {
      const parsed = Math.max(0.25, Number(canTrim) || 0);
      if (parsed > 0) next.dailyCanLimit = parsed;
    }

    const spendTrim = spendInput.trim();
    if (spendTrim) {
      const parsed = Math.max(0, Number(spendTrim) || 0);
      next.dailySpendLimit = parsed;
    }

    if (stopInput.trim()) {
      next.stopTime = stopInput;
    }

    onSave(next);
  }

  const previewParts: string[] = [];
  if (limits.dailyCanLimit != null) {
    previewParts.push(`${check.todayCans.toFixed(1)}/${limits.dailyCanLimit} cans today`);
  }
  if (limits.dailySpendLimit != null) {
    previewParts.push(`${currency.format(check.todaySpend)} of ${currency.format(limits.dailySpendLimit)} spent today`);
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">
          <span className="font-medium text-slate-300">Cans per day</span>
          <input
            className="field-input"
            type="number"
            min={0.25}
            step={0.25}
            placeholder="e.g. 3"
            value={canInput}
            onChange={(event) => setCanInput(event.target.value)}
          />
          <span className="text-xs text-slate-500">Leave empty to remove. Counts use BST calendar days.</span>
        </label>

        <label className="grid gap-2 text-sm">
          <span className="font-medium text-slate-300">Spend per day (£)</span>
          <input
            className="field-input"
            type="number"
            min={0}
            step={0.01}
            placeholder="e.g. 5.00"
            value={spendInput}
            onChange={(event) => setSpendInput(event.target.value)}
          />
          <span className="text-xs text-slate-500">Based on price per can in your log.</span>
        </label>
      </div>

      <label className="grid gap-2 text-sm sm:max-w-xs">
        <span className="font-medium text-slate-300">Stop drinking by</span>
        <input
          className="field-input"
          type="time"
          value={stopInput}
          onChange={(event) => setStopInput(event.target.value)}
        />
        <span className="text-xs text-slate-500">Europe/London (BST/GMT). Leave empty to remove.</span>
      </label>

      {previewParts.length ? (
        <p className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-slate-300">
          Today so far: {previewParts.join(" · ")}
        </p>
      ) : null}

      <button className="primary-button w-fit" type="submit" disabled={saving}>
        {saving ? <Loader2 className="animate-spin" size={17} aria-hidden="true" /> : <Target size={17} aria-hidden="true" />}
        Save limits
      </button>
    </form>
  );
}
