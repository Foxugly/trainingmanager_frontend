import { Component, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttendanceStatusesService } from '../../../api/api/attendance-statuses.service';
import { EventsService } from '../../../api/api/events.service';
import { TeamsService } from '../../../api/api/teams.service';
import { AttendanceStatus } from '../../../api/model/attendance-status';
import { Event as EventModel } from '../../../api/model/event';
import { Team } from '../../../api/model/team';
import { AttendanceManagerComponent } from './attendance-manager.component';

const status = (id: number, code: string, label: string, isDefault = false): AttendanceStatus => ({
  id,
  code,
  label,
  is_default: isDefault,
  order: id,
  color: '',
  is_active: true,
});

const statuses: AttendanceStatus[] = [
  status(1, 'unknown', 'Inconnu', true),
  status(2, 'present', 'Présent'),
  status(3, 'absent', 'Absent'),
];

const event: EventModel = {
  id: 7,
  name: 'Sess',
  members: [10, 11],
  refer_program: { id: 1, name: 'P', team: { id: 1, name: 'T' } } as never,
  refer_program_id: 1,
  rounds: [],
  generated_by_ai: false,
  ai_response: '',
  ai_generated_at: null,
  created_at: '',
  updated_at: '',
} as unknown as EventModel;

const team: Team = { id: 1, name: 'T' } as unknown as Team;

interface ProtectedFields {
  rows(): Array<{ member_id: number; status_code: string; saving: boolean }>;
  loading(): boolean;
  noStatuses(): boolean;
  onSelect(memberId: number, code: string): void;
  statusIcon(code: string): string;
}

@Component({
  imports: [AttendanceManagerComponent],
  template: '<app-attendance-manager [event]="event" [team]="team" />',
})
class HostComponent {
  event = event;
  team = team;
}

describe('AttendanceManagerComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let component: AttendanceManagerComponent;
  let eventsMock: {
    eventsAttendanceList: ReturnType<typeof vi.fn>;
    eventsAttendanceBulkCreate: ReturnType<typeof vi.fn>;
  };
  let statusesMock: { attendanceStatusesList: ReturnType<typeof vi.fn> };
  let teamsMock: { teamsMembershipsList: ReturnType<typeof vi.fn> };

  const access = (c: AttendanceManagerComponent) => c as unknown as ProtectedFields;

  beforeEach(async () => {
    eventsMock = {
      eventsAttendanceList: vi.fn().mockReturnValue(
        of({
          count: 1,
          results: [{ event: 7, member: 10, status: 2, status_code: 'present', member_fullname: 'Alice' }],
        }),
      ),
      eventsAttendanceBulkCreate: vi.fn().mockReturnValue(of({ count: 1, results: [] })),
    };
    statusesMock = {
      attendanceStatusesList: vi
        .fn()
        .mockReturnValue(of({ count: statuses.length, results: statuses })),
    };
    teamsMock = {
      teamsMembershipsList: vi.fn().mockReturnValue(
        of([
          { member: 10, member_fullname: 'Alice' },
          { member: 11, member_fullname: 'Bob' },
        ]),
      ),
    };

    await TestBed.configureTestingModule({
      imports: [
        HostComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: { common: { error: 'Erreur' } } },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideHttpClient(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: EventsService, useValue: eventsMock },
        { provide: AttendanceStatusesService, useValue: statusesMock },
        { provide: TeamsService, useValue: teamsMock },
        { provide: MessageService, useValue: { add: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    component = fixture.debugElement.children[0].componentInstance as AttendanceManagerComponent;
  });

  it('builds rows from members + memberships, picking existing attendance code', () => {
    const rows = access(component).rows();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.member_id === 10)?.status_code).toBe('present');
    // member 11 has no attendance → falls back to default ("unknown")
    expect(rows.find((r) => r.member_id === 11)?.status_code).toBe('unknown');
  });

  it('maps status codes to PrimeIcons (with fallback)', () => {
    expect(access(component).statusIcon('present')).toBe('pi-check-circle');
    expect(access(component).statusIcon('unknown')).toBe('pi-question-circle');
    expect(access(component).statusIcon('absent')).toBe('pi-times-circle');
    expect(access(component).statusIcon('late')).toBe('pi-clock');
    expect(access(component).statusIcon('excused')).toBe('pi-shield');
    expect(access(component).statusIcon('mystery')).toBe('pi-circle');
  });

  it('debounces saves and only sends the latest status per member', async () => {
    access(component).onSelect(10, 'absent');
    access(component).onSelect(10, 'unknown');
    access(component).onSelect(10, 'present');
    expect(eventsMock.eventsAttendanceBulkCreate).not.toHaveBeenCalled();

    await new Promise((r) => setTimeout(r, 350));
    expect(eventsMock.eventsAttendanceBulkCreate).toHaveBeenCalledTimes(1);
    expect(eventsMock.eventsAttendanceBulkCreate).toHaveBeenCalledWith(7, {
      attendances: [{ member_id: 10, status_code: 'present' }],
    });
  });

  it('rolls back to original status on save error', async () => {
    eventsMock.eventsAttendanceBulkCreate.mockReturnValue(throwError(() => ({ status: 500 })));

    access(component).onSelect(10, 'absent');
    await new Promise((r) => setTimeout(r, 350));
    await new Promise((r) => setTimeout(r, 0));

    const row = access(component).rows().find((r) => r.member_id === 10)!;
    expect(row.status_code).toBe('present');
    expect(row.saving).toBe(false);
  });

  it('skips when same status is reselected', () => {
    access(component).onSelect(10, 'present'); // already present
    expect(eventsMock.eventsAttendanceBulkCreate).not.toHaveBeenCalled();
  });
});
