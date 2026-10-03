# Product brief

Status: working product direction. Sources: user requests on 2026-10-03 and the supplied handoff.

## Audience and promise

An event host repeatedly explains how to find a room. A visitor in an unfamiliar building needs to check whether a landmark or door is correct. Breadcrumb turns a recorded walk into reviewed instructions responding to the visitor's camera.

## Experience

Host: record/upload a short walk → review generated checkpoints, reference views and directions → approve → share a link.

Visitor: open at the recorded entrance → grant camera access → follow an instruction tied to evidence → get clarification when uncertain → confirm arrival from destination evidence. English and Spanish are the initial language pair.

## Detailed route instructions

**User requirement, 2026-10-03:** routes must support specific actions and landmark relationships, beyond simple turns. Examples: pass through the door below a named sign; use the right side of a particular rock; take the elevator to floor 3, then exit. Left and right must refer to the recorded approach, not an unstated viewpoint.

Instructions must retain the target, action, qualifiers and expected result. Split compound directions into short ordered steps when the user must verify an intermediate result. Text and speech carry the full meaning; an arrow is optional and cannot replace an action such as waiting for an elevator or selecting a floor.

A route step is complete only when its specified result is observed or the visitor explicitly confirms it. Recognizing the starting landmark does not prove the action was completed. Manual confirmation must remain visibly manual. If the app cannot distinguish doors, floors or sides, it asks for a better view or confirmation and preserves progress.

The first real demonstration must include a named-door step and a floor transition. The same route representation should retain a taught terrain instruction, including the rock example. Reliable physical guidance on that terrain needs its own recordings and field checks; it is not established by an indoor test or by storing the text.

## Delivery choice

**Decision:** one mobile-first TypeScript web app. A phone opens a URL; desktop supports creation and demonstration. Claude selected Next.js/React for the baseline. Native iOS/Android packaging and spatially anchored AR are outside this MVP.

**Decision:** Claude Code leads engineering and integration. Human roles live in the team handoff. Beautiful, usable mobile design is a requirement, including errors and uncertainty.

## MVP boundaries

Local slice: fictional sample route, editable review/approval, sessions, explicit mock observations, guiding/uncertain/reorient/arrived, locale switching and camera permission handling. This proves interactions and state handling, not recognition.

First real MVP: one short taught route, Gemini extraction into an editable draft, independent follow footage/camera matching, detailed route instructions, orientation checks, uncertainty, arrival and ElevenLabs speech. The original 45–90 second/four-checkpoint target is a starting example, not a limit that removes required door or elevator steps. Measure second-phone behavior; report sample size and latency without invented reliability percentages.

Conditional later additions: Photon photo help after access and a real exchange are proved; quality analytics after useful real events exist. Evaluate PWA installation only if actual use needs it.

Excluded: campus-wide localization, arbitrary rerouting, obstacle avoidance, blind mobility claims, payments/wallets, face sensing, open-ended navigation chat and unrelated sponsor features.

## Human inputs

Choose a route; capture teaching and second-phone footage; verify directions and access notes; configure credentials in ignored local environment files; test physical-phone camera/audio. Confirm event rules directly before submission. The kit's event statements were not independently verified in this setup.
