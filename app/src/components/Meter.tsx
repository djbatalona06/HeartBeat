interface MeterProps {
  label: string;
  value: number | null;
  max?: number;
  /**
   * What the number means in words — "Bright", "Frayed". Read out in place of
   * the digit, because on a 1-10 scale the digit alone does not say which end
   * is the good one.
   */
  valueText?: string;
}

/**
 * A vertical 1-10 meter. Reads as a column filling from the bottom, which is
 * easier to compare side by side across two people than a row of numbers.
 *
 * The fill is `value / max` rather than a position on the 1-10 scale, so the
 * lowest value keeps a visible sliver: an empty track means nothing logged,
 * and a 1 is a thing somebody said.
 */
export function Meter({ label, value, max = 10, valueText }: MeterProps) {
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div className="meter">
      <div
        className="meter-track"
        role="meter"
        aria-valuenow={value ?? undefined}
        aria-valuetext={value == null ? 'Not logged' : valueText}
        aria-valuemin={1}
        aria-valuemax={max}
        aria-label={label}
      >
        <div className="meter-fill" style={{ height: `${pct}%` }} />
      </div>
      <div className="meter-value">{value ?? '–'}</div>
      <div className="meter-label">{label}</div>
    </div>
  );
}
