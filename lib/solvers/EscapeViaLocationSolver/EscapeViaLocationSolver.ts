import { BaseSolver } from "@tscircuit/solver-utils"
import type { GraphicsObject } from "graphics-debug"

import { Point2 } from "../../math/index.ts"
import { RoutePoint, SimpleRouteJson } from "../../model/index.ts"
import type {
  SerializedSimpleRouteConnection,
  SerializedSimpleRouteJson,
} from "../../types/index.ts"
import { EscapeViaCandidateFinder } from "./EscapeViaCandidateFinder.ts"
import { EscapeViaEnvironment } from "./EscapeViaEnvironment.ts"
import type { EscapeViaMetadata } from "./EscapeViaMetadata.ts"
import { GEOMETRIC_TOLERANCE } from "./constants.ts"
import { mergeConnections } from "./mergeConnections.ts"

/**
 * Configuration for escape-via point placement.
 */
export interface EscapeViaLocationSolverOptions {
  viaDiameter?: number
  minTraceWidth?: number
  obstacleMargin?: number
}

/**
 * Constructor params for the escape-via solver.
 */
export interface EscapeViaLocationSolverParams
  extends EscapeViaLocationSolverOptions {
  simpleRouteJson: SimpleRouteJson
}

/**
 * Places explicit escape-via connection points just outside single-layer
 * terminals so downstream routing can connect to a via location instead of
 * trying to route directly from the terminal body.
 */
export class EscapeViaLocationSolver extends BaseSolver {
  private readonly inputSimpleRouteJson: SimpleRouteJson
  private readonly normalizedInputSerializedSimpleRouteJson: SerializedSimpleRouteJson
  private readonly viaDiameter: number
  private readonly viaRadius: number
  private readonly minTraceWidth: number
  private readonly obstacleMargin: number
  private readonly escapeOffset: number
  private readonly requiredTraceClearance: number
  private readonly requiredViaToViaClearance: number
  private readonly escapeViaMetadataByPointId = new Map<
    string,
    EscapeViaMetadata
  >()
  private readonly createdEscapeVias: EscapeViaMetadata[] = []
  private readonly environment: EscapeViaEnvironment
  private readonly candidateFinder: EscapeViaCandidateFinder
  private outputSerializedSimpleRouteJsonValue?: SerializedSimpleRouteJson

  public constructor(private readonly params: EscapeViaLocationSolverParams) {
    super()
    this.inputSimpleRouteJson = params.simpleRouteJson
    this.normalizedInputSerializedSimpleRouteJson =
      this.inputSimpleRouteJson.toJson()
    this.viaDiameter =
      params.viaDiameter ??
      this.inputSimpleRouteJson.getMinViaPadDiameter() ??
      this.inputSimpleRouteJson.minTraceWidth
    this.viaRadius = this.viaDiameter / 2
    this.minTraceWidth =
      params.minTraceWidth ?? this.inputSimpleRouteJson.minTraceWidth
    this.obstacleMargin =
      params.obstacleMargin ??
      this.inputSimpleRouteJson.defaultObstacleMargin ??
      0.15
    this.escapeOffset =
      this.viaRadius + Math.max(this.minTraceWidth / 2, this.obstacleMargin)
    this.requiredTraceClearance =
      this.minTraceWidth / 2 + this.obstacleMargin / 2
    this.requiredViaToViaClearance = this.viaDiameter + this.obstacleMargin
    this.environment = new EscapeViaEnvironment({
      routeJson: this.normalizedInputSerializedSimpleRouteJson,
      layerMapper: this.inputSimpleRouteJson.layerMapper,
      viaDiameter: this.viaDiameter,
      viaRadius: this.viaRadius,
      obstacleMargin: this.obstacleMargin,
      escapeOffset: this.escapeOffset,
      requiredTraceClearance: this.requiredTraceClearance,
      requiredViaToViaClearance: this.requiredViaToViaClearance,
      createdEscapeVias: this.createdEscapeVias,
    })
    this.candidateFinder = new EscapeViaCandidateFinder({
      environment: this.environment,
      layerToZ: (layer) => this.inputSimpleRouteJson.layerMapper.toZ(layer),
      obstacleMargin: this.obstacleMargin,
      requiredViaToViaClearance: this.requiredViaToViaClearance,
    })
    this.MAX_ITERATIONS = 1
  }

