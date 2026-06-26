import { env } from "../env.js";

/** Minimal HTML escaping for any user-supplied text rendered into the page. */
function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const FONTS =
  "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Hanken+Grotesk:wght@400;500;600&display=swap";

// Shares the player's letterpress vocabulary so the record page feels like the
// same product, then adds the few controls the streamlined recorder needs.
const CSS = `
:root{
  --bg:#FBFAF7; --paper:#F3F0E9; --ink:#26231E; --brass:#A88A5C; --brass-deep:#8F7344;
  --muted:#6E675C; --hairline:#E5E0D5; --hairline-dark:#D8D2C4; --danger:#9B463A;
  --serif:'Cormorant Garamond',Georgia,serif; --sans:'Hanken Grotesk',-apple-system,system-ui,sans-serif;
}
*{box-sizing:border-box}
html,body{margin:0}
body{background:var(--bg); color:var(--ink); font-family:var(--sans); min-height:100svh; display:grid; place-items:center; padding:28px 20px; -webkit-font-smoothing:antialiased;}
.frame{width:100%; max-width:540px; background:var(--bg); border:1px solid var(--hairline-dark); padding:40px clamp(22px,6vw,46px); position:relative;}
.frame::before{content:"";position:absolute;inset:6px;border:1px solid var(--hairline);pointer-events:none}
.eyebrow{font-size:11px; letter-spacing:.30em; text-transform:uppercase; color:var(--brass-deep); font-weight:600; margin:0 0 18px;}
.title{font-family:var(--serif); font-weight:500; font-size:clamp(28px,6.6vw,42px); line-height:1.07; margin:0 0 10px;}
.title .nm{font-style:italic; color:var(--brass-deep)}
.lede{font-family:var(--serif); font-size:18px; color:var(--muted); margin:0 0 26px; line-height:1.45}
.rec-wrap{display:flex; flex-direction:column; align-items:center; gap:14px; margin:8px 0 6px}
.timer{font-variant-numeric:tabular-nums; font-size:30px; letter-spacing:.04em; color:var(--ink)}
.dot{display:inline-block; width:10px; height:10px; border-radius:50%; background:var(--danger); margin-right:8px; vertical-align:middle; opacity:0}
.recording .dot{opacity:1; animation:pulse 1.1s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}
.recbtn{width:84px; height:84px; border-radius:50%; border:1.5px solid var(--brass); background:var(--bg); display:grid; place-items:center; cursor:pointer; transition:background .15s ease}
.recbtn:hover{background:var(--paper)}
.recbtn:focus-visible{outline:2px solid var(--brass); outline-offset:4px}
.recbtn .core{width:34px; height:34px; border-radius:50%; background:var(--danger); transition:all .15s ease}
.recording .recbtn .core{width:26px; height:26px; border-radius:5px}
.hint{text-align:center; font-size:12.5px; color:var(--muted); letter-spacing:.02em; margin:2px 0 0}
.review audio{width:100%; margin:6px 0 4px}
.fld{display:block; font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:var(--brass-deep); font-weight:600; margin:16px 0 6px}
.txt,.area{width:100%; font-family:var(--sans); font-size:15px; color:var(--ink); background:var(--bg); border:1px solid var(--hairline-dark); border-radius:2px; padding:11px 12px; outline:none}
.txt:focus,.area:focus{border-color:var(--brass)}
.area{min-height:74px; resize:vertical; line-height:1.4}
.row{display:flex; gap:11px; margin-top:22px}
.btn{flex:1; display:flex; align-items:center; justify-content:center; gap:9px; padding:14px 18px; border-radius:2px; cursor:pointer; line-height:1; font-family:var(--sans); font-weight:600; font-size:12px; letter-spacing:.13em; text-transform:uppercase; transition:background .15s ease}
.btn-primary{background:var(--ink); color:var(--bg); border:1px solid var(--ink)}
.btn-primary:hover{background:#3B372F}
.btn-primary:disabled{opacity:.5; cursor:default}
.btn-ghost{background:transparent; color:var(--ink); border:1px solid var(--hairline-dark)}
.btn-ghost:hover{background:var(--paper)}
.btn:focus-visible{outline:2px solid var(--brass); outline-offset:4px}
.hidden{display:none !important}
.status{font-size:13px; color:var(--muted); margin:14px 0 0; text-align:center; min-height:18px}
.status.err{color:var(--danger)}
.done{text-align:center; padding:10px 0}
.done .big{font-size:40px}
.foot{margin-top:30px; padding-top:18px; border-top:1px solid var(--hairline); font-size:11px; letter-spacing:.22em; text-transform:uppercase; color:var(--brass-deep)}
@media (prefers-reduced-motion:reduce){*{animation:none!important; transition:none!important}}
`;

