#!/usr/bin/env bun

import { spawn } from "node:child_process"
import * as os from "node:os"
import * as path from "node:path"
import {
  loadScenarios,
  parseDatasetName,
  DATASET_OPTIONS_LABEL,
} from "./scenarios.ts"

type BenchmarkOptions = {
  solverName: string
  scenarioLimit?: number
  concurrency: number
  effort?: number
  sampleTimeoutMs?: number
  datasetName: "dataset01"
}

type BenchmarkScenario = {
  scenarioName: string
  effort?: number
}

type BenchmarkResult = {
  solverName: string
  scenarioName: string
  datasetName: string
  elapsedTimeMs: number
  didSolve: boolean
  didTimeout: boolean
  iterations: number
  error?: string
  phaseName?: string
  phaseSolverName?: string
}

const SUPPORTED_SOLVER_NAMES = ["Pipeline1"] as const
const DEFAULT_TASK_TIMEOUT_PER_EFFORT_MS = 60_000

/**
 * Formats a duration for human-readable benchmark output.
 *
 * @param timeMs - Duration in milliseconds.
 * @returns Short formatted duration label.
 */
const formatDuration = (timeMs: number): string => {
  if (timeMs < 1_000) {
    return `${Math.round(timeMs)}ms`
  }

  return `${(timeMs / 1_000).toFixed(1)}s`
}

/**
 * Computes a percentile from an array of durations.
 *
 * @param values - Duration list.
 * @param percentile - Value in the inclusive range [0, 1].
 * @returns Percentile value, or `null` when there are no values.
 */
const getPercentileMs = (
  values: number[],
  percentile: number,
): number | null => {
  if (values.length === 0) {
    return null
  }

  const sorted = [...values].sort((left, right) => left - right)
  const index = (sorted.length - 1) * percentile
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  const lowerValue = sorted[lower]
  const upperValue = sorted[upper]

  if (lower === upper) {
    return lowerValue ?? null
  }

  const weight = index - lower
  if (lowerValue === undefined || upperValue === undefined) {
    return null
  }

  return lowerValue + (upperValue - lowerValue) * weight
}

/**
 * Parses CLI duration flags like `1500`, `90s`, or `2m`.
 *
 * @param rawValue - Raw CLI flag value.
 * @param flagName - Name used for error messaging.
 * @returns Duration in milliseconds.
 */
const parseDurationArg = (rawValue: string, flagName: string): number => {
  const value = rawValue.trim()
  const match = value.match(/^(\d+)(ms|s|m)?$/)
  if (!match) {
    throw new Error(
      `${flagName} must be an integer with optional ms, s, or m suffix`,
    )
  }

  const [, rawAmount, rawUnit] = match
  if (!rawAmount) {
    throw new Error(`${flagName} is missing a numeric value`)
  }
  const amount = Number.parseInt(rawAmount, 10)
  const unit = rawUnit ?? "ms"
  const multiplier = unit === "m" ? 60_000 : unit === "s" ? 1_000 : 1
  return amount * multiplier
}

/**
 * Parses and validates benchmark CLI options.
 *
 * @returns Benchmark options.
 */
