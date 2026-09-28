// The scroll film is a list of chapters played back to back as one frame index.
// Frames are produced by scripts/extract-frames.sh (native 24fps, WebP, two widths).
//
// To add the Atlanta mural footage (Video A) as the opening:
//   scripts/extract-frames.sh source/video-a-mural.mp4 a-mural
//   then put { id: 'a-mural', frames: <count printed> } FIRST in `chapters`
//   and re-time the beat overlays in index.html (data-in / data-peak / data-out are 0–1
//   progress through the whole film).
export const FILM = {
  chapters: [
    { id: 'b-goodies', frames: 241 },
  ],
  // Source aspect (width / height) of the footage. Video B is 1404×1476.
  aspect: 1404 / 1476,
  ext: 'webp',
  base: '/film',
  // Breakpoint that swaps the frame set and the composition.
  mobileQuery: '(max-width: 899px)',
  // Readout chapters, as progress positions through the whole film.
  readout: [
    { at: 0.0, label: 'Taylor Made' },
    { at: 0.36, label: 'Cookies' },
    { at: 0.58, label: 'Cakes' },
    { at: 0.86, label: 'Goodies' },
  ],
};
