import type { Ref } from "react";
import { ProcurementCalendarPopover } from "./ProcurementCalendarPopover";
import { formatIsoDateForLocale } from "../utils/dateFilter";

export type StatCardDateFilterLabels = {
  pickAria: string;
  /** Small × chip beside calendar */
  clearChip: string;
  /** "Clear" in popover footer */
  popoverClear: string;
  today: string;
  dialogAria: string;
  filteredSub: string;
  defaultSub: string;
};

type Props = {
  wrapRef: Ref<HTMLDivElement>;
  calendarOpen: boolean;
  setCalendarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  dateFilter: string;
  setDateFilter: React.Dispatch<React.SetStateAction<string>>;
  uiLang: "en" | "ar";
  cardTitle: string;
  /** Value when no calendar day is selected (e.g. latest date string or "—") */
  idleValue: string;
  labels: StatCardDateFilterLabels;
};

export const StatCardDateFilter: React.FC<Props> = ({
  wrapRef,
  calendarOpen,
  setCalendarOpen,
  dateFilter,
  setDateFilter,
  uiLang,
  cardTitle,
  idleValue,
  labels,
}) => {
  const valueDisplay = dateFilter ? formatIsoDateForLocale(dateFilter, uiLang) : idleValue;
  const subDisplay = dateFilter ? labels.filteredSub : labels.defaultSub;

  return (
    <div className="stock-stat-card stat-latest stock-stat-card--calendar" ref={wrapRef}>
      <div className="stock-stat-title">{cardTitle}</div>
      <div className="stock-stat-value stock-stat-value-small">{valueDisplay}</div>
      <div className="stock-stat-sub">{subDisplay}</div>
      <button
        type="button"
        className="stock-stat-calendar-btn"
        onClick={() => setCalendarOpen((o) => !o)}
        aria-expanded={calendarOpen}
        aria-haspopup="dialog"
        aria-label={labels.pickAria}
        title={labels.pickAria}
      >
        <i className="bi bi-calendar3" aria-hidden />
      </button>
      {dateFilter ? (
        <button
          type="button"
          className="stock-stat-clear-date-btn"
          onClick={() => setDateFilter("")}
          aria-label={labels.clearChip}
          title={labels.clearChip}
        >
          <i className="bi bi-x-lg" aria-hidden />
        </button>
      ) : null}
      <ProcurementCalendarPopover
        open={calendarOpen}
        value={dateFilter}
        onChange={(iso) => setDateFilter(iso)}
        onClearFilter={() => setDateFilter("")}
        onClose={() => setCalendarOpen(false)}
        locale={uiLang}
        labels={{
          clear: labels.popoverClear,
          today: labels.today,
          dialogAria: labels.dialogAria,
        }}
      />
    </div>
  );
};
