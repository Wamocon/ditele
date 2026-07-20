import { describe, expect, it } from "vitest";

import { listCatalog, type CatalogRepository } from "./catalog-service";

describe("listCatalog", () => {
  it("validates repository output instead of trusting an adapter payload", async () => {
    const repository: CatalogRepository = {
      list: async () => ({ items: [{ id: 3 }], page: 1, pageSize: 12, total: 1 }),
      getBySlug: async () => null,
    };

    await expect(listCatalog(repository, { locale: "en" })).rejects.toThrow();
  });
});
