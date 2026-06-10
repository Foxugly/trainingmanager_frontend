import { TeamStats } from '../../../api/model/team-stats';

/**
 * Quote a CSV field per RFC 4180: wrap in double quotes and double any
 * embedded quotes whenever the value contains a comma, quote or newline.
 * `null` / `undefined` become an empty field.
 *
 * Before quoting, any text value that starts with a formula trigger
 * (`= + - @ TAB CR`) is prefixed with a single quote to neutralise CSV
 * formula injection — a malicious member name like `=HYPERLINK(...)` must
 * never be evaluated when the export is opened in Excel / Sheets.
 */
function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  // Numbers are trusted (never user-controlled formulas); only text values
  // can carry a leading formula trigger that needs neutralising.
  let s = typeof value === 'number' ? String(value) : value;
  if (typeof value !== 'number' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(...cells: Array<string | number | null | undefined>): string {
  return cells.map(csvField).join(',');
}

function ratePct(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return '';
  return `${Math.round(rate * 100)}%`;
}

/**
 * Build a sectioned CSV string from a loaded {@link TeamStats} payload.
 *
 * Pure + synchronous so it is trivially unit-testable. Respects the
 * team-vs-member scope encoded in `stats.member`:
 *  - aggregate mode → attendance by_member + volume by_member tables
 *  - member mode    → the personal attendance by_session timeline
 * Volume by_week and intensity by_segment are always emitted. Nulls and
 * empty arrays are handled gracefully (sections collapse to their header).
 */
export function buildStatsCsv(stats: TeamStats | null): string {
  const lines: string[] = [];
  if (!stats) return '';

  const isMember = stats.member !== null;

  // --- Header block ---------------------------------------------------------
  lines.push(row('Training Manager', 'Statistics'));
  lines.push(row('Scope', isMember ? 'Member' : 'Team'));
  if (isMember && stats.member) {
    lines.push(row('Member', stats.member.name));
  }
  lines.push(row('From', stats.period?.from ?? ''));
  lines.push(row('To', stats.period?.to ?? ''));
  lines.push('');

  // --- Attendance -----------------------------------------------------------
  lines.push(row('Attendance'));
  if (isMember) {
    lines.push(row('Date', 'Session', 'Present', 'Total', 'Rate'));
    for (const s of stats.attendance?.by_session ?? []) {
      lines.push(row(s.date, s.name, s.present, s.total, ratePct(s.rate)));
    }
  } else {
    lines.push(row('Team rate', ratePct(stats.attendance?.team_rate)));
    lines.push(row('Member', 'Present', 'Total', 'Rate', 'Last present'));
    for (const m of stats.attendance?.by_member ?? []) {
      lines.push(row(m.name, m.present, m.total, ratePct(m.rate), m.last_present_date));
    }
  }
  lines.push('');

  // --- Volume ---------------------------------------------------------------
  lines.push(row('Volume'));
  lines.push(row('Total distance (m)', stats.volume?.total_distance ?? 0));
  lines.push(row('Week start', 'Distance (m)'));
  for (const w of stats.volume?.by_week ?? []) {
    lines.push(row(w.week_start, w.distance));
  }
  if (!isMember && (stats.volume?.by_member?.length ?? 0) > 0) {
    lines.push('');
    lines.push(row('Member', 'Distance (m)'));
    for (const m of stats.volume.by_member) {
      lines.push(row(m.name, m.distance));
    }
  }
  lines.push('');

  // --- Intensity ------------------------------------------------------------
  lines.push(row('Intensity'));
  lines.push(row('Segment', 'Label', 'Distance (m)'));
  for (const seg of stats.intensity?.by_segment ?? []) {
    lines.push(row(seg.abv, seg.label, seg.distance));
  }

  return lines.join('\r\n');
}
