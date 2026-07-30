# Graph Report - .  (2026-07-30)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 259 nodes · 424 edges · 16 communities (15 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e545e606`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- SkillFX.ts
- getTerrainHeight
- renderer.ts
- battle.worker.ts
- package.json
- compilerOptions
- main.ts
- ui_billboards.ts
- scene.ts
- WindEffectManager
- SoundManager
- startRenderLoop
- changeModel

## God Nodes (most connected - your core abstractions)
1. `getTerrainHeight()` - 21 edges
2. `spawnSkillFX()` - 17 edges
3. `compilerOptions` - 16 edges
4. `World` - 12 edges
5. `pooledPlane()` - 10 edges
6. `SoundManager` - 9 edges
7. `fxQualityScale()` - 8 edges
8. `spawnTauntFX()` - 8 edges
9. `spawnShieldBashFX()` - 8 edges
10. `spawnIronFortitudeAuraFX()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `spawnSkillFX()` --calls--> `getTerrainHeight()`  [EXTRACTED]
  src/graphics/core/renderer.ts → src/simulation/constants.ts
- `initUnits()` --calls--> `getTerrainHeight()`  [EXTRACTED]
  src/simulation/battle.worker.ts → src/simulation/constants.ts
- `tick()` --calls--> `getTerrainHeight()`  [EXTRACTED]
  src/simulation/battle.worker.ts → src/simulation/constants.ts
- `changeModel()` --calls--> `initNameBars()`  [EXTRACTED]
  src/graphics/core/renderer.ts → src/graphics/ui/ui_billboards.ts
- `spawnSkillFX()` --calls--> `canSpawnFX()`  [EXTRACTED]
  src/graphics/core/renderer.ts → src/graphics/effects/SkillFX.ts

## Import Cycles
- None detected.

## Communities (16 total, 1 thin omitted)

### Community 0 - "SkillFX.ts"
Cohesion: 0.07
Nodes (43): spawnSkillFX(), activeFX, _camQuad, canSpawnFX(), circleTex, effectUniforms, fireTex, flameTex (+35 more)

### Community 1 - "getTerrainHeight"
Cohesion: 0.11
Nodes (15): gltfLoader, Castles, Floor, Flowers, Grass, LEAF_COLORS, LeafParticle, Leaves (+7 more)

### Community 2 - "renderer.ts"
Cohesion: 0.09
Nodes (20): clock, dcVal, _forward, fpsVal, _frustum, geoVal, logPanel, _lookTarget (+12 more)

### Community 3 - "battle.worker.ts"
Cohesion: 0.13
Nodes (21): animLockTicks, applyDamage(), DelayedDamage, delayedDamages, findLowestHpAlly(), findNearestEnemy(), queueDamage(), statsDamageDealt (+13 more)

### Community 4 - "package.json"
Cohesion: 0.09
Nodes (21): gsap, dependencies, gsap, three, @types/three, devDependencies, typescript, vite (+13 more)

### Community 5 - "compilerOptions"
Cohesion: 0.09
Nodes (21): DOM, ES2023, src, vite/client, compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly (+13 more)

### Community 6 - "main.ts"
Cohesion: 0.10
Nodes (17): resetUnitsVisual(), setSharedData(), soundFX, btnReset, btnStart, overlay, overlayBtn, overlayMsg (+9 more)

### Community 7 - "ui_billboards.ts"
Cohesion: 0.13
Nodes (14): cdRingGeo, cdRingMat, cdRings, _deadMatrix, dummy, hpBarsBg, hpBarsFg, hpBgMat (+6 more)

### Community 8 - "scene.ts"
Cohesion: 0.20
Nodes (9): ambient, camera, canvas, controls, hemiLight, loadingManager, renderer, scene (+1 more)

### Community 9 - "WindEffectManager"
Cohesion: 0.22
Nodes (4): _sharedWindGeo, _sharedWindMat, WindEffectManager, WindLineState

### Community 11 - "startRenderLoop"
Cohesion: 0.33
Nodes (5): fadeToAnimation(), startRenderLoop(), updateFrame(), spawnIceShatterFX(), updateFX()

### Community 12 - "changeModel"
Cohesion: 0.40
Nodes (5): changeModel(), getModelsForMatchup(), logDiag(), createNameTexture(), initNameBars()

## Knowledge Gaps
- **107 isolated node(s):** `target`, `module`, `ES2023`, `DOM`, `vite/client` (+102 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getTerrainHeight()` connect `getTerrainHeight` to `SkillFX.ts`, `renderer.ts`, `battle.worker.ts`?**
  _High betweenness centrality (0.121) - this node is a cross-community bridge._
- **Why does `SoundManager` connect `SoundManager` to `main.ts`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `World` connect `getTerrainHeight` to `renderer.ts`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **What connects `target`, `module`, `ES2023` to the rest of the system?**
  _107 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `SkillFX.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07450980392156863 - nodes in this community are weakly interconnected._
- **Should `getTerrainHeight` be split into smaller, more focused modules?**
  _Cohesion score 0.112375533428165 - nodes in this community are weakly interconnected._
- **Should `renderer.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._