/** `colour` at `percent` opacity, for any CSS colour including theme variables such as "var(--primary)". */
export const alpha = (colour: string, percent: number) => `color-mix(in srgb, ${colour} ${percent}%, transparent)`
