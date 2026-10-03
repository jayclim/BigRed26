// All Claude processes are injected fakes. No model or network calls.
// Run: node scripts/claude-run.check.mjs
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { DEADLINE, guard, parseUsage } from './claude-run.mjs';

const START = Date.parse('2026-10-03T06:00:00Z');
const HELP = ['--print', '--output-format', '--verbose', '--permission-mode',
  '--permission-prompts', '--session-id', '--append-system-prompt', '--tools', '--disallowedTools']
  .map((flag) => `${flag} <value>`).join('\n');
const event = (five = 0.02, seven = 0.17) => ({ type: 'rate_limit_event', rate_limit_info: {
  status: 'allowed', isUsingOverage: false, unifiedWindows: {
    five_hour: { utilization: five, resetsAt: START / 1000 + 5 * 3600 },
    seven_day: { utilization: seven, resetsAt: START / 1000 + 7 * 86400 },
  },
} });
const success = () => ({ type: 'result', subtype: 'success', is_error: false, permission_denials: [] });

function fixture(t, { cached = true } = {}) {
  const cwd = mkdtempSync(resolve(tmpdir(), 'breadcrumb-guard-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const dir = resolve(cwd, '.overnight');
  mkdirSync(dir);
  writeFileSync(resolve(cwd, 'prompt.txt'), 'Implement the assigned bounded feature. Literal $(do-not-execute) `text`.');
  const save = (usage) => writeFileSync(resolve(dir, 'usage.json'), JSON.stringify(usage));
  if (cached) save(parseUsage(event(), START));
  let time = START;
  return { cwd, dir, save, now: () => time, setTime: (value) => { time = value; } };
}

const NO_INPUT = 'Error: Input must be provided either through stdin or as a prompt argument when using --print';
function fakeCLI({ events = [event(), success()], code = 0, hang = false, help = HELP,
  maxTurnsSupported = true, preflightOutput, spawnError = false, ignoreTerm = false, onRun } = {}) {
  const calls = [];
  const signals = [];
  const spawnProcess = (command, args, options) => {
    assert.equal(command, 'claude');
    assert.equal(options.shell, false);
    assert.ok(Array.isArray(args));
    calls.push({ args, options });
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    let closed = false;
    const close = (exitCode, signal = null) => {
      if (closed) return;
      closed = true;
      child.stdout.end();
      child.stderr.end();
      child.emit('close', exitCode, signal);
    };
    child.kill = (signal) => {
      signals.push(signal);
      if (ignoreTerm && signal === 'SIGTERM') return true;
      queueMicrotask(() => close(null, signal));
      return true;
    };
    queueMicrotask(() => {
      if (args[0] === '--help') { child.stdout.write(help); close(0); return; }
      if (!args.includes('--output-format')) {
        assert.deepEqual(args, ['--print', '--max-turns', '12']);
        assert.equal(options.stdio[0], 'ignore');
        child.stderr.write(preflightOutput ?? (maxTurnsSupported ? NO_INPUT : "error: unknown option '--max-turns'"));
        close(1);
        return;
      }
      if (spawnError) { child.emit('error', new Error('spawn claude ENOENT')); close(-2); return; }
      onRun?.({ child, args });
      for (const item of events) {
        if (closed) break;
        const value = typeof item === 'string' ? item : JSON.stringify(item);
        child.stdout.write(`${value}\n`);
      }
      if (!hang && !signals.length) close(code);
    });
    return child;
  };
  return { spawnProcess, calls, signals, modelCalls: () => calls.filter((call) => call.args.includes('--output-format')) };
}

function run(f, fake, mode = 'run', env = {}) {
  return guard(mode, mode === 'run' ? 'prompt.txt' : undefined,
    { cwd: f.cwd, now: f.now, spawnProcess: fake.spawnProcess, tickMs: 5, env });
}

for (const mode of ['probe', 'run']) {
  test(`${mode} launch ends with a prompt argument terminator and the exact prompt`, async (t) => {
    const f = fixture(t, { cached: mode === 'run' });
    const fake = fakeCLI();
    assert.equal((await run(f, fake, mode)).status, 'completed');
    assert.equal(fake.modelCalls().length, 1);
    const prompt = mode === 'probe'
      ? 'Reply with OK once. Do not use tools or perform any implementation task. This request only refreshes subscription usage telemetry.'
      : readFileSync(resolve(f.cwd, 'prompt.txt'), 'utf8');
    assert.deepEqual(fake.modelCalls()[0].args.slice(-2), ['--', prompt]);
  });
}

test('valid start: one fresh lead, bounded flags, plugin instruction, private sanitized storage', async (t) => {
  const f = fixture(t);
  const telemetry = event();
  telemetry.accountSecret = 'private account field';
  telemetry.rate_limit_info.extra = 'must not persist';
  const fake = fakeCLI({ events: [telemetry,
    { type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'RAW PRIVATE THINKING' }] } }, success()] });
  const result = await run(f, fake);
  assert.equal(result.status, 'completed');
  assert.equal(result.exitCode, 0);
  assert.match(result.sessionId, /^[0-9a-f-]{36}$/);
  assert.equal(result.maxTurnsSupported, true);
  assert.equal(result.nextReset, '2026-10-03T11:00:00.000Z');
  assert.equal(fake.modelCalls().length, 1);
  const args = fake.modelCalls()[0].args;
  const value = (flag) => args[args.indexOf(flag) + 1];
  assert.equal(value('--max-turns'), '12');
  assert.equal(value('--permission-mode'), 'auto');
  assert.equal(value('--permission-prompts'), 'none');
  assert.equal(value('--session-id'), result.sessionId);
  assert.match(value('--append-system-prompt'), /operator.*orchestrator.*knowledge\/work-protocol\.md.*official Codex plugin.*codex:codex-rescue.*gpt-6-luna.*gpt-6\.1-sol.*--fresh --wait --model.*effort unset.*foreground.*Pass native run_in_background:false explicitly; never true or omitted on this host \(omission defaults to async\).*poll a live rescue.*background ID or empty result is a failed handoff/);
  assert.match(args.at(-1), /\$\(do-not-execute\)/);
  for (const flag of ['--resume', '--continue', '--dangerously-skip-permissions', '--settings', '--setting-sources']) {
    assert.ok(!args.includes(flag));
  }
  const saved = JSON.parse(readFileSync(resolve(f.dir, 'usage.json'), 'utf8'));
  assert.deepEqual(saved, parseUsage(event(), START));
  assert.equal(statSync(resolve(f.dir, 'usage.json')).mode & 0o777, 0o600);
  assert.equal(statSync(result.log).mode & 0o777, 0o600);
  assert.equal(statSync(f.dir).mode & 0o777, 0o700);
  assert.ok(!existsSync(resolve(f.dir, 'run.lock')));
  assert.ok(!JSON.stringify(result).includes('RAW PRIVATE THINKING'));
  assert.match(readFileSync(result.log, 'utf8'), /RAW PRIVATE THINKING/);
});

