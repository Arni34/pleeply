---
title: Do smart speakers send your voice to the cloud?
nav: Smart speaker privacy
description: Mainstream smart speakers send your requests to company servers. What changed for Amazon Echo on March 28, 2025, what Alexa+ means for privacy, and how a local assistant differs.
section: learn
order: 3
updated: 2026-10-24
---

Yes. Mainstream smart speakers send what you say after the wake word to the company's servers to be processed. Amazon switched off the last Echo setting that kept requests on the device on March 28, 2025, so every Alexa request now goes to Amazon's cloud. A local assistant processes your voice on the device instead.

## What changed for Alexa in 2025

- A few Echo models — the Echo Dot (4th generation), Echo Show 10 and Echo Show 15 — had a "Do Not Send Voice Recordings" option that processed requests on the device.
- Amazon ended support for that option on March 28, 2025. In its email to customers it said it was expanding Alexa with generative AI features that rely on cloud processing, and had "decided to no longer support this feature".
- You can still tell Alexa not to save recordings, but requests are processed in Amazon's cloud either way.

## Alexa+ runs in the cloud

Alexa+, Amazon's generative-AI assistant, processes requests on Amazon's servers. It costs $19.99 a month, or is included with Amazon Prime. Google's Nest speakers also send requests to Google's servers.

## How to limit what Alexa keeps

1. In the Alexa app, open the Alexa Privacy settings and choose not to save voice recordings.
2. In the same place, review and delete your voice history.
3. Press the microphone-off button when you don't need the speaker.

These reduce what is stored. They don't change where requests are processed.

## What "local" means

| Question | Cloud smart speaker | Local assistant |
|---|---|---|
| Does audio leave the house? | Yes, after the wake word | No |
| Who handles the transcript? | The provider's servers | Only the device in your home |
| Works when the internet is down? | No | Yes, for core features |
| Can processing move to the cloud later? | Yes — Echo's local option was removed in 2025 | Only if the device's software changes; open-source software lets you check |

## FAQ

### Does Alexa record everything I say?

No. An Echo listens on the device for the wake word and sends audio to Amazon only after it hears it. Since March 28, 2025 every request is processed in Amazon's cloud; you can choose not to save recordings, but the audio still goes to Amazon.

### Can I stop Alexa from sending recordings to Amazon?

No. The only option that kept requests on the device was removed on March 28, 2025. You can choose not to save recordings, delete your voice history or mute the microphones, but requests are still processed in Amazon's cloud.

### Is there a smart speaker that doesn't send audio to the cloud?

Yes, if it runs speech recognition and the language model locally. Home Assistant's Voice Preview Edition does this when paired with a Home Assistant server powerful enough to process speech locally, and pleeply is being built to do it on the speaker itself.

### Is Alexa+ private?

Alexa+ processes your requests on Amazon's servers, under Amazon's privacy policy. Whether that is acceptable is your call, but it is not local processing.

## Sources

- [TechCrunch — Amazon's Echo will send all voice recordings to the cloud, starting March 28](https://techcrunch.com/2025/03/15/amazons-echo-will-send-all-voice-recordings-to-the-cloud-starting-march-28)
- [AlternativeTo — Amazon Echo removes the "Do Not Send Voice Recordings" option](https://alternativeto.net/news/2025/3/amazon-echo-to-remove-do-not-send-voice-recordings-to-the-cloud-option-weakening-privacy)
- [Android Authority — Alexa+ pricing](https://androidauthority.com/alexa-plus-pricing-3530655)
- [Home Assistant — Voice Preview Edition announcement](https://www.home-assistant.io/blog/2024/12/19/voice-preview-edition-the-era-of-open-voice/)
