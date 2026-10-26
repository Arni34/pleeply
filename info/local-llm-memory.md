# How much RAM do you need to run a local LLM?

> Memory sets the largest model you can run at home. Rules of thumb for 8, 16, 24 and 48 GB, what 4-bit quantization does, and how the context window adds to it.

Source: https://pleeply.vercel.app/info/local-llm-memory/ · Updated 2026-10-24

Memory decides which language models you can run locally. As a rule of thumb, 8 GB runs small 1–3B models, 16 GB runs 7–8B models at 4-bit quantization, 24 GB or more opens 14–32B models, and the largest open models need 48 GB or more.

## Rules of thumb

| Memory | What fits comfortably | Good for |
|---|---|---|
| 8 GB | 1–3B models, up to about 3.8B | Commands, timers, short answers |
| 16 GB | 7–8B at 4-bit | Everyday conversation and summaries |
| 24–32 GB | 14–32B at 4-bit | Better reasoning and writing |
| 48 GB or more | Larger models | Closest to cloud quality |

## How to estimate

A model's weights take roughly parameters × bits per weight ÷ 8 bytes.

- An 8B model at 4 bits: 8 billion × 4 ÷ 8 ≈ 4 GB. Llama 3.1 8B at Q4 is about 4.9 GB on disk.
- Keep the model to about 60–70% of total memory, leaving room for the operating system, the context and other apps.
- On a Mac, leave 4–8 GB for macOS and your apps.

## What quantization means

Quantization stores each weight with fewer bits — for example 4 instead of 16 — so the model needs about a quarter of the memory. Q4_K_M is a common 4-bit format in llama.cpp and Ollama that keeps quality close to the original for most everyday tasks. Lower-bit formats save more memory and lose more quality.

## The context window uses memory too

The context window is how much text the model considers at once. Its memory grows with its length, so long conversations and large smart homes cost RAM. Home Assistant, for example, sets an 8k-token context for Ollama by default, up from Ollama's own 2k.

## Apple Silicon vs a PC

Apple Silicon Macs use unified memory shared by the CPU and GPU, so most of the RAM is available to the model. On a PC with a graphics card, the model should fit in the card's own memory (VRAM) to run fast; a 12 GB card runs 7–8B models well.

## FAQ

### Can 8 GB of RAM run Llama?

Yes, the small versions. Llama 3.2 1B and 3B run on 8 GB. An 8B model at 4-bit technically fits, but leaves only about 3 GB for everything else and tends to swap.

### How much RAM does a 7B model need?

About 4–5 GB for the weights at 4-bit quantization, so a machine with 16 GB runs it comfortably.

### How much memory does a 70B model need?

Roughly 35–40 GB at 4-bit for the weights alone, so plan for 48 GB or more.

### Does a longer context window use more RAM?

Yes. Context memory grows with its length, so a 32k context needs noticeably more than the default 2k–8k.

## Sources

- [Refurb.me — Run local AI on a Mac](https://www.refurb.me/blog/run-local-ai-on-mac)
- [Starmorph — Best Mac mini for local LLMs](https://blog.starmorph.com/blog/best-mac-mini-for-local-llms)
- [LocalClaw — Best local LLMs for Mac mini M4](https://localclaw.io/guides/best-local-llms-for-mac-mini-m4)
- [Home Assistant — Ollama integration (context window defaults)](https://www.home-assistant.io/integrations/ollama/)