test('missing saved telemetry blocks a run without a model call', async (t) => {
  const f = fixture(t, { cached: false });
  const fake = fakeCLI();
  const result = await run(f, fake);
  assert.equal(result.status, 'blocked');
  assert.match(result.reason, /observation is missing/);
  assert.equal(fake.calls.length, 0);
});

test('check is read-only and never makes a model call', async (t) => {
  const f = fixture(t);
  const before = readFileSync(resolve(f.dir, 'usage.json'), 'utf8');
  const fake = fakeCLI();
  const result = await run(f, fake, 'check');
  assert.equal(result.status, 'ready');
  assert.equal(result.nextReset, '2026-10-03T11:00:00.000Z');
  assert.equal(fake.modelCalls().length, 0);
  assert.equal(readFileSync(resolve(f.dir, 'usage.json'), 'utf8'), before);
  assert.ok(!existsSync(resolve(f.dir, 'run.lock')));
});

test('probe is one no-tools turn and refreshes expired cache', async (t) => {
  const f = fixture(t);
  f.save({ observedAt: new Date(START).toISOString(), status: 'allowed', isUsingOverage: false,
    unifiedWindows: { five_hour: { utilization: 0.2, resetsAt: START / 1000 - 1 } } });
  const fake = fakeCLI();
  const result = await run(f, fake, 'probe');
  assert.equal(result.status, 'completed');
  assert.equal(result.nextReset, '2026-10-03T11:00:00.000Z');
  const args = fake.modelCalls()[0].args;
  assert.equal(args[args.indexOf('--max-turns') + 1], '1');
  assert.equal(args[args.indexOf('--tools') + 1], '');
  assert.equal(args[args.indexOf('--disallowedTools') + 1], '*');
  assert.ok(!args.includes('--append-system-prompt'));
  assert.deepEqual(JSON.parse(readFileSync(resolve(f.dir, 'usage.json'), 'utf8')), parseUsage(event(), START));
});

