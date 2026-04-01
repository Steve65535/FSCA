/**
 * 依赖图构建、环检测（DFS 三色标记）、拓扑排序（Kahn 算法）
 *
 * 边语义：
 *   A.activePods 包含 B_id  → B 必须先 mount → 边 B→A
 *   A.passivePods 包含 C_id → C 必须先 mount → 边 C→A
 */

const WHITE = 0, GRAY = 1, BLACK = 2;

function buildGraph(contracts) {
    // nodes: Map<id, contract>
    const nodes = new Map();
    for (const c of contracts) {
        nodes.set(c.arkheionId, c);
    }

    // adjacency: Map<id, Set<id>>  (from → to means "from must come before to")
    const adjacency = new Map();
    for (const id of nodes.keys()) adjacency.set(id, new Set());

    for (const c of contracts) {
        for (const depId of c.activePods) {
            if (nodes.has(depId)) {
                adjacency.get(depId).add(c.arkheionId);
            }
        }
        for (const depId of c.passivePods) {
            if (nodes.has(depId)) {
                adjacency.get(depId).add(c.arkheionId);
            }
        }
    }

    return { adjacency, nodes };
}

function detectCycles(graph) {
    const { adjacency, nodes } = graph;
    const color = new Map();
    for (const id of nodes.keys()) color.set(id, WHITE);

    const cycles = [];
    const stack = [];

    function dfs(u) {
        color.set(u, GRAY);
        stack.push(u);
        for (const v of (adjacency.get(u) || [])) {
            if (color.get(v) === GRAY) {
                // Found cycle — extract it from stack
                const cycleStart = stack.indexOf(v);
                cycles.push(stack.slice(cycleStart).concat(v));
            } else if (color.get(v) === WHITE) {
                dfs(v);
            }
        }
        stack.pop();
        color.set(u, BLACK);
    }

    for (const id of nodes.keys()) {
        if (color.get(id) === WHITE) dfs(id);
    }

    return { hasCycle: cycles.length > 0, cycles };
}

function topoSort(graph, cycles) {
    const { adjacency, nodes } = graph;

    // Collect all cycle edges to remove temporarily
    const cycleEdgeSet = new Set();
    const cycleEdges = [];

    for (const cycle of cycles) {
        // cycle = [a, b, ..., a] — last element repeats first
        for (let i = 0; i < cycle.length - 1; i++) {
            const from = cycle[i];
            const to = cycle[i + 1];
            const key = `${from}->${to}`;
            if (!cycleEdgeSet.has(key)) {
                cycleEdgeSet.add(key);
                // Determine edge type: which pod caused this edge
                const toContract = nodes.get(to);
                let type = 'active';
                if (toContract && toContract.passivePods.includes(from)) type = 'passive';
                cycleEdges.push({ from, to, type });
            }
        }
    }

    // Build in-degree map without cycle edges
    const inDegree = new Map();
    for (const id of nodes.keys()) inDegree.set(id, 0);

    for (const [from, tos] of adjacency) {
        for (const to of tos) {
            if (!cycleEdgeSet.has(`${from}->${to}`)) {
                inDegree.set(to, (inDegree.get(to) || 0) + 1);
            }
        }
    }

    // Kahn's BFS
    const queue = [];
    for (const [id, deg] of inDegree) {
        if (deg === 0) queue.push(id);
    }

    const sorted = [];
    while (queue.length > 0) {
        const u = queue.shift();
        sorted.push(u);
        for (const v of (adjacency.get(u) || [])) {
            if (cycleEdgeSet.has(`${u}->${v}`)) continue;
            const newDeg = inDegree.get(v) - 1;
            inDegree.set(v, newDeg);
            if (newDeg === 0) queue.push(v);
        }
    }

    return { sorted, cycleEdges };
}

module.exports = { buildGraph, detectCycles, topoSort };
