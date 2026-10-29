import { describe, expect, it } from "vitest";
import { buttonVariants } from "./button.tsx";

const sizes = ["default", "xs", "sm", "lg", "icon", "icon-xs", "icon-sm", "icon-lg"] as const;

describe("button touch targets", () => {
  it.each(sizes)("%s grows to 44px on touch screens", (size) => {
    const classes = buttonVariants({ size }).split(/\s+/);
    const coarse = size.startsWith("icon") ? "pointer-coarse:size-11" : "pointer-coarse:h-11";
    expect(classes).toContain(coarse);
  });
});
