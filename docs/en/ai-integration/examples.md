---
title: AI Integration Examples
description: Working code examples for integrating AI agents with Vela OS using Python with Claude SDK, OpenAI SDK, and curl with MCP.
outline: deep
---

# AI Integration Examples

This page provides working code examples for integrating AI agents with Vela OS through different approaches.

## Python + Claude API

Use the Anthropic Python SDK with Vela's tool definitions:

```python
import anthropic
import requests
import json

VELA_API = "https://api.vela.geolonia.com"
API_KEY = "YOUR_API_KEY"

# Step 1: Fetch tool definitions from Vela
tools = requests.get(f"{VELA_API}/tools.json").json()["tools"]

# Step 2: Create Claude client and send a request with tools
client = anthropic.Anthropic()
response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    tools=tools,
    messages=[
        {"role": "user", "content": "List all temperature sensors"}
    ]
)

# Step 3: Process tool calls from Claude's response
for block in response.content:
    if block.type == "tool_use":
        tool_name = block.name
        tool_input = block.input

        # Map tool name to Vela API endpoint and method
        if tool_name == "list_entities":
            result = requests.get(
                f"{VELA_API}/v2/entities",
                headers={"Authorization": f"Bearer {API_KEY}"},
                params=tool_input
            )
        elif tool_name == "get_entity":
            result = requests.get(
                f"{VELA_API}/v2/entities/{tool_input['id']}",
                headers={"Authorization": f"Bearer {API_KEY}"}
            )
        # Handle other tools similarly...

        print(f"Tool: {tool_name}")
        print(f"Input: {json.dumps(tool_input, indent=2)}")
        print(f"Result: {result.json()}")
```

## Python + OpenAI API

Use the OpenAI Python SDK with Vela's tool definitions transformed to function calling format:

```python
import openai
import requests
import json

VELA_API = "https://api.vela.geolonia.com"
API_KEY = "YOUR_API_KEY"

# Step 1: Fetch and transform tool definitions
tools_data = requests.get(f"{VELA_API}/tools.json").json()
openai_tools = [
    {
        "type": "function",
        "function": {
            "name": tool["name"],
            "description": tool["description"],
            "parameters": tool["input_schema"],
        }
    }
    for tool in tools_data["tools"]
]

# Step 2: Create OpenAI client and send a request
client = openai.OpenAI()
response = client.chat.completions.create(
    model="gpt-4",
    tools=openai_tools,
    messages=[
        {"role": "user", "content": "Search for sensors near Shibuya Station"}
    ]
)

# Step 3: Process function calls
for choice in response.choices:
    if choice.message.tool_calls:
        for tool_call in choice.message.tool_calls:
            function_name = tool_call.function.name
            arguments = json.loads(tool_call.function.arguments)

            print(f"Function: {function_name}")
            print(f"Arguments: {json.dumps(arguments, indent=2)}")
```

## curl + MCP

Interact with Vela's MCP server directly using curl:

### Initialize MCP Session

```bash
curl -X POST https://api.vela.geolonia.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": {"name": "curl-test", "version": "1.0.0"}
    }
  }'
```

### List Available Tools

```bash
curl -X POST https://api.vela.geolonia.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'
```

### Call a Tool (List Entities)

```bash
curl -X POST https://api.vela.geolonia.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "entities",
      "arguments": {
        "action": "list",
        "type": "TemperatureSensor",
        "limit": 10
      }
    }
  }'
```

### Create an Entity via MCP

```bash
curl -X POST https://api.vela.geolonia.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "entities",
      "arguments": {
        "action": "create",
        "entity": {
          "id": "urn:ngsi-ld:TemperatureSensor:001",
          "type": "TemperatureSensor",
          "temperature": 25.5,
          "location": {
            "type": "Point",
            "coordinates": [139.6917, 35.6895]
          }
        }
      }
    }
  }'
```

## Fetching llms.txt for Context

Any AI integration can start by fetching the llms.txt endpoint to understand the API:

```python
import requests

# Fetch LLM-optimized documentation
llms_txt = requests.get("https://api.vela.geolonia.com/").text

# Use as system context for your LLM
print(f"API documentation length: {len(llms_txt)} characters")
```

## Next Steps

- [Overview](/en/ai-integration/overview) — AI integration architecture overview
- [MCP Server](/en/ai-integration/mcp-server) — Detailed MCP configuration
- [tools.json](/en/ai-integration/tools-json) — Tool definition schema reference
