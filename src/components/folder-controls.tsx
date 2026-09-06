'use client';
import { useState, useTransition } from 'react';
import { archiveFolder, moveFolder, renameFolder, reorderFolder } from '@/app/admin/actions';
import { ActionForm } from './action-form';
export function FolderControls({ clientId, folders }: { clientId: string; folders: {id:string;name:string}[] }) {
  const [pending,start]=useTransition();
  const [error,setError]=useState('');
  return <div>{folders.map((folder,index)=><div className="folder-row" key={folder.id} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();const id=event.dataTransfer.getData('text/koodos-folder');if(id)start(async()=>{try{await reorderFolder(clientId,id,folder.id);}catch{setError('Could not reorder folders. Please retry.');}});}}>
    <button className="icon-button" type="button" draggable={!pending} onDragStart={event=>event.dataTransfer.setData('text/koodos-folder',folder.id)} aria-label={'Drag '+folder.name+' to reorder'} title="Drag to reorder">⠿</button>
    <ActionForm action={renameFolder.bind(null,clientId,folder.id)} className="inline-form"><label className="sr-only" htmlFor={folder.id}>Folder name</label><input id={folder.id} name="name" defaultValue={folder.name} required maxLength={120}/><button className="button secondary">Save</button></ActionForm>
    <div className="inline-form"><ActionForm action={moveFolder.bind(null,clientId,folder.id,'up')} className="inline-form"><button className="icon-button" disabled={index===0} aria-label={'Move '+folder.name+' up'}>↑</button></ActionForm><ActionForm action={moveFolder.bind(null,clientId,folder.id,'down')} className="inline-form"><button className="icon-button" disabled={index===folders.length-1} aria-label={'Move '+folder.name+' down'}>↓</button></ActionForm><ActionForm action={archiveFolder.bind(null,clientId,folder.id)} className="inline-form" confirm="Archive this folder? Its contents will be hidden from clients until you restore it."><button className="icon-button">Archive</button></ActionForm></div>
  </div>)}{error && <p role="alert">{error}</p>}</div>;
}
