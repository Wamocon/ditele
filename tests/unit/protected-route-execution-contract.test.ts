import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { createElement, type ComponentProps } from "react";

import { render } from "@testing-library/react";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import type { AppRole } from "@/shared/auth/types";
import enMessages from "@/shared/i18n/messages/en.json";
import { AppShell, type ShellRole } from "@/shared/ui/app-shell";

const applicationRoot = resolve(process.cwd(), "src/app/[locale]");
const protectedSurfaces = ["learn", "trainer", "admin", "organization"] as const;
const contentAccessBoundary = "readContentStudioAccess";
const directRoleBoundary = "canRenderProtectedPage";
const sensitiveBoundaryName = /^(?:createServerClient|(?:get|list|read)[A-Z])/;
const sensitiveModuleName = /(?:data|repository|server)/;

type PageAudit = {
  readonly file: string;
  readonly route: string;
  readonly roles: readonly AppRole[];
  readonly requiredPermissions: readonly string[];
  readonly authorizationStatement: number;
  readonly firstSensitiveStatement: number | null;
  readonly forwardingTarget: string | null;
  readonly violations: readonly string[];
};

type LayoutContract = {
  readonly shellRole: ShellRole;
  readonly roles: readonly AppRole[];
};

const rolePermissions: Readonly<
  Record<Exclude<AppRole, "admin">, ReadonlySet<string>>
> = {
  learner: new Set([
    "profile.read_self",
    "profile.update_self",
    "catalog.read",
    "enrollment.request",
    "cohort.read",
    "learning.submit",
  ]),
  trainer: new Set([
    "profile.read_self",
    "profile.update_self",
    "catalog.read",
    "cohort.read",
    "review.manage",
    "question.manage",
  ]),
  organization_admin: new Set([
    "profile.read_self",
    "profile.update_self",
    "catalog.read",
    "enrollment.decide",
    "cohort.read",
    "cohort.manage",
    "organization.manage",
    "audit.read",
  ]),
  content_admin: new Set([
    "profile.read_self",
    "catalog.read",
    "content.manage",
    "content.publish",
  ]),
  support: new Set(["profile.read_self", "support.manage"]),
  integration_admin: new Set(["profile.read_self", "integration.replay"]),
  dpo: new Set(["profile.read_self", "privacy.manage", "audit.read"]),
};

function sourceFile(path: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function filesBelow(directory: string, name: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesBelow(path, name);
    return entry.name === name ? [path] : [];
  });
}

function pageRoute(path: string): string {
  const directory = relative(applicationRoot, dirname(path));
  return `/${directory
    .split(sep)
    .map((segment) => {
      const dynamic = /^\[(.+)]$/.exec(segment);
      return dynamic ? `:${dynamic[1]}` : segment;
    })
    .join("/")}`;
}

function callsBelow(node: ts.Node): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  function visit(child: ts.Node) {
    if (ts.isCallExpression(child)) calls.push(child);
    ts.forEachChild(child, visit);
  }
  visit(node);
  return calls;
}

function containsReturn(node: ts.Node): boolean {
  let found = false;
  function visit(child: ts.Node) {
    if (ts.isReturnStatement(child)) found = true;
    if (!found) ts.forEachChild(child, visit);
  }
  visit(node);
  return found;
}

function containsPropertyAccess(node: ts.Node, propertyName: string): boolean {
  let found = false;
  function visit(child: ts.Node) {
    if (
      ts.isPropertyAccessExpression(child) &&
      child.name.text === propertyName
    ) {
      found = true;
    }
    if (!found) ts.forEachChild(child, visit);
  }
  visit(node);
  return found;
}

function calledIdentifier(call: ts.CallExpression): string | null {
  return ts.isIdentifier(call.expression) ? call.expression.text : null;
}

function stringArray(node: ts.Expression | undefined): AppRole[] {
  if (!node || !ts.isArrayLiteralExpression(node)) return [];
  return node.elements.flatMap((element) =>
    ts.isStringLiteral(element) ? [element.text as AppRole] : [],
  );
}

function defaultPageFunction(file: ts.SourceFile): ts.FunctionDeclaration | null {
  return (
    file.statements.find(
      (statement): statement is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(statement) &&
        statement.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
        ) === true,
    ) ?? null
  );
}

function forwardingTarget(file: ts.SourceFile, path: string): string | null {
  for (const statement of file.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      !statement.moduleSpecifier ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.exportClause ||
      !ts.isNamedExports(statement.exportClause)
    ) {
      continue;
    }
    const forwardsDefault = statement.exportClause.elements.some(
      (element) =>
        element.name.text === "default" || element.propertyName?.text === "default",
    );
    if (!forwardsDefault) continue;
    return resolve(dirname(path), `${statement.moduleSpecifier.text}.tsx`);
  }
  return null;
}

