# Service connections and REST calls

A service connection (`kind: "serviceConnection"`, `options.connectionType: "RestApi"`) describes an external
HTTP API by its OpenAPI document. Flows call it with the `CallRestApi` action.

## Configuration (`options.configuration`)

```json
{
  "url": "https://api.example.com",
  "openApiSpecs": "<the whole OpenAPI document as text, JSON or YAML>",
  "securitySchemes": [
    { "type": 1, "name": "apiKey", "key": "x-api-key", "location": "header" },
    { "type": 3, "name": "oauth", "flow": "clientCredentials", "clientId": "<id>", "accessTokenUrl": "https://login/token", "scope": "api://x/.default" }
  ]
}
```

Scheme types: `1` API key (`key`, `location`: header, query or cookie), `2` HTTP (`scheme`: basic), `3` OAuth 2
(`flow`: clientCredentials, authorizationCode, implicit, password; `clientId`, `accessTokenUrl`, `authUrl`,
`callbackUrl`, `scope`), `4` OpenID Connect (configure it in the designer).

**Credentials** (`value`, `password`, `clientSecret`) never go through Claude: Foundry redacts them on read
(`"<redacted>"`), refuses them on save, and keeps the stored value when you send `"<redacted>"` back. The plan lists
setting them as an administrator task, done in the service connection designer.

## Calling it

```json
"Get Policy": {
  "type": "CallRestApi", "metaInfo": {},
  "serviceName": "PolicyAdmin", "projectName": "<project>",
  "operation": { "id": "getPolicy", "path": "/policies/{number}", "httpMethod": "GET" },
  "security": { "securitySchemeName": "oauth", "scopes": [] },
  "parameters": [ { "name": "number", "location": "path", "value": { "type": "context", "var": "input#PolicyNumber", "prop": [] } } ],
  "request": { "actions": {} },
  "responses": { "200": { "actions": {} } },
  "errorHandler": { "actions": {} },
  "timeout": 30
}
```

- The operation must exist in the OpenAPI document (by `id`, `path` and method).
- Results: `<action>#request`, `<action>#response#<status>`, `<action>#response#<status>#raw`, `<action>#error`.
- Wrap the call in `TryCatch` (or give `errorHandler`) and record the error where people see it (rule LF-011).
- Tests never call production APIs. In development and test environments the connection itself points at the
  sandbox: its URL and credential are set per environment by the service connection map at import (the Logic Fabric CLI
  plugin, `flowon-dynamics`) or by an administrator in the designer. Never put a key, sandbox or not, in a configuration value, a
  flow or metadata.
