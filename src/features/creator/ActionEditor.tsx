'use client';
import { Button } from '@/ui/button';
import { Textarea } from '@/ui/textarea';
import { Input } from '@/ui/input';
import type { CheckpointAction, Locale } from '@contracts/contracts.ts';

const KINDS: CheckpointAction['kind'][] = ['turn', 'door', 'elevator', 'stairs', 'pass_side', 'other'];
const LOCALES: Locale[] = ['en', 'es'];

export function ActionEditor({ action, disabled, onChange }: {
  action?: CheckpointAction; disabled: boolean; onChange: (action: CheckpointAction | undefined) => void;
}) {
  const patch = (value: Partial<CheckpointAction>) => action && onChange({ ...action, ...value });
  return (
    <fieldset className="action-editor" disabled={disabled}>
      <legend>Action details</legend>
      <label>
        Action kind
        <select value={action?.kind ?? ''} onChange={(e) => onChange(e.target.value
          ? { ...(action ?? { target: '', side: null, targetFloor: null, steps: [], completion: { en: '', es: '' } }), kind: e.target.value as CheckpointAction['kind'] }
          : undefined)}>
          <option value="">Simple direction (no action)</option>
          {KINDS.map((kind) => <option key={kind} value={kind}>{kind.replace('_', ' ')}</option>)}
        </select>
      </label>
      {action && <>
        <label>Target sign, label or landmark
          <Input value={action.target} maxLength={500} onChange={(e) => patch({ target: e.target.value })} />
        </label>
        <div className="langs">
          <label>Side from the recorded approach
            <select value={action.side ?? ''} onChange={(e) => patch({ side: (e.target.value || null) as CheckpointAction['side'] })}>
              <option value="">No side qualifier</option><option value="left">Left / izquierdo</option><option value="right">Right / derecho</option>
            </select>
          </label>
          <label>Target floor
            <Input value={action.targetFloor ?? ''} maxLength={200} onChange={(e) => patch({ targetFloor: e.target.value || null })} />
          </label>
        </div>
        <ol className="action-edit-steps">
          {action.steps.map((step, i) => <li key={i}>
            <div className="langs">
              {LOCALES.map((locale) => <label key={locale}>
                Step {i + 1} · {locale === 'en' ? 'English' : 'Spanish'}
                <Textarea lang={locale} maxLength={500} value={step[locale]} onChange={(e) => patch({
                  steps: action.steps.map((s, index) => index === i ? { ...s, [locale]: e.target.value } : s),
                })} />
              </label>)}
            </div>
            <div className="row">
              <Button variant="outline" type="button" disabled={disabled || i === 0} onClick={() => {
                const steps = [...action.steps]; [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]]; patch({ steps });
              }}>Move step {i + 1} up</Button>
              <Button variant="outline" type="button" onClick={() => patch({ steps: action.steps.filter((_, index) => index !== i) })}>Remove step {i + 1}</Button>
            </div>
          </li>)}
        </ol>
        <Button variant="outline" type="button" disabled={disabled || action.steps.length >= 50}
          onClick={() => patch({ steps: [...action.steps, { en: '', es: '' }] })}>Add ordered step</Button>
        <div className="langs">
          {LOCALES.map((locale) => <label key={locale}>
            Completion condition · {locale === 'en' ? 'English' : 'Spanish'}
            <Textarea lang={locale} maxLength={500} value={action.completion[locale]}
              onChange={(e) => patch({ completion: { ...action.completion, [locale]: e.target.value } })} />
          </label>)}
        </div>
      </>}
    </fieldset>
  );
}
