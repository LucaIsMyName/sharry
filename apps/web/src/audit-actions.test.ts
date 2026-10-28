import { describe, expect, it } from "vitest";
import { auditActionSentence } from "./audit-actions.ts";

describe("auditActionSentence", () => {
  it("returns the guide sentence for a known action", () => {
    expect(auditActionSentence("auth.login")).toBe("A password is accepted");
    expect(auditActionSentence("redirect_domain.verification_lost")).toBe(
      "A verified domain lost its TXT record.",
    );
  });

  it("describes landing page actions", () => {
    expect(auditActionSentence("page.published")).toBe("A landing page is published");
    expect(auditActionSentence("settings.page_prefix_changed")).toBe("The landing page prefix changes");
  });

  it("returns nothing for an unknown action", () => {
    expect(auditActionSentence("link.unknown")).toBeNull();
  });
});