  public override getSolverName(): string {
    return "EscapeViaLocationSolver"
  }

  public override _step(): void {
    const inputConnections =
      this.normalizedInputSerializedSimpleRouteJson.connections
    const copperPours =
      this.normalizedInputSerializedSimpleRouteJson.obstacles.filter(
        (obstacle) => obstacle.isCopperPour,
      )
    const originalConnectionByName = new Map(
      inputConnections.map((connection) => [connection.name, connection]),
    )
    const outputConnections = inputConnections.map((connection) =>
      structuredClone(connection),
    )
    const outputConnectionByName = new Map(
      outputConnections.map((connection) => [connection.name, connection]),
    )
    const outputObstacles = structuredClone(
      this.normalizedInputSerializedSimpleRouteJson.obstacles,
    )
    const mergedConnections = mergeConnections(inputConnections)

    for (const mergedConnection of mergedConnections) {
      const groupConnectionNames = mergedConnection.mergedConnectionNames ?? [
        mergedConnection.name,
      ]
      const groupConnections = groupConnectionNames
        .map((connectionName) => originalConnectionByName.get(connectionName))
        .filter(
          (connection): connection is SerializedSimpleRouteConnection =>
            connection !== undefined,
        )

      if (groupConnections.length === 0) {
        continue
      }

      const connectionNetIds = new Set<string>()
      for (const groupConnection of groupConnections) {
        for (const netId of this.environment.getConnectionNetIds(
          groupConnection,
        )) {
          connectionNetIds.add(netId)
        }
      }

      const matchingCopperPours = copperPours.filter((obstacle) =>
        this.environment.obstacleMatchesConnectionNet(
          obstacle,
          connectionNetIds,
        ),
      )
      if (matchingCopperPours.length === 0) {
        continue
      }

      const groupedEscapePointIds = new Map<string, string[]>()
      const representativeConnectionNameByPourKey = new Map<string, string>()
      const pointPlacementPlans = this.candidateFinder.buildPointPlacementPlans(
        {
          mergedConnection,
          groupConnections,
          matchingCopperPours,
          connectionNetIds,
        },
      )

      for (const { point, pointOwner, sourceObstacle } of pointPlacementPlans) {
        const escapeViaCandidate =
          this.candidateFinder.findBestEscapeViaCandidate({
            connection: pointOwner.connection,
            point,
            pointIndex: pointOwner.pointIndex,
            matchingCopperPours,
            connectionNetIds,
            sourceObstacle,
          })

        if (!escapeViaCandidate) {
          continue
        }

        const outputConnection = outputConnectionByName.get(
          pointOwner.connection.name,
        )
        if (!outputConnection) {
          continue
        }

        const alreadyExists = outputConnection.pointsToConnect.some(
          (candidatePoint) =>
            RoutePoint.isSingleLayer(candidatePoint) &&
            candidatePoint.layer === escapeViaCandidate.sourceLayer &&
            Point2.from(candidatePoint).matches(
              escapeViaCandidate,
              GEOMETRIC_TOLERANCE,
            ),
        )
        if (alreadyExists) {
          continue
        }

        outputConnection.pointsToConnect.push({
          x: escapeViaCandidate.x,
          y: escapeViaCandidate.y,
          layer: escapeViaCandidate.sourceLayer,
          pointId: escapeViaCandidate.pointId,
          terminalVia: {
            toLayer: escapeViaCandidate.targetLayer,
            viaDiameter: this.viaDiameter,
          },
        })
        this.escapeViaMetadataByPointId.set(
          escapeViaCandidate.pointId,
          escapeViaCandidate,
        )
        this.createdEscapeVias.push(escapeViaCandidate)
        outputObstacles.push(
          this.environment.createEscapeViaObstacle({
            escapeVia: escapeViaCandidate,
            connectionNetIds: this.environment.getConnectionNetIds(
              pointOwner.connection,
            ),
          }),
        )

        const pointIds = groupedEscapePointIds.get(
          escapeViaCandidate.targetPourKey,
        )
        if (pointIds) {
          pointIds.push(escapeViaCandidate.pointId)
        } else {
          groupedEscapePointIds.set(escapeViaCandidate.targetPourKey, [
            escapeViaCandidate.pointId,
          ])
        }

        if (
          !representativeConnectionNameByPourKey.has(
            escapeViaCandidate.targetPourKey,
          )
        ) {
          representativeConnectionNameByPourKey.set(
            escapeViaCandidate.targetPourKey,
            pointOwner.connection.name,
          )
        }
      }

      for (const [targetPourKey, pointIds] of groupedEscapePointIds.entries()) {
        if (pointIds.length <= 1) {
          continue
        }

        const representativeConnectionName =
          representativeConnectionNameByPourKey.get(targetPourKey)
        if (!representativeConnectionName) {
          continue
        }

        const representativeConnection = outputConnectionByName.get(
          representativeConnectionName,
        )
        if (!representativeConnection) {
          continue
        }

        representativeConnection.externallyConnectedPointIds = [
          ...(representativeConnection.externallyConnectedPointIds ?? []),
          pointIds,
        ]
      }
    }

    this.outputSerializedSimpleRouteJsonValue = {
      ...structuredClone(this.normalizedInputSerializedSimpleRouteJson),
      connections: outputConnections,
      obstacles: outputObstacles,
    }
    this.solved = true
  }

