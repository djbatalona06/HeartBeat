interface MeterProps {
  label: string;
  value: number | null;
  max?: number;
}

/**
 * A vertical 1-10 meter. Reads as a column filling from the bottom, which is
 * easier to compare side by side across two people than a row of numbers.
 */
export function Meter({ label, value, max = 10 }: MeterProps) {
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div className="meter">
      <div
        className="meter-track"
        role="meter"
        aria-valuenow={value ?? undefined}
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
