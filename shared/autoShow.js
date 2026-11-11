// The auto show's settings, shared by the server (which checks them) and the browser (which offers them).

/** How long each look or sequence stays on, in beats: one, two, four or eight bars of four beats. */
export const AUTO_BEATS = [4, 8, 16, 32];

export const AUTO_SOURCES = /** @type {const} */ (['looks', 'sequences']);

export const AUTO_ORDERS = /** @type {const} */ (['order', 'shuffle']);
