# GeonicDB Documentation

🇯🇵 [日本語版はこちら](README.ja.md)

## Overview

This repository hosts the official documentation for **GeonicDB**, a serverless FIWARE Orion-compatible Context Broker. The documentation site is built with VitePress and provides comprehensive guides, API references, and integration examples.

**GeonicDB** is a next-generation Context Broker that brings FIWARE standards to the serverless world:

- **AI-Native**: Built-in MCP server, llms.txt, tools.json, and OpenAPI 3.0 for seamless AI agent integration
- **Serverless**: Runs on AWS Lambda with auto-scaling and pay-per-use pricing
- **Dual API Support**: Both NGSIv2 and NGSI-LD on a single instance
- **Japan Standards Ready**: CADDE compatible with provenance tracking

🌐 **Live Documentation**: https://docs.geonicdb.com/

## Tech Stack

- **VitePress** 1.6.x - Static site generator for documentation
- **TypeScript** - Type-safe development
- **i18n** - English and Japanese language support
- **yuuhitsu** - AI-powered translation CLI

## Getting Started

### Prerequisites

- Node.js 20.x or higher
- pnpm 10.29.2 or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/geolonia/geonicdb-docs.git
cd geonicdb-docs

# Install dependencies
pnpm install
```

### Development

Start the development server:

```bash
pnpm docs:dev
```

The site will be available at http://localhost:5173

### Build

Build the static site for production:

```bash
pnpm docs:build
```

Preview the production build:

```bash
pnpm docs:preview
```

## Testing

### Unit Tests

Run unit tests with Vitest:

```bash
pnpm test          # Run all unit tests
pnpm test:unit     # Run unit tests only
```

### E2E Tests

Run end-to-end tests with Playwright:

```bash
pnpm test:e2e      # Run E2E tests
```

### All Tests

Run all tests (unit + E2E):

```bash
pnpm test:all
```

## Translation

The documentation is available in both English and Japanese. The **yuuhitsu** AI-powered translation CLI is integrated as a dev dependency for maintaining translation consistency.

To translate documents:

```bash
# Set up your API key in .env
ANTHROPIC_API_KEY=your_api_key_here

# Translate a specific English file to Japanese
pnpm translate:ja -- docs/en/path/to/file.md

# Translate a specific Japanese file to English
pnpm translate:en -- docs/ja/path/to/file.md
```

## Documentation Sync

### B-1: Upstream Repository Relationship

The documentation content originates from the upstream repository **[geolonia/geonicdb](https://github.com/geolonia/geonicdb)** (the main product repository). This `geonicdb-docs` repository is a separate VitePress site that renders and publishes those docs.

The sync script (`scripts/sync-geonicdb-docs.ts`) copies Markdown files from `geolonia/geonicdb/docs/` into `docs/en/` of this repository, adding VitePress frontmatter and rewriting internal links.

### B-2: Synced Pages vs. Custom Pages

Only files listed in the `MAPPING_TABLE` in `scripts/sync-geonicdb-docs.ts` are synced from the upstream repository. Files that are **not** in `MAPPING_TABLE` are skipped (logged as `SKIP (no mapping)`).

Pages under `docs/en/` that do not correspond to any upstream source file are **custom pages** maintained directly in this repository.

### B-3: How `pnpm sync-docs` Works

```bash
GEONICDB_REPO_PATH=/path/to/geonicdb pnpm sync-docs
```

1. Reads each `.md` file listed in `MAPPING_TABLE` from `GEONICDB_REPO_PATH/docs/` (exception: `CHANGELOG.md` is read from the repository root, not `docs/`)
2. Adds VitePress frontmatter (`title`, `description`, `outline: deep`)
3. Rewrites internal links (`./FILENAME.md` → relative path based on `MAPPING_TABLE`)
4. Writes the result to `docs/en/<dest>` as defined in `MAPPING_TABLE`
5. In CI, after sync, `yuuhitsu` translates `docs/en/` → `docs/ja/` automatically

### B-4: Adding a New Page to Sync

To include a new upstream Markdown file in the site, add an entry to `MAPPING_TABLE` in `scripts/sync-geonicdb-docs.ts`:

```ts
// scripts/sync-geonicdb-docs.ts
'NEW_FILE.md': [
  {
    dest: 'section/page-name.md',   // output path under docs/en/
    title: 'Page Title',
    description: 'Short description for SEO',
  },
],
```

After adding the entry, run `pnpm sync-docs` locally to verify the output, then commit and push. The CI workflow handles translation automatically.

## Project Structure

```
docs/
├── en/                         # English documentation
│   ├── introduction/          # Getting started guides
│   ├── core-concepts/         # Core concepts
│   ├── features/              # Feature guides
│   ├── api-reference/         # API documentation
│   ├── ai-integration/        # AI integration guides
│   ├── security/              # Security & authentication
│   ├── japan-standards/       # Japan standards (CADDE, etc.)
│   ├── migration/             # Migration guides
│   └── index.md               # English homepage
├── ja/                         # Japanese documentation
│   └── (same structure as en/)
└── .vitepress/
    ├── config/                 # VitePress configuration
    └── theme/                  # Custom theme
```

## Contributing

We welcome contributions! Please follow these guidelines:

1. **Create a branch** for your changes:
   ```bash
   git checkout -b feat/your-feature
   ```

2. **Never push directly to main** - Always create a pull request

3. **Run tests** before submitting:
   ```bash
   pnpm test:all
   ```

4. **CodeRabbit review** - Address all Actionable or higher issues from CodeRabbit

5. **Submit a PR** with a clear description of your changes

### Workflow

- All PRs must pass CI checks (unit tests + E2E tests)
- CodeRabbit will automatically review your PR
- At least one maintainer approval is required for merge

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm docs:dev` | Start development server |
| `pnpm docs:build` | Build for production |
| `pnpm docs:preview` | Preview production build |
| `pnpm test` | Run unit tests |
| `pnpm test:unit` | Run unit tests only |
| `pnpm test:e2e` | Run E2E tests |
| `pnpm test:all` | Run all tests |
| `pnpm sync-docs` | Sync documentation from external sources |
| `pnpm check-links` | Check for broken links |
| `pnpm translate` | Translate markdown files |
| `pnpm translate:ja` | Translate English docs to Japanese |
| `pnpm translate:en` | Translate Japanese docs to English |

## Learn More

- **GeonicDB Repository**: https://github.com/geolonia/geonicdb
- **FIWARE Orion**: https://fiware-orion.readthedocs.io/
- **NGSIv2 Specification**: https://fiware.github.io/specifications/ngsiv2/stable/
- **NGSI-LD Specification**: https://ngsi-ld.org
- **VitePress**: https://vitepress.dev/

## License

MIT License

Copyright (c) 2026 Geolonia Inc.

See [LICENSE](LICENSE) for details.
