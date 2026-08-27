import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getRelayConfig } from "./config";
import { ghlHeaders } from "./ghl";
import { hasQrPassBuilderAccess } from "./qr-pass-access";
import type { DealershipProperties, GhlCustomObjectRecord } from "./types";

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const QR_PASS_PIN = "2026";

type DealerRecord = GhlCustomObjectRecord<DealershipProperties>;

export type QrPassDealerSummary = {
  id: string;
  name: string;
  city: string;
  state: string;
  ready: boolean;
};

export type QrPassPackage = {
  dealership: QrPassDealerSummary;
  pinGate: string;
  appointmentPass: string;
  editContact: string;
  campaignReference: string;
  smsQrUrl: string;
};

export const qrPassAccessInput = z.object({ access: z.string().trim().min(1).max(512) });
export const qrPassPackageInput = qrPassAccessInput.extend({ dealershipId: z.string().trim().min(1).max(255) });

function requireBuilderAccess(access: string) {
  if (!hasQrPassBuilderAccess(access)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "This QR Pass Page Builder link is not authorized." });
  }
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function property(record: DealerRecord, key: keyof DealershipProperties): string {
  return text(record.properties?.[key]);
}

function normalizedQrPassUrl(value: string): string {
  const url = value.trim();
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : `https://${url.replace(/^\/\//, "")}`;
}

function asJavaScriptLiteral(value: string): string {
  return JSON.stringify(value).replace(/<\//g, "<\\/");
}

function summary(record: DealerRecord): QrPassDealerSummary {
  const apiKey = property(record, "api_key");
  const locationId = property(record, "loc_id");
  const qrPassUrl = normalizedQrPassUrl(property(record, "qr_pass_page_url"));
  return {
    id: text(record.id),
    name: property(record, "dealership_name") || "Unnamed Dealership",
    city: property(record, "city"),
    state: property(record, "state"),
    ready: Boolean(apiKey && locationId && qrPassUrl),
  };
}

async function dealershipRecords(): Promise<DealerRecord[]> {
  const config = getRelayConfig();
  if (!config.ghlApiKey || !config.ghlLocationId) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "ADO Dealership lookup is not configured." });
  }
  const records: DealerRecord[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await fetch(`${GHL_BASE_URL}/objects/custom_objects.dealerships/records/search`, {
      method: "POST",
      headers: ghlHeaders(config.ghlApiKey, "2021-07-28", config.ghlLocationId),
      body: JSON.stringify({ locationId: config.ghlLocationId, page, pageLimit: 100, query: "", searchAfter: [] }),
    });
    if (!response.ok) {
      throw new TRPCError({ code: "BAD_GATEWAY", message: "ADO could not retrieve the Dealership records." });
    }
    const payload = (await response.json()) as { records?: DealerRecord[] };
    const pageRecords = Array.isArray(payload.records) ? payload.records : [];
    records.push(...pageRecords);
    if (pageRecords.length < 100) break;
  }
  return records;
}

