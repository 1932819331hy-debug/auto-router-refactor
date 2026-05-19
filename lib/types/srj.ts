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
  toLayer: string
  viaDiameter?: number
}

/**
 * Single-layer connection point in serialized route input.
 */
export type SingleLayerConnectionPoint = {
  x: number
  y: number
  layer: string
  pointId?: PointId
  pcb_port_id?: string
  terminalVia?: TerminalViaHint
}

/**
 * Multi-layer connection point in serialized route input.
 */
export type MultiLayerConnectionPoint = {
  x: number
  y: number
  layers: string[]
  pointId?: PointId
  busId?: BusId
  pcb_port_id?: string
}

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
  obstacleId?: string
  /** Optional source component identifier associated with this obstacle. */
  componentId?: string
  type: "rect"
  layers: string[]
  zLayers?: number[]
  center: { x: number; y: number }
  width: number
  height: number
  /** Optional counter-clockwise rotation metadata in degrees. */
  ccwRotationDegrees?: number
  connectedTo: Array<TraceId | NetId>
  isCopperPour?: boolean
  netIsAssignable?: boolean
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
  name: string
  rootConnectionName?: string
  mergedConnectionNames?: string[]
  isOffBoard?: boolean
  netConnectionName?: string
  nominalTraceWidth?: number
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
