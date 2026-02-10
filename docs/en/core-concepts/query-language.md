---
title: Query Language
description: Learn the query language syntax for filtering entities by attribute values, metadata, scopes, and language — using the q, mq, scopeQ, pick, omit, and lang parameters.
outline: deep
---

# Query Language

Vela OS provides a powerful query language for filtering entities. This page covers all query parameters available across NGSIv2 and NGSI-LD APIs.

## Attribute Query (`q`)

The `q` parameter filters entities by their attribute values. It is supported by both NGSIv2 and NGSI-LD.

### Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `==` | Equal | `temperature==23` |
| `!=` | Not equal | `status!=inactive` |
| `>` | Greater than | `temperature>20` |
| `<` | Less than | `temperature<30` |
| `>=` | Greater than or equal | `temperature>=20` |
| `<=` | Less than or equal | `temperature<=30` |
| `..` | Range (inclusive, used with `==`) | `temperature==20..30` |
| `~=` | Pattern match (regex) | `name~=Room.*` |

### Basic Examples

Find rooms where temperature exceeds 25 degrees:

```bash
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&q=temperature>25" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

Find rooms with status equal to "available":

```bash
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&q=status==available" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

The same `q` parameter works with NGSI-LD:

```bash
curl -s "https://api.vela.geolonia.com/ngsi-ld/v1/entities?type=Room&q=temperature>25" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "NGSILD-Tenant: smartbuilding" \
  -H "Accept: application/ld+json" | jq .
```

### Multiple Conditions

Use a semicolon (`;`) for AND conditions:

```text
q=temperature>20;pressure<800
```

Use a pipe (`|`) for OR conditions:

```text
q=temperature==23|temperature==35
```

The semicolon has **higher precedence** than the pipe. The following query means "(temperature > 25 AND humidity < 40) OR (status == active)":

```text
q=temperature>25;humidity<40|status==active
```

**Example** -- find occupied rooms on floor 2 with high temperature:

```bash
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&q=floor==2;temperature>25;status==occupied" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq '.[].id'
```

### Range Queries

Combine the `==` operator with `..` to filter by an inclusive range:

```text
q=temperature==20..30
```

This matches entities where temperature is between 20 and 30, inclusive.

```bash
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&q=temperature==20..30" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

### String Matching

Use `~=` for regex pattern matching and `==` for exact matching:

```text
q=status~=act       # Regex partial match (matches "active", "actual", etc.)
q=name==Room1        # Exact match
q=name~=Room.*       # Regex match (matches "Room1", "Room201", etc.)
```

```bash
# Find entities whose name matches the regex pattern "Conference.*"
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&q=name~=Conference.*" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

## Metadata Query (`mq`) {#metadata-query}

::: info NGSIv2 Only
The `mq` parameter is available in the NGSIv2 API only. In NGSI-LD, metadata is represented as sub-attributes and can be queried directly with the `q` parameter.
:::

The `mq` parameter filters entities based on attribute metadata values. The syntax uses the format `attributeName.metadataName` followed by an operator and value.

### Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `==` | Equal | `mq=temperature.accuracy==0.95` |
| `!=` | Not equal | `mq=temperature.accuracy!=0` |
| `>` | Greater than | `mq=temperature.accuracy>0.9` |
| `<` | Less than | `mq=temperature.accuracy<0.5` |
| `>=` | Greater than or equal | `mq=temperature.accuracy>=0.9` |
| `<=` | Less than or equal | `mq=temperature.accuracy<=1.0` |
| `~=` | Pattern match (regex) | `mq=temperature.unit~=Cel.*` |
| `..` | Range (inclusive) | `mq=temperature.accuracy==0.9..1.0` |
| `,` | OR list | `mq=temperature.unit==Celsius,Fahrenheit` |

Multiple conditions use the same `;` (AND) and `|` (OR) syntax as the `q` parameter.

### Examples

Find entities where the temperature attribute has accuracy greater than 0.9:

```bash
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&mq=temperature.accuracy>0.9" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

Find entities where accuracy is in the range 0.9 to 1.0:

```bash
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&mq=temperature.accuracy==0.9..1.0" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

Find entities where the unit is either Celsius or Fahrenheit:

```bash
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&mq=temperature.unit==Celsius,Fahrenheit" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

Combine multiple metadata conditions with AND:

```bash
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&mq=temperature.accuracy>0.9;temperature.unit==Celsius" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

## Scope Query (`scopeQ`) {#scope-query}

::: info NGSI-LD Only
The `scopeQ` parameter is available in the NGSI-LD API only. NGSIv2 does not support scope queries.
:::

The `scopeQ` parameter filters entities by their scope hierarchy. Scopes are path-like strings (e.g., `/Japan/Tokyo`) that classify entities into hierarchical categories.

### Operators

| Pattern | Description | Example |
|---------|-------------|---------|
| `/path` | Exact match | `scopeQ=/Japan/Tokyo` |
| `/path/+` | One level below (direct children only) | `scopeQ=/Japan/+` |
| `/path/#` | All descendants (recursive) | `scopeQ=/Japan/#` |
| `;` | AND (entity must match all scopes) | `scopeQ=/Japan/Tokyo;/IoT` |

### Examples

Find entities with an exact scope of `/Japan/Tokyo`:

```bash
curl -s "https://api.vela.geolonia.com/ngsi-ld/v1/entities?scopeQ=/Japan/Tokyo" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "NGSILD-Tenant: smartcity" \
  -H "Accept: application/ld+json" | jq .
```

Find entities one level below `/Japan` (e.g., `/Japan/Tokyo`, `/Japan/Osaka`):

