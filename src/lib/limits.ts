// Content limits. The first group is ENFORCED by firestore.rules (keep both in sync);
// the second group only improves the UI (rules cannot measure strings inside arrays).
export const MAX_TEXT_CHARS = 20_000 // note text
export const MAX_TITLE_CHARS = 100 // checklist / link title
export const MAX_URL_CHARS = 2048
export const MAX_TASKS = 100 // tasks per checklist
export const MAX_CELLS = 200 // cells per table
export const MAX_COLS = 10 // columns per table

export const MAX_CELL_CHARS = 500
export const MAX_TASK_CHARS = 500
