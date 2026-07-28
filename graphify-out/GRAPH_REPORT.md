# Graph Report - .  (2026-07-27)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 130 nodes · 174 edges · 11 communities (9 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8

## God Nodes (most connected - your core abstractions)
1. `getTerrainHeight()` - 16 edges
2. `compilerOptions` - 16 edges
3. `World` - 11 edges
4. `Trees` - 6 edges
5. `WindLines` - 5 edges
6. `changeModel()` - 5 edges
7. `scripts` - 4 edges
8. `Castles` - 4 edges
9. `Floor` - 4 edges
10. `Flowers` - 4 edges

## Surprising Connections (you probably didn't know these)
- `World` --references--> `Trees`  [EXTRACTED]
  src/graphics/World.ts → src/graphics/Trees.ts
- `World` --references--> `WindLines`  [EXTRACTED]
  src/graphics/World.ts → src/graphics/WindLines.ts
- `initUnits()` --calls--> `getTerrainHeight()`  [EXTRACTED]
  src/simulation/battle.worker.ts → src/simulation/constants.ts
- `World` --references--> `Castles`  [EXTRACTED]
  src/graphics/World.ts → src/graphics/Castles.ts
- `World` --references--> `Floor`  [EXTRACTED]
  src/graphics/World.ts → src/graphics/Floor.ts

## Import Cycles
- None detected.

## Communities (11 total, 2 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (27): camera, canvas, clock, controls, dcVal, _deadMatrix, dummy, fpsVal (+19 more)

### Community 1 - "Community 1"
Cohesion: 0.17
Nodes (10): Castles, Floor, Flowers, Grass, WaterSurface, World, findNearestEnemy(), initUnits() (+2 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (21): DOM, ES2023, src, vite/client, compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly (+13 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (18): dependencies, three, @types/three, devDependencies, typescript, vite, name, private (+10 more)

### Community 4 - "Community 4"
Cohesion: 0.12
Nodes (13): setSharedData(), btnReset, btnStart, overlay, overlayBtn, overlayMsg, scoreA, scoreB (+5 more)

### Community 5 - "Community 5"
Cohesion: 0.50
Nodes (4): changeModel(), createNameTexture(), gltfLoader, logDiag()

### Community 8 - "Community 8"
Cohesion: 0.67
Nodes (3): fadeToAnimation(), startRenderLoop(), updateFrame()

## Knowledge Gaps
- **67 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+62 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `World` connect `Community 1` to `Community 0`, `Community 6`, `Community 7`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **Why does `getTerrainHeight()` connect `Community 1` to `Community 6`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _67 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._