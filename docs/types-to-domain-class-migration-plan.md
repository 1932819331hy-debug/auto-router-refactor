# Types To Domain Class Migration Plan

## Objective

Design the new `/home/ohmx/autorouter` codebase so that:

- raw serialized data stays simple
- behavior lives next to the data it depends on
- new functions have one obvious home
- `utils` never becomes a dumping ground
- humans and LLMs can predict where code belongs without reading the whole repo

This plan is based on:

- the current repo state, where `lib/types.ts` is the only real library entry so far
- the older repo at `/home/ohmx/Documents/tscircuit-autorouter`
- the failure pattern in the older repo, where `lib/utils` became a cross-cutting dependency hub

## Research Summary

The old repo already proved one important point: classes are useful in the solver layer.

Examples:

- `lib/solvers/BaseSolver.ts`
- many `*Solver.ts` classes under `lib/solvers/*`

But the old repo also shows the main organizational failure to avoid:

- `lib/utils` contains many unrelated functions
- those functions are imported from solvers, pipelines, types, and testing
- several files in `utils` are not truly "utility" sized anymore and actually encode domain rules

Observed dependency pressure in the old repo:

- `combineVisualizations`: 23 imports
- `getTunedTotalCapacity1`: 21 imports
- `mapLayerNameToZ`: 18 imports
- `convertSrjToGraphicsObject`: 13 imports
- `getViaDimensions`: 12 imports
- `getIntraNodeCrossingsUsingCircle`: 11 imports
- `getIntraNodeCrossings`: 11 imports

Observed scope creep in old `lib/utils`:

- `getRerouteSimpleRouteJson.ts`: 603 lines
- `addApproximatingRectsToSrj.ts`: 408 lines
- `convertHdRouteToSimplifiedRoute.ts`: 370 lines
- `convertSrjToGraphicsObject.ts`: 264 lines
- `findClosestPointToABCWithinBounds.ts`: 260 lines
- `findPointToGetAroundCircle.ts`: 219 lines

That is the anti-pattern to prevent. The issue is not "functions are bad". The issue is "orphan functions with no owning module" are bad.

## Main Decision

Do not convert `lib/types.ts` directly into a pile of classes.

Instead:

1. keep wire-format types for transport and serialization
2. add domain wrappers and domain classes around those types
3. move behavior into those classes or into tightly-owned modules beside them
4. forbid a general `utils/` folder

This is a wrapper-first design, not a class-everywhere design.

## Why Not Make Everything a Class

The contents of `lib/types.ts` are mostly serialized shapes:

- ids
- connection points
- obstacles
- route JSON
- trace output

These are good transport types because they are:

- easy to serialize
- easy to diff in tests
- easy to log
- easy to use as public API contracts

If these become the primary runtime objects, the repo will likely accumulate:

- noisy `fromJson` and `toJson` plumbing everywhere
- confusion between external data and internal state
- constructors with too many branches for deprecated fields and normalization
- accidental mutation of transport objects

The better model is:

- transport types define shape
- domain classes define behavior
- solvers manipulate domain classes, not raw wire objects

## Design Rules

### Rule 1: Raw input and output shapes stay as types

These stay as `type` or `interface`:

- `TraceId`
- `NetId`
- `BusId`
- `PointId`
- `OffBoardConnectionId`
- `ObstacleId`
- `RootConnectionName`
- `PointKey`
- `ConnectionTempId`
- `TerminalViaHint`
- `SingleLayerConnectionPoint`
- `MultiLayerConnectionPoint`
- `ConnectionPoint`
- `Jumper`
- `JumperType`
- `SimpleRouteJson`
- `Obstacle`
- `SimpleRouteConnection`
- `SimplifiedPcbTrace`
- `SimplifiedPcbTraces`

### Rule 2: Anything with invariants or nontrivial queries gets a class wrapper

Use a class when the object:

- normalizes deprecated fields
- has derived properties
- owns caches
- needs validation
- answers domain questions repeatedly
- mutates through controlled methods

### Rule 3: No free-floating domain logic

If a function needs knowledge of:

- `ConnectionPoint`
- `Obstacle`
- `SimpleRouteJson`
- trace semantics
- layer semantics
- routing semantics

then it should not go into a generic `utils` folder.

