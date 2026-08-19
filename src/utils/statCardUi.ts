const PULSE_MS = 1500;

/** Brief teal border / shadow pulse for toolbars, tables, or cards. */
export function pulseHighlight(el: HTMLElement | null | undefined) {
  if (!el) return;
  el.classList.add("ui-pulse-highlight");
  window.setTimeout(() => el.classList.remove("ui-pulse-highlight"), PULSE_MS);
}

export function scrollToElement(el: HTMLElement | null | undefined, block: ScrollLogicalPosition = "center") {
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block });
}

/**
 * Scroll to `.stock-toolbar` within a page root, pulse it, and focus the search field.
 */
export function openFiltersInView(pageRoot: HTMLElement | null | undefined) {
  const el = pageRoot?.querySelector<HTMLElement>(".stock-toolbar");
  if (!el) return;
  scrollToElement(el, "center");
  pulseHighlight(el);
  window.setTimeout(() => {
    const input = el.querySelector<HTMLInputElement>(".stock-search-input");
    input?.focus();
  }, 350);
}

/**
 * Scroll to the first results table wrapper (or table) and pulse.
 */
export function openTableInView(pageRoot: HTMLElement | null | undefined) {
  const wrap = pageRoot?.querySelector<HTMLElement>(".table-wrapper");
  if (wrap) {
    scrollToElement(wrap, "start");
    pulseHighlight(wrap);
    return;
  }
  const table = pageRoot?.querySelector<HTMLElement>("table.data-table");
  if (table) {
    const parent = table.closest<HTMLElement>(".table-wrapper") ?? table.parentElement ?? table;
    scrollToElement(parent, "start");
    pulseHighlight(parent);
  }
}
