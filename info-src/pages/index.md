---
title: Your own AI at home
nav: Overview
description: Guides to running a private AI assistant at home — how local voice assistants work, what hardware you need, how smart speakers handle your voice, and where pleeply fits in.
section: start
order: 1
updated: 2026-10-24
---

You can run an AI assistant at home that listens, answers and remembers without sending your voice to a company's servers. These docs explain how that works, what it takes to build one yourself, and how it compares with cloud speakers like Alexa.

> [!TIP] Short answer
> A local AI assistant runs four things on a computer in your home: a wake word detector, speech-to-text (for example Whisper), an open-weight language model (for example Llama, Qwen or Gemma) and text-to-speech (for example Piper). A Raspberry Pi 5 handles small 1–3B models; conversation-quality 7–8B models need about 16 GB of memory. See [Choose your hardware](/info/run-ai-at-home/).

## In this section

- [What is a local AI assistant?](/info/local-ai-assistant/) — how on-device AI differs from cloud assistants, and what you give up.
- [How a local voice assistant works](/info/how-local-voice-assistants-work/) — the pipeline from wake word to spoken answer, and where the delay comes from.
- [Do smart speakers send your voice to the cloud?](/info/smart-speaker-privacy/) — what changed for Amazon Echo in March 2025.
- [Choose your hardware](/info/run-ai-at-home/) — from a Raspberry Pi to a PC with a graphics card.
- [Run an LLM on a Raspberry Pi 5](/info/raspberry-pi-5-llm/) — measured speeds and which models to pick.
- [Use a local LLM with Home Assistant](/info/home-assistant-local-llm/) — Assist, Ollama and the Voice Preview Edition.
- [How much RAM a local LLM needs](/info/local-llm-memory/) — rules of thumb for 8, 16, 24 and 48 GB.
- [Private alternatives to Alexa](/info/alexa-alternatives/) — compared on privacy, cost and effort.
- [Open-source voice assistants compared](/info/open-source-voice-assistants/) — Assist, OpenVoiceOS, Neon, Rhasspy, Mycroft.
- [What is pleeply?](/info/pleeply/) — the speaker we're building, and its status.

## Choose your path

:::cards
### [Understand it first](/info/local-ai-assistant/)
**Best for:** deciding whether local AI is worth it.

What runs where, how good small models are, and what stays private.

### [Build it yourself](/info/run-ai-at-home/)
**Best for:** tinkerers with a Raspberry Pi, a Mac mini or a spare PC.

**Requirements:** 8 GB of memory for small models, 16 GB or more for 7–8B models.

### [Use Home Assistant](/info/home-assistant-local-llm/)
**Best for:** controlling a smart home by voice.

**Requirements:** a Home Assistant server and an Ollama server on your network.

### [Get a ready-made device](/info/pleeply/)
**Best for:** private AI without assembling it yourself.

pleeply is in development. The waitlist is open.
:::

## How these pages are written

Every number and date links to its source at the bottom of the page. Speeds on small hardware vary a lot with the model, the quantization and the runtime, so treat them as ranges, not promises. Each page shows when it was last checked.
