# Detailed route guidance

Date: 2026-10-03. Status: accepted user requirement; implementation pending. Source: the user clarified that directions must cover named doors, the correct side of a rock, elevators and floor numbers.

The canonical product requirement is in [product.md](../../../knowledge/product.md). The inspected contract gap and engineering direction are in [architecture.md](../../../knowledge/architecture.md). This extends the original mock scope; it does not establish real recognition or physical reliability.

## Next implementation slice

Before extraction/matching assumes every instruction is an arrow, the integration owner must define and implement the smallest action-aware contract change. Update validation, approval, core progression, creator review, guide display, fixtures and speech callers together. Preserve existing simple-turn routes. Do not build a general workflow engine.

Acceptance cases:

- A named door is distinguished from a nearby similar door. Matching the sign above it can select the instruction; passage completion needs the expected next evidence or a logged manual confirmation.
- An elevator journey to floor 3 has ordered instructions and a floor completion condition. The system does not advance on a timer, an elevator entrance match or a view from the wrong floor. Camera loss during the ride preserves the current step.
- A side-specific rock instruction keeps its target, approach and right-side qualifier through review, storage, display and English/Spanish speech. A reversed or ambiguous approach does not produce a confident cue. Fixture success is not a successful field test.
- A valid instruction can be shown without a directional arrow. Simple-turn guidance and existing uncertainty, versioning, sequence and locale checks still work.

Validation of this scope update: inspected `contracts/contracts.ts`, `contracts/schemas.ts`, `src/server/core/core.ts` and creator/guide components. They support rich text but have the arrow requirement described above. No app code changed, so no new application test result is claimed. Actual provider and route tests remain pending.
