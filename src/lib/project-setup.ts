import 'server-only';
import type { PoolClient } from 'pg';
import { activeProject } from './projects';
import { seedTracks } from './track-data';

/**
 * Filing that is not a delivery stage. The paperwork that starts a project has to live
 * somewhere, and it does not belong under Discovery.
 */
export const EXTRA_FOLDERS = ['Proposals & commercials'];

/**
 * Every delivery stage gets a folder of the same name, linked to that stage, so a client
 * following the progress spine lands somewhere real instead of an empty workspace — and so the
 * studio never has to invent a filing scheme twice.
 *
 * Operate is excluded on purpose: an ongoing service is not a stage of delivery and has no
 * deliverable to file under it. Folders are ordinary folders once created — rename, reorder,
 * archive or reassign them freely.
 */
export async function seedStandardFolders(db: PoolClient, clientId: string, projectId: string,
  tracks: { id: string; name: string; recurring: boolean }[]) {
  let position = 1000;
  for (const track of tracks.filter(track => !track.recurring)) {
    await db.query('INSERT INTO folders(client_id,project_id,name,position,track_id) VALUES($1,$2,$3,$4,$5)',
      [clientId, projectId, track.name, position, track.id]);
    position += 1000;
  }
  for (const name of EXTRA_FOLDERS) {
    await db.query('INSERT INTO folders(client_id,project_id,name,position) VALUES($1,$2,$3,$4)',
      [clientId, projectId, name, position]);
    position += 1000;
  }
}

/** Everything a new project starts with: the seven standard tracks and their folders. */
export async function seedProject(db: PoolClient, clientId: string, projectId?: string) {
  const project = await activeProject(db, clientId, projectId);
  const tracks = await seedTracks(db, clientId, project);
  await seedStandardFolders(db, clientId, project, tracks);
  return project;
}
