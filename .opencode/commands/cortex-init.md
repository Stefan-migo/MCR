---
description: Bootstrap Cortex skill pack in a project — links skills, initializes Graphify, runs SDD init
agent: gentle-orchestrator
---

## cortex-init

Bootstraps the Cortex skill pack into the current project. This command:

1. **Links cortex-persona skill** (persona, Ponytail rules, 5-Step Gate, Graphify)
2. **Links Ponytail skills** (ponytail-review, ponytail-audit, ponytail-debt, ponytail-help)
3. **Initializes Graphify** (knowledge graph extraction from the codebase)
4. **Suggests `/sdd-init`** to complete the setup

### What the orchestrator does

1. Check if `.opencode/skills/cortex-persona` already exists — if yes, skip.
2. Delegate to a sub-agent with bash access to **run `cortex-init.sh`** from the Cortex repo:
   - `bash /home/stefan/Cortex/cortex-init.sh`
   - The script handles linking skills, initializing Graphify, and creating `.opencode/commands/cortex-init.md`
3. After the script completes, suggest running `/sdd-init` to set up SDD context for the project.

### Notes

- `cortex-init.sh` is the single entry point — it lives at `/home/stefan/Cortex/cortex-init.sh`
- The script is idempotent: safe to run multiple times
- Requires: graphify, gentle-ai (check if absent and suggest installing)
