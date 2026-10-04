import { describe, expect, it } from "vitest";

/** WCAG 2.x contrast ratio between two sRGB hex colours. Guards the design tokens against accidental changes. */
function lum(hex: string): number {
  const c = hex.replace("#", "").match(/../g)!.map((h) => parseInt(h, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
export const ratio = (a: string, b: string) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1! + 0.05) / (l2! + 0.05);
};

const T = { maroon: "#4a1020", wine: "#6b1e2d", ivory: "#faf8f3", gold: "#d4af37", beige: "#e8ddc9", taupe: "#c9b8a7", charcoal: "#2d2d2d", rose: "#f5e6e6", white: "#ffffff", inkMuted: "#5c534d", goldInk: "#7a5d00", success: "#1f6b3a", successBg: "#e5f1e8", warning: "#7a4b00", warningBg: "#fbefd2", error: "#a3202f", errorBg: "#fbe4e6", info: "#204a7a", infoBg: "#e4edf7" };

describe("design token contrast (WCAG AA = 4.5:1 for text)", () => {
  const text: [string, string, string][] = [
    ["body text on ivory", T.charcoal, T.ivory],
    ["maroon headings on ivory", T.maroon, T.ivory],
    ["white on maroon buttons", T.white, T.maroon],
    ["white on wine (hover)", T.white, T.wine],
    ["gold text on maroon (footer/hero)", T.gold, T.maroon],
    ["muted text on ivory", T.inkMuted, T.ivory],
    ["muted text on white", T.inkMuted, T.white],
    ["muted text on beige", T.inkMuted, T.beige],
    ["charcoal on rose", T.charcoal, T.rose],
    ["gold-ink on ivory", T.goldInk, T.ivory],
    ["success text on its background", T.success, T.successBg],
    ["warning text on its background", T.warning, T.warningBg],
    ["error text on its background", T.error, T.errorBg],
    ["info text on its background", T.info, T.infoBg],
    ["error text on ivory", T.error, T.ivory],
    ["success text on ivory", T.success, T.ivory],
  ];
  for (const [name, fg, bg] of text) it(`${name} >= 4.5:1`, () => expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5));

  it("documents why gold and taupe are decorative-only on ivory (< 3:1)", () => {
    expect(ratio(T.gold, T.ivory)).toBeLessThan(3);
    expect(ratio(T.taupe, T.ivory)).toBeLessThan(3);
  });
  it("input borders (taupe) are decorative; the focus ring (wine) is >= 3:1 against ivory", () => {
    expect(ratio(T.wine, T.ivory)).toBeGreaterThanOrEqual(3);
  });
});
