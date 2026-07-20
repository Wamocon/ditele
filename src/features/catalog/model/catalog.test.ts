import { describe, expect, it } from "vitest";

import { CatalogQuerySchema, localizedText } from "./catalog";

describe("catalog model", () => {
  it("uses English as the explicit locale fallback", () => {
    expect(localizedText({ en: "Foundation" }, "de")).toBe("Foundation");
  });

  it("normalizes pagination while rejecting oversized pages", () => {
    expect(CatalogQuerySchema.parse({ locale: "en" })).toMatchObject({
      page: 1,
      pageSize: 12,
      search: "",
    });
    expect(() =>
      CatalogQuerySchema.parse({ locale: "en", pageSize: 49 }),
    ).toThrow();
  });
});
