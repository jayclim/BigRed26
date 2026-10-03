# Product brief

Status: working product direction. Sources: user requests on 2026-10-03 and the supplied handoff.

## Audience and promise

An event host repeatedly explains how to find a room. A visitor in an unfamiliar building needs to check whether a landmark or door is correct. Breadcrumb turns a recorded walk into reviewed instructions responding to the visitor's camera.

## Experience

Host: record/upload a short walk → review generated checkpoints, reference views and directions → approve → share a link.

Visitor: open at the recorded entrance → grant camera access → follow an instruction tied to evidence → get clarification when uncertain → confirm arrival from destination evidence. English and Spanish are the initial language pair.

## Delivery choice

**Decision:** one mobile-first TypeScript web app. A phone opens a URL; desktop supports creation and demonstration. Claude selected Next.js/React for the baseline. Native iOS/Android packaging and spatially anchored AR are outside this MVP.

**Decision:** Claude Code leads engineering and integration. Human roles live in the team handoff. Beautiful, usable mobile design is a requirement, including errors and uncertainty.

## MVP boundaries

Local slice: fictional sample route, editable review/approval, sessions, explicit mock observations, guiding/uncertain/reorient/arrived, locale switching and camera permission handling. This proves interactions and state handling, not recognition.

First real MVP: an actual 45–90 second teaching walk, approximately four checkpoints, Gemini extraction into an editable draft, independent follow footage/camera matching, orientation checks, uncertainty, arrival and ElevenLabs speech. Measure second-phone behavior; report sample size and latency without invented reliability percentages.

Conditional later additions: Photon photo help after access and a real exchange are proved; quality analytics after useful real events exist. Evaluate PWA installation only if actual use needs it.

Excluded: campus-wide localization, arbitrary rerouting, obstacle avoidance, blind mobility claims, payments/wallets, face sensing, open-ended navigation chat and unrelated sponsor features.

## Human inputs

Choose a route; capture teaching and second-phone footage; verify directions and access notes; configure credentials in ignored local environment files; test physical-phone camera/audio. Confirm event rules directly before submission. The kit's event statements were not independently verified in this setup.
