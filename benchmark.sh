#!/usr/bin/env bash
set -euo pipefail

SOLVER_NAME=""
SCENARIO_LIMIT=""
EFFORT=""
SAMPLE_TIMEOUT=""
DATASET="dataset01"
DEFAULT_SOLVER_NAME="Pipeline1"

default_concurrency() {
  getconf _NPROCESSORS_ONLN 2>/dev/null || nproc 2>/dev/null || echo 4
}

CONCURRENCY="${BENCHMARK_CONCURRENCY:-$(default_concurrency)}"

print_help() {
  cat <<'EOF'
Usage:
  ./benchmark.sh [solver-name|all] [scenario-limit] [--concurrency N] [--effort N] [--sample-timeout DURATION] [--dataset NAME]
  ./benchmark.sh [--solver NAME] [--scenario-limit N] [--concurrency N] [--effort N] [--sample-timeout DURATION] [--dataset NAME]

Options:
  --solver NAME        Run only one solver (Pipeline1 or all)
  --scenario-limit N   Run only first N scenarios
  --concurrency N      Number of concurrent Bun child processes, or "auto"
  --effort N           Override scenario effort multiplier
  --sample-timeout D   Override per-sample timeout, e.g. 90s or 2m
  --dataset NAME       Dataset to benchmark: 1/dataset01 (default)
  -h, --help           Show this help

Defaults:
  Running ./benchmark.sh with no parameters benchmarks Pipeline1 on dataset01.

Examples:
  ./benchmark.sh
  ./benchmark.sh Pipeline1
  ./benchmark.sh all 20 --concurrency auto
  ./benchmark.sh --solver Pipeline1 --effort 2
  ./benchmark.sh --solver Pipeline1 --sample-timeout 90s
  ./benchmark.sh --solver Pipeline1 --dataset dataset01 --scenario-limit 20
EOF
}

if [ "${1:-}" != "" ] && [[ "${1}" != --* ]]; then
  SOLVER_NAME="$1"
  shift
fi

if [ "${1:-}" != "" ] && [[ "${1}" != --* ]]; then
  SCENARIO_LIMIT="$1"
  shift
fi

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      print_help
      exit 0
      ;;
    --solver)
      SOLVER_NAME="${2:-}"
      shift 2
      ;;
    --scenario-limit)
      SCENARIO_LIMIT="${2:-}"
      shift 2
      ;;
    --concurrency)
      CONCURRENCY="${2:-}"
      if [ "$CONCURRENCY" = "auto" ]; then
        CONCURRENCY="$(default_concurrency)"
      fi
      shift 2
      ;;
    --effort)
      EFFORT="${2:-}"
      shift 2
      ;;
    --sample-timeout)
      SAMPLE_TIMEOUT="${2:-}"
      shift 2
      ;;
    --dataset)
      DATASET="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1"
      echo "Run ./benchmark.sh --help for usage"
      exit 1
      ;;
  esac
done

CMD=(bun "scripts/benchmark/index.ts" "--concurrency" "$CONCURRENCY")

if [ -z "$SOLVER_NAME" ]; then
  SOLVER_NAME="$DEFAULT_SOLVER_NAME"
fi

if [ -n "$SOLVER_NAME" ] && [ "$SOLVER_NAME" != "_" ]; then
  CMD+=("--solver" "$SOLVER_NAME")
fi

if [ -n "$SCENARIO_LIMIT" ]; then
  CMD+=("--scenario-limit" "$SCENARIO_LIMIT")
fi

if [ -n "$EFFORT" ]; then
  CMD+=("--effort" "$EFFORT")
fi

if [ -n "$SAMPLE_TIMEOUT" ]; then
  CMD+=("--sample-timeout" "$SAMPLE_TIMEOUT")
fi

if [ -n "$DATASET" ]; then
  CMD+=("--dataset" "$DATASET")
fi

"${CMD[@]}"
