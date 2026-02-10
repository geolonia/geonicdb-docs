---
title: Demo App
description: Explore the Vela Demo App — interactive demos for dashboards, API tutorials, smart building management, and city maps powered by Vela OS.
outline: deep
---

# Demo App

The [Vela Demo App](https://github.com/geolonia/vela-demo-app) is a collection of interactive applications that showcase Vela OS capabilities. Built with React, Vite, and MapLibre GL JS, the demos cover real-world use cases from executive dashboards to geo-spatial city maps.

## Demo Applications

### Dashboard

**Audience**: Business stakeholders and decision makers

An executive summary view that aggregates data from Vela entities into actionable metrics.

- **KPI Cards** — Entity count, type distribution, location coverage, health status
- **Metric Aggregation** — Count, average, min, max per attribute across all entities
- **Type Breakdown** — Visual analysis of entity types in your tenant
- **Entity Table** — Sortable overview of all entities with key attributes
- **Mini Map** — Location-aware entities plotted on a map

### API Tutorial

**Audience**: Developers and evaluators

A guided, 5-step interactive walkthrough that teaches you the Vela API hands-on:

1. **CRUD Operations** — Create, read, update, delete entities
2. **Query Language** — Filter entities with the `q` parameter
3. **Geo-Spatial Queries** — Find entities near a location
4. **Subscriptions** — Set up change notifications
5. **AI Integration** — Interact with data through AI tools

Each step provides multi-language code samples (curl, JavaScript, Python) and lets you execute API calls directly in the browser.

### Smart Building

**Audience**: Facility managers and building operators

A building management interface demonstrating IoT sensor data visualization:

- **Floor-based Room Cards** — View conference rooms organized by floor
- **Environmental Metrics** — Temperature, humidity, CO2 with threshold alerts
- **Elevator Panel** — Real-time elevator status and floor tracking
- **Scenario Presets** — Switch between Normal, Overcrowded, and HVAC Failure states
- **Live Simulation** — Run simulations with adjustable speed to see real-time data changes
- **Inline Editing** — Modify entity attributes directly from the UI

### City Map

**Audience**: GIS engineers and smart city planners

A full-screen geographic interface for spatial data exploration:

- **Marker/Heatmap Toggle** — Switch between point markers and heatmap visualization
- **Spatial Query Tools** — Draw circles and polygons to query entities within an area
- **Query Result Overlay** — See matching entities with the generated curl command
- **Entity Panel** — Browse and filter entities by type
- **AI Chat** — Natural language queries powered by MCP, with tool call visualization

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| React 18 | UI framework |
| Vite 5 | Build tool and dev server |
| TailwindCSS 3 | Styling |
| MapLibre GL JS | Map rendering (via @geolonia/embed) |
| TanStack Query 5 | Server state management |
| TypeScript 5 | Type safety |

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- A running Vela instance (local or SaaS)

### Run Locally

```bash
# Clone the repository
git clone https://github.com/geolonia/vela-demo-app.git
cd vela-demo-app

# Install dependencies
pnpm install

# Set up environment variables
cp .env.sample .env
# Edit .env and add your Geolonia API key for map tiles

# Load demo data into Vela
./scripts/demo-data/setup.sh

# Start the development server
pnpm dev
```

Open `http://localhost:5173` to access the landing page.

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_GEOLONIA_API_KEY` | Geolonia Maps API key for map tiles | Yes |
| `VITE_VELA_URL` | Vela API URL (default: `http://localhost:3000`) | No |

### Demo Tenants

The setup script creates these pre-configured tenants:

| Tenant | Content |
|--------|---------|
| `smartcity` | Air quality sensors, parking spots, traffic flow (Tokyo area) |
| `smartbuilding` | Conference rooms, elevators |
| `shibuya` | Environmental sensors (Shibuya area) |
| `shinjuku` | Environmental sensors (Shinjuku area) |

## Architecture

```text
vela-demo-app/
├── packages/
│   ├── shared/              # Shared library
│   │   ├── src/api/         # VelaClient — type-safe API client
│   │   ├── src/types/       # NGSI entity types
│   │   ├── src/hooks/       # React hooks (useEntities, useGeoEntities)
│   │   └── src/components/  # VelaMap component
│   └── dashboard/           # Main demo app
│       ├── src/pages/       # Landing, Dashboard, Tutorial, SmartBuilding, CityMap
│       └── src/components/  # Page-specific components
├── e2e/                     # Playwright E2E tests
└── scripts/demo-data/       # Demo data setup
```

## Links

- **GitHub Repository**: [geolonia/vela-demo-app](https://github.com/geolonia/vela-demo-app)
- **Vela OS**: [geolonia/vela](https://github.com/geolonia/vela)
- **Geolonia Maps**: [geolonia.com](https://geolonia.com/)

## Next Steps

- [Quick Start](/en/introduction/quick-start) — Make your first API call
- API Reference — Full NGSIv2 API documentation
- AI Integration — Learn about MCP, llms.txt, and tools.json
