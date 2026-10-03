'use client';
import { useEffect, useRef, useState } from 'react';
import type { Id, Result } from '@contracts/contracts.ts';
import type { StoredMedia } from '@/server/media/media.ts';
import { MEDIA_ACCEPT, MEDIA_LIMIT_TEXT, mediaInputError } from '@/shared/mediaLimits.ts';

type Message = { kind: 'error'; text: string } | { kind: 'ok'; media: StoredMedia };

export function VideoUpload({ onCreateDraft, extractionBusy, extractionDisabled }: {
  onCreateDraft: (mediaId: Id) => void; extractionBusy: boolean; extractionDisabled: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (message) {
      messageRef.current?.focus();
      messageRef.current?.scrollIntoView({ block: 'center' });
    }
  }, [message]);
  useEffect(() => () => requestRef.current?.abort(), []);

  function select(selected: File | null) {
    setMessage(null);
    const error = selected && mediaInputError(selected);
    setFile(error ? null : selected);
    if (error) {
      setMessage({ kind: 'error', text: error });
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function chooseAnother() {
    setFile(null); setMessage(null);
    if (inputRef.current) { inputRef.current.value = ''; inputRef.current.focus(); }
  }

  async function upload() {
    if (!file || busy) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(true); setMessage(null);
    try {
      const form = new FormData();
      form.set('file', file);
      const response = await fetch('/api/media', { method: 'POST', body: form, signal: controller.signal });
      const result: Result<StoredMedia> = await response.json();
      setMessage(result.ok && response.ok
        ? { kind: 'ok', media: result.value }
        : { kind: 'error', text: result.ok ? 'The upload failed. Retry the upload.' : result.error.message });
    } catch {
      if (!controller.signal.aborted) setMessage({ kind: 'error', text: 'The upload could not finish. Check your connection to this app and retry.' });
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      requestRef.current = null;
    }
  }

  return (
    <section className="step media-upload" aria-labelledby="media-heading">
      <h2 id="media-heading">Teach from a video</h2>
      <p className="meta">Pick a route video to preview and store on this computer. Create a draft after storing the video, then check every step.</p>
      <label htmlFor="route-video">
        Route video
        <input ref={inputRef} id="route-video" type="file" accept={MEDIA_ACCEPT}
          disabled={busy || extractionBusy} aria-describedby="media-limits"
          onChange={(e) => select(e.currentTarget.files?.[0] ?? null)} />
      </label>
      <p className="meta" id="media-limits">{MEDIA_LIMIT_TEXT}</p>
      {file && (
        <>
          <p className="media-filename"><strong>{file.name}</strong> · {file.size.toLocaleString()} bytes ({(file.size / (1024 * 1024)).toFixed(2)} MB)</p>
          {preview && <video className="media-preview" src={preview} controls muted playsInline preload="metadata" aria-label={`Local preview of ${file.name}`} />}
        </>
      )}
      <div className="row">
        <button className="btn btn-primary" disabled={!file || busy || message?.kind === 'ok'} aria-busy={busy} onClick={upload}>
          {busy ? 'Uploading…' : message?.kind === 'error' && file ? 'Retry upload' : 'Upload video'}
        </button>
        {(file || message) && <button className="btn" disabled={busy || extractionBusy} onClick={chooseAnother}>Choose another file</button>}
      </div>
      {message && (
        <div ref={messageRef} tabIndex={-1} className={`notice ${message.kind} media-message`}
          role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.kind === 'error'
            ? <p>{message.text} Choose another file{file ? ' or retry the upload' : ''}.</p>
            : <>
              <p><strong>Stored locally:</strong> {message.media.name}</p>
              <button className="btn btn-primary" disabled={extractionBusy || extractionDisabled} aria-busy={extractionBusy}
                onClick={() => onCreateDraft(message.media.mediaId)}>Create draft from this video</button>
            </>}
        </div>
      )}
    </section>
  );
}
