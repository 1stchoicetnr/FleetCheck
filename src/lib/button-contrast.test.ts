import assert from "node:assert/strict";
import test from "node:test";
import {
  buttonContrastPairs,
  choiceErrorClass,
  choiceIssueClass,
  choiceOkClass,
  choiceRetakeClass,
  dangerButtonClass,
  dangerOutlineButtonClass,
  ghostButtonClass,
  outlineButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
  secondaryOutlineButtonClass,
} from "./button-styles.ts";

function channel(hex: string, index: number): number {
  const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrast(fg: string, bg: string): number {
  const lum = (hex: string) =>
    0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
  const lighter = Math.max(lum(fg), lum(bg));
  const darker = Math.min(lum(fg), lum(bg));
  return (lighter + 0.05) / (darker + 0.05);
}

test("every button color pair meets WCAG AA", () => {
  for (const pair of buttonContrastPairs) {
    const ratio = contrast(pair.fg, pair.bg);
    assert.ok(ratio >= 4.5, `${pair.name} is ${ratio.toFixed(2)}:1`);
  }
});

test("button classes do not fade disabled text", () => {
  const classes = [
    primaryButtonClass,
    secondaryButtonClass,
    secondaryOutlineButtonClass,
    dangerButtonClass,
    dangerOutlineButtonClass,
    outlineButtonClass,
    ghostButtonClass,
    choiceOkClass,
    choiceIssueClass,
    choiceErrorClass,
    choiceRetakeClass,
  ];
  for (const value of classes) {
    assert.equal(value.includes("disabled:opacity-50"), false);
    assert.equal(value.includes("disabled:opacity-60"), false);
    assert.equal(value.includes("bg-gray-900"), false);
    assert.equal(value.includes("bg-brand-700"), false);
  }
});
