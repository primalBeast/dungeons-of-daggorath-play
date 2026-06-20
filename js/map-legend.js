import {
  CREATURE_MAP_COLORS, creatureRosterForLevel,
} from './data.js';

function swatch(color) {
  return `<span class="map-swatch" style="background:${color}"></span>`;
}

export function buildMapLegendHtml(level) {
  const roster = creatureRosterForLevel(level);
  const mapItems = [
    `${swatch('#4d8a4d')}<span>Floor (tunnel)</span>`,
    `${swatch('#181818')}<span>Void (no passage)</span>`,
    '<span class="map-line wall"></span><span>Wall</span>',
    '<span class="map-door"></span><span>Door (opening)</span>',
    '<span class="map-stair-down"></span><span>Stairs / hole down</span>',
    '<span class="map-stair-up"></span><span>Ladder up</span>',
    '<span class="map-arrow"></span><span>You (facing)</span>',
  ];
  const creatureItems = roster.map(({ type, name, count }) => (
    `${swatch(CREATURE_MAP_COLORS[type])}<span>${name} ×${count}</span>`
  ));

  return [
    '<div class="map-legend-grid">',
    '<div class="map-legend-block">',
    '<div class="map-legend-heading">Map</div>',
    ...mapItems.map((item) => `<div class="map-legend-item">${item}</div>`),
    '</div>',
    '<div class="map-legend-block">',
    `<div class="map-legend-heading">Creatures (level ${level + 1})</div>`,
    creatureItems.length
      ? creatureItems.map((item) => `<div class="map-legend-item">${item}</div>`).join('')
      : '<div class="map-legend-item"><span>None on this level</span></div>',
    '</div>',
    '</div>',
  ].join('');
}