export function createPinGate(): string {
  return `<!-- QR PASS — NUMERIC PIN GATE MODULE | Add as the FIRST Custom JS/HTML element -->
<script>var QR_PASS_PIN_CODE=${asJavaScriptLiteral(QR_PASS_PIN)};</script>
<style>html.qr-pin-locked,body.qr-pin-locked{overflow:hidden!important;background:#fff!important}#qrPinGate{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;background:#fff;font-family:Arial,Helvetica,sans-serif}#qrPinCard{width:100%;max-width:390px;padding:32px 24px 28px;border:1px solid #e3e6eb;border-radius:18px;background:#fff;box-shadow:0 12px 40px rgba(16,24,40,.14);text-align:center}#qrPinDealer{margin:0 0 22px;color:#111;font-size:21px;font-weight:700}#qrPinTitle{margin:0 0 7px;color:#1a2e4a;font-size:18px;font-weight:700}#qrPinCopy{margin:0 0 20px;color:#687386;font-size:14px;line-height:1.45}#qrPinInput{width:100%;padding:15px 14px;border:2px solid #d8dde7;border-radius:10px;background:#fff;color:#1a2e4a;font-size:26px;font-weight:700;letter-spacing:8px;text-align:center}#qrPinError{display:none;min-height:18px;margin:10px 0 0;color:#b42318;font-size:13px;font-weight:600}#qrPinKeypad{display:none;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:16px}#qrPinKeypad.open{display:grid}.qr-pin-key{min-height:48px;border:1px solid #d8dde7;border-radius:10px;background:#f8fafc;color:#1a2e4a;cursor:pointer;font-size:20px;font-weight:700}.qr-pin-key.action{font-size:13px}#qrPinUnlock{width:100%;margin-top:16px;padding:14px;border:0;border-radius:10px;background:#ED2726;color:#fff;cursor:pointer;font-size:15px;font-weight:700}</style>
<div id="qrPinGate" role="dialog" aria-modal="true"><div id="qrPinCard"><div id="qrPinDealer">Dealership</div><h1 id="qrPinTitle">Staff Access</h1><p id="qrPinCopy">Tap the field, then use the numeric keypad to enter the access code.</p><input id="qrPinInput" type="text" inputmode="numeric" pattern="[0-9]*" readonly aria-label="Staff access code"><div id="qrPinError">Incorrect access code.</div><div id="qrPinKeypad" aria-label="Numeric keypad"><button class="qr-pin-key" type="button" data-digit="1">1</button><button class="qr-pin-key" type="button" data-digit="2">2</button><button class="qr-pin-key" type="button" data-digit="3">3</button><button class="qr-pin-key" type="button" data-digit="4">4</button><button class="qr-pin-key" type="button" data-digit="5">5</button><button class="qr-pin-key" type="button" data-digit="6">6</button><button class="qr-pin-key" type="button" data-digit="7">7</button><button class="qr-pin-key" type="button" data-digit="8">8</button><button class="qr-pin-key" type="button" data-digit="9">9</button><button class="qr-pin-key action" type="button" data-action="clear">Clear</button><button class="qr-pin-key" type="button" data-digit="0">0</button><button class="qr-pin-key action" type="button" data-action="delete">Delete</button></div><button id="qrPinUnlock" type="button">Unlock</button></div></div>
<script>(function(){var pin=String(QR_PASS_PIN_CODE||'').replace(/\D/g,''),gate=document.getElementById('qrPinGate'),input=document.getElementById('qrPinInput'),keypad=document.getElementById('qrPinKeypad'),error=document.getElementById('qrPinError');function dealer(){var raw=new URLSearchParams(location.search).get('d');if(!raw)return'Dealership';try{return String(decodeURIComponent(raw).split('|')[5]||'').trim()||'Dealership'}catch(e){return'Dealership'}}function open(){keypad.classList.add('open');error.style.display='none'}function unlock(){if(input.value!==pin){input.value='';error.style.display='block';open();return}gate.remove();document.documentElement.classList.remove('qr-pin-locked');document.body.classList.remove('qr-pin-locked')}document.getElementById('qrPinDealer').textContent=dealer();document.documentElement.classList.add('qr-pin-locked');document.body.classList.add('qr-pin-locked');input.addEventListener('click',open);input.addEventListener('focus',open);keypad.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;var digit=b.getAttribute('data-digit'),action=b.getAttribute('data-action');if(digit!==null&&input.value.length<12)input.value+=digit;if(action==='clear')input.value='';if(action==='delete')input.value=input.value.slice(0,-1);error.style.display='none'});document.getElementById('qrPinUnlock').addEventListener('click',unlock)})();</script>`;
}

