const fs = require('node:fs');
const src = fs.readFileSync('outputs/index.html', 'utf8');
const block = src.match(/const LEVELS = \[[\s\S]*?\n\];/)[0];
const levels = [...block.matchAll(/name:'([^']+)',subtitle:'([^']+)',par:(\d+)/g)].map(x => ({name: x[1], sub: x[2], par: +x[3]}));
const maps = [...block.matchAll(/map:\[([\s\S]*?)\]\}/g)].map(x => [...x[1].matchAll(/'([^']+)'/g)].map(y => y[1]));
const glyph = c => c === '#' ? '█' : c === '.' ? '·' : c === '*' ? '✦' : c === '^' ? '╫' : c === 'M' ? 'M' : c === '@' ? 'Ω' : c;
console.log('关卡总数:', levels.length, '| 地图数:', maps.length);
levels.slice(15).forEach((l, i) => {
  console.log('\n' + (i + 16) + ' ' + l.name + ' / ' + l.sub + '  par=' + l.par);
  maps[i + 15].forEach(r => console.log('  ' + [...r].map(glyph).join('')));
});
