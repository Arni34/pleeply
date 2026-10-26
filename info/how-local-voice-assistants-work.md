# How a local voice assistant works

> The four stages of an offline voice assistant — wake word, speech-to-text, language model, text-to-speech — which open-source software does each, and how long each step takes on small hardware.

Source: https://pleeply.vercel.app/info/how-local-voice-assistants-work/ · Updated 2026-10-24

An offline voice assistant turns your speech into a spoken answer in four stages that all run on one machine: a wake word detector, speech-to-text, a language model and text-to-speech. On a Raspberry Pi 5 the whole loop takes several seconds, and most of that time is the language model writing its answer.

## The pipeline

| Stage | What it does | Common open-source choice |
|---|---|---|
| 1. Wake word | Listens for a trigger phrase and ignores everything else | openWakeWord, microWakeWord |
| 2. Speech-to-text | Turns your sentence into text | Whisper (faster-whisper, whisper.cpp) |
| 3. Language model | Understands the request and writes the answer | Llama, Qwen or Gemma through Ollama or llama.cpp |
| 4. Text-to-speech | Speaks the answer | Piper |

In front of all four sits the audio hardware: a microphone array with echo cancellation and noise suppression, so the assistant can hear you over its own speaker and the room. Home Assistant's Voice Preview Edition, for example, uses an XMOS XU316 chip for this.

## Where the time goes

Reported timings on a Raspberry Pi 5:

- **Speech-to-text:** Whisper "small" in int8 takes about 2–4 seconds, depending on sentence length.
- **Language model:** with 4-bit models in Ollama, a 1B model generates about 11 tokens per second and a 3B model about 4.7. A one-sentence answer of about 25 tokens therefore takes roughly 2–5 seconds, plus the time to read the prompt.
- **Text-to-speech:** Piper synthesizes faster than real time on the Pi 5's CPU.

End to end, guides report about 5–8 seconds per request on a Pi 5 with a small model. That works for hands-free questions but feels slow in conversation. Faster hardware mostly shortens the language-model step — see [Choose your hardware](https://pleeply.vercel.app/info/run-ai-at-home/).

## How to make it feel faster

- **Stream the answer.** Start speaking the first sentence while the model writes the rest.
- **Send simple commands around the model.** "Turn off the kitchen lights" can go to a fast intent matcher; only open questions need the language model. Home Assistant supports this pattern.
- **Keep the model loaded.** Loading a model from disk adds seconds; Ollama's keep-alive setting keeps it in memory.
- **Use the smallest model that does the job.** 1–3B for commands and short answers, 7–8B and up for conversation.
- **Cool the board.** A Raspberry Pi 5 throttles under sustained load without active cooling, which can roughly halve language-model throughput.

## What works offline

Timers and alarms, conversions, questions the model can answer from what it learned in training, your notes and memory, and control of smart-home devices on your network. Anything that needs fresh data — weather, news, sports scores — needs an internet lookup, which a local assistant can make on request without sending your audio anywhere.

## FAQ

### Can Whisper run on a Raspberry Pi?

Yes. Small Whisper models run on a Raspberry Pi 5: the "small" model in int8 takes about 2–4 seconds per sentence. Larger models such as "medium" use too much of the Pi's memory to be practical.

### What is the best offline text-to-speech?

Piper is the most widely used offline text-to-speech for home assistants. It runs faster than real time on a Raspberry Pi 5 CPU and has voices in many languages. Its development moved to the OHF-Voice/piper1-gpl repository under the GPL-3.0 license, which matters if you ship it in a product.

### Why are local voice assistants slower than Alexa?

Because the language model runs on small hardware in your home instead of on data-center GPUs. On a Raspberry Pi 5 a request takes about 5–8 seconds end to end; a board with a GPU or an Apple Silicon Mac generates short answers several times faster.

### Does the wake word detector record everything?

In a typical design, no. The wake word model checks a short rolling audio buffer on the device and discards it; transcription starts only after it hears the trigger phrase. In a local assistant even the audio after the wake word stays on the device.

## Sources

- Pi 5 language-model speeds: [Stratosphere Linux IPS — LLM performance on Raspberry Pi 5](https://stratospherelinuxips.readthedocs.io/en/develop/immune/research_rpi_llm_performance.html)
- Whisper on a Pi 5: [raspberry.tips — Local voice assistant with Home Assistant and Raspberry Pi 5](https://raspberry.tips/en/smart-home/local-voice-assistant-replace-alexa-with-home-assistant-and-raspberry-pi-5)
- End-to-end latency: [PromptQuorum — Build a local voice assistant (2026)](https://www.promptquorum.com/power-local-llm/build-local-voice-assistant-2026)
- Piper speed and license: [Piper TTS: fast offline voice synthesis on a Raspberry Pi](https://aivideosensei.com/guides/piper-tts-offline-voice-guide)
- Throttling without cooling: [bestllmfor — Local LLM on Raspberry Pi 5](https://bestllmfor.com/best/raspberry-pi-5-llm/)
- Command routing and keep-alive: [Home Assistant — Ollama integration](https://www.home-assistant.io/integrations/ollama/)
- Audio front-end: [Home Assistant — Voice Preview Edition announcement](https://www.home-assistant.io/blog/2024/12/19/voice-preview-edition-the-era-of-open-voice/)
