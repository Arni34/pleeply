---
title: Run an LLM on a Raspberry Pi 5
nav: LLM on a Raspberry Pi 5
description: What a Raspberry Pi 5 can run — measured tokens per second for 1–3B models, which models to pick for a voice assistant, why cooling matters, and how to install Ollama.
section: build
order: 2
updated: 2026-10-24
---

A Raspberry Pi 5 can run small language models locally. In Ollama tests with 4-bit models it generates about 11 tokens per second with 1B models and about 5 with 3B models — enough for short voice answers, too slow for long conversation. Use the 8 GB or 16 GB board and an active cooler.

## Measured speeds

| Model | Quantization | Tokens per second |
|---|---|---|
| Gemma 3 1B | Q4_K_M | 11.5 |
| Llama 3.2 1B | Q4_K_M | 11.2 |
| Qwen 2.5 1.5B | Q4_K_M | 10.0 |
| SmolLM2 1.7B | Q4_K_M | 8.2 |
| Granite 3.1 2B | Q4_K_M | 5.8 |
| Qwen 2.5 3B | Q4_K_M | 5.2 |
| Llama 3.2 3B | Q4_K_M | 4.7 |

Measured with Ollama on a Raspberry Pi 5 by the Stratosphere Linux IPS project. Larger models are much slower: about 1.5–2.5 tokens per second for 7B models on the 16 GB board.

## Which model to pick

- **For a voice assistant:** a 1–1.5B model (Gemma 3 1B, Llama 3.2 1B, Qwen 2.5 1.5B) keeps answers to a few seconds.
- **For better answers:** a 3B model (Qwen 2.5 3B, Llama 3.2 3B) is about half as fast but follows instructions better.
- **7B and up:** it fits on the 16 GB board, but at 1.5–2.5 tokens per second a one-paragraph answer takes close to a minute.

## Install Ollama

1. Install 64-bit Raspberry Pi OS and update it.
2. Install Ollama with its official script:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

3. Download and start a small model:

```bash
ollama run llama3.2:1b
```

4. Try a larger one with `ollama run llama3.2:3b`. Type `/bye` to exit.

Ollama also serves an API on port 11434, which Home Assistant and other apps can use — see [Use a local LLM with Home Assistant](/info/home-assistant-local-llm/).

## Tips for speed

- **Cooling.** Without active cooling the chip throttles under sustained load, which can roughly halve throughput. The official Active Cooler is enough.
- **AI HAT accelerators.** Hailo-based AI HATs speed up vision and some speech workloads, but independent tests found they don't speed up token generation for language models; the Pi's CPU is faster at it.
- **Keep the model loaded** between requests so it isn't read from storage each time.
- **Storage.** An NVMe SSD loads models faster than a microSD card.

## Is a Pi 5 enough for a voice assistant?

For commands and short answers, yes: guides report about 5–8 seconds per request with a small model, Whisper and Piper. For natural back-and-forth it's slow; faster hardware helps most at the language-model step. Compare options in [Choose your hardware](/info/run-ai-at-home/).

## FAQ

### Can a Raspberry Pi 5 run Llama?

Yes. Llama 3.2 1B runs at about 11 tokens per second and Llama 3.2 3B at about 4.7 tokens per second with 4-bit quantization in Ollama.

### What is the best LLM for a Raspberry Pi 5?

For speed, Gemma 3 1B or Llama 3.2 1B at about 11 tokens per second. For better answers at a usable speed, Qwen 2.5 3B or Llama 3.2 3B at about 5 tokens per second.

### Can a Raspberry Pi 5 run a 7B model?

On the 16 GB board, yes, but slowly — about 1.5–2.5 tokens per second.

### Does the Raspberry Pi AI HAT speed up LLMs?

Independent tests found it doesn't speed up token generation for language models. It helps with vision and some speech workloads.

## Sources

- Speed table: [Stratosphere Linux IPS — LLM performance on Raspberry Pi 5](https://stratospherelinuxips.readthedocs.io/en/develop/immune/research_rpi_llm_performance.html)
- 7B speeds, cooling and AI HAT: [bestllmfor — Local LLM on Raspberry Pi 5](https://bestllmfor.com/best/raspberry-pi-5-llm/)
- AI HAT+ 2 decode tests: [ComputingForGeeks — Edge LLM: Jetson Orin vs AI HAT+ 2 vs Hailo-10H](https://computingforgeeks.com/edge-llm-jetson-orin-vs-ai-hat-2-vs-hailo-10h/)
- End-to-end latency: [PromptQuorum — Build a local voice assistant (2026)](https://www.promptquorum.com/power-local-llm/build-local-voice-assistant-2026)
- Install script: [Ollama — Download for Linux](https://ollama.com/download/linux)
