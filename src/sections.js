// The sections of the portfolio and where each one lives in the room.
// `color` is the pill in the Guide and the glow pulsing around the object.
// `toggle` sections do something in place instead of flying the camera to a close-up.
export const SECTIONS = [
  { id: 'about', label: 'About', where: 'the ID card', color: '#ef4b58' },
  { id: 'projects', label: 'Projects & writing', where: 'the computer', color: '#f7c948' },
  // Hidden for now: the journal stays on the desk but isn't clickable or in the guide.
  { id: 'misc', label: 'Sketches & poems', where: 'the journal', color: '#6fdb6f', hidden: true },
  { id: 'contact', label: 'Contact', where: 'the phone', color: '#4fd2f0' },
  // Not a close-up: clicking the window switches between day and night
  { id: 'window', label: 'Day / night', where: 'the window', color: '#b48cff', toggle: true },
  // Also in place: clicking the speaker starts or stops the music
  { id: 'music', label: 'Music', where: 'the speaker', color: '#ff7ac6', toggle: true },
];

export const sectionById = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
/** The sections people can reach: what the guide lists and the room lets you click */
export const VISIBLE_SECTIONS = SECTIONS.filter((s) => !s.hidden);
