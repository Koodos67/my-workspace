'use client';
import { useEffect, useState } from 'react';
export function ArtifactViewer({ itemId, versionId, title, nonce }: {itemId:string;versionId:string;title:string;nonce:string}) {
  const [html,setHtml]=useState<string>(),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const abort=new AbortController();
    setHtml(undefined);setError('');
    async function load() {
      const response=await fetch(`/api/items/${itemId}/file?version=${versionId}`,{cache:'no-store',signal:abort.signal});
      if(!response.ok) throw new Error('File is unavailable.');
      const signed=await response.json();
      const file=await fetch(signed.url,{credentials:'omit',referrerPolicy:'no-referrer',signal:abort.signal});
      if(!file.ok) throw new Error('File could not be loaded.');
      const doc=new DOMParser().parseFromString(await file.text(),'text/html');
      const activeNonce=document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce || nonce;
      // The opaque sandbox has its own restrictive policy, in addition to the portal CSP.
      // Only inline scripts from the self-contained document may run. No network or parent access.
      doc.querySelectorAll('script').forEach(script=>{if(script.src)script.remove();else script.setAttribute('nonce',activeNonce);});
      doc.querySelectorAll('base,meta[http-equiv="refresh"]').forEach(element=>element.remove());
      const policy=doc.createElement('meta');
      policy.httpEquiv='Content-Security-Policy';
      policy.content=`default-src 'none'; script-src 'nonce-${activeNonce}'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'; object-src 'none'`;
      doc.head.prepend(policy);
      setHtml('<!doctype html>'+doc.documentElement.outerHTML);
    }
    load().catch(()=>{if(!abort.signal.aborted)setError('The preview could not load. Retry or download the original file.');});
    return ()=>abort.abort();
  },[itemId,versionId,nonce,attempt]);
  if(error)return <div className="notice" role="alert">{error} <button className="button secondary" onClick={()=>setAttempt(a=>a+1)}>Retry preview</button></div>;
  if(!html)return <p role="status">Loading artifact…</p>;
  return <iframe className="artifact-frame" title={title} srcDoc={html} sandbox="allow-scripts" referrerPolicy="no-referrer"/>;
}
