import 'server-only';
import type { PoolClient } from 'pg';
import { activeClient } from './content';

export type Project = { id: string; client_id: string; name: string; description: string; archived_at: Date | null };

export async function readProjects(db: PoolClient, clientId: string, includeArchived = false): Promise<Project[]> {
  return (await db.query('SELECT * FROM projects WHERE client_id=$1 AND ($2::boolean OR archived_at IS NULL) ORDER BY created_at,id', [clientId, includeArchived])).rows;
}

// An omitted project is only unambiguous for a client with exactly one active project.
export async function activeProject(db: PoolClient, clientId: string, projectId?: string | null, folderId?: string | null) {
  await activeClient(db, clientId);
  const projects = await readProjects(db, clientId);
  const project = projectId ? projects.find(p => p.id === projectId) : projects.length === 1 ? projects[0] : undefined;
  if (!project) throw new Error('Choose an active project for this client.');
  if (folderId && !(await db.query('SELECT id FROM folders WHERE id=$1 AND project_id=$2 AND archived_at IS NULL', [folderId, project.id])).rowCount) throw new Error('Choose an active folder in this project.');
  return project.id;
}
