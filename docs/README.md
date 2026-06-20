# docs/ — durable knowledge

> **Schema**: Each file in this directory is a **doc** — something you learned, analyzed, or
> decided that you want to be findable later.
>
> ```yaml
> ---
> kind: doc
> domain: []        # which loop(s) this belongs to
> status: draft | adopted | superseded
> links: []         # related artifacts, [[slug]] or paths
> ---
> ```
>
> See `ARCHITECTURE.md` for the full model.