# Breadcrumb design direction

Status: working direction, 2026-10-03. The kit's palette and the user's beautiful-design requirement are constraints; exact treatments can evolve through rendered review.

## Visual language

Feel like a thoughtfully designed guide inside a building: quiet, legible and immediately directional. The distinctive element is a connected sequence of recognizable landmarks. Avoid decorative cards, generic charts and a marketing hero around a functional task.

| Role | Working token | Use |
|---|---|---|
| Paper | `#FBF8F3` | Creator canvas |
| Ink | `#1D2729` | Text on light canvas |
| Cyan | `#19C3DC` | Confirmed guidance and actions |
| Amber | `#F3A93C` | Uncertainty with explanation |
| Green | `#3DBE74` | Arrival |
| Night | `#0C1417` | Camera chrome |

Use dark text on bright accents. Verify actual contrast pairs; color tokens alone do not imply accessibility. Never use color as the only state signal. Centralize implemented tokens in the existing UI stylesheet; this document is design intent, not a second executable registry.

## Typography and composition

Reuse the implemented Atkinson Hyperlegible typeface delivered through Next.js, with system sans fallbacks. This supersedes the initial Avenir working choice after review of the rendered baseline. Route names are strong but compact; guide instructions are the largest text. Keep captions readable and lines short. Use generous space and tap targets around 44px or larger.

Creator: purposeful route editor with connected checkpoints, references and a clear review/approve action. Number only actual route order. Desktop can use two generous panes; phone becomes one column.

Guide: camera dominates, with calm dark chrome, a stable arrow and one short instruction. Sound, language, help and exit stay within reach. Show reference thumbnails only when real reference assets exist. Mock controls and labels remain distinct from route evidence.

## Interaction quality

Uncertainty removes the arrow and offers one useful action. Permission denial explains retry/fallback. Loading leaves controls responsive and never invents percentages. Errors preserve work. Arrival feels complete with restrained motion and a clear exit/restart.

Respect reduced motion; brief state transitions around 200–300ms are enough. Avoid continuously moving arrows. Use semantic controls, focus visibility, labels, captions, mute and status announcements. Spanish text must fit without overflow.

## Review standard

Inspect rendered phone and desktop screens, including guiding, uncertainty, reorientation, arrival, loading and errors. Test interactions, actual horizontal overflow, obscured controls, focus order and contrast. Do not claim visual quality from source inspection alone. Record unresolved issues honestly.