test('percent values and changed/missing telemetry schemas terminate and invalidate cache', async (t) => {
  const malformed = [event(17), event(0.02, 17), { type: 'rate_limit_event', rate_limit_info: {} },
    { ...event(), rate_limit_info: { ...event().rate_limit_info, unifiedWindows: { five_hour: event().rate_limit_info.unifiedWindows.five_hour } } },
    { ...event(), rate_limit_info: { ...event().rate_limit_info, isUsingOverage: undefined } },
    { type: 'unknown_usage' }, 'not JSON'];
  for (const telemetry of malformed) {
    const f = fixture(t);
    const fake = fakeCLI({ events: [telemetry], hang: true });
    const result = await run(f, fake);
    assert.equal(result.status, 'blocked');
    assert.deepEqual(fake.signals, ['SIGTERM']);
    assert.ok(!existsSync(resolve(f.dir, 'usage.json')));
    assert.ok(!existsSync(resolve(f.dir, 'run.lock')));
  }
});

test('expired windows and old/future observations block start; reset never becomes zero', async (t) => {
  for (const name of ['five_hour', 'seven_day', 'old_observation', 'future_observation']) {
    const f = fixture(t);
    const saved = parseUsage(event(), START);
    if (name === 'old_observation') saved.observedAt = new Date(START - 15 * 60_000 - 1).toISOString();
    else if (name === 'future_observation') saved.observedAt = new Date(START + 1).toISOString();
    else saved.unifiedWindows[name].resetsAt = START / 1000;
    f.save(saved);
    const fake = fakeCLI();
    assert.equal((await run(f, fake)).status, 'blocked');
    assert.equal(fake.modelCalls().length, 0);
  }
});

test('55% weekly and 95% five-hour thresholds block start and stop a live run', async (t) => {
  for (const telemetry of [event(0.02, 0.55), event(0.95, 0.17)]) {
    const f = fixture(t);
    f.save(parseUsage(telemetry, START));
    const noStart = fakeCLI();
    const blocked = await run(f, noStart);
    assert.match(blocked.reason, /threshold/);
    assert.equal(noStart.modelCalls().length, 0);
    f.save(parseUsage(event(), START));
    const live = fakeCLI({ events: [event(), telemetry], hang: true });
    const result = await run(f, live);
    assert.equal(result.status, 'blocked');
    assert.match(result.reason, /threshold/);
    assert.deepEqual(live.signals, ['SIGTERM']);
    assert.match(result.workerRecovery, /only Codex job IDs owned by this session/);
  }
});

test('overage and non-allowed status stop the lead', async (t) => {
  for (const info of [{ isUsingOverage: true }, { status: 'rejected' }]) {
    const f = fixture(t);
    const telemetry = event();
    Object.assign(telemetry.rate_limit_info, info);
    const fake = fakeCLI({ events: [telemetry], hang: true });
    assert.equal((await run(f, fake)).status, 'blocked');
    assert.deepEqual(fake.signals, ['SIGTERM']);
  }
});

test('a saved overage blocks start and any set API key blocks run/probe', async (t) => {
  const f = fixture(t);
  const telemetry = event();
  telemetry.rate_limit_info.isUsingOverage = true;
  f.save(parseUsage(telemetry, START));
  const fake = fakeCLI();
  assert.match((await run(f, fake)).reason, /Overage detected/);
  f.save(parseUsage(event(), START));
  for (const mode of ['run', 'probe']) {
    assert.match((await run(f, fake, mode, { ANTHROPIC_API_KEY: '' })).reason, /ANTHROPIC_API_KEY is set/);
  }
  assert.equal(fake.modelCalls().length, 0);
});

