// SiteTrack Pro — VNext P1.5: domain boundary map parity lock.
//
// Cross-checks every DECLARED boundary in src/app/domainMap.ts against the
// DERIVED facts (which read live from their sources of truth) and against the
// real modules / engines / on-disk files. If a module↔route↔engine↔tab↔nav
// declaration drifts, this suite fails CI immediately.

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";

import {
  DOMAIN_MAP,
  ENGINE_BOUNDARIES,
  ENGINE_IDS,
  MODULE_SURFACES,
  CORE_FILES,
  workflowEngineEntries,
  formEngineEntries,
  outboxEventEntries,
  spatialEngineEntries,
  isEngineId,
  surfaceFor,
  engineBoundaryFor,
  moduleLabel,
} from "@/app/domainMap";
import { MODULE_IDS, isModuleId, type ModuleId } from "@/modules";
import { PLUGIN_CATALOG, routeModules } from "@/plugins/catalog";
import { TAB_CATALOG } from "@/features/project/tabs-config";
import { NAV_CATALOG } from "@/app/nav-config";
import { WORKFLOW_REGISTRY } from "@/app/workflowDefinitions";
import { OutboxEventType } from "@/app/outboxQueries";
import { SPATIAL_LEVELS } from "@/app/spaceQueries";

const APP_DIR = path.resolve(process.cwd(), "src/app");

function appFileExists(base: string, where: string): void {
  expect(existsSync(path.join(APP_DIR, `${base}.ts`)), `${where}: src/app/${base}.ts missing`).toBe(true);
}

function sorted<T extends string>(xs: readonly T[]): T[] {
  return [...xs].sort();
}

// ── Engines: declared vs the live registries ────────────────────────────────
describe("domain map — shared engines (the rails)", () => {
  it("declares exactly the four engine ids, once each", () => {
    const ids = ENGINE_BOUNDARIES.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ENGINE_IDS]);
    for (const id of ids) expect(isEngineId(id)).toBe(true);
  });

  it("workflow engine entries match the workflowDefinitions register", () => {
    const entries = workflowEngineEntries();
    expect(entries).toEqual(WORKFLOW_REGISTRY.map(w => w.id));
    expect(new Set(entries).size).toBe(entries.length);
    expect(entries.length).toBeGreaterThan(0);
    const boundary = ENGINE_BOUNDARIES.find(e => e.id === "workflow")!;
    expect(boundary.entries).toEqual(entries);
  });

  it("form engine entries match the declared schema ids", () => {
    const entries = formEngineEntries();
    // P1.2 shipped the inspection checklist schema; P2.2 added the procurement-quote schema.
    expect(entries).toEqual(["inspection-checklist", "procurement-quote"]);
    expect(new Set(entries).size).toBe(entries.length);
    const boundary = ENGINE_BOUNDARIES.find(e => e.id === "form")!;
    expect(boundary.entries).toEqual(entries);
  });

  it("outbox engine entries match OutboxEventType (migration 208)", () => {
    const entries = outboxEventEntries();
    expect(entries).toEqual(Object.values(OutboxEventType));
    expect(new Set(entries).size).toBe(entries.length);
    expect(entries.length).toBeGreaterThan(0);
    const boundary = ENGINE_BOUNDARIES.find(e => e.id === "outbox")!;
    expect(boundary.entries).toEqual(entries);
  });

  it("spatial engine entries match the spatial levels (migration 206)", () => {
    const entries = spatialEngineEntries();
    expect(entries).toEqual([...SPATIAL_LEVELS]);
    const boundary = ENGINE_BOUNDARIES.find(e => e.id === "spatial")!;
    expect(boundary.entries).toEqual(entries);
  });

  it("every engine boundary file exists under src/app/", () => {
    for (const e of ENGINE_BOUNDARIES) {
      for (const f of e.files) appFileExists(f, `engine ${e.id}`);
    }
  });

  it("engine ownedBy is derived from the module surfaces (no drift)", () => {
    for (const e of ENGINE_BOUNDARIES) {
      const consumers = MODULE_SURFACES
        .filter(m => m.engines.includes(e.id))
        .map(m => m.moduleId)
        .sort();
      expect(sorted(e.ownedBy), `engine ${e.id}`).toEqual(consumers);
    }
  });

  it("every engine is consumed by at least one module surface", () => {
    for (const id of ENGINE_IDS) {
      expect(MODULE_SURFACES.some(m => m.engines.includes(id)), id).toBe(true);
    }
  });
});

