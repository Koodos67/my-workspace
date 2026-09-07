'use client';
import { useState, useTransition } from 'react';
import { ArchiveIcon, ArrowDown, ArrowUp, Folder, GripVertical } from 'lucide-react';
import { archiveFolder, moveFolder, renameFolder, reorderFolder } from '@/app/admin/actions';
import { ActionForm } from './action-form';

const DRAG_TYPE = 'text/koodos-folder';

export function FolderControls({ clientId, folders, tracks }: { clientId: string; folders: { id: string; name: string; track_id: string | null }[]; tracks: { id: string; name: string; archived_at: string | null }[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState('');
  const [over, setOver] = useState('');

  function drop(event: React.DragEvent, beforeId: string | null) {
    event.preventDefault();
    setOver('');
    setDragging('');
    const id = event.dataTransfer.getData(DRAG_TYPE);
    if (!id || id === beforeId) return;
    start(async () => {
      try {
        await reorderFolder(clientId, id, beforeId);
        setError('');
      } catch {
        setError('Could not reorder folders. Please retry.');
      }
    });
  }

  function allow(event: React.DragEvent, target: string) {
    if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setOver(target);
  }

  if (!folders.length) {
    return <p className="muted folder-empty">No folders yet. Everything you upload sits in the workspace root until you add one.</p>;
  }

  return <div className="folder-list" data-dragging={dragging ? 'true' : undefined}>
    {folders.map((folder, index) => <div
      key={folder.id}
      className={'folder-row' + (over === folder.id ? ' is-over' : '') + (dragging === folder.id ? ' is-dragging' : '')}
      onDragOver={event => allow(event, folder.id)}
      onDragLeave={() => setOver(current => current === folder.id ? '' : current)}
      onDrop={event => drop(event, folder.id)}
    >
      <button
        className="drag-handle" type="button" draggable={!pending}
        onDragStart={event => { event.dataTransfer.setData(DRAG_TYPE, folder.id); event.dataTransfer.effectAllowed = 'move'; setDragging(folder.id); }}
        onDragEnd={() => { setDragging(''); setOver(''); }}
        aria-label={'Drag ' + folder.name + ' to reorder'} title="Drag to reorder"
      ><GripVertical size={17} strokeWidth={2} aria-hidden="true" /></button>

      <span className="type-icon" data-kind="folder"><Folder size={17} strokeWidth={1.75} aria-hidden="true" /></span>

      <ActionForm action={renameFolder.bind(null, clientId, folder.id)} className="folder-name">
        <label className="sr-only" htmlFor={folder.id}>Folder name</label>
        <input id={folder.id} name="name" defaultValue={folder.name} required maxLength={120} />
        <label className="sr-only" htmlFor={'track-'+folder.id}>Work track for {folder.name}</label>
        <select id={'track-'+folder.id} name="track_id" defaultValue={folder.track_id || ''}>
          <option value="">No work track</option>
          {tracks.filter(track => !track.archived_at).map(track => <option key={track.id} value={track.id}>{track.name}</option>)}
          {tracks.filter(track => track.archived_at && track.id === folder.track_id).map(track => <option key={track.id} value={track.id} disabled>{track.name} (archived — choose another)</option>)}
        </select>
        <button className="button secondary compact">Save</button>
      </ActionForm>

      <div className="folder-actions">
        <ActionForm action={moveFolder.bind(null, clientId, folder.id, 'up')} className="inline-form">
          <button className="icon-button" disabled={index === 0} aria-label={'Move ' + folder.name + ' up'} title="Move up"><ArrowUp size={16} aria-hidden="true" /></button>
        </ActionForm>
        <ActionForm action={moveFolder.bind(null, clientId, folder.id, 'down')} className="inline-form">
          <button className="icon-button" disabled={index === folders.length - 1} aria-label={'Move ' + folder.name + ' down'} title="Move down"><ArrowDown size={16} aria-hidden="true" /></button>
        </ActionForm>
        <ActionForm action={archiveFolder.bind(null, clientId, folder.id)} className="inline-form" confirm="Archive this folder? Its contents will be hidden from clients until you restore it.">
          <button className="icon-button danger"><ArchiveIcon size={16} aria-hidden="true" /><span className="button-text">Archive</span></button>
        </ActionForm>
      </div>
    </div>)}

    <div
      className={'folder-drop-end' + (over === 'end' ? ' is-over' : '')}
      onDragOver={event => allow(event, 'end')}
      onDragLeave={() => setOver(current => current === 'end' ? '' : current)}
      onDrop={event => drop(event, null)}
      aria-hidden="true"
    >Drop here to place last</div>

    {pending && <p role="status" className="muted">Reordering…</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </div>;
}
