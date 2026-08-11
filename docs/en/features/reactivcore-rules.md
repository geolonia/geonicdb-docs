---
title: "ReactiveCore Rules"
description: "Reactive automation rules based on entity changes"
outline: deep
---
# ReactiveCore Rules

GeonicDB's **ReactiveCore Rules** is a reactive automation feature that automatically detects entity changes and executes actions based on defined rules. It monitors MongoDB changes in real time via Change Streams and performs automated processing when rule conditions are matched.

## Table of Contents

- [Overview](#overview)
  - [Key Features](#key-features)
  - [Enabling](#enabling)
  - [Testing in a Local Development Environment](#testing-in-a-local-development-environment)
  - [Use Cases](#use-cases)
- [Architecture](#architecture)
- [Rule Structure](#rule-structure)
- [Conditions](#conditions)
- [Actions](#actions)
- [Template Variables](#template-variables)
- [Rules API](#rules-api)
- [Examples](#examples)
- [Limitations](#limitations)
- [Troubleshooting](#troubleshooting)

---

## Overview

### Key Features

- **Automatic entity processing**: Detects entity creation, updates, and deletion and automatically executes actions
- **Flexible condition configuration**: Specify conditions based on attribute values, pattern matching, change detection, time ranges, and entity types
- **Multiple action support**: Create derived entities, update attributes, delete attributes, send notifications, and invoke Webhooks
- **Template variables**: Dynamically reference values using `${entity.id}`, `${attribute.temperature.value}`, etc.
- **Priority control**: When multiple rules match, they are executed in ascending order of priority
- **Tenant isolation**: Independent rule management per tenant

### Enabling

> **SaaS users**: ReactiveCore Rules is enabled by default in GeonicDB SaaS. No additional configuration is required.

Enable ReactiveCore Rules via environment variable (disabled by default).

```bash
export RULES_ENABLED=true
```

> **Note (#1304)**: ホスト名ルーティングされたデプロイメント（マルチサブドメイン構成の専用 DB）でもルールは実行されます。API 経由のエンティティ変更はリクエストスコープでイベントを発行し、発生元デプロイメントの情報（`deployment.hostname`）を運んで rules ワーカーが正しい DB のルールを評価・実行します（アクションによる派生エンティティも同じ DB に作成されます）。**制限**: デプロイメント DB への直接 DB 書き込み（API を経由しない変更）はルールをトリガーしません — change stream によるバックアップ監視はデフォルト DB のみです。

### Testing in a Local Development Environment

Follow these steps to try ReactiveCore Rules in a local development environment.

#### 1. Start the local server

Start the local server. MongoDB will automatically start in replica set mode, and the Change Stream Watcher will also be enabled automatically.

```bash
npm start
```

On startup, you will see output like the following.

```text
━━━ ReactiveCore Rules - Change Stream Started ━━━
Watching for entity changes...
```

Entity changes are now automatically monitored and rules are ready to execute.

#### 2. Create a rule

Use the Rules API to create a rule.

```bash
# Rule to create a warning entity when a temperature sensor exceeds 30 degrees
curl -X POST "http://localhost:3000/rules" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "name": "High Temperature Alert",
    "description": "Automatically create a warning entity when temperature exceeds 30 degrees",
    "conditions": [
      {
        "type": "entityType",
        "entityTypes": ["TemperatureSensor"]
      },
      {
        "type": "value",
        "attributeName": "temperature",
        "operator": ">",
        "value": 30
      }
    ],
    "actions": [
      {
        "type": "createEntity",
        "entityId": "urn:ngsi-ld:Alert:${entity.id}",
        "entityType": "Alert",
        "attributes": {
          "severity": "high",
          "message": "Temperature exceeded 30°C",
          "sourceEntity": "${entity.id}"
        }
      }
    ],
    "priority": 10
  }'
```

#### 3. Create or update an entity to trigger the rule

Create an entity using the Entity API.

```bash
# Create a sensor with a temperature of 31 degrees (rule will be triggered)
curl -X POST "http://localhost:3000/v2/entities" \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: test" \
  -d '{
    "id": "urn:ngsi-ld:TemperatureSensor:001",
    "type": "TemperatureSensor",
    "temperature": {
      "value": 31,
      "type": "Number"
    }
  }'
```

#### 4. Check the Change Stream output

The terminal running `npm start` will display output like the following.

```text
━━━ Entity Change Detected ━━━
Event: entity.created
Entity: urn:ngsi-ld:TemperatureSensor:001 (TemperatureSensor)
Changed attributes: temperature
Executing ReactiveCore Rules...
✓ Rules processed successfully
```

#### 5. Verify that the derived entity was created

```bash
# Verify that the alert entity was automatically created
curl -X GET "http://localhost:3000/v2/entities?type=Alert" \
  -H "Fiware-Service: test"
```

Example response:

```json
[
  {
    "id": "urn:ngsi-ld:Alert:urn:ngsi-ld:TemperatureSensor:001",
    "type": "Alert",
    "severity": {
      "type": "Property",
      "value": "high",
      "metadata": {}
    },
    "message": {
      "type": "Property",
      "value": "Temperature exceeded 30°C",
      "metadata": {}
    },
    "sourceEntity": {
      "type": "Relationship",
      "object": "urn:ngsi-ld:TemperatureSensor:001",
      "metadata": {}
    }
  }
]
```

#### Notes

- **Auto-start**: Running `npm start` alone automatically starts MongoDB (in replica set mode) and the Change Stream Watcher.
- **Replica Set mode**: MongoDB starts in replica set mode because Change Streams require it (Change Streams do not work in standalone MongoDB mode).
- **Resume Token**: Even if the server is stopped and restarted, Change Stream processing resumes from where it left off (the resume token is saved in MongoDB).
- **Real-time processing**: When an entity is created or updated, the Change Stream immediately executes the rules.
- **Background execution**: The Change Stream runs in the background in parallel with the HTTP server.

### Use Cases

1. **Automatic generation of derived entities**: Automatically create aggregation entities from sensor data
2. **Automatic attribute calculation**: Automatically calculate and add the discomfort index from temperature and humidity
3. **Threshold monitoring**: Automatically add a warning attribute when temperature exceeds 30 degrees
4. **Time-based processing**: Automatically update the status attribute outside of business hours
5. **Webhook integration**: Automatically notify external systems of entity changes

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                    Entity Change Event                       │
│          (EntityCreated, EntityUpdated, EntityDeleted)       │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            │ EntityService publishes to EventBridge
                            │ (#1119: Rule firing migrated from
                            │  scheduled change-stream to EventBridge;
                            │  #1560: the CDC worker was removed, so
                            │  EntityService is the single publisher)
                            │
┌───────────────────────────▼─────────────────────────────────┐
│              Rule Processor Handler (Lambda)                 │
│              src/handlers/rules/processor.ts                 │
│                                                              │
│  - Consumes EventBridgeRule for                              │
│    EntityCreated / EntityUpdated / EntityDeleted             │
│  - Forwards EntityChangeEvent to RuleEngineService           │
│                                                              │
│  Local / standalone:                                         │
│    local-server.ts watches the MongoDB Change Stream and     │
│    invokes RuleEngineService directly. The E2E suite reuses  │
│    the production handler via `@rules-auto-fire` hook for    │
│    parity between local and Lambda paths.                    │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                   RuleEngineService                          │
│            src/core/rules/rule-engine.service.ts             │
│                                                              │
│  1. Retrieves active rules for the tenant                    │
│  2. Evaluates conditions for each rule                       │
│     - evaluateCondition() (recursive)                       │
│     - value, pattern, change, time, entityType              │
│     - and, or, not (logical operators)                      │
│  3. Sorts matched rules by priority                          │
│  4. Executes actions for each rule sequentially              │
│     - executeAction()                                       │
│     - createEntity, updateAttribute, deleteAttribute        │
│     - sendNotification, webhook, appendToTemporal           │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                  Action Execution                            │
│                                                              │
│  - EntityService: entity operations                          │
│  - TemporalService: time-series data recording              │
│  - HTTP Client: Webhook invocation                           │
│  - EventBridge: subscription notification delivery           │
└─────────────────────────────────────────────────────────────┘
```

### Processing Flow

1. **Entity change detection**
   - On Lambda: `EntityService` publishes `EntityCreated/Updated/Deleted` to EventBridge directly. `RuleProcessorFunction` is invoked by an EventBridgeRule and constructs an `EntityChangeEvent`
   - On local / standalone: `local-server.ts` tails the MongoDB Change Stream and constructs the same `EntityChangeEvent` in-process
   - **#1560**: the legacy `ChangeStreamProcessorFunction` has been removed. It used to re-publish change-stream-derived events onto the same EventBridge fan-out, which would have made every `insert`/`update`/`delete` fire rules and subscriptions **twice** once `EntityService` started publishing directly (#738). In practice it had been failing 100% since 2026-03-08 (a resume token expired beyond the oplog window and the handler had no recovery path), so the duplicate never materialised — being broken was the only thing preventing it. On AWS, `EntityService` → `IEventPublisher` is now the single publisher; on local/standalone the in-process Change Stream remains the primary source for the default DB (`LocalEventBusPublisher` deliberately no-ops there to avoid double delivery). A regression guard (`tests/unit/infrastructure/single-entity-event-publisher.test.ts`) forbids a second publisher from reappearing

2. **Rule evaluation**
   - Retrieves active rules for the tenant and servicePath
   - Evaluates the conditions of each rule (AND-joined)
   - Sorts matched rules in order of priority

3. **Action execution**
   - Executes actions for each rule sequentially
   - Substitutes template variables with actual values
   - Even if an error occurs, other actions continue to execute

---

## Rule Structure

### Rule Interface

```typescript
interface Rule {
  ruleId: string;           // Unique identifier for the rule
  name: string;             // Rule name
  description?: string;     // Description
  tenantId: string | null;  // Tenant ID (null = applies to all tenants)
  servicePath: string;      // Service path (e.g., "/sensors")
  conditions: RuleConditionUnion[];  // Array of conditions (AND-joined)
  actions: RuleActionUnion[];        // Array of actions (executed sequentially)
  isActive: boolean;        // Enabled/disabled
  priority: number;         // Priority (lower value = higher priority)
  cooldownSeconds?: number; // Cooldown period (seconds) - prevents infinite loops
  createdAt: Date;
  updatedAt: Date;
}
```

### Basic Rule Example

```json
{
  "name": "High Temperature Warning",
  "description": "Add a warning attribute when temperature exceeds 30 degrees",
  "servicePath": "/sensors",
  "conditions": [
    {
      "type": "entityType",
      "entityTypes": ["TemperatureSensor"]
    },
    {
      "type": "value",
      "attributeName": "temperature",
      "operator": ">",
      "value": 30
    }
  ],
  "actions": [
    {
      "type": "updateAttribute",
      "entityId": "${entity.id}",
      "attributeName": "alert",
      "value": "HIGH_TEMPERATURE"
    }
  ],
  "isActive": true,
  "priority": 10
}
```

---

## Conditions

Conditions determine whether a rule matches. Multiple conditions are AND-joined.

### Condition Types

| Type | Description | Use Case |
|--------|------|------|
| `value` | Attribute value comparison | `temperature > 30` |
| `pattern` | Regular expression match | `name matches "Sensor.*"` |
| `change` | Whether an attribute has changed | `temperature was updated` |
| `time` | Time range check | `09:00 to 18:00` |
| `entityType` | Entity type | `["Sensor", "Actuator"]` |
| `eventType` | Trigger event type (CREATE / UPDATE / DELETE) | `["create"]`, `["create", "delete"]` |
| `celExpression` | CEL expression | Complex calculations, multi-attribute evaluation |
| `and` | Logical AND | All conditions are true |
| `or` | Logical OR | At least one condition is true |
| `not` | Logical NOT | Condition is false |

### 1. Value Condition

Compares the value of an attribute. In addition to entity attribute names, the entity-level fields `"id"` and `"type"` can also be specified in `attributeName`.

```typescript
interface ValueCondition {
  type: 'value';
  attributeName: string;  // Attribute name, or "id" / "type"
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=';
  value: string | number | boolean;
}
```

**Example**:

```json
{
  "type": "value",
  "attributeName": "temperature",
  "operator": ">",
  "value": 30
}
```

Example of filtering by entity ID:

```json
{
  "type": "value",
  "attributeName": "id",
  "operator": "==",
  "value": "urn:ngsi-ld:Sensor:001"
}
```

### 2. Pattern Condition

Matches an attribute value against a regular expression. In addition to entity attribute names, the entity-level fields `"id"` and `"type"` can also be specified in `attributeName`.

```typescript
interface PatternCondition {
  type: 'pattern';
  attributeName: string;  // Attribute name, or "id" / "type"
  pattern: string;  // Regular expression pattern
}
```

**Example**:

```json
{
  "type": "pattern",
  "attributeName": "name",
  "pattern": "^Sensor.*"
}
```

Example of filtering entity IDs by pattern:

```json
{
  "type": "pattern",
  "attributeName": "id",
  "pattern": "urn:ngsi-ld:WaterLevelSensor:.*"
}
```

### 3. Change Condition

Checks whether a specific attribute has changed.

```typescript
interface ChangeCondition {
  type: 'change';
  attributeName: string;
}
```

**Example**:

```json
{
  "type": "change",
  "attributeName": "status"
}
```

### 4. Time Condition

Checks whether the current time falls within the specified range.

```typescript
interface TimeCondition {
  type: 'time';
  startTime?: string;  // "HH:mm" format
  endTime?: string;    // "HH:mm" format
  timezone?: string;   // IANA timezone (e.g., "Asia/Tokyo")
}
```

**Example**:

```json
{
  "type": "time",
  "startTime": "09:00",
  "endTime": "18:00",
  "timezone": "Asia/Tokyo"
}
```

### 5. Entity Type Condition

Checks the entity type.

```typescript
interface EntityTypeCondition {
  type: 'entityType';
  entityTypes: string[];  // List of matching types
}
```

**Example**:

```json
{
  "type": "entityType",
  "entityTypes": ["TemperatureSensor", "HumiditySensor"]
}
```

### 6. Event Type Condition

Filters by the trigger event that produced the change. Maps the internal event names (`EntityCreated` / `EntityUpdated` / `EntityDeleted`) to the lowercase tokens `create` / `update` / `delete`.

```typescript
interface EventTypeCondition {
  type: 'eventType';
  eventTypes: Array<'create' | 'update' | 'delete'>;
}
```

**Use cases**:

- Run an action only on entity creation (e.g. write an `ActivityLog` only when a `GeoJSON` is created)
- Run cleanup only on deletion
- Skip update-induced cascading writes

**Examples**:

Create-only:

```json
{
  "type": "eventType",
  "eventTypes": ["create"]
}
```

Create or delete (exclude updates):

```json
{
  "type": "eventType",
  "eventTypes": ["create", "delete"]
}
```

Combine with `entityType` to scope to a specific type:

```json
{
  "type": "and",
  "conditions": [
    { "type": "eventType",  "eventTypes": ["create"] },
    { "type": "entityType", "entityTypes": ["GeoJSON"] }
  ]
}
```

> **Note**: For attribute-level filtering on UPDATE events, combine with `change` (e.g. `{type: "change", attributeName: "status"}`). On CREATE / DELETE, `change` always evaluates to false because `changedAttributes` is undefined.

### 7. CEL Expression Condition

A flexible condition expression using [Common Expression Language (CEL)](https://github.com/google/cel-spec). Supports complex calculations, string operations, and combined evaluation of multiple attributes.

```typescript
interface CelExpressionCondition {
  type: 'celExpression';
  expression: string;  // CEL expression (max 1000 characters)
}
```

#### CEL Context Variables

| Variable | Description | Example |
|------|------|---|
| `entity.id` | Entity ID | `"urn:ngsi-ld:Device:001"` |
| `entity.type` | Entity type | `"Device"` |
| `attribute.<name>.value` | Current attribute value | `attribute.temperature.value` → `35` |
| `attribute.<name>.type` | Current attribute type | `attribute.temperature.type` → `"Number"` |
| `previous.attribute.<name>.value` | Pre-change attribute value | `previous.attribute.temperature.value` → `25` |
| `previous.attribute.<name>.type` | Pre-change attribute type | `previous.attribute.temperature.type` → `"Number"` |

`previous` semantics by event type:

| Event | `previous.attribute` |
|---|---|
| `EntityCreated` | Empty object — no previous state |
| `EntityUpdated` | Pre-update attributes snapshot |
| `EntityDeleted` | Final attributes before deletion |

> **Tip — guard with `has()`**: when an attribute may not exist in the previous state (e.g. on `EntityCreated`, or for newly added attributes), wrap access with `has()`:
>
> ```text
> has(previous.attribute.temperature) && previous.attribute.temperature.value <= 30 && attribute.temperature.value > 30
> ```
>
> Direct access without `has()` on a missing key raises an evaluation error, which is caught and treated as `false`.

#### Examples

**Attribute value comparison:**
```json
{
  "type": "celExpression",
  "expression": "attribute.temperature.value > 30"
}
```

**Combining multiple attributes:**
```json
{
  "type": "celExpression",
  "expression": "attribute.temperature.value > 30 && attribute.status.value == \"active\""
}
```

**Discomfort index calculation:**
```json
{
  "type": "celExpression",
  "expression": "0.81 * attribute.temperature.value + 0.01 * attribute.humidity.value * (0.99 * attribute.temperature.value - 14.3) + 46.3 > 75"
}
```

**Entity ID/type conditions:**
```json
{
  "type": "celExpression",
  "expression": "entity.type == \"Device\" && entity.id.startsWith(\"urn:ngsi-ld:Device:\")"
}
```

**Threshold crossing (fire only on the moment a value crosses the threshold):**
```json
{
  "type": "celExpression",
  "expression": "has(previous.attribute.temperature) && previous.attribute.temperature.value <= 30 && attribute.temperature.value > 30"
}
```
Idempotent updates (re-writing the same value) do not fire because `previous.attribute.temperature.value` is already > 30.

**State transition (e.g. `draft` → `published`):**
```json
{
  "type": "celExpression",
  "expression": "has(previous.attribute.status) && previous.attribute.status.value == \"draft\" && attribute.status.value == \"published\""
}
```

**Detect newly added attribute:**
```json
{
  "type": "celExpression",
  "expression": "!has(previous.attribute.description) && has(attribute.description)"
}
```

**Detect type change (e.g. Text → Number):**
```json
{
  "type": "celExpression",
  "expression": "has(previous.attribute.reading) && previous.attribute.reading.type == \"Text\" && attribute.reading.type == \"Number\""
}
```

#### Custom Functions

The following custom functions are available in CEL expressions. They support geospatial calculations and time-based condition evaluation commonly needed in IoT and smart city use cases.

##### `distance(location1, location2)` — Distance between two points (in meters)

Great-circle distance calculation using the Haversine formula. Input is GeoJSON Point objects; output is meters (Number).

```json
{
  "type": "celExpression",
  "expression": "distance(attribute.location.value, {\"type\": \"Point\", \"coordinates\": [139.6503, 35.6762]}) < 1000"
}
```

##### `within(location, polygon)` — Point-in-polygon check

Point-in-Polygon determination using the Ray casting algorithm. Input is a GeoJSON Point and a GeoJSON Polygon; output is Boolean. Only the outer ring is supported (holes/inner rings are not supported), and the outer ring must be closed (start and end coordinates must be the same).

```json
{
  "type": "celExpression",
  "expression": "within(attribute.location.value, {\"type\": \"Polygon\", \"coordinates\": [[[139.6, 35.6], [139.8, 35.6], [139.8, 35.8], [139.6, 35.8], [139.6, 35.6]]]})"
}
```

Use the negation operator to detect geofence exit:

```json
{
  "type": "celExpression",
  "expression": "!within(attribute.location.value, {\"type\": \"Polygon\", \"coordinates\": [[[139.6, 35.6], [139.8, 35.6], [139.8, 35.8], [139.6, 35.8], [139.6, 35.6]]]})"
}
```

##### `now()` — Current time (ISO 8601 string)

Returns the current UTC time as an ISO 8601 string.

```json
{
  "type": "celExpression",
  "expression": "now() > attribute.createdAt.value"
}
```

##### `dayOfWeek()` — Current day of week (0-6, Sunday=0)

Returns the UTC-based day of the week as a number (0=Sunday, 1=Monday, ..., 6=Saturday).

```json
{
  "type": "celExpression",
  "expression": "dayOfWeek() >= 1 && dayOfWeek() <= 5 && attribute.temperature.value > 30"
}
```

##### Combining functions

Custom functions can be freely combined with other CEL operators and context variables:

```json
{
  "type": "celExpression",
  "expression": "distance(attribute.location.value, {\"type\": \"Point\", \"coordinates\": [139.7671, 35.6812]}) < 5000 && dayOfWeek() >= 1 && dayOfWeek() <= 5"
}
```

#### Limitations

- Maximum expression length: 1000 characters
- CEL is Turing-incomplete (no loops or recursion), so there is no risk of infinite loops
- The expression must return a boolean (non-boolean results are treated as false)
- If an evaluation error occurs, the condition is treated as false (no exception is thrown)
- Custom functions execute within the existing CEL evaluation timeout (100ms)
- Invalid input to custom functions (e.g., invalid GeoJSON) results in an error, and the condition is treated as false

### 8. Logical Conditions

#### AND Condition

True when all child conditions are true.

```json
{
  "type": "and",
  "conditions": [
    {
      "type": "value",
      "attributeName": "temperature",
      "operator": ">",
      "value": 30
    },
    {
      "type": "value",
      "attributeName": "humidity",
      "operator": "<",
      "value": 40
    }
  ]
}
```

#### OR Condition

True when at least one child condition is true.

```json
{
  "type": "or",
  "conditions": [
    {
      "type": "value",
      "attributeName": "status",
      "operator": "==",
      "value": "critical"
    },
    {
      "type": "value",
      "attributeName": "status",
      "operator": "==",
      "value": "error"
    }
  ]
}
```

#### NOT Condition

True when the child condition is false.

```json
{
  "type": "not",
  "condition": {
    "type": "value",
    "attributeName": "enabled",
    "operator": "==",
    "value": false
  }
}
```

---

## Actions

Operations executed when a condition is matched.

### Action Types

| Type | Description | Use Case |
|--------|------|------|
| `createEntity` | Create a new entity | Generate derived entities |
| `updateAttribute` | Update an attribute | Add calculated results |
| `deleteAttribute` | Delete an attribute | Remove unnecessary attributes |
| `sendNotification` | Send a notification | Notify via subscription |
| `webhook` | Invoke a Webhook | Integrate with external systems |
| `appendToTemporal` | Append to the Temporal API | Automatically record time-series data |

### 1. Create Entity Action

Creates a new entity.

```typescript
interface CreateEntityAction {
  type: 'createEntity';
  entityId: string;               // Supports template variables
  entityType: string;             // Supports template variables
  attributes: Record<string, unknown>;  // Supports template variables
  protocol?: 'ngsiv2' | 'ngsild';  // Target protocol (default: inherit from trigger)
  servicePath?: string;              // Target servicePath (supports ${...} templates; validated
                           // against /^\/[\w/]*$/ at creation and again after substitution.
                           // For ngsild targets it is forced to '/' unless set explicitly — #1605)
  scope?: string[];                  // Target scope for ngsild (static values only — the API schema
                                     // rejects `${...}` templates; see NgsiLdScopeStringSchema)
}
```

**Example**: Create an aggregation entity from temperature sensor data

```json
{
  "type": "createEntity",
  "entityId": "summary-${entity.id}",
  "entityType": "TemperatureSummary",
  "attributes": {
    "sensorId": "${entity.id}",
    "currentTemperature": "${attribute.temperature.value}",
    "timestamp": "${attribute.temperature.metadata.timestamp.value}"
  }
}
```

**Example**: Cross-protocol — create an NGSI-LD alert from an NGSIv2 sensor

```json
{
  "type": "createEntity",
  "entityId": "urn:ngsi-ld:Alert:${entity.id}",
  "entityType": "Alert",
  "protocol": "ngsild",
  "scope": ["${trigger.servicePath}"],
  "attributes": {
    "severity": { "type": "Property", "value": "high" },
    "source": { "type": "Relationship", "value": "${entity.id}" }
  }
}
```

### 2. Update Attribute Action

Updates an attribute of an existing entity.

```typescript
interface UpdateAttributeAction {
  type: 'updateAttribute';
  entityId: string;        // Supports template variables
  attributeName: string;
  value: unknown;          // Supports template variables
  protocol?: 'ngsiv2' | 'ngsild';  // Target protocol (default: inherit from trigger)
  servicePath?: string;    // Target servicePath (supports ${...} templates; validated
                           // against /^\/[\w/]*$/ at creation and again after substitution.
                           // For ngsild targets it is forced to '/' unless set explicitly — #1605)
  scope?: string[];        // Target scope for ngsild (static values only — schema rejects `${...}`).
                           // Applied to the entity ONLY when explicitly set (never auto-derived);
                           // an empty array is ignored rather than clearing the entity's scope
}
```

**Example**: Add a high-temperature warning flag

```json
{
  "type": "updateAttribute",
  "entityId": "${entity.id}",
  "attributeName": "highTemperatureAlert",
  "value": true
}
```

**Example**: Cross-protocol — update the NGSI-LD mirror entity created by an earlier `createEntity` action

```json
{
  "type": "updateAttribute",
  "entityId": "urn:ngsi-ld:Alert:${entity.id}",
  "attributeName": "acknowledged",
  "value": true,
  "protocol": "ngsild"
}
```

> **`servicePath`/`scope` resolution is shared with `createEntity` (#1606)**: when the action targets NGSI-LD and does not
> explicitly set `servicePath`, the target `servicePath` is forced to `'/'` — same as `createEntity` (#1605), since that is
> where the HTTP NGSI-LD API looks for entities. Without this, an `updateAttribute`/`deleteAttribute` action targeting an
> NGSI-LD mirror created by this same rule engine would never find it (`NotFoundError`) because it would keep searching at
> the *trigger's* servicePath. See "Automatic servicePath ↔ scope Mapping" below — the same table applies here.

### 3. Delete Attribute Action

Deletes an attribute from an entity.

```typescript
interface DeleteAttributeAction {
  type: 'deleteAttribute';
  entityId: string;        // Supports template variables
  attributeName: string;
  protocol?: 'ngsiv2' | 'ngsild';  // Target protocol (default: inherit from trigger)
  servicePath?: string;    // Target servicePath (supports ${...} templates; validated
                           // against /^\/[\w/]*$/ at creation and again after substitution.
                           // For ngsild targets it is forced to '/' unless set explicitly — #1605)
  scope?: string[];        // Target scope for ngsild (static values only — schema rejects `${...}`; used only for
                           // servicePath auto-mapping — deleteAttribute does not itself modify scope)
}
```

**Example**: Delete a warning flag

```json
{
  "type": "deleteAttribute",
  "entityId": "${entity.id}",
  "attributeName": "highTemperatureAlert"
}
```

### 4. Send Notification Action

Sends a notification via a subscription. Custom data can be sent to the notification endpoint of the specified subscription.

#### Interface

```typescript
interface SendNotificationAction {
  type: 'sendNotification';
  subscriptionId?: string;        // Single subscription ID
  subscriptionIds?: string[];     // Multiple subscription IDs
  message?: string;               // Optional message
  notificationData?: Record<string, unknown>;  // Custom data
}
```

**Note:** At least one of `subscriptionId` or `subscriptionIds` must be specified.

#### Examples

**Notification to a single subscription:**
```json
{
  "type": "sendNotification",
  "subscriptionId": "urn:ngsi-ld:Subscription:sub001",
  "message": "High temperature detected"
}
```

**Notification to multiple subscriptions:**
```json
{
  "type": "sendNotification",
  "subscriptionIds": ["urn:ngsi-ld:Subscription:sub001", "urn:ngsi-ld:Subscription:sub002"],
  "notificationData": {
    "alertLevel": "high",
    "sensorId": "${entity.id}",
    "temperature": "${attribute.temperature.value}"
  }
}
```

#### Template Variables

The following template variables can be used in `notificationData`:
- `${entity.id}` - Entity ID
- `${entity.type}` - Entity type
- `${attribute.<name>.value}` - Attribute value
- `${attribute.<name>.metadata.<metaName>.value}` - Attribute metadata value

#### Limitations

- Custom data size must be 200 KB or less (EventBridge limit)
- Specified subscription IDs must exist within the same tenant
- Non-existent subscription IDs are skipped with a warning log

### 5. Webhook Action

Invokes an external HTTP endpoint.

```typescript
interface WebhookAction {
  type: 'webhook';
  url: string;                        // Supports template variables
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;   // Supports template variables
  body?: unknown;                     // Supports template variables
}
```

**Example**: Send temperature data to an external API

```json
{
  "type": "webhook",
  "url": "https://api.example.com/temperature-alerts",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer token123",
    "Content-Type": "application/json"
  },
  "body": {
    "sensorId": "${entity.id}",
    "temperature": "${attribute.temperature.value}",
    "timestamp": "${attribute.temperature.metadata.timestamp.value}"
  }
}
```

### 6. Append to Temporal Action

Automatically appends entity attribute data to the Temporal API (time-series database). Internally calls `TemporalService.recordEntityChange()` to record data in the Time Series Collection.

#### Interface

```typescript
interface AppendToTemporalAction {
  type: 'appendToTemporal';
  attributes?: string[];  // List of attribute names to record (defaults to changedAttributes if omitted)
}
```

#### Examples

**Record only specific attributes:**
```json
{
  "type": "appendToTemporal",
  "attributes": ["temperature", "humidity"]
}
```

**Automatically record changed attributes (omit attributes):**
```json
{
  "type": "appendToTemporal"
}
```

#### Behavior Details

- When `attributes` is specified: Only the specified attributes are recorded to the Temporal API
- When `attributes` is omitted: The `changedAttributes` (changed attributes) from the entity change event are recorded
- If an attribute has `observedAt` metadata, that value is used as the timestamp; otherwise the current time is used
- Data is appended to the Time Series Collection (existing data is retained)

#### Use Cases

1. **Automatic archiving of IoT sensor data**: Automatically record temperature and humidity sensor values as time-series data each time they are updated
2. **Snapshot recording on threshold breach**: Record time-series data only when specific conditions are met (used in combination with conditions)
3. **Selective attribute recording**: Efficiently record only specific attributes rather than all attributes

---

## Cross-Protocol Entity Creation

The rule engine supports creating entities across protocol boundaries — for example, an NGSIv2 sensor change can trigger creation of an NGSI-LD entity and vice versa.

### Overview

GeonicDB enforces protocol isolation: NGSIv2 entities are only accessible via NGSIv2 API, and NGSI-LD entities via NGSI-LD API. The rule engine bridges this gap by allowing actions to specify a target `protocol` different from the trigger entity's protocol.

### Action Fields for Cross-Protocol

| Field | Actions | Type | Default |
|---|---|---|---|
| `protocol` | createEntity, updateAttribute, deleteAttribute | `'ngsiv2' \| 'ngsild'` | Inherited from trigger |
| `servicePath` | createEntity, updateAttribute, deleteAttribute | `string` | Inherited/auto-mapped for ngsiv2 targets; **forced to `'/'` for ngsild targets unless explicitly set** (#1605) |
| `scope` | createEntity (applied to the created entity); updateAttribute (**applied only when explicitly set on the action** — never auto-derived); deleteAttribute (used only for `servicePath` auto-mapping, never applied) | `string[]` | createEntity: inherited or auto-mapped / updateAttribute: explicit only |

>

### ⚠️ Security: cross-protocol placement changes the authorization boundary
>
> **NGSI-LD authorization is expressed by `scope`, not `servicePath`.** The NGSI-LD API pins
> `resource.servicePath` to `'/'` (`policy.pip.ts`; see #964), so a policy that restricts a group by
> `servicePath` **does not protect NGSI-LD entities** — including the mirrors these rules create.
> Because a mirror created from a non-root NGSIv2 trigger now lands at `servicePath: '/'` (#1605 — it
> has to, or the HTTP API cannot reach it at all), tenants that partition data by `servicePath` must
> add **scope-based** policies to keep that data restricted. The engine logs
> `metric: RuleCrossProtocolRelocation` (WARN) whenever it relocates a target from a non-root trigger
> path, so the change is observable.
>
> **`scope` on `updateAttribute` is a replacement, and `scope` is an authorization attribute.**
> `updateAttribute` therefore applies `scope` **only when the action sets it explicitly** — it is never
> auto-derived from the trigger. Auto-deriving would let "update one attribute" silently reclassify a
> pre-existing entity (e.g. an entity scoped `['/private/hr']` touched by a rule at `/foo` would become
> `['/foo']`, after which `Deny` rules and row-level filters keyed on `/private/**` stop applying).
> Unlike the HTTP path, the rules engine has no authorization checkpoint for a scope transition.
>
> **The rules engine acts with ambient authority** — it performs no XACML evaluation for the entities it
> writes. A principal who can create rules can therefore reach any entity in the **same tenant**
> (tenant isolation itself is never bypassable: `service` always comes from the trigger). Restrict
> `POST /rules` accordingly. Engine-level per-entity authorization is tracked separately.
>
> **#1606**: `updateAttribute`/`deleteAttribute` resolve `servicePath`/`scope` through the exact same functions as
> `createEntity` (no separate/duplicated logic). This matters because of #1605: an NGSI-LD entity created by this rule
> engine always lives at `servicePath: '/'` unless the action explicitly overrode it — so a subsequent `updateAttribute`/
> `deleteAttribute` targeting that entity must resolve to the same `'/'`, or it will silently fail to find it
> (`NotFoundError`, logged with `metric: 'RuleActionFailure'` — see "Observability" below).

### Automatic servicePath ↔ scope Mapping

When crossing protocols, the hierarchy system is automatically mapped:

| Direction | Condition | Mapping |
|---|---|---|
| NGSIv2 → NGSI-LD | trigger `servicePath != '/'` | `scope = [trigger.servicePath]`, target `servicePath = '/'` |
| NGSI-LD → NGSIv2 | `scope` has elements | `servicePath = scope[0]` |
| Root servicePath `'/'` | (always) | No scope generated |

Explicit `servicePath` or `scope` on the action overrides the automatic mapping. Template variables (`${trigger.servicePath}`, `${trigger.scope}`) can be used for custom mapping logic.

> **NGSI-LD entities are always created at `servicePath: '/'` unless the action explicitly overrides it (#1605).**
> The NGSI-LD HTTP API has no concept of `Fiware-ServicePath` — it always reads/writes at the root path
> (`tenant.middleware.ts`'s `apiType: 'ngsild'` handling, per #964: "servicePath and scope are independent
> concepts"). Hierarchy for NGSI-LD entities is expressed exclusively through `scope`. If a
> `protocol: "ngsild"` `createEntity` action sets a non-root `servicePath` explicitly, the resulting entity
> becomes **unreachable from `GET`/`DELETE /ngsi-ld/v1/entities/{id}`** (which only reads `servicePath: '/'`)
> even though it is fully visible internally (e.g. via MCP tools). Prefer letting `servicePath` default and
> use `scope` (auto-mapped from the trigger's `servicePath`, or set explicitly) to carry hierarchy instead.

### Example: NGSIv2 Sensor → NGSI-LD Alert

```json
{
  "name": "Cross-protocol temperature alert",
  "conditions": [
    { "type": "entityType", "entityTypes": ["TemperatureSensor"] },
    { "type": "value", "attributeName": "temperature", "operator": ">", "value": 35 }
  ],
  "actions": [{
    "type": "createEntity",
    "protocol": "ngsild",
    "entityId": "urn:ngsi-ld:Alert:heat-${entity.id}",
    "entityType": "Alert",
    "scope": ["${trigger.servicePath}"],
    "attributes": {
      "severity": { "type": "Property", "value": "high" },
      "source": { "type": "Relationship", "value": "${entity.id}" },
      "temperature": { "type": "Property", "value": "${attribute.temperature.value}" }
    }
  }]
}
```

### Example: NGSI-LD Entity → NGSIv2 Mirror

```json
{
  "name": "NGSI-LD to NGSIv2 mirror",
  "conditions": [
    { "type": "entityType", "entityTypes": ["Device"] }
  ],
  "actions": [{
    "type": "createEntity",
    "protocol": "ngsiv2",
    "entityId": "v2-${entity.id}",
    "entityType": "DeviceMirror",
    "attributes": {
      "source": "${entity.id}",
      "status": "mirrored"
    }
  }]
}
```

### Limitations

- **Multiple scopes**: When mapping scope → servicePath, only the first element (`scope[0]`) is used, since servicePath is a single string
- **Root servicePath**: `'/'` is not mapped to scope (it has no semantic meaning in NGSI-LD)
- **Backward compatible**: If `protocol` is omitted, the action inherits the trigger entity's protocol (existing behavior)
- **NGSI-LD servicePath is forced to `'/'`**: For `protocol: "ngsild"` `createEntity` actions, `servicePath` defaults to `'/'` regardless of the trigger's servicePath — hierarchy must be expressed via `scope` instead. Explicitly setting a non-root `servicePath` on such an action is possible but makes the entity unreachable from the NGSI-LD HTTP API (#1605)

---

## Template Variables

Dynamic variables can be embedded in action values.

### Syntax

Written in the format `${path.to.value}`.

### Available Paths

| Path | Description | Example |
|------|------|---|
| `${entity.id}` | Entity ID | `"Sensor001"` |
| `${entity.type}` | Entity type | `"TemperatureSensor"` |
| `${attribute.<name>.value}` | Attribute value | `${attribute.temperature.value}` → `25.5` |
| `${attribute.<name>.type}` | Attribute type | `${attribute.temperature.type}` → `"Number"` |
| `${attribute.<name>.metadata.<key>.value}` | Metadata value | `${attribute.temperature.metadata.unit.value}` → `"Celsius"` |
| `${trigger.protocol}` | Trigger entity's protocol | `"ngsiv2"` or `"ngsild"` |
| `${trigger.servicePath}` | Trigger entity's servicePath | `"/Madrid/Sensors"` |
| `${trigger.scope}` | Trigger entity's scope array (JSON) | `["/Madrid/Sensors"]` |
| `${trigger.service}` | Trigger entity's tenant service | `"smartcity"` |

### Examples

#### Generating a derived entity ID

```json
{
  "entityId": "summary-${entity.id}"
}
```

If `entity.id` is `"Sensor001"`, this becomes `"summary-Sensor001"`.

#### Copying an attribute value

```json
{
  "attributes": {
    "originalTemperature": "${attribute.temperature.value}",
    "sensor": "${entity.id}"
  }
}
```

#### Dynamic Webhook URL

```json
{
  "url": "https://api.example.com/sensors/${entity.id}/alerts"
}
```

### Template Functions

In addition to path resolution, action templates can call a small whitelist of pure functions in the form `${name(args)}`. Useful for stamping the server's wall clock time and for generating unique IDs in derived entities (e.g. append-only `ActivityLog` records).

| Function | Returns | Example |
|---|---|---|
| `${now()}` / `${now('iso')}` | ISO 8601 timestamp (ms precision, UTC) | `"2026-05-02T01:23:45.678Z"` |
| `${now('unix')}` | UNIX timestamp in seconds | `"1746148225"` |
| `${now('unix-ms')}` | UNIX timestamp in milliseconds | `"1746148225678"` |
| `${uuid()}` | RFC 4122 v4 UUID | `"6f1c43b8-7c5e-4f12-9a2b-2d3a4f5c6e7d"` |

**Notes**

- Functions are evaluated **per rule fire** — every event creates a fresh value (so `${uuid()}` is genuinely unique per derived entity, and `${now()}` reflects the moment of evaluation, not rule registration).
- The arg parser only handles simple comma-separated literal strings (`'iso'`, `"unix"`). Nested expressions, numeric arithmetic, and references such as `${now(entity.id)}` are not supported — compute those in a CEL `celExpression` condition instead and surface the result as an entity attribute.
- Unknown function names and unsupported argument values leave the placeholder text in place (e.g. `${notAFunction()}` stays literal). A warning is logged so the rule author can fix the typo.
- Path resolution and function calls coexist: `https://example.com/log?id=${uuid()}&entity=${entity.id}` works as expected.

#### Append-only ActivityLog example

```json
{
  "type": "createEntity",
  "entityId": "urn:ngsi-ld:ActivityLog:${uuid()}",
  "entityType": "ActivityLog",
  "attributes": {
    "target": "${entity.id}",
    "action": "create",
    "createdAt": "${now()}"
  }
}
```

Every entity create event produces a fresh `ActivityLog` instance — no entityId collisions, no cooldown conflicts.

---

## Rules API

### List Rules

```http
GET /rules
Authorization: Bearer <accessToken>
```

**Authorization**: XACML policy-based (requires the `tenant_admin` role; `super_admin` cannot access `/rules*` endpoints while authentication is enabled (the default))

**Query Parameters**

| Parameter | Description |
|-----------|------|
| `limit` | Number of results to retrieve (default: 20, max: 100) |
| `offset` | Offset (default: 0) |
| `servicePath` | Filter by service path. Must match `/^\/[\w/]*$/` (a single, non-hierarchical path — see "servicePath syntax" below); `400 Bad Request` otherwise (#1607) |
| `isActive` | Filter by enabled/disabled (`true` / `false`) |

**Response**: `200 OK`

```json
[
  {
    "ruleId": "high-temperature-alert",
    "name": "High Temperature Warning",
    "description": "Add a warning attribute when temperature exceeds 30 degrees",
    "tenantId": "smartcity",
    "servicePath": "/sensors",
    "conditions": [...],
    "actions": [...],
    "isActive": true,
    "priority": 10,
    "createdAt": "2026-02-10T00:00:00.000Z",
    "updatedAt": "2026-02-10T00:00:00.000Z"
  }
]
```

**Response Headers**

- `X-Total-Count`: Total number of results
- `Link`: Pagination links

### Create Rule

```http
POST /rules
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body**

```json
{
  "ruleId": "high-temperature-alert",
  "name": "High Temperature Warning",
  "description": "Add a warning attribute when temperature exceeds 30 degrees",
  "conditions": [
    {
      "type": "entityType",
      "entityTypes": ["TemperatureSensor"]
    },
    {
      "type": "value",
      "attributeName": "temperature",
      "operator": ">",
      "value": 30
    }
  ],
  "actions": [
    {
      "type": "updateAttribute",
      "entityId": "${entity.id}",
      "attributeName": "alert",
      "value": "HIGH_TEMPERATURE"
    }
  ],
  "priority": 10
}
```

The rule's `servicePath` is taken from the `servicePath` query parameter or the `Fiware-ServicePath` header (query
parameter takes precedence); defaults to `/` if neither is given.

**Response**: `201 Created` / `400 Bad Request` if `servicePath` fails validation (see "servicePath syntax" below)

#### servicePath syntax (#1607)

A rule's `servicePath` MUST match `/^\/[\w/]*$/` — a leading `/` followed by any number of alphanumeric characters,
underscores, and `/`. **Hyphens and other punctuation are not allowed**, and it must be a single, non-hierarchical path
(no comma-separated multiple paths, no trailing `/#`). Both `POST /rules` and `GET /rules?servicePath=...` enforce this
(via the same validation NGSIv2 data writes use, `parseServicePathHeader()`).

This is stricter than the general NGSIv2 write-path validation in one respect: hierarchical `/#` is explicitly rejected
even though `parseServicePathHeader()` would otherwise accept it as a literal path segment. A rule always matches
exactly one `servicePath` — `rule.repository.ts`'s `findActiveRulesForTenant()` and the `listRules` filter both compare
by **exact string equality**, never by prefix/hierarchy — so a `/#`-suffixed or comma-separated `servicePath` could
never actually match any incoming entity change. Accepting it would silently produce a rule that can never fire
(`POST /rules`) or a list filter that always returns empty (`GET /rules`), instead of failing loudly at creation time.

**The rule's `servicePath` must exactly match the `Fiware-ServicePath` used by the NGSIv2 writes that are meant to
trigger it.** For example, a rule created with `servicePath: "/sensors"` only fires for entity changes whose trigger
event carries `servicePath: "/sensors"` — not `/sensors/indoor`, not `/`, and not omitted (which defaults to `/`).

### Get Rule

```http
GET /rules/:ruleId
Authorization: Bearer <accessToken>
```

**Response**: `200 OK` / `404 Not Found`

### Update Rule

```http
PATCH /rules/:ruleId
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body**

```json
{
  "name": "Updated rule name",
  "description": "Updated description",
  "conditions": [...],
  "actions": [...],
  "priority": 5
}
```

**Response**: `204 No Content` / `404 Not Found`

### Delete Rule

```http
DELETE /rules/:ruleId
Authorization: Bearer <accessToken>
```

**Response**: `204 No Content` / `404 Not Found`

### Enable/Disable Rule

```http
POST /rules/:ruleId/activate
POST /rules/:ruleId/deactivate
Authorization: Bearer <accessToken>
```

**Response**: `200 OK` / `404 Not Found`

---

## Examples

### Example 1: High Temperature Alert

Automatically adds a warning attribute when the temperature exceeds 30 degrees.

```json
{
  "ruleId": "high-temperature-alert",
  "name": "High Temperature Alert",
  "conditions": [
    {
      "type": "entityType",
      "entityTypes": ["TemperatureSensor"]
    },
    {
      "type": "value",
      "attributeName": "temperature",
      "operator": ">",
      "value": 30
    }
  ],
  "actions": [
    {
      "type": "updateAttribute",
      "entityId": "${entity.id}",
      "attributeName": "alert",
      "value": "HIGH_TEMPERATURE"
    },
    {
      "type": "updateAttribute",
      "entityId": "${entity.id}",
      "attributeName": "alertTimestamp",
      "value": "${attribute.temperature.metadata.timestamp.value}"
    }
  ],
  "priority": 10
}
```

### Example 2: Automatic Status Update Outside Business Hours

Automatically sets the status to "closed" outside business hours (18:00 to 09:00).

```json
{
  "ruleId": "after-hours-status",
  "name": "After-Hours Status",
  "conditions": [
    {
      "type": "entityType",
      "entityTypes": ["Store"]
    },
    {
      "type": "or",
      "conditions": [
        {
          "type": "time",
          "startTime": "18:00",
          "endTime": "23:59",
          "timezone": "Asia/Tokyo"
        },
        {
          "type": "time",
          "startTime": "00:00",
          "endTime": "09:00",
          "timezone": "Asia/Tokyo"
        }
      ]
    }
  ],
  "actions": [
    {
      "type": "updateAttribute",
      "entityId": "${entity.id}",
      "attributeName": "status",
      "value": "closed"
    }
  ],
  "priority": 5
}
```

### Example 3: Automatic Generation of Derived Entities

Automatically generates a daily summary entity from sensor data.

```json
{
  "ruleId": "daily-summary",
  "name": "Daily Summary Generation",
  "conditions": [
    {
      "type": "entityType",
      "entityTypes": ["TemperatureSensor"]
    },
    {
      "type": "change",
      "attributeName": "temperature"
    }
  ],
  "actions": [
    {
      "type": "createEntity",
      "entityId": "summary-${entity.id}",
      "entityType": "DailySummary",
      "attributes": {
        "sensorId": "${entity.id}",
        "sensorType": "${entity.type}",
        "currentTemperature": "${attribute.temperature.value}",
        "unit": "${attribute.temperature.metadata.unit.value}",
        "timestamp": "${attribute.temperature.metadata.timestamp.value}"
      }
    }
  ],
  "priority": 20
}
```

### Example 4: Webhook Notification to an External API

Notifies an external monitoring system of temperature changes.

```json
{
  "ruleId": "external-monitoring",
  "name": "External Monitoring Notification",
  "conditions": [
    {
      "type": "entityType",
      "entityTypes": ["TemperatureSensor"]
    },
    {
      "type": "change",
      "attributeName": "temperature"
    }
  ],
  "actions": [
    {
      "type": "webhook",
      "url": "https://monitoring.example.com/api/sensors/${entity.id}/events",
      "method": "POST",
      "headers": {
        "Authorization": "Bearer YOUR_API_TOKEN",
        "X-Sensor-Type": "${entity.type}"
      },
      "body": {
        "event": "temperature_change",
        "sensorId": "${entity.id}",
        "temperature": "${attribute.temperature.value}",
        "unit": "celsius",
        "timestamp": "${attribute.temperature.metadata.timestamp.value}"
      }
    }
  ],
  "priority": 15
}
```

### Example 5: Complex Conditions (AND + OR)

Issues a warning when the temperature is 30 degrees or above, AND either humidity is 80% or above, OR the time is between 12:00 and 15:00.

```json
{
  "ruleId": "complex-alert",
  "name": "Complex Condition Alert",
  "conditions": [
    {
      "type": "entityType",
      "entityTypes": ["WeatherStation"]
    },
    {
      "type": "value",
      "attributeName": "temperature",
      "operator": ">=",
      "value": 30
    },
    {
      "type": "or",
      "conditions": [
        {
          "type": "value",
          "attributeName": "humidity",
          "operator": ">=",
          "value": 80
        },
        {
          "type": "time",
          "startTime": "12:00",
          "endTime": "15:00",
          "timezone": "Asia/Tokyo"
        }
      ]
    }
  ],
  "actions": [
    {
      "type": "updateAttribute",
      "entityId": "${entity.id}",
      "attributeName": "heatIndexAlert",
      "value": "EXTREME"
    }
  ],
  "priority": 5
}
```

### Example 6: Heat Stroke Alert Notification via Discomfort Index (CEL Expression + Notification)

A practical example that evaluates the **Discomfort Index** in real time from temperature and humidity and sends a notification via subscription when the threshold is exceeded.

**Discomfort Index formula:**

```text
DI = 0.81 × T + 0.01 × H × (0.99 × T − 14.3) + 46.3
```

- T: Temperature (°C)
- H: Relative humidity (%)

**Discomfort Index reference levels:**

| Discomfort Index | Perceived sensation |
|---------|------|
| ~55 | Cold |
| 55~60 | Chilly |
| 60~65 | No particular sensation |
| 65~70 | Comfortable |
| 70~75 | Not hot |
| **75~80** | **Somewhat hot** ← Alert threshold |
| 80~85 | Hot with perspiration |
| 85~ | Unbearably hot |

#### Step 1: Create a notification subscription

First, create a subscription to receive alert notifications.

```bash
# Create an NGSIv2 subscription
curl -X POST "http://localhost:3000/v2/subscriptions" \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "description": "Discomfort index alert notification",
    "subject": {
      "entities": [
        { "idPattern": ".*", "type": "WeatherStation" }
      ],
      "condition": {
        "attrs": ["temperature", "humidity"]
      }
    },
    "notification": {
      "http": {
        "url": "https://alerts.example.com/discomfort-index"
      },
      "attrs": ["temperature", "humidity", "discomfortLevel"]
    }
  }'
```

Retrieve the subscription ID from the `Location` header of the response (e.g., `urn:ngsi-ld:Subscription:abc123`).

#### Step 2: Create the discomfort index alert rule

Create a rule that uses a CEL expression to calculate the discomfort index and executes actions when it exceeds 75.

```bash
curl -X POST "http://localhost:3000/rules" \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "ruleId": "discomfort-index-alert",
    "name": "Discomfort Index Alert",
    "description": "Set a warning level and send a notification when the discomfort index exceeds 75",
    "conditions": [
      {
        "type": "entityType",
        "entityTypes": ["WeatherStation"]
      },
      {
        "type": "or",
        "conditions": [
          { "type": "change", "attributeName": "temperature" },
          { "type": "change", "attributeName": "humidity" }
        ]
      },
      {
        "type": "celExpression",
        "expression": "0.81 * attribute.temperature.value + 0.01 * attribute.humidity.value * (0.99 * attribute.temperature.value - 14.3) + 46.3 > 75"
      }
    ],
    "actions": [
      {
        "type": "updateAttribute",
        "entityId": "${entity.id}",
        "attributeName": "discomfortLevel",
        "value": "WARNING"
      },
      {
        "type": "sendNotification",
        "subscriptionId": "urn:ngsi-ld:Subscription:abc123",
        "message": "Discomfort index has exceeded the threshold",
        "notificationData": {
          "alertType": "DISCOMFORT_INDEX",
          "stationId": "${entity.id}",
          "temperature": "${attribute.temperature.value}",
          "humidity": "${attribute.humidity.value}",
          "level": "WARNING"
        }
      }
    ],
    "priority": 10,
    "cooldownSeconds": 600
  }'
```

**Key points of this rule:**

- **Condition 1 (entityType)**: Only targets entities of type `WeatherStation`
- **Condition 2 (or + change)**: Evaluates only when `temperature` or `humidity` changes (avoids unnecessary re-evaluation)
- **Condition 3 (celExpression)**: The discomfort index formula is written directly in CEL and checks whether it exceeds 75
- **Action 1 (updateAttribute)**: Adds the `discomfortLevel` attribute to the entity
- **Action 2 (sendNotification)**: Sends an alert notification via the subscription
- **cooldownSeconds: 600**: A 10-minute cooldown prevents excessive notification delivery

#### Step 3: Add a danger-level (DI > 80) Webhook notification rule

Create an additional rule that sends an emergency notification via Webhook when the discomfort index is even higher.

```json
{
  "ruleId": "discomfort-index-danger",
  "name": "Discomfort Index Danger Alert",
  "description": "Send an emergency notification when the discomfort index exceeds 80",
  "conditions": [
    {
      "type": "entityType",
      "entityTypes": ["WeatherStation"]
    },
    {
      "type": "celExpression",
      "expression": "0.81 * attribute.temperature.value + 0.01 * attribute.humidity.value * (0.99 * attribute.temperature.value - 14.3) + 46.3 > 80"
    }
  ],
  "actions": [
    {
      "type": "updateAttribute",
      "entityId": "${entity.id}",
      "attributeName": "discomfortLevel",
      "value": "DANGER"
    },
    {
      "type": "webhook",
      "url": "https://api.example.com/emergency/heatstroke-alert",
      "method": "POST",
      "headers": {
        "Content-Type": "application/json",
        "Authorization": "Bearer YOUR_API_TOKEN"
      },
      "body": {
        "severity": "DANGER",
        "stationId": "${entity.id}",
        "stationType": "${entity.type}",
        "temperature": "${attribute.temperature.value}",
        "humidity": "${attribute.humidity.value}",
        "message": "Heat stroke danger level: Temperature ${attribute.temperature.value}°C, Humidity ${attribute.humidity.value}%"
      }
    }
  ],
  "priority": 5,
  "cooldownSeconds": 300
}
```

**Note:** This rule has `priority: 5`, which is higher priority than the `priority: 10` in Example 6. Therefore, when DI > 80, `DANGER` is set first, and care must be taken to avoid it being overwritten by the subsequent `WARNING` update. When both rules match for the same entity, they are executed in ascending order of priority, so the order would be `DANGER` → `WARNING`. To avoid this, add an upper bound condition to the CEL expression in the WARNING rule:

```json
{
  "type": "celExpression",
  "expression": "0.81 * attribute.temperature.value + 0.01 * attribute.humidity.value * (0.99 * attribute.temperature.value - 14.3) + 46.3 > 75 && 0.81 * attribute.temperature.value + 0.01 * attribute.humidity.value * (0.99 * attribute.temperature.value - 14.3) + 46.3 <= 80"
}
```

#### Step 4: Verify behavior

```bash
# Temperature 27°C, Humidity 75% → Discomfort index ≈ 77.5 (WARNING)
curl -X POST "http://localhost:3000/v2/entities" \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "id": "urn:ngsi-ld:WeatherStation:shibuya-001",
    "type": "WeatherStation",
    "temperature": { "value": 27, "type": "Number" },
    "humidity": { "value": 75, "type": "Number" },
    "location": { "value": "35.6595,139.7004", "type": "Text" }
  }'

# Verify that discomfortLevel was automatically added
curl -s "http://localhost:3000/v2/entities/urn:ngsi-ld:WeatherStation:shibuya-001" \
  -H "Fiware-Service: smartcity" | jq '.discomfortLevel'
# → { "type": "Text", "value": "WARNING", "metadata": {} }

# Update temperature to 33°C → Discomfort index ≈ 86.8 (DANGER)
curl -X PATCH "http://localhost:3000/v2/entities/urn:ngsi-ld:WeatherStation:shibuya-001/attrs" \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "temperature": { "value": 33, "type": "Number" }
  }'

# Verify that discomfortLevel was updated to DANGER
curl -s "http://localhost:3000/v2/entities/urn:ngsi-ld:WeatherStation:shibuya-001" \
  -H "Fiware-Service: smartcity" | jq '.discomfortLevel'
# → { "type": "Text", "value": "DANGER", "metadata": {} }
```

---

## Infinite Loop Prevention

ReactiveCore Rules implements multiple protection mechanisms to prevent rules from falling into infinite loops.

### 1. Action Entity Type Exclusion (Self-Trigger Prevention)

**Restriction**: The entity types created by a rule's actions are **automatically excluded** from the trigger targets of that same rule.

**Behavior**:
- Extracts the entity types created by a rule's actions (`createEntity`)
- If the entity type in a change event matches a type specified in an action, execution of that rule is blocked

**Example**:
```json
{
  "ruleId": "sensor-alert-rule",
  "name": "Temperature Sensor Warning",
  "conditions": [
    {
      "type": "entityType",
      "entityTypes": ["TemperatureSensor"]
    },
    {
      "type": "value",
      "attributeName": "temperature",
      "operator": ">",
      "value": 30
    }
  ],
  "actions": [
    {
      "type": "createEntity",
      "entityId": "Alert:${entity.id}",
      "entityType": "Alert",  // ← Creates an Alert entity
      "attributes": {
        "severity": "high"
      }
    }
  ]
}
```

This rule:
- ✅ Executes on changes to `TemperatureSensor` entities
- ❌ Does not execute on changes to `Alert` entities (self-trigger prevention)

**Benefits**:
- Prevents a rule from being re-triggered by the entity it created
- Automatically prevents unintended chain reactions
- Avoids loops without explicit condition configuration

### 2. Execution Counter (Per Entity, Per Time Window)

**Restriction**: For a single entity, a single rule can execute at most **10 times per minute**.

```typescript
// Default configuration (src/config/defaults.ts)
RULE_ENGINE.MAX_EXECUTIONS_PER_WINDOW = 10;  // Maximum executions
RULE_ENGINE.EXECUTION_WINDOW_SECONDS = 60;   // Time window (seconds)
```

**Behavior**:
- Tracks execution count per entity per rule
- Blocks further executions if the maximum is reached within the time window
- The counter is automatically reset when the time window expires

### 3. Loop Detection (Circular Rule Chains)

**Restriction**: The depth of a rule execution chain is limited to a maximum of **5 levels**.

```typescript
// Default configuration (src/config/defaults.ts)
RULE_ENGINE.MAX_CHAIN_DEPTH = 5;
```

**Behavior**:
- Tracks chains such as Rule A → entity update → Rule B → entity update → Rule C
- If the same rule appears twice within an execution chain (circular), execution is blocked
- If the chain depth exceeds the maximum, execution is blocked

**Example**:
```text
Rule A (temperature sensor) → creates Alert entity
  → Rule B (Alert) → creates notification entity
    → Rule C (notification) → creates log entity
      → Rule D (log) → ... (OK: up to depth 5)
        → Rule E (Alert) → triggers Rule B (NG: circular detected)
```

### 4. Cooldown Period

A **minimum execution interval** can be configured for each rule.

```json
{
  "ruleId": "temperature-alert",
  "name": "Temperature Alert",
  "conditions": [ ... ],
  "actions": [ ... ],
  "cooldownSeconds": 300  // 5-minute cooldown
}
```

**Default value**: If `cooldownSeconds` is not specified, a default cooldown of **60 seconds** is applied.

```typescript
// Default configuration (src/config/defaults.ts)
RULE_ENGINE.DEFAULT_COOLDOWN_SECONDS = 60;
```

**Behavior**:
- Tracks the last execution time per entity per rule
- Blocks execution if within the cooldown period
- Execution becomes possible again once the cooldown period has elapsed

**Use Cases**:
- Controlling alert notifications for frequently changing sensor data
- Preventing excessive Webhook invocations
- Reducing load on external systems

> **Cooldown is consumed regardless of action outcome (#1606)**: the cooldown/execution-window counters are updated
> (`trackExecution()`) as soon as a rule is selected for execution, *before* its actions run. If every action in a rule
> keeps failing (e.g. a misconfigured `entityId` template, or a cross-protocol target that doesn't exist), the rule
> still burns its cooldown on every matching event — it does not retry sooner just because nothing actually happened.
> There is currently no queryable execution history (success/failure per firing); use the `metric: 'RuleActionFailure'`
> / `metric: 'RuleExecutionFailure'` structured log fields (see "Action Execution Errors" below) to detect a rule that
> is silently failing over and over. A queryable history is tracked as a follow-up to #1606.

### Best Practices for Loop Prevention

1. **Clearly distinguish entity types**: The action entity type exclusion feature is applied automatically
   ```json
   // Rule 1: Sensor → creates Alert entity
   {
     "conditions": [{"type": "entityType", "entityTypes": ["Sensor"]}],
     "actions": [{"type": "createEntity", "entityType": "Alert", ...}]
   }
   // Changes to Alert entities will not trigger this rule (automatically excluded)
   ```

2. **Use Change conditions**: Trigger only when an attribute actually changes
   ```json
   {
     "type": "change",
     "attributeName": "temperature"
   }
   ```

3. **Set cooldownSeconds**: Set an appropriate cooldown when high-frequency execution is expected
   ```json
   {
     "cooldownSeconds": 300  // 5 minutes
   }
   ```

4. **Set rule priorities appropriately**: Control execution order to prevent unintended chaining

---

## Limitations

### Current Limitations

1. **No transactions**: If an error occurs during execution of multiple actions, no rollback is performed
2. **Condition evaluation performance**: With a large number of rules, evaluation may take longer
3. **No type checking for template variables**: Runtime errors may occur

### Performance Considerations

- With many rules, the processing time per entity change increases
- Disable unnecessary rules (`isActive: false`)
- Set priorities appropriately to optimize execution order
- Exercise caution when configuring rules for entities that change at high frequency
- **Loop prevention**: Infinite loops are automatically prevented by the action entity type exclusion, execution counter, loop detection, and cooldown period mechanisms

---

## Troubleshooting

### Rules Not Executing

**Checklist**:

1. Is `RULES_ENABLED=true` set?
2. Is the rule enabled (`isActive: true`)?
3. Are the conditions correctly matched (especially entity type)?
4. Does the servicePath match?
5. Is the Change Stream Handler running?

**Debugging**:

Check the logs.

```bash
# Search for RuleEngineService logs
grep "RuleEngineService" /var/log/lambda.log
```

### Template Variables Not Being Expanded

**Checklist**:

1. Is the variable path correct (e.g., `${entity.id}`, `${attribute.temperature.value}`)?
2. Does the referenced attribute exist?
3. Watch out for differences in uppercase and lowercase

**Examples**:

- ❌ `${Entity.ID}` → ✅ `${entity.id}`
- ❌ `${temperature.value}` → ✅ `${attribute.temperature.value}`

### Webhook Failures

**Checklist**:

1. Is the URL correct?
2. Is the external API reachable (network, firewall)?
3. Is the Authorization header correct?
4. Is the Content-Type correct?
5. Is the request body format correct?

**Debugging**:

Check the logs for error messages.

```bash
# Search for Webhook errors
grep "Webhook execution failed" /var/log/lambda.log
```

### Infinite Loops

A rule's actions may match the conditions of another rule, potentially causing an infinite loop.

**Countermeasures**:

1. Design rule conditions carefully
2. Use `change` conditions to trigger only on specific attribute changes
3. Separate entity types (e.g., use a different type for derived entities)

### Action Execution Errors

**Checklist**:

1. Does the entity ID exist (for updateAttribute, deleteAttribute)?
2. Is the attribute name correct?
3. Is the value type correct (e.g., not setting a string value on a numeric attribute)?
4. Is the tenant and servicePath correct? For cross-protocol `updateAttribute`/`deleteAttribute` targeting NGSI-LD,
   remember that the target `servicePath` is forced to `'/'` unless the action explicitly overrides it (#1605/#1606) —
   see "Cross-Protocol Entity Creation" above.

**Observability (#1606)**: action/rule execution failures are logged as structured errors (not swallowed silently) —
a failure in one action does not stop other actions/rules from running, but each failure is logged with:

- `logger.error('Failed to execute action', { ruleId, actionType, entityId, error, metric: 'RuleActionFailure' })` —
  per-action failure (e.g. `NotFoundError` from a bad `servicePath` resolution). `entityId` here is the *raw*,
  template-unexpanded action definition value; the resolved entityId and target `servicePath`/`protocol` are logged
  separately from inside `executeUpdateAttributeAction`/`executeDeleteAttributeAction` (`logger.info('Updating entity
  attribute', ...)` / `logger.info('Deleting entity attribute', ...)`) right before the mutating call.
- `logger.error('Failed to execute rule actions', { ruleId, error, metric: 'RuleExecutionFailure' })` — rule-level
  failure (e.g. an unexpected exception outside the per-action try/catch).

Search logs for `metric: "RuleActionFailure"` or `metric: "RuleExecutionFailure"` to find rules that are failing.
There is no dedicated rule-execution-history collection/API yet — this is log-based observability only.

---

## Technical Specification (GeonicDB Rule Specification v1.0)

**Status**: Draft
**Version**: 1.0.0
**Last Updated**: 2026-02-10
**Authors**: GeonicDB Development Team

### Abstract

This document specifies the GeonicDB Rule Engine format for processing entity changes in NGSI-based context brokers. The specification defines a JSON-based rule format following the Event-Condition-Action (ECA) pattern, optimized for IoT and smart city applications.

### 1. Introduction

#### 1.1 Purpose

The GeonicDB Rule Engine enables automatic processing of entity changes in FIWARE-compatible context brokers. Rules define conditions that trigger actions when entities are created, updated, or deleted.

#### 1.2 Design Principles

- **JSON Format**: All rules are defined using standard JSON
- **ECA Pattern**: Event-Condition-Action architecture for reactive processing
- **NGSI-Aware**: Native support for NGSI entity attributes and metadata
- **Composable**: Conditions support logical operators (AND, OR, NOT) with arbitrary nesting
- **Type-Safe**: Discriminated union types for conditions and actions
- **Template-Driven**: Dynamic value substitution using `${...}` syntax

#### 1.3 Terminology

- **Rule**: A complete definition consisting of conditions and actions
- **Condition**: A predicate that evaluates to true or false against an entity
- **Action**: An operation executed when all rule conditions are satisfied
- **Entity Change Event**: A notification of entity creation, update, or deletion
- **Template Variable**: A placeholder that resolves to runtime entity values

### 2. Conformance

#### 2.1 Conformance Levels

An implementation is **conformant** if it implements all features marked as REQUIRED.

Features marked as OPTIONAL MAY be implemented at the discretion of the implementer.

#### 2.2 Required Features

A conformant implementation MUST:

1. Support all condition types defined in Section 4
2. Support all action types defined in Section 5
3. Support template variable substitution as defined in Section 6
4. Implement loop prevention mechanisms as defined in Section 7
5. Evaluate conditions recursively for nested logical operators
6. Execute actions sequentially in the order specified
7. Validate rules against the JSON Schema in Section 8

#### 2.3 Optional Features

A conformant implementation MAY:

1. Support additional custom condition types
2. Support additional custom action types
3. Provide extended template variable paths
4. Implement custom loop prevention strategies

### 3. JSON Schema

The complete JSON Schema for GeonicDB Rule Specification v1.0 is available in the specification document. All rules MUST validate against this schema.

Key validation rules:
- `ruleId`, `name`, `tenantId`, `servicePath`, `conditions`, `actions`, `isActive`, and `priority` are REQUIRED fields
- `conditions` array MUST contain at least one condition
- `actions` array MUST contain at least one action
- `cooldownSeconds` MUST be a positive integer if specified
- `servicePath` MUST start with `/`

For the complete JSON Schema definition, refer to Section 8 of the formal specification document.

### 4. Versioning

#### 4.1 Version Format

This specification follows Semantic Versioning 2.0.0 (https://semver.org/):

- **MAJOR**: Incompatible changes (e.g., removing condition/action types)
- **MINOR**: Backward-compatible additions (e.g., new condition/action types)
- **PATCH**: Backward-compatible fixes (e.g., clarifications, typo fixes)

Current version: **1.0.0**

#### 4.2 Compatibility

Rules MAY declare the specification version they conform to using the `specVersion` field:

```json
{
  "specVersion": "1.0.0",
  "ruleId": "...",
  ...
}
```

#### 4.3 Deprecation Policy

When features are deprecated:
1. Feature is marked as DEPRECATED in documentation
2. Feature remains functional for at least one MAJOR version
3. Deprecation warnings SHOULD be logged
4. Migration guide MUST be provided

### References

- **FIWARE NGSI-v2 Specification**: https://fiware.github.io/specifications/ngsiv2/stable/
- **FIWARE NGSI-LD Specification**: https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/
- **JSON Schema Draft 7**: http://json-schema.org/draft-07/schema#
- **Semantic Versioning 2.0.0**: https://semver.org/
- **IANA Time Zone Database**: https://www.iana.org/time-zones
- **ECMAScript Regular Expressions**: https://tc39.es/ecma262/#sec-regexp-regular-expression-objects

### Acknowledgments

This specification was developed by the GeonicDB team at Geolonia Inc. with inspiration from:
- FIWARE Complex Event Processing (Proton CEP)
- json-rules-engine (CacheControl)
- AWS EventBridge Rules
- Common Expression Language (CEL)

**License**: GNU Affero General Public License v3.0 (AGPL-3.0)
**Copyright**: © 2026 Geolonia Inc.

---

## Related Documentation

- [API Common Specification](../api-reference/endpoints.md) - General API specification
- [Authentication & Authorization](../reference/auth.md) - Details on admin API and authentication requirements
- [API Specification](../api-reference/endpoints.md) - List of all endpoints
- Development Guide - Details on HTTP status codes
