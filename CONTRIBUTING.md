# Contributing

Use Node.js 22 or newer, run npm ci, and run npm run check before proposing a
change. Tests and normal queries run without network access.

For data changes, state the exact law/revision, selected elements, source,
license, observation day, extraction method, and coverage limitations.
Retain old evidence artifacts. Do not commit private material or credentials.

The importer writes new graph files only. Validate new files explicitly:

```sh
node src/cli.mjs validate --graph data/laws/<law-id>/<snapshot>.graph.json
```

Update source-specific attribution when adding a provider. Label synthetic
fixtures as synthetic and keep them outside data/.
