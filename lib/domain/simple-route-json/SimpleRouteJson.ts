import type {
  ConnectionPoint,
  JumperType,
  SerializedObstacle,
  SerializedSimpleRouteConnection,
  SerializedSimpleRouteJson,
  SimplifiedPcbTrace,
} from "../../types/index.ts"
import { LayerMapper } from "../board/LayerMapper.ts"
import { RouteBounds } from "../board/RouteBounds.ts"
import { SimpleRouteConnection } from "../connection/SimpleRouteConnection.ts"
import type { Obstacle } from "../obstacle/Obstacle.ts"
import { ObstacleSet } from "../obstacle/ObstacleSet.ts"

const VALID_JUMPER_TYPES: ReadonlySet<JumperType> = new Set(["0603", "1206x4"])

const firstFiniteNumber = (
  ...values: Array<number | undefined>
): number | undefined =>
  values.find((value) => typeof value === "number" && Number.isFinite(value))

const cloneValue = <T>(value: T): T => structuredClone(value)

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

const normalizeViaPadDiameter = (json: SerializedSimpleRouteJson): number => {
  const requestedHoleDiameter = firstFiniteNumber(
    json.min_via_hole_diameter,
    json.minViaHoleDiameter,
  )
  const requestedPadDiameter = firstFiniteNumber(
    json.min_via_pad_diameter,
    json.minViaPadDiameter,
    json.minViaDiameter,
  )

  return Math.max(
    requestedPadDiameter ?? json.minViaDiameter ?? 0.3,
    requestedHoleDiameter ?? 0,
  )
}

const normalizeViaHoleDiameter = (
  json: SerializedSimpleRouteJson,
  padDiameter: number,
): number =>
  firstFiniteNumber(json.min_via_hole_diameter, json.minViaHoleDiameter) ??
  padDiameter * 0.5

const getPointLayerNames = (point: ConnectionPoint): readonly string[] => {
  if ("layer" in point) {
    return [point.layer]
  }

  return point.layers
}

const validateLayerName = (layerName: string, mapper: LayerMapper): void => {
  if (typeof layerName !== "string" || layerName.length === 0) {
    throw new Error("Layer names must be non-empty strings")
  }

  mapper.toZ(layerName)
}

const validatePoint = (point: ConnectionPoint, mapper: LayerMapper): void => {
  if (!isFiniteNumber(point.x) || !isFiniteNumber(point.y)) {
    throw new Error("Connection points must have finite x/y coordinates")
  }

  const hasSingleLayerShape = "layer" in point
  const hasMultiLayerShape = "layers" in point
  if (hasSingleLayerShape === hasMultiLayerShape) {
    throw new Error("Connection points must define exactly one layer shape")
  }

  const layerNames = getPointLayerNames(point)
  if (layerNames.length === 0) {
    throw new Error("Connection points must define at least one layer")
  }

  for (const layerName of layerNames) {
    validateLayerName(layerName, mapper)
  }
}

const validateConnection = (
  connection: SerializedSimpleRouteConnection,
  mapper: LayerMapper,
): void => {
  if (typeof connection.name !== "string" || connection.name.length === 0) {
    throw new Error("Connections must have a non-empty name")
  }

  if (connection.pointsToConnect.length === 0) {
    throw new Error(
      `Connection "${connection.name}" must contain at least one point`,
    )
  }

  for (const point of connection.pointsToConnect) {
    validatePoint(point, mapper)
  }
}

const validateObstacle = (
  obstacle: SerializedObstacle,
  mapper: LayerMapper,
): void => {
  if (obstacle.type !== "rect") {
    throw new Error(`Unsupported obstacle type "${obstacle.type}"`)
  }
  if (
    !isFiniteNumber(obstacle.center.x) ||
    !isFiniteNumber(obstacle.center.y)
  ) {
    throw new Error("Obstacles must have finite center coordinates")
  }
  if (!isFiniteNumber(obstacle.width) || obstacle.width < 0) {
    throw new Error("Obstacles must have a finite non-negative width")
  }
  if (!isFiniteNumber(obstacle.height) || obstacle.height < 0) {
    throw new Error("Obstacles must have a finite non-negative height")
  }
  if (obstacle.layers.length === 0) {
    throw new Error("Obstacles must define at least one layer")
  }

  for (const layerName of obstacle.layers) {
    validateLayerName(layerName, mapper)
  }
}

const validateBounds = (
  bounds: SerializedSimpleRouteJson["bounds"],
  label: string,
): void => {
  if (
    !isFiniteNumber(bounds.minX) ||
    !isFiniteNumber(bounds.maxX) ||
    !isFiniteNumber(bounds.minY) ||
    !isFiniteNumber(bounds.maxY)
  ) {
    throw new Error(`${label} must contain finite coordinates`)
  }
  if (bounds.minX > bounds.maxX || bounds.minY > bounds.maxY) {
    throw new Error(`${label} must satisfy min <= max`)
  }
}

