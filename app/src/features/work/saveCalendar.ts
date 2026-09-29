import { db } from '../../db/database';
import { toCalendarIcs } from '../../domain/calendar/ics';
import { todayKey } from '../../domain/day';

/**
 * Hand the calendar to the phone as an .ics file, which Apple Calendar and
 * Google Calendar both open with a tap.
 *
 * Shared by the Work screen's file block and the Connections block in
 * Settings, so there is one way to make the file and one wording for when
 * there is nothing to put in it. Returns whether a file was made.
 */
export async function saveCalendarIcs(timeZone: string): Promise<boolean> {
  const rows = await db.work.toArray();
  if (rows.length === 0) return false;
  const url = URL.createObjectURL(
    new Blob([toCalendarIcs(rows)], { type: 'text/calendar;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `heartbeat-calendar-${todayKey(timeZone)}.ics`;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked late, for the reason `CalendarFile.saveFile` gives.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
