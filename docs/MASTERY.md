# Concept mastery

One calculation turns the results saved by every study mode into a mastery level for each concept. It lives in `src/lib/mastery.ts` (pure functions, no browser APIs) and is shown on the Dashboard. It only **reads** saved results: it never changes a historical record, writes anything, or touches the flashcard scheduler (`src/lib/scheduler.ts`, `cardStates`). The per-card levels used by the topic selectors (new, weak, learning, mastered) are a separate, older thing and are unchanged.

The model is deterministic: the same results and the same `now` always give the same answer. `now` is a parameter, never read from the clock inside the calculation.

## Evidence

Each saved result that refers to a concept becomes one **evidence item** for that concept: a score from 0 to 1, a time, a source and a kind.

| Source | Saved record | Kind | Score |
|--------|--------------|------|-------|
| Flashcards (Questions, Scenarios) | `attempts` rating, concepts from the exercise's `conceptIds` | **self-rated** | Again 0, Hard 0.35, Good 0.75, Easy 1 |
| Deal Walks | `choiceAttempts` (stage result, its `conceptIds`) | objective | 1 if correct, else 0 |
| Quick Maths | `quickMathResults` (authored questions' `conceptIds`) | objective | 1 if correct, else 0 |
| Three Statements | submitted `statementAttempts` (snapshot `conceptIds`) | objective | required changes done ÷ (required changes + unnecessary changes); if nothing needed changing, figures correct ÷ figures |
| Valuation Builder | submitted `valuationAttempts` (snapshot `conceptIds`) | objective | 1 for a match; otherwise (correct steps + correct connections − wrong connections − distractors − extra steps) ÷ (required steps + required connections), at least 0 |

A result with several concepts counts once for each concept. Drafts, abandoned attempts and results that name no concept (generated Quick Maths questions, a flashcard whose exercise was removed) are not evidence; the dashboard reports how many results were left out.

**Self-rated and objective evidence are never merged into one number.** Each concept reports its self-rated and its graded evidence separately (count and score), and a concept with only self-ratings is marked "self-rated only".

## Score

For one concept, over its evidence items *i*:

- **Recency weight** `r_i = max(0.2, 0.5^(age_i / 60 days))`. Evidence halves in weight every 60 days but never drops below 0.2.
- **Kind weight** `k_i = 1` for objective items and `0.5` for self-rated items.
- **Prior:** a score of 0.5 worth 1 item, so a single result never gives 0% or 100%.

```
score = (1 × 0.5 + Σ r_i·k_i·s_i) / (1 + Σ r_i·k_i)
```

The score for each kind alone (shown beside the counts) is the plain recency-weighted mean, `Σ r_i·s_i / Σ r_i`, without the prior.

## Levels

| Level | Rule |
|-------|------|
| **Not studied** | No evidence at all. There is no score. |
| **Weak** | Score below 0.5. |
| **Strong** | Score of 0.8 or more, **and** at least 3 evidence items, **and** at least 1 graded (objective) item. |
| **Developing** | Everything else: some evidence but not Weak and not yet Strong. |

Self-ratings alone therefore never make a concept Strong, and a very recent single correct answer cannot either.

## Recommended next practice

`recommendPractice` ranks concepts by **need**, highest first, ties broken by concept ID:

- Not studied: need 0.5.
- Weak or Developing: `1 − score + staleness`, where staleness is `min(0.3, (days since last evidence − 30) / 200)` once the last evidence is more than 30 days old.
- Strong: only recommended once stale (more than 30 days), with the same need formula.

Only concepts that have at least one exercise to practise are listed (`conceptTargets` in `src/lib/conceptTargets.ts` links a concept to flashcard topics, Deal Walk processes, Three Statements and Valuation Builder exercises, and Quick Maths categories). The reason shown is one of: weak, stale, developing, self-rated only, not studied.

## Using it from code (for the skill tree)

```ts
import { computeMastery, extractEvidence, MASTERY_MODEL, recommendPractice } from "@/lib/mastery"
import { useMastery } from "@/lib/useMastery"      // reads every saved result once and calls the functions above

const { evidence } = extractEvidence(rawResults, (exerciseId) => exercisesById.get(exerciseId)?.conceptIds)
const mastery = computeMastery(evidence, conceptIds, Date.now()) // ConceptMastery[], one per concept, in order
```

`ConceptMastery` has `level`, `score` (null when not studied), `evidenceCount`, `objective` and `selfRated` (`{ count, score }`), `bySource`, `lastEvidenceAt` and `selfRatedOnly`. All thresholds and weights are in `MASTERY_MODEL`; its `version` should be bumped if any of them change, since levels shown to the learner would shift.

## The skill tree

`SkillTreeView` colours each concept by the level this calculation gives it (Not studied, Weak, Developing, Strong) and shows the score, the graded and self-rated counts and links to practice, all from `computeMastery` through `useMastery`. Prerequisites come only from authored `prerequisiteIds` (see `docs/CONTENT_SCHEMA.md`); mastery never unlocks or locks a concept. Practice links preselect a topic for that visit only and never write to the saved filters.

## Limits

- Concept links come from the content. A concept no exercise mentions can never gain evidence, and a result is only as good as the `conceptIds` the author gave the exercise.
- Every result for a concept counts equally regardless of how many concepts the exercise has, and every exercise counts equally regardless of difficulty.
- Mastery is recalculated from all saved results each time the dashboard opens; there is no stored snapshot and no history of how a concept's level changed.