export function createAppointmentPass(): string {
  return `<!-- QR PASS — APPOINTMENT PASS MODULE | Add below the PIN gate -->
<style>*{box-sizing:border-box}.qr-pass-card{max-width:480px;margin:24px auto;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.1);overflow:hidden;font-family:'Segoe UI',Arial,sans-serif}.qr-pass-head{padding:28px 28px 20px;background:#ED2726;color:#fff;text-align:center}.qr-pass-badge{display:inline-block;padding:4px 12px;border-radius:20px;background:#e8a020;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase}.qr-pass-head h1{margin:12px 0 4px;font-size:22px}.qr-pass-address{font-size:13px;opacity:.8}.qr-pass-pin{margin-top:12px;color:#111;font-size:20px;font-weight:800}.qr-pass-body{padding:28px}.qr-pass-label{margin:22px 0 10px;color:#8a94a6;font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase}.qr-pass-label:first-child{margin-top:0}.qr-pass-row{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #f0f2f5}.qr-pass-icon{width:36px;height:36px;display:grid;place-items:center;border-radius:8px;background:#eef1f7}.qr-pass-row b{display:block;color:#8a94a6;font-size:11px;letter-spacing:.8px;text-transform:uppercase}.qr-pass-row span{display:block;margin-top:2px;color:#1a2e4a;font-size:15px;font-weight:600;word-break:break-word}.qr-pass-promo,.qr-pass-expiry{margin-top:20px;padding:14px 16px;border-radius:10px}.qr-pass-promo{border:1.5px solid #e8a020;background:#fffbf0;color:#7a5000;white-space:pre-wrap}.qr-pass-expiry{border:1.5px solid #e05c5c;background:#fff0f0;color:#c0392b;font-weight:700}.qr-pass-foot{padding:14px 28px 18px;border-top:1px solid #e8ecf2;background:#f7f9fc;text-align:center;color:#aab0bc;font-size:10px;font-weight:600;letter-spacing:.5px}</style>
<div id="qrPassCard"></div>
<script>(function(){function esc(v){return String(v||'').replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}function data(){var r=new URLSearchParams(location.search).get('d');if(!r)return null;var p=decodeURIComponent(r).split('|');return{name:p[0]||'',phone:p[1]||'',email:p[2]||'',promo:p[3]||'',expiry:p[4]||'',dealer:p[5]||'',address:p[6]||'',tracking:p[7]||'',year:p[8]||'',make:p[9]||'',model:p[10]||'',mileage:p[11]||'',apptdate:p[12]||'',appttime:p[13]||'',pincode:p[14]||''}}function date(v){if(!v)return'';var p=v.split(/[-\\/]/);return p.length===3?(p[0].length===4?Number(p[1])+'/'+Number(p[2])+'/'+p[0]:Number(p[0])+'/'+Number(p[1])+'/'+p[2]):v}function row(icon,label,value){return value?'<div class="qr-pass-row"><div class="qr-pass-icon">'+icon+'</div><div><b>'+label+'</b><span>'+esc(value)+'</span></div></div>':''}var f=data(),root=document.getElementById('qrPassCard');if(!f||(!f.name&&!f.phone)){root.innerHTML='<div class="qr-pass-card"><div class="qr-pass-body"><h2>Pass Not Found</h2><p>This link does not contain valid pass information. Please contact your dealership representative.</p></div></div>';return}var vehicle=[f.year,f.make,f.model].filter(Boolean).join(' '),html='<div class="qr-pass-card"><div class="qr-pass-head"><div class="qr-pass-badge">Appointment Pass</div><h1>'+esc(f.dealer||'Service Appointment')+'</h1>'+(f.address?'<div class="qr-pass-address">📍 '+esc(f.address)+'</div>':'')+(f.pincode?'<div class="qr-pass-pin">Customer PIN Code<br>'+esc(f.pincode)+'</div>':'')+'</div><div class="qr-pass-body"><div class="qr-pass-label">Customer Information</div>'+row('👤','Name',f.name)+row('📞','Phone',f.phone)+row('✉️','Email',f.email);if(vehicle||f.mileage)html+='<div class="qr-pass-label">Vehicle Info</div>'+row('🚗','Vehicle',vehicle)+row('🔢','Mileage',f.mileage?(Number(f.mileage).toLocaleString()+' mi'):'');if(f.apptdate||f.appttime)html+='<div class="qr-pass-label">Appointment</div>'+row('📅','Date',date(f.apptdate))+row('🕐','Time',f.appttime);if(f.promo)html+='<div class="qr-pass-label">Promotion / Notes</div><div class="qr-pass-promo">'+esc(f.promo)+'</div>';if(f.expiry)html+='<div class="qr-pass-expiry">📅 Offer Valid Until<br>'+esc(date(f.expiry))+'</div>';html+='</div><div class="qr-pass-foot">AUTO DEALERS ONLY</div></div>';root.innerHTML=html})();</script>`;
}

