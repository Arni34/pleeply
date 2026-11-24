// Опубликованный сайт pleeply Studio: сценарий лежит в <script type="application/json" id="pp-spec">.
import { render } from './engine.js';

let spec = {};
try { spec = JSON.parse(document.getElementById('pp-spec')?.textContent || '{}'); } catch {}
render(spec, document.body);
