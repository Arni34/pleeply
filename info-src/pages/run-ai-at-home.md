---
title: "Run AI at home: choose your hardware"
nav: Choose your hardware
description: Compare the ways to run a private AI assistant at home — Raspberry Pi 5, Jetson Orin Nano Super, Mac mini, a PC with a GPU, Home Assistant Voice, or a ready-made device — by model size, speed and effort.
section: build
order: 1
updated: 2026-10-24
---

You can run a private AI assistant on anything from a single-board computer to a desktop with a graphics card. Memory is what decides: it sets the largest model you can run, and the model's size sets how capable and how fast your assistant is.

> [!TIP] Short answer
> For a voice assistant with small 1–3B models, a Raspberry Pi 5 with 8 GB works, but answers take several seconds. For conversation-quality 7–8B models, use a machine with about 16 GB of memory, such as an Apple Silicon Mac mini. For the fastest small models on a low-power board, a Jetson Orin Nano Super.

## Choose your setup

:::cards
### [Raspberry Pi 5](/info/raspberry-pi-5-llm/)
**Best for:** tinkerers and always-on, low-power setups.

**Models:** 1–3B at about 5–11 tokens per second; 7B is very slow (about 1.5–2.5).

**Requirements:** the 8 GB or 16 GB board and an active cooler.

### Jetson Orin Nano Super
**Best for:** faster small models on a low-power board.

**Models:** 3B-class models at roughly 22–43 tokens per second in published tests.

**Requirements:** 8 GB of shared memory, so small models only. Launched at $249 in December 2024.

### Mac mini with Apple Silicon
**Best for:** quiet, capable 7–8B models.

**Models:** 16 GB runs 7–8B at 4-bit; 24 GB or more opens 14–32B.

**Requirements:** 16 GB of memory for a useful assistant.

### PC or mini PC with a GPU
**Best for:** larger models and the fastest answers.

**Models:** set by the card's memory; a 12 GB card such as an RTX 3060 runs 7–8B models.

**Requirements:** more power and noise, so it usually lives away from the speaker.

### [Home Assistant Voice + a server](/info/home-assistant-local-llm/)
**Best for:** voice control of a smart home.

**Requirements:** the $59 Voice Preview Edition is a satellite — speech and the language model run on your Home Assistant and Ollama servers.

### [pleeply (in development)](/info/pleeply/)
**Best for:** private AI without assembling it yourself.

**Planned:** a speaker with a built-in computer — One for models up to about 8B, Pro up to about 32B. Expected prices; specs may change.
:::

## Compare at a glance

| Setup | Memory | Practical model size | Watch out for |
|---|---|---|---|
| Raspberry Pi 5 | 8 or 16 GB | 1–3B; 7B is slow | Throttles without active cooling |
| Jetson Orin Nano Super | 8 GB shared | Up to about 3–4B | Published speeds vary by model and runtime |
| Mac mini, 16 GB | 16 GB unified | 7–8B at 4-bit | Memory can't be upgraded later |
| Mac mini, 24 GB or more | 24–64 GB unified | 14–32B at 4-bit | Cost rises quickly with memory |
| PC with a 12 GB GPU | 12 GB of VRAM plus system RAM | 7–8B; more with bigger cards | Power draw and fan noise |
| Home Assistant Voice PE | Uses your server | Depends on the server | Needs a Home Assistant server |

## What size of model do you need?

- **1–3B parameters:** commands, timers, short answers, simple lookups in your notes. Fits 8 GB devices.
- **7–8B:** natural conversation, summaries, better at following instructions. Needs about 16 GB.
- **14–32B:** noticeably better reasoning and writing. Needs 24–48 GB.

Details in [How much RAM a local LLM needs](/info/local-llm-memory/).

## FAQ

### What is the cheapest way to run a local LLM at home?

A Raspberry Pi 5 with 8 GB is the cheapest common option. It runs 1–3B models at roughly 5–11 tokens per second — fine for commands and short answers, slow for conversation.

### Is a Raspberry Pi 5 or a Jetson Orin Nano better for local AI?

For language models, the Jetson Orin Nano Super is several times faster on small models because it has a CUDA GPU: published 3B results are roughly 22–43 tokens per second against about 5 on a Pi 5. The Pi 5 is cheaper, simpler and has more community guides.

### Can a Mac mini run a local LLM?

Yes. Apple Silicon Macs share memory between the CPU and GPU, so a 16 GB Mac mini runs 7–8B models at 4-bit quantization, and 24 GB or more fits 14–32B models.

### Do I need a GPU to run AI at home?

No. Small models run on CPUs, including the Raspberry Pi 5's. A GPU or Apple Silicon makes larger models fast enough for conversation.

## Sources

- Raspberry Pi 5 speeds: [Stratosphere Linux IPS — LLM performance on Raspberry Pi 5](https://stratospherelinuxips.readthedocs.io/en/develop/immune/research_rpi_llm_performance.html), [bestllmfor — Local LLM on Raspberry Pi 5](https://bestllmfor.com/best/raspberry-pi-5-llm/)
- Jetson Orin Nano Super: [ComputingForGeeks — Edge LLM: Jetson Orin vs AI HAT+ 2 vs Hailo-10H](https://computingforgeeks.com/edge-llm-jetson-orin-vs-ai-hat-2-vs-hailo-10h/), [AI Made Tools — How to run LLMs on Raspberry Pi 5 (2026)](https://www.aimadetools.com/blog/how-to-run-llms-on-raspberry-pi-5-2026/)
- Mac memory guidance: [Starmorph — Best Mac mini for local LLMs](https://blog.starmorph.com/blog/best-mac-mini-for-local-llms)
- RTX 3060 build: [jpk.io — Fully local voice assistant with Home Assistant Voice PE and Ollama](https://jpk.io/home-automation/home-assistant-voice-pe-local-llm/)
- Voice Preview Edition: [CNX Software — $59 Voice Preview Edition](https://www.cnx-software.com/2024/12/20/59-voice-preview-edition-adds-an-offline-smart-speaker-to-your-home-assistant-server/)