export interface NotePageArgs {
  token: string;
  readerName: string | null;
}

/** The streamlined voice-memo recorder served at /note/:token. No mic checks, no
 * parts — record, review, optionally sign it, send. Posts to /api/voice-notes. */
export function renderNotePage(args: NotePageArgs): string {
  const { token } = args;
  const reader = (args.readerName || "").trim();
  const forWhom = reader ? `for <span class="nm">${esc(reader)}</span>` : "back";
  const apiBase = env.PUBLIC_BASE_URL.replace(/\/+$/, "");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#FBFAF7">
<title>Record a voice note · FoxTales</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>${CSS}</style>
</head>
<body>
<main class="frame" id="frame">
  <p class="eyebrow">A note back</p>
  <h1 class="title">Record a voice note ${forWhom}</h1>
  <p class="lede">Say hello, share a memory, or send a little love. Keep it as short or as long as you like — they'll hear it in your own voice.</p>

  <!-- RECORD -->
  <section id="recStage">
    <div class="rec-wrap">
      <div class="timer"><span class="dot"></span><span id="timer">0:00</span></div>
      <button id="recBtn" class="recbtn" aria-label="Start recording"><span class="core"></span></button>
      <p class="hint" id="recHint">Tap to start recording</p>
    </div>
  </section>

  <!-- REVIEW -->
  <section id="reviewStage" class="review hidden">
    <p class="hint" style="margin-bottom:10px">Have a listen before you send.</p>
    <audio id="player" controls preload="metadata"></audio>
    <label class="fld" for="senderName">Your name <span style="text-transform:none;letter-spacing:0;color:var(--muted);font-weight:400">(optional)</span></label>
    <input class="txt" id="senderName" maxlength="80" placeholder="e.g. Grandpa Joe" autocomplete="name">
    <label class="fld" for="message">A short note <span style="text-transform:none;letter-spacing:0;color:var(--muted);font-weight:400">(optional)</span></label>
    <textarea class="area" id="message" maxlength="1000" placeholder="A line to go with your recording…"></textarea>
    <div class="row">
      <button class="btn btn-ghost" id="redoBtn">↺ Re-record</button>
      <button class="btn btn-primary" id="sendBtn">Send ▸</button>
    </div>
    <p class="status" id="status"></p>
  </section>

  <!-- DONE -->
  <section id="doneStage" class="hidden">
    <div class="done">
      <div class="big">✓</div>
      <h2 class="title" style="font-size:30px">Sent with love</h2>
      <p class="lede" style="margin-bottom:18px">Your voice note is on its way${reader ? ` to ${esc(reader)}` : ""}.</p>
      <div class="row"><button class="btn btn-ghost" id="againBtn">Record another</button></div>
    </div>
  </section>

  <div class="foot"><a href="https://foxtaleclub.com" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">FoxTales</a></div>
</main>

<script>
(function(){
  var TOKEN=${JSON.stringify(token)};
  var API=${JSON.stringify(apiBase)};
  var recBtn=document.getElementById('recBtn'), recHint=document.getElementById('recHint');
  var timerEl=document.getElementById('timer'), frame=document.getElementById('frame');
  var recStage=document.getElementById('recStage'), reviewStage=document.getElementById('reviewStage'), doneStage=document.getElementById('doneStage');
  var player=document.getElementById('player'), statusEl=document.getElementById('status');
  var redoBtn=document.getElementById('redoBtn'), sendBtn=document.getElementById('sendBtn'), againBtn=document.getElementById('againBtn');

  var mediaRec=null, chunks=[], stream=null, blob=null, mime='', ext='webm';
  var t0=0, tick=null, elapsed=0;

  function fmt(s){ s=Math.max(0,Math.floor(s||0)); var m=Math.floor(s/60), x=s%60; return m+':'+(x<10?'0':'')+x; }
  function setStatus(msg, isErr){ statusEl.textContent=msg||''; statusEl.className='status'+(isErr?' err':''); }

  function pickMime(){
    var cands=['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'];
    if(typeof MediaRecorder==='undefined'||!MediaRecorder.isTypeSupported) return '';
    for(var i=0;i<cands.length;i++){ if(MediaRecorder.isTypeSupported(cands[i])) return cands[i]; }
    return '';
  }
  function extFor(m){ m=(m||'').toLowerCase(); if(m.indexOf('mp4')>=0)return 'mp4'; if(m.indexOf('ogg')>=0)return 'ogg'; if(m.indexOf('webm')>=0)return 'webm'; return 'webm'; }

  async function startRec(){
    setStatus('');
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){ setStatus('This browser can’t record audio. Try Safari or Chrome.', true); return; }
    try{ stream=await navigator.mediaDevices.getUserMedia({audio:true}); }
    catch(e){ setStatus('Microphone permission is needed to record.', true); return; }
    mime=pickMime(); ext=extFor(mime); chunks=[];
    try{ mediaRec = mime ? new MediaRecorder(stream,{mimeType:mime}) : new MediaRecorder(stream); }
    catch(e){ mediaRec=new MediaRecorder(stream); }
    mediaRec.ondataavailable=function(e){ if(e.data&&e.data.size) chunks.push(e.data); };
    mediaRec.onstop=function(){
      blob=new Blob(chunks,{type:(mediaRec.mimeType||mime||'audio/webm')});
      try{ player.src=URL.createObjectURL(blob); }catch(e){}
      stopStream();
      recStage.classList.add('hidden'); reviewStage.classList.remove('hidden');
    };
    mediaRec.start();
    frame.classList.add('recording'); recBtn.setAttribute('aria-label','Stop recording'); recHint.textContent='Recording… tap to stop';
    t0=Date.now()-0; elapsed=0; timerEl.textContent='0:00';
    tick=setInterval(function(){ elapsed=(Date.now()-t0)/1000; timerEl.textContent=fmt(elapsed); if(elapsed>=3600) stopRec(); }, 250);
  }
  function stopRec(){
    if(tick){ clearInterval(tick); tick=null; }
    frame.classList.remove('recording');
    if(mediaRec&&mediaRec.state!=='inactive'){ try{ mediaRec.stop(); }catch(e){} }
  }
  function stopStream(){ if(stream){ try{ stream.getTracks().forEach(function(t){t.stop();}); }catch(e){} stream=null; } }

  recBtn.addEventListener('click', function(){
    if(mediaRec&&mediaRec.state==='recording'){ stopRec(); } else { startRec(); }
  });

  redoBtn.addEventListener('click', function(){
    blob=null; try{ player.removeAttribute('src'); player.load(); }catch(e){}
    reviewStage.classList.add('hidden'); recStage.classList.remove('hidden');
    timerEl.textContent='0:00'; recHint.textContent='Tap to start recording'; setStatus('');
  });

  againBtn.addEventListener('click', function(){
    blob=null; document.getElementById('senderName').value=''; document.getElementById('message').value='';
    doneStage.classList.add('hidden'); recStage.classList.remove('hidden');
    timerEl.textContent='0:00'; recHint.textContent='Tap to start recording'; setStatus('');
  });

  async function send(){
    if(!blob){ setStatus('Record something first.', true); return; }
    sendBtn.disabled=true; redoBtn.disabled=true; setStatus('Sending…');
    var senderName=(document.getElementById('senderName').value||'').trim();
    var message=(document.getElementById('message').value||'').trim();
    var durationSec=Math.round(elapsed)||undefined;
    try{
      // 1) create the memo row + get a signed upload URL
      var createRes=await fetch(API+'/api/voice-notes',{ method:'POST', headers:{'content-type':'application/json'},
        body:JSON.stringify({ token:TOKEN, senderName:senderName||undefined, message:message||undefined, ext:ext, durationSec:durationSec }) });
      if(!createRes.ok) throw new Error('create_'+createRes.status);
      var created=await createRes.json();
      var up=created.upload, id=created.voiceNote.id;
      // 2) upload the audio to the signed URL
      var putRes=await fetch(up.url,{ method:up.method||'PUT', headers:{ 'content-type':(blob.type||'audio/webm'), 'x-upsert':'true' }, body:blob });
      if(!putRes.ok) throw new Error('upload_'+putRes.status);
      // 3) finalize → flips the memo to ready so it shows in the inbox
      var finRes=await fetch(API+'/api/voice-notes/'+id+'/finalize',{ method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ durationSec:durationSec }) });
      if(!finRes.ok) throw new Error('finalize_'+finRes.status);
      reviewStage.classList.add('hidden'); doneStage.classList.remove('hidden');
    }catch(e){
      setStatus('Couldn’t send that — please check your connection and try again.', true);
      sendBtn.disabled=false; redoBtn.disabled=false;
    }
  }
  sendBtn.addEventListener('click', send);
})();
</script>
</body>
</html>`;
}
