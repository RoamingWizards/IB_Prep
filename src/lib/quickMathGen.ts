// Local, deterministic generation of Quick Maths questions from bounded templates.
// Every question's answer and explanation are computed from the same parameters, so they cannot disagree.
// Pure functions with no browser APIs: the same code can be checked from Node.
import type { Difficulty } from "../content/types.ts"

export type Rng = () => number

/** Small seeded generator (mulberry32). The same seed always produces the same session. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface GeneratedQuestion {
  prompt: string
  assumptions?: { label: string; value: string }[]
  rounding?: string
  answer: number
  units?: string
  tolerance: number
  explanation: string
}

export interface Template {
  id: string // stable template ID, used in generated question IDs
  category: string
  subcategory: string
  build: (rng: Rng, difficulty: Difficulty) => GeneratedQuestion
}

/** Categories offered by the generator. Authored content may add more, or reuse these names. */
export const GENERATED_CATEGORIES = ["Arithmetic", "Percentages", "Fractions and decimals", "Multiples", "EV bridges"] as const

// ---- Number helpers ----

const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1))
const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)]
const pickBy = <T>(rng: Rng, d: Difficulty, easy: readonly T[], medium: readonly T[], hard: readonly T[]): T =>
  pick(rng, d === "easy" ? easy : d === "medium" ? medium : hard)

/** Removes floating-point noise (0.1 + 0.2) so answers are stored as the intended decimal. */
export const clean = (n: number) => Number(n.toPrecision(12))

/** 1234.5 -> "1,234.5"; trailing zeros are dropped unless `dp` fixes the places. */
export function fmt(n: number, dp?: number): string {
  const v = clean(n)
  const text = dp === undefined ? String(v) : v.toFixed(dp)
  const [whole, frac] = text.split(".")
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return frac ? `${grouped}.${frac}` : grouped
}
const money = (n: number, unit = "m") => `$${fmt(n)}${unit}`
const mult = (n: number) => `${fmt(n, 1)}x`

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" }

// ---- Arithmetic ----

const add: Template = {
  id: "add",
  category: "Arithmetic",
  subcategory: "Addition",
  build(rng, d) {
    const [lo, hi] = d === "easy" ? [12, 99] : d === "medium" ? [120, 899] : [1200, 8999]
    const a = int(rng, lo, hi)
    const b = int(rng, lo, hi)
    return {
      prompt: `${fmt(a)} + ${fmt(b)}`,
      answer: a + b,
      tolerance: 0,
      explanation: `Add the hundreds, tens and units separately: ${fmt(a)} + ${fmt(b)} = ${fmt(a + b)}.`,
    }
  },
}

const subtract: Template = {
  id: "subtract",
  category: "Arithmetic",
  subcategory: "Subtraction",
  build(rng, d) {
    const [lo, hi] = d === "easy" ? [30, 99] : d === "medium" ? [200, 950] : [2000, 9500]
    const a = int(rng, lo, hi)
    const b = int(rng, Math.floor(lo / 3), a - 1)
    return {
      prompt: `${fmt(a)} − ${fmt(b)}`,
      answer: a - b,
      tolerance: 0,
      explanation: `Count up from ${fmt(b)} to ${fmt(a)}, or subtract in parts: ${fmt(a)} − ${fmt(b)} = ${fmt(a - b)}.`,
    }
  },
}

const multiply: Template = {
  id: "multiply",
  category: "Arithmetic",
  subcategory: "Multiplication",
  build(rng, d) {
    const a = pickBy(rng, d, [3, 4, 5, 6, 7, 8, 9], [12, 13, 14, 15, 16, 18, 24, 25], [17, 19, 23, 27, 35, 45, 48])
    const b = pickBy(rng, d, [11, 12, 14, 15, 25], [6, 7, 8, 9, 15, 24], [12, 14, 16, 18, 22, 36])
    const [small, big] = a < b ? [a, b] : [b, a]
    const tens = Math.floor(big / 10) * 10
    const rest = big - tens
    return {
      prompt: `${fmt(small)} × ${fmt(big)}`,
      answer: small * big,
      tolerance: 0,
      explanation:
        rest === 0
          ? `${fmt(small)} × ${fmt(big)} = ${fmt(small * big)}.`
          : `Split ${big} into ${tens} + ${rest}: ${fmt(small)} × ${tens} = ${fmt(small * tens)} and ${fmt(small)} × ${rest} = ${fmt(small * rest)}. Together ${fmt(small * big)}.`,
    }
  },
}