  /**
   * Returns the updated route document with escape-via points.
   *
   * @returns Route JSON after point placement.
   */
  public getOutputSerializedSimpleRouteJson(): SerializedSimpleRouteJson {
    if (!this.outputSerializedSimpleRouteJsonValue) {
      throw new Error("EscapeViaLocationSolver has not solved yet")
    }

    return structuredClone(this.outputSerializedSimpleRouteJsonValue)
  }

  /**
   * Returns the updated route document as a domain wrapper.
   *
   * @returns Route input after point placement.
   */
  public getOutputSimpleRouteJson(): SimpleRouteJson {
    return SimpleRouteJson.fromJson(this.getOutputSerializedSimpleRouteJson())
  }

  /**
   * Returns escape-via metadata keyed by generated point id.
   *
   * @returns Escape-via metadata map.
   */
  public getEscapeViaMetadataByPointId(): Map<string, EscapeViaMetadata> {
    return new Map(this.escapeViaMetadataByPointId)
  }

  /**
   * Returns standardized pipeline output.
   *
   * @returns Solved route document.
   */
  public override getOutput(): SerializedSimpleRouteJson {
    return this.getOutputSerializedSimpleRouteJson()
  }

  public override visualize(): GraphicsObject {
    const outputRouteJson =
      this.outputSerializedSimpleRouteJsonValue ??
      this.normalizedInputSerializedSimpleRouteJson

    return {
      title: "Escape Via Location Solver",
      points: outputRouteJson.connections.flatMap((connection) =>
        connection.pointsToConnect.map((point) => ({
          x: point.x,
          y: point.y,
          color:
            point.pointId?.startsWith("escape-via:") === true
              ? "#0f766e"
              : "#dc2626",
          label:
            point.pointId?.startsWith("escape-via:") === true
              ? `${connection.name}\nescape via`
              : connection.name,
        })),
      ),
      lines: this.createdEscapeVias.map((escapeVia) => {
        const sourcePoint =
          outputRouteJson.connections.find(
            (connection) => connection.name === escapeVia.connectionName,
          )?.pointsToConnect[escapeVia.sourcePointIndex] ?? null

        return {
          points: sourcePoint
            ? [
                { x: sourcePoint.x, y: sourcePoint.y },
                { x: escapeVia.x, y: escapeVia.y },
              ]
            : [{ x: escapeVia.x, y: escapeVia.y }],
          strokeColor: "#0f766e",
        }
      }),
      circles: this.createdEscapeVias.map((escapeVia) => ({
        center: { x: escapeVia.x, y: escapeVia.y },
        radius: this.viaRadius,
        strokeColor: "#0f766e",
        label: `${escapeVia.connectionName}\n${escapeVia.targetLayer}`,
      })),
      rects: outputRouteJson.obstacles
        .filter((obstacle) => !obstacle.isCopperPour)
        .map((obstacle) => ({
          ...obstacle,
          fill: "rgba(220,38,38,0.12)",
        })),
    }
  }

  /**
   * Returns reproducible constructor parameters for debugger downloads.
   *
   * @returns Constructor parameter tuple.
   */
  public override getConstructorParams(): [EscapeViaLocationSolverParams] {
    return [
      {
        ...this.params,
        simpleRouteJson: SimpleRouteJson.fromJson(
          this.inputSimpleRouteJson.toJson(),
        ),
      },
    ]
  }
}
