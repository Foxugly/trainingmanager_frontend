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
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ProgressSpinner } from 'primeng/progressspinner';
import { PublicService } from '../../api/api/public.service';
import { EventPublic } from '../../api/model/event-public';
import { APP_VERSION } from '../../shared/app-version';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';

/** A defensively-normalized exercise inside a public round. */
interface PublicExercise {
  modality: string | null;
  energysegment: string | null;
  distance: number | null;
  repetition: number | null;
  notes: string | null;
}

/** A defensively-normalized round for read-only public rendering. */
interface PublicRound {
  count: number | null;
  t_start: string | null;
  t_break: string | null;
  exercises: PublicExercise[];
}

function asString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value.trim() === '' ? null : value;
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    // Translatable model fields commonly serialize as {name|label|abv}.
    const name = v['name'] ?? v['label'] ?? v['abv'];
    return typeof name === 'string' ? name : null;
  }
  return String(value);
}

function asNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

@Component({
  selector: 'app-public-session',
  imports: [ProgressSpinner, EmptyStateComponent, TranslocoPipe],
  templateUrl: './public-session.component.html',
  styleUrl: './public-session.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicSessionComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly publicService = inject(PublicService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly session = signal<EventPublic | null>(null);

  protected readonly appVersion = APP_VERSION;

  /** Pretty date string (locale-independent ISO-ish), precomputed. */
  protected readonly formattedDate = computed<string | null>(() => {
    const date = this.session()?.date;
    if (!date) return null;
    const d = new Date(`${date}T00:00:00`);
    if (Number.isNaN(d.getTime())) return date;
    return d.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  });

  /** "HH:MM – HH:MM", "HH:MM" or null, precomputed. */
  protected readonly formattedTime = computed<string | null>(() => {
    const s = this.session();
    if (!s) return null;
    const start = this.shortTime(s.hour_start);
    const end = this.shortTime(s.hour_end);
    if (start && end) return `${start} – ${end}`;
    return start ?? end ?? null;
  });

  /** Defensively normalized rounds (loosely typed any[] from the API). */
  protected readonly rounds = computed<PublicRound[]>(() => {
    const raw = this.session()?.rounds ?? [];
    if (!Array.isArray(raw)) return [];
    return raw.map((r: unknown) => {
      const round = (r ?? {}) as Record<string, unknown>;
      const rawExercises = Array.isArray(round['exercises'])
        ? (round['exercises'] as unknown[])
        : [];
      const exercises: PublicExercise[] = rawExercises.map((e: unknown) => {
        const ex = (e ?? {}) as Record<string, unknown>;
        return {
          modality: asString(ex['modality']),
          energysegment: asString(ex['energysegment']),
          distance: asNumber(ex['distance']),
          repetition: asNumber(ex['repetition']),
          notes: asString(ex['notes']),
        };
      });
      return {
        count: asNumber(round['count']),
        t_start: asString(round['t_start']),
        t_break: asString(round['t_break']),
        exercises,
      };
    });
  });

  protected readonly hasRounds = computed(() => this.rounds().length > 0);

  private shortTime(value: string | null | undefined): string | null {
    if (!value) return null;
    // Backend times come as "HH:MM:SS" or "HH:MM"; keep HH:MM.
    const match = /^(\d{2}:\d{2})/.exec(value);
    return match ? match[1] : value;
  }

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.loading.set(false);
      this.error.set(true);
      return;
    }
    this.publicService
      .publicEventsRetrieve({ token })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.session.set(res);
          this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }
}
