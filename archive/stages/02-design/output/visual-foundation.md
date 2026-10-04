# Visual foundation and creator redesign

Status: implemented; fresh rendered acceptance pending. Date: 2026-10-03. Branch: feat/design-system. Base: 14456b0.

Decision: replace large pill controls, Atkinson type and nested bordered cards with system sans, 6–10px radii, one cyan action accent and thin dividers. Keep the Breadcrumb mark. Desktop places video tools beside the checkpoint sequence; phone layout stacks both. Shared shadcn primitives cover creator controls. Keep native selects and review checkboxes. Preserve approval and extraction safeguards.

Guide changes are in `src/ui/theme.css` only. Route progress and instruction stay prominent. Camera controls are compact; mock observation controls use the dark surface and secondary text. Mock labeling, uncertainty, manual evidence and arrival semantics stay unchanged. No animated navigation or fabricated movement is added.

Motion is limited to creator status and messages. MotionConfig, useReducedMotion and CSS honor the user's reduced-motion setting. Fonts need no network call. Tailwind v4 utilities are enabled without preflight.

Inputs: the user verdict, maintained design/architecture references, the existing components and inspected before screenshots `01-creator-draft.png` and `06-guide-guiding.png`. The old rendered design receipt is stale for this new foundation. No fresh screenshots could be captured: the isolated server was blocked on port 3160. Build and check evidence is in the [verification receipt](../../04-verify/output/visual-foundation.md).

Next action: the lead renders 390px and 1280px creator and guide states, checks keyboard focus and Spanish wrapping, then checks the merged follow-camera UI against shared selectors. This worker does not push or merge.