test('nonzero exit, failed result and missing result are failures', async (t) => {
  for (const options of [{ code: 7 },
    { events: [event(), { type: 'result', subtype: 'error_max_turns', is_error: true }] },
    { events: [event()] }]) {
    const f = fixture(t);
    const result = await run(f, fakeCLI(options));
    assert.equal(result.status, 'blocked');
    assert.match(result.reason, /exited 7|result failed|without a result/);
    assert.match(result.workerRecovery, /workers running/);
  }
});

test('missing live telemetry fails at exit or times out and removes old cached usage', async (t) => {
  for (const hang of [false, true]) {
    const f = fixture(t);
    const fake = fakeCLI({ events: hang ? [] : [success()], hang,
      onRun: () => { if (hang) setTimeout(() => f.setTime(START + 30_000), 10); } });
    const result = await run(f, fake);
    assert.equal(result.status, 'blocked');
    assert.match(result.reason, /usage telemetry/);
    assert.ok(!existsSync(resolve(f.dir, 'usage.json')));
    if (hang) assert.deepEqual(fake.signals, ['SIGTERM']);
  }
});

test('missing permissions are reported as a blocker with tool name', async (t) => {
  const f = fixture(t);
  const fake = fakeCLI({ events: [event(), { ...success(),
    permission_denials: [{ tool_name: 'Bash', tool_input: { command: 'private command' } }] }], hang: true });
  const result = await run(f, fake);
  assert.match(result.reason, /Missing permissions: Bash/);
  assert.ok(!JSON.stringify(result).includes('private command'));
  assert.deepEqual(fake.signals, ['SIGTERM']);
});

test('deadline blocks start and terminates the owned live child', async (t) => {
  const f = fixture(t);
  f.setTime(DEADLINE);
  const noStart = fakeCLI();
  assert.match((await run(f, noStart, 'probe')).reason, /Deadline reached/);
  assert.equal(noStart.calls.length, 0);
  f.setTime(START);
  const fake = fakeCLI({ events: [event()], hang: true,
    onRun: () => setTimeout(() => f.setTime(DEADLINE), 10) });
  const result = await run(f, fake);
  assert.match(result.reason, /Deadline reached/);
  assert.deepEqual(fake.signals, ['SIGTERM']);
});

test('20-minute lead and 60-second probe bounds terminate the child', async (t) => {
  for (const [mode, duration] of [['run', 20 * 60_000], ['probe', 60_000]]) {
    const f = fixture(t);
    const fake = fakeCLI({ events: [event()], hang: true,
      onRun: () => setTimeout(() => f.setTime(START + duration), 10) });
    const result = await run(f, fake, mode);
    assert.match(result.reason, /limit reached/);
    assert.deepEqual(fake.signals, ['SIGTERM']);
  }
});

test('STOP blocks start and cancels the live lead', async (t) => {
  const f = fixture(t);
  const stop = resolve(f.dir, 'STOP');
  writeFileSync(stop, 'stop');
  const noStart = fakeCLI();
  assert.match((await run(f, noStart)).reason, /STOP marker/);
  assert.equal(noStart.calls.length, 0);
  rmSync(stop);
  const fake = fakeCLI({ events: [event()], hang: true,
    onRun: () => setTimeout(() => writeFileSync(stop, 'stop'), 10) });
  assert.match((await run(f, fake)).reason, /STOP marker/);
  assert.deepEqual(fake.signals, ['SIGTERM']);
  assert.ok(existsSync(stop));
});

test('exclusive lock prevents a concurrent probe/lead and preserves a stale lock', async (t) => {
  const f = fixture(t);
  let started;
  const start = new Promise((done) => { started = done; });
  const fake = fakeCLI({ events: [event()], hang: true, onRun: started });
  const first = run(f, fake);
  await start;
  const lock = resolve(f.dir, 'run.lock');
  const owner = JSON.parse(readFileSync(lock, 'utf8'));
  assert.equal(owner.pid, process.pid);
  assert.equal(owner.start, new Date(START).toISOString());
  for (const mode of ['run', 'probe']) {
    const other = fakeCLI();
    assert.match((await run(f, other, mode)).reason, /run.lock exists/);
    assert.equal(other.modelCalls().length, 0);
    assert.deepEqual(JSON.parse(readFileSync(lock, 'utf8')), owner);
  }
  writeFileSync(resolve(f.dir, 'STOP'), 'stop');
  await first;
  rmSync(resolve(f.dir, 'STOP'));
  writeFileSync(lock, JSON.stringify({ pid: 999999999, start: 'old' }));
  const stale = fakeCLI();
  assert.match((await run(f, stale)).reason, /Active or stale lock blocks launch/);
  assert.ok(existsSync(lock));
  assert.equal(stale.modelCalls().length, 0);
});

