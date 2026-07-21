/**
 * The one prop shape every surface component takes.
 *
 * In its own module so a surface can import it without importing the registry
 * that imports the surface. A cycle here is not a style question: it is a
 * module-initialisation order bug that shows up as `undefined is not a
 * component` at runtime, in the browser, only sometimes.
 */
export interface SurfaceProps {
  /**
   * The scenario-local surface id, from `configuration.surfaces[].id`. A
   * surface passes it to `useSurface(surfaceId)` to ask whether its effects are
   * armed, and uses it to build unique DOM ids — the same component can be
   * rendered twice in one scenario.
   */
  surfaceId: string;
  /** `configuration.surfaces[].content`, unparsed. GERMAN course material. */
  content: Record<string, unknown>;
}