export function createEditContact(apiKey: string, locationId: string): string {
  return `<!-- QR PASS — EDIT THIS CONTACT MODULE | Add below the pass-card module -->
<script>var API_KEY=${asJavaScriptLiteral(apiKey)},LOCATION_ID=${asJavaScriptLiteral(locationId)};</script>
<style>#editPassBtn{display:block;width:calc(100% - 48px);max-width:480px;margin:12px auto 24px;padding:14px;background:#1a2e4a;color:#fff;font-size:15px;font-weight:700;border:0;border-radius:12px;cursor:pointer}#editOverlay{display:none;position:fixed;inset:0;z-index:2000;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.55)}#editOverlay.open{display:flex}#editPanel{width:100%;max-width:520px;max-height:92vh;overflow-y:auto;padding:24px 24px 40px;border-radius:20px 20px 0 0;background:#fff;font-family:Arial,Helvetica,sans-serif}.edit-title{margin:0 0 6px;color:#1a2e4a;font-size:17px;font-weight:700}.edit-sub{margin:0 0 20px;color:#687386;font-size:13px}.edit-label{margin:20px 0 10px;color:#8a94a6;font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase}.edit-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}.edit-field{margin-bottom:14px}.edit-field label{display:block;margin-bottom:5px;color:#8a94a6;font-size:11px;font-weight:700;text-transform:uppercase}.edit-field input,.edit-field textarea{width:100%;padding:11px 13px;border:1.5px solid #e0e4ed;border-radius:8px;color:#1a2e4a;font:15px Arial,sans-serif}.edit-field textarea{min-height:72px}.edit-actions{display:flex;gap:10px;margin-top:24px}.edit-actions button{flex:1;padding:13px;border:0;border-radius:10px;cursor:pointer;font-size:15px;font-weight:700}.edit-save{background:#ED2726;color:#fff}.edit-cancel{background:#f0f2f5;color:#1a2e4a}#editStatus{display:none;margin-top:12px;padding:10px 14px;border-radius:8px;text-align:center;font-size:13px;font-weight:600}#editStatus.success{display:block;background:#f0fdf4;color:#15803d}#editStatus.error{display:block;background:#fef2f2;color:#b91c1c}#ecMarkShowedField{display:flex;align-items:center;gap:10px;margin:0 0 20px;color:#111;font:700 15px Arial,sans-serif}#ecMarkShowed{width:19px;height:19px;margin:0;accent-color:#ED2726}</style>
<button id="editPassBtn" type="button">Edit This Contact</button><div id="editOverlay"><div id="editPanel"><h2 class="edit-title">Edit Contact</h2><p class="edit-sub">Changes will be saved directly to this contact in GoHighLevel.</p><label id="ecMarkShowedField" for="ecMarkShowed"><input id="ecMarkShowed" type="checkbox"><span>Mark as Showed</span></label><div class="edit-label">Customer Information</div><div class="edit-row"><div class="edit-field"><label>First Name</label><input id="ecFirst"></div><div class="edit-field"><label>Last Name</label><input id="ecLast"></div></div><div class="edit-field"><label>Email</label><input id="ecEmail" type="email"></div><div class="edit-field"><label>Phone</label><input id="ecPhone" type="tel"></div><div class="edit-label">Vehicle Info</div><div class="edit-row"><div class="edit-field"><label>Year</label><input id="ecYear" maxlength="4"></div><div class="edit-field"><label>Make</label><input id="ecMake"></div></div><div class="edit-field"><label>Model</label><input id="ecModel"></div><div class="edit-label">Promotion / Notes</div><div class="edit-field"><label>Notes</label><textarea id="ecNotes"></textarea></div><div class="edit-actions"><button id="ecCancel" class="edit-cancel" type="button">Cancel</button><button id="ecSave" class="edit-save" type="button">Save &amp; Exit</button></div><div id="editStatus"></div></div></div>
<script>(function(){var $=function(id){return document.getElementById(id)},overlay=$('editOverlay'),status=$('editStatus'),save=$('ecSave');function source(){var p=decodeURIComponent(new URLSearchParams(location.search).get('d')||'').split('|'),n=String(p[0]||'').trim().split(/\s+/);return{first:n[0]||'',last:n.slice(1).join(' '),phone:p[1]||'',email:p[2]||'',notes:p[3]||'',year:p[8]||'',make:p[9]||'',model:p[10]||''}}function show(type,value){status.className=type;status.textContent=value;status.style.display='block'}function open(){var f=source();$('ecFirst').value=f.first;$('ecLast').value=f.last;$('ecPhone').value=f.phone;$('ecEmail').value=f.email;$('ecNotes').value=f.notes;$('ecYear').value=f.year;$('ecMake').value=f.make;$('ecModel').value=f.model;status.style.display='none';overlay.classList.add('open')}function close(){overlay.classList.remove('open')}function digits(v){return String(v||'').replace(/\D/g,'')}async function submit(){var s=source(),phone=$('ecPhone').value.trim(),email=$('ecEmail').value.trim();save.disabled=true;save.textContent='Saving...';try{if(!s.phone&&!s.email)throw new Error('The QR pass does not include a phone or email for this contact.');var r=await fetch('https://services.leadconnectorhq.com/contacts/?locationId='+encodeURIComponent(LOCATION_ID)+'&query='+encodeURIComponent(s.phone||s.email),{headers:{Authorization:'Bearer '+API_KEY,Version:'2021-07-28'}}),found=await r.json(),c=(found.contacts||[]).find(function(x){return(s.phone&&digits(x.phone).slice(-10)===digits(s.phone).slice(-10))||(!s.phone&&String(x.email||'').toLowerCase()===String(s.email).toLowerCase())});if(!c)throw new Error('Contact not found in GoHighLevel.');var fields=[['year',$('ecYear').value.trim()],['make',$('ecMake').value.trim()],['model',$('ecModel').value.trim()],['notes',$('ecNotes').value.trim()]].filter(function(x){return x[1]}).map(function(x){return{key:x[0],fieldValue:x[1]}}),payload={customFields:fields,firstName:$('ecFirst').value.trim(),lastName:$('ecLast').value.trim(),email:email,phone:phone},u=await fetch('https://services.leadconnectorhq.com/contacts/'+encodeURIComponent(c.id),{method:'PUT',headers:{Authorization:'Bearer '+API_KEY,Version:'2021-07-28','Content-Type':'application/json'},body:JSON.stringify(payload)});if(!u.ok)throw new Error('Save failed');if($('ecMarkShowed').checked)await fetch('https://services.leadconnectorhq.com/contacts/'+encodeURIComponent(c.id)+'/tags',{method:'POST',headers:{Authorization:'Bearer '+API_KEY,Version:'v3','Content-Type':'application/json'},body:JSON.stringify({tags:['QR Show']})});show('success',$('ecMarkShowed').checked?'Contact saved and marked as Showed.':'Contact updated successfully!');setTimeout(close,600)}catch(e){show('error',e&&e.message?e.message:'Save failed. Please try again.')}finally{save.disabled=false;save.textContent='Save & Exit'}}$('editPassBtn').addEventListener('click',open);$('ecCancel').addEventListener('click',close);save.addEventListener('click',submit);overlay.addEventListener('click',function(e){if(e.target===overlay)close()})})();</script>`;
}

