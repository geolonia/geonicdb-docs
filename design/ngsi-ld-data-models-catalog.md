# Design: GeonicDB Data Models Catalog (`models.geonicdb.com`)

| | |
|---|---|
| Status | Draft for discussion |
| Date | 2026-09-17 |
| Author | Daniel Kastl |
| Decision needed | Domain name, hosting platform, repository name, licence |

## Summary

Provide a public, versioned, bilingual catalog of NGSI-LD data models for GeonicDB customers, hosted under a Geolonia-controlled domain. The catalog curates and localises [Smart Data Models](https://smartdatamodels.org/) for Japan, adds Japanese profiles where global models fall short, and adds Japan-only models derived from the Digital Agency's GIF and 推奨データセット. Machine-readable files (`@context`, JSON Schema, examples) are served from stable URLs that customers can reference from their entities. The site is generated from an open-source GitHub repository that accepts contributions, and it becomes the single source of truth for the data-model features already built into GeonicDB.

## Problem

- NGSI-LD only pays off when entity types and attributes are shared vocabulary. Customers who invent their own types lose interoperability with FIWARE tooling and with each other.
- Global Smart Data Models are documented in English, use Western address and identifier conventions, and are hard for Japanese customers to discover. The Japanese `spec_JA.md` files are machine translations without local guidance.
- Referencing third-party `@context` URLs (today: `raw.githubusercontent.com/smart-data-models/...`) makes customer data depend on infrastructure Geolonia does not control. A moved or edited context silently changes the meaning of stored data.
- GeonicDB already ships a hard-coded catalog of about 20 Smart Data Models in `src/core/smart-data-models/smart-data-models.data.ts`, used by the `data_models` MCP tool and by `@context` auto-completion. It has no Japanese models and can only change with a release.

## Goals

1. Stable, Geolonia-controlled URLs for `@context` files, JSON Schemas and type IRIs, with a written immutability policy.
2. A searchable catalog (Japanese first, English second) that helps customers find, understand and adopt a model.
3. Extend the global ecosystem, never fork it: reuse Smart Data Models IRIs wherever a model fits, and follow their file conventions so models can be contributed upstream.
4. Japanese coverage: profiles for address, municipality codes and dates, plus models for GIF / 推奨データセット datasets that municipalities already publish.
5. A machine-readable catalog index that GeonicDB, the console, the CLI and the MCP tool read at runtime.
6. Open repository with a clear contribution path.

## Non-goals

- Replacing Smart Data Models or running a general-purpose ontology registry.
- Runtime services (validation API, SPARQL, content negotiation) in the first release. The site is static.
- Covering every domain. The first release targets models used in real customer projects.

## Decision 1: Domain name

**Recommendation: `models.geonicdb.com`.**

| Option | For | Against |
|---|---|---|
| `models.geonicdb.com` | Covers all three artefacts (vocabulary IRIs, contexts, schemas). Matches the "data models" term NGSI-LD users know from Smart Data Models. 「データモデル」 is natural Japanese; 「スキーマ」 is not. | None significant. |
| `schema.geonicdb.com` | Familiar from schema.org. | Reads as JSON Schema only. Ambiguous with database schema. |
| Product-neutral domain (e.g. a `geolonia.*` name) | Survives a product rename. | Another domain to operate. Weakens the GeonicDB association that motivates the project. |

Whatever domain is chosen becomes permanent: every IRI a customer stores must resolve for the lifetime of their data. The obligation is accepted knowingly. It is smaller than the risk of pointing customers at third-party URLs Geolonia cannot keep alive.

## Decision 2: Extend, do not duplicate

Three kinds of catalog entries, in decreasing order of preference:

| Kind | Type IRI namespace | Example | What Geolonia adds |
|---|---|---|---|
| **Curated global model** | Smart Data Models (`https://smartdatamodels.org/dataModel.X/Type`) | `WeatherObserved`, `OffStreetParking` | Japanese description, realistic Japanese example values, guidance on which optional attributes matter in Japan, GeonicDB-specific notes (geo queries, temporal). |
| **Japanese profile** of a global model | Smart Data Models for the base type; `https://models.geonicdb.com/ns/<Subject>/...` for added attributes | `Building` with 住居表示 address, JIS X 0402 municipality code | A context that references the upstream context by URL and adds the Japanese attributes. Nothing upstream is copied. Base attributes keep their upstream IRIs. |
| **Japan-only model** | `https://models.geonicdb.com/ns/<Subject>/Type` | 避難所 (evacuation shelter), AED, 公共施設 from 推奨データセット; GIF 実装データモデル | Full model, plus a documented mapping from the official CSV columns to NGSI-LD attributes. |

Rules:

- Never redefine an upstream attribute with a different meaning or type. Add attributes instead. This is Smart Data Models' own rule and is what keeps interoperability.
- Namespaces are organised by subject, as upstream (`dataModel.Weather`), never by region, language, customer or project. There is no `/jp/` segment: everything minted under `/ns/` is Geolonia's by definition, a vocabulary such as disaster response is not inherently Japanese, and a region marker in a permanent identifier would only look parochial once the model is proposed upstream. Where a term really is Japan-specific, its name and definition say so. Whether a model started as a Japanese profile is catalog metadata (`source`), not part of the IRI. Subject names are domain nouns (`disaster`, `address`), not project or customer names.
- A Japan-only model that turns out to be generally useful is proposed upstream via the Smart Data Models incubated process. Following their file layout (below) makes this a copy, not a rewrite.
- Common Japanese building blocks (address, municipality code, era date, JGD2011 location) live once in the `common` subject, with names that say what they are (`jisMunicipalityCode`, not `municipalityCode`). Its `schema.json` is referenced from model schemas with JSON Schema `$ref`, mirroring `common-schema.json` upstream. Its context is composed into model contexts by JSON-LD means only: listing its URL in the `@context` array, or JSON-LD 1.1 `@import`. `$ref` has no meaning in a context document.

## Conventions borrowed from existing platforms

Researched on 2026-09-17.

**Smart Data Models** (per model directory, in a `dataModel.<Subject>` repository):

| File | Purpose |
|---|---|
| `schema.json` | JSON Schema for the key-values representation. `$ref` to `common-schema.json` for shared attributes. |
| `model.yaml` | Attribute list with `x-ngsi` block per attribute (`type: Property / Relationship / GeoProperty`, `model`, `units`), plus `x-version`, `x-model-tags`, `x-license-url`, `x-derived-from`. Generated from `schema.json`. |
| `examples/` | `example.json`, `example-normalized.json`, `example.jsonld`, `example-normalized.jsonld` |
| `doc/spec.md`, `doc/spec_JA.md`, ... | Generated attribute documentation per language |
| `notes.yaml` | Free-text notes about the model |
| `ADOPTERS.yaml` | Organisations using the model |
| `README.md`, `LICENSE.md` | Licence is CC BY 4.0 |
| `context.jsonld` | One per subject repository, not per model |

Contribution goes through pull requests to the `incubated` repository, then graduation into a subject repository. `id` and `type` are the only mandatory attributes.

**ETSI NGSI-LD core context**: versioned file names (`ngsi-ld-core-context-v1.8.jsonld`), each version immutable, one unversioned alias. This is the pattern brokers already rely on.

**schema.org**: vocabulary IRIs resolve to a human page for each term. Releases are versioned and archived. The whole site is generated from source files in a public repository.

**Digital Agency GIF** (`github.com/JDA-DM/GIF`, CC0-1.0): core data models, core data parts and 実装データモデル by domain (行政, 金融, 教育, 防災). 推奨データセット項目定義書 is published as XLSX per dataset. Neither is available as JSON Schema or JSON-LD. The IMI 共通語彙基盤 is the Japanese precedent for hosting vocabulary IRIs under a stable namespace.

**What this design adopts**

- The Smart Data Models per-model file set, verbatim, so a model folder can be moved upstream unchanged.
- ETSI-style versioned, immutable context files with an alias for "latest".
- schema.org-style dereferenceable type IRIs.
- GIF and 推奨データセット as the source of truth for Japan-only models. Their CC0 licence allows derivation without attribution constraints.

## URL scheme and hosting contract

```text
https://models.geonicdb.com/                          catalog (ja default, /en/ English)
https://models.geonicdb.com/models/<Subject>/<Type>/  model page (ja), /en/models/... (en)

https://models.geonicdb.com/context/<Subject>/v1.jsonld      one context per subject; alias = latest v1.x.y
https://models.geonicdb.com/context/<Subject>/v1.0.0.jsonld  exact version, immutable
https://models.geonicdb.com/schema/<Subject>/<Type>/v1.json
https://models.geonicdb.com/examples/<Subject>/<Type>/example-normalized.jsonld
https://models.geonicdb.com/ns/<Subject>/<Term>       type / attribute IRI, resolves to the model page
https://models.geonicdb.com/catalog.json              machine-readable index for GeonicDB
```

Contract:

1. **Immutability.** A published `vX.Y.Z` file never changes. `vX.jsonld` may advance to a new backwards-compatible `vX.Y.Z`. Breaking changes get a new major version and a new file. Nothing is ever deleted; withdrawn models are marked deprecated in the catalog and keep serving.
2. **Headers.** `.jsonld` is served as `application/ld+json`, `.json` as `application/json` (schemas may use `application/schema+json`), all with `Access-Control-Allow-Origin: *` and `Cache-Control: public, max-age=31536000, immutable` for exact versions. Aliases use a short max-age.
3. **Term IRIs resolve.** `/ns/disaster/EvacuationShelter` redirects to the model page. No content negotiation in v1; a JSON-LD term description can be added later with a Worker if needed.
4. **Term IRIs never change meaning.** A term IRI under `/ns/` denotes one meaning and one value type forever, independent of which context version maps a short name to it. A breaking change (different meaning, different type, different cardinality) mints a new IRI, either a new term name or a new namespace such as `/ns/disaster/v2/`, and the new context version maps the short name to the new IRI. The old IRI stays published, its page is marked deprecated and points to the successor. Adding a term or widening documentation is not a breaking change.
5. **Upstream IRIs are never re-minted.** Curated global models keep `https://smartdatamodels.org/...` IRIs. How their context files are referenced is decided below.
6. **CI enforces the contract.** A pull request that modifies or removes a published versioned file fails.

## External definitions: reference, do not copy

`models.geonicdb.com` is the entry point for customers. It must let them find external models as well as Geolonia's own, and it must host the extended versions. JSON-LD makes the second part cheap: a context document may be an array that mixes URLs and inline term definitions, and a processor fetches the referenced documents at expansion time. A Japanese profile therefore looks like this and copies nothing. The upstream reference is a commit-pinned raw URL (`<commit>` stands for the full upstream commit SHA recorded in `upstream.lock`), which GitHub serves immutably, so the referenced meaning cannot drift even though nothing is copied:

```json
{
  "@context": [
    "https://raw.githubusercontent.com/smart-data-models/dataModel.Building/<commit>/context.jsonld",
    {
      "gb": "https://models.geonicdb.com/ns/Building/",
      "residentialIndication": "gb:residentialIndication",
      "jisMunicipalityCode": "gb:jisMunicipalityCode"
    },
    "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.8.jsonld"
  ]
}
```

Three levels, from lightest to heaviest:

| Level | What is hosted | When |
|---|---|---|
| **Catalog entry only** | A page with description, Japanese notes and a link to the upstream context and schema. No file. | Every curated global model. This is the "find external models" role. |
| **Reference by pinned URL** | A Geolonia context that imports the upstream context at a commit-pinned URL and adds terms, as above. The commit is recorded in `upstream.lock`; moving the pin is a new profile version. | Every Japanese profile. Default. Semantics are immutable; availability depends on `raw.githubusercontent.com`. |
| **Pinned mirror** | A byte-identical copy of the same commit at `/context/mirror/<Subject>/<commit>.jsonld`, served under the immutability contract. | Opt-in, for customers on brokers without a context cache who cannot accept a GitHub dependency on the request path. Not needed for phase 1. |

Why pinning is the default and not `master`: upstream Smart Data Models contexts live on a mutable branch and carry no version. A `master` reference would let the meaning of stored data drift without anyone publishing a new version here, which contradicts the contract above. Commit-pinned raw URLs give immutable semantics with no copying. What they do not give is availability independent of GitHub. For GeonicDB tenants that is absorbed by the broker's context cache and by pre-warming (see GeonicDB integration). Customers on other brokers who need the same independence choose the mirror, which is the identical bytes served from `models.geonicdb.com`.

Catalog entries for curated global models link to the upstream `master` URL because that is what upstream documents and what the ecosystem uses. The catalog page states plainly that this URL is mutable and offers the pinned form next to it.

The site itself lists external models through `catalog.yaml` overlays. At build time it reads upstream `schema.json` and `context.jsonld` at the commit recorded in `upstream.lock`, so the build is reproducible and the pin in every profile context is checked against the lock.

## Repository layout

Repository: `geolonia/geonicdb-models` (public). English README, Japanese and English accepted in issues and pull requests.

```text
models/
  disaster/                            a subject minted here (first use case: Takamatsu disaster response)
    EvacuationShelter/
      schema.json  model.yaml  notes.yaml  ADOPTERS.yaml  README.md  LICENSE.md
      examples/
      doc/spec.md  doc/spec_JA.md       generated
      mapping/suisho-dataset.yaml       CSV column -> attribute mapping (推奨データセット)
    IncidentReport/  RoadClosure/  ...
    context.jsonld                     source for /context/disaster/vN.jsonld
  common/                              shared building blocks: address, jisMunicipalityCode, era date, location
  Building/                            Japanese profile of an upstream subject: adds terms, imports upstream context
  Weather/                             curated global model (thin overlay, upstream pinned)
    WeatherObserved/
      catalog.yaml                     ja/en descriptions, tags, GeonicDB notes, upstream ref
      examples/ja/                     Japanese example values
    upstream.lock                      upstream repo + commit
site/                                  VitePress (same toolchain as geonicdb-docs)
scripts/                               build catalog.json, generate spec docs, validate
dist/                                  published tree, versioned files copied, never rebuilt in place
```

Per-model metadata for the site lives in `catalog.yaml` with `ja` and `en` keys for title, summary and attribute descriptions. Attribute tables are generated from `schema.json` plus this overlay, so contributors never write page HTML.

CI on every pull request:

- validate every key-values example (`example.json`) against its `schema.json`; that schema describes the key-values representation only, as upstream
- validate every normalized example (`example-normalized.json`, `example-normalized.jsonld`) against the NGSI-LD representation rules: every attribute is an object with `type` in Property, Relationship, GeoProperty and the matching `value`, `object` or geometry, and the key-values projection of it validates against `schema.json`
- expand every JSON-LD example (`example.jsonld`, `example-normalized.jsonld`) with a JSON-LD processor using the example's `@context`; fail on any term that does not expand to an IRI, and fail if the expanded terms differ from the expansion of the matching key-values example
- check IRI uniqueness across the catalog and immutability of published versions
- regenerate `model.yaml`, `doc/spec*.md`, `catalog.json` and fail if they are out of date
- load examples into a GeonicDB instance (CLI) and read them back

## Site functionality

**Catalog**

- Browse by domain and by source (global, Japanese profile, Japan-only, 推奨データセット, GIF).
- Full-text search in Japanese and English over type names, attribute names and descriptions.
- Filters: maturity (draft, stable, deprecated), has Japanese profile, has CSV mapping.

**Model page**

- Title and summary in both languages, upstream link, licence, version history.
- Attribute table: name, NGSI-LD type, data type, units, required, description (ja/en).
- Copyable `@context` URL and a ready `Link` header.
- Examples: key-values and normalized, JSON-LD, with realistic Japanese values.
- "Try it" block: `curl` and `geonicdb` CLI commands against a tenant; "Open in Console" link.
- For 推奨データセット models: the CSV column mapping and a conversion example.

**Guides**

- Getting started: choosing a model, registering the context in GeonicDB, first entity.
- Extending a model: how to write a customer-specific context that imports a catalog context, how to name your IRIs, when to contribute back.
- Japanese conventions: address structure, JIS codes, coordinate systems, dates.
- Contributing: repository layout, checks, review process.

## GeonicDB integration

Today `smart-data-models.data.ts` is a static array compiled into the broker. Proposed change:

1. `catalog.json` is published by the site as a versioned wire format. Its JSON Schema (`catalog.schema.json`) and a fixture live in the models repository; the generator validates its output against the schema and CI fails otherwise. Top level: `formatVersion` (integer, starts at 1), `generatedAt`, `models[]`. Per model, required: `type`, `typeIri`, `domain`, `source` (one of `global`, `jp-profile`, `jp-only`), `contextUrl` (exact version), `contextAliasUrl`, `schemaUrl`, `version`, `status` (`draft`, `stable`, `deprecated`), `title` and `description` with `ja` and `en`, `sampleProperties[]`. Optional: `upstream` (repository and commit), `mapping` (source dataset), `supersededBy`. Compatibility rule: within a `formatVersion`, fields are only added, never removed or retyped; a removal or retype is a new `formatVersion`, and the site keeps publishing the previous one at `/catalog.v<N>.json` for at least twelve months.
2. GeonicDB fetches `catalog.json` at startup and caches it. The `data_models` MCP tool, `@context` auto-completion and the `meta` controller read from it. Japanese models appear without a broker release. GeonicDB falls back to its bundled snapshot, and logs a warning with the reason, when the fetch fails or times out, when the document does not validate against the bundled copy of `catalog.schema.json`, or when `formatVersion` is higher than the broker supports. The snapshot is refreshed in each broker release.
3. GeonicDB pre-warms its context cache with every context URL listed in the catalog, including the upstream URLs referenced from Japanese profiles, so a customer entity referencing a catalog context never triggers a live fetch on the request path.
4. Console: "Create from data model" when defining an entity type; shows the attribute table and inserts the example.
5. CLI: `geonicdb models list|show|scaffold <Type>`.
6. Later: optional schema validation on write for tenants that opt in, using the catalog's `schema.json`.

## Decision 3: Hosting

**Recommendation: Cloudflare Workers with static assets, deployed from GitHub Actions with `wrangler`.**

| Option | Notes |
|---|---|
| Cloudflare Workers, static assets | `geonicdb.com` DNS is already on Cloudflare. `status.geonicdb.com` is already a Worker in `geonicdb-operations`, so the deploy pattern and secrets handling exist. Supports `_headers` and `_redirects` files for content types, CORS, cache headers and IRI redirects. Cloudflare states that new projects should start on Workers and that feature work goes to Workers; Pages receives no new features. |
| Cloudflare Pages | Same header support, but Cloudflare recommends Workers for new projects. No advantage over Workers here. |
| GitHub Pages | No custom response headers (no `Cache-Control`, no CORS control beyond defaults), no redirect rules, custom domain requires DNS pointing away from Cloudflare's proxy or a CNAME setup with Cloudflare in front anyway. Fine for a docs site, not for a hosting contract with header guarantees. |

Operational notes:

- Deploy only from `main` after CI passes. Preview deployments per pull request via Workers preview URLs.
- Uptime is monitored by the existing status probe; add a probe that fetches one exact-version context and checks its content hash.
- Back up the published `dist/` tree to R2 or S3 on every deploy, so the hosting contract survives a repository accident.

## Contribution and licensing

- Code (site, scripts): Apache-2.0.
- Model content (schemas, contexts, examples, docs): CC BY 4.0. This is required for anything derived from Smart Data Models (CC BY 4.0) and is compatible with GIF and 推奨データセット (CC0-1.0). Each model folder carries `LICENSE.md` and attribution in `notes.yaml`, matching upstream practice.
- Pull request template asks for: purpose, source standard, examples, whether the model was proposed upstream.
- `CODEOWNERS` routes `models/**` to the GeonicDB team. External contributors sign nothing beyond the repository licence.
- `ADOPTERS.yaml` per model, as upstream, gives customers a reason to be listed and gives Geolonia usage signal.

## Internationalisation

- Japanese is the default site language, English is the second. Both are first-class in `catalog.yaml`; no auto-translation of model semantics, because attribute descriptions are normative.
- Guides may be written in either language and translated with the yuuhitsu pipeline already used by geonicdb-docs, with the shared `glossary.yaml`.
- Attribute and type names stay English ASCII camelCase, as Smart Data Models require. Japanese appears in descriptions, labels and examples only.

## Phasing

**Phase 1, hosting and contract.** Repository, URL scheme, `_headers`, CI immutability check, `catalog.json`. Ten to fifteen curated global models taken from current customer projects, as catalog entries with Japanese descriptions and examples, referencing upstream files. The `common` subject. The `disaster` subject seeded from the Takamatsu flood-response models in `geolonia/geonicdb-datamodels` (seven types and a hand-written context already exist there), which is the first real use case and validates the URL contract. Two or three 推奨データセット models (candidates: 避難所, AED設置箇所, 公共施設). GeonicDB reads `catalog.json` with fallback.

**Phase 2, catalog site.** Search, filters, model pages, getting-started and extension guides in both languages. Console "Create from data model".

**Phase 3, ecosystem.** CSV converters for 推奨データセット, more GIF 実装データモデル, contribution campaign, propose stable Japan-only models upstream, optional write-time validation.

Phase 1 fixes the URL scheme, which is the only part that cannot change later. Everything else can iterate.

## Repository bootstrap

Decided: one public repository, `geolonia/geonicdb-models`, holding the models, the model website and the CI. It is created with the Backstage `create-repository` scaffolder (template v0.9.0), which wires up AGENTS.md / CLAUDE.md, CODEOWNERS, team-access sync, issue routing, the Security Suite, Dependabot and CodeRabbit.

Scaffolder inputs:

| Parameter | Value | Reason |
|---|---|---|
| `name` | `geonicdb-models` | Matches the `geonicdb-*` naming of sibling repositories. |
| `description` | `Curated bilingual catalog of NGSI-LD data models for GeonicDB, served at models.geonicdb.com. Extends Smart Data Models with Japanese profiles and Japan-only models.` | Shown on GitHub and in the Backstage catalog. |
| `type` | `website` | The deliverable is a static site plus the files it serves. |
| `lifecycle` | `experimental` | Nothing is served yet. Switch to `production` when phase 1 goes live and the URL contract starts. |
| `owner` | `group:geolonia/geonicdb` | Same owner as `geonicdb`, `geonicdb-docs` and `geonicdb-operations`. |
| `system` | `geolonia/geonicdb` | Same system as the broker. |
| `repoVisibility` | `public` | Contributions and the CC BY 4.0 content licence assume a public repository. |
| `coderabbitConfig` | `true` | Org default review settings. |
| `techDocs` | `false` | The documentation of this repository is the public website itself, built with VitePress from `site/`. A second toolchain for Backstage TechDocs adds nothing. Contributor guidance goes in `README.md` and the site's contributing page; operating notes go to the GeonicDB runbooks in `geonicdb-operations`. |

The template has no licence parameter, so licensing is a manual follow-up. After the scaffolder finishes:

1. Add `LICENSE` (Apache-2.0, code) and `LICENSE-CONTENT.md` (CC BY 4.0, model content), and state in `README.md` which applies to which paths.
2. Extend `.github/CODEOWNERS` with `models/** @geolonia/geonicdb` so model semantics are always reviewed by the team.
3. Create the Cloudflare Worker (`wrangler.jsonc` with static assets, following `geonicdb-operations/cloudflare/status-probe`) and a deploy workflow on `main`. Store `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets.
4. Add the `models.geonicdb.com` DNS record in the Cloudflare zone and attach it to the Worker as a custom domain.
5. Add the operating notes from this document (URL contract, release procedure, deploy and rollback) to the GeonicDB runbooks in `geonicdb-operations`, and add a `metadata.links` entry for `https://models.geonicdb.com` in `catalog-info.yaml` so the Backstage entity page points at the site.
6. Set the Department field for issue routing to the GeonicDB board.

## Open questions

1. Final domain: `models.geonicdb.com`, or a product-neutral domain for the IRIs only?
2. Which customer projects supply the first model list?
3. Is the pinned mirror of upstream contexts needed at all, and if so, which customers ask for it?
4. Who reviews model semantics for Japanese standards (GIF, 推奨データセット) inside Geolonia?

## References

- Smart Data Models: https://smartdatamodels.org/ and https://github.com/smart-data-models
- Smart Data Models incubated repository: https://github.com/smart-data-models/incubated
- ETSI NGSI-LD core context files: https://uri.etsi.org/ngsi-ld/v1/
- schema.org developer documentation: https://schema.org/docs/developers.html
- Digital Agency GIF: https://www.digital.go.jp/policies/data_strategy_government_interoperability_framework and https://github.com/JDA-DM/GIF
- 推奨データセット: https://www.digital.go.jp/resources/data_dataset/
- Cloudflare, migrate from Pages to Workers: https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/
- GeonicDB built-in catalog: `geolonia/geonicdb` `src/core/smart-data-models/`
- GeonicDB docs, Smart Data Models feature page: `docs/en/features/smart-data-models.md`
