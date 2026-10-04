// Constants shared by the validator, importer and docs. Keep free of imports so Node can load it directly.

export const SCHEMA_VERSION = 1

/** Every ID is lowercase kebab-case and starts with the prefix for its type. */
export const ID_PREFIX = {
  question: "q-",
  scenario: "s-",
  concept: "c-",
  choice: "mc-",
  process: "p-",
  stage: "ps-",
  statementExercise: "ts-",
  statement: "st-",
  row: "r-",
  step: "step-",
  valuationExercise: "vx-",
  valuationStep: "vs-",
  valuationGraph: "vg-",
  valuationEdge: "ve-",
  quickMath: "qm-",
} as const
export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const MAX_ID_LENGTH = 80

export const MAX_PACK_BYTES = 5 * 1024 * 1024

/** Multiple-choice questions offer this many options. Option IDs are lowercase kebab-case, like other IDs. */
export const MIN_OPTIONS = 2
export const MAX_OPTIONS = 5
export const MAX_OPTION_ID_LENGTH = 40
export const MAX_STAGES = 50

/** Three-statement exercise limits. */
export const MAX_STATEMENTS = 6
export const MAX_STATEMENT_ROWS = 80
export const MAX_STEPS = 40
export const MAX_INDENT = 3
export const MAX_DECIMALS = 4

/** Valuation Builder limits. */
export const MAX_VALUATION_STEPS = 40
export const MAX_VALUATION_GRAPHS = 5
export const MAX_GRAPH_EDGES = 120

/** Quick Maths limits. */
export const DIFFICULTIES = ["easy", "medium", "hard"] as const
export const MAX_QUICK_MATH_ASSUMPTIONS = 8

/** Skill tree: the most prerequisites one concept may list. */
export const MAX_PREREQUISITES = 12