const divide: Template = {
  id: "divide",
  category: "Arithmetic",
  subcategory: "Division",
  build(rng, d) {
    const divisor = pickBy(rng, d, [2, 3, 4, 5, 6, 8], [7, 9, 12, 15, 16], [13, 14, 17, 18, 25])
    const quotient = pickBy(rng, d, [12, 15, 20, 25, 30], [24, 36, 45, 48, 64], [52, 75, 96, 125, 144])
    const dividend = divisor * quotient
    return {
      prompt: `${fmt(dividend)} ÷ ${fmt(divisor)}`,
      answer: quotient,
      tolerance: 0,
      explanation: `${fmt(divisor)} × ${fmt(quotient)} = ${fmt(dividend)}, so ${fmt(dividend)} ÷ ${fmt(divisor)} = ${fmt(quotient)}.`,
    }
  },
}

const decimalProduct: Template = {
  id: "decimal-product",
  category: "Arithmetic",
  subcategory: "Decimals",
  build(rng, d) {
    const a = pickBy(rng, d, [0.5, 1.5, 2.5], [1.2, 2.4, 3.5, 4.5], [1.25, 2.75, 3.6, 7.5])
    const n = pickBy(rng, d, [4, 6, 8, 10, 20], [12, 16, 24, 40, 50], [32, 48, 64, 80, 120])
    const answer = clean(a * n)
    return {
      prompt: `${fmt(a)} × ${fmt(n)}`,
      answer,
      tolerance: 0,
      explanation: `Treat ${fmt(a)} as ${fmt(a * 100)}/100: ${fmt(a * 100)} × ${fmt(n)} = ${fmt(a * 100 * n)}, divided by 100 is ${fmt(answer)}.`,
    }
  },
}

// ---- Percentages and percentage changes ----

const percentOf: Template = {
  id: "percent-of",
  category: "Percentages",
  subcategory: "Percent of a number",
  build(rng, d) {
    const pct = pickBy(rng, d, [10, 20, 25, 50], [5, 15, 30, 40, 60, 75], [12.5, 35, 45, 62.5, 7.5])
    const base = pickBy(rng, d, [40, 60, 80, 120, 200, 400], [160, 240, 360, 480, 520, 640], [320, 440, 880, 1200, 1600, 2400])
    const answer = clean((pct / 100) * base)
    return {
      prompt: `What is ${fmt(pct)}% of ${fmt(base)}?`,
      answer,
      tolerance: 0,
      explanation: `${fmt(pct)}% = ${fmt(pct / 100)}, and ${fmt(pct / 100)} × ${fmt(base)} = ${fmt(answer)}.`,
    }
  },
}

const percentChange: Template = {
  id: "percent-change",
  category: "Percentages",
  subcategory: "Percentage change",
  build(rng, d) {
    const pct = pickBy(rng, d, [10, 20, 25, 50], [5, 15, 30, 40, -10, -20, -25], [12.5, 35, -15, -30, 45, -12.5])
    const base = pickBy(rng, d, [40, 80, 100, 200], [120, 160, 240, 320], [160, 240, 360, 480, 800])
    const next = clean(base * (1 + pct / 100))
    const verb = pct > 0 ? "grew" : "fell"
    return {
      prompt: `Revenue ${verb} from ${money(base)} to ${money(next)}. What was the percentage change?`,
      assumptions: pct < 0 ? [{ label: "Entry", value: "Enter a fall as a negative number." }] : undefined,
      answer: pct,
      units: "%",
      tolerance: 0.05,
      explanation: `Change = ${fmt(next)} − ${fmt(base)} = ${fmt(next - base)}. Divide by the starting ${fmt(base)}: ${fmt(next - base)} ÷ ${fmt(base)} = ${fmt(pct / 100)}, which is ${fmt(pct)}%.`,
    }
  },
}

const reversePercent: Template = {
  id: "reverse-percent",
  category: "Percentages",
  subcategory: "Percentage change",
  build(rng, d) {
    const pct = pickBy(rng, d, [10, 20, 25, 50], [20, 25, 40, 50, -20, -25], [12.5, 15, 30, -10, -40])
    const original = pickBy(rng, d, [40, 50, 80, 100], [60, 120, 160, 200], [80, 160, 240, 400])
    const next = clean(original * (1 + pct / 100))
    const dir = pct > 0 ? "increase" : "decrease"
    const factor = clean(1 + pct / 100)
    return {
      prompt: `After a ${fmt(Math.abs(pct))}% ${dir}, a company's EBITDA is ${money(next)}. What was EBITDA before the ${dir}?`,
      answer: original,
      units: "$m",
      tolerance: 0.05,
      explanation: `The new figure is ${fmt(factor)} times the old one, so old = ${fmt(next)} ÷ ${fmt(factor)} = ${fmt(original)}.`,
    }
  },
}

