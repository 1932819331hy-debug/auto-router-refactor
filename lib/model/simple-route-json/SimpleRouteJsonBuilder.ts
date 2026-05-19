import type { SerializedSimpleRouteJson } from "../../types/index.ts"
import { SimpleRouteJson } from "./SimpleRouteJson.ts"

/**
 * Construction boundary for future SimpleRouteJson assembly logic.
 */
export class SimpleRouteJsonBuilder {
  /**
   * Wraps serialized route input without mutation.
   *
   * @param json - Serialized route document.
   * @returns A SimpleRouteJson wrapper around the provided JSON.
   */
  public fromJson(json: SerializedSimpleRouteJson): SimpleRouteJson {
    return SimpleRouteJson.fromJson(json)
  }
}
