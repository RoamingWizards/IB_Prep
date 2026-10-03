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
} as const
export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const MAX_ID_LENGTH = 80

export const MAX_PACK_BYTES = 5 * 1024 * 1024

/** Multiple-choice questions offer this many options. Option IDs are lowercase kebab-case, like other IDs. */
export const MIN_OPTIONS = 2
export const MAX_OPTIONS = 5
export const MAX_OPTION_ID_LENGTH = 40
export const MAX_STAGES = 50