```bash
curl -s "https://api.vela.geolonia.com/ngsi-ld/v1/entities?scopeQ=/Japan/+" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "NGSILD-Tenant: smartcity" \
  -H "Accept: application/ld+json" | jq .
```

Find all entities anywhere under `/Japan` (e.g., `/Japan/Tokyo`, `/Japan/Tokyo/Shibuya`):

```bash
curl -s "https://api.vela.geolonia.com/ngsi-ld/v1/entities?scopeQ=/Japan/%23" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "NGSILD-Tenant: smartcity" \
  -H "Accept: application/ld+json" | jq .
```

::: tip URL Encoding
The `#` character must be URL-encoded as `%23` when used in a query string.
:::

Find entities that belong to both `/Japan/Tokyo` and `/IoT` scopes:

```bash
curl -s "https://api.vela.geolonia.com/ngsi-ld/v1/entities?scopeQ=/Japan/Tokyo;/IoT" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "NGSILD-Tenant: smartcity" \
  -H "Accept: application/ld+json" | jq .
```

## Attribute Projection (`pick` and `omit`) {#attribute-projection}

::: info NGSI-LD Only
The `pick` and `omit` parameters are available in the NGSI-LD API only. For NGSIv2, use the `attrs` parameter for similar functionality (selection only, no exclusion).
:::

### `pick` -- Select Specific Attributes

Include only the specified attributes in the response. The `id` and `type` fields are always included regardless of the `pick` value.

```bash
curl -s "https://api.vela.geolonia.com/ngsi-ld/v1/entities/urn:ngsi-ld:Room:001?pick=temperature,humidity" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "NGSILD-Tenant: smartbuilding" \
  -H "Accept: application/ld+json" | jq .
```

```json
{
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id": "urn:ngsi-ld:Room:001",
  "type": "Room",
  "temperature": {
    "type": "Property",
    "value": 23.5
  },
  "humidity": {
    "type": "Property",
    "value": 60
  }
}
```

### `omit` -- Exclude Specific Attributes

Exclude the specified attributes from the response. You cannot omit `id` or `type`.

```bash
curl -s "https://api.vela.geolonia.com/ngsi-ld/v1/entities/urn:ngsi-ld:Room:001?omit=location" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "NGSILD-Tenant: smartbuilding" \
  -H "Accept: application/ld+json" | jq .
```

::: warning
`pick` and `omit` are mutually exclusive. Using both in the same request will result in an error.
:::

### NGSIv2 Equivalent

In NGSIv2, the `attrs` parameter provides the same functionality as `pick`:

```bash
curl -s "https://api.vela.geolonia.com/v2/entities/urn:ngsi-ld:Room:001?attrs=temperature,humidity" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

NGSIv2 does not have an equivalent for `omit`.

## Language Filtering (`lang`) {#language-filtering}

::: info NGSI-LD Only
The `lang` parameter is available in the NGSI-LD API only.
:::

The `lang` parameter filters `LanguageProperty` attributes and returns the value for the specified language. When `lang` is specified, a `LanguageProperty` is converted to a regular `Property` with the value set to the requested language.

The parameter accepts [BCP 47](https://www.rfc-editor.org/info/bcp47) language tags. You can specify multiple languages as a comma-separated priority list, or use `*` to return all languages.

### Example

Given an entity with a multi-language name:

```json
{
  "id": "urn:ngsi-ld:Museum:M001",
  "type": "Museum",
  "name": {
    "type": "LanguageProperty",
    "languageMap": {
      "en": "Tokyo National Museum",
      "ja": "東京国立博物館"
    }
  }
}
```

Request with `lang=ja`:

```bash
curl -s "https://api.vela.geolonia.com/ngsi-ld/v1/entities/urn:ngsi-ld:Museum:M001?lang=ja" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "NGSILD-Tenant: smartcity" \
  -H "Accept: application/ld+json" | jq .
```

Response:

```json
{
  "id": "urn:ngsi-ld:Museum:M001",
  "type": "Museum",
  "name": {
    "type": "Property",
    "value": "東京国立博物館",
    "lang": "ja"
  }
}
```

## API Availability Summary

| Parameter | NGSIv2 | NGSI-LD | Description |
|-----------|--------|---------|-------------|
| `q` | Yes | Yes | Attribute value filtering |
| `mq` | Yes | No (use `q` for sub-attributes) | Metadata value filtering |
| `scopeQ` | No | Yes | Scope hierarchy filtering |
| `pick` | No (use `attrs`) | Yes | Include only specified attributes |
| `omit` | No | Yes | Exclude specified attributes |
| `lang` | No | Yes | LanguageProperty language selection |

## Combining Query Parameters

You can combine multiple query parameters in a single request to create precise filters:

```bash
# NGSI-LD: Find rooms in Tokyo scope with temperature above 25, returning only temperature and humidity
curl -s "https://api.vela.geolonia.com/ngsi-ld/v1/entities?type=Room&q=temperature>25&scopeQ=/Japan/Tokyo&pick=temperature,humidity" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "NGSILD-Tenant: smartcity" \
  -H "Accept: application/ld+json" | jq .
```

```bash
# NGSIv2: Find rooms with temperature in range 20-30 and metadata accuracy above 0.9
curl -s "https://api.vela.geolonia.com/v2/entities?type=Room&q=temperature==20..30&mq=temperature.accuracy>0.9" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Fiware-Service: smartbuilding" | jq .
```

## Next Steps

- [NGSI Data Model](/en/core-concepts/ngsi-data-model) -- Understand entities, attributes, and metadata
- [Multi-Tenancy](/en/core-concepts/multi-tenancy) -- Data isolation with tenant headers
- [First Entity Tutorial](/en/getting-started/first-entity) -- Hands-on walkthrough with query examples
