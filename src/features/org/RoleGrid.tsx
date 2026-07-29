import { useMemo } from "react";
import {
  IDENTITY_ROLES,
  ROLE_CATEGORY,
  ROLE_LABEL,
  identityRolesForPlan,
  type IdentityRole,
  type RoleCategory,
} from "@/auth";
import { RoleCard, type RoleOccupant } from "./RoleCard";
import type { OrgMemberRow } from "@/app/orgMemberQueries";

const CATEGORY_ORDER: RoleCategory[] = [
  "org-leadership",
  "project-execution",
  "design-discipline",
  "engineering-discipline",
  "field-supervision",
  "supply-chain",
  "external",
];

const CATEGORY_LABEL: Record<RoleCategory, string> = {
  platform: "Platform",
  "org-leadership": "Org Leadership",
  "project-execution": "Project Execution",
  "design-discipline": "Design / Architecture",
  "engineering-discipline": "Engineering",
  "field-supervision": "Field Supervision",
  "supply-chain": "Supply Chain",
  "external": "External / Client",
};

export interface RoleGridProps {
  members: OrgMemberRow[];
  plan: string | null;
  onAssign: (identityRole: string) => void;
  onChange: (identityRole: string, occupant: RoleOccupant) => void;
  onDeactivate: (occupant: RoleOccupant) => void;
  onReactivate: (occupant: RoleOccupant) => void;
  onManageCustomRoles: (occupant: RoleOccupant) => void;
}

export function RoleGrid({
  members,
  plan,
  onAssign,
  onChange,
  onDeactivate,
  onReactivate,
  onManageCustomRoles,
}: RoleGridProps): JSX.Element {
  const availableRoles = useMemo(() => identityRolesForPlan(plan), [plan]);

  const occupantByRole = useMemo(() => {
    const map = new Map<string, RoleOccupant[]>();
    for (const m of members) {
      const existing = map.get(m.identityRole) ?? [];
      existing.push({
        profileId: m.profileId,
        name: m.name,
        isAdmin: m.isAdmin,
        active: m.active,
        customRoles: m.customRoles,
      });
      map.set(m.identityRole, existing);
    }
    return map;
  }, [members]);

  const rolesByCategory = useMemo(() => {
    const groups = new Map<RoleCategory, IdentityRole[]>();
    for (const cat of CATEGORY_ORDER) groups.set(cat, []);
    for (const role of IDENTITY_ROLES) {
      if (role === "superadmin") continue;
      if (!availableRoles.includes(role)) continue;
      const cat = ROLE_CATEGORY[role];
      const list = groups.get(cat);
      if (list) list.push(role);
    }
    return groups;
  }, [availableRoles]);

  return (
    <div className="space-y-8">
      {CATEGORY_ORDER.map(cat => {
        const roles = rolesByCategory.get(cat);
        if (!roles || roles.length === 0) return null;
        return (
          <section key={cat}>
            <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-secondary mb-3">
              {CATEGORY_LABEL[cat]}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {roles.map(role => (
                <RoleCard
                  key={role}
                  identityRole={role}
                  label={ROLE_LABEL[role]}
                  category={cat}
                  occupants={occupantByRole.get(role) ?? []}
                  onAssign={onAssign}
                  onChange={onChange}
                  onDeactivate={onDeactivate}
                  onReactivate={onReactivate}
                  onManageCustomRoles={onManageCustomRoles}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