export function createCampaignReference(apiKey: string, locationId: string): string {
  return `<!-- QR PASS — CAMPAIGN REFERENCE MODULE | Add below Edit This Contact -->
<script>var QR_CAMPAIGN_API_KEY=${asJavaScriptLiteral(apiKey)},QR_CAMPAIGN_LOCATION_ID=${asJavaScriptLiteral(locationId)};</script>
<style>#qrCampaignRefBtn{display:none;width:calc(100% - 48px);max-width:480px;margin:0 auto 24px;padding:14px;border:2px solid #d0d5e0;border-radius:12px;background:#f0f2f5;color:#1a2e4a;cursor:pointer;font-size:15px;font-weight:700}#qrCampaignOverlay{display:none;position:fixed;inset:0;z-index:3000;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.75)}#qrCampaignOverlay.open{display:flex}#qrCampaignPanel{position:relative;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;padding:16px;border-radius:16px;background:#fff}#qrCampaignClose{position:absolute;top:10px;right:10px;width:32px;height:32px;border:0;border-radius:50%;background:#1a2e4a;color:#fff;font-size:19px;font-weight:700;cursor:pointer}.qr-campaign-image{display:block;width:100%;height:auto;margin:0 0 12px;border-radius:8px}</style>
<button id="qrCampaignRefBtn" type="button">Campaign Reference</button><div id="qrCampaignOverlay" aria-hidden="true"><div id="qrCampaignPanel"><button id="qrCampaignClose" type="button" aria-label="Close">×</button><div id="qrCampaignImages"></div></div></div>
<script>(function(){var button=document.getElementById('qrCampaignRefBtn'),overlay=document.getElementById('qrCampaignOverlay'),images=document.getElementById('qrCampaignImages'),urls=[];function normal(v){return String(v||'').toLowerCase().replace(/\s+/g,' ').trim()}function valid(v){try{var u=new URL(String(v||'').trim());return u.protocol==='https:'||u.protocol==='http:'}catch(e){return false}}function value(rows,name){var r=rows.find(function(x){return normal(x.name)===normal(name)});return r?String(r.value||'').trim():''}fetch('https://services.leadconnectorhq.com/locations/'+encodeURIComponent(QR_CAMPAIGN_LOCATION_ID)+'/customValues',{headers:{Authorization:'Bearer '+QR_CAMPAIGN_API_KEY,Version:'2021-07-28',Accept:'application/json'}}).then(function(r){if(!r.ok)throw new Error('custom values unavailable');return r.json()}).then(function(data){urls=[value(data.customValues||[],'Current Mailpiece Image'),value(data.customValues||[],'Current Mailpiece Image Back')].filter(valid);if(urls.length)button.style.display='block'}).catch(function(){});button.addEventListener('click',function(){images.innerHTML='';urls.forEach(function(url,i){var img=document.createElement('img');img.className='qr-campaign-image';img.src=url;img.alt=i?'Campaign mailpiece back':'Campaign mailpiece front';images.appendChild(img)});overlay.classList.add('open');overlay.setAttribute('aria-hidden','false')});function close(){overlay.classList.remove('open');overlay.setAttribute('aria-hidden','true')}document.getElementById('qrCampaignClose').addEventListener('click',close);overlay.addEventListener('click',function(e){if(e.target===overlay)close()})})();</script>`;
}

