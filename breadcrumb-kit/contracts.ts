/* Breadcrumb contract v1. Planning scaffold, not an application.
 * Integration owner approves every change. All IDs are opaque strings.
 * Runtime schemas must validate this contract at process/API boundaries.
 */
export type Id = string;
export type Mode = 'live' | 'replay' | 'mock';
export type Locale = 'en' | 'es'; // Proposed first two languages; team may freeze another pair.
export type Direction = 'forward' | 'left' | 'right' | 'up' | 'down';
export type ErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'NOT_APPROVED' |
  'STALE_VERSION' | 'STALE_FRAME' | 'PROVIDER_UNAVAILABLE' | 'RATE_LIMITED';
export type Result<T> = { ok: true; value: T } |
  { ok: false; error: { code: ErrorCode; message: string; retryable: boolean } };
export interface ReferenceView {
  mediaId: Id;
  videoTimeMs: number;
  role: 'approach' | 'landmark' | 'exit' | 'destination';
}
export interface Checkpoint {
  id: Id;
  order: number;
  label: string;
  referenceViews: ReferenceView[];
  identifyingEvidence: string[];
  approachDescription: string;
  instruction: Record<Locale, string>;
  direction: Direction | null; // null for destination or an unresolved draft turn
  isDestination: boolean;
}
export interface Route {
  schemaVersion: 1;
  id: Id;
  version: number;
  name: string;
  startDescription: string;
  destinationLabel: string;
  sourceVideoId: Id;
  status: 'draft' | 'approved';
  checkpoints: Checkpoint[];
  accessNotes: string[]; // Human-verified facts only, no inferred accessibility certification
}
export interface Session {
  id: Id;
  routeId: Id;
  routeVersion: number;
  locale: Locale;
  mode: Mode;
  lastConfirmedCheckpointId: Id | null;
  lastAcceptedSequence: number;
}
export interface FrameRequest {
  sessionId: Id;
  routeVersion: number;
  sequence: number; // strictly increasing within a session, starting at 1
  capturedAt: string; // ISO-8601 UTC
  mediaId: Id;
  question?: string;
}
export interface GuidanceBase {
  sessionId: Id;
  sequence: number;
  routeVersion: number;
  mode: Mode;
  locale: Locale;
  instructionId: Id; // stable for the same instruction; used to deduplicate speech
  text: string;
  evidence: string[];
  processingMs: number;
}
export type Guidance = GuidanceBase & (
  | { state: 'guiding'; checkpointId: Id; nextCheckpointId: Id;
      direction: Direction; approachConfirmed: true }
  | { state: 'uncertain' | 'off_route' | 'reorient';
      checkpointId: Id | null; direction: null; approachConfirmed: false }
  | { state: 'arrived'; checkpointId: Id; direction: null; approachConfirmed: true }
);
export type EventKind = 'frame_processed' | 'checkpoint_confirmed' |
  'uncertain' | 'off_route' | 'reorient' | 'help_requested' |
  'arrived' | 'manual_advance' | 'provider_error';
export interface NavigationEvent {
  id: Id; // unique, storage deduplicates retries
  sessionId: Id;
  routeId: Id;
  routeVersion: number;
  checkpointId: Id | null;
  sequence: number | null;
  at: string;
  mode: Mode;
  kind: EventKind;
  latencyMs: number | null;
}
export interface RouteQuality {
  routeId: Id;
  routeVersion: number;
  since: string;
  mode: Mode;
  checkpoints: Array<{ checkpointId: Id; helpRequests: number;
    uncertainEvents: number; confirmedSessions: number }>;
}
export interface BuildJob {
  id: Id;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  routeId: Id | null;
  message: string;
}
export interface SpeechRequest {
  text: string;
  locale: Locale;
  voiceId: string;
  instructionId: Id;
}
export interface SpeechClip {
  audioUrl: string;
  provider: 'elevenlabs';
  cached: boolean;
}
export interface IncomingPhotoHelp {
  providerMessageId: Id;
  conversationId: Id;
  sessionId: Id;
  mediaId: Id;
  question: string;
}
export interface CoreAdapter {
  startBuild(videoId: Id, name: string): Promise<Result<BuildJob>>;
  getBuild(jobId: Id): Promise<Result<BuildJob>>;
  getRoute(routeId: Id, version?: number): Promise<Result<Route>>;
  saveDraft(route: Route): Promise<Result<Route>>;
  approveRoute(routeId: Id, version: number): Promise<Result<Route>>;
  startSession(routeId: Id, locale: Locale, mode: Mode): Promise<Result<Session>>;
  getSession(sessionId: Id): Promise<Result<Session>>;
  setLocale(sessionId: Id, locale: Locale): Promise<Result<Session>>;
  reserveFrameSequence(sessionId: Id): Promise<Result<{ sequence: number; routeVersion: number }>>;
  matchFrame(request: FrameRequest): Promise<Result<Guidance>>;
  routeQuality(routeId: Id, version: number, since: string, mode: Mode): Promise<Result<RouteQuality>>;
}
export interface VoiceAdapter {
  synthesize(request: SpeechRequest): Promise<Result<SpeechClip>>;
}
export interface MessageAdapter {
  // B owns provider signature verification and message/media normalization.
  // The server allocates frame sequence atomically to avoid colliding with camera traffic.
  handlePhotoHelp(request: IncomingPhotoHelp, core: CoreAdapter): Promise<Result<{ reply: string }>>;
}
