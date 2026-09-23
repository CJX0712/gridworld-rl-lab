# GridWorld RL Lab

<p align="center">
  <a href="https://github.com/CJX0712/gridworld-rl-lab/actions/workflows/ci.yml"><img src="https://github.com/CJX0712/gridworld-rl-lab/actions/workflows/ci.yml/badge.svg" alt="ci"></a>
  <a href="https://github.com/CJX0712/gridworld-rl-lab/releases"><img src="https://img.shields.io/github/v/release/CJX0712/gridworld-rl-lab?sort=semver" alt="release"></a>
  <a href="https://github.com/CJX0712/gridworld-rl-lab/blob/main/LICENSE"><img src="https://img.shields.io/github/license/CJX0712/gridworld-rl-lab" alt="license"></a>
  <img src="https://img.shields.io/badge/author-%E6%99%A8%E6%98%9F-1f6feb" alt="author">
</p>

一个零依赖的单文件网页：在同一个网格世界里，让**值迭代**（用贝尔曼最优方程直接解出 V\*）和
**Q-learning**（靠试错逼近）同台对比。所有算法都是手写的，不引任何库，打开 `index.html` 即用。

## 能玩什么

- 7×7 / 9×9 / 13×13 三种迷宫，随机生成（墙、陷阱、起点、终点），保证终点可达
- 两种算法：值迭代（解析最优，17 次迭代残差归零）、Q-learning（ε-贪心 + 折扣回报）
- 实时可视化：格子底色 = V 值热力图，箭头 = 贪心策略，可让智能体按当前策略走一趟
- 右侧实时给出 **贪心路径长度 vs BFS 最短路径**、**与 V\* 的最大差距**、**状态覆盖率**
- 回报曲线：能直接看到"从乱撞（负回报）到稳定通关"的过程

奖励设计：终点 `+1`，陷阱 `−1`，每步 `−0.04`，折扣 γ=0.95。每步惩罚让最优策略倾向于最短路径，
所以"能到终点"和"真的最优"是两件事 —— 面板上的路径长度会立刻暴露差距。

## 两个真实存在的坑（引擎里都做了处理）

1. **动作饿死**：ε 退火后智能体只走当前最优路径，远离起点的状态再也不更新，
   Q 永远停在早期那个错误的估计上。解法是「随机起点」（每个状态都要被无限次访问，
   这本来就是表格型 Q-learning 收敛的前提）+ ε 保留 0.1 下限。
2. **乐观初始化**：Q 初值设为 1（可能的最大回报），所有动作一开始都"看起来很好"，
   被证明不好才降下来 —— 天然避免饿死，收敛速度快一个量级
   （9×9 上 2 万局后与 V\* 的最大差距 0.0009；悲观初始化同样局数还差 0.4 以上）。
   UI 上这两个开关都可以关掉，自己看差别。

## 文件

```
index.html   单文件应用（engine 脚本无 DOM 依赖，可被 Node 直接加载测试）
_smoke.js    无头自检：224 项断言
_probe.js    ASCII 探针：打印策略箭头、V 热力图、路径对比
```

## 验证

```bash
node _smoke.js   # PASS 224 / 224
node _probe.js   # 输出 _probe.txt
```

覆盖的不变量：

| 类别 | 不变量 |
| --- | --- |
| 值迭代 | Bellman 残差 → 0（<1e-10）；贪心路径 == BFS 最短路径；路径永不进陷阱 |
| 最优性 | 贪心 rollout 的折扣回报 == V\*(start)（误差 <1e-9）；3×3 无墙网格与解析解一致；绕陷阱的绕行价值与闭式解一致 |
| Q-learning | 乐观初始化 + 随机起点下，max\|V−V\*\| < 0.05（实测 0.0009）；覆盖率 > 90%；V(start) 精确 |
| 诚实对照 | Q0=0 时全图收敛明显变慢（复现"饿死"现象），但从起点出发的策略依然是最优路径 |
| 收敛过程 | 后 100 局平均回报 > 前 100 局 |
| 确定性 | 同种子两次训练 Q 表逐位相同；同种子迷宫逐格相同 |
| 边界 | 起点==终点、1×1 网格、撞墙原地不动、陷阱立即终止 −1、终点不可达时值仍有限 |

## License

MIT © 晨星
