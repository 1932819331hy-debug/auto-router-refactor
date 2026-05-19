import type { SerializedSimpleRouteJson } from "../../lib/types/index.ts"

export const DATASET_NAMES = ["dataset01"] as const

export type DatasetName = (typeof DATASET_NAMES)[number]

type DatasetModule = Record<string, unknown>

export const DATASET_OPTIONS_LABEL = "1/dataset01"

const DATASET_ALIASES: Record<string, DatasetName> = {
  "1": "dataset01",
  "01": "dataset01",
  dataset1: "dataset01",
  dataset01: "dataset01",
}

/**
 * Parses a CLI dataset value into the supported internal dataset name.
 *
 * @param value - Raw CLI value.
 * @returns Normalized dataset name, or `null` when unsupported.
 */
export const parseDatasetName = (value: string): DatasetName | null => {
  return DATASET_ALIASES[value.trim().toLowerCase()] ?? null
}

const datasetLoaders: Record<DatasetName, () => Promise<DatasetModule>> = {
  dataset01: async () =>
    (await import("@tscircuit/autorouting-dataset-01")) as DatasetModule,
}

const DATASET_SCENARIO_KEY_PATTERNS: Record<DatasetName, RegExp> = {
  dataset01: /^circuit\d+$/,
}

/**
 * Unwraps the dataset module value into a route document when possible.
 *
 * @param value - Arbitrary dataset export value.
 * @returns A serialized route document, or `null` when the value is unrelated.
 */
export const toSimpleRouteJson = (
  value: unknown,
): SerializedSimpleRouteJson | null => {
  if (!value || typeof value !== "object") {
    return null
  }

  const record = value as Record<string, unknown>
  const unwrappedValue =
    record.default && typeof record.default === "object"
      ? record.default
      : value
  const unwrappedRecord = unwrappedValue as Record<string, unknown>
  const candidate =
    (unwrappedRecord.simpleRouteJson &&
      typeof unwrappedRecord.simpleRouteJson === "object" &&
      unwrappedRecord.simpleRouteJson) ||
    (unwrappedRecord.simple_route_json &&
      typeof unwrappedRecord.simple_route_json === "object" &&
      unwrappedRecord.simple_route_json) ||
    unwrappedValue

  if (!candidate || typeof candidate !== "object") {
    return null
  }

  return "bounds" in candidate ? (candidate as SerializedSimpleRouteJson) : null
}

/**
 * Loads benchmark scenarios from the requested dataset in stable name order.
 *
 * @param datasetName - Dataset to read from.
 * @param opts - Optional filtering and effort overrides.
 * @returns Sorted scenario tuples.
 */
export const loadScenarios = async (
  datasetName: DatasetName,
  opts: {
    scenarioLimit?: number
    effort?: number
  } = {},
) => {
  const datasetModule = await datasetLoaders[datasetName]()
  const scenarioKeyPattern = DATASET_SCENARIO_KEY_PATTERNS[datasetName]
  const scenarios = Object.entries(datasetModule)
    .map(([name, value]) => [name, toSimpleRouteJson(value)] as const)
    .filter((entry): entry is [string, SerializedSimpleRouteJson] =>
      Boolean(entry[1]),
    )
    .filter(([name]) => scenarioKeyPattern.test(name))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, scenario]) => {
      if (opts.effort === undefined) {
        return [name, scenario] as const
      }

      return [
        name,
        {
          ...scenario,
          effort: opts.effort,
        },
      ] as const
    })

  return opts.scenarioLimit ? scenarios.slice(0, opts.scenarioLimit) : scenarios
}

/**
 * Loads one scenario by its exported dataset key.
 *
 * @param datasetName - Dataset to read from.
 * @param scenarioName - Export key such as `circuit001`.
 * @param effort - Optional effort override.
 * @returns Matching route document.
 */
export const loadScenarioByName = async (
  datasetName: DatasetName,
  scenarioName: string,
  effort?: number,
): Promise<SerializedSimpleRouteJson> => {
  const scenarios = await loadScenarios(datasetName, { effort })
  const scenario = scenarios.find(([name]) => name === scenarioName)

  if (!scenario) {
    throw new Error(
      `Scenario "${scenarioName}" was not found in dataset "${datasetName}"`,
    )
  }

  return scenario[1]
}