const margin: Template = {
  id: "margin",
  category: "Percentages",
  subcategory: "Margins",
  build(rng, d) {
    const pct = pickBy(rng, d, [10, 20, 25, 40], [15, 30, 35, 45, 12.5], [18, 22.5, 27.5, 32.5, 37.5])
    const revenue = pickBy(rng, d, [100, 200, 400], [80, 160, 240, 320], [120, 240, 360, 400, 800])
    const ebitda = clean((pct / 100) * revenue)
    return {
      prompt: `Revenue is ${money(revenue)} and EBITDA is ${money(ebitda)}. What is the EBITDA margin?`,
      answer: pct,
      units: "%",
      tolerance: 0.05,
      explanation: `Margin = EBITDA ÷ revenue = ${fmt(ebitda)} ÷ ${fmt(revenue)} = ${fmt(pct / 100)}, or ${fmt(pct)}%.`,
    }
  },
}

const compound: Template = {
  id: "compound",
  category: "Percentages",
  subcategory: "Compounding",
  build(rng, d) {
    const rate = pickBy(rng, d, [10, 20], [10, 20, 50], [10, 20, 25])
    const years = d === "hard" ? 3 : 2
    const start = pickBy(rng, d, [100, 200], [100, 50, 400], [100, 40, 80, 1000])
    const factor = clean(1 + rate / 100)
    const end = clean(start * Math.pow(factor, years))
    const steps: string[] = []
    let v = start
    for (let i = 1; i <= years; i++) {
      v = clean(v * factor)
      steps.push(`year ${i}: ${fmt(v)}`)
    }
    const rounded = Math.round(end * 10) / 10
    const inexact = Math.abs(rounded - end) > 1e-9
    return {
      prompt: `${money(start)} of revenue grows ${fmt(rate)}% a year for ${years} years. What is revenue at the end?`,
      assumptions: [{ label: "Growth", value: "Compounded annually." }],
      rounding: inexact ? "Round to one decimal place." : undefined,
      answer: inexact ? clean(rounded) : end,
      units: "$m",
      tolerance: inexact ? 0.05 : 0.01,
      explanation: `Multiply by ${fmt(factor)} each year: ${steps.join(", ")}. Revenue ends at ${money(end)}${inexact ? `, which is ${money(rounded)} to one decimal place` : ""}.`,
    }
  },
}

const basisPoints: Template = {
  id: "basis-points",
  category: "Percentages",
  subcategory: "Basis points",
  build(rng, d) {
    const from = pickBy(rng, d, [10, 15, 20, 25], [12, 18, 22, 30], [14.5, 18.5, 21.5, 26.5])
    const delta = pickBy(rng, d, [2, 3, 5], [1.5, 2.5, 4], [0.75, 1.25, 3.5])
    const to = clean(from + delta)
    return {
      prompt: `EBITDA margin rises from ${fmt(from)}% to ${fmt(to)}%. By how many basis points did it rise?`,
      assumptions: [{ label: "Definition", value: "1 percentage point = 100 basis points." }],
      answer: clean(delta * 100),
      units: "bps",
      tolerance: 0,
      explanation: `${fmt(to)}% − ${fmt(from)}% = ${fmt(delta)} percentage points, and ${fmt(delta)} × 100 = ${fmt(delta * 100)} basis points.`,
    }
  },
}

// ---- Fractions and decimals ----

const FRACTIONS: Record<Difficulty, [number, number][]> = {
  easy: [[1, 2], [1, 4], [3, 4], [1, 5], [2, 5], [3, 10], [7, 10]],
  medium: [[1, 8], [3, 8], [5, 8], [7, 8], [1, 20], [3, 20], [7, 25], [9, 20]],
  hard: [[3, 16], [5, 16], [7, 16], [9, 32], [11, 40], [13, 50], [17, 40]],
}

const fractionToDecimal: Template = {
  id: "fraction-decimal",
  category: "Fractions and decimals",
  subcategory: "Fraction to decimal",
  build(rng, d) {
    const [n, den] = pick(rng, FRACTIONS[d])
    const answer = clean(n / den)
    return {
      prompt: `Write ${n}/${den} as a decimal.`,
      assumptions: [{ label: "Entry", value: "Enter a decimal such as 0.375, not a percentage." }],
      answer,
      tolerance: 0.0005,
      explanation: `${n} ÷ ${den} = ${fmt(answer)}.`,
    }
  },
}

