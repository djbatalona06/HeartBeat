import { useRef, useState } from 'react';
import { db } from '../../db/database';
import { putWorkEvents } from '../../db/repository';
import { parseCalendarCsv, toCalendarCsv, type CsvPreview } from '../../domain/calendar/csv';
import { todayKey } from '../../domain/day';

/**
 * The calendar's file end: a CSV in, a CSV out.
 *
 * Nothing is written until the preview has been read and agreed to. A calendar
 * export is somebody else's file, it is usually long, and a bad guess about a
 * date lands an appointment on the wrong day where nobody will look for it —
 * so the count and the refused rows go on screen first, and the button that
 * follows says what it is about to do.
 *
 * All the reading and writing of the format itself lives in
 * `domain/calendar/csv.ts`, which is pure and tested. What is left here is the
 * part only a browser can do: opening the file and handing one back.
 */

const MAX_SHOWN_PROBLEMS = 4;

export function CalendarFile({ memberId, timeZone }: { memberId: string | null; timeZone: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [fileName, setFileName] = useState('');
  const [known, setKnown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const clear = () => {
    setPreview(null);
    setFileName('');
    setKnown(0);
    // Without this the same file picked twice fires no change event at all.
    if (input.current) input.current.value = '';
  };

  const pick = async (file: File | undefined) => {
    if (!file || !memberId) return;
    setNote(null);
    setBusy(true);
    try {
      const text = await readFile(file);
      const next = parseCalendarCsv(text, { memberId, timeZone });
      const rows = await db.work.bulkGet(next.events.map((e) => e.id));
      setKnown(rows.filter(Boolean).length);
      setPreview(next);
      setFileName(file.name);
    } catch {
      clear();
      setNote('That file would not open. A .csv exported from your calendar is what this wants.');
    } finally {
      setBusy(false);
    }
  };

  const bringIn = async () => {
    if (!preview || !memberId) return;
    setBusy(true);
    try {
      await putWorkEvents(
        memberId,
        preview.events.map((event) => ({
          id: event.id,
          day: event.day,
          title: event.title,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          source: 'import' as const,
        })),
      );
      const added = preview.events.length - known;
      setNote(
        added === 0
          ? `Nothing new — all ${known} of those were already here.`
          : known > 0
            ? `${count(added, 'new event')} added, ${known} already here.`
            : `${count(added, 'event')} added.`,
      );
      clear();
    } catch {
      setNote('Something went wrong writing those in. Nothing was changed — try once more.');
    } finally {
      setBusy(false);
    }
  };

  const build = async (): Promise<string | null> => {
    const rows = await db.work.toArray();
    if (rows.length === 0) {
      setNote('There is nothing on the calendar to save yet.');
      return null;
    }
    return toCalendarCsv(rows);
  };

  const saveFile = async () => {
    setBusy(true);
    try {
      const csv = await build();
      if (!csv) return;
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `heartbeat-calendar-${todayKey(timeZone)}.csv`;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoked late: an installed PWA can take a moment to pick the file up,
      // and a URL let go too early downloads nothing at all.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setNote('Saved. Look in your downloads for heartbeat-calendar.');
    } catch {
      setNote('This phone would not save a file. Copying it should still work.');
    } finally {
      setBusy(false);
    }
  };

  // iOS in particular can refuse a download outright from an installed app, so
  // there is always a way out that does not involve the file system.
  const copyOut = async () => {
    setBusy(true);
    try {
      const csv = await build();
      if (!csv) return;
      await navigator.clipboard.writeText(csv);
      setNote('Copied. Paste it into a file, or straight into your calendar.');
    } catch {
      setNote('Copying was blocked here. Saving it as a file should still work.');
    } finally {
      setBusy(false);
    }
  };

  const shown = preview?.problems.slice(0, MAX_SHOWN_PROBLEMS) ?? [];
  const hidden = (preview?.problems.length ?? 0) - shown.length;

  return (
    <section className="cal-file">
      <h2 className="section-title">The calendar as a file</h2>
      <p className="section-sub">
        Bring in an export from your own calendar, or take this one with you.
      </p>

      {preview ? (
        <div className="cal-preview" data-empty={preview.events.length === 0 ? 'true' : undefined}>
          <p className="cal-preview-name">{fileName}</p>
          <p className="cal-preview-count">
            {preview.events.length === 0
              ? 'Nothing in here we could read.'
              : `${count(preview.events.length, 'event')} ready.`}
          </p>
          {known > 0 ? (
            <p className="cal-preview-note">
              {known} already on the calendar — those rows are refreshed from the file.
            </p>
          ) : null}
          {preview.duplicates > 0 ? (
            <p className="cal-preview-note">{count(preview.duplicates, 'repeated row')} folded together.</p>
          ) : null}

          {preview.problems.length > 0 ? (
            <>
              <p className="cal-preview-note">
                {count(preview.problems.length, 'row')} we would rather not guess at:
              </p>
              <ul className="cal-problems">
                {shown.map((problem, i) => (
                  <li key={`${problem.line}-${i}`} className="cal-problem">
                    <span className="cal-problem-line">Line {problem.line}</span>
                    <span className="cal-problem-why">{problem.reason}</span>
                  </li>
                ))}
                {hidden > 0 ? <li className="cal-problem">and {hidden} more.</li> : null}
              </ul>
            </>
          ) : null}

          <div className="row">
            <button
              type="button"
              className="primary"
              disabled={busy || preview.events.length === 0}
              onClick={() => void bringIn()}
            >
              Bring them in
            </button>
            <button type="button" className="quiet" onClick={clear}>Not now</button>
          </div>
        </div>
      ) : (
        <div className="cal-file-actions">
          <label className="cal-file-pick" data-busy={busy ? 'true' : undefined}>
            Choose a file
            <input
              ref={input}
              className="cal-file-input"
              type="file"
              accept=".csv,text/csv,text/comma-separated-values"
              disabled={busy || !memberId}
              onChange={(e) => void pick(e.target.files?.[0])}
            />
          </label>
          <div className="row">
            <button type="button" className="quiet" disabled={busy} onClick={() => void saveFile()}>
              Save a copy
            </button>
            <button type="button" className="quiet" disabled={busy} onClick={() => void copyOut()}>
              Copy it instead
            </button>
          </div>
        </div>
      )}

      {note ? <p className="cal-file-note" role="status">{note}</p> : null}
    </section>
  );
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** `File.text()` where it exists, and the older reader where it does not. */
function readFile(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('could not read the file'));
    reader.readAsText(file);
  });
}
