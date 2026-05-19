import { describe, expect, test } from "bun:test"

import { BoardObstacle, RouteInput } from "../lib/domain/index.ts"
import type { SimpleRouteJson } from "../lib/types/index.ts"

const createRouteJson = (): SimpleRouteJson => ({
  layerCount: 4,
  minTraceWidth: 0.12,
  minViaDiameter: 0.35,
  min_via_hole_diameter: 0.18,
  obstacles: [
    {
      obstacleId: "obstacle-1",
      type: "rect",
      layers: ["top"],
      center: { x: 5, y: 5 },
      width: 2,
      height: 3,
      connectedTo: [],
    },
  ],
  connections: [
    {
      name: "net-a",
      nominalTraceWidth: 0.18,
      rootConnectionName: "root-a",
      pointsToConnect: [
        {
          x: 0,
          y: 0,
          layer: "top",
          pointId: "point-a",
        },
        {
          x: 1,
          y: 1,
          layers: ["inner1", "bottom"],
        },
      ],
    },
  ],
  bounds: {
    minX: -10,
    maxX: 10,
    minY: -5,
    maxY: 5,
  },
})

describe("RouteInput", () => {
  test("normalizes deprecated route-document fields and exposes domain wrappers", () => {
    const json = createRouteJson()
    const routeInput = RouteInput.fromJson(json)

    expect(routeInput.layerCount).toBe(4)
    expect(routeInput.layerMapper.toZ("bottom")).toBe(3)
    expect(routeInput.getMinViaPadDiameter()).toBe(0.35)
    expect(routeInput.getMinViaHoleDiameter()).toBe(0.18)
    expect(routeInput.getNominalTraceWidth()).toBe(0.12)
    expect(routeInput.allowJumpers).toBe(false)
    expect(routeInput.availableJumperTypes).toEqual(["0603"])
    expect(routeInput.bounds.toJson()).toEqual(json.bounds)

    const [connection] = routeInput.connections
    expect(connection?.name).toBe("net-a")
    expect(connection?.hasRootConnection()).toBe(true)
    expect(connection?.getRootName()).toBe("root-a")
    expect(connection?.getEffectiveTraceWidth(routeInput.getNominalTraceWidth())).toBe(
      0.18,
    )
    expect(connection?.getPointKeys()).toEqual([
      "point-a",
      "1.0000,1.0000,bottom-inner1",
    ])

    expect(routeInput.obstacles.map((obstacle) => obstacle.id)).toEqual([
      "obstacle-1",
    ])

    const normalizedJson = routeInput.toJson()
    expect(normalizedJson).toEqual({
      layerCount: 4,
      minTraceWidth: 0.12,
      nominalTraceWidth: 0.12,
      minViaPadDiameter: 0.35,
      minViaHoleDiameter: 0.18,
      obstacles: json.obstacles,
      connections: json.connections,
      bounds: json.bounds,
      allowJumpers: false,
      availableJumperTypes: ["0603"],
    })
    expect("minViaDiameter" in normalizedJson).toBe(false)
    expect("min_via_hole_diameter" in normalizedJson).toBe(false)

    normalizedJson.bounds.minX = -999
    normalizedJson.connections[0]!.name = "changed"
    expect(routeInput.bounds.minX).toBe(-10)
    expect(routeInput.connections[0]?.name).toBe("net-a")
  })

  test("supports immutable obstacle updates", () => {
    const routeInput = RouteInput.fromJson(createRouteJson())
    const nextRouteInput = routeInput.withObstacle(
      BoardObstacle.fromJson({
        obstacleId: "obstacle-2",
        type: "rect",
        layers: ["bottom"],
        center: { x: 8, y: 1 },
        width: 1,
        height: 1,
        connectedTo: [],
      }),
    )

    expect(routeInput.obstacles.map((obstacle) => obstacle.id)).toEqual([
      "obstacle-1",
    ])
    expect(nextRouteInput.obstacles.map((obstacle) => obstacle.id)).toEqual([
      "obstacle-1",
      "obstacle-2",
    ])
  })

  test("rejects invalid normalized route documents", () => {
    expect(() =>
      RouteInput.fromJson({
        ...createRouteJson(),
        layerCount: 0,
      }),
    ).toThrow("Route input layerCount must be a positive integer")

    expect(() =>
      RouteInput.fromJson({
        ...createRouteJson(),
        availableJumperTypes: ["0805" as never],
      }),
    ).toThrow('Unsupported jumper type "0805"')

    expect(() =>
      RouteInput.fromJson({
        ...createRouteJson(),
        connections: [
          {
            name: "broken",
            pointsToConnect: [
              {
                x: 0,
                y: 0,
                layers: [],
              },
            ],
          },
        ],
      }),
    ).toThrow("Connection points must define at least one layer")
  })
})
