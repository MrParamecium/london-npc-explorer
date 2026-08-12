# London NPC Atlas Architecture

The location path is implemented. NPC sampling, portrait generation, persistent
agent chat, and Street View remain later loops behind the same API boundary.

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

    UI -. "Authenticated next loop" .-> GENERATE["NPC generation orchestrator"]
    GENERATE -.-> STATS["Versioned ONS / GLA / ASHE statistics"]
    GENERATE -.-> DEEPSEEK["DeepSeek profile + dialogue"]
    GENERATE -.-> IMAGE["OpenRouter + GPT Image 2 portrait"]
    GENERATE -.-> DB["Neon NPC, job, chat, memory records"]
    IMAGE -.-> BLOB["Vercel Blob"]
    UI -. "Later scene loop" .-> STREET["Google Street View 2D / 360"]
```

Solid arrows are working in the current loop. Dotted arrows are planned provider
boundaries already represented in the V1 design and persistence model.
