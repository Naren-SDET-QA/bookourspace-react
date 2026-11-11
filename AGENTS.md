# Agent notes — bookourspace-react

## graphify

The `graphify` skill is installed at `~/.agents/skills/graphify/SKILL.md` (skill name: `graphify`).
Use it for questions about this codebase's architecture, file relationships, or module content.

- Build/refresh the graph: `/graphify .` (or `graphify extract . --code-only` for a local AST-only pass, no API key).
- Outputs land in `graphify-out/` (`graph.json`, `GRAPH_REPORT.md`, `graph.html`).
- Once `graphify-out/graph.json` exists, prefer graph queries over raw grepping:
  - `graphify query "how does booking payment verification flow?"`
  - `graphify explain "PaymentService"`
  - `graphify path "Header" "StaysPage"`
  - `graphify affected "server.ts"` (reverse impact)
  - `graphify god-nodes` (architectural hubs)

Grep/read still apply when the graph is stale or the answer needs exact current source.
