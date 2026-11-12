/**
 * Motion tokens for the "survey in progress" language. Mirror the CSS variables in globals.css.
 * Durations are in seconds (motion) — use the CSS variables for CSS transitions.
 */
export const EASE_SURVEY = [0.5, 0, 0.1, 1] as const; // a surveyor's steady pull: slow start, firm settle
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const DUR = { tick: 0.12, fast: 0.18, base: 0.26, slow: 0.52, draw: 1.1 } as const;
/** Gap between ledger rows inking in. */
export const STAGGER = 0.035;
/** Spring for drawers and the active-tab marker. */
export const SPRING_SNAP = { type: "spring", stiffness: 520, damping: 42, mass: 0.9 } as const;
export const SPRING_DRAWER = { type: "spring", stiffness: 340, damping: 38 } as const;
