import { createHash } from 'node:crypto';
import type { BehaviorPolicy, FormModel } from './model.js';

const htmlText = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const safeJson = (value: unknown) => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g,
  character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);

/** Only definition data belongs here. Never pass live state or stored responses. */
export function exportOfflineHtml(data: { model: FormModel; policy: BehaviorPolicy; artifactHash: string }, bundle: string, license: string): string {
  if (!bundle.trim()) throw new TypeError('Build the offline runner first.');
  const script = bundle.replace(/<\/script/gi, '<\\/script');
  const scriptHash = createHash('sha256').update(script).digest('base64');
  // Select properties explicitly so accidental extra caller properties cannot leak into the export.
  const payload = safeJson({ schemaVersion: 'formlift-offline-form/1', model: data.model, policy: data.policy,
    artifactHash: data.artifactHash, evidenceStatus: 'UNVERIFIED', referenceStatus: 'BLOCKED' });
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; connect-src 'none'; img-src data:; base-uri 'none'; form-action 'none'">
<title>FormLift — Offline form</title>
<style>*,*::before,*::after{box-sizing:border-box}body{margin:0;background:#f7f7f0;color:#172e32;font:16px/1.6 system-ui,sans-serif}main{max-width:760px;margin:auto;padding:28px 20px}h1{font-size:30px;line-height:1.2;overflow-wrap:anywhere}h2{font-size:25px;line-height:1.3;overflow-wrap:anywhere}.badge{color:#795d21;background:#f2ecd7;border-radius:6px;padding:5px 10px;display:inline-block;font-size:13px}.card{background:white;border:1px solid #dfe6df;border-radius:14px;padding:24px;margin-top:22px}button{font:inherit;cursor:pointer;padding:10px 15px;border:1px solid #17675e;border-radius:7px;background:#17675e;color:white}button:disabled{opacity:.5;cursor:default}button.secondary{background:white;color:#17675e}input{font:inherit;accent-color:#17675e}input[type=text]{display:block;width:100%;padding:12px;border:1px solid #b6c9bd;border-radius:6px}fieldset{border:0;margin:0;padding:0}fieldset label{display:flex;gap:12px;padding:12px;border:1px solid #dfe6df;border-radius:6px;margin:10px 0;overflow-wrap:anywhere}.actions{display:flex;gap:14px;flex-wrap:wrap;margin-top:24px}p{overflow-wrap:anywhere}.muted{color:#607273;font-size:14px}.error{color:#9c362b}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f6ef;padding:15px;font-size:12px;max-height:320px;overflow:auto}summary{cursor:pointer}button:focus-visible,input:focus-visible{outline:3px solid #71a89c;outline-offset:3px}[hidden]{display:none!important}</style></head>
<body><main><p>FormLift / portable form</p><h1 id="offline-title">Offline questionnaire</h1>
<span class="badge">Typeform compatibility unverified</span>
<p class="muted">Runs entirely in this file. No server, accounts, tracking, or network requests. Answers stay in memory until you download the response JSON. Closing or reloading clears them.</p>
<div class="card" id="offline-runner"></div><p><button class="secondary" id="offline-reset" type="button">Clear answers / new respondent</button></p>
<details><summary>License and export scope</summary><p class="muted">MIT-licensed FormLift code. Imported content retains its owner's rights. This file includes the form definition and explicit local policy, never prior respondent answers. No verified source behavior is implied. Downloads are not central collection or confirmed filesystem writes.</p><pre>${htmlText(license)}</pre></details>
<noscript>Enable JavaScript to run this local questionnaire.</noscript>
</main><script id="formlift-data" type="application/json">${payload}</script><script>${script}</script></body></html>`;
}
