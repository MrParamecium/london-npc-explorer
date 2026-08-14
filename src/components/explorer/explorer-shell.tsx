"use client";

import dynamic from "next/dynamic";
import type { CSSProperties, FormEvent, MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Clock3,
  Coffee,
  Crosshair,
  GraduationCap,
  HeartPulse,
  History,
  Landmark,
  LoaderCircle,
  MapPin,
  MessageSquareText,
  ShoppingBag,
  Sparkles,
  TrainFront,
  Trees,
} from "lucide-react";

import type {
  Coordinates,
  NearbyPlaceCategory,
  ResolvedLocation,
} from "@/lib/location/contracts";
import type { ProviderMode } from "@/lib/providers/provider-mode";

import { NpcDialogue } from "./npc-dialogue";
import { NpcHistory } from "./npc-history";
import { NpcProfile } from "./npc-profile";
import { useNpcGeneration } from "./use-npc-generation";
import { useLocationResolution } from "./use-location-resolution";

const GoogleMap = dynamic(() => import("./google-map"), {
  ssr: false,
  loading: () => (
    <div className="google-map-shell">
      <p className="map-load-status" role="status">
        Loading map...
      </p>
    </div>
  ),
});

export type ExplorerResumeRequest = {
  id: string;
  coordinates: Coordinates;
};

type ExplorerAuthentication = {
  status: "loading" | "signed_out" | "synchronizing" | "ready";
  error: string | null;
  requestGenerationSignIn: (coordinates: Coordinates) => void;
  requestAccountSignIn: () => void;
  accountControl: ReactNode;
  resumeRequest: ExplorerResumeRequest | null;
  clearResumeRequest: () => void;
};

const INITIAL_COORDINATES: Coordinates = {
  latitude: 51.5202,
  longitude: -0.0979,
};

const GREATER_LONDON_BOUNDS = {
  north: 51.705,
  south: 51.28,
  east: 0.334,
  west: -0.51,
};

const PLACE_CATEGORY_ICONS = {
  food: Coffee,
  retail: ShoppingBag,
  transit: TrainFront,
  education: GraduationCap,
  healthcare: HeartPulse,
  park: Trees,
  culture_community: Landmark,
} satisfies Record<NearbyPlaceCategory, typeof Coffee>;

const generationCopy = {
  profile: "Sampling local profile",
  portrait: "Generating portrait",
  persistence: "Saving encounter",
} as const;

function getAreaName(
  result: ResolvedLocation | null,
  status: ReturnType<typeof useLocationResolution>["status"],
) {
  if (!result) {
    return status === "resolving" ? "Resolving location" : "Selected point";
  }

  if (!result.supported) return "Outside Greater London";
  return (
    result.address?.neighbourhood ??
    result.geography.ward?.name ??
    result.geography.borough.name
  );
}

function getAreaContext(result: ResolvedLocation | null) {
  if (!result) return "Location details not resolved";
  if (!result.supported) return "This coordinate is outside V1 coverage.";
  return (
    result.address?.formatted ??
    [result.geography.ward?.name, result.geography.borough.name]
      .filter(Boolean)
      .join(" / ")
  );
}

function pinPosition({ latitude, longitude }: Coordinates): CSSProperties {
  const x =
    ((longitude - GREATER_LONDON_BOUNDS.west) /
      (GREATER_LONDON_BOUNDS.east - GREATER_LONDON_BOUNDS.west)) *
    100;
  const y =
    ((GREATER_LONDON_BOUNDS.north - latitude) /
      (GREATER_LONDON_BOUNDS.north - GREATER_LONDON_BOUNDS.south)) *
    100;

  return {
    "--pin-x": `${Math.min(92, Math.max(8, x))}%`,
    "--pin-y": `${Math.min(88, Math.max(12, y))}%`,
  } as CSSProperties;
}

