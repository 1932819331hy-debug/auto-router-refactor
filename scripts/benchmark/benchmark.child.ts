import { Pipeline1 } from "../../lib/pipeline/Pipeline1.ts"
import { loadScenarioByName, parseDatasetName } from "./scenarios.ts"

type BenchmarkChildResult = {
  solverName: string
  scenarioName: string
  datasetName: string
  elapsedTimeMs: number
  didSolve: boolean
  iterations: number
  error?: string
  phaseName?: string
  phaseSolverName?: string
}

/**
 * Returns a short error string that is safe to serialize to stdout.
 *
 * @param error - Unknown thrown value.
 * @returns Stable string form.
 */
const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Parses the child-process CLI arguments.
 *
 * @returns Validated child options.
 */
const parseArgs = () => {
  const args = process.argv.slice(2)
  let datasetArg = "dataset01"
  let scenarioName = ""
  let effort: number | undefined

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === "--dataset") {
      datasetArg = args[index + 1] ?? ""
      index += 1
      continue
    }

    if (arg === "--scenario") {
      scenarioName = args[index + 1] ?? ""
      index += 1
      continue
    }

    if (arg === "--effort") {
      const rawEffort = args[index + 1] ?? ""
      const parsedEffort = Number.parseInt(rawEffort, 10)
      if (!Number.isFinite(parsedEffort) || parsedEffort < 1) {
        throw new Error("--effort must be a positive integer")
      }
      effort = parsedEffort
      index += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!scenarioName) {
    throw new Error("--scenario is required")
  }

  const datasetName = parseDatasetName(datasetArg)
  if (!datasetName) {
    throw new Error(`Unsupported dataset "${datasetArg}"`)
  }

  return {
    datasetName,
    effort,
    scenarioName,
  }
}

const main = async () => {
  const { datasetName, effort, scenarioName } = parseArgs()
  const scenario = await loadScenarioByName(datasetName, scenarioName, effort)
  const startTime = performance.now()

  try {
    const solver = new Pipeline1(scenario)
    solver.solve()
    const result: BenchmarkChildResult = {
      solverName: solver.getSolverName(),
      scenarioName,
      datasetName,
      elapsedTimeMs: performance.now() - startTime,
      didSolve: solver.solved && !solver.failed,
      iterations: solver.iterations,
      phaseName: solver.getCurrentStageName(),
      phaseSolverName: solver.activeSubSolver?.getSolverName(),
      error: solver.error ?? undefined,
    }
    console.log(JSON.stringify(result))
  } catch (error) {
    const result: BenchmarkChildResult = {
      solverName: "Pipeline1",
      scenarioName,
      datasetName,
      elapsedTimeMs: performance.now() - startTime,
      didSolve: false,
      iterations: 0,
      error: getErrorMessage(error),
    }
    console.log(JSON.stringify(result))
    process.exitCode = 1
  }
}

await main()
