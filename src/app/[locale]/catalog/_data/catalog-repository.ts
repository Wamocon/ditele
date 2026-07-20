import "server-only";

import { z } from "zod";

import type {
  CatalogCourse,
  CatalogCourseDetail,
  CatalogPage,
  CatalogQuery,
} from "@/features/catalog/model/catalog";
import {
  PublicCatalogCourseProjectionRowSchema,
  PublicCatalogProjectionRowSchema,
  catalogProjectionMatchesSearch,
  toCatalogCourse,
  toCatalogCourseDetail,
} from "@/features/catalog/model/published-catalog-projection";
import { createServerClient } from "@/shared/database/server";

const PublicCatalogProjectionSchema = z.array(PublicCatalogProjectionRowSchema);
const PublicCatalogCourseProjectionSchema = z.array(
  PublicCatalogCourseProjectionRowSchema,
).max(1);

async function readPublishedCatalogProjection(
  locale: CatalogQuery["locale"],
) {
  const client = await createServerClient();
  const { data, error } = await client.rpc("get_public_catalog", {
    p_locale: locale,
  });

  if (error) {
    throw new Error("catalog.read_failed", { cause: error });
  }

  return PublicCatalogProjectionSchema.parse(data ?? []);
}

async function readPublishedCourseProjection(
  identity: { slug: string; courseId?: never } | { slug?: never; courseId: string },
) {
  const client = await createServerClient();
  const args = "slug" in identity
    ? { p_slug: identity.slug }
    : { p_course_id: identity.courseId };
  const { data, error } = await client.rpc("get_public_catalog_course", args);

  if (error) {
    throw new Error("catalog.read_failed", { cause: error });
  }

  return PublicCatalogCourseProjectionSchema.parse(data ?? [])[0] ?? null;
}

export async function listPublishedCatalog(query: CatalogQuery): Promise<CatalogPage> {
  const rows = (await readPublishedCatalogProjection(query.locale)).filter((row) =>
    catalogProjectionMatchesSearch(row, query.locale, query.search),
  );
  const start = (query.page - 1) * query.pageSize;

  return {
    items: rows.slice(start, start + query.pageSize).map(toCatalogCourse),
    page: query.page,
    pageSize: query.pageSize,
    total: rows.length,
  };
}

export async function getPublishedCatalogCourse(
  slug: string,
): Promise<CatalogCourseDetail | null> {
  const row = await readPublishedCourseProjection({ slug });
  return row ? toCatalogCourseDetail(row) : null;
}

export async function getPublishedCatalogCourseById(
  courseId: string,
): Promise<CatalogCourse | null> {
  const row = await readPublishedCourseProjection({ courseId });
  if (!row) return null;

  const detail = toCatalogCourseDetail(row);
  return {
    id: detail.id,
    slug: detail.slug,
    version: detail.version,
    title: detail.title,
    summary: detail.summary,
    durationMinutes: detail.durationMinutes,
    taskCount: detail.taskCount,
    availability: detail.availability,
    tags: detail.tags,
    publishedAt: detail.publishedAt,
    ...(detail.imageUrl ? { imageUrl: detail.imageUrl } : {}),
  };
}
