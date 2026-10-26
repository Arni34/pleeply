# Private alternatives to Alexa

> Voice assistants that don't send your voice to Amazon — Home Assistant Assist with local AI, open-source assistants, DIY Raspberry Pi builds and local AI devices — compared on privacy, cost and effort.

Source: https://pleeply.vercel.app/info/alexa-alternatives/ · Updated 2026-10-24

If you want a voice assistant that doesn't send your voice to Amazon, the main options are Home Assistant's Assist with local speech and an Ollama model, an open-source assistant such as OpenVoiceOS, a DIY Raspberry Pi build, or a device that runs its AI on board. Each trades some convenience for privacy.

## Comparison

| Option | Where your voice is processed | Up front | Ongoing | Effort |
|---|---|---|---|---|
| Amazon Alexa+ | Amazon's cloud | An Echo device | $19.99 a month, or included with Prime | Lowest |
| Google speaker with Gemini | Google's cloud | A Google speaker | Paid Gemini plan after a trial, reportedly about $10 a month | Low |
| Home Assistant Voice PE + local AI | Your own servers | $59 plus a server for Home Assistant and Ollama | None | Medium to high |
| OpenVoiceOS | Your device | A Raspberry Pi, microphones and a speaker | None | High |
| DIY Raspberry Pi (Whisper + Ollama + Piper) | Your device | A Raspberry Pi 5, microphones and a speaker | None | High |
| pleeply (in development) | On the speaker | Expected $299 (One), $549 (Pro) or $499 (Pocket prototype) | Not announced | Low (planned) |

## How to choose

- **You want it to just work:** a cloud speaker is the easiest, but your requests are processed by the provider.
- **You already run Home Assistant:** add the Voice Preview Edition and the Ollama integration — the strongest local option today. See [Use a local LLM with Home Assistant](https://pleeply.vercel.app/info/home-assistant-local-llm/).
- **You like building things:** a Raspberry Pi 5 with Whisper, a 1–3B model and Piper. See [Run an LLM on a Raspberry Pi 5](https://pleeply.vercel.app/info/raspberry-pi-5-llm/).
- **You want local AI without assembling it:** a device built for it, such as [pleeply](https://pleeply.vercel.app/info/pleeply/).

## What you give up by going local

- Small local models are less capable than Alexa+'s cloud models on complex questions.
- Fewer ready-made integrations, such as shopping and some music services, and setup takes time.
- Smart-home control runs through your own hub rather than Amazon's ecosystem.

## FAQ

### Is there an Alexa alternative that works offline?

Yes. Home Assistant's Assist can run fully offline with local Whisper, Piper and an Ollama model, and so can a DIY build on a Raspberry Pi 5. An Echo stops working without internet.

### Is there an Alexa alternative without a subscription?

Local setups have none: Home Assistant, OpenVoiceOS and DIY Raspberry Pi assistants are free software, and you pay only for hardware. Alexa+ costs $19.99 a month unless you have Prime.

### What is the most private smart speaker?

One that processes speech and runs its language model locally, so audio never leaves your home. Today that means Home Assistant's Voice Preview Edition with local processing, or a DIY build.

### Can I use Alexa with Home Assistant and stay private?

You can use an Echo as a front end for Home Assistant, but your voice requests are still processed by Amazon. For privacy, use Home Assistant's own Assist with local speech processing.

## Sources

- [Android Authority — Alexa+ pricing](https://androidauthority.com/alexa-plus-pricing-3530655)
- [The Next Web — Google's first speaker in six years is really a $10-a-month Gemini subscription](https://thenextweb.com/news/google-home-speaker-gemini-99-subscription)
- [Home Assistant — Voice Preview Edition announcement](https://www.home-assistant.io/blog/2024/12/19/voice-preview-edition-the-era-of-open-voice/)
- [TechCrunch — Amazon's Echo will send all voice recordings to the cloud, starting March 28](https://techcrunch.com/2025/03/15/amazons-echo-will-send-all-voice-recordings-to-the-cloud-starting-march-28)
- [Open Voice OS — About](https://www.openvoiceos.org/about)
