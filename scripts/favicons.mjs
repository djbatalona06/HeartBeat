// The favicon each deploy target actually earns.
//
// All four used to point at one of two things: the app's own PWA icon
// (borrowed by the landing page, which draws its own distinct mark in its
// header and never used it for its tab), or a cat mark copied by hand into
// both gift/build.mjs and scripts/build-study.mjs — two copies that had
// already drifted from each other and from the landing page's own SVG.
// Kept here once, so changing a mark means changing it in one place.

function iconTag(viewBox, body) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`;
  return `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(svg)}">`;
}

/** The landing page's own mark — a cat face with one red bow, cream on the
 *  page's dark ground. Matches the inline SVG in index.html's own header. */
export const LANDING_FAVICON = iconTag('0 0 100 78',
  '<path d="M22 26C16 12 20 6 26 5c7-1 14 6 18 15z" fill="#fffdfa"/>'
  + '<path d="M78 26C84 12 80 6 74 5c-7-1-14 6-18 15z" fill="#fffdfa"/>'
  + '<ellipse cx="50" cy="44" rx="33" ry="27" fill="#fffdfa"/>'
  + '<ellipse cx="38" cy="42" rx="3.4" ry="4.6" fill="#2a0f1c"/>'
  + '<ellipse cx="62" cy="42" rx="3.4" ry="4.6" fill="#2a0f1c"/>'
  + '<ellipse cx="50" cy="50" rx="4.6" ry="3.3" fill="#f5c85c"/>'
  + '<circle cx="25" cy="22" r="8" fill="#d81f45"/>');

/** The app's own mark — a heart, for the app named after one. Nothing else
 *  on the four surfaces already carried one. */
export const APP_FAVICON = iconTag('0 0 100 100',
  '<path d="M50 88C20 62 22 36 42 34c8-1 8 8 8 14 0-6 0-15 8-14 20 2 22 28-8 54z" fill="#ff8fb0"/>');

/** The gift's own mark — a wrapped present, for the page that is one. */
export const GIFT_FAVICON = iconTag('0 0 100 100',
  '<rect x="18" y="42" width="64" height="46" rx="4" fill="#ff8fb0"/>'
  + '<rect x="18" y="30" width="64" height="16" rx="3" fill="#f2578a"/>'
  + '<rect x="45" y="18" width="10" height="70" fill="#fffdfa"/>'
  + '<path d="M50 30C40 14 20 14 24 28c2 6 14 4 26 2z" fill="#f2578a"/>'
  + '<path d="M50 30C60 14 80 14 76 28c-2 6-14 4-26 2z" fill="#f2578a"/>');

/** The study page's own mark — a flashcard, dog-eared, mid-flip. */
export const STUDY_FAVICON = iconTag('0 0 100 100',
  '<rect x="16" y="20" width="68" height="60" rx="6" fill="#6ebeeb"/>'
  + '<path d="M84 20 L84 44 L60 20 Z" fill="#111a24" opacity="0.25"/>'
  + '<path d="M30 42 L70 42 M30 56 L58 56" stroke="#111a24" stroke-width="5" '
  + 'stroke-linecap="round" opacity="0.55"/>');
