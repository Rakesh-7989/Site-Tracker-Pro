import { useState } from "react";
import { useModules } from "@/modules";

/**
 * Location Context Hook
 *
 * Provides the current spatial location within a project's hierarchy
 * and enables location-scoped data operations for offline-first workflows.
 *
 * Hierarchy: site → building → floor → zone → room
 * Every record can carry a `location_id` linking it to this hierarchy.
 *
 * Integration:
 * - SiteNavigator.tsx: renders breadcrumb trail + level selector
 * - DetailView.tsx: scopes queries by currentLocationId
 * - Offline sync: filters queue by active location
 */
export function useLocationContext() {
  const { enabledModules } = useModules();

  // State: currently active location ID and its level
  const [currentLocationId, setCurrentLocationId] = useState<string>("");
  const [locationLevel, setLocationLevel] = useState<
    "site" | "building" | "floor" | "zone" | "room"
  >("site");

  // Hierarchy breakdown by level
  const [siteId, setSiteId] = useState<string>("");
  const [buildingId, setBuildingId] = useState<string>("");
  const [floorId, setFloorId] = useState<string>("");
  const [zoneId, setZoneId] = useState<string>("");
  const [roomId, setRoomId] = useState<string>("");

  // Derived: computed hierarchy object
  const locationHierarchy = {
    site: siteId ? { id: siteId, name: `Site ${siteId}` } : null,
    building: buildingId
      ? { id: buildingId, name: `Building ${buildingId}` }
      : null,
    floor: floorId ? { id: floorId, name: `Floor ${floorId}` } : null,
    zone: zoneId ? { id: zoneId, name: `Zone ${zoneId}` } : null,
    room: roomId ? { id: roomId, name: `Room ${roomId}` } : null,
  };

  // Module gate: space module must be enabled
  const spaceEnabled = enabledModules?.includes("space") ?? true; // back-compat

  // If space module is not enabled, lock location to empty
  if (!spaceEnabled) {
    setCurrentLocationId("");
    setLocationLevel("site");
    setSiteId("");
    setBuildingId("");
    setFloorId("");
    setZoneId("");
    setRoomId("");
  }

  // --- Public API ---

  /**
   * Set the current location by ID.
   * Accepts any level ID; the level is inferred from the ID's prefix
   * or can be explicitly provided.
   */
  const setLocationId = (id: string, level?: "site" | "building" | "floor" | "zone" | "room") => {
    setCurrentLocationId(id);
    setLocationLevel(level ?? "site");

    // Update hierarchical state based on level
    switch (level ?? "site") {
      case "site":
        setSiteId(id);
        setBuildingId("");
        setFloorId("");
        setZoneId("");
        setRoomId("");
        break;
      case "building":
        setSiteId(id);
        setBuildingId(id);
        setFloorId("");
        setZoneId("");
        setRoomId("");
        break;
      case "floor":
        setBuildingId(id);
        setFloorId(id);
        setZoneId("");
        setRoomId("");
        break;
      case "zone":
        setFloorId(id);
        setZoneId(id);
        setRoomId("");
        break;
      case "room":
        setZoneId(id);
        setRoomId(id);
        break;
    }
  };

  /**
   * Reset location to defaults (site level, no ID)
   */
  const resetLocation = () => {
    setCurrentLocationId("");
    setLocationLevel("site");
    setSiteId("");
    setBuildingId("");
    setFloorId("");
    setZoneId("");
    setRoomId("");
  };

  // --- Level-specific getters ---

  const getSiteId = (): string => siteId;
  const getBuildingId = (): string => buildingId;
  const getFloorId = (): string => floorId;
  const getZoneId = (): string => zoneId;
  const getRoomId = (): string => roomId;
  const getCurrentLocationId = (): string => currentLocationId;

  const isSiteSelected = (): boolean => siteId !== "";
  const isBuildingSelected = (): boolean => buildingId !== "";
  const isFloorSelected = (): boolean => floorId !== "";
  const isZoneSelected = (): boolean => zoneId !== "";
  const isRoomSelected = (): boolean => roomId !== "";

  // i18n labels (simple string keys; callers use t() as needed)
  const levelLabels = {
    site: "Site",
    building: "Building",
    floor: "Floor",
    zone: "Zone",
    room: "Room",
  };

  return {
    // State
    currentLocationId,
    locationLevel,
    siteId,
    buildingId,
    floorId,
    zoneId,
    roomId,
    locationHierarchy,

    // Actions
    setLocationId,
    resetLocation,

    // Getters
    getSiteId,
    getBuildingId,
    getFloorId,
    getZoneId,
    getRoomId,
    getCurrentLocationId,

    // Selection state
    isSiteSelected,
    isBuildingSelected,
    isFloorSelected,
    isZoneSelected,
    isRoomSelected,

    // Module gate
    spaceEnabled,

    // i18n labels
    levelLabels,
  };
}