# Do smart speakers send your voice to the cloud?

> Mainstream smart speakers send your requests to company servers. What Amazon switched off on three Echo models on March 28, 2025, what Alexa+ means for privacy, and how a local assistant differs.

Source: https://pleeply.vercel.app/info/smart-speaker-privacy/ · Updated 2026-11-14

Yes. Mainstream smart speakers send what you say after the wake word to the company's servers to be processed. On March 28, 2025 Amazon switched off "Do Not Send Voice Recordings" — an option that existed on three Echo models in the US — so voice recordings from those devices now go to Amazon's cloud too. A local assistant processes your voice on the device instead.

## What changed for Alexa in 2025

- Three Echo models — the Echo Dot (4th generation), Echo Show 10 and Echo Show 15 — had a "Do Not Send Voice Recordings" option. It recognized speech on the device and sent Amazon a text transcript of the request instead of the audio.
- According to AP, the option was available only to US customers with the device set to English, and Amazon said fewer than 0.03% of customers used it. Other Echo devices never had it.
- Amazon ended support for it on March 28, 2025. In its email to customers it said it was expanding Alexa with generative AI features that rely on cloud processing, and had "decided to no longer support this feature".
- Customers who didn't act were switched to "Don't save recordings": audio goes to Amazon's cloud and is deleted after processing.
- The point isn't the size of the change. Privacy that a company grants as a setting, it can also remove with an update.

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
| Can processing move to the cloud later? | Yes — Amazon removed the on-device option from three Echo models in 2025 | Only if the device's software changes; open-source software lets you check |

## FAQ

### Does Alexa record everything I say?

No. An Echo listens on the device for the wake word and sends audio to Amazon only after it hears it. Since March 28, 2025 that audio is processed in Amazon's cloud on every Echo; you can choose not to save recordings, but the audio still goes to Amazon.

### Can I stop Alexa from sending recordings to Amazon?

Not anymore. The only option — "Do Not Send Voice Recordings" on the Echo Dot (4th generation), Echo Show 10 and Echo Show 15 in the US — was removed on March 28, 2025, and even it sent a text transcript of each request to Amazon. You can choose not to save recordings, delete your voice history or mute the microphones, but requests are still processed in Amazon's cloud.

### Is there a smart speaker that doesn't send audio to the cloud?

Yes, if it runs speech recognition and the language model locally. Home Assistant's Voice Preview Edition does this when paired with a Home Assistant server powerful enough to process speech locally, and pleeply is being built to do it on the speaker itself.

### Is Alexa+ private?

Alexa+ processes your requests on Amazon's servers, under Amazon's privacy policy. Whether that is acceptable is your call, but it is not local processing.

## Sources

- [TechCrunch — Amazon's Echo will send all voice recordings to the cloud, starting March 28](https://techcrunch.com/2025/03/15/amazons-echo-will-send-all-voice-recordings-to-the-cloud-starting-march-28) (March 15, 2025)
- [The Register — report on Amazon's email ending on-device Alexa processing](https://www.theregister.com/2025/03/17/amazon_kills_on_device_alexa/) (March 17, 2025; quotes Amazon's email)
- [AP via NY1 — Amazon ends little-used privacy feature that let Echo users opt out of sending recordings](https://ny1.com/nyc/all-boroughs/ap-top-news/2025/03/19/amazon-ends-little-used-privacy-feature-that-let-echo-users-opt-out-of-sending-recordings-to-company) (March 19, 2025; models, US-only, under 0.03%)
- [AlternativeTo — Amazon Echo removes the "Do Not Send Voice Recordings" option](https://alternativeto.net/news/2025/3/amazon-echo-to-remove-do-not-send-voice-recordings-to-the-cloud-option-weakening-privacy)
- [Android Authority — Alexa+ pricing](https://androidauthority.com/alexa-plus-pricing-3530655)
- [Home Assistant — Voice Preview Edition announcement](https://www.home-assistant.io/blog/2024/12/19/voice-preview-edition-the-era-of-open-voice/)