const normalizeJson = (
  json: SerializedSimpleRouteJson,
): SerializedSimpleRouteJson => {
  const padDiameter = normalizeViaPadDiameter(json)
  const holeDiameter = normalizeViaHoleDiameter(json, padDiameter)

  return {
    layerCount: json.layerCount,
    minTraceWidth: json.minTraceWidth,
    nominalTraceWidth: json.nominalTraceWidth ?? json.minTraceWidth,
    minViaPadDiameter: padDiameter,
    minViaHoleDiameter: holeDiameter,
    defaultObstacleMargin: json.defaultObstacleMargin,
    minTraceToPadEdgeClearance: json.minTraceToPadEdgeClearance,
    obstacles: cloneValue(json.obstacles),
    connections: cloneValue(json.connections),
    bounds: cloneValue(json.bounds),
    outline: json.outline ? cloneValue(json.outline) : undefined,
    traces: json.traces ? cloneValue(json.traces) : undefined,
    jumpers: json.jumpers ? cloneValue(json.jumpers) : undefined,
    allowJumpers: json.allowJumpers ?? false,
    availableJumperTypes: cloneValue(json.availableJumperTypes ?? ["0603"]),
  }
}

const validateNormalizedJson = (json: SerializedSimpleRouteJson): void => {
  if (!Number.isInteger(json.layerCount) || json.layerCount < 1) {
    throw new Error("Route input layerCount must be a positive integer")
  }
  if (!isFiniteNumber(json.minTraceWidth) || json.minTraceWidth <= 0) {
    throw new Error(
      "Route input minTraceWidth must be a finite positive number",
    )
  }
  if (
    !isFiniteNumber(json.nominalTraceWidth) ||
    json.nominalTraceWidth < json.minTraceWidth
  ) {
    throw new Error(
      "Route input nominalTraceWidth must be a finite number greater than or equal to minTraceWidth",
    )
  }
  if (!isFiniteNumber(json.minViaPadDiameter) || json.minViaPadDiameter <= 0) {
    throw new Error(
      "Route input minViaPadDiameter must be a finite positive number",
    )
  }
  if (
    !isFiniteNumber(json.minViaHoleDiameter) ||
    json.minViaHoleDiameter <= 0 ||
    json.minViaHoleDiameter > json.minViaPadDiameter
  ) {
    throw new Error(
      "Route input minViaHoleDiameter must be a finite positive number less than or equal to minViaPadDiameter",
    )
  }
  if (
    json.defaultObstacleMargin !== undefined &&
    (!isFiniteNumber(json.defaultObstacleMargin) ||
      json.defaultObstacleMargin < 0)
  ) {
    throw new Error(
      "Route input defaultObstacleMargin must be a finite non-negative number",
    )
  }
  if (
    json.minTraceToPadEdgeClearance !== undefined &&
    (!isFiniteNumber(json.minTraceToPadEdgeClearance) ||
      json.minTraceToPadEdgeClearance < 0)
  ) {
    throw new Error(
      "Route input minTraceToPadEdgeClearance must be a finite non-negative number",
    )
  }

  validateBounds(json.bounds, "Route input bounds")

  const layerMapper = new LayerMapper(json.layerCount)
  for (const connection of json.connections) {
    validateConnection(connection, layerMapper)
  }
  for (const obstacle of json.obstacles) {
    validateObstacle(obstacle, layerMapper)
  }

  for (const jumperType of json.availableJumperTypes ?? []) {
    if (!VALID_JUMPER_TYPES.has(jumperType)) {
      throw new Error(`Unsupported jumper type "${jumperType}"`)
    }
  }
}

/**
 * Domain wrapper for a serialized route document.
 *
 * This class owns SRJ-wide normalization, validation, and the document-level
 * domain wrappers built from the serialized payload.
 */
export class SimpleRouteJson {
  private readonly layerMapperValue: LayerMapper
  private readonly connectionWrappers: ReadonlyArray<SimpleRouteConnection>
  private readonly obstacleSetValue: ObstacleSet
  private readonly boundsValue: RouteBounds

  public constructor(private readonly json: SerializedSimpleRouteJson) {
    this.layerMapperValue = new LayerMapper(json.layerCount)
    this.connectionWrappers = json.connections.map((connection) =>
      SimpleRouteConnection.fromJson(connection),
    )
    this.obstacleSetValue = ObstacleSet.fromJson(json.obstacles)
    this.boundsValue = RouteBounds.fromJson(json.bounds)
  }

  /**
   * Creates a validated route-document wrapper with canonicalized config.
   *
   * @param json - Serialized route document.
   * @returns Normalized route document wrapper.
   */
  public static fromJson(json: SerializedSimpleRouteJson): SimpleRouteJson {
    const normalizedJson = normalizeJson(json)
    validateNormalizedJson(normalizedJson)

    return new SimpleRouteJson(normalizedJson)
  }

