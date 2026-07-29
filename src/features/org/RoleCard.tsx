import { cn } from "@/lib/cn";
import { Card, Button, Badge, Icon } from "@/components/ui/atoms";
import { DropdownMenu, DropdownItem } from "@/components/ui/DropdownMenu";

export interface RoleOccupant {
  profileId: string;
  name: string;
  isAdmin: boolean;
  active: boolean;
  customRoles: string[];
}

export interface RoleCardProps {
  identityRole: string;
  label: string;
  category: string;
  occupants: RoleOccupant[];
  onAssign: (identityRole: string) => void;
  onChange: (identityRole: string, occupant: RoleOccupant) => void;
  onDeactivate: (occupant: RoleOccupant) => void;
  onReactivate: (occupant: RoleOccupant) => void;
  onManageCustomRoles: (occupant: RoleOccupant) => void;
}

const CATEGORY_ACCENT: Record<string, string> = {
  "org-leadership": "border-l-4 border-l-accent",
  "project-execution": "border-l-4 border-l-info",
  "design-discipline": "border-l-4 border-l-violet-500",
  "engineering-discipline": "border-l-4 border-l-cyan-600",
  "field-supervision": "border-l-4 border-l-accent",
  "supply-chain": "border-l-4 border-l-success",
  "external": "border-l-4 border-l-fg-tertiary",
};

export function RoleCard({
  identityRole,
  label,
  category,
  occupants,
  onAssign,
  onChange,
  onDeactivate,
  onReactivate,
  onManageCustomRoles,
}: RoleCardProps): JSX.Element {
  const accent = CATEGORY_ACCENT[category] ?? "border-l-4 border-l-fg-tertiary";

  return (
    <Card className={cn("p-4 flex flex-col gap-3", accent)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-fg-primary text-sm">{label}</div>
          <div className="text-[10px] text-fg-tertiary tracking-wide uppercase">{occupants.length} occupant{occupants.length !== 1 ? "s" : ""}</div>
        </div>
        {occupants.length === 0 ? (
          <Button size="sm" variant="secondary" onClick={() => onAssign(identityRole)}>
            Assign
          </Button>
        ) : (
          <DropdownMenu
            trigger={
              <button className="p-1 rounded-lg hover:bg-elevated text-fg-tertiary hover:text-fg-primary transition">
                <Icon name="menu" size={16} />
              </button>
            }
          >
            <DropdownItem onClick={() => onChange(identityRole, occupants[0])}>
              Change person
            </DropdownItem>
            <DropdownItem onClick={() => onAssign(identityRole)}>
              Add another
            </DropdownItem>
            {occupants[0]?.active
              ? <DropdownItem onClick={() => onDeactivate(occupants[0])}>Deactivate</DropdownItem>
              : <DropdownItem onClick={() => onReactivate(occupants[0])}>Reactivate</DropdownItem>}
            <DropdownItem onClick={() => onManageCustomRoles(occupants[0])}>
              Manage custom roles
            </DropdownItem>
          </DropdownMenu>
        )}
      </div>

      {occupants.length === 0 ? (
        <div className="flex items-center gap-2 text-fg-tertiary text-sm py-2">
          <Icon name="user" size={16} />
          <span className="text-fg-tertiary">Vacant</span>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-32 overflow-y-auto">
          {occupants.map(o => (
            <div key={o.profileId} className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded-lg",
              "hover:bg-secondary transition cursor-pointer group",
              !o.active && "opacity-50",
            )}>
              <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[11px] font-semibold text-fg-secondary flex-shrink-0">
                {o.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-fg-primary truncate">{o.name}</div>
                {o.isAdmin && <div className="text-[10px] text-fg-tertiary">Org admin</div>}
              </div>
              {o.customRoles.length > 0 && (
                <Badge tone="neutral" className="flex-shrink-0">
                  +{o.customRoles.length}
                </Badge>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="opacity-0 group-hover:opacity-100 flex-shrink-0"
                onClick={() => onChange(identityRole, o)}
              >
                Change
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
