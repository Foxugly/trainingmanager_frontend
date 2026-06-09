import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'primeng/button';
import QRCode from 'qrcode';
import { firstValueFrom } from 'rxjs';
import { EventsService } from '../../../api/api/events.service';
import { ExercisesService } from '../../../api/api/exercises.service';
import { RoundsService } from '../../../api/api/rounds.service';
import { Event } from '../../../api/model/event';
import { Exercise } from '../../../api/model/exercise';
import { Round } from '../../../api/model/round';

@Component({
  selector: 'app-event-print',
  imports: [CommonModule, RouterLink, Button, TranslocoPipe],
  templateUrl: './event-print.component.html',
  styleUrl: './event-print.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventPrintComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly eventsService = inject(EventsService);
  private readonly roundsService = inject(RoundsService);
  private readonly exercisesService = inject(ExercisesService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly eventId = signal<number | null>(null);
  protected readonly event = signal<Event | null>(null);
  protected readonly rounds = signal<Round[]>([]);
  protected readonly exercisesByRound = signal<Map<number, Exercise[]>>(new Map());
  protected readonly loading = signal(false);
  protected readonly notFound = signal(false);

  /** Absolute public URL of the session, encoded in the QR code. */
  protected readonly publicUrl = signal('');
  /** PNG data-URL of the QR code rendered into <img>. */
  protected readonly qrDataUrl = signal<string | null>(null);

  protected readonly eventTotalDistance = computed<number>(() => {
    let total = 0;
    for (const round of this.rounds()) {
      total += this.roundTotalDistance(round);
    }
    return total;
  });

  protected exerciseDistance(ex: Exercise): number {
    const rep = ex.repetition ?? 1;
    const dist = ex.distance ?? 0;
    return rep * dist;
  }

  protected roundDistancePerIteration(round: Round): number {
    const exercises = this.exercisesByRound().get(round.id) ?? [];
    return exercises.reduce((sum, ex) => sum + this.exerciseDistance(ex), 0);
  }

  protected roundTotalDistance(round: Round): number {
    return (round.count ?? 1) * this.roundDistancePerIteration(round);
  }

  protected hasNonZeroTime(value: string | null | undefined): boolean {
    if (!value) return false;
    return /[1-9]/.test(value);
  }

  protected formatDistance(meters: number): string {
    if (meters >= 1000) {
      const km = meters / 1000;
      return `${km % 1 === 0 ? km.toFixed(0) : km.toFixed(1)} km`;
    }
    return `${meters} m`;
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : NaN;
    if (!Number.isFinite(id)) {
      this.notFound.set(true);
      return;
    }
    this.eventId.set(id);
    // Build the absolute public URL athletes scan to open the session on mobile.
    this.publicUrl.set(`${window.location.origin}/events/${id}`);
    void this.generateQrCode();
    this.loadEvent(id);
  }

  private async generateQrCode(): Promise<void> {
    try {
      const dataUrl = await QRCode.toDataURL(this.publicUrl(), { width: 240, margin: 1 });
      this.qrDataUrl.set(dataUrl);
    } catch {
      // A failed QR render must not block the printable sheet.
      this.qrDataUrl.set(null);
    }
  }

  protected print(): void {
    window.print();
  }

  private loadEvent(id: number): void {
    this.loading.set(true);
    this.eventsService
      .eventsRetrieve({ id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (e) => {
          this.event.set(e);
          this.loading.set(false);
          void this.loadRoundsAndExercises(e.rounds ?? []);
        },
        error: () => {
          this.notFound.set(true);
          this.loading.set(false);
        },
      });
  }

  private async loadRoundsAndExercises(roundIds: readonly number[]): Promise<void> {
    if (roundIds.length === 0) {
      this.rounds.set([]);
      this.exercisesByRound.set(new Map());
      return;
    }
    try {
      const roundResults = await Promise.allSettled(
        roundIds.map((rid) => firstValueFrom(this.roundsService.roundsRetrieve({ id: rid }))),
      );
      const fetchedRounds: Round[] = [];
      for (const r of roundResults) {
        if (r.status === 'fulfilled') fetchedRounds.push(r.value);
      }
      const sortedRounds = [...fetchedRounds].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      this.rounds.set(sortedRounds);

      const exerciseFetches = sortedRounds.map(async (round) => {
        const ids = round.exercises ?? [];
        const settled = await Promise.allSettled(
          ids.map((eid) => firstValueFrom(this.exercisesService.exercisesRetrieve({ id: eid }))),
        );
        const fulfilled: Exercise[] = [];
        for (const s of settled) {
          if (s.status === 'fulfilled') fulfilled.push(s.value);
        }
        const sorted = [...fulfilled].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        return [round.id, sorted] as const;
      });
      const entries = await Promise.all(exerciseFetches);
      const map = new Map<number, Exercise[]>();
      for (const [rid, list] of entries) {
        map.set(rid, list);
      }
      this.exercisesByRound.set(map);
    } catch {
      // Keep whatever loaded; the sheet still prints what it has.
    }
  }
}
