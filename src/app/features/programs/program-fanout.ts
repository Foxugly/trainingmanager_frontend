import { firstValueFrom } from 'rxjs';
import { ProgramsService } from '../../api/api/programs.service';
import { Program } from '../../api/model/program';

/**
 * Load every program belonging to the given teams in a SINGLE request
 * (`programsList({ teamIn })`, server-side `?team__in=`), de-duplicated by
 * program id. Previously this fanned out one request per team.
 *
 * Shared by events-form (program dropdown) and events-calendar (program filter).
 *
 * Returns an empty array when `teamIds` is empty. Rejects if the request fails
 * (callers surface their own load-error toast).
 */
export async function loadProgramsForTeams(
  programsService: ProgramsService,
  teamIds: number[],
): Promise<Program[]> {
  if (teamIds.length === 0) return [];
  const res = await firstValueFrom(programsService.programsList({ teamIn: teamIds }));
  const dedup = new Map<number, Program>();
  for (const p of res.results ?? []) dedup.set(p.id, p);
  return Array.from(dedup.values());
}
