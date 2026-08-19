export type StatCardIconTone = "total" | "shown" | "locations" | "latest" | "replacement";

type Props = {
  iconClass: string;
  tone: StatCardIconTone;
  ariaLabel: string;
  title?: string;
  onClick: () => void;
  /** Use when the stat row lives inside a calendar card (extra end padding). */
  disabled?: boolean;
};

/**
 * Replaces decorative stat-card icons with an accessible control that triggers filters / navigation.
 */
export const StatCardIconButton: React.FC<Props> = ({ iconClass, tone, ariaLabel, title, onClick, disabled }) => (
  <button
    type="button"
    className={`stock-stat-icon-btn stock-stat-icon-btn--${tone}`}
    aria-label={ariaLabel}
    title={title ?? ariaLabel}
    onClick={onClick}
    disabled={disabled}
  >
    <i className={`${iconClass} stock-stat-icon-inner`} aria-hidden />
  </button>
);