test('missing installed CLI flag blocks launch without inventing support', async (t) => {
  const f = fixture(t);
  const fake = fakeCLI({ help: HELP.replace('--permission-prompts <value>', '') });
  const result = await run(f, fake);
  assert.match(result.reason, /lacks required flags: --permission-prompts/);
  assert.equal(fake.modelCalls().length, 0);
  assert.ok(!existsSync(resolve(f.dir, 'run.lock')));
});

test('unsupported max-turns uses stream turns; duplicate and child messages do not consume lead turns', async (t) => {
  const f = fixture(t);
  const assistant = (id, parent_tool_use_id = null) => ({ type: 'assistant', parent_tool_use_id,
    message: { id, content: [{ type: 'text', text: 'private response' }] } });
  const fake = fakeCLI({ maxTurnsSupported: false, hang: true, events: [event(),
    ...Array.from({ length: 11 }, (_, i) => assistant(`lead-${i}`)),
    assistant('lead-10'), assistant('child', 'owned-tool'), assistant('lead-11')] });
  const result = await run(f, fake);
  assert.equal(result.status, 'blocked');
  assert.equal(result.maxTurnsSupported, false);
  assert.equal(result.assistantTurns, 12);
  assert.match(result.reason, /12 lead assistant turns/);
  assert.deepEqual(fake.signals, ['SIGTERM']);
  assert.ok(!fake.modelCalls()[0].args.includes('--max-turns'));
  assert.ok(!existsSync(resolve(f.dir, 'run.lock')));
});

test('unsupported max-turns can complete a bounded run and one no-tools probe', async (t) => {
  for (const mode of ['check', 'run', 'probe']) {
    const f = fixture(t);
    const fake = fakeCLI({ maxTurnsSupported: false, events: [event(),
      { type: 'assistant', message: { content: [{ type: 'text', text: 'OK' }] } }, success()] });
    const result = await run(f, fake, mode);
    assert.equal(result.status, mode === 'check' ? 'ready' : 'completed');
    assert.equal(result.maxTurnsSupported, false);
    assert.equal(fake.modelCalls().length, mode === 'check' ? 0 : 1);
  }
});

test('unknown no-prompt preflight response blocks without a model call', async (t) => {
  const f = fixture(t);
  const fake = fakeCLI({ preflightOutput: 'unexpected private configuration failure' });
  const result = await run(f, fake);
  assert.match(result.reason, /Unknown no-prompt CLI preflight response/);
  assert.ok(!JSON.stringify(result).includes('private configuration'));
  assert.equal(fake.modelCalls().length, 0);
  assert.ok(!existsSync(resolve(f.dir, 'run.lock')));
});

test('a configured preflight hook failure blocks without exposing hook contents', async (t) => {
  for (const mode of ['check', 'probe', 'run']) {
    const f = fixture(t);
    const fake = fakeCLI({ preflightOutput: `${NO_INPUT}\nSessionEnd hook [private command] failed: EPERM` });
    const result = await run(f, fake, mode);
    assert.equal(result.status, 'blocked');
    assert.equal(result.maxTurnsSupported, true);
    assert.match(result.reason, /Configured hook failed/);
    assert.ok(!JSON.stringify(result).includes('private command'));
    assert.equal(fake.modelCalls().length, 0);
    assert.ok(!existsSync(resolve(f.dir, 'run.lock')));
  }
});

