"use client";

import { useEffect, useRef, useState } from "react";

import type { Coordinates, NearbyPlace } from "@/lib/location/contracts";

type GoogleMapProps = {
  apiKey: string;
  coordinates: Coordinates;
  nearbyPlaces: NearbyPlace[];
  onSelect: (coordinates: Coordinates) => void;
};

let configuredKey: string | null = null;

export default function GoogleMap({
  apiKey,
  coordinates,
  nearbyPlaces,
  onSelect,
}: GoogleMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialCoordinatesRef = useRef(coordinates);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerConstructorRef = useRef<
    typeof google.maps.marker.AdvancedMarkerElement | null
  >(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let active = true;
    let clickListener: google.maps.MapsEventListener | null = null;

    async function initializeMap() {
      try {
        const { importLibrary, setOptions } =
          await import("@googlemaps/js-api-loader");
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
        if (!active || !containerRef.current) return;

        const map = new Map(containerRef.current, {
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
      mapRef.current = null;
    };
  }, [apiKey]);

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

  return (
    <div className="google-map-shell">
      <div
        className="google-map-host"
        ref={containerRef}
        aria-label={`Interactive Google map at ${coordinates.latitude.toFixed(4)}, ${coordinates.longitude.toFixed(4)}`}
      />
      {!ready && !loadError ? (
        <p className="map-load-status" role="status">
          Loading map...
        </p>
      ) : null}
      {loadError ? (
        <p className="map-load-status map-load-error" role="alert">
          Google map is unavailable.
        </p>
      ) : null}
    </div>
  );
}
