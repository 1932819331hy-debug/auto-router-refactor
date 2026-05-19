import type { TraceId } from "./ids.ts"

/**
 * Serialized PCB trace routed by the autorouter.
 */
export interface SimplifiedPcbTrace {
  type: "pcb_trace"
  pcb_trace_id: TraceId
  connection_name: string
  route: Array<
    | {
        route_type: "wire"
        x: number
        y: number
        width: number
        layer: string
      }
    | {
        route_type: "via"
        x: number
        y: number
        to_layer: string
        from_layer: string
        via_diameter?: number
        via_hole_diameter?: number
      }
    | {
        route_type: "jumper"
        /** Starting point of the jumper pad. */
        start: { x: number; y: number }
        /** Ending point of the jumper pad. */
        end: { x: number; y: number }
        /** Footprint size, typically "0603". */
        footprint: "0603" | "1206" | "1206x4_pair"
        layer: string
      }
    | {
        route_type: "through_obstacle"
        start: { x: number; y: number }
        end: { x: number; y: number }
        from_layer: string
        to_layer: string
        width: number
      }
  >
}

export type SimplifiedPcbTraces = Array<SimplifiedPcbTrace>
