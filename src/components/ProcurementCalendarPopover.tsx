import { useEffect, useMemo, useState, type FC } from "react";

export type ProcurementCalendarLocale = "en" | "ar";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function isoFromDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseIsoToLocalDate(iso: string): Date | null {
  const m = String(iso || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(da)) return null;
  const d = new Date(y, mo - 1, da);
  if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== da) return null;
  return d;
}

type DayCell = { label: number; iso: string; muted: boolean };

function buildCalendarCells(year: number, monthIndex: number): DayCell[] {
  const first = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const startWeekday = first.getDay();
  const prevMonthDays = new Date(year, monthIndex, 0).getDate();
  const cells: DayCell[] = [];

  for (let i = 0; i < startWeekday; i++) {
    const day = prevMonthDays - startWeekday + 1 + i;
    const d = new Date(year, monthIndex - 1, day);
    cells.push({ label: day, iso: isoFromDate(d), muted: true });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, monthIndex, day);
    cells.push({ label: day, iso: isoFromDate(d), muted: false });
  }
  let next = 1;
  while (cells.length % 7 !== 0) {
    const d = new Date(year, monthIndex + 1, next);
    cells.push({ label: next, iso: isoFromDate(d), muted: true });
    next++;
  }
  return cells;
}

type Props = {
  open: boolean;
  value: string;
  onChange: (iso: string) => void;
  onClearFilter: () => void;
  onClose: () => void;
  locale: ProcurementCalendarLocale;
  labels: {
    clear: string;
    today: string;
    dialogAria: string;
  };
};

export const ProcurementCalendarPopover: FC<Props> = ({
  open,
  value,
  onChange,
  onClearFilter,
  onClose,
  locale,
  labels,
}) => {
  const [cursor, setCursor] = useState(() => new Date());

  useEffect(() => {
    if (!open) return;
    const parsed = value ? parseIsoToLocalDate(value) : null;
    if (parsed) {
      setCursor(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
    } else {
      const n = new Date();
      setCursor(new Date(n.getFullYear(), n.getMonth(), 1));
    }
  }, [open, value]);

  const todayIso = isoFromDate(new Date());

  const dowLabels = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", { weekday: "short" });
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 7 + i)));
  }, [locale]);

  const monthTitle = useMemo(() => {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", { month: "long", year: "numeric" }).format(cursor);
  }, [cursor, locale]);

  const cells = useMemo(
    () => buildCalendarCells(cursor.getFullYear(), cursor.getMonth()),
    [cursor]
  );

  if (!open) return null;

  const prevMonth = () => {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1));
  };
  const nextMonth = () => {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1));
  };

  const selectIso = (iso: string) => {
    onChange(iso);
    onClose();
  };

  const handleToday = () => {
    onChange(todayIso);
    onClose();
  };

  const handleClear = () => {
    onClearFilter();
    onClose();
  };

  return (
    <div
      className="stock-procurement-calendar-popover"
      role="dialog"
      aria-modal="true"
      aria-label={labels.dialogAria}
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      <div className="stock-procurement-calendar-popover-inner">
        <div className="stock-procurement-calendar-header">
          <button type="button" className="stock-procurement-calendar-nav" onClick={prevMonth} aria-label="Previous month">
            <i className="bi bi-chevron-up" aria-hidden />
          </button>
          <div className="stock-procurement-calendar-title">{monthTitle}</div>
          <button type="button" className="stock-procurement-calendar-nav" onClick={nextMonth} aria-label="Next month">
            <i className="bi bi-chevron-down" aria-hidden />
          </button>
        </div>

        <div className="stock-procurement-calendar-dow" aria-hidden>
          {dowLabels.map((d) => (
            <span key={d} className="stock-procurement-calendar-dow-cell">
              {d}
            </span>
          ))}
        </div>

        <div className="stock-procurement-calendar-grid">
          {cells.map((cell, idx) => {
            const isSelected = Boolean(value && cell.iso === value);
            const isToday = cell.iso === todayIso;
            return (
              <button
                key={`${cell.iso}-${idx}`}
                type="button"
                className={[
                  "stock-procurement-calendar-day",
                  cell.muted ? "is-muted" : "",
                  isSelected ? "is-selected" : "",
                  isToday && !isSelected ? "is-today" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => selectIso(cell.iso)}
              >
                {cell.label}
              </button>
            );
          })}
        </div>

        <div className="stock-procurement-calendar-footer">
          <button type="button" className="stock-procurement-calendar-link" onClick={handleClear}>
            {labels.clear}
          </button>
          <button type="button" className="stock-procurement-calendar-link stock-procurement-calendar-link-today" onClick={handleToday}>
            {labels.today}
          </button>
        </div>
      </div>
    </div>
  );
};