// ── Modules: declared vs the module registry ────────────────────────────────
describe("domain map — module surfaces (the slots)", () => {
  it("covers every module id exactly once, all valid", () => {
    const ids = MODULE_SURFACES.map(m => m.moduleId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...MODULE_IDS]);
    for (const id of ids) expect(isModuleId(id), id).toBe(true);
  });

  it("every declared engine on a surface is a real engine id", () => {
    for (const m of MODULE_SURFACES) {
      for (const e of m.engines) {
        expect(isEngineId(e), `${m.moduleId} engines: ${String(e)}`).toBe(true);
      }
    }
  });

  it("every surface query file exists under src/app/", () => {
    for (const m of MODULE_SURFACES) {
      for (const f of m.queryFiles) appFileExists(f, `module ${m.moduleId}`);
    }
    for (const f of CORE_FILES) appFileExists(f, "core");
  });

  it("every core file is not claimed by a module surface (single owner)", () => {
    const claimed = new Set(MODULE_SURFACES.flatMap(m => m.queryFiles));
    for (const f of CORE_FILES) {
      expect(claimed.has(f), `core file src/app/${f}.ts also listed on a module`).toBe(false);
    }
  });
});

// ── Module ↔ route parity ───────────────────────────────────────────────────
describe("domain map — module ↔ route parity", () => {
  function catalogRoutesFor(moduleId: ModuleId): string[] {
    return PLUGIN_CATALOG.flatMap(p =>
      p.routes
        .filter(r => routeModules(p, r).includes(moduleId))
        .map(r => r.path),
    ).sort();
  }

  it("moduleRoutes matches the plugin catalog for every surface", () => {
    for (const m of MODULE_SURFACES) {
      expect(sorted(m.routes), `routes for ${m.moduleId}`).toEqual(catalogRoutesFor(m.moduleId));
    }
  });

  it("every catalog route is owned by at least one surface module", () => {
    const owners = new Set(MODULE_SURFACES.flatMap(m => m.routes));
    for (const p of PLUGIN_CATALOG) {
      for (const r of p.routes) {
        expect(owners.has(r.path), `route ${r.path} has no surface owner`).toBe(true);
      }
    }
  });
});

// ── Module ↔ tab parity ─────────────────────────────────────────────────────
describe("domain map — module ↔ tab parity", () => {
  it("moduleTabs matches tabs-config for every surface", () => {
    for (const m of MODULE_SURFACES) {
      const tabs = TAB_CATALOG.filter(t => t.moduleId === m.moduleId)
        .map(t => t.id)
        .sort();
      expect(sorted(m.tabs), `tabs for ${m.moduleId}`).toEqual(tabs);
    }
  });

  it("every tab moduleId resolves to a surface module", () => {
    const ids = new Set(MODULE_SURFACES.map(m => m.moduleId));
    for (const t of TAB_CATALOG) {
      if (t.moduleId) expect(ids.has(t.moduleId), `tab ${t.id}`).toBe(true);
    }
  });
});

// ── Module ↔ nav parity ─────────────────────────────────────────────────────
describe("domain map — module ↔ nav parity", () => {
  function catalogNavFor(moduleId: ModuleId): string[] {
    return NAV_CATALOG.filter(n => n.modules?.includes(moduleId))
      .map(n => n.to.replace(/^\//, ""))
      .sort();
  }

  it("moduleNav matches nav-config for every surface", () => {
    for (const m of MODULE_SURFACES) {
      expect(sorted(m.nav), `nav for ${m.moduleId}`).toEqual(catalogNavFor(m.moduleId));
    }
  });
});

// ── Aggregate / helpers ─────────────────────────────────────────────────────
describe("domain map — aggregate + helpers", () => {
  it("DOMAIN_MAP wires engines, modules and core files", () => {
    expect(DOMAIN_MAP.engines).toBe(ENGINE_BOUNDARIES);
    expect(DOMAIN_MAP.modules).toBe(MODULE_SURFACES);
    expect(DOMAIN_MAP.coreFiles).toBe(CORE_FILES);
    expect(DOMAIN_MAP.coreFiles.length).toBeGreaterThan(0);
  });

  it("surfaceFor / engineBoundaryFor / moduleLabel look up correctly", () => {
    expect(surfaceFor("crm")?.moduleId).toBe("crm");
    expect(surfaceFor("nope" as ModuleId)).toBeUndefined();
    expect(engineBoundaryFor("workflow")?.id).toBe("workflow");
    expect(engineBoundaryFor("nope" as never)).toBeUndefined();
    expect(moduleLabel("crm")).toContain("CRM");
  });
});
