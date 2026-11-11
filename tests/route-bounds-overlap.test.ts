import { test } from "bun:test"
import assert from "node:assert/strict"
import { RouteBounds } from "../lib/model/board/RouteBounds.ts"
import { SimpleRouteJson } from "../lib/model/simple-route-json/SimpleRouteJson.ts"

type BoundsTuple = [number, number, number, number]

const cases: {
  name: string
  left: BoundsTuple
  right: BoundsTuple
  expected: boolean
}[] = [
  {
    name: "partial positive-area overlap",
    left: [0, 2, 0, 2],
    right: [1, 3, 1, 3],
    expected: true,
  },
  {
    name: "positive-area containment",
    left: [-2, 2, -2, 2],
    right: [-1, 1, -1, 1],
    expected: true,
  },
  {
    name: "identical positive-area bounds",
    left: [0, 2, 0, 2],
    right: [0, 2, 0, 2],
    expected: true,
  },
  {
    name: "separation on x",
    left: [0, 1, 0, 2],
    right: [2, 3, 0, 2],
    expected: false,
  },
  {
    name: "separation on y",
    left: [0, 2, 0, 1],
    right: [0, 2, 2, 3],
    expected: false,
  },
  {
    name: "vertical edge contact",
    left: [0, 2, 0, 2],
    right: [2, 4, 0, 2],
    expected: false,
  },
  {
    name: "horizontal edge contact",
    left: [0, 2, 0, 2],
    right: [0, 2, 2, 4],
    expected: false,
  },
  {
    name: "corner contact",
    left: [0, 2, 0, 2],
    right: [2, 4, 2, 4],
    expected: false,
  },
  {
    name: "point inside a rectangle",
    left: [0, 0, 0, 0],
    right: [-2, 2, -2, 2],
    expected: false,
  },
  {
    name: "zero width inside a rectangle",
    left: [0, 0, -1, 1],
    right: [-2, 2, -2, 2],
    expected: false,
  },
  {
    name: "zero height inside a rectangle",
    left: [-1, 1, 0, 0],
    right: [-2, 2, -2, 2],
    expected: false,
  },
  {
    name: "crossing zero-area lines",
    left: [0, 0, -1, 1],
    right: [-1, 1, 0, 0],
    expected: false,
  },
  {
    name: "coincident zero-width lines",
    left: [0, 0, -1, 1],
    right: [0, 0, -2, 2],
    expected: false,
  },
  {
    name: "point outside a rectangle",
    left: [3, 3, 0, 0],
    right: [-2, 2, -2, 2],
    expected: false,
  },
  {
    name: "small positive x overlap",
    left: [0, 1, 0, 2],
    right: [0.999999, 2, 0, 2],
    expected: true,
  },
  {
    name: "small positive y overlap",
    left: [0, 2, 0, 1],
    right: [0, 2, 0.999999, 2],
    expected: true,
  },
]

for (const { name, left, right, expected } of cases) {
  test(`overlaps requires positive area: ${name}`, () => {
    const a = new RouteBounds(...left)
    const b = new RouteBounds(...right)
    const before = [a.toJson(), b.toJson()]

    assert.equal(a.overlaps(b), expected)
    assert.equal(b.overlaps(a), expected)
    assert.deepEqual([a.toJson(), b.toJson()], before)
  })
}

test("empty bounds do not overlap a rectangle surrounding the origin", () => {
  const empty = RouteBounds.empty()
  const rectangle = RouteBounds.fromCenteredRect({ x: 0, y: 0 }, 4, 4)

  assert.equal(empty.overlaps(rectangle), false)
  assert.equal(rectangle.overlaps(empty), false)
  assert.equal(empty.overlaps(empty), false)
})

for (const { width, height, expected } of [
  { width: 0, height: 2, expected: false },
  { width: 2, height: 0, expected: false },
  { width: 0, height: 0, expected: false },
  { width: 2, height: 2, expected: true },
]) {
  test(`validated ${width} by ${height} obstacle follows positive-area overlap`, () => {
    const document = SimpleRouteJson.fromJson({
      layerCount: 2,
      minTraceWidth: 0.1,
      bounds: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
      connections: [],
      obstacles: [
        {
          type: "rect",
          center: { x: 0, y: 0 },
          width: 4,
          height: 4,
          layers: ["top"],
          connectedTo: [],
        },
        {
          type: "rect",
          center: { x: 0, y: 0 },
          width,
          height,
          layers: ["top"],
          connectedTo: [],
        },
      ],
    })
    const [rectangle, candidate] = document.obstacles
    assert.ok(rectangle)
    assert.ok(candidate)
    const before = document.toJson()

    assert.equal(rectangle.overlaps(candidate), expected)
    assert.equal(candidate.overlaps(rectangle), expected)
    assert.deepEqual(document.toJson(), before)
  })
}
