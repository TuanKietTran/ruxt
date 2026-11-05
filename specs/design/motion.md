# Motion

Motion values are tokens (`motion` in `design/tokens.json`). Components must use these durations and easings; one-off transition values are not allowed in new code.

## Durations

| Token | Value | Use |
| --- | --- | --- |
| instant | 0ms | Changes that must not animate (theme switch, reduced-motion results) |
| fast | 150ms | Hover, press, and small state changes (the web's standard UI transition) |
| standard | 200ms | Menus, popovers, small panels |
| emphasized | 280ms | Drawers, dialogs, larger surface changes |
| slow | 400ms | Large layout transitions only |
| skeleton | 1200ms | Loading skeleton pulse cycle |

Current web usage matches the fast token: nav links, buttons, tree items, and template cards transition color, background, border, and transform at 0.15s. The skeleton pulse runs at 1.2s ease-in-out, repeating, in the editor's session and template loading states.

## Easings

| Token | Value |
| --- | --- |
| standard | ease |
| emphasized | cubic-bezier(0.4, 0, 0.2, 1) |
| linear | linear |

Hover and state transitions use standard; elements that move or change size (drawers, dialogs) use emphasized; progress and skeleton cycles use linear or ease-in-out as specified by the owning component's current behavior.

## Rules

- An animation must never be the only signal of a state change; loading, success, and error all have text or structural equivalents (see Screens and Accessibility).
- Theme switching is instant: no cross-fade or animated color transition is applied when the theme changes.
- Looping animations are restricted to loading skeletons. Nothing else may animate indefinitely.

## Reduced motion

When the operating system requests reduced motion (`prefers-reduced-motion: reduce` on the web):

- All animation and transition durations collapse to 0.01ms, effectively instant, across the whole app. On the web this is a single global rule in the theme, so components inherit it and must not opt out.
- Looping skeleton pulses stop (the skeleton remains visible as a static placeholder).
- Every platform must apply the same behavior from the OS setting without an in-app override, and must reach the same end states — reduced motion changes timing only, never content or layout.
