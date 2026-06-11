import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService } from 'primeng/api';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Tooltip } from 'primeng/tooltip';
import { AttachmentsService } from '../../../api/api/attachments.service';
import { Attachment } from '../../../api/model/attachment';
import { AttachmentStatusEnum } from '../../../api/model/attachment-status-enum';
import { AttachmentUploadService } from '../../../core/attachments/attachment-upload.service';
import { ToastService } from '../../../core/notifications/toast.service';
import { EmptyStateComponent } from '../empty-state/empty-state.component';
import { LocalizedDatePipe } from '../../datetime/localized-date.pipe';

/** Accept attribute for the file picker — mirrors the backend MIME allow-list. */
const ACCEPT = '.pdf,application/pdf,image/*,video/mp4,video/webm,video/quicktime';

/**
 * Compact list of S3 attachments for an Event or Message target, with optional
 * upload + delete controls. Drives the "Pièces jointes" sections on the session
 * detail and under each team-discussion message.
 *
 * Storage may be unprovisioned: the backend returns 503
 * `{code:'attachments_unconfigured'}`; we toast a friendly message instead of
 * crashing and render an empty list.
 */
@Component({
  selector: 'app-attachment-list',
  imports: [LocalizedDatePipe, Button, ConfirmDialog, Tooltip, TranslocoPipe, EmptyStateComponent],
  templateUrl: './attachment-list.component.html',
  styleUrl: './attachment-list.component.scss',
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttachmentListComponent {
  private readonly attachments = inject(AttachmentsService);
  private readonly uploadService = inject(AttachmentUploadService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly targetType = input.required<'event' | 'message' | 'program' | 'performance'>();
  readonly targetId = input.required<number>();
  readonly canEdit = input<boolean>(false);
  /** Compact mode (e.g. inline under a chat message): a discreet paperclip
   *  icon-button instead of the full "+ Ajouter" CTA, and no empty-state — the
   *  attachment list only renders when there actually are attachments. */
  readonly compact = input<boolean>(false);

  protected readonly accept = ACCEPT;

  protected readonly items = signal<Attachment[]>([]);
  protected readonly loading = signal(false);
  /** Names of files currently mid-upload (for inline spinners). */
  protected readonly uploading = signal<string[]>([]);
  protected readonly isUploading = computed(() => this.uploading().length > 0);

  constructor() {
    // (Re)load whenever the target identity changes.
    effect(() => {
      const id = this.targetId();
      const type = this.targetType();
      untracked(() => this.load(id, type));
    });
  }

  private load(targetId: number, targetType: 'event' | 'message' | 'program' | 'performance'): void {
    this.loading.set(true);
    this.attachments
      .attachmentsList({ targetId, targetType })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const ready = (res.results ?? []).filter(
            (a) => a.status === AttachmentStatusEnum.Ready,
          );
          this.items.set(ready);
          this.loading.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.items.set([]);
          this.loading.set(false);
          // A 503 here means storage isn't provisioned — stay quiet on read,
          // the empty state is enough; only surface 503 on user-initiated ops.
          if (err?.status !== 503) {
            // Other read errors: keep the list empty silently (defensive).
          }
        },
      });
  }

  /** PrimeIcons class for an attachment's MIME kind. */
  protected iconFor(mime: string): string {
    if (mime === 'application/pdf') return 'pi pi-file-pdf';
    if (mime.startsWith('image/')) return 'pi pi-image';
    if (mime.startsWith('video/')) return 'pi pi-video';
    return 'pi pi-file';
  }

  /** CSS class suffix driving the colored icon-pill tone per MIME kind. */
  protected toneFor(mime: string): 'pdf' | 'image' | 'video' | 'file' {
    if (mime === 'application/pdf') return 'pdf';
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    return 'file';
  }

  protected formatSize(bytes: number): string {
    return this.uploadService.formatSize(bytes);
  }

  protected onDownload(item: Attachment): void {
    void this.uploadService.download(item.id).catch((err: unknown) => {
      this.notifyError(err);
    });
  }

  protected triggerFilePicker(input: HTMLInputElement): void {
    input.value = '';
    input.click();
  }

  protected async onFilesSelected(event: globalThis.Event): Promise<void> {
    const inputEl = event.target as HTMLInputElement;
    const files = inputEl.files;
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    inputEl.value = '';
    for (const file of list) {
      await this.uploadOne(file);
    }
  }

  private async uploadOne(file: File): Promise<void> {
    this.uploading.update((names) => [...names, file.name]);
    try {
      const created = await this.uploadService.upload(file, this.targetType(), this.targetId());
      this.items.update((list) => [...list, created]);
      this.toast.success('attachments.uploaded');
    } catch (err) {
      this.notifyError(err);
    } finally {
      this.uploading.update((names) => {
        const idx = names.indexOf(file.name);
        if (idx < 0) return names;
        const next = [...names];
        next.splice(idx, 1);
        return next;
      });
    }
  }

  protected confirmDelete(item: Attachment): void {
    this.confirmationService.confirm({
      header: this.transloco.translate('common.confirm'),
      message: this.transloco.translate('attachments.delete_confirm', { name: item.filename }),
      acceptLabel: this.transloco.translate('common.delete'),
      rejectLabel: this.transloco.translate('common.cancel'),
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deleteItem(item),
    });
  }

  private deleteItem(item: Attachment): void {
    this.attachments
      .attachmentsDestroy({ id: item.id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.items.update((list) => list.filter((a) => a.id !== item.id));
          this.toast.success('attachments.deleted');
        },
        error: (err: HttpErrorResponse) => this.notifyError(err),
      });
  }

  /**
   * Map an upload/download/delete error to a friendly toast. Recognises the
   * 503 unconfigured case + the backend's 400 validation codes; everything else
   * falls through to a generic message.
   */
  private notifyError(err: unknown): void {
    let detailKey = 'attachments.errors.generic';
    if (err instanceof HttpErrorResponse) {
      if (err.status === 503) {
        detailKey = 'attachments.errors.unconfigured';
      } else if (err.status === 400) {
        const code = (err.error as { code?: string } | null | undefined)?.code;
        if (code === 'mime_not_allowed') detailKey = 'attachments.errors.mime_not_allowed';
        else if (code === 'file_too_large') detailKey = 'attachments.errors.file_too_large';
      } else if (err.status === 403) {
        detailKey = 'attachments.errors.forbidden';
      }
    }
    this.toast.error(detailKey);
  }
}
