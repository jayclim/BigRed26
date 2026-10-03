// One bounded lead run. This file does not schedule work or cancel plugin workers.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  chmodSync, closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync,
  renameSync, statSync, unlinkSync, writeFileSync, writeSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEADLINE = Date.parse('2026-10-03T16:00:00Z');
const FRESH_MS = 15 * 60_000;
const RUN_MS = 20 * 60_000;
const PROBE_MS = 60_000;
const TELEMETRY_MS = 30_000;
const REQUIRED_FLAGS = [
  '--print', '--output-format', '--verbose', '--permission-mode',
  '--permission-prompts', '--session-id', '--append-system-prompt',
  '--tools', '--disallowedTools',
];

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

export function parseUsage(event, now) {
  const info = event?.rate_limit_info;
  requireValue(event?.type === 'rate_limit_event' && info?.status === 'allowed',
    'Unknown or blocked rate_limit_event status/schema.');
  requireValue(typeof info.isUsingOverage === 'boolean', 'Missing overage telemetry.');
  const usage = { observedAt: new Date(now).toISOString(), status: info.status,
    isUsingOverage: info.isUsingOverage, unifiedWindows: {} };
  for (const name of ['five_hour', 'seven_day']) {
    const window = info.unifiedWindows?.[name];
    requireValue(window && typeof window.utilization === 'number'
      && Number.isFinite(window.utilization) && window.utilization >= 0
      && window.utilization <= 1, `Invalid ${name} utilization; require a fraction in 0..1.`);
    requireValue(Number.isSafeInteger(window.resetsAt) && Number.isSafeInteger(window.resetsAt * 1000)
      && Number.isFinite(new Date(window.resetsAt * 1000).getTime()) && window.resetsAt * 1000 > now,
      `Missing, invalid or expired ${name} reset.`);
    // Discard all unrelated event data, including transcripts and account fields.
    usage.unifiedWindows[name] = { utilization: window.utilization, resetsAt: window.resetsAt };
  }
  return usage;
}

export function usageGate(usage, now) {
  const observed = Date.parse(usage?.observedAt);
  requireValue(typeof usage?.observedAt === 'string' && Number.isFinite(observed)
    && observed <= now && now - observed <= FRESH_MS,
  'Usage observation is missing, invalid or older than 15 minutes. Probe to refresh.');
  // Validate saved data again. A reset does not make stale usage zero.
  parseUsage({ type: 'rate_limit_event', rate_limit_info: usage }, now);
  requireValue(!usage.isUsingOverage, 'Overage detected. Pause; do not enable paid usage.');
  requireValue(usage.unifiedWindows.seven_day.utilization < 0.55,
    'Seven-day usage reached the 55% dispatch threshold.');
  requireValue(usage.unifiedWindows.five_hour.utilization < 0.95,
    'Five-hour usage reached the 95% dispatch threshold.');
}

function saveUsage(path, usage) {
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, `${JSON.stringify(usage)}\n`, { flag: 'wx', mode: 0o600 });
    renameSync(temp, path);
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
}

function cliOutput(spawnProcess, cwd, env, args) {
  return new Promise((done, reject) => {
    const child = spawnProcess('claude', args, { cwd, env, shell: false,
      stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let failure;
    const timer = setTimeout(() => { failure = 'Claude CLI preflight timed out.'; child.kill('SIGKILL'); }, 5000);
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => {
        output += chunk;
        if (output.length > 512_000) { failure = 'Claude CLI preflight exceeded the output bound.'; child.kill('SIGKILL'); }
      });
    }
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (failure) return reject(new Error(failure));
      done({ code, output });
    });
  });
}

