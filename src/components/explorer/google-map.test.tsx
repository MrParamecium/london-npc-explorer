import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import GoogleMap from "./google-map";

const mapsMocks = vi.hoisted(() => ({
  getPanorama: vi.fn(),
  importLibrary: vi.fn(),
  mapSetCenter: vi.fn(),
  panoramaConstructor: vi.fn(),
  panoramaSetPano: vi.fn(),
  panoramaSetPov: vi.fn(),
  panoramaSetVisible: vi.fn(),
  setOptions: vi.fn(),
}));

class FakeMap {
  addListener() {
    return { remove: vi.fn() };
  }

  setCenter = mapsMocks.mapSetCenter;
}

class FakeAdvancedMarkerElement {
  map: unknown;

  constructor(options: { map: unknown }) {
    this.map = options.map;
  }
}

class FakeStreetViewPanorama {
  constructor(container: HTMLElement, options: unknown) {
    mapsMocks.panoramaConstructor(container, options);
  }

  setPano = mapsMocks.panoramaSetPano;
  setPov = mapsMocks.panoramaSetPov;
  setVisible = mapsMocks.panoramaSetVisible;
}

class FakeStreetViewService {
  getPanorama = mapsMocks.getPanorama;
}

const coordinates = { latitude: 51.5202, longitude: -0.0979 };
const loadMapsApi = async () =>
  ({
    importLibrary: mapsMocks.importLibrary,
    setOptions: mapsMocks.setOptions,
  }) as unknown as typeof import("@googlemaps/js-api-loader");

describe("GoogleMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mapsMocks.importLibrary.mockImplementation(async (library: string) => {
      if (library === "maps") return { Map: FakeMap };
      if (library === "marker") {
        return { AdvancedMarkerElement: FakeAdvancedMarkerElement };
      }
      if (library === "streetView") {
        return {
          StreetViewPanorama: FakeStreetViewPanorama,
          StreetViewPreference: { NEAREST: "nearest" },
          StreetViewService: FakeStreetViewService,
          StreetViewSource: { GOOGLE: "google", OUTDOOR: "outdoor" },
        };
      }
      throw new Error(`Unexpected library: ${library}`);
    });
  });

  it("loads the nearest official outdoor panorama once per coordinate", async () => {
    mapsMocks.getPanorama.mockResolvedValue({
      data: {
        location: { pano: "pano-123" },
        tiles: { centerHeading: 135 },
      },
    });
    const { rerender } = render(
      <GoogleMap
        apiKey="browser-key"
        coordinates={coordinates}
        loadMapsApi={loadMapsApi}
        mode="street"
        nearbyPlaces={[]}
        onSelect={vi.fn()}
      />,
    );

    await waitFor(() => expect(mapsMocks.getPanorama).toHaveBeenCalledOnce());
    expect(mapsMocks.getPanorama).toHaveBeenCalledWith({
      location: { lat: 51.5202, lng: -0.0979 },
      preference: "nearest",
      radius: 100,
      sources: ["google", "outdoor"],
    });
    await waitFor(() =>
      expect(mapsMocks.panoramaConstructor).toHaveBeenCalledOnce(),
    );

    rerender(
      <GoogleMap
        apiKey="browser-key"
        coordinates={coordinates}
        loadMapsApi={loadMapsApi}
        mode="map"
        nearbyPlaces={[]}
        onSelect={vi.fn()}
      />,
    );
    rerender(
      <GoogleMap
        apiKey="browser-key"
        coordinates={coordinates}
        loadMapsApi={loadMapsApi}
        mode="street"
        nearbyPlaces={[]}
        onSelect={vi.fn()}
      />,
    );

    await waitFor(() => expect(mapsMocks.panoramaSetPano).toHaveBeenCalled());
    expect(mapsMocks.getPanorama).toHaveBeenCalledOnce();
  });

  it("shows a clear fallback when no panorama exists", async () => {
    mapsMocks.getPanorama.mockRejectedValue({ code: "ZERO_RESULTS" });

    render(
      <GoogleMap
        apiKey="browser-key"
        coordinates={coordinates}
        loadMapsApi={loadMapsApi}
        mode="street"
        nearbyPlaces={[]}
        onSelect={vi.fn()}
      />,
    );

    expect(
      await screen.findByText("No Street View within 100 metres"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Switch back to Map/)).toBeInTheDocument();
  });
});
