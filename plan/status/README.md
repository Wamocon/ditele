# plan/status/ — live build state

**This folder is the build's memory.** Chats die; these files do not. A fresh chat on a different account reads them and continues exactly where the last one stopped.

| File | Written by | Read by | Contains |
|---|---|---|---|
| `BOARD.md` | you (coordinator) | you | Who owns which workstream right now, gate log, infrastructure track |
| `WS-0.md` | WS-0 | **everyone, first** | Foundation state, the **working login password**, what moved to 0b, what was seeded, RLS findings per role, component landings |
| `RPC_CONTRACTS.md` | WS-0 | **everyone, first** | The real introspected signature of every P0 RPC — argument names, types, return shape |
| `WS-1.md` … `WS-7.md` | that workstream | the next chat on it, WS-7 | `RESUME HERE` block, route checklist, data functions, gates, deferred items |
| `ISSUES.md` | everyone, append-only | coordinator | Cross-workstream problems |
| `RELEASE.md` | WS-7 | you | Final honest state: shipped, not shipped, known bugs, next session |

## The rule that makes handoff work

> **Update your status file after every file you finish. Commit after every route.**
> Not at the end. Token limits give no warning — a chat that writes its handoff at the end never writes one.

## Every `WS-<n>.md` starts with this

```markdown
## RESUME HERE
Updated: <when> · Chat: #<n> for this workstream
**State:** IN PROGRESS | HANDOFF READY | DONE

**Done and committed:**
- <route> — <what works>

**Half-finished:**
- <file> — <exact state, does it compile>

**Next, in order:**
1. …

**Things I learned that are written down nowhere else:**
- <RPC quirks, empty tables, component surprises>

**Blocked on:**
- <nothing / ISSUES.md I-00n>
```

The last two sections are the valuable ones. Anyone can read the code to see which routes exist. **Nobody can recover what you learned the hard way** unless you wrote it down.

Full protocol: [../04_PROMPTS_AND_HANDOFF.md](../04_PROMPTS_AND_HANDOFF.md) §4.