async function verifyCLI(spawnProcess, cwd, env) {
  const help = await cliOutput(spawnProcess, cwd, env, ['--help']);
  requireValue(help.code === 0, `claude --help exited ${help.code}.`);
  const missing = REQUIRED_FLAGS.filter((flag) => !new RegExp(`${flag}(?=[\\s,])`).test(help.output));
  requireValue(!missing.length, `Installed claude --help lacks required flags: ${missing.join(', ')}. Launch blocked.`);
  // --help can bypass unknown-option validation. Empty stdin and no prompt reach
  // the CLI's input check without a model call, including for a hidden option.
  const test = await cliOutput(spawnProcess, cwd, env, ['--print', '--max-turns', '12']);
  if (test.code !== 0 && /unknown option ['"]--max-turns['"]/.test(test.output)) {
    return { maxTurnsSupported: false, turnLimit: 'stream: stop at 12 lead assistant messages' };
  }
  requireValue(test.code !== 0 && test.output.includes('Error: Input must be provided either through stdin or as a prompt argument when using --print'),
    'Unknown no-prompt CLI preflight response. Launch blocked; inspect CLI support without a model call.');
  return { maxTurnsSupported: true, turnLimit: 'CLI --max-turns plus stream limit',
    ...(test.output.includes('failed:') ? { preflightBlocker: 'Configured hook failed during the no-prompt CLI check. Launch blocked; inspect hook permissions and configuration.' } : {}) };
}

function acquireLock(path, start, sessionId) {
  let fd;
  try { fd = openSync(path, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let owner = 'unreadable owner';
    try {
      const lock = JSON.parse(readFileSync(path, 'utf8'));
      const date = typeof lock.start === 'string' ? Date.parse(lock.start) : NaN;
      owner = `pid ${Number.isSafeInteger(lock.pid) && lock.pid > 0 ? lock.pid : 'unknown'}, start ${Number.isFinite(date) ? new Date(date).toISOString() : 'unknown'}`;
    } catch { /* The lock still blocks recovery. */ }
    throw new Error(`run.lock exists (${owner}). Active or stale lock blocks launch. Inspect its owner; never blindly delete it.`);
  }
  const identity = fstatSync(fd);
  const contents = `${JSON.stringify({ pid: process.pid, start: new Date(start).toISOString(), sessionId })}\n`;
  try { writeSync(fd, contents); }
  finally { closeSync(fd); }
  return () => {
    // Never remove a replacement lock belonging to another invocation.
    const current = statSync(path);
    requireValue(current.ino === identity.ino && current.dev === identity.dev && readFileSync(path, 'utf8') === contents,
      'run.lock changed ownership. Inspect it before recovery.');
    unlinkSync(path);
  };
}

function monitor({ child, mode, now, dir, logFd, start, tickMs, sessionId, onUsage }) {
  return new Promise((finish) => {
    let reason;
    let usage;
    let result;
    let buffer = '';
    let gotTelemetry = false;
    let assistantTurns = 0;
    const messageIds = new Set();
    let forceTimer;
    let complete = false;
    const forgetUsage = () => {
      const path = resolve(dir, 'usage.json');
      onUsage(undefined);
      try { if (existsSync(path)) unlinkSync(path); }
      catch { reason ||= 'Cannot invalidate usage.json. Inspect private files before recovery.'; }
    };
    const stop = (message, unknown = false) => {
      if (reason || complete) return;
      reason = message;
      if (unknown) forgetUsage();
      child.kill('SIGTERM');
      forceTimer = setTimeout(() => child.kill('SIGKILL'), 2000);
    };
    const inspect = () => {
      try {
        requireValue(!existsSync(resolve(dir, 'STOP')), 'STOP marker detected.');
        requireValue(now() < DEADLINE, 'Deadline reached (2026-10-03T16:00:00Z).');
        requireValue(now() - start < (mode === 'run' ? RUN_MS : PROBE_MS),
          mode === 'run' ? '20-minute run limit reached.' : '60-second probe limit reached.');
        if (usage) usageGate(usage, now());
        if (!gotTelemetry && now() - start >= TELEMETRY_MS) {
          stop('No live usage telemetry within 30 seconds.', true);
        }
      } catch (error) { stop(error.message); }
    };
    const line = (text) => {
      if (!text.trim() || reason) return;
      try {
        requireValue(text.length <= 4_000_000, 'Stream-json line exceeds 4 MB.');
        const event = JSON.parse(text);
        requireValue(event && typeof event === 'object' && !Array.isArray(event)
          && typeof event.type === 'string', 'Unknown stream-json event schema.');
        if (event.session_id !== undefined) requireValue(event.session_id === sessionId,
          'Stream session ID differs from the owned launch session.');
        if (event.type === 'rate_limit_event') {
          try { usage = parseUsage(event, now()); }
          catch (error) { stop(error.message, true); return; }
          gotTelemetry = true;
          saveUsage(resolve(dir, 'usage.json'), usage);
          onUsage(usage);
          inspect();
        } else if (event.type === 'result') {
          requireValue(typeof event.is_error === 'boolean' && typeof event.subtype === 'string',
            'Unknown result schema.');
          result = { subtype: event.subtype, is_error: event.is_error };
          if (event.permission_denials !== undefined) {
            requireValue(Array.isArray(event.permission_denials), 'Unknown permission_denials schema.');
            if (event.permission_denials.length) {
              const tools = event.permission_denials.map((denial) => typeof denial?.tool_name === 'string'
                && /^[\w:.-]{1,100}$/.test(denial.tool_name) ? denial.tool_name : 'unknown tool');
              stop(`Missing permissions: ${tools.join(', ')}. See private log.`);
            }
          }
          if (event.is_error || event.subtype !== 'success') stop('Claude result failed. See private log.');
        } else {
          requireValue(['system', 'assistant', 'user', 'tool_progress', 'tool_use_summary', 'auth_status'].includes(event.type),
            'Unknown stream event type.');
          if (event.error) stop('Claude stream error. See private log.');
          if (event.type === 'assistant' && !event.parent_tool_use_id) {
            requireValue(Array.isArray(event.message?.content), 'Unknown assistant message schema.');
            const id = event.message.id;
            requireValue(id === undefined || (typeof id === 'string' && id.length > 0), 'Unknown assistant message ID.');
            // A message can appear in several content blocks. Count its ID once.
            // Missing IDs count separately, conservatively. Child messages do not
            // consume lead turns. Cancellation can precede the final result.
            if (id === undefined || !messageIds.has(id)) {
              if (id !== undefined) messageIds.add(id);
              assistantTurns++;
              if (mode === 'run' && assistantTurns >= 12) stop('12 lead assistant turns reached.');
              if (mode === 'probe' && assistantTurns > 1) stop('Probe exceeded one assistant response.', true);
            }
          }
          if (mode === 'probe' && event.message?.content?.some((part) => part.type === 'tool_use')) {
            stop('Probe attempted a tool call. Probe is only a usage refresh.', true);
          }
        }
      } catch (error) { stop(error instanceof SyntaxError ? 'Invalid stream-json data. See private log.' : error.message, true); }
    };
    const interval = setInterval(inspect, tickMs);
    const durationTimer = setTimeout(() => stop(mode === 'run' ? '20-minute run limit reached.' : '60-second probe limit reached.'),
      mode === 'run' ? RUN_MS : PROBE_MS);
    const deadlineTimer = setTimeout(() => stop('Deadline reached (2026-10-03T16:00:00Z).'), Math.max(0, DEADLINE - now()));
    const log = (chunk) => {
      try { writeSync(logFd, chunk); }
      catch (error) { stop(`Private log write failed: ${error.message}`); }
    };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      log(chunk);
      buffer += chunk.toString();
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        line(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
      if (buffer.length > 4_000_000) { buffer = ''; stop('Stream-json line exceeds 4 MB.', true); }
    });
    child.stderr.on('data', log);
    const cancel = () => stop('Controller interrupted; owned Claude lead cancelled.');
    process.on('SIGINT', cancel);
    process.on('SIGTERM', cancel);
    child.once('error', (error) => stop(`Claude spawn failed: ${error.message}`, true));
    child.once('close', (code, signal) => {
      if (buffer) line(buffer);
      inspect();
      complete = true;
      clearInterval(interval);
      clearTimeout(durationTimer);
      clearTimeout(deadlineTimer);
      clearTimeout(forceTimer);
      process.off('SIGINT', cancel);
      process.off('SIGTERM', cancel);
      if (!gotTelemetry) { forgetUsage(); reason ||= 'Claude ended without live usage telemetry.'; }
      if (code !== 0) reason ||= `Claude exited ${code}, signal ${signal || 'none'}. See private log.`;
      if (!result) reason ||= 'Claude ended without a result event. See private log.';
      finish({ reason, assistantTurns, exitCode: code, signal,
        result: result ? { is_error: result.is_error, subtype: result.subtype === 'success' ? 'success' : 'failure' } : undefined });
    });
  });
}

export async function guard(mode, promptFile, {
  cwd = process.cwd(), env = process.env, now = Date.now, spawnProcess = spawn, tickMs = 250,
} = {}) {
  const dir = resolve(cwd, '.overnight');
  const usagePath = resolve(dir, 'usage.json');
  const metadata = { mode, status: 'blocked' };
  const reportUsage = (usage) => {
    if (!usage) { delete metadata.usage; delete metadata.nextReset; return; }
    metadata.usage = usage;
    metadata.nextReset = new Date(Math.min(...Object.values(usage.unifiedWindows).map((window) => window.resetsAt)) * 1000).toISOString();
  };
  let release;
  let logFd;
  try {
    requireValue(['check', 'probe', 'run'].includes(mode), 'Use: node scripts/claude-run.mjs check | probe | run <prompt-file>');
    if (existsSync(usagePath)) {
      try {
        const saved = JSON.parse(readFileSync(usagePath, 'utf8'));
        const observed = Date.parse(saved.observedAt);
        requireValue(typeof saved.observedAt === 'string' && Number.isFinite(observed),
          'Invalid observation timestamp.');
        // Output only known usage fields, never arbitrary cache data.
        const usage = parseUsage({ type: 'rate_limit_event', rate_limit_info: saved }, now());
        usage.observedAt = new Date(observed).toISOString();
        reportUsage(usage);
      } catch (error) {
        if (mode !== 'probe') throw new Error(`Invalid usage.json: ${error instanceof SyntaxError ? 'Invalid JSON.' : error.message} Probe to refresh.`);
        metadata.cacheState = 'Invalid saved usage; bounded probe must obtain a fresh event.';
      }
    }
    requireValue(!Object.hasOwn(env, 'ANTHROPIC_API_KEY'), 'ANTHROPIC_API_KEY is set. Refuse paid API authentication; use subscription auth.');
    requireValue(!existsSync(resolve(dir, 'STOP')), 'STOP marker detected.');
    requireValue(now() < DEADLINE, 'Deadline reached (2026-10-03T16:00:00Z).');
    if (mode !== 'probe') usageGate(metadata.usage, now());
    if (mode === 'check') {
      requireValue(!existsSync(resolve(dir, 'run.lock')), 'run.lock exists. Inspect active/stale owner before dispatch.');
      Object.assign(metadata, await verifyCLI(spawnProcess, cwd, env));
      requireValue(!metadata.preflightBlocker, metadata.preflightBlocker);
      requireValue(!existsSync(resolve(dir, 'STOP')), 'STOP marker detected.');
      requireValue(!existsSync(resolve(dir, 'run.lock')), 'run.lock exists. Inspect active/stale owner before dispatch.');
      requireValue(now() < DEADLINE, 'Deadline reached (2026-10-03T16:00:00Z).');
      usageGate(metadata.usage, now());
      metadata.status = 'ready';
      return metadata;
    }
    let prompt = 'Reply with OK once. Do not use tools or perform any implementation task. This request only refreshes subscription usage telemetry.';
    if (mode === 'run') {
      requireValue(typeof promptFile === 'string', 'run requires a prompt file.');
      prompt = readFileSync(resolve(cwd, promptFile), 'utf8');
      requireValue(prompt.trim().length > 0, 'Prompt file is empty.');
    }
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
    const start = now();
    metadata.sessionId = randomUUID();
    release = acquireLock(resolve(dir, 'run.lock'), start, metadata.sessionId);
    Object.assign(metadata, await verifyCLI(spawnProcess, cwd, env));
    requireValue(!metadata.preflightBlocker, metadata.preflightBlocker);
    // Recheck after help and lock acquisition; STOP, usage and time can change.
    requireValue(!existsSync(resolve(dir, 'STOP')), 'STOP marker detected.');
    requireValue(now() < DEADLINE, 'Deadline reached (2026-10-03T16:00:00Z).');
    if (mode === 'run') usageGate(metadata.usage, now());
    const args = ['--print', '--output-format', 'stream-json', '--verbose',
      '--permission-mode', 'auto', '--permission-prompts', 'none',
      '--session-id', metadata.sessionId];
    if (metadata.maxTurnsSupported) args.push('--max-turns', mode === 'run' ? '12' : '1');
    if (mode === 'probe') args.push('--tools', '', '--disallowedTools', '*');
    else args.push('--append-system-prompt',
      `You are one fresh, bounded Claude lead. Read AGENTS.md and the current task packet. Delegate all coding through the official Codex plugin and codex:codex-rescue with --model gpt-6.1-sol --fresh; leave effort unset. Never invoke direct Codex CLI tasks. Inspect existing plugin jobs before dispatch. Record each owned Codex job ID and its status in .overnight/${metadata.sessionId}.jobs.md as soon as it starts. Missing permissions or context is a blocker: report the exact failure. Do not bypass permissions or change user/global config. End within 12 lead turns and 20 minutes, before 2026-10-03T16:00:00Z. Save a checkpoint and stop on STOP, unknown usage, paid usage or the 55% weekly/95% five-hour dispatch threshold.`);
    args.push(prompt);
    metadata.log = resolve(dir, `${metadata.sessionId}.log`);
    logFd = openSync(metadata.log, 'wx', 0o600);
    const child = spawnProcess('claude', args, { cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    if (mode === 'run') metadata.workerRecovery = 'A cancelled or failed lead can leave plugin workers running. Before dispatching again, inspect/cancel only Codex job IDs owned by this session; use its jobs handoff and private log.';
    const outcome = await monitor({ child, mode, now, dir, logFd, start, tickMs, sessionId: metadata.sessionId,
      onUsage: reportUsage });
    Object.assign(metadata, outcome);
    metadata.status = outcome.reason ? 'blocked' : 'completed';
  } catch (error) { metadata.reason = error.message; }
  finally {
    if (logFd !== undefined) closeSync(logFd);
    if (release) {
      try { release(); }
      catch (error) { metadata.status = 'blocked'; metadata.reason = error.message; }
    }
  }
  return metadata;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode, promptFile, ...extra] = process.argv.slice(2);
  const result = extra.length || (mode !== 'run' && promptFile)
    ? { status: 'blocked', reason: 'Use: node scripts/claude-run.mjs check | probe | run <prompt-file>' }
    : await guard(mode, promptFile);
  console.log(JSON.stringify(result));
  process.exitCode = ['completed', 'ready'].includes(result.status) ? 0 : 1;
}