It must live in one of:

- the domain class that owns the data
- a sibling `operations.ts` file in that domain module
- the solver module that owns the algorithm
- `lib/math` if it is pure geometry with no routing semantics

### Rule 4: A new function must have a single owner

Every new function should answer this question:

`What object or subsystem owns the reason this function exists?`

If the answer is unclear, the design is not ready.

## Proposed Folder Structure

```txt
lib/
  types/
    ids.ts
    srj.ts
    trace.ts

  domain/
    route-input/
      RouteInput.ts
      RouteInputBuilder.ts
      RouteInput.test.ts
    connection/
      RouteConnection.ts
      RoutePoint.ts
      RoutePointKey.ts
    obstacle/
      BoardObstacle.ts
      ObstacleSet.ts
    trace/
      RoutedTrace.ts
      RoutedTraceBuilder.ts
    board/
      RouteBounds.ts
      LayerSet.ts
      LayerMapper.ts

  solvers/
    BaseSolver.ts
    ...

  math/
    geometry.ts
    segments.ts
    bounds.ts
```

No `lib/utils`.

If a function feels generic, prefer one of these homes:

- `lib/math/*` for pure math
- `lib/domain/<area>/...` for domain behavior
- `lib/solvers/<solver>/...` for solver-specific algorithm helpers

## Recommended Classes

### `RouteInput`

Wraps `SimpleRouteJson`.

Responsibilities:

- validate the document once
- normalize deprecated config fields
- expose canonical routing options
- construct typed domain objects
- provide controlled mutation or immutable-with-copy update helpers

Suggested API:

```ts
class RouteInput {
  static fromJson(json: SimpleRouteJson): RouteInput
  toJson(): SimpleRouteJson

  get layerCount(): number
  get connections(): ReadonlyArray<RouteConnection>
  get obstacles(): ReadonlyArray<BoardObstacle>
  get bounds(): RouteBounds

  getMinViaPadDiameter(): number | undefined
  getMinViaHoleDiameter(): number | undefined
  getNominalTraceWidth(): number

  withObstacle(obstacle: BoardObstacle): RouteInput
  validate(): void
}
```

This should become the main domain entry point for solvers.

### `RouteConnection`

Wraps `SimpleRouteConnection`.

Responsibilities:

- own `pointsToConnect`
- enforce connection invariants
- answer connection-level queries
- centralize merged/off-board/root-name semantics

Suggested API:

```ts
class RouteConnection {
  static fromJson(json: SimpleRouteConnection): RouteConnection
  toJson(): SimpleRouteConnection

  get name(): string
  get points(): ReadonlyArray<RoutePoint>

  isOffBoard(): boolean
  hasRootConnection(): boolean
  getRootName(): string | undefined
  getEffectiveTraceWidth(defaultWidth: number): number
  getPointKeys(): string[]
}
```

### `RoutePoint`

Wraps `ConnectionPoint`.

This is the highest-value wrapper because many old `utils` functions were really `ConnectionPoint` behavior in disguise.

Responsibilities:

- distinguish single-layer and multi-layer cases
- generate stable keys
- expose layer queries
- hide transport branching from callers

Suggested API:

```ts
class RoutePoint {
  static fromJson(json: ConnectionPoint): RoutePoint
  toJson(): ConnectionPoint

  get x(): number
  get y(): number
  get pointId(): string | undefined

  isSingleLayer(): boolean
  isMultiLayer(): boolean
  getPrimaryLayer(): string
  getLayers(): readonly string[]
  getKey(): string
  hasPortId(): boolean
}
```

This class should absorb old helpers such as:

- `isSingleLayerConnectionPoint`
- `isMultiLayerConnectionPoint`
- `getConnectionPointLayer`
- `getConnectionPointLayers`
- `getPointKey`

### `BoardObstacle`

Wraps `Obstacle`.

Responsibilities:

- expose geometry queries
- centralize layer and z-layer handling
- own obstacle labeling and connectivity metadata

Suggested API:

```ts
class BoardObstacle {
  static fromJson(json: Obstacle): BoardObstacle
  toJson(): Obstacle

  get id(): string | undefined
  get center(): { x: number; y: number }
  getBounds(): RouteBounds
  containsPoint(x: number, y: number): boolean
  overlaps(other: BoardObstacle): boolean
  getLayerNames(): readonly string[]
}
```

