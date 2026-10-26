// @vitest-environment happy-dom

import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    expect(screen.getByRole("textbox", { name: "Search" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Custom…" })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "Safari" }));
    expect(screen.getByRole("button", { name: "Chrome, Firefox, Safari" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Safari" })).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: "Firefox" }));
    fireEvent.click(screen.getByRole("option", { name: "Safari" }));
    const last = screen.getByRole("button", { name: "Chrome" });
    fireEvent.click(screen.getByRole("option", { name: "Chrome" }));
    expect(last).toBe(screen.getByRole("button", { name: "Chrome" }));
  });

  it("filters the value list after search settles and adds several custom values", async () => {
    const source: RoutingRule = {
      id: "33333333-3333-4333-8333-333333333333",
      destinationUrl: "https://example.com/source",
      conditions: [{ field: "utm_source", operator: "is", values: ["newsletter"] }],
    };
    function Harness() {
      const [rules, setRules] = useState([source]);
      return <RouteBuilder rules={rules} choices={emptyRoutingChoices()} utm={{}} locale="en" onChange={setRules} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "newsletter" }));
    expect(screen.queryByRole("option", { name: "email" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Search" }), { target: { value: "news" } });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    expect(screen.getByRole("option", { name: "newsletter" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "email" })).toBeNull();
    const custom = screen.getByRole("textbox", { name: "Custom…" });
    fireEvent.change(custom, { target: { value: "partner" } });
    fireEvent.keyDown(custom, { key: "Enter" });
    fireEvent.change(custom, { target: { value: "podcast" } });
    fireEvent.keyDown(custom, { key: "Enter" });
    expect(screen.getByRole("button", { name: "newsletter, partner, podcast" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Search" }), { target: { value: "" } });
    await act(async () => {});
    expect(screen.getByRole("option", { name: "partner" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "podcast" })).toBeTruthy();
  });

  it("names a route and shows Route 1 when the name is empty", () => {
    function Harness() {
      const [rules, setRules] = useState([stale]);
      return <RouteBuilder rules={rules} choices={emptyRoutingChoices()} utm={{}} locale="en" onChange={setRules} />;
    }
    render(<Harness />);
    const name = screen.getByRole("textbox", { name: "Route name" });
    expect(name.getAttribute("placeholder")).toBe("Route 1");
    fireEvent.change(name, { target: { value: "Phones" } });
    expect(screen.getByRole("textbox", { name: "Route name" }).getAttribute("value")).toBe("Phones");
    fireEvent.change(screen.getByRole("textbox", { name: "Route name" }), { target: { value: "" } });
    expect(screen.getByRole("textbox", { name: "Route name" }).getAttribute("placeholder")).toBe("Route 1");
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
