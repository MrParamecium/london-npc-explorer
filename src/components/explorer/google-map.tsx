"use client";

import { useEffect, useRef, useState } from "react";

import type { Coordinates, NearbyPlace } from "@/lib/location/contracts";

type GoogleMapsLoader = typeof import("@googlemaps/js-api-loader");

type GoogleMapProps = {
  apiKey: string;
  coordinates: Coordinates;
  loadMapsApi?: () => Promise<GoogleMapsLoader>;
  mode: "map" | "street";
  nearbyPlaces: NearbyPlace[];
  onSelect: (coordinates: Coordinates) => void;
};

let configuredKey: string | null = null;

type StreetViewMatch = {
  heading: number;
  pano: string;
};

type StreetViewState = "idle" | "loading" | "ready" | "unavailable" | "error";

function coordinateCacheKey({ latitude, longitude }: Coordinates) {
  return `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

function getMapsErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function loadDefaultMapsApi() {
  return import("@googlemaps/js-api-loader");
}

export default function GoogleMap({
  apiKey,
  coordinates,
  loadMapsApi = loadDefaultMapsApi,
  mode,
  nearbyPlaces,
  onSelect,
}: GoogleMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const streetViewContainerRef = useRef<HTMLDivElement>(null);
  const initialCoordinatesRef = useRef(coordinates);
  const mapRef = useRef<google.maps.Map | null>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const streetViewCacheRef = useRef<Map<string, StreetViewMatch | null>>(
    new Map(),
  );
  const markerConstructorRef = useRef<
    typeof google.maps.marker.AdvancedMarkerElement | null
  >(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [streetViewState, setStreetViewState] =
    useState<StreetViewState>("idle");

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let active = true;
    let clickListener: google.maps.MapsEventListener | null = null;

    async function initializeMap() {
      try {
        const { importLibrary, setOptions } = await loadMapsApi();
        if (!configuredKey) {
          setOptions({
            key: apiKey,
            v: "weekly",
            language: "en",
            region: "GB",
            authReferrerPolicy: "origin",
          });
          configuredKey = apiKey;
        }

        const [{ Map }, { AdvancedMarkerElement }] = await Promise.all([
          importLibrary("maps"),
          importLibrary("marker"),
        ]);
        if (!active || !mapContainerRef.current) return;

        const map = new Map(mapContainerRef.current, {
          center: {
            lat: initialCoordinatesRef.current.latitude,
            lng: initialCoordinatesRef.current.longitude,
          },
          zoom: 16,
          mapId: "DEMO_MAP_ID",
          clickableIcons: false,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
        });
        clickListener = map.addListener(
          "click",
          (event: google.maps.MapMouseEvent) => {
            const selected = event.latLng?.toJSON();
            if (selected) {
              onSelectRef.current({
                latitude: selected.lat,
                longitude: selected.lng,
              });
            }
          },
        );
        mapRef.current = map;
        markerConstructorRef.current = AdvancedMarkerElement;
        setReady(true);
      } catch {
        if (active) setLoadError(true);
      }
    }

    void initializeMap();
    return () => {
      active = false;
      clickListener?.remove();
      markersRef.current.forEach((marker) => {
        marker.map = null;
      });
      markersRef.current = [];
      panoramaRef.current?.setVisible(false);
      panoramaRef.current = null;
      mapRef.current = null;
    };
  }, [apiKey, loadMapsApi]);

  useEffect(() => {
    const map = mapRef.current;
    const AdvancedMarkerElement = markerConstructorRef.current;
    if (!ready || !map || !AdvancedMarkerElement) return;

    map.setCenter({ lat: coordinates.latitude, lng: coordinates.longitude });
    markersRef.current.forEach((marker) => {
      marker.map = null;
    });

    const selectedMarker = new AdvancedMarkerElement({
      map,
      position: { lat: coordinates.latitude, lng: coordinates.longitude },
      title: "Selected point",
      zIndex: 100,
    });
    const nearbyMarkers = nearbyPlaces.map(
      (place) =>
        new AdvancedMarkerElement({
          map,
          position: {
            lat: place.coordinates.latitude,
            lng: place.coordinates.longitude,
          },
          title: `${place.name} (${place.primaryType.replaceAll("_", " ")})`,
        }),
    );
    markersRef.current = [selectedMarker, ...nearbyMarkers];
  }, [coordinates.latitude, coordinates.longitude, nearbyPlaces, ready]);

  useEffect(() => {
    if (mode !== "street") return;

    let active = true;
    const cacheKey = coordinateCacheKey(coordinates);

    async function loadStreetView() {
      const cached = streetViewCacheRef.current.get(cacheKey);
      if (streetViewCacheRef.current.has(cacheKey) && cached === null) {
        setStreetViewState("unavailable");
        return;
      }

      setStreetViewState("loading");

      try {
        const { importLibrary, setOptions } = await loadMapsApi();
        if (!configuredKey) {
          setOptions({
            key: apiKey,
            v: "weekly",
            language: "en",
            region: "GB",
            authReferrerPolicy: "origin",
          });
          configuredKey = apiKey;
        }

        const {
          StreetViewPanorama,
          StreetViewPreference,
          StreetViewService,
          StreetViewSource,
        } = await importLibrary("streetView");
        if (!active || !streetViewContainerRef.current) return;

        let match = cached;
        if (!match) {
          const response = await new StreetViewService().getPanorama({
            location: {
              lat: coordinates.latitude,
              lng: coordinates.longitude,
            },
            preference: StreetViewPreference.NEAREST,
            radius: 100,
            sources: [StreetViewSource.GOOGLE, StreetViewSource.OUTDOOR],
          });
          const pano = response.data.location?.pano;
          if (!pano) {
            streetViewCacheRef.current.set(cacheKey, null);
            if (active) setStreetViewState("unavailable");
            return;
          }
          match = {
            pano,
            heading: response.data.tiles.centerHeading,
          };
          streetViewCacheRef.current.set(cacheKey, match);
        }

        if (!active || !streetViewContainerRef.current) return;

        if (panoramaRef.current) {
          panoramaRef.current.setPano(match.pano);
          panoramaRef.current.setPov({ heading: match.heading, pitch: 0 });
          panoramaRef.current.setVisible(true);
        } else {
          panoramaRef.current = new StreetViewPanorama(
            streetViewContainerRef.current,
            {
              addressControl: true,
              clickToGo: true,
              fullscreenControl: true,
              linksControl: true,
              motionTracking: false,
              motionTrackingControl: false,
              pano: match.pano,
              panControl: true,
              pov: { heading: match.heading, pitch: 0 },
              scrollwheel: true,
              showRoadLabels: true,
              visible: true,
              zoom: 1,
              zoomControl: true,
            },
          );
        }
        setStreetViewState("ready");
      } catch (error) {
        if (!active) return;
        if (getMapsErrorCode(error) === "ZERO_RESULTS") {
          streetViewCacheRef.current.set(cacheKey, null);
          setStreetViewState("unavailable");
          return;
        }
        setStreetViewState("error");
      }
    }

    void loadStreetView();
    return () => {
      active = false;
    };
  }, [apiKey, coordinates, loadMapsApi, mode]);

  return (
    <div className="google-map-shell">
      <div
        className={`google-map-host ${mode === "map" ? "is-visible" : "is-hidden"}`}
        ref={mapContainerRef}
        aria-hidden={mode !== "map"}
        aria-label={`Interactive Google map at ${coordinates.latitude.toFixed(4)}, ${coordinates.longitude.toFixed(4)}`}
      />
      <div
        className={`google-map-host ${mode === "street" ? "is-visible" : "is-hidden"}`}
        ref={streetViewContainerRef}
        aria-hidden={mode !== "street"}
        aria-label={`Interactive Google Street View near ${coordinates.latitude.toFixed(4)}, ${coordinates.longitude.toFixed(4)}`}
      />
      {mode === "map" && !ready && !loadError ? (
        <p className="map-load-status" role="status">
          Loading map...
        </p>
      ) : null}
      {mode === "map" && loadError ? (
        <p className="map-load-status map-load-error" role="alert">
          Google map is unavailable.
        </p>
      ) : null}
      {mode === "street" && streetViewState === "loading" ? (
        <p className="map-load-status" role="status">
          Finding nearby Street View...
        </p>
      ) : null}
      {mode === "street" && streetViewState === "unavailable" ? (
        <div className="street-view-empty" role="status">
          <strong>No Street View within 100 metres</strong>
          <span>Switch back to Map to keep exploring this coordinate.</span>
        </div>
      ) : null}
      {mode === "street" && streetViewState === "error" ? (
        <div className="street-view-empty" role="alert">
          <strong>Street View could not load</strong>
          <span>Switch back to Map and try this coordinate again later.</span>
        </div>
      ) : null}
    </div>
  );
}
