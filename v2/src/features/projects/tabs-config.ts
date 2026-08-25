export interface TabDef {
  id: string;
  label: string;
  requires?: string;
}

export const PROJECT_TABS: TabDef[] = [
  { id: "overview", label: "Overview" },
  { id: "dpr", label: "Daily Reports", requires: "dpr:view" },
  { id: "invoices", label: "Invoices", requires: "budget:view" },
  { id: "rabills", label: "RA Bills", requires: "budget:view" },
  { id: "partners", label: "Partners", requires: "team:manage" },
  { id: "clientaccess", label: "Client Access", requires: "share:link:manage" },
];

export function visibleTabs(
  tabs: TabDef[],
  can: (capability: string) => boolean,
): TabDef[] {
  return tabs.filter((t) => !t.requires || can(t.requires));
}
