import { useState } from "react";
import { Icon } from "@/components/ui/atoms";

export function SiteNavigator(): JSX.Element {
  // Breadcrumb levels - spatial hierarchy (Site → Building → Floor → Zone → Room)
  const levels = ["site", "building", "floor", "zone", "room"];

  // Determine the current navigation path based on active level
  const [activeLevel, setActiveLevel] = useState<typeof levels[number]>("site");

  // Module gate: space module must be enabled to show navigator
  // (check will be integrated when useModules hook is available)
  const spaceEnabled = true; // placeholder: always show for now

  // If space module is not enabled, render minimal placeholder
  if (!spaceEnabled) {
    return (
      <div className="p-3 text-tertiary uppercase tracking-wider">
        <Icon name="eye" size={16} /> <span>Spatial hierarchy disabled</span>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 bg-panel rounded-2xl border-default mb-6">
      <div className="flex items-center justify-between mb-4">
        <Icon name="layout" size={18} /> <strong>Spatial Hierarchy</strong>
      </div>

      {/* Breadcrumb trail */}
      <nav className="flex flex-col md:flex-row gap-2 md:gap-3 text-sm secondary" aria-label="Spatial hierarchy navigation">
        {levels.map((level) => {
          const isActive = level === activeLevel;
          return (
            <span key={level} className="flex items-center">
              {isActive ? (
                <span>{level}</span>
              ) : (
                <>
                  <Icon name="chevron" size={12} className="mx-1 opacity-60" />
                  <span>{level}</span>
                </>
              )}
            </span>
          );
        })}

        {/* Level selector */}
        <select
          onChange={(e) => setActiveLevel(e.target.value as typeof levels[number])}
          className="p-1 border-default rounded-sm text-sm ml-4"
        >
          {levels.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      </nav>

      {/* Level content placeholder */}
      <div className="mt-4">
        <p className="text-secondary">
          Select level to view
        </p>
      </div>
    </div>
  );
}