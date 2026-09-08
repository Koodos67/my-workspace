import { FolderKanban } from 'lucide-react';

/**
 * Names the project a section belongs to. The project selector sits at the top of a long page,
 * so by the time an admin is editing a work track there is nothing on screen saying which
 * project they are changing. Only project-scoped sections carry this; its absence on Members
 * and Workspace settings is the signal that those are client-wide.
 */
export function ProjectScope({ name }: { name: string }) {
  return <span className="project-scope"><FolderKanban size={13} aria-hidden="true" /><span className="sr-only">Project: </span>{name}</span>;
}
