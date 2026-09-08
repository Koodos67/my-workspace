import Link from 'next/link';
import type { Project } from '@/lib/projects';
import { ActionForm } from './action-form';
import { archiveProject, createProject, updateProject } from '@/app/admin/project-actions';

export function ProjectNavigation({ projects, selected, base, clientId }: {
  projects: Project[]; selected?: Project; base: string; clientId?: string;
}) {
  return <section className="form-panel project-navigation" aria-label="Projects">
    <div className="section-top"><h2>Projects</h2><span className="muted">{projects.filter(p => !p.archived_at).length} active</span></div>
    <nav className="board-filters" aria-label="Choose project">
      {projects.filter(p => !p.archived_at).map(project => <Link key={project.id} href={base + '?project=' + project.id} aria-current={selected?.id === project.id ? 'page' : undefined}>{project.name}</Link>)}
    </nav>
    {selected && <div className="project-heading"><h2>{selected.name}</h2>{selected.description && <p className="muted">{selected.description}</p>}</div>}
    {!selected && <p className="muted">{clientId ? 'Create a project or restore an archived one to organise the work.' : 'There are no active projects to show yet.'}</p>}
    {clientId && <>
      <details className="sub-panel"><summary>Add a project</summary>
        <ActionForm action={createProject.bind(null, clientId)}>
          <label>Project name<input name="name" required maxLength={120} /></label>
          <label className="wide">Project description<textarea name="description" maxLength={500} /></label>
          <p className="muted wide">Each project starts with its own standard work tracks. Client members can access every active project.</p>
          <button className="button">Create project</button>
        </ActionForm>
      </details>
      {selected && <details className="sub-panel"><summary>Project settings</summary>
        {/* Keyed so switching project reseeds these uncontrolled defaults rather than leaving
            the previous project's name and description sitting in the fields. */}
        <ActionForm key={selected.id} action={updateProject.bind(null, clientId, selected.id)} success="Project updated.">
          <label>Project name<input name="name" defaultValue={selected.name} required maxLength={120} /></label>
          <label className="wide">Project description<textarea name="description" defaultValue={selected.description} maxLength={500} /></label>
          <button className="button">Save project</button>
        </ActionForm>
        <p className="muted">Archiving hides this project and its contents from client members. Files and approval history are retained.</p>
        <ActionForm className="inline-form" action={archiveProject.bind(null, clientId, selected.id, false)} confirm={'Archive ' + selected.name + ' and hide it from client members?'}>
          <button className="button secondary">Archive project</button>
        </ActionForm>
      </details>}
      {projects.some(p => p.archived_at) && <details className="sub-panel"><summary>Archived projects</summary>
        <p className="muted">Restoring a project makes its previously published content visible again.</p>
        {projects.filter(p => p.archived_at).map(project => <div key={project.id} className="member-row"><span>{project.name}</span>
          <ActionForm className="inline-form" action={archiveProject.bind(null, clientId, project.id, true)}><button className="button secondary">Restore {project.name}</button></ActionForm>
        </div>)}
      </details>}
    </>}
  </section>;
}
