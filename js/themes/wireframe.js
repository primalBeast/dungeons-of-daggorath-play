/** Default wireframe theme — flat creatures, no extruded depth. */
export const wireframeTheme = {
  id: 'wireframe',
  name: 'Wireframe',
  description: 'Classic monochrome vector dungeon view.',
  renderer: {
    creatureDepth: false,
    viewportBg: '#000000',
    viewportBgInverted: '#e8e8e8',
    strokeLight: '#e8e8e8',
    strokeDark: '#0a0a0a',
    wallLineNear: 1.5,
    wallLineFar: 1,
    creatureLineNear: 1.8,
    creatureLineMid: 1.35,
    creatureLineFar: 1,
    creatureHighlight: true,
  },
  css: {
    '--bg': '#0a0a0a',
    '--fg': '#e8e8e8',
    '--accent': '#9bdc9b',
    '--panel': '#111111',
    '--border': '#333333',
  },
};