import type {
  BusId,
  NetId,
  OffBoardConnectionId,
  PointId,
  TraceId,
} from "./ids.ts"
import type { SimplifiedPcbTraces } from "./trace.ts"

/**
 * Optional via hint for a single-layer terminal.
 */
export type TerminalViaHint = {
  /** Target layer the inserted terminal via should reach. */
  toLayer: string
  /** Optional via pad diameter override for this terminal. */
  viaDiameter?: number
}

/**
 * Single-layer connection point in serialized route input.
 *
 * This form represents a terminal that initially exists on exactly one layer
 * and may optionally request a specific terminal-via transition.
 */
export type SingleLayerConnectionPoint = {
  /** Point x-coordinate in board space. */
  x: number
  /** Point y-coordinate in board space. */
  y: number
  /** Single PCB layer that owns the terminal. */
  layer: string
  /** Stable point identifier when the upstream pipeline provides one. */
  pointId?: PointId
  /** Optional PCB port id associated with the point. */
  pcb_port_id?: string
  /** Optional via-placement hint for terminal escape logic. */
  terminalVia?: TerminalViaHint
}

/**
 * Multi-layer connection point in serialized route input.
 *
 * This form is used for points that are already electrically reachable across
 * multiple layers, such as vias or bus anchors.
 */
export type MultiLayerConnectionPoint = {
  /** Point x-coordinate in board space. */
  x: number
  /** Point y-coordinate in board space. */
  y: number
  /** All layers that may legally connect to this point. */
  layers: string[]
  /** Stable point identifier when the upstream pipeline provides one. */
  pointId?: PointId
  /** Optional bus grouping identifier. */
  busId?: BusId
  /** Optional PCB port id associated with the point. */
  pcb_port_id?: string
}

/**
 * Serialized connection point accepted by routing inputs.
 */
export type ConnectionPoint =
  | SingleLayerConnectionPoint
  | MultiLayerConnectionPoint

/**
 * Supported jumper footprints in transport objects.
 */
export type JumperType = "1206x4" | "0603"

/**
 * Serialized obstacle used by autorouting inputs and outputs.
 */
export interface SerializedObstacle {
  /** Stable obstacle identifier when one is available. */
  obstacleId?: string
  /** Optional source component identifier associated with this obstacle. */
  componentId?: string
  /** Geometry primitive used to model the obstacle. */
  type: "rect" | "oval"
  /** Named PCB layers occupied by the obstacle. */
  layers: string[]
  /** Optional numeric z-layer mapping for faster span checks. */
  zLayers?: number[]
  /** Obstacle center in board coordinates. */
  center: { x: number; y: number }
  /** Obstacle width in board units. */
  width: number
  /** Obstacle height in board units. */
  height: number
  /** Optional counter-clockwise rotation metadata in degrees. */
  ccwRotationDegrees?: number
  /** Net, trace, or logical ids attached to the obstacle. */
  connectedTo: Array<TraceId | NetId>
  /** Marks the obstacle as a copper pour region. */
  isCopperPour?: boolean
  /** Indicates whether the router may assign a net to this obstacle. */
  netIsAssignable?: boolean
  /** Optional off-board connections associated with the obstacle. */
  offBoardConnectsTo?: Array<OffBoardConnectionId>
}

/**
 * Serialized jumper description emitted by routing.
 */
export type Jumper = {
  jumper_footprint: "0603" | "1206x4"
  center: { x: number; y: number }
  orientation: "horizontal" | "vertical"
  width: number
  height: number
  pads: SerializedObstacle[]
}

/**
 * Serialized logical connection for a route document.
 */
export interface SerializedSimpleRouteConnection {
  /** Stable connection name used throughout the routing pipeline. */
  name: string
  /** Root logical name before any merge operations. */
  rootConnectionName?: string
  /** Names of original connections merged into this one. */
  mergedConnectionNames?: string[]
  /** Marks a connection that terminates off-board. */
  isOffBoard?: boolean
  /** Optional net-level connection name. */
  netConnectionName?: string
  /** Preferred trace width for this specific connection. */
  nominalTraceWidth?: number
  /** Serialized points that must be electrically connected. */
  pointsToConnect: Array<ConnectionPoint>

  /** @deprecated DO NOT USE **/
  externallyConnectedPointIds?: PointId[][]
}

/**
 * Serialized route document used as the current public contract.
 */
export interface SerializedSimpleRouteJson {
  layerCount: number
  minTraceWidth: number
  nominalTraceWidth?: number
  /** @deprecated Use `min_via_pad_diameter` / `minViaPadDiameter` instead. */
  minViaDiameter?: number
  minViaHoleDiameter?: number
  minViaPadDiameter?: number
  min_via_hole_diameter?: number
  min_via_pad_diameter?: number
  defaultObstacleMargin?: number
  minTraceToPadEdgeClearance?: number
  obstacles: SerializedObstacle[]
  connections: Array<SerializedSimpleRouteConnection>
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
  outline?: Array<{ x: number; y: number }>
  traces?: SimplifiedPcbTraces
  jumpers?: Jumper[]
  allowJumpers?: boolean
  /** Available jumper types for routing. Defaults to ["0603"] */
  availableJumperTypes?: JumperType[]
}
