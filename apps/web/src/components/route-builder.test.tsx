// @vitest-environment happy-dom

import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyRoutingChoices, type RoutingRule } from "@sharry/shared";
import { setActiveLocale } from "../i18n/index.tsx";
import { RouteBuilder } from "./route-builder.tsx";

afterEach(() => {
  cleanup();
  setActiveLocale("en");
});

const stale: RoutingRule = {
  id: "11111111-1111-4111-8111-111111111111",
  destinationUrl: "https://example.com/old",
  conditions: [{ field: "browser", operator: "is", values: ["netscape"] }],
};

describe("RouteBuilder", () => {
  it("adds a route from the empty state", () => {
    const onChange = vi.fn();
    render(
      <RouteBuilder rules={[]} choices={emptyRoutingChoices()} utm={{}} locale="en" onChange={onChange} />,
    );
    expect(screen.getByText("Visitors use the destination unless a route matches.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add route" }));
    const [next] = onChange.mock.calls[0] ?? [];
    expect(next).toHaveLength(1);
    expect(next[0].conditions).toEqual([{ field: "browser", operator: "is", values: ["chrome"] }]);
  });

  it("groups several values and does not offer is any of", () => {
    const grouped: RoutingRule = {
      id: "22222222-2222-4222-8222-222222222222",
      destinationUrl: "https://example.com/browsers",
      conditions: [{ field: "browser", operator: "is", values: ["chrome", "firefox"] }],
    };
    function Harness() {
      const [rules, setRules] = useState([grouped]);
      return <RouteBuilder rules={rules} choices={emptyRoutingChoices()} utm={{}} locale="en" onChange={setRules} />;
    }
    render(<Harness />);
    expect(screen.queryByText("is any of")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Chrome, Firefox" }));
    fireEvent.click(screen.getByRole("option", { name: "Safari" }));
    expect(screen.getByRole("button", { name: "Chrome, Firefox, Safari" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Safari" })).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: "Firefox" }));
    fireEvent.click(screen.getByRole("option", { name: "Safari" }));
    const last = screen.getByRole("button", { name: "Chrome" });
    fireEvent.click(screen.getByRole("option", { name: "Chrome" }));
    expect(last).toBe(screen.getByRole("button", { name: "Chrome" }));
  });

  it("warns when a saved value is no longer recognized", () => {
    render(
      <RouteBuilder rules={[stale]} choices={emptyRoutingChoices()} utm={{}} locale="en" onChange={() => {}} />,
    );
    expect(
      screen.getByText("This value is no longer recognized. Visitors use the destination until you update this route."),
    ).toBeTruthy();
  });
});