export function ExplorerShell({
  providerMode,
  googleMapsBrowserKey,
  authentication,
  locationFetch,
  npcFetch,
  dialogueFetch,
}: {
  providerMode: ProviderMode;
  googleMapsBrowserKey?: string;
  authentication?: ExplorerAuthentication;
  locationFetch?: typeof fetch;
  npcFetch?: typeof fetch;
  dialogueFetch?: typeof fetch;
}) {
  const [latitude, setLatitude] = useState(
    INITIAL_COORDINATES.latitude.toString(),
  );
  const [longitude, setLongitude] = useState(
    INITIAL_COORDINATES.longitude.toString(),
  );
  const [coordinates, setCoordinates] = useState(INITIAL_COORDINATES);
  const [coordinateError, setCoordinateError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const lastResumeRequestRef = useRef<string | null>(null);
  const location = useLocationResolution(locationFetch);
  const resolveLocation = location.resolve;
  const npcGeneration = useNpcGeneration(npcFetch);
  const generateProfile = npcGeneration.generate;
  const resetProfileForLocation = npcGeneration.resetForLocation;

  const mapStyle = useMemo(() => pinPosition(coordinates), [coordinates]);
  const resolvedLocation = location.result;
  const areaName = getAreaName(resolvedLocation, location.status);
  const areaContext = getAreaContext(resolvedLocation);

  const hasPrivateAccess = !authentication || authentication.status === "ready";

  useEffect(() => {
    const request = authentication?.resumeRequest;
    if (!request || lastResumeRequestRef.current === request.id) return;

    lastResumeRequestRef.current = request.id;
    setLatitude(request.coordinates.latitude.toString());
    setLongitude(request.coordinates.longitude.toString());
    setCoordinates(request.coordinates);
    setCoordinateError(null);
    void resolveLocation(request.coordinates);
    void generateProfile(request.coordinates);
    authentication.clearResumeRequest();
  }, [authentication, generateProfile, resolveLocation]);

  const selectCoordinates = useCallback(
    async (nextCoordinates: Coordinates) => {
      setLatitude(nextCoordinates.latitude.toFixed(6));
      setLongitude(nextCoordinates.longitude.toFixed(6));
      setCoordinates(nextCoordinates);
      setCoordinateError(null);
      resetProfileForLocation();
      await resolveLocation(nextCoordinates);
    },
    [resetProfileForLocation, resolveLocation],
  );

  function handleLocate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextCoordinates = {
      latitude: Number(latitude),
      longitude: Number(longitude),
    };

    if (
      !Number.isFinite(nextCoordinates.latitude) ||
      !Number.isFinite(nextCoordinates.longitude) ||
      nextCoordinates.latitude < -90 ||
      nextCoordinates.latitude > 90 ||
      nextCoordinates.longitude < -180 ||
      nextCoordinates.longitude > 180
    ) {
      setCoordinateError("Enter a valid latitude and longitude.");
      return;
    }

    void selectCoordinates(nextCoordinates);
  }

  const handleMapSelect = useCallback(
    (nextCoordinates: Coordinates) => {
      void selectCoordinates(nextCoordinates);
    },
    [selectCoordinates],
  );

  function handleMockMapClick(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width),
    );
    const y = Math.min(
      1,
      Math.max(0, (event.clientY - rect.top) / rect.height),
    );
    handleMapSelect({
      latitude:
        GREATER_LONDON_BOUNDS.north -
        y * (GREATER_LONDON_BOUNDS.north - GREATER_LONDON_BOUNDS.south),
      longitude:
        GREATER_LONDON_BOUNDS.west +
        x * (GREATER_LONDON_BOUNDS.east - GREATER_LONDON_BOUNDS.west),
    });
  }

  function generateNpc() {
    if (!hasPrivateAccess) {
      if (authentication?.status === "signed_out") {
        authentication.requestGenerationSignIn(coordinates);
      }
      return;
    }

    void generateProfile(coordinates);
  }

  function generateAnother() {
    if (!hasPrivateAccess) {
      if (authentication?.status === "signed_out") {
        authentication.requestGenerationSignIn(coordinates);
      }
      return;
    }

    void generateProfile(coordinates);
  }

  async function restoreEncounter(npcId: string) {
    if (!hasPrivateAccess) {
      if (authentication?.status === "signed_out") {
        authentication.requestAccountSignIn();
      }
      return;
    }

    const reopened = await npcGeneration.reopen(npcId);
    if (reopened) setHistoryOpen(false);
  }

  const isGenerating = npcGeneration.state === "generating";
  const generationFailed = npcGeneration.state === "error";
  const isReady = npcGeneration.npc !== null;
  const isAuthenticationPending =
    authentication?.status === "loading" ||
    authentication?.status === "synchronizing";
  const isResolvingLocation = location.status === "resolving";
  const locationUnsupported =
    location.status === "unsupported" ||
    (resolvedLocation !== null && !resolvedLocation.supported);
  const nearbyPlaces =
    resolvedLocation?.supported === true ? resolvedLocation.nearbyPlaces : [];

  const locationStatus = {
    idle: { label: "Ready to locate", icon: Check },
    resolving: { label: "Resolving location", icon: LoaderCircle },
    ready: { label: "Location resolved", icon: Check },
    partial: { label: "Partial location", icon: AlertCircle },
    unsupported: { label: "Outside Greater London", icon: AlertCircle },
    error: { label: "Lookup failed", icon: AlertCircle },
  }[location.status];
  const LocationStatusIcon = locationStatus.icon;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <MapPin size={17} strokeWidth={2.2} />
          </span>
          <div>
            <h1>London NPC Atlas</h1>
            <p>Greater London / V1</p>
          </div>
        </div>
        <div className="topbar-status" aria-label="Current coordinate">
          <span className="status-dot" />
          <span>
            {coordinates.latitude.toFixed(4)},{" "}
            {coordinates.longitude.toFixed(4)}
          </span>
        </div>
        <div className="topbar-actions">
          <button
            className="history-button"
            type="button"
            title="NPC history"
            aria-expanded={historyOpen}
            onClick={() => {
              if (hasPrivateAccess) {
                setHistoryOpen((current) => {
                  const next = !current;
                  if (next && npcGeneration.historyState === "idle") {
                    void npcGeneration.loadHistory();
                  }
                  return next;
                });
              } else if (authentication?.status === "signed_out") {
                authentication.requestAccountSignIn();
              }
            }}
          >
            <History size={17} />
            <span>History</span>
          </button>
          {authentication?.accountControl}
        </div>
      </header>

      {historyOpen ? (
        <NpcHistory
          items={npcGeneration.history}
          state={npcGeneration.historyState}
          error={npcGeneration.historyError}
          hasMore={npcGeneration.nextCursor !== null}
          onSelect={(npcId) => void restoreEncounter(npcId)}
          onLoadMore={() => void npcGeneration.loadHistory({ append: true })}
        />
      ) : null}

      <main className="workbench">
        <aside className="location-rail" aria-labelledby="location-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">01 / Location</p>
              <h2 id="location-heading">Set coordinates</h2>
            </div>
            <Crosshair size={18} aria-hidden="true" />
          </div>

          <form className="coordinate-form" onSubmit={handleLocate}>
            <label>
              <span>Latitude</span>
              <input
                aria-label="Latitude"
                inputMode="decimal"
                value={latitude}
                onChange={(event) => setLatitude(event.target.value)}
              />
            </label>
            <label>
              <span>Longitude</span>
              <input
                aria-label="Longitude"
                inputMode="decimal"
                value={longitude}
                onChange={(event) => setLongitude(event.target.value)}
              />
            </label>
            <button
              className="secondary-button locate-button"
              type="submit"
              disabled={isResolvingLocation}
            >
              {isResolvingLocation ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Crosshair size={16} />
              )}
              {isResolvingLocation ? "Locating" : "Locate"}
            </button>
            {coordinateError ? (
              <p className="form-error" role="alert">
                {coordinateError}
              </p>
            ) : null}
            {location.error ? (
              <p className="form-error" role="alert">
                {location.error}
              </p>
            ) : null}
          </form>

          <div
            className={`location-summary ${location.stale ? "is-stale" : ""}`}
            aria-busy={isResolvingLocation}
          >
            <div className={`summary-status status-${location.status}`}>
              <LocationStatusIcon
                className={isResolvingLocation ? "spin" : undefined}
                size={14}
                aria-hidden="true"
              />
              {locationStatus.label}
            </div>
            <h3>{areaName}</h3>
            <p>{areaContext}</p>
            <dl>
              {resolvedLocation?.supported ? (
                <>
                  <div>
                    <dt>LSOA</dt>
                    <dd>{resolvedLocation.geography.lsoa.name}</dd>
                  </div>
                  <div>
                    <dt>Ward</dt>
                    <dd>{resolvedLocation.geography.ward?.name ?? "None"}</dd>
                  </div>
                  <div>
                    <dt>Borough</dt>
                    <dd>{resolvedLocation.geography.borough.name}</dd>
                  </div>
                </>
              ) : null}
              <div>
                <dt>Time zone</dt>
                <dd>Europe/London</dd>
              </div>
              <div>
                <dt>Dataset</dt>
                <dd>
                  {resolvedLocation?.provenance.geographyDatasets.at(-1) ??
                    "Official London boundaries"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="data-note">
            <Clock3 size={15} aria-hidden="true" />
            <p>
              {resolvedLocation?.supported
                ? `${nearbyPlaces.length} nearby places resolved for local context.`
                : "Profile evidence resolves from LSOA to London fallback."}
            </p>
          </div>

          {nearbyPlaces.length > 0 ? (
            <div className="nearby-list" aria-label="Nearby places">
              <p className="eyebrow">Nearby</p>
              <ul>
                {nearbyPlaces.map((place) => {
                  const CategoryIcon = PLACE_CATEGORY_ICONS[place.category];
                  return (
                    <li key={place.placeId}>
                      <CategoryIcon size={14} aria-hidden="true" />
                      <span>
                        <strong>{place.name}</strong>
                        <small>{place.primaryType.replaceAll("_", " ")}</small>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </aside>

        <section className="map-workspace" aria-labelledby="map-heading">
          <div className="map-toolbar">
            <div>
              <p className="eyebrow">02 / Scene</p>
              <h2 id="map-heading">{areaName}</h2>
            </div>
            <div className="map-mode" aria-label="Map mode">
              <span className="active">Map</span>
              <span>Street</span>
            </div>
          </div>

          {googleMapsBrowserKey ? (
            <GoogleMap
              apiKey={googleMapsBrowserKey}
              coordinates={coordinates}
              nearbyPlaces={nearbyPlaces}
              onSelect={handleMapSelect}
            />
          ) : (
            <div
              className="map-canvas mock-map-canvas"
              style={mapStyle}
              aria-label={`Clickable map preview at ${coordinates.latitude.toFixed(4)}, ${coordinates.longitude.toFixed(4)}`}
              onClick={handleMockMapClick}
            >
              <div className="map-block block-a" />
              <div className="map-block block-b" />
              <div className="map-block block-c" />
              <div className="map-block block-d" />
              <div className="map-road road-a" />
              <div className="map-road road-b" />
              <div className="map-road road-c" />
              <div className="map-road road-d" />
              <div className="map-green" aria-label="Public green space" />
              <span className="street-label label-a">Goswell Road</span>
              <span className="street-label label-b">Clerkenwell Road</span>
              <span className="street-label label-c">Aldersgate Street</span>
              <span className="district-label">BARBICAN</span>
              <span className="district-label district-label-two">
                FARRINGDON
              </span>
              {nearbyPlaces.map((place) => (
                <span
                  className={`map-place-pin category-${place.category}`}
                  style={pinPosition(place.coordinates)}
                  title={`${place.name}: ${place.primaryType.replaceAll("_", " ")}`}
                  key={place.placeId}
                />
              ))}
              <div className="map-pin" aria-hidden="true">
                <span />
              </div>
              <div className="coordinate-plate">
                <MapPin size={15} />
                <div>
                  <strong>Selected point</strong>
                  <span>
                    {coordinates.latitude.toFixed(4)},{" "}
                    {coordinates.longitude.toFixed(4)}
                  </span>
                </div>
              </div>
              {isResolvingLocation ? (
                <div className="map-resolving" role="status">
                  <LoaderCircle className="spin" size={18} />
                  Resolving
                </div>
              ) : null}
              <p className="map-attribution">Local preview / mock mode</p>
            </div>
          )}
        </section>

        <aside className="npc-rail" aria-labelledby="npc-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">03 / Encounter</p>
              <h2 id="npc-heading">Local character</h2>
            </div>
            <MessageSquareText size={18} aria-hidden="true" />
          </div>

          {!isReady ? (
            <div className="npc-empty">
              <div
                className={`portrait-stage ${isGenerating ? "is-loading" : ""}`}
              >
                <span className="portrait-ring" />
                <span className="portrait-silhouette" />
                {isGenerating ? (
                  <LoaderCircle className="spin" size={24} aria-hidden="true" />
                ) : (
                  <Sparkles size={22} aria-hidden="true" />
                )}
              </div>
              <div className="empty-copy">
                <h3>
                  {isGenerating ? "Creating the encounter" : "No one here yet"}
                </h3>
                <p>
                  {isGenerating
                    ? generationCopy[npcGeneration.stage]
                    : "Generate one fictional character from the selected coordinate's local distributions."}
                </p>
              </div>
              <button
                className="primary-button"
                type="button"
                onClick={generateNpc}
                disabled={
                  isGenerating || isAuthenticationPending || locationUnsupported
                }
                aria-label={
                  locationUnsupported
                    ? "Outside V1 coverage"
                    : isGenerating
                      ? "Building profile"
                      : isAuthenticationPending
                        ? "Connecting account"
                        : generationFailed
                          ? "Generate again"
                          : "Generate NPC"
                }
              >
                {isGenerating || isAuthenticationPending ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Sparkles size={17} />
                )}
                {locationUnsupported
                  ? "Outside V1 coverage"
                  : isGenerating
                    ? "Building profile"
                    : isAuthenticationPending
                      ? "Connecting account"
                      : generationFailed
                        ? "Generate again"
                        : "Generate NPC"}
              </button>
              {authentication?.status === "synchronizing" ? (
                <p className="auth-inline-status" role="status">
                  Connecting your account...
                </p>
              ) : null}
              {authentication?.error ? (
                <p className="form-error auth-inline-status" role="alert">
                  {authentication.error}
                </p>
              ) : null}
              {npcGeneration.error ? (
                <p className="form-error auth-inline-status" role="alert">
                  {npcGeneration.error}
                </p>
              ) : null}
            </div>
          ) : npcGeneration.npc ? (
            <NpcProfile
              npc={npcGeneration.npc}
              isGenerating={isGenerating}
              generationStage={npcGeneration.stage}
              generationError={npcGeneration.error}
              onGenerateAnother={generateAnother}
            />
          ) : null}

          {npcGeneration.npc ? (
            <NpcDialogue
              key={npcGeneration.npc.npcId}
              npcId={npcGeneration.npc.npcId}
              npcName={
                npcGeneration.npc.canonicalProfile.identity.fictionalName
              }
              fetchImpl={dialogueFetch}
            />
          ) : null}

          <span className="provider-indicator">
            {providerMode === "mock" ? "Mock providers" : "Live providers"}
          </span>
        </aside>
      </main>
    </div>
  );
}
