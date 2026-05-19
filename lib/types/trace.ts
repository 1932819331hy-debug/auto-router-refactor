import type { TraceId } from "./ids.ts"

/**
 * Serialized straight wire segment within a routed trace.
 */
export interface SimplifiedPcbWireRouteStep {
  route_type: "wire"
  x: number
  y: number
  width: number
  layer: string
}

/**
 * Serialized via transition within a routed trace.
 */
export interface SimplifiedPcbViaRouteStep {
  route_type: "via"
  x: number
  y: number
  to_layer: string
  from_layer: string
  via_diameter?: number
  via_hole_diameter?: number
}

/**
 * Serialized jumper element within a routed trace.
 */
export interface SimplifiedPcbJumperRouteStep {
  route_type: "jumper"
  /** Starting point of the jumper pad. */
  start: { x: number; y: number }
  /** Ending point of the jumper pad. */
  end: { x: number; y: number }
  /** Footprint size, typically "0603". */
  footprint: "0603" | "1206" | "1206x4_pair"
  layer: string
}

/**
 * Serialized obstacle-spanning segment within a routed trace.
 */
export interface SimplifiedPcbThroughObstacleRouteStep {
  route_type: "through_obstacle"
  start: { x: number; y: number }
  end: { x: number; y: number }
  from_layer: string
  to_layer: string
  width: number
}

/**
 * Any serialized route step emitted for a routed PCB trace.
 */
export type SimplifiedPcbRouteStep =
  | SimplifiedPcbWireRouteStep
  | SimplifiedPcbViaRouteStep
  | SimplifiedPcbJumperRouteStep
  | SimplifiedPcbThroughObstacleRouteStep

/**
 * Serialized PCB trace routed by the autorouter.
 */
export interface SimplifiedPcbTrace {
  type: "pcb_trace"
  pcb_trace_id: TraceId
  connection_name: string
  route: SimplifiedPcbRouteStep[]
}

export type SimplifiedPcbTraces = Array<SimplifiedPcbTrace>