const parseArgs = (): BenchmarkOptions => {
  const args = process.argv.slice(2)
  const defaultConcurrency =
    typeof os.availableParallelism === "function"
      ? os.availableParallelism()
      : os.cpus().length

  const options: BenchmarkOptions = {
    solverName: "Pipeline1",
    concurrency: defaultConcurrency,
    datasetName: "dataset01",
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === "--solver") {
      const solverName = args[index + 1] ?? ""
      if (!solverName) {
        throw new Error("--solver requires a value")
      }
      options.solverName = solverName
      index += 1
      continue
    }

    if (arg === "--scenario-limit") {
      const rawScenarioLimit = args[index + 1] ?? ""
      options.scenarioLimit = Number.parseInt(rawScenarioLimit, 10)
      index += 1
      continue
    }

    if (arg === "--concurrency") {
      const rawConcurrency = args[index + 1] ?? ""
      options.concurrency =
        rawConcurrency === "auto"
          ? defaultConcurrency
          : Number.parseInt(rawConcurrency, 10)
      index += 1
      continue
    }

    if (arg === "--effort") {
      const rawEffort = args[index + 1] ?? ""
      options.effort = Number.parseInt(rawEffort, 10)
      index += 1
      continue
    }

    if (arg === "--sample-timeout") {
      const rawTimeout = args[index + 1] ?? ""
      options.sampleTimeoutMs = parseDurationArg(rawTimeout, "--sample-timeout")
      index += 1
      continue
    }

    if (arg === "--dataset") {
      const rawDatasetName = args[index + 1] ?? ""
      const datasetName = parseDatasetName(rawDatasetName)
      if (!datasetName) {
        throw new Error(
          `Unsupported dataset "${rawDatasetName}". Available: ${DATASET_OPTIONS_LABEL}`,
        )
      }
      options.datasetName = datasetName
      index += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (
    options.solverName !== "all" &&
    !SUPPORTED_SOLVER_NAMES.includes(
      options.solverName as (typeof SUPPORTED_SOLVER_NAMES)[number],
    )
  ) {
    throw new Error(
      `Unsupported solver "${options.solverName}". Available: Pipeline1, all`,
    )
  }

  if (!Number.isFinite(options.concurrency) || options.concurrency < 1) {
    throw new Error("--concurrency must be a positive integer")
  }

  if (
    options.scenarioLimit !== undefined &&
    (!Number.isFinite(options.scenarioLimit) || options.scenarioLimit < 1)
  ) {
    throw new Error("--scenario-limit must be a positive integer")
  }

  if (
    options.effort !== undefined &&
    (!Number.isFinite(options.effort) || options.effort < 1)
  ) {
    throw new Error("--effort must be a positive integer")
  }

  return options
}

/**
 * Extracts the effective effort multiplier from a loaded scenario record.
 *
 * @param scenario - Scenario metadata plus route document.
 * @returns Positive effort value.
 */
const getScenarioEffort = (scenario: { effort?: number }): number => {
  const rawEffort = scenario.effort
  return rawEffort !== undefined && Number.isFinite(rawEffort) && rawEffort >= 1
    ? rawEffort
    : 1
}

/**
 * Calculates the timeout budget for one scenario.
 *
 * @param scenario - Scenario metadata plus route document.
 * @param sampleTimeoutMs - Optional explicit timeout override.
 * @returns Timeout in milliseconds.
 */
const getScenarioTimeoutMs = (
  scenario: {
    effort?: number
  },
  sampleTimeoutMs?: number,
): number => {
  if (sampleTimeoutMs !== undefined) {
    return sampleTimeoutMs
  }

  return (
    DEFAULT_TASK_TIMEOUT_PER_EFFORT_MS +
    DEFAULT_TASK_TIMEOUT_PER_EFFORT_MS * getScenarioEffort(scenario)
  )
}

/**
 * Executes one scenario in a separate Bun process so hard timeouts are enforced.
 *
 * @param options - Global benchmark settings.
 * @param task - Scenario work item.
 * @returns Child-process benchmark result.
 */
const runScenario = async (
  options: BenchmarkOptions,
  task: BenchmarkScenario,
): Promise<BenchmarkResult> => {
  const childScriptPath = path.join(
    process.cwd(),
    "scripts",
    "benchmark",
    "benchmark.child.ts",
  )

  const childArgs = [
    childScriptPath,
    "--dataset",
    options.datasetName,
    "--scenario",
    task.scenarioName,
  ]

  if (task.effort !== undefined) {
    childArgs.push("--effort", String(task.effort))
  }

  return await new Promise<BenchmarkResult>((resolve) => {
    const child = spawn("bun", childArgs, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    })
    const timeoutMs = getScenarioTimeoutMs(task, options.sampleTimeoutMs)
    let stdout = ""
    let stderr = ""
    let finished = false

    const finish = (result: BenchmarkResult) => {
      if (finished) {
        return
      }
      finished = true
      clearTimeout(timeoutHandle)
      resolve(result)
    }

    const timeoutHandle = setTimeout(() => {
      child.kill("SIGKILL")
      finish({
        solverName:
          options.solverName === "all" ? "Pipeline1" : options.solverName,
        scenarioName: task.scenarioName,
        datasetName: options.datasetName,
        elapsedTimeMs: timeoutMs,
        didSolve: false,
        didTimeout: true,
        iterations: 0,
        error: `Timed out after ${formatDuration(timeoutMs)}`,
      })
    }, timeoutMs)

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString()
    })

    child.on("error", (error) => {
      finish({
        solverName:
          options.solverName === "all" ? "Pipeline1" : options.solverName,
        scenarioName: task.scenarioName,
        datasetName: options.datasetName,
        elapsedTimeMs: 0,
        didSolve: false,
        didTimeout: false,
        iterations: 0,
        error: error.message,
      })
    })

    child.on("close", () => {
      const rawLine = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .at(-1)

      if (!rawLine) {
        finish({
          solverName:
            options.solverName === "all" ? "Pipeline1" : options.solverName,
          scenarioName: task.scenarioName,
          datasetName: options.datasetName,
          elapsedTimeMs: 0,
          didSolve: false,
          didTimeout: false,
          iterations: 0,
          error: stderr.trim() || "Benchmark child exited without output",
        })
        return
      }

      try {
        const parsedResult = JSON.parse(rawLine) as Omit<
          BenchmarkResult,
          "didTimeout"
        >
        finish({
          ...parsedResult,
          didTimeout: false,
        })
      } catch (error) {
        finish({
          solverName:
            options.solverName === "all" ? "Pipeline1" : options.solverName,
          scenarioName: task.scenarioName,
          datasetName: options.datasetName,
          elapsedTimeMs: 0,
          didSolve: false,
          didTimeout: false,
          iterations: 0,
          error:
            error instanceof Error
              ? `${error.message}\n${stderr.trim()}`.trim()
              : stderr.trim() || "Failed to parse benchmark child output",
        })
      }
    })
  })
}

