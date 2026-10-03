// Runtime validation for contract v1 inputs. `satisfies` keeps these in sync with contracts.ts at compile time.
import { z } from 'zod';
import type { Checkpoint, CheckpointAction, FrameRequest, Locale, ManualCompletionRequest, Mode, Route } from './contracts.ts';

const id = z.string().min(1).max(200);
export const LocaleSchema = z.enum(['en', 'es']) satisfies z.ZodType<Locale>;
export const ModeSchema = z.enum(['live', 'replay', 'mock']) satisfies z.ZodType<Mode>;
export const DirectionSchema = z.enum(['forward', 'left', 'right', 'up', 'down']);
const localizedText = z.object({ en: z.string().max(500), es: z.string().max(500) });
export const CheckpointActionSchema = z.object({
  kind: z.enum(['turn', 'door', 'elevator', 'stairs', 'pass_side', 'other']),
  target: z.string().max(500),
  side: z.enum(['left', 'right']).nullable(),
  targetFloor: z.string().max(200).nullable(),
  steps: z.array(localizedText).max(50),
  completion: localizedText,
}) satisfies z.ZodType<CheckpointAction>;

export const CheckpointSchema = z.object({
  id,
  order: z.number().int().min(0),
  label: z.string().min(1).max(200),
  referenceViews: z.array(z.object({
    mediaId: id,
    videoTimeMs: z.number().min(0),
    role: z.enum(['approach', 'landmark', 'exit', 'destination']),
  })),
  identifyingEvidence: z.array(z.string().max(500)),
  approachDescription: z.string().max(500),
  instruction: z.object({ en: z.string().max(500), es: z.string().max(500) }),
  direction: DirectionSchema.nullable(),
  action: CheckpointActionSchema.optional(),
  isDestination: z.boolean(),
}) satisfies z.ZodType<Checkpoint>;

export const RouteSchema = z.object({
  schemaVersion: z.literal(1),
  id,
  version: z.number().int().min(1),
  name: z.string().min(1).max(200),
  startDescription: z.string().max(500),
  destinationLabel: z.string().min(1).max(200),
  sourceVideoId: id,
  status: z.enum(['draft', 'approved']),
  checkpoints: z.array(CheckpointSchema).min(1).max(50),
  accessNotes: z.array(z.string().max(500)),
}) satisfies z.ZodType<Route>;

export const FrameRequestSchema = z.object({
  sessionId: id,
  routeVersion: z.number().int().min(1),
  sequence: z.number().int().min(1),
  capturedAt: z.iso.datetime(),
  mediaId: id,
  question: z.string().max(500).optional(),
}) satisfies z.ZodType<FrameRequest>;

export const ManualCompletionBodySchema = z.object({
  routeVersion: z.number().int().min(1),
  sequence: z.number().int().min(1),
  checkpointId: id,
}) satisfies z.ZodType<ManualCompletionRequest>;

export const ApproveBodySchema = z.object({
  version: z.number().int().min(1),
  reviewedCheckpointIds: z.array(id),
});
export const StartSessionBodySchema = z.object({ routeId: id, locale: LocaleSchema, mode: ModeSchema });
export const LocaleBodySchema = z.object({ locale: LocaleSchema });
