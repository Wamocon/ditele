import {
  CatalogCourseDetailSchema,
  CatalogPageSchema,
  CatalogQuerySchema,
  type CatalogCourseDetail,
  type CatalogPage,
  type CatalogQuery,
} from "../model/catalog";

export interface CatalogRepository {
  list(query: CatalogQuery): Promise<unknown>;
  getBySlug(slug: string, locale: CatalogQuery["locale"]): Promise<unknown>;
}

export async function listCatalog(
  repository: CatalogRepository,
  input: unknown,
): Promise<CatalogPage> {
  const query = CatalogQuerySchema.parse(input);
  const result = await repository.list(query);

  return CatalogPageSchema.parse(result);
}

export async function getCatalogCourse(
  repository: CatalogRepository,
  input: { slug: string; locale: CatalogQuery["locale"] },
): Promise<CatalogCourseDetail> {
  const slug = input.slug.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("catalog.invalid_slug");
  }

  const result = await repository.getBySlug(slug, input.locale);
  return CatalogCourseDetailSchema.parse(result);
}
