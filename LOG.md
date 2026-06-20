# Work log

Append-only journal of finished work bulks. Newest at the BOTTOM.
Append an entry right before the commit that ships each bulk of work.

**Entry grammar:**
```
## YYYY-MM-DD · Short title · #tag1 #tag2
What: 1-2 lines, outcome first.
Refs: [doc](path) (new|updated), PR/commit links.
```

**Retrieval recipes (macOS):**
```bash
grep '^## 20' LOG.md                    # index of all entries
tail -r LOG.md | awk '/^## 20/{c++; if(c==5) exit}' | tail -r  # last 5
```

---