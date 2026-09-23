import { chromium } from '../../../node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
const out = new URL('./', import.meta.url);
const session=createInterface({input:createReadStream('/home/levi/.codex/sessions/2026/09/06/rollout-2026-09-06T23-47-15-01a0791e-7ac8-7cc0-90dd-48f8d164e526.jsonl'),crlfDelay:Infinity});
const urls=[];
for await(const line of session) { if(!line) continue; const item=JSON.parse(line); if(item.type==='response_item' && item.payload?.role==='user') { const text=(item.payload.content||[]).map(x=>x.text||'').join('\n'); for(const match of text.matchAll(/https:\/\/anoma\.ly\/labs\/fiend\/s\/8142ed23-8520-473a-9a57-1de45ce7cbed[^\s<>"`]*/g)) if(match[0].includes('#')) urls.push(match[0]); } }
const privateURL=urls.at(-1);
const targets=[['public','https://anoma.ly/labs/fiend/s/c4a883ca-75a4-480e-8755-17a50a57078f'], ...(privateURL ? [['capability',privateURL]]:[])];
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
const observations=[];
try {
 for(const [label,url] of targets) {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  try {
   await page.goto(url,{waitUntil:'networkidle',timeout:45000});
   await page.waitForTimeout(2000);
   // Never retain capability-bearing URL values or links. No traces/HAR/console capture.
   await page.evaluate(()=>{for(const el of document.querySelectorAll('input')) if(el.value.includes('#secret')) el.value='[private capability]';});
   const data=await page.evaluate(()=>({title:document.title,text:document.body.innerText,buttons:[...document.querySelectorAll('button')].map(x=>({text:x.innerText,title:x.title,aria:x.getAttribute('aria-label')})),inputs:[...document.querySelectorAll('input,select')].map(x=>({type:x.type,placeholder:x.getAttribute('placeholder'),label:x.getAttribute('aria-label')})),scripts:[...document.scripts].map(x=>{try{return new URL(x.src).pathname}catch{return 'inline'}})}));
   const hash=new URL(url).hash; const safe=hash ? JSON.stringify(data).replaceAll(hash,'[private capability]') : JSON.stringify(data);
   observations.push({label,data:JSON.parse(safe)});
   await page.screenshot({path:new URL(`${label}-normal.png`,out).pathname,fullPage:true});
   await page.setViewportSize({width:390,height:844});
   await page.screenshot({path:new URL(`${label}-390.png`,out).pathname,fullPage:true});
  } catch { observations.push({label,error:'Browser navigation or inspection failed; URL withheld'}); }
  finally {await page.close();}
 }
 await writeFile(new URL('observations.json',out),JSON.stringify({privateLinkFound:Boolean(privateURL),observations},null,2));
} finally {await browser.close();}
console.log(JSON.stringify({pages:observations.map(x=>({label:x.label,error:x.error||null})),privateLinkFound:Boolean(privateURL)}));