function importedSensitiveNames(file: ts.SourceFile): ReadonlySet<string> {
  const names = new Set<string>();
  for (const statement of file.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }
    const moduleName = statement.moduleSpecifier.text;
    for (const element of statement.importClause.namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (
        importedName !== contentAccessBoundary &&
        importedName !== "getPrincipal" &&
        sensitiveBoundaryName.test(importedName) &&
        (importedName === "createServerClient" ||
          sensitiveModuleName.test(moduleName))
      ) {
        names.add(element.name.text);
      }
    }
  }
  return names;
}

function statementHasSensitiveRead(
  statement: ts.Statement,
  sensitiveNames: ReadonlySet<string>,
): boolean {
  return callsBelow(statement).some((call) => {
    const identifier = calledIdentifier(call);
    if (identifier && sensitiveNames.has(identifier)) return true;
    return (
      ts.isPropertyAccessExpression(call.expression) &&
      (call.expression.name.text === "from" ||
        call.expression.name.text === "rpc")
    );
  });
}

function failClosedIf(statement: ts.Statement): statement is ts.IfStatement {
  return ts.isIfStatement(statement) && containsReturn(statement.thenStatement);
}

function permissionChecks(statement: ts.Statement): string[] {
  if (!failClosedIf(statement)) return [];
  return callsBelow(statement).flatMap((call) => {
    if (calledIdentifier(call) !== "hasPermission") return [];
    const permission = call.arguments[1];
    return permission && ts.isStringLiteral(permission) ? [permission.text] : [];
  });
}

function auditPage(path: string, visited = new Set<string>()): PageAudit {
  if (visited.has(path)) {
    return {
      file: path,
      route: pageRoute(path),
      roles: [],
      requiredPermissions: [],
      authorizationStatement: -1,
      firstSensitiveStatement: null,
      forwardingTarget: null,
      violations: ["default-page forwarding cycle"],
    };
  }
  visited.add(path);

  const parsed = sourceFile(path);
  const forwarded = forwardingTarget(parsed, path);
  if (forwarded) {
    const targetAudit = auditPage(forwarded, visited);
    return {
      ...targetAudit,
      file: path,
      route: pageRoute(path),
      forwardingTarget: relative(process.cwd(), forwarded),
    };
  }

  const pageFunction = defaultPageFunction(parsed);
  if (!pageFunction?.body) {
    return {
      file: path,
      route: pageRoute(path),
      roles: [],
      requiredPermissions: [],
      authorizationStatement: -1,
      firstSensitiveStatement: null,
      forwardingTarget: null,
      violations: ["missing analyzable default page function"],
    };
  }

  const statements = [...pageFunction.body.statements];
  const sensitiveNames = importedSensitiveNames(parsed);
  const firstSensitiveStatement = statements.findIndex((statement) =>
    statementHasSensitiveRead(statement, sensitiveNames),
  );
  const directGuardStatement = statements.findIndex(
    (statement) =>
      failClosedIf(statement) &&
      callsBelow(statement).some(
        (call) => calledIdentifier(call) === directRoleBoundary,
      ),
  );
  const directGuardCall =
    directGuardStatement < 0
      ? undefined
      : callsBelow(statements[directGuardStatement]!).find(
          (call) => calledIdentifier(call) === directRoleBoundary,
        );
  const directRoles = stringArray(directGuardCall?.arguments[2]);
  const usesContentAccess = statements.some((statement) =>
    callsBelow(statement).some(
      (call) => calledIdentifier(call) === contentAccessBoundary,
    ),
  );
  const contentPermissionGuard = statements.findIndex(
    (statement) =>
      failClosedIf(statement) &&
      containsPropertyAccess(statement, "canManage"),
  );
  const authorizationStatement = Math.max(
    directGuardStatement,
    usesContentAccess ? contentPermissionGuard : -1,
  );
  const requiredPermissions = new Set(
    statements.flatMap((statement, index) =>
      firstSensitiveStatement < 0 || index < firstSensitiveStatement
        ? permissionChecks(statement)
        : [],
    ),
  );
  if (usesContentAccess) requiredPermissions.add("content.manage");

  const violations: string[] = [];
  if (authorizationStatement < 0) {
    violations.push("no page-level role or approved permission guard");
  }
  if (usesContentAccess && contentPermissionGuard < 0) {
    violations.push("content access is not denied before domain reads");
  }
  if (
    firstSensitiveStatement >= 0 &&
    authorizationStatement >= firstSensitiveStatement
  ) {
    violations.push(
      `authorization statement ${authorizationStatement} does not precede sensitive statement ${firstSensitiveStatement}`,
    );
  }

  return {
    file: path,
    route: pageRoute(path),
    roles:
      directRoles.length > 0 ? directRoles : ["admin", "content_admin"],
    requiredPermissions: [...requiredPermissions].sort(),
    authorizationStatement,
    firstSensitiveStatement:
      firstSensitiveStatement < 0 ? null : firstSensitiveStatement,
    forwardingTarget: null,
    violations,
  };
}

