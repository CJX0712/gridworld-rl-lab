const fs = require('fs');
const vm = require('vm');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = html.match(/<script id="engine">([\s\S]*?)<\/script>/);
const ctx = {
  console, Math, Object, Array, JSON, isFinite, Infinity,
  Uint8Array, Int8Array, Int32Array, Float64Array, globalThis: {}
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(m[1], ctx, { filename: 'engine.js' });
const GW = ctx.GW;

const GAMMA = 0.95;
const g = GW.makeGrid(9, 20260914);
const star = GW.valueIteration(g, GAMMA);
const EPISODES = 20000;
const ql = GW.qLearning(g, 1234, EPISODES, 0.3, 0.3, GAMMA, true, 0.1, 0.2, 1);

function vmap(Q) {
  const N = g.n, out = [];
  for (let s = 0; s < N * N; s++) {
    const v = Math.max(Q[s * 4], Q[s * 4 + 1], Q[s * 4 + 2], Q[s * 4 + 3]);
    let a = 0;
    for (let k = 1; k < 4; k++) if (Q[s * 4 + k] > Q[s * 4 + a]) a = k;
    out.push({ s, v, a });
  }
  return out;
}

let s = '';
s += 'grid 9x9  #=wall  X=trap  S=start  G=goal\n';
for (let y = 0; y < g.n; y++) {
  let row = '';
  for (let x = 0; x < g.n; x++) {
    const i = y * g.n + x;
    row += (i === g.start ? 'S' : i === g.goal ? 'G' : g.cells[i] === GW.WALL ? '#' : g.cells[i] === GW.TRAP ? 'X' : '.') + ' ';
  }
  s += row + '\n';
}

function asciiArrows(Q, title) {
  let o = '\n' + title + '\n';
  const vm2 = vmap(Q);
  for (let y = 0; y < g.n; y++) {
    let row = '';
    for (let x = 0; x < g.n; x++) {
      const i = y * g.n + x;
      if (g.cells[i] === GW.WALL) row += ' #';
      else if (i === g.goal) row += ' G';
      else if (i === g.start) row += ' S';
      else row += ' ' + GW.ARROW[vm2[i].a];
    }
    o += row + '\n';
  }
  return o;
}
s += asciiArrows(star.Q, 'value-iteration optimal policy (arrows)');
s += asciiArrows(ql.Q, 'Q-learning policy after ' + EPISODES + ' episodes');

function asciiV(Q, title) {
  const N = g.n;
  const vals = [];
  for (let i = 0; i < N * N; i++) if (g.cells[i] !== GW.WALL) vals.push(Math.max(Q[i * 4], Q[i * 4 + 1], Q[i * 4 + 2], Q[i * 4 + 3]));
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const ramp = ' .:-=+*%@#';
  let o = '\n' + title + ' (V range ' + lo.toFixed(3) + ' .. ' + hi.toFixed(3) + ')\n';
  for (let y = 0; y < N; y++) {
    let row = '';
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (g.cells[i] === GW.WALL) row += ' ';
      else if (i === g.goal) row += 'G';
      else {
        const v = Math.max(Q[i * 4], Q[i * 4 + 1], Q[i * 4 + 2], Q[i * 4 + 3]);
        const t = (v - lo) / ((hi - lo) || 1);
        row += ramp[Math.min(ramp.length - 1, Math.max(0, Math.floor(t * ramp.length)))];
      }
    }
    o += row + '\n';
  }
  return o;
}
s += asciiV(star.Q, 'V* heatmap');
s += asciiV(ql.Q, 'Q-learning V heatmap');

const pStar = GW.rollout(g, star.Q);
const pQL = GW.rollout(g, ql.Q);
s += '\nVI  greedy path: ' + pStar.join('->') + '  (len ' + (pStar.length - 1) + ')\n';
s += 'QL  greedy path: ' + pQL.join('->') + '  (len ' + (pQL.length - 1) + ')\n';
s += 'BFS shortest   : ' + GW.bfsDist(g, g.start, g.goal) + '\n';

// 终止态（终点/陷阱）的 Q 不参与学习，比较时必须排除，否则误差恒为 1
const gp = GW.gapToStar(g, ql.Q, star.V, ql.visits, 10);
const cov = GW.gapToStar(g, ql.Q, star.V, ql.visits, 1);
s += '\nmax |V_QL - V*| over states visited >= 10 = ' + gp.maxGap.toFixed(4) + '\n';
s += 'state coverage = ' + (cov.coverage * 100).toFixed(0) + '% (' + cov.visited + '/' + cov.reachable + ')\n';
s += 'V(start): Q-learning ' + Math.max(ql.Q[g.start * 4], ql.Q[g.start * 4 + 1], ql.Q[g.start * 4 + 2], ql.Q[g.start * 4 + 3]).toFixed(4) +
  '  vs  V* ' + star.V[g.start].toFixed(4) + '\n';
s += 'VI Bellman residual = ' + star.residual.toExponential(2) + ' (iters ' + star.iters + ')\n';

const ret = ql.returns;
const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
s += 'return: first100 ' + avg(ret.slice(0, 100)).toFixed(3) + ' -> last100 ' + avg(ret.slice(-100)).toFixed(3) + '\n';

fs.writeFileSync(path.join(__dirname, '_probe.txt'), s, 'utf8');
console.log('probe written');
