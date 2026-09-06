'use client';
import { useState, useRef, useEffect, useId } from 'react';
import { put } from '@vercel/blob/client';
import { useRouter } from 'next/navigation';
import { FileUp, FolderInput, UploadCloud } from 'lucide-react';
import { prepareUpload, finishUpload } from '@/app/admin/content-actions';

async function withDeadline<T>(work: Promise<T>, message: string, abort?: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(message));
          abort?.abort();
        }, 45_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function UploadPanel({ clientId, folderId = '', itemId, folders = [] }: { clientId: string; folderId?: string; itemId?: string; folders?: { id: string; name: string }[] }) {
  const [busy,setBusy]=useState(false), [message,setMessage]=useState(''), [error,setError]=useState(false);
  const [selectedFolder,setSelectedFolder]=useState(folderId), [note,setNote]=useState('');
  const [ready,setReady]=useState(false);
  const [dragging,setDragging]=useState(false);
  useEffect(()=>setReady(true),[]);
  const input = useRef<HTMLInputElement>(null);
  // Drag events fire for every child element, so depth tracks enter/leave pairs instead of toggling.
  const depth = useRef(0);
  const inputId = useId();
  const router=useRouter();
  async function upload(files: FileList | File[]) {
    if (!ready || busy || !files.length) return;
    setBusy(true);setError(false);
    let count=0;
    try {
      for (const file of Array.from(files).slice(0,itemId?1:20)) {
        if (!file.size || file.size>25*1024*1024) throw new Error(`${file.name}: maximum file size is 25 MB.`);
        let title=file.name.replace(/\.[^.]+$/,'').replace(/[_-]/g,' ');
        if (/\.html?$/i.test(file.name)) {
          const document=new DOMParser().parseFromString(await file.text(),'text/html');
          title=document.title.trim() || title;
        }
        const form=new FormData();
        Object.entries({filename:file.name,size:String(file.size),title:title.slice(0,120),mime:file.type || 'application/octet-stream',folderId:selectedFolder,itemId:itemId || '',note}).forEach(([key,value])=>form.set(key,value));
        setMessage(`Preparing ${file.name}…`);
        const prepared = await withDeadline(
          prepareUpload(clientId, form),
          'Preparing the upload timed out. Please retry.',
        );
        const abort = new AbortController();
        await withDeadline(
          put(prepared.pathname, file, {
            access: 'private',
            token: prepared.token,
            contentType: prepared.mime,
            multipart: file.size > 4 * 1024 * 1024,
            abortSignal: abort.signal,
            onUploadProgress: event => {
              if (!abort.signal.aborted) setMessage(`Uploading ${file.name}: ${Math.round(event.percentage)}%`);
            },
          }),
          'Transferring the file timed out. Please retry.',
          abort,
        );
        setMessage(`Saving ${file.name}…`);
        // Server actions cannot be cancelled by the browser. A late save may still commit.
        await withDeadline(
          finishUpload(prepared.receipt),
          'Saving the file timed out. Refresh and check the item before uploading again; it may still finish saving.',
        );
        count++;
      }
      setMessage(itemId?'New version saved. The item address is unchanged.':`${count} file${count===1?'':'s'} added as drafts. Preview them before publishing.`);
      router.refresh();
    } catch(error) {setError(true);setMessage((count?`${count} uploaded. `:'')+(error instanceof Error?error.message:'Upload failed. Please retry.'));router.refresh();}
    finally {setBusy(false);if(input.current) input.current.value='';depth.current=0;setDragging(false);}
  }

  const disabled = !ready || busy;
  return <div className="upload-panel">
    {!itemId && folders.length>0 && <label className="upload-target">
      <span><FolderInput size={15} strokeWidth={1.75} aria-hidden="true" /> Upload into</span>
      <select disabled={disabled} value={selectedFolder} onChange={event=>setSelectedFolder(event.target.value)}>
        <option value="">Workspace root</option>
        {folders.map(folder=><option key={folder.id} value={folder.id}>{folder.name}</option>)}
      </select>
    </label>}

    {itemId && <label className="upload-target">
      <span>Version note</span>
      <input value={note} disabled={busy} onChange={event=>setNote(event.target.value)} maxLength={300} placeholder="What changed? (optional)" />
    </label>}

    <div
      className={'dropzone' + (dragging ? ' is-dragging' : '') + (busy ? ' is-busy' : '')}
      onDragEnter={event=>{if(!event.dataTransfer.types.includes('Files'))return;event.preventDefault();depth.current+=1;setDragging(true);}}
      onDragOver={event=>{if(!event.dataTransfer.types.includes('Files'))return;event.preventDefault();event.dataTransfer.dropEffect='copy';}}
      onDragLeave={()=>{depth.current=Math.max(0,depth.current-1);if(depth.current===0)setDragging(false);}}
      onDrop={event=>{event.preventDefault();depth.current=0;setDragging(false);void upload(event.dataTransfer.files);}}
    >
      <span className="dropzone-icon" aria-hidden="true">
        {itemId ? <FileUp size={26} strokeWidth={1.6} /> : <UploadCloud size={30} strokeWidth={1.6} />}
      </span>
      <p className="dropzone-title">{dragging
        ? (itemId ? 'Release to upload the new version' : 'Release to upload')
        : (itemId ? 'Drag a new version here' : 'Drag and drop files here')}</p>
      <p className="dropzone-or"><span>or</span></p>
      <label className={'button' + (disabled ? ' is-disabled' : '')} htmlFor={inputId}>
        {itemId ? 'Choose a replacement' : 'Choose files'}
      </label>
      <input
        ref={input} id={inputId} className="dropzone-input" type="file"
        aria-label={itemId?'Choose replacement file':'Choose files to upload'}
        disabled={disabled} multiple={!itemId}
        onChange={event=>{if(event.target.files) void upload(event.target.files);}}
      />
      <p className="dropzone-hint muted">
        {itemId
          ? 'One file, up to 25 MB. Existing versions stay available at their own address.'
          : 'HTML, PDFs, images and other files · up to 25 MB each · stays private and starts as a draft'}
      </p>
    </div>

    {message && <p className={'upload-message ' + (error?'form-error':'muted')} role={error?'alert':'status'}>{message}</p>}
  </div>;
}
