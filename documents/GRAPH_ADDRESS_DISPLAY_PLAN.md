# Graph Address Display Plan

## Goal

Make `fsca cluster graph` visually prove hot replacement, not just topology preservation.

## Problem

Current node labels only show:

- contract name
- contract ID

That is enough to show structure, but not enough to prove that a hot upgrade replaced the implementation address behind the same logical ID.

## Required Change

Each graph node should include:

- contract name
- contract ID
- contract address

Recommended label format:

```text
TradeEngineV1
ID: 2
0x0EDf...4F8c
```

Use a shortened address in the graph for readability:

- first 6 chars
- `...`
- last 4 chars

Example:

- `0x89dA...D14A`
- `0x0EDf...4F8c`

## Why This Is Needed

For hot upgrade demos, the proof should become visible inside the graph itself:

- before upgrade:
  - `TradeEngineV1`
  - `ID: 2`
  - `0x89dA...D14A`
- after upgrade:
  - `TradeEngineV1`
  - `ID: 2`
  - `0x0EDf...4F8c`

That gives a clean visual statement:

- logical identity is stable
- topology is stable
- implementation address changed

## Implementation Plan

1. Update `libs/commands/cluster/graph.js`
2. Add a helper to shorten addresses for display
3. Change node rendering from:

```js
N${n.id}["${n.name}<br/>(ID: ${n.id})"]
```

to a 3-line label:

```js
N${n.id}["${n.name}<br/>ID: ${n.id}<br/>${shortAddr(n.address)}"]
```

4. Keep full addresses in the internal node data, only shorten for HTML label
5. Keep the manager node shortened as well for consistency

## Optional Improvement

If you want stronger demo impact later, add one of these:

1. A side panel under the graph listing full addresses by ID
2. A before/after comparison mode
3. A special visual highlight when the same ID points to a new address after upgrade

## Minimum Demo Recommendation

For the current hackathon/demo version, the minimum acceptable proof stack should be:

1. `cluster info 2` before upgrade
2. `cluster graph` before upgrade
3. `cluster upgrade --id 2 --contract TradeEngineV2`
4. `cluster info 2` after upgrade
5. `cluster graph` after upgrade, with node address shown

This is enough to prove:

- same ID
- same topology
- different implementation address
