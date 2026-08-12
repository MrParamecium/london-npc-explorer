"use client";

import dynamic from "next/dynamic";
import type { CSSProperties, FormEvent, MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Banknote,
  BriefcaseBusiness,
  Check,
  Clock3,
  Coffee,
  Crosshair,
  GraduationCap,
  HeartPulse,
  History,
  Landmark,
  Languages,
  LoaderCircle,
  MapPin,
  MessageSquareText,
  SendHorizontal,
  Shirt,
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

import { useLocationResolution } from "./use-location-resolution";

const GoogleMap = dynamic(() => import("./google-map"), {
  ssr: false,
  loading: () => (
    <div className="map-load-status" role="status">
      Loading map...
    </div>
  ),
});

type ChatMessage = { id: number; role: "npc" | "user"; text: string };

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

const MOCK_NPCS = [
  {
    initials: "AO",
    name: "Amara Okafor",
    age: 31,
    occupation: "Museum programme coordinator",
    income: "GBP 38k-44k",
    languages: "English, conversational Igbo",
    clothing: "Olive field jacket, navy knit, worn leather tote",
    introduction:
      "I have ten minutes before the next school group arrives. What brings you this side of Clerkenwell?",
  },
  {
    initials: "TH",
    name: "Theo Harris",
    age: 46,
    occupation: "Independent bicycle mechanic",
    income: "GBP 32k-39k",
    languages: "English",
    clothing: "Charcoal overshirt, work trousers, weathered trainers",
    introduction:
      "The workshop is just closing, but I can point you toward the quieter route east if that helps.",
  },
] as const;

const PLACE_CATEGORY_ICONS = {
  food: Coffee,
  retail: ShoppingBag,
  transit: TrainFront,
  education: GraduationCap,
  healthcare: HeartPulse,
  park: Trees,
  culture_community: Landmark,
} satisfies Record<NearbyPlaceCategory, typeof Coffee>;

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
}: {
  providerMode: ProviderMode;
  googleMapsBrowserKey?: string;
  authentication?: ExplorerAuthentication;
  locationFetch?: typeof fetch;
}) {
  const [latitude, setLatitude] = useState(
    INITIAL_COORDINATES.latitude.toString(),
  );
  const [longitude, setLongitude] = useState(
    INITIAL_COORDINATES.longitude.toString(),
  );
  const [coordinates, setCoordinates] = useState(INITIAL_COORDINATES);
  const [coordinateError, setCoordinateError] = useState<string | null>(null);
  const [generationState, setGenerationState] = useState<
    "idle" | "generating" | "ready"
  >("idle");
  const [npcIndex, setNpcIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [history, setHistory] = useState<number[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const lastResumeRequestRef = useRef<string | null>(null);
  const location = useLocationResolution(locationFetch);
  const resolveLocation = location.resolve;

  const npc = MOCK_NPCS[npcIndex % MOCK_NPCS.length];
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
    setGenerationState("generating");
    setMessages([]);
    finishGeneration(npcIndex % MOCK_NPCS.length);
    authentication.clearResumeRequest();
  }, [authentication, npcIndex]);

  const selectCoordinates = useCallback(
    async (nextCoordinates: Coordinates) => {
      setLatitude(nextCoordinates.latitude.toFixed(6));
      setLongitude(nextCoordinates.longitude.toFixed(6));
      setCoordinates(nextCoordinates);
      setCoordinateError(null);
      setGenerationState("idle");
      setMessages([]);
      await resolveLocation(nextCoordinates);
    },
    [resolveLocation],
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

  function finishGeneration(index: number) {
    window.setTimeout(() => {
      setGenerationState("ready");
      setHistory((current) => [...current, index]);
      setMessages([
        {
          id: index * 100 + 1,
          role: "npc",
          text: MOCK_NPCS[index].introduction,
        },
      ]);
    }, 700);
  }

  function generateNpc() {
    if (!hasPrivateAccess) {
      if (authentication?.status === "signed_out") {
        authentication.requestGenerationSignIn(coordinates);
      }
      return;
    }

    setGenerationState("generating");
    setMessages([]);
    finishGeneration(npcIndex % MOCK_NPCS.length);
  }

  function generateAnother() {
    if (!hasPrivateAccess) {
      if (authentication?.status === "signed_out") {
        authentication.requestGenerationSignIn(coordinates);
      }
      return;
    }

    const nextIndex = (npcIndex + 1) % MOCK_NPCS.length;
    setNpcIndex(nextIndex);
    setGenerationState("generating");
    setMessages([]);
    finishGeneration(nextIndex);
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasPrivateAccess) {
      if (authentication?.status === "signed_out") {
        authentication.requestAccountSignIn();
      }
      return;
    }

    const text = draft.trim();
    if (!text) return;

    setMessages((current) => [
      ...current,
      { id: current.length + 1, role: "user", text },
      {
        id: current.length + 2,
        role: "npc",
        text: "Fair question. Around here, the answer changes from one street to the next. What exactly are you looking for?",
      },
    ]);
    setDraft("");
  }

  function restoreEncounter(index: number) {
    if (!hasPrivateAccess) {
      if (authentication?.status === "signed_out") {
        authentication.requestAccountSignIn();
      }
      return;
    }

    setNpcIndex(index);
    setGenerationState("ready");
    setMessages([
      {
        id: index * 100 + 1,
        role: "npc",
        text: MOCK_NPCS[index].introduction,
      },
    ]);
    setHistoryOpen(false);
  }

  const isGenerating = generationState === "generating";
  const isReady = generationState === "ready";
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
                setHistoryOpen((current) => !current);
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
        <div className="history-popover" aria-label="NPC history">
          <div className="history-popover-heading">
            <span>Encounter history</span>
            <span>{history.length}</span>
          </div>
          {history.length ? (
            <div className="history-list">
              {history.map((index, position) => (
                <button
                  type="button"
                  onClick={() => restoreEncounter(index)}
                  key={`${index}-${position}`}
                >
                  <span>{MOCK_NPCS[index].initials}</span>
                  <span>
                    <strong>{MOCK_NPCS[index].name}</strong>
                    <small>{MOCK_NPCS[index].occupation}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="history-empty">No saved encounters yet.</p>
          )}
        </div>
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
                    ? "Profile and portrait are being prepared together."
                    : "Generate a character for the selected coordinate."}
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
            </div>
          ) : (
            <div className="npc-profile">
              <div className="npc-identity">
                <div
                  className="portrait-mock"
                  aria-label={`Mock portrait for ${npc.name}`}
                >
                  <span>{npc.initials}</span>
                </div>
                <div>
                  <span className="profile-state">Available nearby</span>
                  <h3>{npc.name}</h3>
                  <p>{npc.occupation}</p>
                </div>
              </div>

              <div className="profile-facts">
                <div>
                  <Clock3 size={15} />
                  <span>{npc.age} years old</span>
                </div>
                <div>
                  <BriefcaseBusiness size={15} />
                  <span>{npc.occupation}</span>
                </div>
                <div>
                  <Banknote size={15} />
                  <span>{npc.income}</span>
                </div>
                <div>
                  <Languages size={15} />
                  <span>{npc.languages}</span>
                </div>
                <div>
                  <Shirt size={15} />
                  <span>{npc.clothing}</span>
                </div>
              </div>

              <div className="chat-log" aria-live="polite">
                {messages.map((message) => (
                  <p
                    className={`chat-message ${message.role}`}
                    key={message.id}
                  >
                    <span>{message.role === "npc" ? npc.name : "You"}</span>
                    {message.text}
                  </p>
                ))}
              </div>

              <form className="chat-form" onSubmit={sendMessage}>
                <label className="sr-only" htmlFor="chat-message">
                  Message {npc.name}
                </label>
                <input
                  id="chat-message"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Say something..."
                />
                <button
                  type="submit"
                  aria-label="Send message"
                  title="Send message"
                >
                  <SendHorizontal size={17} />
                </button>
              </form>

              <button
                className="secondary-button another-button"
                type="button"
                onClick={generateAnother}
              >
                <Sparkles size={16} />
                Generate another
              </button>
            </div>
          )}

          <span className="provider-indicator">
            {providerMode === "mock" ? "Mock providers" : "Live providers"}
          </span>
        </aside>
      </main>
    </div>
  );
}
