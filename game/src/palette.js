// The look plan, in one place. DUSTLINE is a dusk freight yard: warm sand and rust
// against cold steel blue, one amber accent for everything the player must notice.
// The same six names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#191512', // dusk sky / fog
  surface: '#2a2622', // walls, containers
  hairline: '#4a4238', // crates, cover
  ink: '#efe8da', // light-coloured geometry, text
  muted: '#8a94a0', // steel blue-grey fill
  accent: '#f0a830', // amber: heads, spike, buy highlights
};

export const BOT_COLORS = {
  torso: '#5a6b7a',
  head: '#c8ccd2',
  visor: '#f0a830',
};

export function shade(name) {
  return PALETTE[name];
}
