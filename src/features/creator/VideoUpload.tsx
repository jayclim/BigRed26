'use client';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { useEffect, useRef, useState } from 'react';
import type { Id, Result } from '@contracts/contracts.ts';
import type { StoredMedia } from '@/server/media/media.ts';
import { MEDIA_ACCEPT, MEDIA_LIMIT_TEXT, mediaInputError, mediaPickError } from '@/shared/mediaLimits.ts';
import { compressionErrorMessage, compressVideo } from './compressVideo.ts';
import styles from './creator.module.css';

type Message = { kind: 'error'; text: string } | { kind: 'ok'; media: StoredMedia };

export function VideoUpload({ onCreateDraft, onSelectionChange, extractionBusy, extractionDisabled }: {
  onCreateDraft: (mediaId: Id) => void; onSelectionChange?: () => void; extractionBusy: boolean; extractionDisabled: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [original, setOriginal] = useState<File | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const compressionRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

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
  useEffect(() => () => {
    requestRef.current?.abort();
    generationRef.current += 1;
    compressionRef.current?.abort();
  }, []);

  function cancelCompression() {
    generationRef.current += 1;
    compressionRef.current?.abort();
    compressionRef.current = null;
    setCompressing(false); setProgress(0);
  }

  function select(selected: File | null) {
    cancelCompression();
    onSelectionChange?.();
    setMessage(null);
    const error = selected && mediaPickError(selected);
    setFile(error ? null : selected);
    setOriginal(error ? null : selected);
    if (error) {
      setMessage({ kind: 'error', text: error });
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function chooseAnother() {
    cancelCompression();
    onSelectionChange?.();
    setFile(null); setOriginal(null); setMessage(null);
    if (inputRef.current) { inputRef.current.value = ''; inputRef.current.focus(); }
  }

  async function compress() {
    if (!original || busy || compressing || extractionBusy) return;
    cancelCompression();
    onSelectionChange?.();
    const generation = generationRef.current;
    const controller = new AbortController();
    compressionRef.current = controller;
    setCompressing(true); setProgress(0); setMessage(null);
    try {
      const result = await compressVideo(original, {
        signal: controller.signal,
        onProgress: (value) => {
          if (generation === generationRef.current && !controller.signal.aborted) {
            setProgress(Math.round(Math.max(0, Math.min(1, value)) * 100));
          }
        },
      });
      if (generation !== generationRef.current || controller.signal.aborted) return;
      setFile(result);
      if (mediaInputError(result)) {
        setMessage({ kind: 'error', text: 'The compressed video is still too large or cannot be uploaded. Trim the clip on your phone to make a shorter clip.' });
      }
    } catch (error) {
      if (generation !== generationRef.current || controller.signal.aborted) return;
      setMessage({ kind: 'error', text: compressionErrorMessage(error) });
    } finally {
      if (generation === generationRef.current) {
        compressionRef.current = null;
        setCompressing(false);
      }
    }
  }

  function useOriginal() {
    cancelCompression();
    onSelectionChange?.();
    setFile(original); setMessage(null);
  }

  async function upload() {
    if (!file || busy || compressing || extractionBusy || mediaInputError(file)) return;
    onSelectionChange?.();
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
      <div className={styles.videoHead}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="6" width="13" height="12" rx="3" /><path d="M16 10l5-3v10l-5-3" />
        </svg>
        <div>
          <h2 id="media-heading">Teach from a video</h2>
          <p className="meta">Pick a route video to preview and store on this computer. Create a draft after storing the video, then check every step.</p>
        </div>
      </div>
      <label htmlFor="route-video">
        Route video
        <Input ref={inputRef} id="route-video" type="file" accept={MEDIA_ACCEPT}
          disabled={busy || extractionBusy} aria-describedby="media-limits"
          onChange={(e) => select(e.currentTarget.files?.[0] ?? null)} />
      </label>
      <p className="meta" id="media-limits">{MEDIA_LIMIT_TEXT}</p>
      <p className="meta">Larger supported videos can be compressed on this device before upload.</p>
      {file && (
        <>
          <p className="media-filename"><strong>{file.name}</strong> · {file.size.toLocaleString()} bytes ({(file.size / (1024 * 1024)).toFixed(2)} MB)</p>
          {original && <p className="meta">Original size: {(original.size / (1024 * 1024)).toFixed(2)} MB
            {file !== original && <> · Output size: {(file.size / (1024 * 1024)).toFixed(2)} MB</>}</p>}
          {file === original && mediaInputError(file) && <p className="notice error">Too large to upload. Compress on this device</p>}
          {preview && <video className="media-preview" src={preview} controls muted playsInline preload="metadata" aria-label={`Local preview of ${file.name}`} />}
        </>
      )}
      {compressing && <div className="media-message" role="status">
        <p>Compressing on this device… {progress}%</p>
        <progress value={progress} max={100} aria-label="Video compression progress">{progress}%</progress>
        <Button variant="outline" onClick={cancelCompression}>Cancel</Button>
      </div>}
      <div className="row">
        <Button disabled={!file || busy || compressing || extractionBusy || !!(file && mediaInputError(file)) || message?.kind === 'ok'} aria-busy={busy} onClick={upload}>
          {busy ? 'Uploading…' : message?.kind === 'error' && file ? 'Retry upload' : 'Upload video'}
        </Button>
        {original && file === original && <Button variant="outline" disabled={busy || compressing || extractionBusy} onClick={compress}>
          {mediaInputError(original) ? 'Compress' : 'Compress first'}
        </Button>}
        {original && file !== original && !mediaInputError(original) && <Button variant="outline" disabled={busy || extractionBusy} onClick={useOriginal}>Use original</Button>}
        {(file || message) && <Button variant="outline" disabled={busy || extractionBusy} onClick={chooseAnother}>Choose another file</Button>}
      </div>
      {message && (
        <div ref={messageRef} tabIndex={-1} className={`notice ${message.kind} media-message`}
          role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.kind === 'error'
            ? <p>{message.text}</p>
            : <>
              <p><strong>Stored locally:</strong> {message.media.name}</p>
              <Button disabled={extractionBusy || extractionDisabled} aria-busy={extractionBusy}
                onClick={() => onCreateDraft(message.media.mediaId)}>Create draft from this video</Button>
            </>}
        </div>
      )}
    </section>
  );
}
