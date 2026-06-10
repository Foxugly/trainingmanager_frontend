import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AttachmentsService } from '../../api/api/attachments.service';
import { Attachment } from '../../api/model/attachment';
import { TargetTypeEnum } from '../../api/model/target-type-enum';

/**
 * Orchestrates the 3-step S3 presigned-upload dance and download helpers.
 *
 * 1. presign  → backend mints a short-lived S3 PUT URL + a `pending` Attachment.
 * 2. PUT      → the raw file bytes go DIRECTLY to S3 via native `fetch` so no
 *               Angular HttpClient interceptor (Authorization / Accept-Language)
 *               touches the cross-origin S3 request.
 * 3. complete → backend HEADs the object, records its size, flips to `ready`.
 *
 * The backend returns HTTP 503 `{code:'attachments_unconfigured'}` from every
 * endpoint while the S3 bucket env var is unset (infra provisioned separately);
 * callers should detect that and toast gracefully rather than crash.
 */
@Injectable({ providedIn: 'root' })
export class AttachmentUploadService {
  private readonly attachments = inject(AttachmentsService);

  /**
   * Upload a single file against an event or message target and resolve with
   * the ready Attachment. Rejects on presign/PUT/complete failure so the caller
   * can map + toast the error.
   */
  async upload(
    file: File,
    targetType: 'event' | 'message' | 'program' | 'performance',
    targetId: number,
  ): Promise<Attachment> {
    const presign = await firstValueFrom(
      this.attachments.attachmentsPresignCreate({
        presignUploadRequestRequest: {
          target_type: targetType as TargetTypeEnum,
          target_id: targetId,
          filename: file.name,
          content_type: file.type || 'application/octet-stream',
          size: file.size,
        },
      }),
    );

    // Step 2: raw bytes straight to S3. NOT HttpClient — the presigned URL is
    // signed for this exact method + Content-Type; an extra Authorization
    // header would break the signature and trigger CORS pre-flight.
    const putResponse = await fetch(presign.upload_url, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': presign.headers['Content-Type'] },
    });
    if (!putResponse.ok) {
      throw new Error(`S3 upload failed with status ${putResponse.status}`);
    }

    return firstValueFrom(this.attachments.attachmentsCompleteCreate({ id: presign.attachment_id }));
  }

  /** Mint a presigned GET URL and open it in a new tab. */
  async download(id: number): Promise<void> {
    const res = await firstValueFrom(this.attachments.attachmentsDownloadRetrieve({ id }));
    window.open(res.url, '_blank', 'noopener');
  }

  /** Human-readable file size (e.g. "3.2 MB", "812 KB", "0 B"). */
  formatSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, exp);
    const rounded = exp === 0 ? value : Math.round(value * 10) / 10;
    return `${rounded} ${units[exp]}`;
  }
}