function protectedPageAudits(): PageAudit[] {
  return protectedSurfaces
    .flatMap((surface) => filesBelow(join(applicationRoot, surface), "page.tsx"))
    .map((path) => auditPage(path))
    .sort((left, right) => left.route.localeCompare(right.route));
}

function layoutContract(surface: (typeof protectedSurfaces)[number]): LayoutContract {
  const parsed = sourceFile(join(applicationRoot, surface, "layout.tsx"));
  let contract: LayoutContract | null = null;
  function visit(node: ts.Node) {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(parsed) === "RoleShell"
    ) {
      const attributes = new Map(
        node.attributes.properties.flatMap((attribute) =>
          ts.isJsxAttribute(attribute) ? [[attribute.name.getText(parsed), attribute]] : [],
        ),
      );
      const shellAttribute = attributes.get("shellRole")?.initializer;
      const rolesAttribute = attributes.get("allowedRoles")?.initializer;
      if (
        shellAttribute &&
        ts.isStringLiteral(shellAttribute) &&
        rolesAttribute &&
        ts.isJsxExpression(rolesAttribute)
      ) {
        contract = {
          shellRole: shellAttribute.text as ShellRole,
          roles: stringArray(rolesAttribute.expression),
        };
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  if (!contract) throw new Error(`RoleShell contract missing for ${surface}`);
  return contract;
}

function navigationTargets(shellRole: ShellRole): string[] {
  const props = {
    activeHref: "/en",
    breadcrumbs: "Protected route contract",
    locale: "en",
    messages: enMessages,
    role: shellRole,
    userName: "Contract User",
  } as ComponentProps<typeof AppShell>;
  const { container, unmount } = render(
    createElement(
      AppShell,
      props,
      createElement("p", null, "Protected content"),
    ),
  );
  const targets = [...container.querySelectorAll(".app-shell__nav a")].flatMap(
    (anchor) => {
      const href = anchor.getAttribute("href");
      return href ? [href.replace(/^\/en(?=\/|$)/, "") || "/"] : [];
    },
  );
  unmount();
  return targets;
}

function roleHasPermissions(
  role: AppRole,
  permissions: readonly string[],
): boolean {
  if (role === "admin") return true;
  return permissions.every((permission) => rolePermissions[role].has(permission));
}

describe("protected route execution contracts", () => {
  it("guards every protected page before its first sensitive read", () => {
    const failures = protectedPageAudits().flatMap((audit) =>
      audit.violations.map(
        (violation) =>
          `${audit.route} (${relative(process.cwd(), audit.file)}): ${violation}`,
      ),
    );

    expect(failures).toEqual([]);
  });

  it("keeps the approved content-studio boundary server-authoritative", () => {
    const path = join(applicationRoot, "admin/courses/access.ts");
    const parsed = sourceFile(path);
    const calls = callsBelow(parsed);
    const permissionCodes = calls.flatMap((call) => {
      if (calledIdentifier(call) !== "hasPermission") return [];
      const permission = call.arguments[1];
      return permission && ts.isStringLiteral(permission) ? [permission.text] : [];
    });

    expect(calls.some((call) => calledIdentifier(call) === "getPrincipal")).toBe(
      true,
    );
    expect(permissionCodes).toContain("content.manage");
  });

  it("makes every shell navigation target reachable to every role admitted by that shell", () => {
    const auditsByRoute = new Map(
      protectedPageAudits().map((audit) => [audit.route, audit]),
    );
    const failures: string[] = [];

    for (const surface of protectedSurfaces) {
      const layout = layoutContract(surface);
      for (const role of layout.roles) {
        const effectiveShellRole =
          layout.shellRole === "admin" && role === "content_admin"
            ? "contentAdmin"
            : layout.shellRole;
        for (const target of navigationTargets(effectiveShellRole)) {
          const audit = auditsByRoute.get(target);
          if (!audit) {
            failures.push(`${effectiveShellRole} navigation target ${target} has no page`);
            continue;
          }
          if (!audit.roles.includes(role)) {
            failures.push(
              `${role} is admitted to ${effectiveShellRole} shell but ${target} admits only ${audit.roles.join(", ")}`,
            );
          } else if (!roleHasPermissions(role, audit.requiredPermissions)) {
            failures.push(
              `${role} is admitted to ${effectiveShellRole} shell but ${target} requires ${audit.requiredPermissions.join(", ")}`,
            );
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