  /**
   * Reuses an existing route-document wrapper or normalizes serialized input.
   *
   * @param input - Existing wrapper or serialized route document.
   * @returns Route document wrapper.
   */
  public static from(
    input: SimpleRouteJson | SerializedSimpleRouteJson,
  ): SimpleRouteJson {
    return input instanceof SimpleRouteJson
      ? input
      : SimpleRouteJson.fromJson(input)
  }

  /**
   * Returns the normalized serialized route document.
   *
   * @returns Canonicalized route JSON payload.
   */
  public toJson(): SerializedSimpleRouteJson {
    return cloneValue(this.json)
  }

  /**
   * Returns the validated layer count.
   */
  public get layerCount(): number {
    return this.json.layerCount
  }

  /**
   * Returns the document connection wrappers.
   *
   * @returns Read-only connections in serialized order.
   */
  public get connections(): ReadonlyArray<SimpleRouteConnection> {
    return [...this.connectionWrappers]
  }

  /**
   * Returns the document obstacle wrappers.
   *
   * @returns Read-only obstacle wrappers.
   */
  public get obstacles(): ReadonlyArray<Obstacle> {
    return this.obstacleSetValue.toArray()
  }

  /**
   * Returns the board bounds for the route document.
   *
   * @returns Immutable route bounds.
   */
  public get bounds(): RouteBounds {
    return this.boundsValue
  }

  /**
   * Returns the layer mapper tied to this document's layer count.
   *
   * @returns Document layer mapper.
   */
  public get layerMapper(): LayerMapper {
    return this.layerMapperValue
  }

  /**
   * Returns whether jumper routing is enabled for this document.
   */
  public get allowJumpers(): boolean {
    return this.json.allowJumpers ?? false
  }

  /**
   * Returns the canonical document minimum trace width.
   */
  public get minTraceWidth(): number {
    return this.json.minTraceWidth
  }

  /**
   * Returns the default obstacle margin when configured.
   */
  public get defaultObstacleMargin(): number | undefined {
    return this.json.defaultObstacleMargin
  }

  /**
   * Returns the canonical jumper types available to this route document.
   *
   * @returns Read-only jumper type list.
   */
  public get availableJumperTypes(): ReadonlyArray<JumperType> {
    return [...(this.json.availableJumperTypes ?? [])]
  }

  /**
   * Returns the canonical minimum via pad diameter.
   *
   * @returns Normalized pad diameter when available.
   */
  public getMinViaPadDiameter(): number | undefined {
    return this.json.minViaPadDiameter
  }

  /**
   * Returns the canonical minimum via hole diameter.
   *
   * @returns Normalized hole diameter when available.
   */
  public getMinViaHoleDiameter(): number | undefined {
    return this.json.minViaHoleDiameter
  }

  /**
   * Returns the document-level nominal trace width.
   *
   * @returns Canonical nominal trace width.
   */
  public getNominalTraceWidth(): number {
    return this.json.nominalTraceWidth ?? this.json.minTraceWidth
  }

  /**
   * Returns any pre-supplied routed traces on the document.
   *
   * @returns Cloned trace list.
   */
  public get traces(): ReadonlyArray<SimplifiedPcbTrace> {
    return cloneValue(this.json.traces ?? [])
  }

  /**
   * Creates a new route document with an appended obstacle.
   *
   * @param obstacle - Obstacle to append.
   * @returns New route document containing the extra obstacle.
   */
  public withObstacle(obstacle: Obstacle): SimpleRouteJson {
    return this.withObstacles([...this.obstacles, obstacle])
  }

  /**
   * Creates a new route document with an updated obstacle collection.
   *
   * @param obstacles - Replacement obstacle wrappers.
   * @returns New route document with the provided obstacles.
   */
  public withObstacles(obstacles: ReadonlyArray<Obstacle>): SimpleRouteJson {
    return SimpleRouteJson.fromJson({
      ...this.json,
      obstacles: obstacles.map((obstacle) => obstacle.toJson()),
    })
  }

  /**
   * Creates a new route document with an updated connection collection.
   *
   * @param connections - Replacement connection wrappers.
   * @returns New route document with the provided connections.
   */
  public withConnections(
    connections: ReadonlyArray<SimpleRouteConnection>,
  ): SimpleRouteJson {
    return SimpleRouteJson.fromJson({
      ...this.json,
      connections: connections.map((connection) => connection.toJson()),
    })
  }

  /**
   * Creates a new route document with updated connections and obstacles.
   *
   * @param params - Replacement domain collections.
   * @returns New route document with the provided collections.
   */
  public withDocumentParts(params: {
    connections?: ReadonlyArray<SimpleRouteConnection>
    obstacles?: ReadonlyArray<Obstacle>
  }): SimpleRouteJson {
    return SimpleRouteJson.fromJson({
      ...this.json,
      connections:
        params.connections?.map((connection) => connection.toJson()) ??
        this.json.connections,
      obstacles:
        params.obstacles?.map((obstacle) => obstacle.toJson()) ??
        this.json.obstacles,
    })
  }

  /**
   * Re-validates the normalized route document.
   */
  public validate(): void {
    validateNormalizedJson(this.json)
  }
}
