# London NPC Atlas Architecture

The location path, statistically grounded NPC generation, portrait generation,
and persistent agent chat are implemented. Street View remains a later loop
behind the same API boundary.

```mermaid
flowchart LR
    USER["Public browser"] --> UI["Next.js Explorer Workbench"]
    USER --> CLERK["Clerk email / Google login"]

    UI --> MAP{"Google browser key?"}
    MAP -->|"No"| MOCKMAP["Clickable local 2D preview"]
    MAP -->|"Yes + live mode"| GMAP["Google Maps JavaScript"]

    UI --> LOCAPI["POST /api/locations/resolve"]
    LOCAPI --> LIMIT["Validation + per-client/global throttle"]
    LIMIT --> POSTGIS["Neon PostGIS London boundary check"]
    POSTGIS -->|"Outside London"| UI
    POSTGIS -->|"Inside London"| PROVIDER{"Provider mode"}
    PROVIDER -->|"Mock"| MOCKLOC["Deterministic address + places"]
    PROVIDER -->|"Live"| GOOGLE["Google Geocoding v4 + Places New"]
    MOCKLOC --> LOCAPI
    GOOGLE --> LOCAPI

    UI --> GENERATE["Authenticated NPC generation orchestrator"]
    GENERATE --> STATS["Versioned ONS / GLA / ASHE statistics"]
    STATS --> PROFILE["Locked statistical profile"]
    PROFILE --> IMAGE["OpenRouter + GPT Image 2 portrait"]
    IMAGE --> BLOB["Vercel Blob"]
    BLOB --> DB["Atomic full NPC persistence"]
    DB --> UI

    UI --> CHAT["NPC chat API"]
    CHAT --> KIMI["Kimi K3 official API"]
    CHAT --> DB
    UI -. "Later scene loop" .-> STREET["Google Street View 2D / 360"]
```

Solid arrows are working in the current loop. The dotted Street View arrow is a
planned provider boundary already represented in the V1 design.

The portrait path makes one paid image request per NPC. The API validates one
PNG, JPEG, or WebP image, stores it under an immutable non-PII Blob path, then
commits the complete profile and portrait URL together. If persistence fails
after upload, the orphaned Blob is deleted once.
