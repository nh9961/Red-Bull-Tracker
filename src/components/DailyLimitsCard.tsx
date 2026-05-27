import { Settings2 } from "lucide-react";
import type { LimitCheckResult, UserLimits } from "../types";
import { currency } from "../lib/metrics";
import { formatStopTimeLabel, hasAnyLimit, limitProgress } from "../lib/userLimits";

type DailyLimitsCardProps = {
  limits: UserLimits;
  check: LimitCheckResult;
  onOpenSettings: () => void;
};

export function DailyLimitsCard({ limits, check, onOpenSettings }: DailyLimitsCardProps) {
  if (!hasAnyLimit(limits)) {
    return (
      <section className="limits-card glass-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="section-kicker">Daily limits</p>
            <p className="section-meta mt-2 max-w-xl leading-6">
              Set how many cans you want per day, when to stop, and a spend cap. Limits are optional and stored on your
              account.
            </p>
          </div>
          <button className="secondary-button shrink-0" type="button" onClick={onOpenSettings}>
            <Settings2 size={17} aria-hidden="true" />
            Set limits
          </button>
        </div>
      </section>
    );
  }

  const canOver = check.violations.includes("cans");
  const spendOver = check.violations.includes("spend");
  const stopActive = limits.stopTime && check.pastStopTime;

  return (
    <section className="limits-card glass-panel p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="section-kicker">Daily limits</p>
        <button className="list-button !min-h-9 !px-3 !py-1.5 text-xs" type="button" onClick={onOpenSettings}>
          <Settings2 size={14} aria-hidden="true" />
          Edit
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {limits.dailyCanLimit != null ? (
          <LimitRow
            label="Cans today"
            value={`${check.todayCans.toFixed(1)} / ${limits.dailyCanLimit}`}
            progress={limitProgress(check.todayCans, limits.dailyCanLimit)}
            state={canOver ? "over" : check.todayCans >= limits.dailyCanLimit * 0.75 ? "warn" : "ok"}
          />
        ) : null}

        {limits.dailySpendLimit != null ? (
          <LimitRow
            label="Spend today"
            value={`${currency.format(check.todaySpend)} / ${currency.format(limits.dailySpendLimit)}`}
            progress={limitProgress(check.todaySpend, limits.dailySpendLimit)}
            state={spendOver ? "over" : check.todaySpend >= limits.dailySpendLimit * 0.75 ? "warn" : "ok"}
          />
        ) : null}

        {limits.stopTime ? (
          <div className={`limit-row limit-row--${stopActive ? "over" : "ok"}`}>
            <div className="limit-row-head">
              <span>Stop by</span>
              <strong>{formatStopTimeLabel(limits.stopTime)}</strong>
            </div>
            <p className="limit-row-value">
              {stopActive ? "Past your stop time" : "Still within your window"}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function LimitRow({
  label,
  value,
  progress,
  state,
}: {
  label: string;
  value: string;
  progress: number;
  state: "ok" | "warn" | "over";
}) {
  return (
    <div className={`limit-row limit-row--${state}`}>
      <div className="limit-row-head">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="limit-progress" aria-hidden="true">
        <div className="limit-progress-fill" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
