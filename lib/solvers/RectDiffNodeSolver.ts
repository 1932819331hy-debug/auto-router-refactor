import {
  RectDiffPipeline,
  type RectDiffPipelineInput,
} from "@tscircuit/rectdiff"

import type { SimpleRouteJson } from "../model/index.ts"

/**
 * Wrapper-first constructor shape for the rectdiff node pipeline.
 */
export interface RectDiffNodeSolverParams
  extends Omit<RectDiffPipelineInput, "simpleRouteJson"> {
  simpleRouteJson: SimpleRouteJson
}

/**
 * Adapts `@tscircuit/rectdiff` to the local domain boundary so callers pass a
 * `SimpleRouteJson` wrapper instead of raw serialized route JSON.
 */
export class RectDiffNodeSolver extends RectDiffPipeline {
  public constructor(params: RectDiffNodeSolverParams) {
    super({
      ...params,
      simpleRouteJson:
        params.simpleRouteJson.toJson() as RectDiffPipelineInput["simpleRouteJson"],
    })
  }
}