### `ObstacleSet`

This should exist early even if it feels small.

Responsibilities:

- hold obstacle collections
- compute collection bounds
- expose indexed lookups
- hide repeated loops over all obstacles

This is a better owner for old helpers like `getBoundsForObstacles`.

### `RouteBounds`

Keep this simple. It can be either:

- a small immutable class, or
- a value object module with constructor helpers

Prefer a class if many bounds operations will exist.

Responsibilities:

- normalization
- expansion
- intersection
- containment

### `LayerMapper`

The old repo had `mapLayerNameToZ` and `mapZToLayerName` heavily reused from `utils`.

Those functions belong under a dedicated layer model:

```ts
class LayerMapper {
  constructor(layerCount: number)
  toZ(layerName: string): number
  fromZ(z: number): string
}
```

This removes global helper drift and makes layer conversion explicitly dependent on board configuration.

## What Goes In `lib/math`

`lib/math` should contain only logic that is:

- pure
- domain-agnostic
- reusable outside autorouting semantics

Good examples:

- segment intersection
- point distance
- rectangle overlap
- polygon containment primitives
- midpoint and projection math

Bad examples for `lib/math`:

- `getPointKey`
- `getViaDimensions`
- `getConnectivityMapFromSimpleRouteJson`
- obstacle labeling
- converting traces to obstacles

Those are domain behaviors, not math.

## Replacement Strategy For Old Utility Patterns

### Pattern A: Type-shape helpers

Old examples:

- `connection-point-utils.ts`
- `getPointKey.ts`

New home:

- `RoutePoint`

### Pattern B: Board collection queries

Old examples:

- `getBoundsForObstacles.ts`
- `filterObstaclesOutsideBoard.ts`

New home:

- `ObstacleSet`
- `RouteBounds`

### Pattern C: Layer conversion

Old examples:

- `mapLayerNameToZ.ts`
- `mapZToLayerName.ts`

New home:

- `LayerMapper`

### Pattern D: SRJ-wide transformations

Old examples:

- `getConnectivityMapFromSimpleRouteJson.ts`
- `convertSrjTracesToObstacles.ts`
- `annotateNominalTraceWidth.ts`

New home:

- `RouteInput`
- `RouteInputBuilder`
- focused domain service files beside `RouteInput`

Do not place these in a global shared folder. They are route-document operations.

### Pattern E: Visualization assembly

Old examples:

- `combineVisualizations.ts`
- `convertSrjToGraphicsObject.ts`
- `getPresuppliedTraceVisualization.ts`

New home:

- `lib/domain/visualization/*`
- or `lib/solvers/visualization/*`

These are not utilities. They are a separate subsystem.

### Pattern F: Solver-only algorithms

Old examples:

- crossings calculators used only by pathing/high-density solvers
- tuned capacity helpers

New home:

- beside the solver that owns the algorithm
- or in a named submodule shared by a small solver family

If only one solver family needs it, it should not be top-level shared code.

## Ownership Rules That Humans And LLMs Can Follow

When adding a new function, use this order:

1. If it only reads or transforms one domain object, make it a method on that class.
2. If it uses several instances of the same domain concept, place it in that concept's module beside the class.
3. If it is solver-algorithm-specific, place it under that solver directory.
4. If it is pure geometry with no routing meaning, place it in `lib/math`.
5. If none of those fit, stop and redesign the module boundary. Do not create `utils`.

## Recommended Migration Of Current `lib/types.ts`

### Step 1: Split the file without changing behavior

Move current declarations into:

- `lib/types/ids.ts`
- `lib/types/srj.ts`
- `lib/types/trace.ts`
- `lib/types/index.ts`

Keep exports stable.

This creates structure without introducing runtime behavior yet.

### Step 2: Introduce wrapper classes with zero solver adoption

Create:

- `lib/domain/route-input/RouteInput.ts`
- `lib/domain/connection/RouteConnection.ts`
- `lib/domain/connection/RoutePoint.ts`
- `lib/domain/obstacle/BoardObstacle.ts`
- `lib/domain/obstacle/ObstacleSet.ts`
- `lib/domain/board/RouteBounds.ts`
- `lib/domain/board/LayerMapper.ts`

