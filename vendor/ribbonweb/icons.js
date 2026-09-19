// Original geometric UI icons. Keys are stable; labels are always supplied separately.
const paths = {
  clipboard: 'M9 4H6v17h14V4h-3M9 2h8v5H9zM9 11h8M9 15h6',
  copy: 'M8 8h12v14H8zM16 8V2H3v15h5',
  cut: 'M8 8l11 13M8 16L19 3M4 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6M4 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  save: 'M3 3h15l3 3v15H3zM7 3v7h10V3M7 21v-7h10v7',
  undo: 'M8 4L3 9l5 5M3 9h11a6 6 0 0 1 0 12',
  redo: 'M16 4l5 5-5 5M21 9H10a6 6 0 0 0 0 12',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l7 7',
  bold: 'M7 3h6a5 5 0 0 1 0 10H7V3M7 13h7a4 4 0 0 1 0 8H7v-8',
  italic: 'M11 3h9M4 21h9M16 3L8 21',
  underline: 'M6 3v9a6 6 0 0 0 12 0V3M3 22h18',
  left: 'M3 4h18M3 9h12M3 14h18M3 19h12',
  center: 'M3 4h18M7 9h10M3 14h18M7 19h10',
  right: 'M3 4h18M9 9h12M3 14h18M9 19h12',
  justify: 'M3 4h18M3 9h18M3 14h18M3 19h18',
  list: 'M8 4h13M8 11h13M8 18h13M3 4h1M3 11h1M3 18h1',
  table: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
  image: 'M3 3h18v18H3zM3 17l6-7 5 6 3-3 4 4M16 7h1',
  chart: 'M3 3v18h19M7 17v-6h3v6M13 17V5h3v12M19 17V8h3v9',
  link: 'M9 15l6-6M8 17l-2 2a4 4 0 0 1-5-5l5-5a4 4 0 0 1 6 0M16 7l2-2a4 4 0 0 1 5 5l-5 5a4 4 0 0 1-6 0',
  comment: 'M3 3h18v14H9l-6 5zM7 7h10M7 11h7',
  page: 'M5 2h9l5 5v15H5zM14 2v6h5M8 12h8M8 16h8',
  slides: 'M2 4h20v14H2zM12 18v4M6 22h12M6 8h6M6 12h11',
  shape: 'M3 3h10v10H3zM16 10a6 6 0 1 0 0 12 6 6 0 0 0 0-12',
  brush: 'M14 2l8 8-9 9-8-8zM4 15l5 5-6 2z',
  delete: 'M3 5h18M9 5V2h6v3M5 5l1 17h12l1-17M10 9v9M14 9v9',
  settings: 'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',
  print: 'M6 8V2h12v6M6 17H2V8h20v9h-4M6 13h12v9H6z',
  download: 'M12 2v14M6 10l6 6 6-6M3 17v5h18v-5',
  paint: 'M6 4l12 12-7 7L0 12zM4 0l12 12M17 18h6M20 2c0 0-3 5-3 7a3 3 0 0 0 6 0c0-2-3-7-3-7',
  sort: 'M4 3v18M1 18l3 3 3-3M10 4h12M10 10h8M10 16h4',
  filter: 'M2 3h20l-8 9v8l-4 2V12z',
  check: 'M3 12l6 6L21 5',
  close: 'M5 5l14 14M19 5L5 19',
  plus: 'M12 3v18M3 12h18',
  play: 'M6 3l15 9-15 9z',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  formula: 'M19 3h-5l-4 18H5M7 9h10',
  color: 'M4 18L12 2l8 16M7 12h10M3 22h18',
  indent: 'M10 4h12M10 10h12M10 16h12M2 7l5 5-5 5',
  full: 'M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M12 6v7l4 3',
};
export function createIcon(name, doc = document) {
  const span = doc.createElement('span');
  span.className = 'icon';
  span.setAttribute('aria-hidden', 'true');
  if (paths[name]) {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.6');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const p = doc.createElementNS(svg.namespaceURI, 'path');
    p.setAttribute('d', paths[name]);
    svg.append(p);
    span.append(svg);
  } else if (name && /^(https?:|data:image\/(png|jpeg|webp|gif);|\.\.?\/|\/)/.test(name)) {
    const img = doc.createElement('img');
    img.src = name;
    img.alt = '';
    span.append(img);
  } else {
    span.classList.add('symbol');
    span.textContent = name || '◇';
  }
  return span;
}
