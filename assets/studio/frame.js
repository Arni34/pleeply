// Превью в Studio: страница в iframe-песочнице (непрозрачный origin) получает сценарий от родителя через postMessage.
import { render } from './engine.js';

let site = null;
addEventListener('message', (e) => {
  if (e.source !== parent || e.data?.type !== 'pp-render') return;
  const y = scrollY;
  try {
    site?.destroy();
    site = render(e.data.spec, document.body);
    if (e.data.keepScroll) scrollTo({ top: y, behavior: 'instant' });
    parent.postMessage({ type: 'pp-rendered', title: site.spec.title }, '*');
  } catch (err) {
    parent.postMessage({ type: 'pp-error', message: String(err?.message || err).slice(0, 200) }, '*');
  }
});
parent.postMessage({ type: 'pp-frame-ready' }, '*');
