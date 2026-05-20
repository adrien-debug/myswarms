# Migration front Next.js myswarms → helm — hearst-os

**Date** : 2026-05-20

## Pages portées

| myswarms (avant) | helm — hearst-os (après) |
|---|---|
| `/swarms` | `/admin/orchestrator/swarms` |
| `/swarms/new` | `/admin/orchestrator/swarms/new` |
| `/swarms/[id]` | `/admin/orchestrator/swarms/[id]` |
| `/swarms/[id]/edit` | `/admin/orchestrator/swarms/[id]/edit` |
| `/swarms/[id]/runs/[runId]` | `/admin/orchestrator/swarms/[id]/runs/[runId]` |
| `/crews/chief-of-staff` | `/admin/orchestrator/crews/chief` |
| `/crews/chief-of-staff/history` | `/admin/orchestrator/crews/chief/history` |
| `/crews/chief-of-staff/runs/[runId]` | `/admin/orchestrator/crews/chief/runs/[runId]` |
| `/tools` | `/admin/orchestrator/tools` |

## API Routes portées (proxy Helm)

Tous les `/api/swarms/*` et `/api/crews/*` myswarms sont désormais
exposés via le proxy Helm `/api/crewai/[...path]` qui forward vers
le backend Python `services/crewai-engine/`.

## Pourquoi cette migration

Helm est devenu la plateforme user-facing principale (renommée Hive
en branding). Avoir 2 fronts Next.js indépendants était une dette
(doublons de design, double maintenance). Le backend Python reste
le coeur de l'orchestration CrewAI.

## Comment restaurer (au cas où)

```bash
git mv .archive/front-nextjs-2026-05-20/* .
# Restaurer package.json
git checkout HEAD~10 -- package.json
```