/**
 * Runs the queued scenario tasks with a fixed concurrency level.
 *
 * @param options - Global benchmark settings.
 * @param tasks - Scenario work items.
 * @returns Results in completion order.
 */
const runBenchmark = async (
  options: BenchmarkOptions,
  tasks: BenchmarkScenario[],
): Promise<BenchmarkResult[]> => {
  const results: BenchmarkResult[] = []
  let nextTaskIndex = 0

  const workerCount = Math.min(options.concurrency, tasks.length)
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextTaskIndex < tasks.length) {
      const currentTask = tasks[nextTaskIndex]
      nextTaskIndex += 1
      if (!currentTask) {
        return
      }
      const result = await runScenario(options, currentTask)
      const status = result.didSolve
        ? "ok"
        : result.didTimeout
          ? "timeout"
          : "fail"
      const suffix = result.error ? ` ${result.error}` : ""
      console.log(
        `[${status}] ${result.scenarioName} ${formatDuration(result.elapsedTimeMs)} iterations=${result.iterations}${suffix}`,
      )
      results.push(result)
    }
  })

  await Promise.all(workers)
  return results
}

/**
 * Prints the final benchmark summary.
 *
 * @param options - Global benchmark settings.
 * @param results - Completed benchmark results.
 */
const printSummary = (
  options: BenchmarkOptions,
  results: BenchmarkResult[],
): void => {
  const solvedResults = results.filter((result) => result.didSolve)
  const failedResults = results.filter((result) => !result.didSolve)
  const timeoutCount = results.filter((result) => result.didTimeout).length
  const elapsedTimes = solvedResults.map((result) => result.elapsedTimeMs)
  const averageElapsedMs =
    elapsedTimes.length === 0
      ? null
      : elapsedTimes.reduce((sum, value) => sum + value, 0) /
        elapsedTimes.length
  const medianElapsedMs = getPercentileMs(elapsedTimes, 0.5)
  const p95ElapsedMs = getPercentileMs(elapsedTimes, 0.95)
  const successRate =
    results.length === 0 ? 0 : (solvedResults.length / results.length) * 100

  console.log("")
  console.log("Benchmark Summary")
  console.log(
    `Solver: ${options.solverName === "all" ? "Pipeline1" : options.solverName}`,
  )
  console.log(`Dataset: ${options.datasetName}`)
  console.log(`Scenarios: ${results.length}`)
  console.log(
    `Success: ${solvedResults.length}/${results.length} (${successRate.toFixed(1)}%)`,
  )
  console.log(`Timeouts: ${timeoutCount}`)
  console.log(
    `Average solve time: ${averageElapsedMs === null ? "n/a" : formatDuration(averageElapsedMs)}`,
  )
  console.log(
    `Median solve time: ${medianElapsedMs === null ? "n/a" : formatDuration(medianElapsedMs)}`,
  )
  console.log(
    `P95 solve time: ${p95ElapsedMs === null ? "n/a" : formatDuration(p95ElapsedMs)}`,
  )

  if (failedResults.length > 0) {
    console.log("")
    console.log("Failures")
    for (const failure of failedResults.slice(0, 10)) {
      const location =
        failure.phaseName || failure.phaseSolverName
          ? ` phase=${failure.phaseName ?? "unknown"} solver=${failure.phaseSolverName ?? "unknown"}`
          : ""
      console.log(
        `- ${failure.scenarioName}: ${failure.error ?? "unknown error"}${location}`,
      )
    }
  }
}

const main = async () => {
  const options = parseArgs()
  const solverNames =
    options.solverName === "all" ? ["Pipeline1"] : [options.solverName]

  if (solverNames.length !== 1) {
    throw new Error("This benchmark runner currently supports only Pipeline1")
  }

  const scenarios = await loadScenarios(options.datasetName, {
    scenarioLimit: options.scenarioLimit,
    effort: options.effort,
  })

  if (scenarios.length === 0) {
    throw new Error(
      `No benchmark scenarios found for dataset "${options.datasetName}"`,
    )
  }

  console.log(
    `Running ${scenarios.length} benchmark scenario${scenarios.length === 1 ? "" : "s"} with ${options.solverName === "all" ? "Pipeline1" : options.solverName} across ${Math.min(options.concurrency, scenarios.length)} worker${Math.min(options.concurrency, scenarios.length) === 1 ? "" : "s"} (dataset: ${options.datasetName})`,
  )

  const tasks: BenchmarkScenario[] = scenarios.map(
    ([scenarioName, scenario]) => ({
      scenarioName,
      effort: getScenarioEffort(scenario as { effort?: number }),
    }),
  )
  const results = await runBenchmark(options, tasks)
  printSummary(options, results)

  if (results.some((result) => !result.didSolve)) {
    process.exitCode = 1
  }
}

await main()
