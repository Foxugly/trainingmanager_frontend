import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttendanceStatusesService } from '../../../api/api/attendance-statuses.service';
import { EventsService } from '../../../api/api/events.service';
import { ProgramsService } from '../../../api/api/programs.service';
import { TeamsService } from '../../../api/api/teams.service';
import { Attendance } from '../../../api/model/attendance';
import { AttendanceStatus } from '../../../api/model/attendance-status';
import { CustomUserPublic } from '../../../api/model/custom-user-public';
import { Event } from '../../../api/model/event';
import { LanguageEnum } from '../../../api/model/language-enum';
import { Sport } from '../../../api/model/sport';
import { Team } from '../../../api/model/team';
import { TeamMembership } from '../../../api/model/team-membership';
import { AuthService } from '../../../core/auth/auth.service';
import { EventsAttendanceComponent } from './events-attendance.component';

const ownerUser = { id: 17, username: 'owner' } as CustomUserPublic;
const memberUser = { id: 88, username: 'athlete' } as CustomUserPublic;

const sport: Sport = {
  id: 1,
  name: 'Natation',
  slug: 'natation',
  is_active: true,
  energy_systems: [],
  created_at: '2026-04-01T00:00:00Z',
};

const team: Team = {
  id: 4,
  name: 'RBP WP Senior',
  sport,
  sport_id: 1,
  owner: ownerUser,
  managers: [],
  language: LanguageEnum.Fr,
  is_active: true,
  is_public: false,
  attendance_statuses: [],
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

const program = {
  id: 4,
  name: 'Cycle aérobie',
  team: { id: 4, name: 'RBP WP Senior', language: LanguageEnum.Fr },
  team_id: 4,
  events: [],
  description: '',
  generated_by_ai: false,
  ai_response: '',
  ai_generated_at: null,
  is_active: true,
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

const event7: Event = {
  id: 7,
  name: 'Séance lundi',
  goal: null,
  color: undefined,
  date: '2026-05-04',
  hour_start: null,
  hour_end: null,
  total: undefined,
  refer_program: { id: 4, name: 'Cycle aérobie' },
  refer_program_id: 4,
  rounds: [],
  members: [101, 102, 103],
  generated_by_ai: false,
  ai_response: '',
  ai_generated_at: null,
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

const statusPresent: AttendanceStatus = {
  id: 1, code: 'present', label: 'Présent', is_default: true, order: 1, color: '#22C55E', is_active: true,
};
const statusAbsent: AttendanceStatus = {
  id: 2, code: 'absent', label: 'Absent', is_default: false, order: 2, color: '#EF4444', is_active: true,
};
const statusExcused: AttendanceStatus = {
  id: 3, code: 'excused', label: 'Excusé', is_default: false, order: 3, color: '#F59E0B', is_active: true,
};

const memberships: TeamMembership[] = [
  { id: 50, team: 4, member: 101, member_username: 'jean', member_fullname: 'Jean D.', joined_at: '2026-04-01', left_at: null, created_at: '', updated_at: '' },
  { id: 51, team: 4, member: 102, member_username: 'paul', member_fullname: 'Paul M.', joined_at: '2026-04-01', left_at: null, created_at: '', updated_at: '' },
  { id: 52, team: 4, member: 103, member_username: 'eve',  member_fullname: 'Eve T.',  joined_at: '2026-04-01', left_at: null, created_at: '', updated_at: '' },
];

const existingAttendances: Attendance[] = [
  { id: 901, event: 7, member: 101, member_fullname: 'Jean D.', status: 2, status_code: 'absent', created_at: '', updated_at: '' },
  { id: 902, event: 7, member: 102, member_fullname: 'Paul M.', status: 1, status_code: 'present', created_at: '', updated_at: '' },
];

interface ProtectedFields {
  event(): Event | null;
  team(): Team | null;
  rows(): { member_id: number; fullname: string; status_code: string; fieldError: string | null }[];
  loading(): boolean;
  notFound(): boolean;
  noStatuses(): boolean;
  permissionDenied(): boolean;
  canManage(): boolean;
  defaultStatusCode(): string | null;
  saving(): boolean;
  errorMessage(): string | null;
  updateRowStatus(memberId: number, code: string): void;
  save(): void;
}

describe('EventsAttendanceComponent', () => {
  let fixture: ComponentFixture<EventsAttendanceComponent>;
  let component: EventsAttendanceComponent;
  let eventsMock: {
    eventsRetrieve: ReturnType<typeof vi.fn>;
    eventsAttendanceList: ReturnType<typeof vi.fn>;
    eventsAttendanceBulkCreate: ReturnType<typeof vi.fn>;
  };
  let statusesMock: { attendanceStatusesList: ReturnType<typeof vi.fn> };
  let programsMock: { programsRetrieve: ReturnType<typeof vi.fn> };
  let teamsMock: {
    teamsRetrieve: ReturnType<typeof vi.fn>;
    teamsMembershipsList: ReturnType<typeof vi.fn>;
  };
  let userSig: ReturnType<typeof signal<CustomUserPublic | null>>;
  let routeIdParam: string | null;
  let router: Router;

  const access = (c: EventsAttendanceComponent) => c as unknown as ProtectedFields;

  async function setup(opts?: {
    idParam?: string | null;
    eventResult?: Event | null;
    attendances?: Attendance[];
    statuses?: AttendanceStatus[];
    user?: CustomUserPublic | null;
  }) {
    TestBed.resetTestingModule();
    routeIdParam = opts?.idParam ?? '7';
    const evt = opts?.eventResult === undefined ? event7 : opts.eventResult;
    const att = opts?.attendances ?? [];
    const sts = opts?.statuses ?? [statusPresent, statusAbsent, statusExcused];
    const user = opts?.user === undefined ? ownerUser : opts.user;

    eventsMock = {
      eventsRetrieve: vi.fn().mockReturnValue(evt ? of(evt) : throwError(() => new Error('404'))),
      eventsAttendanceList: vi.fn().mockReturnValue(of({ count: att.length, results: att })),
      eventsAttendanceBulkCreate: vi
        .fn()
        .mockReturnValue(of({ count: 0, results: [] })),
    };
    statusesMock = {
      attendanceStatusesList: vi
        .fn()
        .mockReturnValue(of({ count: sts.length, results: sts })),
    };
    programsMock = { programsRetrieve: vi.fn().mockReturnValue(of(program)) };
    teamsMock = {
      teamsRetrieve: vi.fn().mockReturnValue(of(team)),
      teamsMembershipsList: vi.fn().mockReturnValue(of(memberships)),
    };
    userSig = signal<CustomUserPublic | null>(user);

    await TestBed.configureTestingModule({
      imports: [
        EventsAttendanceComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        MessageService,
        { provide: EventsService, useValue: eventsMock },
        { provide: AttendanceStatusesService, useValue: statusesMock },
        { provide: ProgramsService, useValue: programsMock },
        { provide: TeamsService, useValue: teamsMock },
        { provide: AuthService, useValue: { currentUser: userSig.asReadonly() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => routeIdParam } } },
        },
      ],
    })
      .overrideComponent(EventsAttendanceComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(EventsAttendanceComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockReturnValue(Promise.resolve(true));
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('builds 3 rows pre-filled with the is_default status when no attendance exists', () => {
    const rows = access(component).rows();
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.status_code === 'present')).toBe(true);
    expect(rows.map((r) => r.fullname)).toEqual(['Jean D.', 'Paul M.', 'Eve T.']);
  });

  it('falls back to the lowest order ASC when no status is flagged is_default', async () => {
    const noDefault = [
      { ...statusAbsent, is_default: false, order: 5 },
      { ...statusExcused, is_default: false, order: 3 },
    ];
    await setup({ statuses: noDefault });
    expect(access(component).defaultStatusCode()).toBe('excused');
  });

  it('pre-fills rows with existing attendance status_code when present', async () => {
    await setup({ attendances: existingAttendances });
    const rows = access(component).rows();
    expect(rows.find((r) => r.member_id === 101)?.status_code).toBe('absent');
    expect(rows.find((r) => r.member_id === 102)?.status_code).toBe('present');
    expect(rows.find((r) => r.member_id === 103)?.status_code).toBe('present');
  });

  it('updateRowStatus mutates only the targeted row and clears its fieldError', () => {
    access(component).updateRowStatus(101, 'absent');
    const rows = access(component).rows();
    expect(rows.find((r) => r.member_id === 101)?.status_code).toBe('absent');
    expect(rows.find((r) => r.member_id === 102)?.status_code).toBe('present');
  });

  it('save() sends the bulk payload built from current rows', () => {
    access(component).updateRowStatus(101, 'absent');
    access(component).save();
    expect(eventsMock.eventsAttendanceBulkCreate).toHaveBeenCalledTimes(1);
    const [eventPk, body] = eventsMock.eventsAttendanceBulkCreate.mock.calls[0];
    expect(eventPk).toBe(7);
    expect(body.attendances).toEqual(
      expect.arrayContaining([
        { member_id: 101, status_code: 'absent' },
        { member_id: 102, status_code: 'present' },
        { member_id: 103, status_code: 'present' },
      ]),
    );
  });

  it('on save success, navigates to /events/:id', () => {
    access(component).save();
    expect(router.navigate).toHaveBeenCalledWith(['/events', 7]);
  });

  it('on 4xx with per-row body.attendances, sets fieldError per concerned row', () => {
    eventsMock.eventsAttendanceBulkCreate.mockReturnValueOnce(
      throwError(() => ({
        error: {
          attendances: [
            null,
            { status_code: ['unknown status'] },
            null,
          ],
        },
      })),
    );
    access(component).save();
    const rows = access(component).rows();
    expect(rows[0].fieldError).toBeNull();
    expect(rows[1].fieldError).toContain('status_code');
    expect(rows[2].fieldError).toBeNull();
  });

  it('flags noStatuses when the statuses list is empty', async () => {
    await setup({ statuses: [] });
    expect(access(component).noStatuses()).toBe(true);
    expect(access(component).rows()).toHaveLength(0);
  });

  it('permission denied: member-only user is detected and redirected to /events/:id', async () => {
    await setup({ user: memberUser });
    expect(access(component).canManage()).toBe(false);
    expect(access(component).permissionDenied()).toBe(true);
    expect(router.navigate).toHaveBeenCalledWith(['/events', 7]);
  });

  it('handles invalid route id without calling APIs', async () => {
    await setup({ idParam: 'NaN' });
    expect(access(component).notFound()).toBe(true);
    expect(eventsMock.eventsRetrieve).not.toHaveBeenCalled();
  });

  it('flags notFound when eventsRetrieve fails', async () => {
    await setup({ eventResult: null });
    expect(access(component).notFound()).toBe(true);
  });
});
