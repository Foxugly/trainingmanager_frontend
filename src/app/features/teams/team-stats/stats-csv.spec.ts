import { describe, expect, it } from 'vitest';
import { TeamStats } from '../../../api/model/team-stats';
import { buildStatsCsv } from './stats-csv';

const aggregateStats: TeamStats = {
  period: { from: '2026-03-01', to: '2026-05-24' },
  member: null,
  attendance: {
    team_rate: 0.75,
    by_session: [
      { event_id: 1, name: 'Séance A', date: '2026-05-01', present: 8, total: 10, rate: 0.8 },
    ],
    by_member: [
      {
        member_id: 23,
        name: 'Renaud Vilain',
        present: 7,
        total: 10,
        rate: 0.7,
        last_present_date: '2026-05-08',
      },
      {
        member_id: 24,
        name: 'Alice, Dupont',
        present: 9,
        total: 10,
        rate: 0.9,
        last_present_date: null,
      },
    ],
  },
  volume: {
    total_distance: 12500,
    by_week: [
      { week_start: '2026-05-04', distance: 6000 },
      { week_start: '2026-05-11', distance: 6500 },
    ],
    by_member: [
      { member_id: 23, name: 'Renaud Vilain', distance: 6000 },
      { member_id: 24, name: 'Alice, Dupont', distance: 6500 },
    ],
  },
  intensity: {
    by_segment: [
      { abv: 'Z1', label: 'Endurance', distance: 8000 },
      { abv: 'Z3', label: null, distance: 4500 },
    ],
  },
};

const memberStats: TeamStats = {
  period: { from: '2026-03-01', to: '2026-05-24' },
  member: { id: 23, name: 'Renaud Vilain' },
  attendance: {
    team_rate: null,
    by_session: [
      { event_id: 1, name: 'Séance A', date: '2026-05-01', present: 1, total: 1, rate: 1 },
      { event_id: 2, name: 'Séance B', date: '2026-05-08', present: 0, total: 1, rate: 0 },
    ],
    by_member: [],
  },
  volume: {
    total_distance: 6000,
    by_week: [{ week_start: '2026-05-04', distance: 6000 }],
    by_member: [],
  },
  intensity: {
    by_segment: [{ abv: 'Z1', label: 'Endurance', distance: 6000 }],
  },
};

describe('buildStatsCsv', () => {
  it('returns an empty string for a null payload', () => {
    expect(buildStatsCsv(null)).toBe('');
  });

  it('emits a header block with team scope and the period', () => {
    const lines = buildStatsCsv(aggregateStats).split('\r\n');
    expect(lines[0]).toBe('Training Manager,Statistics');
    expect(lines).toContain('Scope,Team');
    expect(lines).toContain('From,2026-03-01');
    expect(lines).toContain('To,2026-05-24');
  });

  it('emits the attendance by_member table in aggregate mode', () => {
    const csv = buildStatsCsv(aggregateStats);
    expect(csv).toContain('Team rate,75%');
    expect(csv).toContain('Member,Present,Total,Rate,Last present');
    expect(csv).toContain('Renaud Vilain,7,10,70%,2026-05-08');
    // empty last_present_date renders as a trailing empty field
    expect(csv).toContain('"Alice, Dupont",9,10,90%');
  });

  it('quotes fields containing a comma per RFC 4180', () => {
    const csv = buildStatsCsv(aggregateStats);
    expect(csv).toContain('"Alice, Dupont"');
  });

  it('emits the volume by_week and by_member tables (aggregate)', () => {
    const csv = buildStatsCsv(aggregateStats);
    expect(csv).toContain('Total distance (m),12500');
    expect(csv).toContain('Week start,Distance (m)');
    expect(csv).toContain('2026-05-04,6000');
    expect(csv).toContain('Member,Distance (m)');
  });

  it('emits the intensity by_segment table with null labels as empty', () => {
    const csv = buildStatsCsv(aggregateStats);
    expect(csv).toContain('Segment,Label,Distance (m)');
    expect(csv).toContain('Z1,Endurance,8000');
    expect(csv).toContain('Z3,,4500');
  });

  it('uses member scope + the by_session timeline in member mode', () => {
    const csv = buildStatsCsv(memberStats);
    expect(csv).toContain('Scope,Member');
    expect(csv).toContain('Member,Renaud Vilain');
    expect(csv).toContain('Date,Session,Present,Total,Rate');
    expect(csv).toContain('2026-05-01,Séance A,1,1,100%');
    expect(csv).toContain('2026-05-08,Séance B,0,1,0%');
    // member mode does not emit a volume by_member block
    expect(csv).not.toContain('Member,Distance (m)');
  });

  it('handles empty arrays gracefully (sections collapse to headers)', () => {
    const empty: TeamStats = {
      period: { from: '2026-03-01', to: '2026-05-24' },
      member: null,
      attendance: { team_rate: null, by_session: [], by_member: [] },
      volume: { total_distance: 0, by_week: [], by_member: [] },
      intensity: { by_segment: [] },
    };
    const csv = buildStatsCsv(empty);
    expect(csv).toContain('Attendance');
    expect(csv).toContain('Team rate,');
    expect(csv).toContain('Total distance (m),0');
    expect(csv).toContain('Intensity');
  });
});
