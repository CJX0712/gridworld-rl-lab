const fs = require('fs');
const vm = require('vm');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = html.match(/<script id="engine">([\s\S]*?)<\/script>/);
const ctx = {
  console, Math, Object, Array, JSON, isFinite, Infinity,
  TextEncoder, TextDecoder, Uint8Array, Int8Array, Int32Array, Float64Array, globalThis: {}
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(m[1], ctx, { filename: 'engine.js' });
const GW = ctx.GW;

let pass = 0; const fails = [];
function ok(cond, name) { if (cond) pass++; else fails.push(name); }

const GAMMA = 0.95;

// ---- 1. grid generation sanity
for (let seed = 1; seed <= 40; seed++) {
  const g = GW.makeGrid(9, seed);
  ok(g.cells[g.start] === GW.EMPTY, 'start not empty seed=' + seed);
  ok(g.cells[g.goal] === GW.EMPTY, 'goal not empty seed=' + seed);
  ok(GW.bfsDist(g, g.start, g.goal) > 0, 'goal reachable seed=' + seed);
  let walls = 0; for (const c of g.cells) if (c === GW.WALL) walls++;
  ok(walls < g.cells.length, 'not fully walled seed=' + seed);
}

// ---- 2. value iteration: Bellman residual -> 0, and optimality
for (const seed of [7, 42, 2026, 90914]) {
  const g = GW.makeGrid(9, seed);
  const r = GW.valueIteration(g, GAMMA);
  ok(r.residual < 1e-10, 'VI residual tiny seed=' + seed + ' got ' + r.residual);
  ok(GW.bellmanResidual(g, r.V, r.Q, GAMMA) < 1e-10, 'VI Bellman residual seed=' + seed);
  const path = GW.rollout(g, r.Q);
  ok(path[path.length - 1] === g.goal, 'VI greedy reaches goal seed=' + seed);
  const shortest = GW.bfsDist(g, g.start, g.goal);
  ok(path.length - 1 === shortest, 'VI path == BFS shortest seed=' + seed + ' (' + (path.length - 1) + ' vs ' + shortest + ')');
  // optimal path never enters a trap
  ok(!path.some(s => g.cells[s] === GW.TRAP), 'VI path avoids traps seed=' + seed);
}

// ---- 3a. greedy rollout return == V*(start)  (consistency of the fixed point)
for (const seed of [5, 42, 314]) {
  const g = GW.makeGrid(9, seed);
  const r = GW.valueIteration(g, GAMMA);
  const path = GW.rollout(g, r.Q);
  let ret = 0;
  for (let i = 0; i < path.length - 1; i++) {
    let a = 0;
    for (let k = 1; k < 4; k++) if (r.Q[path[i] * 4 + k] > r.Q[path[i] * 4 + a]) a = k;
    const t = GW.step(g, path[i], a, GAMMA);
    ret += Math.pow(GAMMA, i) * t.r;
    if (t.done) break;
  }
  ok(Math.abs(ret - r.V[g.start]) < 1e-9, 'rollout return == V*(start) seed=' + seed + ' (' + ret + ' vs ' + r.V[g.start] + ')');
}

// ---- 3b. tiny grid with a closed-form answer: 3x3, no walls, start (0,0) goal (2,2)
{
  const g = { n: 3, cells: new Uint8Array(9), start: 0, goal: 8 };
  const r = GW.valueIteration(g, GAMMA);
  // shortest path = 4 steps: three -0.04 penalties then +1
  const expect = -0.04 * (1 + GAMMA + GAMMA * GAMMA) + Math.pow(GAMMA, 3) * 1;
  ok(Math.abs(r.V[0] - expect) < 1e-9, '3x3 analytic V*(start) (' + r.V[0] + ' vs ' + expect + ')');
  const p = GW.rollout(g, r.Q);
  ok(p.length - 1 === 4, '3x3 shortest path = 4 steps, got ' + (p.length - 1));
  ok(p[p.length - 1] === 8, '3x3 reaches goal');
}

// ---- 3c. trap is never worth it: a grid where the trap sits next to start
{
  const cells = new Uint8Array(9);
  cells[1] = GW.TRAP; // right of start is a trap
  const g = { n: 3, cells, start: 0, goal: 2 };
  const r = GW.valueIteration(g, GAMMA);
  let a = 0;
  for (let k = 1; k < 4; k++) if (r.Q[k] > r.Q[a]) a = k;
  ok(a !== 1, 'optimal policy avoids stepping into the trap (chose ' + a + ')');
  // 陷阱挡住近路 => 最优需绕行 4 步: -0.04*(1+g+g^2) + g^3
  const expectTrap = -0.04 * (1 + GAMMA + GAMMA * GAMMA) + Math.pow(GAMMA, 3);
  ok(Math.abs(r.V[0] - expectTrap) < 1e-9, 'detour V*(start) analytic (' + r.V[0] + ' vs ' + expectTrap + ')');
  const tp = GW.rollout(g, r.Q);
  ok(!tp.some(s => g.cells[s] === GW.TRAP), 'detour path never enters trap');
}

// ---- 4. Q-learning converges to V*
for (const seed of [3, 11, 77]) {
  const g = GW.makeGrid(7, seed);
  const star = GW.valueIteration(g, GAMMA);
  // 乐观初始化 + 随机起点：值能真正传播回全图
  const res = GW.qLearning(g, 1234, 20000, 0.3, 0.3, GAMMA, true, 0.1, 0.2, 1);
  const gap = GW.gapToStar(g, res.Q, star.V, res.visits, 10);
  ok(gap.maxGap < 0.05, 'Q-learning -> V* (optimistic+random-start) grid=' + seed + ' gap=' + gap.maxGap.toFixed(4));
  ok(gap.coverage > 0.90, 'random-start coverage grid=' + seed + ' coverage=' + gap.coverage.toFixed(2));

  // 悲观初始化（Q0=0）时"动作饿死"是真实存在的：全图收敛慢，但从起点出发的策略仍然最优
  const res0 = GW.qLearning(g, 1234, 20000, 0.3, 0.3, GAMMA, true, 0.1, 0.2, 0);
  const p0 = GW.rollout(g, res0.Q);
  ok(p0[p0.length - 1] === g.goal, 'Q0=0 still solves the task grid=' + seed);
  const vq0 = Math.max(res0.Q[g.start * 4], res0.Q[g.start * 4 + 1], res0.Q[g.start * 4 + 2], res0.Q[g.start * 4 + 3]);
  ok(Math.abs(vq0 - star.V[g.start]) < 0.1, 'Q0=0 V(start) coarse but sane grid=' + seed + ' (' + vq0.toFixed(3) + ')');
  const vqStart = Math.max(res.Q[g.start * 4], res.Q[g.start * 4 + 1], res.Q[g.start * 4 + 2], res.Q[g.start * 4 + 3]);
  ok(Math.abs(vqStart - star.V[g.start]) < 0.05, 'V(start) accurate grid=' + seed + ' (' + vqStart.toFixed(3) + ' vs ' + star.V[g.start].toFixed(3) + ')');
  const p = GW.rollout(g, res.Q);
  ok(p[p.length - 1] === g.goal, 'QL greedy reaches goal grid=' + seed);
  const shortest = GW.bfsDist(g, g.start, g.goal);
  ok(p.length - 1 === shortest, 'QL path == shortest grid=' + seed + ' (' + (p.length - 1) + ' vs ' + shortest + ')');
}

// ---- 5. determinism (bit-exact)
{
  const g = GW.makeGrid(9, 55);
  const a = GW.qLearning(g, 999, 300, 0.3, 0.3, GAMMA);
  const b = GW.qLearning(g, 999, 300, 0.3, 0.3, GAMMA);
  let same = a.Q.length === b.Q.length;
  for (let i = 0; i < a.Q.length && same; i++) if (a.Q[i] !== b.Q[i]) same = false;
  ok(same, 'Q-learning deterministic for same seed');
  const g1 = GW.makeGrid(9, 55), g2 = GW.makeGrid(9, 55);
  ok(g1.cells.join(',') === g2.cells.join(','), 'grid generation deterministic');
}

// ---- 6. exploration actually decays: late episodes have higher return than early
{
  const g = GW.makeGrid(9, 88);
  const r = GW.qLearning(g, 7, 2000, 0.3, 0.3, GAMMA);
  const early = r.returns.slice(0, 100).reduce((a, b) => a + b, 0) / 100;
  const late = r.returns.slice(-100).reduce((a, b) => a + b, 0) / 100;
  ok(late > early, 'return improves over training (early ' + early.toFixed(3) + ' -> late ' + late.toFixed(3) + ')');
}

// ---- 7. edge cases
{
  // start == goal
  const g = { n: 3, cells: new Uint8Array(9), start: 0, goal: 0 };
  const r = GW.valueIteration(g, GAMMA);
  ok(isFinite(r.V[0]), 'start==goal VI finite');
  const p = GW.rollout(g, r.Q);
  ok(p.length >= 1, 'start==goal rollout non-empty');
}
{
  // 1x1 grid
  const g = { n: 1, cells: new Uint8Array(1), start: 0, goal: 0 };
  const r = GW.valueIteration(g, GAMMA);
  ok(isFinite(r.V[0]), '1x1 grid VI finite');
}
{
  // all-walled around start: bumping into wall keeps state
  const cells = new Uint8Array(9);
  cells[1] = GW.WALL; cells[3] = GW.WALL;
  const g = { n: 3, cells, start: 0, goal: 8 };
  const t = GW.step(g, 0, 1, GAMMA); // right into wall
  ok(t.ns === 0 && !t.done, 'bump into wall keeps position');
  const t2 = GW.step(g, 0, 2, GAMMA); // down into wall
  ok(t2.ns === 0, 'bump down keeps position');
}
{
  // trap terminates with -1
  const cells = new Uint8Array(9); cells[3] = GW.TRAP;
  const g = { n: 3, cells, start: 0, goal: 8 };
  const t = GW.step(g, 0, 2, GAMMA);
  ok(t.done && t.r === -1, 'trap = terminal -1');
}
{
  // unreachable goal -> bfs -1, VI still finite (no crash)
  const cells = new Uint8Array(9);
  cells[1] = GW.WALL; cells[3] = GW.WALL; cells[5] = GW.WALL; cells[7] = GW.WALL;
  const g = { n: 3, cells, start: 0, goal: 4 };
  ok(GW.bfsDist(g, 0, 4) === -1, 'unreachable detected');
  const r = GW.valueIteration(g, GAMMA);
  ok(r.V.every(v => isFinite(v)), 'unreachable goal VI all finite');
}

// ---- 8. gamma sensitivity: greedy policy monotone-ish check (shortest path under high gamma)
{
  const g = GW.makeGrid(9, 31);
  for (const gamma of [0.5, 0.9, 0.99]) {
    const r = GW.valueIteration(g, gamma);
    const p = GW.rollout(g, r.Q);
    ok(p[p.length - 1] === g.goal, 'gamma=' + gamma + ' reaches goal');
  }
}

fs.writeFileSync(path.join(__dirname, '_smoke.log'),
  `PASS ${pass} / ${pass + fails.length}\n` + (fails.length ? 'FAIL: ' + fails.join(' | ') : 'ALL GREEN') + '\n');
console.log(`PASS ${pass} / ${pass + fails.length}`);
if (fails.length) console.log('FAIL: ' + fails.join(' | ')); else console.log('ALL GREEN');
process.exit(fails.length ? 1 : 0);