test('unknown data after valid telemetry clears cache and reported usage', async (t) => {
  const f = fixture(t);
  const fake = fakeCLI({ events: [event(), 'not JSON'], hang: true });
  const result = await run(f, fake);
  assert.equal(result.status, 'blocked');
  assert.equal(result.usage, undefined);
  assert.equal(result.nextReset, undefined);
  assert.ok(!existsSync(resolve(f.dir, 'usage.json')));
  assert.deepEqual(fake.signals, ['SIGTERM']);
});

test('foreign session ID pauses; the launch session ID remains available for worker recovery', async (t) => {
  const f = fixture(t);
  const fake = fakeCLI({ events: [event(), { type: 'system', session_id: 'foreign-session' }], hang: true });
  const result = await run(f, fake);
  assert.match(result.reason, /session ID differs/);
  const args = fake.modelCalls()[0].args;
  assert.equal(result.sessionId, args[args.indexOf('--session-id') + 1]);
  assert.ok(!JSON.stringify(result).includes('foreign-session'));
  assert.deepEqual(fake.signals, ['SIGTERM']);
});

test('probe tool use and a second assistant response stop the child', async (t) => {
  for (const messages of [[{ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash' }] } }],
    Array.from({ length: 2 }, (_, i) => ({ type: 'assistant', message: { id: `msg-${i}`, content: [] } }))]) {
    const f = fixture(t, { cached: false });
    const fake = fakeCLI({ maxTurnsSupported: false, events: [event(), ...messages], hang: true });
    const result = await run(f, fake, 'probe');
    assert.equal(result.status, 'blocked');
    assert.match(result.reason, /tool call|one assistant response/);
    assert.deepEqual(fake.signals, ['SIGTERM']);
    assert.ok(!existsSync(resolve(f.dir, 'usage.json')));
  }
});

test('spawn failure releases the lock and invalidates cached telemetry', async (t) => {
  const f = fixture(t);
  const result = await run(f, fakeCLI({ spawnError: true }));
  assert.equal(result.status, 'blocked');
  assert.match(result.reason, /Claude spawn failed/);
  assert.ok(!existsSync(resolve(f.dir, 'usage.json')));
  assert.ok(!existsSync(resolve(f.dir, 'run.lock')));
});

test('controller SIGINT cancels its lead and releases its lock', async (t) => {
  const f = fixture(t);
  const fake = fakeCLI({ events: [event()], hang: true,
    onRun: () => setTimeout(() => process.emit('SIGINT'), 10) });
  const result = await run(f, fake);
  assert.match(result.reason, /Controller interrupted/);
  assert.deepEqual(fake.signals, ['SIGTERM']);
  assert.ok(!existsSync(resolve(f.dir, 'run.lock')));
});

test('a child that ignores SIGTERM receives SIGKILL before lock release', async (t) => {
  const f = fixture(t);
  const fake = fakeCLI({ events: [event(0.95)], hang: true, ignoreTerm: true });
  const result = await run(f, fake);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(fake.signals, ['SIGTERM', 'SIGKILL']);
  assert.ok(!existsSync(resolve(f.dir, 'run.lock')));
});

test('lock contents changed by another owner are preserved on completion', async (t) => {
  const f = fixture(t);
  const lock = resolve(f.dir, 'run.lock');
  const replacement = JSON.stringify({ pid: 999999999, start: new Date(START).toISOString(), sessionId: 'other' });
  const fake = fakeCLI({ onRun: () => writeFileSync(lock, replacement) });
  const result = await run(f, fake);
  assert.equal(result.status, 'blocked');
  assert.match(result.reason, /run.lock changed ownership/);
  assert.equal(readFileSync(lock, 'utf8'), replacement);
});

test('live windows expire and live observations age out without assuming zero', async (t) => {
  for (const expiredWindow of [false, true]) {
    const f = fixture(t);
    const telemetry = event();
    if (expiredWindow) telemetry.rate_limit_info.unifiedWindows.five_hour.resetsAt = START / 1000 + 1;
    const fake = fakeCLI({ events: [telemetry], hang: true,
      onRun: () => setTimeout(() => f.setTime(START + (expiredWindow ? 1000 : 15 * 60_000 + 1)), 10) });
    const result = await run(f, fake);
    assert.match(result.reason, /expired five_hour reset|older than 15 minutes/);
    assert.deepEqual(fake.signals, ['SIGTERM']);
  }
});