At this stage they can be thin wrappers.

### Step 3: Move obvious behavior first

First methods to implement:

- `RoutePoint.getKey()`
- `RoutePoint.getLayers()`
- `RoutePoint.getPrimaryLayer()`
- `BoardObstacle.getBounds()`
- `ObstacleSet.getBounds()`
- `LayerMapper.toZ()`
- `LayerMapper.fromZ()`
- `RouteInput.getMinViaPadDiameter()`

This is the low-risk migration.

### Step 4: Make domain classes the only place allowed to understand wire branching

Callers should stop doing:

```ts
if ("layers" in point) { ... } else { ... }
```

and instead do:

```ts
point.getLayers()
point.isMultiLayer()
```

This is where the codebase starts getting easier for humans and LLMs.

### Step 5: Move SRJ-wide transforms into named owners

Examples:

- route normalization into `RouteInput`
- trace conversion into `RoutedTraceBuilder` or `RouteInputBuilder`
- connectivity derivation into a route-document operation module

### Step 6: Add lint and review rules

Add repository rules that reject:

- `lib/utils/**`
- imports from a future `utils`
- direct `"layers" in point` checks outside the connection domain module
- repeated layer mapping logic outside `LayerMapper`

This is necessary. Architecture without enforcement will drift back.

## Should These Be Classes Or Plain Modules

### Definitely classes

- `RouteInput`
- `RouteConnection`
- `RoutePoint`
- `BoardObstacle`
- `ObstacleSet`
- `BaseSolver`
- concrete solver classes
- `LayerMapper`

### Could be classes or immutable value modules

- `RouteBounds`
- `RoutedTrace`

If behavior stays small, a value module is fine. If many operations accumulate, make them classes.

### Should remain plain types

- id aliases
- raw JSON DTOs
- route segment wire formats

## Example Of The Target Calling Style

Bad:

```ts
import { getPointKey } from "lib/utils/getPointKey"
import { mapLayerNameToZ } from "lib/utils/mapLayerNameToZ"

const key = getPointKey(point)
const z = mapLayerNameToZ(layerName, srj.layerCount)
```

Good:

```ts
const routeInput = RouteInput.fromJson(srj)
const point = routeInput.connections[0].points[0]
const key = point.getKey()
const z = routeInput.layerMapper.toZ(layerName)
```

This is better because:

- the code tells you which object owns the behavior
- the board configuration is available where needed
- the call sites become self-explanatory

## Recommended Governance

Adopt these rules in reviews:

- No new `utils` directory.
- No new top-level helper unless it is in `lib/math`.
- If a helper mentions a domain noun in its name, it belongs in that domain module.
- If a helper needs `SimpleRouteJson`, it belongs under `route-input`.
- If a helper needs solver internals, it belongs under that solver.
- Prefer instance methods for behavior that depends on object state.
- Prefer static factory methods only for parsing or construction.

## Migration Order

### DONE Phase 1: Structure

- split `lib/types.ts`
- add `lib/domain/*` skeleton
- keep runtime behavior identical

### DONE Phase 2: Low-risk behavior moves

- point helpers into `RoutePoint`
- layer mapping into `LayerMapper`
- obstacle bounds into `BoardObstacle` and `ObstacleSet`

### Phase 3: Route document ownership

- wrap `SimpleRouteJson` in `RouteInput`
- centralize normalization and validation
- move SRJ-wide transforms beside `RouteInput`

### Phase 4: Solver adoption

- make solvers consume domain wrappers instead of raw DTOs
- allow `.toJson()` only at boundaries

### Phase 5: Enforcement

- ban `utils`
- add lint/review checks
- document ownership rules in `docs/folder.md` or an architecture doc

## Final Recommendation

The right plan is not "convert `lib/types.ts` into classes".

The right plan is:

- keep `lib/types` as transport contracts
- introduce a domain layer of class wrappers
- move behavior into those wrappers and their owned modules
- reserve `lib/math` for pure math only
- ban a general `utils` folder entirely

That gives you the benefits you want:

- data and behavior linked together
- far less repeated code
- a predictable home for new functions
- clearer code for both humans and LLMs
- a design that can scale as the autorouter grows
