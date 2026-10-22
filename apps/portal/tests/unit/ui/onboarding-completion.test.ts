import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OnboardingCompletion } from "../../../src/features/client/onboarding/onboarding-completion";
import OnboardingPage from "../../../src/app/(client)/client/onboarding/page";

Object.assign(globalThis, { React });

describe("onboarding completion without repeated answers", () => {
  for (const french of [true, false]) {
    it(`reserves only the ${french ? "French" : "English"} video slot without a fake player`, () => {
      const html = renderToStaticMarkup(React.createElement(OnboardingCompletion, { french }));
      expect(html).toContain(`data-video-language="${french ? "fr" : "en"}"`);
      expect(html).toContain(french ? "Vidéo à venir" : "Video coming soon");
      expect(html).not.toContain(french ? "The English video" : "La vidéo en français");
      expect(html).not.toMatch(/<(video|iframe|button|form|details|dl)\b/);
      expect(html).toContain('href="/client"');
      expect(html.indexOf('href="/client"')).toBeGreaterThan(html.indexOf("</section>"));
    });
  }
  it("defaults to confirmation and requires the exact presentation query to consult submitted responses", async () => {
    for (const view of [undefined, "responses", "other", ["responses"]]) {
      const page = await OnboardingPage({ searchParams: Promise.resolve({ view }) });
      expect(page.props.reviewSubmittedResponses).toBe(view === "responses");
    }
  });
});
