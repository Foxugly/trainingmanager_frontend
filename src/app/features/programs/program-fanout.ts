import { firstValueFrom } from 'rxjs';
import { ProgramsService } from '../../api/api/programs.service';
import { Program } from '../../api/model/program';

/**
 * Fan out one `programsList({ team })` request per team id, await them all, then
 * merge + de-duplicate the results by program id (a program could in principle
 * surface under more than one team query). Returns the deduped program list.
 *
 * Shared by events-form (program dropdown) and events-calendar (program filter),
 * which previously each carried a near-identical copy of this logic.
 *
 * Returns an empty array when `teamIds` is empty. Rejects if any underlying
 * request fails (callers surface their own load-error toast).
 */
export async function loadProgramsForTeams(
  programsService: ProgramsService,
  teamIds: number[],
): Promise<Program[]> {
  if (teamIds.length === 0) return [];
  const requests = teamIds.map((teamId) =>
    firstValueFrom(programsService.programsList({ team: teamId })),
  );
  const responses = await Promise.all(requests);
  const all: Program[] = responses.flatMap((r) => r.results ?? []);
  const dedup = new Map<number, Program>();
  for (const p of all) dedup.set(p.id, p);
  return Array.from(dedup.values());
}