const fractionToPercent: Template = {
  id: "fraction-percent",
  category: "Fractions and decimals",
  subcategory: "Fraction to percent",
  build(rng, d) {
    const [n, den] = pick(rng, FRACTIONS[d])
    const answer = clean((n / den) * 100)
    return {
      prompt: `What is ${n}/${den} as a percentage?`,
      answer,
      units: "%",
      tolerance: 0.05,
      explanation: `${n} ÷ ${den} = ${fmt(n / den)}, and × 100 gives ${fmt(answer)}%.`,
    }
  },
}

const percentToDecimal: Template = {
  id: "percent-decimal",
  category: "Fractions and decimals",
  subcategory: "Percent to decimal",
  build(rng, d) {
    const pct = pickBy(rng, d, [5, 25, 40, 75], [12.5, 2.5, 35, 62.5], [0.5, 1.25, 7.5, 0.75])
    const answer = clean(pct / 100)
    return {
      prompt: `Write ${fmt(pct)}% as a decimal.`,
      assumptions: [{ label: "Entry", value: "Enter a decimal such as 0.25, not 25." }],
      answer,
      tolerance: 0.00005,
      explanation: `Divide by 100: ${fmt(pct)}% = ${fmt(answer)}.`,
    }
  },
}

const fractionOf: Template = {
  id: "fraction-of",
  category: "Fractions and decimals",
  subcategory: "Fraction of a number",
  build(rng, d) {
    const [n, den] = pick(rng, FRACTIONS[d])
    const unit = pickBy(rng, d, [4, 8, 12], [6, 8, 10, 15], [4, 5, 7, 9])
    const base = den * unit * (d === "hard" ? 2 : 1)
    const answer = clean((n * base) / den)
    return {
      prompt: `What is ${n}/${den} of ${fmt(base)}?`,
      answer,
      tolerance: 0,
      explanation: `${fmt(base)} ÷ ${den} = ${fmt(base / den)}, and × ${n} gives ${fmt(answer)}.`,
    }
  },
}

// ---- Multiples ----

const evFromEbitda: Template = {
  id: "ev-from-ebitda",
  category: "Multiples",
  subcategory: "EV/EBITDA",
  build(rng, d) {
    const ebitda = pickBy(rng, d, [20, 40, 50, 100], [30, 45, 60, 75, 120], [35, 55, 85, 140, 165])
    const m = pickBy(rng, d, [6, 8, 10, 12], [7, 9, 11, 13], [7.5, 8.5, 9.5, 10.5, 12.5])
    const ev = clean(ebitda * m)
    return {
      prompt: `A company has EBITDA of ${money(ebitda)} and trades at ${mult(m)} EV/EBITDA. What is its enterprise value?`,
      answer: ev,
      units: "$m",
      tolerance: 0.05,
      explanation: `Enterprise value = EBITDA × multiple = ${fmt(ebitda)} × ${fmt(m)} = ${money(ev)}.`,
    }
  },
}

const impliedMultiple: Template = {
  id: "implied-multiple",
  category: "Multiples",
  subcategory: "EV/EBITDA",
  build(rng, d) {
    const ebitda = pickBy(rng, d, [50, 80, 100], [40, 60, 75, 120], [48, 64, 70, 90, 160])
    const m = pickBy(rng, d, [5, 8, 10], [6, 9, 12], [6.5, 7.5, 8.5, 11.5])
    const ev = clean(ebitda * m)
    return {
      prompt: `An acquirer pays an enterprise value of ${money(ev)} for a business with EBITDA of ${money(ebitda)}. What EV/EBITDA multiple is that?`,
      rounding: "Give the answer to one decimal place.",
      answer: m,
      units: "x",
      tolerance: 0.05,
      explanation: `Multiple = EV ÷ EBITDA = ${fmt(ev)} ÷ ${fmt(ebitda)} = ${mult(m)}.`,
    }
  },
}

