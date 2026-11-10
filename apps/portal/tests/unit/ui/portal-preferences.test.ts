import { afterEach, describe, expect, it, vi } from "vitest";
import { translateUi } from "@/components/fe/ui-copy";
import { programIssues } from "@/lib/training/program-issues";
import { newProgram, newSession } from "@/lib/training/program-editor";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("display-only preferences", () => {
  it.each([["", "fr"], ["?lang=en", "en"]])("initialization preserves the explicit browser choice %s", async (query, expected) => {
    const location = new URL(`https://staging.example.test/${query}`);
    const document = { cookie: "fe-language=fr", documentElement: { lang: "", dataset: {} } };
    const setItem = vi.fn();
    vi.stubGlobal("document", document); vi.stubGlobal("location", location);
    vi.stubGlobal("window", { location, localStorage: { getItem: () => null, setItem }, history: { state: null, replaceState: vi.fn() }, dispatchEvent: vi.fn() });
    const { initializePortalLanguage } = await import("@/components/fe/portal-preferences");
    initializePortalLanguage("en");
    expect(document.documentElement.lang).toBe(expected);
    expect(setItem).toHaveBeenCalledWith("fe-language", expected);
  });
  it.each(["fr", "en"])("accepts only the supported language %s", async value => {
    const { parseLanguage } = await import("@/components/fe/portal-preferences");
    expect(parseLanguage(value)).toBe(value);
    for (const bad of [undefined, null, "EN", "fr-CA", "<script>", {}, "constructor"]) expect(parseLanguage(bad)).toBeNull();
  });
  it("persists only allowlisted preferences and preserves navigation and invitation fragments", async () => {
    const writes: string[] = [], storage = new Map<string, string>();
    const location = new URL("https://staging.example.test/client?language=fr&lang=fr&weekNumber=3#invitation-test");
    const document = { cookie: "", documentElement: { lang: "fr", dataset: {} as Record<string, string> } };
    Object.defineProperty(document, "cookie", { get: () => writes.at(-1)?.split(";")[0] ?? "", set: value => writes.push(value) });
    const replaceState = vi.fn();
    vi.stubGlobal("document", document); vi.stubGlobal("location", location);
    vi.stubGlobal("window", { location, localStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) }, history: { state: { safe: true }, replaceState }, dispatchEvent: vi.fn() });
    const { setPortalLanguage, setPortalTheme } = await import("@/components/fe/portal-preferences");
    setPortalLanguage("en");
    expect(replaceState.mock.calls[0][2].href).toBe("https://staging.example.test/client?language=en&lang=en&weekNumber=3#invitation-test");
    expect(document.documentElement.lang).toBe("en");
    expect(writes[0]).toBe("fe-language=en; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
    setPortalTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect([...storage]).toEqual([["fe-language", "en"], ["fe-theme", "dark"]]);
    setPortalLanguage("xx" as "en"); setPortalTheme("xx" as "dark");
    expect(writes).toHaveLength(2);
  });
  it("does not throw when the browser blocks both cookie and local storage", async () => {
    const location = new URL("https://staging.example.test/client");
    const document = { documentElement: { lang: "", dataset: {} as Record<string, string> } };
    Object.defineProperty(document, "cookie", { get() { throw new Error("blocked"); }, set() { throw new Error("blocked"); } });
    vi.stubGlobal("document", document); vi.stubGlobal("location", location);
    vi.stubGlobal("window", { location, localStorage: { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } }, history: { state: null, replaceState: vi.fn() }, dispatchEvent: vi.fn() });
    const { setPortalLanguage, setPortalTheme } = await import("@/components/fe/portal-preferences");
    expect(() => { setPortalLanguage("en"); setPortalTheme("dark"); }).not.toThrow();
    expect(document.documentElement).toEqual({ lang: "en", dataset: { theme: "dark" } });
  });
});

describe("owned UI copy only", () => {
  it("translates feedback in both directions without translating unknown content", () => {
    const fr = "Le code est invalide ou expiré.", en = "The code is invalid or expired.";
    expect(translateUi(fr, "en")).toBe(en);
    expect(translateUi(en, "fr")).toBe(fr);
    expect(translateUi("Renvoyer dans 30 s", "en")).toBe("Resend in 30 s");
    expect(translateUi("My custom workout", "en")).toBe("My custom workout");
    expect(translateUi("constructor", "en")).toBe("constructor");
    expect(translateUi("__proto__", "en")).toBe("__proto__");
    expect(translateUi("Version ", "fr")).toBe("Version ");
    expect(translateUi(" · Publication ", "fr")).toBe(" · Publication ");
  });
  it("localizes validation without changing its paths, requirements or saved document", () => {
    const document = newProgram();
    document.weeks[0].sessions = [newSession()];
    document.weeks[0].sessions[0].title = { fr: "", en: "" };
    const before = structuredClone(document);
    const french = programIssues(document, "publish", "fr"), english = programIssues(document, "publish", "en");
    expect(english.length).toBeGreaterThan(0);
    expect(english.map(issue => issue.path)).toEqual(french.map(issue => issue.path));
    expect(english.map(issue => issue.message)).not.toEqual(french.map(issue => issue.message));
    expect(document).toEqual(before);
  });
});
