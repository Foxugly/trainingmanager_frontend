import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditLogService } from '../../../api/api/audit-log.service';
import { ActionEnum } from '../../../api/model/action-enum';
import { AuditLogEntry } from '../../../api/model/audit-log-entry';
import { TeamAuditLogComponent } from './team-audit-log.component';

const auditEntry1: AuditLogEntry = {
  id: 501,
  actor: 17,
  actor_label: 'testfrontend',
  action: ActionEnum.MemberRemoved,
  action_display: 'Membre retiré',
  team: 4,
  target_repr: 'Renaud Vilain',
  metadata: null,
  created_at: '2026-05-20T10:30:00Z',
};

const auditEntry2: AuditLogEntry = {
  id: 502,
  actor: null,
  actor_label: '',
  action: ActionEnum.SessionShared,
  action_display: 'Séance partagée',
  team: 4,
  target_repr: 'Séance #12',
  metadata: null,
  created_at: '2026-05-19T08:00:00Z',
};

interface Protected {
  auditRows(): Array<{
    id: number;
    when: string;
    who: string;
    action: string;
    target: string;
    tagClass: string;
  }>;
  loadingAudit(): boolean;
  auditLoaded(): boolean;
  auditHasMore(): boolean;
  loadMoreAudit(): void;
}

describe('TeamAuditLogComponent', () => {
  let fixture: ComponentFixture<TeamAuditLogComponent>;
  let component: TeamAuditLogComponent;
  let auditMock: { auditLogList: ReturnType<typeof vi.fn> };
  const access = (c: TeamAuditLogComponent) => c as unknown as Protected;

  async function setup(
    opts: {
      auditLogList?: { count: number; next: string | null; results: AuditLogEntry[] };
    } = {},
  ) {
    TestBed.resetTestingModule();
    auditMock = {
      auditLogList: vi.fn().mockReturnValue(
        of(
          opts.auditLogList ?? {
            count: 2,
            next: null,
            results: [auditEntry1, auditEntry2],
          },
        ),
      ),
    };

    await TestBed.configureTestingModule({
      imports: [
        TeamAuditLogComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        { provide: AuditLogService, useValue: auditMock },
      ],
    })
      .overrideComponent(TeamAuditLogComponent, {
        set: { template: '', imports: [] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(TeamAuditLogComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('teamId', 4);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => setup());

  it('loads the team audit log on init, scoped to the team, and maps rows', () => {
    expect(auditMock.auditLogList).toHaveBeenCalledWith({ page: 1, team: 4 });
    const rows = access(component).auditRows();
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(501);
    expect(rows[0].action).toBe('Membre retiré');
    expect(rows[0].target).toBe('Renaud Vilain');
    // empty actor_label falls back to the localized "Système" key
    expect(rows[1].who).toBe('audit.system');
    expect(rows[0].who).toBe('testfrontend');
    expect(access(component).auditLoaded()).toBe(true);
  });

  it('toAuditRow maps actor_label and assigns a destructive tag class for member_removed', () => {
    const row = access(component).auditRows()[0];
    expect(row.tagClass).toContain('bg-rose-100');
    expect(row.tagClass).toContain('text-rose-800');
  });

  it('assigns the share tag class for session_shared', () => {
    const row = access(component).auditRows()[1];
    expect(row.tagClass).toContain('bg-sky-100');
    expect(row.tagClass).toContain('text-sky-800');
  });

  it('reloads page 1 (and resets rows) when teamId changes', () => {
    fixture.componentRef.setInput('teamId', 5);
    fixture.detectChanges();
    expect(auditMock.auditLogList).toHaveBeenLastCalledWith({ page: 1, team: 5 });
    expect(access(component).auditRows()).toHaveLength(2);
  });

  it('loadMoreAudit appends the next page when next is present', async () => {
    await setup({ auditLogList: { count: 3, next: 'http://x/?page=2', results: [auditEntry1] } });
    expect(access(component).auditRows()).toHaveLength(1);
    expect(access(component).auditHasMore()).toBe(true);
    auditMock.auditLogList.mockReturnValueOnce(
      of({ count: 3, next: null, results: [auditEntry2] }),
    );
    access(component).loadMoreAudit();
    expect(auditMock.auditLogList).toHaveBeenLastCalledWith({ page: 2, team: 4 });
    expect(access(component).auditRows()).toHaveLength(2);
    expect(access(component).auditHasMore()).toBe(false);
  });

  it('loadMoreAudit is a no-op when there is no next page', () => {
    auditMock.auditLogList.mockClear();
    access(component).loadMoreAudit();
    expect(auditMock.auditLogList).not.toHaveBeenCalled();
  });

  it('sets auditLoaded even when the load errors (no infinite spinner)', async () => {
    await setup();
    auditMock.auditLogList.mockReturnValue(throwError(() => new Error('boom')));
    fixture.componentRef.setInput('teamId', 9);
    fixture.detectChanges();
    expect(access(component).auditLoaded()).toBe(true);
    expect(access(component).loadingAudit()).toBe(false);
    expect(access(component).auditRows()).toHaveLength(0);
  });
});
