// SiteTrack Pro — project Map tab (v3 port, Batch 5). Display-only: shows the
// site location + a deep link to Google Maps. (Coordinate embed lands when
// projects.lat/lng is surfaced in the v3 project query.)

import { Card, Icon, Button } from "@/components/ui/atoms";
import type { ProjectDetail } from "@/app/queries";

export function MapTab({ project }: { project: ProjectDetail }): JSX.Element {
  const query = [project.name, project.location].filter(Boolean).join(", ");
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || project.name)}`;

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-ink-900">Site location</h2>
      <Card className="p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-safety-50 text-safety-600 grid place-items-center mx-auto mb-3"><Icon name="map" size={26} /></div>
        <div className="font-semibold text-ink-800">{project.name}</div>
        <div className="text-sm text-ink-500 mt-0.5">{project.location || "No location set for this project."}</div>
        {project.location && (
          <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-block mt-4">
            <Button variant="secondary" size="sm"><Icon name="map" size={14} /> Open in Google Maps</Button>
          </a>
        )}
      </Card>
    </div>
  );
}
