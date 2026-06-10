import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttachmentsService } from '../../../api/api/attachments.service';
import { Attachment } from '../../../api/model/attachment';
import { AttachmentStatusEnum } from '../../../api/model/attachment-status-enum';
import { AttachmentUploadService } from '../../../core/attachments/attachment-upload.service';
import { AttachmentListComponent } from './attachment-list.component';

/** Expose protected signals/methods for assertions. */
interface ProtectedFields {
  items(): Attachment[];
  loading(): boolean;
  isUploading(): boolean;
  iconFor(mime: string): string;
  formatSize(bytes: number): string;
  confirmDelete(item: Attachment): void;
  onDownload(item: Attachment): void;
}
function access(cmp: AttachmentListComponent): ProtectedFields {
  return cmp as unknown as ProtectedFields;
}

function makeAttachment(over: Partial<Attachment> = {}): Attachment {
  return {
    id: 1,
    target_type: 'message',
    target_id: 10,
    filename: 'report.pdf',
    content_type_mime: 'application/pdf',
    size_bytes: 2048,
    status: AttachmentStatusEnum.Ready,
    uploaded_by: 1,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  } as Attachment;
}

describe('AttachmentListComponent', () => {
  let fixture: ComponentFixture<AttachmentListComponent>;
  let component: AttachmentListComponent;
  let attachmentsMock: {
    attachmentsList: ReturnType<typeof vi.fn>;
    attachmentsDestroy: ReturnType<typeof vi.fn>;
  };
  let uploadMock: {
    upload: ReturnType<typeof vi.fn>;
    download: ReturnType<typeof vi.fn>;
    formatSize: ReturnType<typeof vi.fn>;
  };
  let confirmationService: ConfirmationService;

  async function setup(
    opts: {
      items?: Attachment[];
      canEdit?: boolean;
      targetType?: 'event' | 'message' | 'program' | 'performance';
      targetId?: number;
    } = {},
  ) {
    TestBed.resetTestingModule();
    const items = opts.items ?? [makeAttachment()];
    attachmentsMock = {
      attachmentsList: vi.fn().mockReturnValue(of({ count: items.length, results: items })),
      attachmentsDestroy: vi.fn().mockReturnValue(of(undefined)),
    };
    uploadMock = {
      upload: vi.fn().mockResolvedValue(makeAttachment({ id: 2, filename: 'new.pdf' })),
      download: vi.fn().mockResolvedValue(undefined),
      formatSize: vi.fn().mockReturnValue('2 KB'),
    };

    await TestBed.configureTestingModule({
      imports: [
        AttachmentListComponent,
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        MessageService,
        ConfirmationService,
        { provide: AttachmentsService, useValue: attachmentsMock },
        { provide: AttachmentUploadService, useValue: uploadMock },
      ],
    })
      .overrideComponent(AttachmentListComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(AttachmentListComponent);
    component = fixture.componentInstance;
    confirmationService = fixture.debugElement.injector.get(ConfirmationService);
    fixture.componentRef.setInput('targetType', opts.targetType ?? 'message');
    fixture.componentRef.setInput('targetId', opts.targetId ?? 10);
    fixture.componentRef.setInput('canEdit', opts.canEdit ?? false);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setup();
  });

  it('lists ready attachments for the target (positional targetId, targetType)', () => {
    expect(attachmentsMock.attachmentsList).toHaveBeenCalledWith({ targetId: 10, targetType: 'message' });
    expect(access(component).items().length).toBe(1);
  });

  it('filters out non-ready attachments defensively', async () => {
    await setup({
      items: [
        makeAttachment({ id: 1, status: AttachmentStatusEnum.Ready }),
        makeAttachment({ id: 2, status: AttachmentStatusEnum.Pending }),
      ],
    });
    expect(access(component).items().length).toBe(1);
    expect(access(component).items()[0].id).toBe(1);
  });

  it('maps MIME kinds to icons', () => {
    const p = access(component);
    expect(p.iconFor('application/pdf')).toContain('pi-file-pdf');
    expect(p.iconFor('image/png')).toContain('pi-image');
    expect(p.iconFor('video/mp4')).toContain('pi-video');
    expect(p.iconFor('text/plain')).toContain('pi-file');
  });

  it('delegates download to the upload service', () => {
    access(component).onDownload(makeAttachment({ id: 5 }));
    expect(uploadMock.download).toHaveBeenCalledWith(5);
  });

  it('confirm-delete then destroy removes the item from the list', async () => {
    await setup({ items: [makeAttachment({ id: 7 })], canEdit: true });
    const confirmSpy = vi
      .spyOn(confirmationService, 'confirm')
      .mockImplementation((opts) => {
        opts.accept?.();
        return confirmationService;
      });
    access(component).confirmDelete(makeAttachment({ id: 7 }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(attachmentsMock.attachmentsDestroy).toHaveBeenCalledWith({ id: 7 });
    expect(access(component).items().length).toBe(0);
  });

  it('reloads when targetId changes', async () => {
    attachmentsMock.attachmentsList.mockClear();
    fixture.componentRef.setInput('targetId', 42);
    fixture.detectChanges();
    expect(attachmentsMock.attachmentsList).toHaveBeenCalledWith({ targetId: 42, targetType: 'message' });
  });
});
