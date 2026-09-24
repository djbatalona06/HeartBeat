import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import type { DayKey } from '../../domain/types';
import { Chip } from '../../ui/Chip';
import { MOOD_MAX, MOOD_METERS, MOOD_MIN, longDay, scaleWord, type MoodKey } from './mood';
import {
  TREND_SPANS,
  moodTrend,
  sharedLowLine,
  trendDays,
  trendSummary,
  type MeterTrend,
  type TrendSpan,
} from './trends';

/**
 * The last week or month, one small chart per meter.
 *
 * Small multiples rather than one chart with six lines, because the three
 * meters run in different directions (joy up is good, moody up is not) and a
 * shared axis would invite reading them against each other. Identity is never
 * colour alone: yours is a solid line in the accent, your partner's a dashed
 * one in muted ink, and the legend says which is which in words. A day nobody
 * logged breaks the line rather than bridging it, for the reason `trends.ts`
 * gives.
 */

const W = 300;
const H = 64;
const PAD = 6;

interface Props {
  memberId: string | null;
  today: DayKey;
  partnerName: string;
  paired: boolean;
}

export function MoodTrends({ memberId, today, partnerName, paired }: Props) {
  const [span, setSpan] = useState<TrendSpan>(7);
  const [first] = trendDays(today, span);

  const rows = useLiveQuery(
    () => db.moods.where('day').between(first, today, true, true).toArray(),
    [first, today],
  );
  if (!rows) return null;

  const trend = moodTrend(rows, memberId, today, span);
  const lowLine = sharedLowLine(trend);
  const showPartner = paired || trend.theirLogged > 0;

  return (
    <section className="panel mood-trends">
      <h2 className="section-title">Lately</h2>
      <div className="mood-trend-spans" role="radiogroup" aria-label="How far back">
        {TREND_SPANS.map((s) => (
          <Chip key={s} asRadio on={span === s} onClick={() => setSpan(s)}>
            {s} days
          </Chip>
        ))}
      </div>
      <p className="section-sub">{trendSummary(trend, partnerName, paired)}</p>
      {lowLine ? <p className="section-sub">{lowLine}</p> : null}

      {showPartner ? (
        <p className="mood-trend-legend">
          <span><Swatch dashed={false} /> You</span>
          <span><Swatch dashed /> {partnerName}</span>
        </p>
      ) : null}

      {MOOD_METERS.map((meter) => {
        const line = trend.meters.find((m) => m.key === meter.key)!;
        return (
          <MeterChart
            key={meter.key}
            trend={line}
            days={trend.days}
            label={meter.label}
            low={meter.low}
            high={meter.high}
            partnerName={showPartner ? partnerName : null}
          />
        );
      })}
    </section>
  );
}

function Swatch({ dashed }: { dashed: boolean }) {
  return (
    <svg width="20" height="8" aria-hidden="true" className="mood-trend-swatch">
      <line
        x1="1" y1="4" x2="19" y2="4"
        className={dashed ? 'mood-trend-theirs' : 'mood-trend-mine'}
      />
    </svg>
  );
}

const x = (i: number, n: number) => PAD + (n === 1 ? 0 : (i * (W - 2 * PAD)) / (n - 1));
const y = (v: number) => PAD + ((MOOD_MAX - v) * (H - 2 * PAD)) / (MOOD_MAX - MOOD_MIN);

/** One path per unbroken run of logged days. */
function pathOf(values: readonly (number | null)[]): string {
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v === null) { pen = false; return; }
    d += `${pen ? 'L' : 'M'}${x(i, values.length).toFixed(1)} ${y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}

interface ChartProps {
  trend: MeterTrend;
  days: DayKey[];
  label: string;
  low: string;
  high: string;
  /** Null before pairing, when there is only one line to draw. */
  partnerName: string | null;
}

function averageText(who: string, avg: number | null): string {
  return avg === null ? `${who} —` : `${who} ${avg}`;
}

function MeterChart({ trend, days, label, low, high, partnerName }: ChartProps) {
  const n = days.length;
  const key: MoodKey = trend.key;
  // A single logged day between two gaps draws no line, so it gets a dot; so
  // does every day in the week view, where there is room for them.
  const dotted = (values: readonly (number | null)[], i: number) =>
    values[i] !== null && (n <= 7 || (values[i - 1] ?? null) === null && (values[i + 1] ?? null) === null);

  const summary = [
    averageText('You', trend.mineAverage),
    partnerName ? averageText(partnerName, trend.theirAverage) : null,
  ].filter(Boolean).join(' · ');

  return (
    <figure className="mood-trend">
      <figcaption className="mood-trend-head">
        <span className="mood-trend-label">{label}</span>
        <span className="mood-trend-avg">avg {summary}</span>
      </figcaption>
      <div className="mood-trend-plot">
        <span className="mood-trend-axis" aria-hidden="true">
          <span>{high}</span>
          <span>{low}</span>
        </span>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="mood-trend-svg"
          role="img"
          aria-label={`${label} over the last ${n} days. Average: ${summary}.`}
        >
          <line x1={PAD} x2={W - PAD} y1={y(MOOD_MAX)} y2={y(MOOD_MAX)} className="mood-trend-grid" />
          <line x1={PAD} x2={W - PAD} y1={y(MOOD_MIN)} y2={y(MOOD_MIN)} className="mood-trend-grid" />
          {partnerName ? <path d={pathOf(trend.theirs)} className="mood-trend-theirs" /> : null}
          <path d={pathOf(trend.mine)} className="mood-trend-mine" />
          {days.map((day, i) => {
            const mine = trend.mine[i];
            const theirs = partnerName ? trend.theirs[i] : null;
            if (mine === null && theirs === null) return null;
            const tip = [
              longDay(day),
              mine !== null ? `You: ${scaleWord(key, mine)} (${mine})` : null,
              theirs !== null ? `${partnerName}: ${scaleWord(key, theirs)} (${theirs})` : null,
            ].filter(Boolean).join('\n');
            return (
              <g key={day}>
                {theirs !== null && dotted(trend.theirs, i) ? (
                  <circle cx={x(i, n)} cy={y(theirs)} r={4} className="mood-trend-dot-theirs" />
                ) : null}
                {mine !== null && dotted(trend.mine, i) ? (
                  <circle cx={x(i, n)} cy={y(mine)} r={4} className="mood-trend-dot-mine" />
                ) : null}
                {/* The hover target is the whole day's column, wider than any mark. */}
                <rect
                  x={x(i, n) - (W - 2 * PAD) / Math.max(1, n - 1) / 2}
                  y={0}
                  width={(W - 2 * PAD) / Math.max(1, n - 1)}
                  height={H}
                  className="mood-trend-hit"
                >
                  <title>{tip}</title>
                </rect>
              </g>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}
