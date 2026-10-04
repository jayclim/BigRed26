'use client';
import { useEffect, useRef, useState } from 'react';
import type { Board } from '@/client/bounties.ts';
import { Button } from '@/ui/button';
import { PostForm } from './BoardScreen.tsx';
import styles from './bounties.module.css';

/** "Post a bounty" opens the existing post form in a modal. The native dialog traps focus and closes on Escape,
 *  except while the one-time poster secret is on screen: then only "I saved it" closes it. */
export function PostBountyDialog({ board, onPosted, label = 'Post a bounty', variant = 'default' }: {
  board: Board; onPosted: () => void; label?: string; variant?: 'default' | 'outline';
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  const lock = (value: boolean) => { lockedRef.current = value; setLocked(value); };
  const [formKey, setFormKey] = useState(0);
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const onClose = () => {
      // Browsers can close a dialog on Escape even when cancel is refused (no recent user activation). Never lose the one-time secret.
      if (lockedRef.current) { el.showModal(); return; }
      setFormKey((k) => k + 1); // a fresh form each time
    };
    el.addEventListener('close', onClose);
    return () => el.removeEventListener('close', onClose);
  }, []);
  const close = () => dialog.current?.close();
  return (
    <>
      <Button variant={variant} onClick={() => dialog.current?.showModal()}>{label}</Button>
      <dialog ref={dialog} className={styles.dialog} aria-labelledby="post-bounty-title"
        onCancel={(e) => { if (locked) e.preventDefault(); }}
        onClick={(e) => { if (e.target === dialog.current && !locked) close(); }}>
        <div className={styles.dialogBar}>
          <p id="post-bounty-title" className={styles.dialogTitle}>Post a bounty</p>
          <Button variant="ghost" size="sm" onClick={close} disabled={locked} aria-label="Close">Close</Button>
        </div>
        <PostForm key={formKey} board={board} onPosted={onPosted} onLockChange={lock} onFinish={close} />
      </dialog>
    </>
  );
}