const ebitdaFromEv: Template = {
  id: "ebitda-from-ev",
  category: "Multiples",
  subcategory: "EV/EBITDA",
  build(rng, d) {
    const m = pickBy(rng, d, [5, 8, 10], [6, 9, 12], [7.5, 8.5, 12.5])
    const ebitda = pickBy(rng, d, [20, 40, 50], [30, 45, 80], [32, 44, 72, 96])
    const ev = clean(ebitda * m)
    return {
      prompt: `A business was valued at ${money(ev)} of enterprise value, which is ${mult(m)} EBITDA. What is its EBITDA?`,
      answer: ebitda,
      units: "$m",
      tolerance: 0.05,
      explanation: `EBITDA = EV ÷ multiple = ${fmt(ev)} ÷ ${fmt(m)} = ${money(ebitda)}.`,
    }
  },
}

const priceEarnings: Template = {
  id: "price-earnings",
  category: "Multiples",
  subcategory: "P/E",
  build(rng, d) {
    const eps = pickBy(rng, d, [2, 4, 5], [1.5, 2.5, 3, 4], [1.6, 2.4, 2.5, 3.2])
    const pe = pickBy(rng, d, [10, 15, 20], [12, 16, 18, 25], [14, 17.5, 22.5, 24])
    const price = clean(eps * pe)
    return {
      prompt: `A share trades at $${fmt(price, 2)} and earns $${fmt(eps, 2)} per share. What is its P/E multiple?`,
      rounding: "Give the answer to one decimal place.",
      answer: pe,
      units: "x",
      tolerance: 0.05,
      explanation: `P/E = price ÷ EPS = ${fmt(price, 2)} ÷ ${fmt(eps, 2)} = ${mult(pe)}.`,
    }
  },
}

const evRevenue: Template = {
  id: "ev-revenue",
  category: "Multiples",
  subcategory: "EV/Revenue",
  build(rng, d) {
    const revenue = pickBy(rng, d, [100, 200, 500], [150, 250, 400, 600], [180, 320, 450, 750])
    const m = pickBy(rng, d, [1, 2, 3], [1.5, 2.5, 3.5], [0.8, 1.2, 2.2, 4.5])
    const ev = clean(revenue * m)
    return {
      prompt: `A company with revenue of ${money(revenue)} is valued at ${mult(m)} EV/Revenue. What is its enterprise value?`,
      answer: ev,
      units: "$m",
      tolerance: 0.05,
      explanation: `Enterprise value = revenue × multiple = ${fmt(revenue)} × ${fmt(m)} = ${money(ev)}.`,
    }
  },
}

const exitValue: Template = {
  id: "exit-value",
  category: "Multiples",
  subcategory: "Exit value",
  build(rng, d) {
    const ebitda = pickBy(rng, d, [50, 100], [80, 100, 120], [64, 80, 96, 120])
    const g = pickBy(rng, d, [10, 20], [10, 25, 50], [12.5, 15, 25])
    const m = pickBy(rng, d, [8, 10], [8, 9, 10, 12], [7.5, 8.5, 9.5, 11])
    const next = clean(ebitda * (1 + g / 100))
    const ev = clean(next * m)
    return {
      prompt: `EBITDA of ${money(ebitda)} grows ${fmt(g)}% by exit, and the business is sold at ${mult(m)} EBITDA. What is the exit enterprise value?`,
      rounding: Number.isInteger(ev) ? undefined : "Round to the nearest $1m.",
      answer: ev,
      units: "$m",
      tolerance: 0.5,
      explanation: `Exit EBITDA = ${fmt(ebitda)} × ${fmt(1 + g / 100)} = ${fmt(next)}. Exit EV = ${fmt(next)} × ${fmt(m)} = ${money(ev)}.`,
    }
  },
}

// ---- Enterprise value / equity value bridges ----

const evFromEquity: Template = {
  id: "ev-from-equity",
  category: "EV bridges",
  subcategory: "Equity to enterprise value",
  build(rng, d) {
    const equity = pickBy(rng, d, [400, 500, 800], [450, 650, 900, 1200], [720, 980, 1350, 2100])
    const debt = pickBy(rng, d, [100, 200], [150, 250, 300], [185, 240, 360])
    const cash = pickBy(rng, d, [50, 100], [40, 80, 120], [45, 85, 130])
    const ev = equity + debt - cash
    return {
      prompt: `A company has an equity value of ${money(equity)}, debt of ${money(debt)} and cash of ${money(cash)}. What is its enterprise value?`,
      assumptions: [{ label: "Other claims", value: "No preferred stock or minority interest." }],
      answer: ev,
      units: "$m",
      tolerance: 0,
      explanation: `Enterprise value = equity value + debt − cash = ${fmt(equity)} + ${fmt(debt)} − ${fmt(cash)} = ${money(ev)}.`,
    }
  },
}

