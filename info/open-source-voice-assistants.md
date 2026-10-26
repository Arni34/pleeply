# Open-source voice assistants compared

> Home Assistant Assist, OpenVoiceOS, Neon AI, Rhasspy and Mycroft — what each one is, whether it runs offline, and which projects are still active.

Source: https://pleeply.vercel.app/info/open-source-voice-assistants/ · Updated 2026-10-24

The most active open-source voice assistant today is Home Assistant's Assist, which can run speech and language models locally and powers the Voice Preview Edition. OpenVoiceOS and Neon AI carry on the Mycroft codebase, Rhasspy is a fully offline toolkit, and Mycroft AI itself stopped development in early 2023.

## Comparison

| Project | What it is | Offline | Status |
|---|---|---|---|
| Home Assistant Assist | The voice assistant built into Home Assistant; plugs in voice services such as Whisper and Piper over the Wyoming protocol | Yes, with local speech and an Ollama model | Active; Voice Preview Edition hardware since December 2024 |
| OpenVoiceOS (OVOS) | Community fork of Mycroft from November 2021, now run by a nonprofit foundation | Can be configured fully offline | Active |
| Neon AI | Conversational AI platform built on Mycroft and OVOS code; took over Mark II software support | Partly | Active |
| Rhasspy | Toolkit of offline voice services for home automation | Yes | Its creator, Mike Hansen, has led Home Assistant's voice work since late 2022 |
| Mycroft | The original open-source assistant and Mark II speaker | Mostly cloud, with user control | Development stopped in early 2023; code lives on in OVOS and Neon |

## Which one to choose

- **You run Home Assistant:** use Assist. It has the most momentum, local speech and an Ollama integration.
- **You want a standalone assistant rather than a smart-home hub:** try OpenVoiceOS.
- **You're building a custom offline voice interface:** combine Wyoming services — openWakeWord, Whisper and Piper — the way Rhasspy pioneered.

## What is the Wyoming protocol?

Wyoming is a simple protocol for connecting voice services — wake word, speech-to-text, text-to-speech — over the network. Nabu Casa created it for Home Assistant, so you can run Whisper or Piper on another machine and plug them into Assist. Rhasspy 3 uses it too.

## FAQ

### Is Mycroft still alive?

Mycroft AI, the company, stopped development in early 2023. Sources disagree on the cause — funding problems and a patent dispute are both cited. Its software continues in community projects: OpenVoiceOS leads development and Neon AI supports the Mark II.

### What's the difference between OpenVoiceOS and Mycroft?

OpenVoiceOS is a community fork of Mycroft started in November 2021. It describes itself as a full voice operating system, is maintained by a nonprofit foundation, and kept going after Mycroft AI stopped.

### Is Rhasspy still maintained?

Rhasspy's creator, Mike Hansen, joined Nabu Casa in late 2022 to lead Home Assistant's voice work, and many of Rhasspy's ideas now live in Home Assistant's voice stack and the Wyoming protocol. Check Rhasspy's repository for current releases.

### Which open-source voice assistant works offline?

Home Assistant Assist with local Whisper, Piper and Ollama; Rhasspy; and OpenVoiceOS can all run fully offline.

## Sources

- [Home Assistant — 2023: Home Assistant's year of Voice](https://www.home-assistant.io/blog/2022/12/20/year-of-voice/)
- [Home Assistant — Year of the Voice, Chapter 2 (Wyoming)](https://www.home-assistant.io/blog/2023/04/27/year-of-the-voice-chapter-2/)
- [Home Assistant — Voice Preview Edition announcement](https://www.home-assistant.io/blog/2024/12/19/voice-preview-edition-the-era-of-open-voice/)
- [Open Voice OS — A brief history of Open Voice OS](https://blog.openvoiceos.org/posts/2023-02-15-a-brief-history-of-open-voice-os)
- [Mycroft Community — FAQ: OVOS, Neon and the future of the Mycroft voice assistant](https://community.mycroft.ai/t/faq-ovos-neon-and-the-future-of-the-mycroft-voice-assistant)
- [Wikipedia — Mycroft (software)](https://en.wikipedia.org/wiki/Mycroft_(software))
