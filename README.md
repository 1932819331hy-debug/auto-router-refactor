# autorouter

`autorouter` is a Bun + TypeScript workspace for experimenting with PCB autorouting inputs and React Cosmos fixtures.

The repo does not contain an autorouter implementation yet. What it does have now is a working Cosmos setup for `.cosmic.tsx` fixtures under [`cosmic/`](/home/ohmx/autorouter/cosmic).

## Install

```bash
bun install
```

## Commands

```bash
# Launch React Cosmos locally
bun run start

# Alias for the same command
bun run cosmos

# Type-check the workspace
bun run check

# Run the Bun test suite
bun test
```

## Cosmic Layout

- [`cosmic/`](/home/ohmx/autorouter/cosmic) stores `.cosmic.tsx` fixtures for React Cosmos.
- [`cosmic/bugs/`](/home/ohmx/autorouter/cosmic/bugs) stores reproducible bug cases.
- [`tests/`](/home/ohmx/autorouter/tests) stores Bun tests for the workspace helpers.

## Current Fixture

- [`cosmic/bugs/bug01.cosmic.tsx`](/home/ohmx/autorouter/cosmic/bugs/bug01.cosmic.tsx) is a minimal JSX-backed Cosmos fixture used as a smoke test.
