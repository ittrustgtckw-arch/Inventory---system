import { useEffect, useRef, useState } from "react";

/** Shared open state, optional date filter string (YYYY-MM-DD), wrap ref, and document listeners for stat-card calendars. */
export function useDateFilterCalendar() {
  const [dateFilter, setDateFilter] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!calendarOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (el && !el.contains(e.target as Node)) setCalendarOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCalendarOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [calendarOpen]);

  return { dateFilter, setDateFilter, calendarOpen, setCalendarOpen, wrapRef };
}
