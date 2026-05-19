import { describe, expect, test } from "bun:test"

import {
  BoardObstacle,
  LayerMapper,
  ObstacleSet,
  RoutePoint,
} from "../lib/domain/index.ts"

describe("RoutePoint", () => {
  test("exposes single-layer point behavior", () => {
    const point = RoutePoint.fromJson({
      x: 1.25,
      y: -3.5,
      layer: "top",
      pointId: "point-1",
      pcb_port_id: "port-1",
    })

    expect(point.x).toBe(1.25)
    expect(point.y).toBe(-3.5)
    expect(point.pointId).toBe("point-1")
    expect(point.isSingleLayer()).toBe(true)
    expect(point.isMultiLayer()).toBe(false)
    expect(point.getPrimaryLayer()).toBe("top")
    expect(point.getLayers()).toEqual(["top"])
    expect(point.getKey()).toBe("point-1")
    expect(point.hasPortId()).toBe(true)
  })

  test("builds sorted coordinate keys for multi-layer points without mutating input", () => {
    const jsonPoint = {
      x: 1 / 3,
      y: 2 / 3,
      layers: ["bottom", "top", "inner2"],
    }
    const point = RoutePoint.fromJson(jsonPoint)

    expect(point.isSingleLayer()).toBe(false)
    expect(point.isMultiLayer()).toBe(true)
    expect(point.getPrimaryLayer()).toBe("bottom")
    expect(point.getLayers()).toEqual(["bottom", "top", "inner2"])
    expect(point.getKey()).toBe("0.3333,0.6667,bottom-inner2-top")
    expect(jsonPoint.layers).toEqual(["bottom", "top", "inner2"])
  })
})

describe("LayerMapper", () => {
  test("maps named layers to z and back using legacy rules", () => {
    const mapper = new LayerMapper(4)

    expect(mapper.toZ("top")).toBe(0)
    expect(mapper.toZ("inner2")).toBe(2)
    expect(mapper.toZ("bottom")).toBe(3)
    expect(mapper.fromZ(0)).toBe("top")
    expect(mapper.fromZ(2)).toBe("inner2")
    expect(mapper.fromZ(3)).toBe("bottom")
  })

  test("preserves the single-layer inner1 compatibility edge case", () => {
    const mapper = new LayerMapper(1)

    expect(mapper.fromZ(1)).toBe("inner1")
  })

  test("rejects invalid layer names and z values", () => {
    const mapper = new LayerMapper(2)

    expect(() => mapper.toZ("signal1")).toThrow('Invalid layer name "signal1"')
    expect(() => mapper.fromZ(2)).toThrow('Invalid z "2" for layer count: 2')
  })
})

describe("BoardObstacle and ObstacleSet", () => {
  test("computes obstacle bounds and point containment", () => {
    const obstacle = BoardObstacle.fromJson({
      type: "rect",
      layers: ["top"],
      center: { x: 10, y: 20 },
      width: 8,
      height: 4,
      connectedTo: [],
    })

    expect(obstacle.getBounds().toJson()).toEqual({
      minX: 6,
      maxX: 14,
      minY: 18,
      maxY: 22,
    })
    expect(obstacle.containsPoint(10, 20)).toBe(true)
    expect(obstacle.containsPoint(14.1, 20)).toBe(false)
    expect(obstacle.getLayerNames()).toEqual(["top"])
  })

  test("handles rotated obstacles and collection bounds", () => {
    const rotated = BoardObstacle.fromJson({
      obstacleId: "rotated-1",
      type: "rect",
      layers: ["top", "bottom"],
      center: { x: 0, y: 0 },
      width: 4,
      height: 2,
      ccwRotationDegrees: 90,
      connectedTo: [],
    })
    const neighbor = BoardObstacle.fromJson({
      obstacleId: "neighbor-1",
      type: "rect",
      layers: ["top"],
      center: { x: 2, y: 0 },
      width: 2,
      height: 2,
      connectedTo: [],
    })

    expect(rotated.id).toBe("rotated-1")
    expect(rotated.center).toEqual({ x: 0, y: 0 })
    expect(rotated.getBounds().toJson()).toEqual({
      minX: -1.0000000000000002,
      maxX: 1.0000000000000002,
      minY: -2,
      maxY: 2,
    })
    expect(rotated.containsPoint(0, 1.9)).toBe(true)
    expect(rotated.containsPoint(1.1, 0)).toBe(false)
    expect(rotated.overlaps(neighbor)).toBe(true)

    const obstacleSet = new ObstacleSet([rotated, neighbor])
    expect(obstacleSet.getBounds().toJson()).toEqual({
      minX: -1.0000000000000002,
      maxX: 3,
      minY: -2,
      maxY: 2,
    })
    expect(ObstacleSet.fromJson([]).getBounds().toJson()).toEqual({
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
    })
  })
})
