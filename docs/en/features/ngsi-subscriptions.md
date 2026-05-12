---
title: "NGSI Subscriptions"
description: "HTTP Webhook subscriptions for entity change notifications"
outline: deep
---
# Subscriptions

GeonicDB's subscription feature allows you to monitor entity changes in real time and automatically notify external systems.

## Table of Contents

- [Overview](#overview)
- [How Subscriptions Work](#how-subscriptions-work)
- [Notification Methods](#notification-methods)
- [Conditions and Filtering](#conditions-and-filtering)
- [Practical Examples](#practical-examples)
- [Best Practices](#best-practices)
- [Access Control and Ownership (GeonicDB Extension)](#access-control-and-ownership-geonicdb-extension)
- [Troubleshooting](#troubleshooting)

---

## Overview

Subscriptions monitor entity creation, update, and deletion, and send notifications to a specified endpoint when the defined conditions are met.

### Key Use Cases

- **Sensor data monitoring**: Detect threshold exceedances for temperature, humidity, etc.
- **Location tracking**: Track position changes of vehicles and devices
- **Event-driven architecture**: Automated processing triggered by entity changes
- **Data integration**: Real-time data delivery to other systems

### Supported APIs

| API | Endpoint | Support |
|-----|----------|---------|
| NGSIv2 | `/v2/subscriptions` | ✅ |
| NGSI-LD | `/ngsi-ld/v1/subscriptions` | ✅ |

---

## How Subscriptions Work

```text
1. Entity creation/update
   ↓
2. MongoDB Change Stream detects the event
   ↓
3. Event is sent to EventBridge
   ↓
4. SubscriptionMatcher searches for subscriptions matching the conditions
   ↓
5. Notification message is sent to the SQS queue
   ↓
6. NotificationSender sends an HTTP/MQTT notification to the external endpoint
```

**Latency**: Approximately 1 minute from entity change to notification delivery (depends on the Change Stream polling interval).

---

## Notification Methods

### HTTP Webhook

Sends notifications as standard HTTP POST requests.

**Example subscription creation:**

```bash
curl -X POST http://localhost:3000/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: demo" \
  -d '{
    "description": "Room temperature monitoring",
    "subject": {
      "entities": [{ "idPattern": ".*", "type": "Room" }],
      "condition": {
        "attrs": ["temperature"],
        "expression": { "q": "temperature>25" }
      }
    },
    "notification": {
      "http": { "url": "https://webhook.example.com/notify" },
      "attrs": ["temperature", "pressure"]
    },
    "expires": "2030-12-31T23:59:59.000Z",
    "throttling": 5
  }'
```

**Example notification payload:**

```json
{
  "subscriptionId": "sub123",
  "data": [
    {
      "id": "Room1",
      "type": "Room",
      "temperature": {
        "type": "Number",
        "value": 26.5,
        "metadata": {}
      },
      "pressure": {
        "type": "Number",
        "value": 1013.25,
        "metadata": {}
      }
    }
  ]
}
```

### httpCustom (Custom Template)

Allows customization of the HTTP method, headers, and payload.

**Example subscription creation:**

```bash
curl -X POST http://localhost:3000/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: demo" \
  -d '{
    "description": "Custom notification template",
    "subject": {
      "entities": [{ "type": "Room" }],
      "condition": { "attrs": ["temperature"] }
    },
    "notification": {
      "httpCustom": {
        "url": "https://api.example.com/events",
        "method": "PUT",
        "headers": {
          "X-Api-Key": "secret-key",
          "Content-Type": "application/json"
        },
        "qs": {
          "entityId": "${id}",
          "temp": "${temperature}"
        },
        "payload": "{\"room\": \"${id}\", \"temp\": ${temperature}, \"timestamp\": \"${timestamp}\"}"
      }
    }
  }'
```

**Macro substitution:**

| Macro | Substituted value |
|-------|-------------------|
| `${id}` | Entity ID |
| `${type}` | Entity type |
| `${temperature}` | Attribute value (extracts `.value` from normalized attributes) |

Non-existent attributes are replaced with the string `null`.

### MQTT

Publishes messages to an MQTT broker.

**Example subscription creation:**

```bash
curl -X POST http://localhost:3000/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: demo" \
  -d '{
    "description": "MQTT notification",
    "subject": {
      "entities": [{ "type": "Sensor" }],
      "condition": { "attrs": ["value"] }
    },
    "notification": {
      "mqtt": {
        "url": "mqtt://broker.example.com:1883",
        "topic": "sensors/room/temperature",
        "qos": 1,
        "user": "username",
        "passwd": "password"
      },
      "attrs": ["value"]
    }
  }'
```

**MQTT settings:**

| Field | Description | Default |
|-------|-------------|---------|
| `url` | MQTT broker URL (`mqtt://` or `mqtts://`) | - |
| `topic` | Topic to publish to | - |
| `qos` | QoS level (0, 1, 2) | 0 |
| `retain` | Message retain flag | false |
| `user` | Authentication username | - |
| `passwd` | Authentication password | - |

---

## Conditions and Filtering

### Entity Specification

**Specific ID:**

```json
{
  "subject": {
    "entities": [
      { "id": "Room1", "type": "Room" }
    ]
  }
}
```

**ID pattern (regular expression):**

```json
{
  "subject": {
    "entities": [
      { "idPattern": "Room.*", "type": "Room" }
    ]
  }
}
```

**All entities:**

```json
{
  "subject": {
    "entities": [
      { "idPattern": ".*" }
    ]
  }
}
```

### Condition Expressions (q parameter)

**Comparison operators:**

| Operator | Description | Example |
|----------|-------------|---------|
| `>` | Greater than | `temperature>25` |
| `<` | Less than | `temperature<10` |
| `>=` | Greater than or equal to | `temperature>=20` |
| `<=` | Less than or equal to | `temperature<=30` |
| `==` | Equal to | `status==active` |
| `!=` | Not equal to | `status!=inactive` |

**Logical operators:**

| Operator | Description | Example |
|----------|-------------|---------|
| `;` | AND | `temperature>20;humidity<80` |
| `,` | OR | `type==Room,type==Building` |

**Example:**

```json
{
  "subject": {
    "condition": {
      "attrs": ["temperature"],
      "expression": {
        "q": "temperature>25;temperature<40"
      }
    }
  }
}
```

### Notification Attribute Filtering

**Notify only specific attributes:**

```json
{
  "notification": {
    "attrs": ["temperature", "humidity"]
  }
}
```

**Exclude specific attributes:**

```json
{
  "notification": {
    "exceptAttrs": ["metadata", "internalId"]
  }
}
```

**Notify only changed attributes:**

```json
{
  "notification": {
    "onlyChangedAttrs": true
  }
}
```

---

## Practical Examples

### Example 1: Temperature Threshold Monitoring

A subscription that sends high-temperature alerts:

```bash
curl -X POST http://localhost:3000/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "description": "High temperature alert",
    "subject": {
      "entities": [{ "type": "TemperatureSensor" }],
      "condition": {
        "attrs": ["temperature"],
        "expression": { "q": "temperature>35" }
      }
    },
    "notification": {
      "http": { "url": "https://alerts.example.com/high-temp" },
      "attrs": ["temperature", "location"]
    }
  }'
```

### Example 2: Vehicle Location Tracking

Track vehicle position changes:

```bash
curl -X POST http://localhost:3000/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: fleet" \
  -d '{
    "description": "Vehicle location tracking",
    "subject": {
      "entities": [{ "idPattern": "Vehicle.*", "type": "Vehicle" }],
      "condition": { "attrs": ["location"] }
    },
    "notification": {
      "http": { "url": "https://tracking.example.com/update" },
      "attrs": ["location", "speed", "status"],
      "attrsFormat": "keyValues"
    }
  }'
```

### Example 3: Custom Payload (Slack Notification)

Send a custom-formatted notification to a Slack Webhook:

```bash
curl -X POST http://localhost:3000/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: smartcity" \
  -d '{
    "description": "Slack notification for alerts",
    "subject": {
      "entities": [{ "type": "Alert" }],
      "condition": { "attrs": ["severity"] }
    },
    "notification": {
      "httpCustom": {
        "url": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
        "method": "POST",
        "headers": { "Content-Type": "application/json" },
        "payload": "{\"text\": \"⚠️ Alert: ${id} - Severity: ${severity}\"}"
      }
    }
  }'
```

### Example 4: MQTT Sensor Data Delivery

Deliver sensor data to an MQTT broker:

```bash
curl -X POST http://localhost:3000/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: iot" \
  -d '{
    "description": "Sensor data to MQTT",
    "subject": {
      "entities": [{ "type": "Sensor" }],
      "condition": { "attrs": ["value"] }
    },
    "notification": {
      "mqtt": {
        "url": "mqtts://broker.hivemq.com:8883",
        "topic": "sensors/${type}/${id}",
        "qos": 1
      },
      "attrsFormat": "keyValues"
    }
  }'
```

---

## Best Practices

### 1. Configure Conditions Appropriately

**❌ Bad example: monitoring all entities**

```json
{
  "subject": {
    "entities": [{ "idPattern": ".*" }],
    "condition": { "attrs": [] }
  }
}
```

The volume of notifications will be excessive and put a load on the system.

**✅ Good example: narrow down by specific type and conditions**

```json
{
  "subject": {
    "entities": [{ "type": "Sensor" }],
    "condition": {
      "attrs": ["temperature"],
      "expression": { "q": "temperature>25" }
    }
  }
}
```

### 2. Configure Throttling

Set `throttling` (in seconds) to prevent excessive notifications:

```json
{
  "throttling": 60
}
```

This limits change notifications for the same entity to once every 60 seconds.

### 3. Set an Expiry

Set `expires` for test subscriptions:

```json
{
  "expires": "2026-12-31T23:59:59.000Z"
}
```

### 4. Notify Only Changed Attributes

Reduce unnecessary notifications:

```json
{
  "notification": {
    "onlyChangedAttrs": true
  }
}
```

### 5. Status Management

Set to `inactive` to temporarily stop notifications:

```bash
curl -X PATCH http://localhost:3000/v2/subscriptions/{id} \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: demo" \
  -d '{ "status": "inactive" }'
```

### 6. Error Handling

Implement the following at the notification destination endpoint:
- **Return a 2xx status code**: to indicate success
- **Retry logic**: to handle transient failures
- **Timeout settings**: to prevent long hangs

---

## Access Control and Ownership (GeonicDB Extension)

> **Note**: `super_admin` cannot access subscription endpoints (`/v2/subscriptions`, `/ngsi-ld/v1/subscriptions`) as they are data APIs. Use `tenant_admin` or `user` role instead.

In environments with authentication enabled, ownership-based access control is applied to subscriptions.

### Behavior

- When a subscription is created, the authenticated user's ID is recorded in the `createdBy` field.
- **Update (PATCH) and deletion (DELETE)** can only be performed by users who meet one of the following conditions:
  - The creator of the subscription (`createdBy` matches)
  - The `tenant_admin` role
- If the above conditions are not met, **403 Forbidden** is returned.
- **Retrieval (GET) and listing (LIST)** are unrestricted for any authenticated user within the same tenant.

> **Note**: The same ownership validation applies to registrations (`/v2/registrations`, `/ngsi-ld/v1/csourceRegistrations`).

### XACML attribute-based control on Subscription create (NGSI-LD, #1104)

For `POST /ngsi-ld/v1/subscriptions`, the XACML PIP injects subscription-target attributes into `AuthzRequest.resource`, enabling fine-grained policy control:

| Resource attribute | Source field | Example use |
|--------------------|--------------|-------------|
| `entityType` | `entities[].type` | "Anonymous can subscribe only to `ActivityLog`" |
| `entityId` | `entities[].id` | Restrict to specific entity IDs |
| `entityIdPattern` | `entities[].idPattern` | Restrict by id pattern |
| `notificationEndpoint` | `notification.endpoint.uri` | "Notifications may only be posted to `https://*.example.com/**`" — defence against SSRF / data exfiltration |

When `entities[]` contains multiple elements, **every element must Permit** for the subscription creation to succeed (all-Permit semantics). A single mismatched type or id pattern rejects the entire request with `403 Forbidden`.

> The literal `body.type === "Subscription"` is **not** propagated to `entityType`. Policies must target `entities[].type`, not the wrapper object's type.

For details on authentication and authorization, see [AUTH.md § Subscription PIP attributes](../reference/auth.md#subscription-pip-attributes).

---

## Troubleshooting

### 1. Notifications Are Not Being Delivered

**Causes:**
- Condition expression does not match
- Notification destination URL is unreachable
- Subscription is `inactive` or has expired

**How to check:**

```bash
# Check subscription details
curl http://localhost:3000/v2/subscriptions/{id} \
  -H "Fiware-Service: demo"

# Check status, expires, and lastNotification
```

**Resolution:**
- Test the condition expression: manually update an entity and verify the condition is met
- Test the notification URL: verify it is directly reachable via `curl`
- Change the status to `active`

### 2. Notifications Are Duplicated

**Causes:**
- `throttling` is not configured
- Multiple subscriptions are monitoring the same entity

**Resolution:**

```bash
# Configure throttling
curl -X PATCH http://localhost:3000/v2/subscriptions/{id} \
  -H "Content-Type: application/json" \
  -H "Fiware-Service: demo" \
  -d '{ "throttling": 30 }'

# Check the subscription list
curl http://localhost:3000/v2/subscriptions \
  -H "Fiware-Service: demo"
```

### 3. Notification Payload Is Not as Expected

**Causes:**
- `attrs` filter is not configured correctly
- `attrsFormat` is not appropriate
- `httpCustom` macro syntax is incorrect

**How to check:**

```bash
# Check subscription configuration
curl http://localhost:3000/v2/subscriptions/{id} \
  -H "Fiware-Service: demo" | jq '.notification'
```

**Resolution:**
- Update `attrs` to include the required attributes
- Change `attrsFormat` to `normalized` or `keyValues`
- Verify `httpCustom` macro syntax (the `${attrName}` must match the attribute name)

### 4. MQTT Notifications Are Not Being Sent

**Causes:**
- Cannot connect to the MQTT broker
- Authentication credentials are incorrect
- Topic name is invalid

**How to check:**

```bash
# Test the connection to the MQTT broker (using mosquitto_sub)
mosquitto_sub -h broker.example.com -p 1883 -t "sensors/#" -u username -P password
```

**Resolution:**
- Verify the MQTT broker URL, port, and credentials
- Check that the topic name does not contain special characters
- Try lowering the QoS level to 0

### 5. Subscription Automatically Becomes inactive

**Causes:**
- The notification destination is returning errors continuously (5xx, timeout)
- GeonicDB automatically disabled the subscription

**Resolution:**
- Check the logs of the notification destination endpoint
- Fix the endpoint so it responds correctly
- Set the subscription back to `active`

---

## Related Documentation

- [API Common Specification](../api-reference/endpoints.md) - REST API documentation
- [API_NGSIV2.md](../api-reference/ngsiv2.md) - NGSIv2 Subscriptions API Reference
- [API_NGSILD.md](../api-reference/ngsild.md) - NGSI-LD Subscriptions API Reference
- [EVENT_STREAMING.md](./subscriptions.md) - WebSocket Event Streaming
