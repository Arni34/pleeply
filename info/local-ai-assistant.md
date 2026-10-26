# What is a local AI assistant?

> A local AI assistant runs speech recognition, an open-weight language model and speech synthesis on hardware in your home, so your voice and memory stay on the device. How it compares with cloud assistants.

Source: https://pleeply.vercel.app/info/local-ai-assistant/ · Updated 2026-10-24

A local AI assistant is a voice or chat assistant whose AI runs on a computer in your home instead of on a company's servers. It hears you, works out an answer with an open-weight language model and replies — all on the device — so your voice, your questions and its memory of you stay on hardware you own.

## Local vs cloud

| | Local AI assistant | Cloud assistant (for example Alexa+) |
|---|---|---|
| Where your voice is processed | On a device in your home | On the company's servers |
| Without internet | Core features keep working | Stops working |
| Model size | Limited by your hardware: about 1–3B parameters on a Raspberry Pi 5, 7–8B with 16 GB of memory | Very large models in data centers |
| Answer quality | Good for everyday questions, timers, notes and home control; weaker on complex reasoning | Strongest on hard questions |
| Speed | Depends on hardware — several seconds on small boards | Usually quick, depends on your connection |
| Memory of you | Stored on the device, where you can inspect and delete it | Stored in the provider's account |
| Cost | Hardware up front, no per-request fees | Often a subscription — Alexa+ is $19.99 a month without Prime |

## What runs on the device

A local assistant chains four components:

1. **Wake word** — a tiny model listens for a trigger phrase, for example openWakeWord.
2. **Speech-to-text** — turns your sentence into text, for example Whisper.
3. **Language model** — an open-weight model such as Llama, Qwen, Gemma or Mistral writes the answer, usually through a runtime like Ollama or llama.cpp.
4. **Text-to-speech** — speaks the answer, for example Piper.

Timings and tuning are in [How a local voice assistant works](https://pleeply.vercel.app/info/how-local-voice-assistants-work/).

## What "open-weight model" means

An open-weight model is a language model whose trained weights are published, so anyone can download it and run it on their own hardware. Meta's Llama, Alibaba's Qwen, Google's Gemma and Mistral's models are common examples. Because the weights sit on your disk, the model works without contacting its publisher, and you can swap it for a better one when it comes out. Licenses differ, so check each model's terms before using it in a product.

## Is it as smart as ChatGPT?

Not for every task. Small models that fit on home hardware handle everyday requests well — reminders, short answers, summaries of your notes, controlling devices — but they make more mistakes than frontier cloud models on multi-step reasoning and niche facts. The gap narrows as memory grows: 16 GB runs 7–8B models, and 24 GB or more opens 14–32B models. See [How much RAM a local LLM needs](https://pleeply.vercel.app/info/local-llm-memory/).

## What stays at home

With a local assistant the audio, the transcript, the answer and the long-term memory can all stay on the device. That is a property of the design rather than a setting: data that is never sent can't be stored somewhere else. A local assistant can still go online for things that need fresh data — weather, news, music services — but only for those requests, and only if you connect them.

## FAQ

### Does a local AI assistant need internet?

Not for its core loop. The wake word, speech recognition, the language model and speech output all run on the device. You need internet to download models and updates, and for online services you choose to connect, such as weather or music.

### What is the difference between on-device AI and cloud AI?

On-device AI runs the model on hardware you own, so data stays local and it works offline, but the model's size is limited by your hardware. Cloud AI runs large models in a provider's data center, which is more capable but means sending your data there.

### Which models can a local assistant run?

Open-weight models such as Llama, Qwen, Gemma and Mistral, in sizes that fit the device's memory. Small boards run 1–3B models; 16 GB of memory fits 7–8B models at 4-bit quantization.

### Can a local assistant remember things about me?

Yes. Memory is data stored on the device — notes, preferences, past conversations — that the assistant looks up when it answers. Because it lives locally, you can see, edit or delete it.

## Sources

- Alexa+ pricing: [Android Authority — Alexa+ pricing](https://androidauthority.com/alexa-plus-pricing-3530655)
- Memory needed for 7–8B models: [Starmorph — Best Mac mini for local LLMs](https://blog.starmorph.com/blog/best-mac-mini-for-local-llms)
- Local voice components: [Home Assistant — The era of open voice assistants has arrived](https://www.home-assistant.io/blog/2024/12/19/voice-preview-edition-the-era-of-open-voice/)