export function createSmsQrUrl(qrPassUrl: string): string {
  const base = normalizedQrPassUrl(qrPassUrl).replace(/[?&]d=[^&]*/i, "").replace(/[?&]$/, "");
  return `https://quickchart.io/qr?size=300&margin=2&text=${base}?d={{contact.first_name}}%20{{contact.last_name}}%7C{{contact.phone}}%7C{{contact.email}}%7C{{opportunity.notes}}%7C{{custom_values.campaign_end_date}}%7C{{custom_values.dealership_name}}%7C{{custom_values.dealership_address_full}}%7C{{custom_values.dealership_tracking_number}}%7C{{contact.year}}%7C{{contact.make}}%7C{{contact.model}}%7C{{contact.mileage}}%7C{{contact.appointment_date}}%7C{{contact.appointment}}`;
}

export function createQrPassOutputs(configuration: { apiKey: string; locationId: string; qrPassUrl: string }) {
  return {
    pinGate: createPinGate(),
    appointmentPass: createAppointmentPass(),
    editContact: createEditContact(configuration.apiKey, configuration.locationId),
    campaignReference: createCampaignReference(configuration.apiKey, configuration.locationId),
    smsQrUrl: createSmsQrUrl(configuration.qrPassUrl),
  };
}

export async function listQrPassDealerships(access: string): Promise<QrPassDealerSummary[]> {
  requireBuilderAccess(access);
  return (await dealershipRecords()).map(summary).filter(item => Boolean(item.id)).sort((a, b) => a.name.localeCompare(b.name));
}

export async function generateQrPassPackage(access: string, dealershipId: string): Promise<QrPassPackage> {
  requireBuilderAccess(access);
  const record = (await dealershipRecords()).find(item => text(item.id) === dealershipId);
  if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "That dealership is no longer available in ADO." });
  const apiKey = property(record, "api_key");
  const locationId = property(record, "loc_id");
  const qrPassUrl = normalizedQrPassUrl(property(record, "qr_pass_page_url"));
  if (!apiKey || !locationId || !qrPassUrl) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This dealership is missing its API key, location ID, or QR Pass Page URL." });
  }
  return { dealership: summary(record), ...createQrPassOutputs({ apiKey, locationId, qrPassUrl }) };
}