const equityFromEv: Template = {
  id: "equity-from-ev",
  category: "EV bridges",
  subcategory: "Enterprise to equity value",
  build(rng, d) {
    const ev = pickBy(rng, d, [800, 1000, 1500], [900, 1200, 1800, 2400], [1150, 1640, 2280, 3150])
    const debt = pickBy(rng, d, [200, 300], [250, 350, 400], [335, 420, 575])
    const cash = pickBy(rng, d, [50, 100], [60, 90, 150], [65, 115, 170])
    const equity = ev - debt + cash
    return {
      prompt: `A company has an enterprise value of ${money(ev)}, debt of ${money(debt)} and cash of ${money(cash)}. What is its equity value?`,
      assumptions: [{ label: "Other claims", value: "No preferred stock or minority interest." }],
      answer: equity,
      units: "$m",
      tolerance: 0,
      explanation: `Equity value = enterprise value − debt + cash = ${fmt(ev)} − ${fmt(debt)} + ${fmt(cash)} = ${money(equity)}.`,
    }
  },
}

const netDebt: Template = {
  id: "net-debt",
  category: "EV bridges",
  subcategory: "Net debt",
  build(rng, d) {
    const debt = pickBy(rng, d, [300, 400, 500], [350, 475, 620], [415, 685, 930])
    const cash = pickBy(rng, d, [50, 100, 150], [85, 120, 160], [95, 140, 215])
    const answer = debt - cash
    return {
      prompt: `A company has debt of ${money(debt)} and cash of ${money(cash)}. What is its net debt?`,
      answer,
      units: "$m",
      tolerance: 0,
      explanation: `Net debt = debt − cash = ${fmt(debt)} − ${fmt(cash)} = ${money(answer)}.`,
    }
  },
}

const fullBridge: Template = {
  id: "full-bridge",
  category: "EV bridges",
  subcategory: "Full bridge",
  build(rng, d) {
    const equity = pickBy(rng, d, [600, 800], [700, 950, 1100], [840, 1260, 1540])
    const debt = pickBy(rng, d, [200, 300], [250, 320, 400], [275, 365, 410])
    const preferred = pickBy(rng, d, [50, 100], [40, 60, 75], [35, 55, 85])
    const nci = pickBy(rng, d, [20, 40], [25, 35, 60], [18, 32, 47])
    const cash = pickBy(rng, d, [60, 100], [80, 120, 150], [70, 95, 135])
    const ev = equity + debt + preferred + nci - cash
    return {
      prompt: `Equity value is ${money(equity)}. The company has debt of ${money(debt)}, preferred stock of ${money(preferred)}, non-controlling interest of ${money(nci)} and cash of ${money(cash)}. What is its enterprise value?`,
      answer: ev,
      units: "$m",
      tolerance: 0,
      explanation: `Add every claim on the business and subtract cash: ${fmt(equity)} + ${fmt(debt)} + ${fmt(preferred)} + ${fmt(nci)} − ${fmt(cash)} = ${money(ev)}.`,
    }
  },
}

const pricePerShare: Template = {
  id: "price-per-share",
  category: "EV bridges",
  subcategory: "Equity value per share",
  build(rng, d) {
    const shares = pickBy(rng, d, [10, 20, 50], [25, 40, 80], [32, 48, 64, 125])
    const price = pickBy(rng, d, [10, 20, 25], [12, 15, 18, 30], [12.5, 17.5, 22.5, 36])
    const equity = clean(shares * price)
    return {
      prompt: `A company has an equity value of ${money(equity)} and ${fmt(shares)}m diluted shares outstanding. What is the value per share?`,
      rounding: "Give the answer in dollars to two decimal places.",
      answer: price,
      units: "$",
      tolerance: 0.005,
      explanation: `Value per share = equity value ÷ diluted shares = ${fmt(equity)} ÷ ${fmt(shares)} = $${fmt(price, 2)}.`,
    }
  },
}

export const TEMPLATES: Template[] = [
  add,
  subtract,
  multiply,
  divide,
  decimalProduct,
  percentOf,
  percentChange,
  reversePercent,
  margin,
  compound,
  basisPoints,
  fractionToDecimal,
  fractionToPercent,
  percentToDecimal,
  fractionOf,
  evFromEbitda,
  impliedMultiple,
  ebitdaFromEv,
  priceEarnings,
  evRevenue,
  exitValue,
  evFromEquity,
  equityFromEv,
  netDebt,
  fullBridge,
  pricePerShare,
]
