---
name: "deterministic-pii-masking"
description: "How to implement a deterministic PII masking layer for demo/streamer mode in TypeScript MCP servers"
domain: "privacy, api-design, integration"
confidence: "high"
source: "earned"
---

## Context

When an MCP server exposes student data (names, IDs, grades, dates), you may need a "streamer mode" that masks PII for demos or livestreams while keeping output realistic. The masking must be:

- **Deterministic per session** — same input always produces same output so the demo looks consistent
- **Transparent to internals** — the masking layer sits at the public boundary only; internal auth and API calls see real data
- **Zero-dependency** — uses only math primitives, no external libs

## Patterns

### 1. Boundary-only masking

Apply masking at the outermost public method return point. Internal helpers (`resolveStudent`, `fetchX`, `normalizeX`) work with real data. This ensures that session-cookie auth, URL construction, and response normalization all function correctly.

```typescript
// client.ts
public async getGrades(selector = {}): Promise<GradesSnapshot> {
  const student = await this.resolveStudent(selector, false);       // real IDs
  const grades  = await this.fetchGradesFromApi(student, ...);      // real IDs in URLs
  const snapshot: GradesSnapshot = { student, grades, source: 'api', ... };
  return this.streamerMode ? maskGradesSnapshot(snapshot) : snapshot; // mask at boundary
}
```

### 2. DJB2 + seeded-float for determinism

```typescript
function djb2(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function seededFloat(hash: number): number {
  const x = Math.sin(hash + 1) * 10000;
  return x - Math.floor(x);
}

function perturbNumeric(value: number, seed: string, maxDelta: number): number {
  const rng = seededFloat(djb2(seed));
  const delta = (rng * 2 - 1) * maxDelta;
  return Math.round((value + delta) * 10) / 10;
}
```

Use `courseId ?? courseName` as the seed for grade values so the same course always shows the same fake percent.

### 3. Last-name masking convention

```typescript
function maskLastNameToken(name: string): string {
  return name[0] + '*'.repeat(Math.max(name.length - 1, 3));
}
// "Spaid" → "S****", "Li" → "L***"
```

For full names, keep all tokens except the last (last name):
```typescript
function maskFullName(fullName: string | undefined): string | undefined {
  if (!fullName) return undefined;
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return maskLastNameToken(parts[0]);
  return `${parts.slice(0, -1).join(' ')} ${maskLastNameToken(parts[parts.length - 1])}`;
}
```

### 4. Opaque deterministic identifiers

Replace real IDs with a short stable hex token so the demo can reference IDs without exposing real ones:

```typescript
function maskIdentifier(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return `demo-${djb2(id).toString(16).padStart(8, '0')}`;
}
```

### 5. Env-var activation

```typescript
export function isStreamerModeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v1 = env.STREAMER_MODE?.trim().toLowerCase();
  const v2 = env.EPS_STREAMER_MODE?.trim().toLowerCase();
  return v1 === 'true' || v1 === '1' || v2 === '1' || v2 === 'true';
}
```

Accept two spellings (`STREAMER_MODE` and `EPS_STREAMER_MODE`) for flexibility. Read `env` as a parameter for testability.

## Examples

Reference implementation: `mcp-servers/infinite-campus/src/streamer-mode.ts`  
Integration: `mcp-servers/infinite-campus/src/client.ts` — `streamerMode` field, masking at each public method boundary.

## Anti-Patterns

- **Masking internal helpers** — causes real student IDs to be replaced before they're used in API URLs, breaking auth and data fetching.
- **Random (non-seeded) masking** — each call shows different fake grades, making the demo look broken.
- **Masking in index/server layer** — moves masking too far from the data; forces every caller to remember to apply it.
- **Removing fields entirely** — breaks consumers that rely on the schema shape. Mask the value, don't delete the key.
