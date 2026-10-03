---
name: breadcrumb-design
description: Design or polish Breadcrumb creator and camera-guide screens with responsive layout, accessible states and rendered visual review.
---

# Design Breadcrumb

Use project-root paths; resolve symlinks to canonical `skills/breadcrumb-design/`. Read [the design system](../../knowledge/design-system.md), relevant scope and existing UI. Read [navigation invariants](../../knowledge/architecture.md#navigation-invariants) when changing guidance.

Choose one composition around the actual route task. Use the system sans stack and tokens in `src/ui/theme.css`. Use the shared shadcn Button, Input, Textarea and Badge. Keep radii at 6–10px, controls at least 44px high and dividers thin. Use whitespace instead of nested cards. Make the guide instruction dominant; creator editing follows the checkpoint sequence. Keep the Breadcrumb name and trail mark. Keep mock status explicit and testing controls secondary.

Consult [the reuse inventory](../../knowledge/reuse.md) before adding UI packages or assets. Prefer adapting the existing primitives or a suitable maintained asset; record imported asset provenance and license.

For shared-theme work, restyle the existing guide class names; keep guide TSX and lifecycle unchanged. Import Tailwind v4 theme and utilities without preflight. Use MotionConfig with `reducedMotion="user"` and CSS reduced-motion rules. Animate only meaningful creator status changes. Never animate progress, arrows or camera location.

Build the whole affected interaction, including loading, permission denial, uncertainty and recovery. Preserve captions, mute, focus, reduced motion and bilingual layout. Never add an arrow to unconfirmed orientation for visual impact.

Render at phone and desktop widths with available browser tools. Inspect screenshots and controls; confirm suspected overflow through DOM dimensions. Refine observed problems, then save the design decision and open issues in the design output. Record screenshots and viewport evidence in verification. No visual-verification claim without an inspected render.
