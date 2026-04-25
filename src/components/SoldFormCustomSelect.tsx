import { useEffect, useId, useRef, useState } from "react";

export type SoldFormSelectOption = { value: string; label: string };

type Props = {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
  /** When set, empty `value` shows this on the trigger; list omits a fake “empty” row. */
  placeholder?: string;
  options: SoldFormSelectOption[];
};

/** Custom listbox: native select popups use OS styling and cannot be themed reliably in CSS. */
export function SoldFormCustomSelect({ id, value, onChange, required, placeholder, options }: Props) {
  const autoId = useId();
  const listId = `${autoId}-list`;
  const triggerId = id ?? `${autoId}-trigger`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const showPlaceholder = Boolean(placeholder) && !String(value || "").trim();
  const resolvedPlaceholder = placeholder ?? "";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const triggerLabel = showPlaceholder ? resolvedPlaceholder : options.find((o) => o.value === value)?.label ?? value;

  return (
    <div className="sold-custom-select" ref={rootRef}>
      <button
        id={triggerId}
        type="button"
        className={`sold-custom-select-trigger${showPlaceholder ? " is-placeholder" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
      >
        <span className="sold-custom-select-value text-truncate">{triggerLabel}</span>
        <i className={`bi bi-chevron-down sold-custom-select-chevron${open ? " is-open" : ""}`} aria-hidden />
      </button>
      {open ? (
        <ul id={listId} className="sold-custom-select-list" role="listbox" aria-labelledby={triggerId}>
          {options.map((opt) => (
            <li key={opt.value} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={value === opt.value}
                className={`sold-custom-select-option${value === opt.value ? " is-selected" : ""}`}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <select
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden
        value={value}
        required={required}
        onChange={() => {}}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
