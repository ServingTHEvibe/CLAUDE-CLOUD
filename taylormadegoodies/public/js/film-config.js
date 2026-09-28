// The scroll film: chapters played back to back as one frame index.
// Frames come from scripts/extract-frames.sh (native 24fps, WebP, desktop + mobile sets).
//
//   a-mural    Video A frames 0–124: the Atlanta wall, the push into the lettering, the
//              pink burst, and the cookie that fills the frame. That cookie is the portal.
//              (The source then pulls back out; that reverses the camera, so it is cut.)
//   b-goodies  Video B, all 241 frames: logo → dough → cookie → cake → finale.
//
// Beat overlays in index.html (data-in / data-peak / data-out) are 0–1 progress through
// the whole film, so re-time them if a chapter's frame count changes.
export const FILM = {
  chapters: [
    { id: 'a-mural', frames: 125, layout: 'cover', aspect: 1916 / 1080, srcW: { d: 1600, m: 960 } },
    { id: 'b-goodies', frames: 241, layout: 'portal', aspect: 1404 / 1476, srcW: { d: 1080, m: 720 } },
  ],
  ext: 'webp',
  base: '/film',
  mobileQuery: '(max-width: 899px), (orientation: portrait) and (max-width: 1199px)',
  // Progress window of the mural → goodies portal (the cookie opens into the second film).
  portal: { open: 0.3, done: 0.36 },
  readout: [
    { at: 0.0, label: 'Atlanta' },
    { at: 0.34, label: 'Taylor Made' },
    { at: 0.579, label: 'Cookies' },
    { at: 0.724, label: 'Cakes' },
    { at: 0.908, label: 'Goodies' },
  ],
};
