import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import HomePage from "../../../src/app/page";

Object.assign(globalThis, { React });

describe("HomePage", () => {
  it("présente les accès Coach et Client", () => {
    const markup = renderToStaticMarkup(createElement(HomePage));

    expect(markup).toContain('href="/login"');
    expect(markup).toContain("Connexion Coach");
    expect(markup).toContain('href="/client-login"');
    expect(markup).toContain("Connexion Client");
  });
});
