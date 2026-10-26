---
title: Use a local LLM with Home Assistant
nav: Home Assistant + local LLM
description: How to connect Home Assistant's Assist to a local language model with Ollama, what the Voice Preview Edition does, which settings matter, and how to keep commands fast.
section: build
order: 3
updated: 2026-10-24
---

Home Assistant can use a local language model as its conversation agent through the built-in Ollama integration. You run Ollama on a machine in your network, point Home Assistant at it, and Assist answers questions and — as an experimental feature — controls the devices you expose, with no cloud AI service involved.

## What you need

- A Home Assistant server.
- Ollama on the same machine or another one on your network (it listens on port 11434). For quick answers use a machine with a GPU or Apple Silicon; a Raspberry Pi works with small models, slowly.
- Local speech: the Whisper (speech-to-text) and Piper (text-to-speech) add-ons. If your server is too weak, Home Assistant can send speech to its paid cloud instead.
- A voice device, such as the Home Assistant Voice Preview Edition.

## Set it up

1. Install Ollama and download a model that supports tool calling, for example `ollama pull qwen2.5:7b`. If Ollama runs on another machine, make it listen on the network with `OLLAMA_HOST=0.0.0.0`.
2. In Home Assistant, open **Settings → Devices & services → Add integration**, choose **Ollama** and enter the server URL, for example `http://192.168.1.20:11434`.
3. Pick the model. Home Assistant downloads it if it isn't there yet.
4. Open **Settings → Voice assistants**, edit your assistant and set the conversation agent to Ollama. Choose Whisper and Piper for speech.
5. Optionally allow it to control Home Assistant (experimental) and expose only the devices it needs — Home Assistant recommends fewer than 25.

## Settings that matter

| Setting | What it does | Recommendation |
|---|---|---|
| Model | The Ollama model that answers | Must support tools to control devices; larger models make fewer mistakes |
| Context window size | How many tokens the model sees | Home Assistant defaults to 8k (Ollama's own default is 2k); bigger homes need more, smaller values save RAM |
| Max history messages | How much of the conversation is kept | Fewer is faster and lighter |
| Keep alive | How long the model stays in memory | Keep it loaded for quick replies |
| Think before responding | Lets reasoning models think first | Slower; off by default |

## Keep commands fast

Small local models can struggle to chat and control devices at the same time. Two patterns help:

- **Let Home Assistant handle plain commands itself.** Its built-in intent matching handles "turn off the kitchen lights" instantly; only requests it doesn't understand need the language model.
- **Use two agents.** Home Assistant's docs suggest two Ollama configurations with the same model: one for conversation without device control, one with control enabled for commands.

## What the Voice Preview Edition is

The Home Assistant Voice Preview Edition is a $59 voice satellite: an ESP32-S3 with a dual-microphone array, an XMOS XU316 audio processor for echo cancellation and noise suppression, a small speaker for prompts, a 3.5 mm output and a hardware mute switch. It needs a Home Assistant server — speech recognition and the language model run there, either locally or through Home Assistant Cloud.

## FAQ

### Can Home Assistant voice work without the internet?

Yes, if speech-to-text, the language model and text-to-speech all run on your own machines — Whisper, Ollama and Piper. With a weaker server, Home Assistant can send speech to its cloud service instead.

### Which Ollama model should I use with Home Assistant?

One that supports tool calling, as large as your hardware can run quickly. Home Assistant notes that smaller models make more mistakes when controlling devices.

### Does the Voice Preview Edition run the AI itself?

No. It captures audio and plays answers; speech processing and the language model run on your Home Assistant server and your Ollama machine.

### How many devices should I expose to the LLM?

Home Assistant recommends exposing fewer than 25 entities to keep local models accurate.

## Sources

- [Home Assistant — Ollama integration](https://www.home-assistant.io/integrations/ollama/)
- [Home Assistant — The era of open voice assistants has arrived (Voice Preview Edition)](https://www.home-assistant.io/blog/2024/12/19/voice-preview-edition-the-era-of-open-voice/)
- [CNX Software — $59 Voice Preview Edition adds an offline smart speaker to your Home Assistant server](https://www.cnx-software.com/2024/12/20/59-voice-preview-edition-adds-an-offline-smart-speaker-to-your-home-assistant-server/)
- [jpk.io — Building a fully local voice assistant with Home Assistant Voice PE and Ollama](https://jpk.io/home-automation/home-assistant-voice-pe-local-llm/)
