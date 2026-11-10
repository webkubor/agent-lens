# Agent harness token weight — measured on a real gateway

A 7-day measurement from one machine running several agent harnesses behind a single
[magpie](https://github.com/yetone/magpie) gateway. Every number below comes from the
gateway's own usage ledger and from a read-only hook that measures the `tools` array
each harness re-sends with every request. Nothing is estimated from a model card.

**Why this page exists:** model pricing pages tell you what a token costs. They do not
tell you how many tokens your *harness* throws away before the model reads anything.
The tool definitions a harness re-sends on every turn are billed as input, on every
single request, for the whole session. Only the gateway can see them.

## Setup

- One gateway, one machine, 7 days, 83,420 requests.
- 17.49B input tokens read, 16.20B of them served from cache (92.6% hit rate).
- 1.29B tokens billed at full price (the part the cache did not cover).
- Harnesses measured: DeepSeek Harness, Claude Code, ZCode, Codex, MiMo Code,
  Claude Desktop, Hermes Agent.
- Tool definitions measured on 2,376 sampled requests.

## The headline: tool definition weight per harness

| Harness | Tools per request | Tokens per request | Share of its own input tokens | Samples |
|---|---|---|---|---|
| **Claude Code** | 43.9 | **36,487** | **25.8%** | 573 |
| **MiMo Code** | 15.0 | 15,639 | 10.0% | 184 |
| **DeepSeek Harness** | 58.0 | **13,117** | **5.9%** | 1,619 |

Two things worth noticing:

1. **Claude Code spends more than a quarter of its input budget re-sending tool
   definitions.** Not the conversation — the tools. On every request, for the whole
   session.
2. **More tools does not mean more weight.** DeepSeek Harness sends 58 tools per
   request and Claude Code sends 44, yet Claude Code's definitions are **2.8× heavier**
   (36.5K vs 13.1K tokens). Tool *count* is a bad proxy for tool *cost*: a handful of
   long, richly-described tools can outweigh a dozen short ones.

The same three harnesses over 30 days: Claude Code 27.7% of input tokens, DeepSeek
Harness 5.3%, MiMo Code 4.0% — the ratio is stable, not a one-off.

## Cost per harness over 7 days

| Harness | Input tokens | Cache hit rate | Tokens at full price | Failure rate | p50 latency | p50 time-to-first-token |
|---|---|---|---|---|---|---|
| DeepSeek Harness | 15.19B | 92.7% | 1.110B | 0.8% | 8.1 s | 5.6 s |
| Claude Code | 1.18B | 94.4% | 66.5M | 0.3% | 5.9 s | 4.0 s |
| ZCode | 778M | 92.0% | 62.2M | 0.3% | 11.6 s | 7.2 s |
| Codex | 161M | 87.2% | 20.6M | 0.8% | 14.0 s | 10.3 s |
| MiMo Code | 90.3M | 86.9% | 11.8M | 3.8% | 19.1 s | 4.9 s |
| Claude Desktop | 65.1M | 77.2% | 14.9M | 1.7% | 6.0 s | 7.6 s |
| Hermes Agent | 33.9M | 84.2% | 5.4M | 0.2% | 10.9 s | 4.4 s |

Caveat on the totals: input tokens are dominated by one harness (DeepSeek Harness at
86.8% of all input tokens), so a raw token ranking mostly ranks *how much you used that
harness*, not how expensive it is. The columns to compare across harnesses are the
per-request weight, the cache hit rate, and the tool definition share.

## What this means in practice

- **A harness with a heavy tool surface is billed for it on every turn.** Claude Code's
  36.5K tokens per request is ~9 ms of extra upload per request at typical bandwidth,
  and it is 26% of everything the model reads. Trimming or deferring tools (the
  `DeferredToolPlaceholder` pattern some harnesses use) is a direct cost win.
- **Cache hit rate is the biggest lever, and harnesses differ.** 94.4% vs 77.2% between
  Claude Code and Claude Desktop — a 17-point gap on the same gateway, worth more than
  any tool tuning.
- **Failures still cost tokens.** MiMo Code fails 3.8% of requests, and a failed
  request still reads its prompt.
- **Tool count is not the metric to optimise.** If you are going to cut tools, cut by
  measured bytes, not by count.

## Reproduce it

HarnessWeight is a magpie plugin. Install it, and it reads this machine's
`~/.config/magpie/usage.jsonl` for the token side and a read-only gateway hook for the
tool-definition side:

```sh
magpie plugin add github:webkubor/harnessweight
```

Then open the HarnessWeight page in magpie. The service listens on 127.0.0.1 only,
generates a random token per start, and validates `Host` and `Origin`. It reads nothing
outside your machine and sends nothing out.

## Methodology

- **Tokens:** taken from the gateway's usage ledger (`~/.config/magpie/usage.jsonl`),
  which records per-request input, output, cache-read and cache-write counts. Full-price
  tokens are the ones not served from cache.
- **Tool definitions:** a `magpie.hooks` plugin measures the `tools` array on
  `onResponse` for every request, across all four protocol shapes magpie accepts
  (Anthropic `tools[].input_schema`, OpenAI chat `tools[].function`, Responses, Gemini
  `functionDeclarations`). Tool bytes are the JSON size of that array; tokens are
  estimated at 3.5 bytes per token. The hook never changes a request and never records
  prompts, arguments or credentials.
- **Tool names are not published here.** This page reports counts and sizes only.
- **Period:** 7 days ending on the date of this file, 83,420 requests, one machine, one
  gateway. Absolute numbers are specific to this setup; the ratios between harnesses are
  the part that should generalise.

<!-- The numbers above are a real measurement on one machine, not a benchmark of the
     harnesses themselves. They describe what these harnesses did here. -->
