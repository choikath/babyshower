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

/** Smart App Banner — surfaces the App Clip / App Store on iOS Safari (spec 1.2). */
function smartBanner(): string {
  if (!env.ITUNES_APP_ID) return "";
  return `<meta name="apple-itunes-app" content="app-id=${esc(env.ITUNES_APP_ID)}, app-clip-bundle-id=${esc(env.APPCLIP_BUNDLE_ID)}, app-clip-display=card">`;
}

const FONTS =
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Hanken+Grotesk:wght@400;500;600&display=swap';

const BASE_CSS = `
:root{
  --bg:#FBFAF7; --paper:#F3F0E9; --ink:#26231E; --brass:#A88A5C; --brass-deep:#8F7344;
  --muted:#6E675C; --hairline:#E5E0D5; --hairline-dark:#D8D2C4;
  --serif:'Cormorant Garamond',Georgia,serif; --sans:'Hanken Grotesk',-apple-system,system-ui,sans-serif;
}
*{box-sizing:border-box}
html,body{margin:0}
body{
  background:var(--bg); color:var(--ink); font-family:var(--sans);
  min-height:100svh; display:grid; place-items:center; padding:28px 20px;
  -webkit-font-smoothing:antialiased;
}
.frame{
  width:100%; max-width:540px; background:var(--bg);
  border:1px solid var(--hairline-dark); padding:40px clamp(22px,6vw,46px);
  position:relative;
}
/* Letterpress double rule */
.frame::before{content:"";position:absolute;inset:6px;border:1px solid var(--hairline);pointer-events:none}
.eyebrow{
  font-size:11px; letter-spacing:.30em; text-transform:uppercase;
  color:var(--brass-deep); font-weight:600; margin:0 0 22px;
}
.title{
  font-family:var(--serif); font-weight:500; font-size:clamp(30px,7.4vw,46px);
  line-height:1.06; letter-spacing:.005em; margin:0 0 14px;
}
.byline{font-size:14px; color:var(--muted); letter-spacing:.01em; margin:0}
.byline .nm{color:var(--ink)}
.note{font-family:var(--serif); font-style:italic; font-size:18px; color:var(--muted); margin:16px 0 0; line-height:1.4}
.msg{font-family:var(--serif); font-size:19px; color:var(--muted); margin:14px 0 0; line-height:1.45}
.player{margin-top:30px}
.wave-wrap{position:relative; height:74px; margin:0 0 14px}
.wave-wrap canvas{position:absolute; inset:0; width:100%; height:100%; display:block}
.wave-wrap input[type=range]{
  position:absolute; inset:0; width:100%; height:100%; margin:0;
  -webkit-appearance:none; appearance:none; background:transparent; cursor:pointer;
}
.wave-wrap input[type=range]:focus-visible{outline:2px solid var(--brass); outline-offset:4px}
.wave-wrap input[type=range]::-webkit-slider-thumb{-webkit-appearance:none; width:2px; height:74px; background:transparent}
.wave-wrap input[type=range]::-moz-range-thumb{width:2px; height:74px; border:0; background:transparent}
.times{display:flex; justify-content:space-between; font-size:12.5px; color:var(--muted); font-variant-numeric:tabular-nums; letter-spacing:.02em}
/* three columns so the play button stays optically centred with repeat beside it */
.transport{display:grid; grid-template-columns:1fr auto 1fr; align-items:center; margin-top:22px}
.pp{
  grid-column:2;
  width:66px; height:66px; border-radius:50%; border:1.5px solid var(--brass);
  background:var(--bg); color:var(--ink); display:grid; place-items:center; cursor:pointer;
  transition:background .15s ease;
}
.pp:hover{background:var(--paper)}
.pp:focus-visible{outline:2px solid var(--brass); outline-offset:4px}
.pp svg{width:24px; height:24px; display:block}
.rp{
  grid-column:3; justify-self:start; margin-left:18px;
  width:44px; height:44px; border-radius:50%; border:1px solid var(--hairline-dark);   /* 44px = min tap target */
  background:transparent; color:var(--muted); display:grid; place-items:center; cursor:pointer;
  transition:background .15s ease, color .15s ease, border-color .15s ease;
}
.rp:hover{background:var(--paper); color:var(--ink)}
.rp:focus-visible{outline:2px solid var(--brass); outline-offset:4px}
.rp svg{width:19px; height:19px; display:block}
.rp .dot{opacity:0; transition:opacity .15s ease}
/* on: brass, with the centre dot lit the way a repeat-one control reads */
.rp[aria-pressed="true"]{border-color:var(--brass); color:var(--brass-deep); background:var(--paper)}
.rp[aria-pressed="true"] .dot{opacity:1}
.hint{text-align:center; font-size:12px; color:var(--muted); letter-spacing:.04em; margin:18px 0 0}
.stats{margin-top:26px; text-align:center; font-size:11.5px; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); font-variant-numeric:tabular-nums}
.foot{margin-top:30px; padding-top:18px; border-top:1px solid var(--hairline); font-size:11px; letter-spacing:.22em; text-transform:uppercase; color:var(--brass-deep)}
.ft-cta{margin-top:30px; padding-top:22px; border-top:1px solid var(--hairline); display:flex; flex-direction:column; gap:11px}
.ft-cta .lead{font-size:11px; letter-spacing:.30em; text-transform:uppercase; color:var(--brass-deep); font-weight:600; margin:0 0 4px}
.ft-btn{display:flex; align-items:center; justify-content:center; gap:10px; padding:14px 20px; border-radius:2px; text-decoration:none; line-height:1; font-family:var(--sans); font-weight:600; font-size:12px; letter-spacing:.14em; text-transform:uppercase; transition:background .15s ease}
.ft-btn svg{flex:0 0 auto; width:16px; height:16px}
.ft-btn-primary{background:var(--ink); color:var(--bg); border:1px solid var(--ink)}
.ft-btn-primary:hover{background:#3B372F}
.ft-btn-ghost{background:transparent; color:var(--ink); border:1px solid var(--hairline-dark)}
.ft-btn-ghost:hover{background:var(--paper)}
.ft-btn-ghost svg{stroke:var(--brass)}
.ft-btn:focus-visible{outline:2px solid var(--brass); outline-offset:4px}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

function shell(inner: string, opts: { title: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#FBFAF7">
${smartBanner()}
<title>${esc(opts.title)} · FoxTales</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>${BASE_CSS}</style>
</head>
<body>
<main class="frame">
${inner}
<div class="foot"><a id="ftLink" href="https://foxtaleclub.com" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">FoxTales</a></div>
</main>
</body>
</html>`;
}

export interface PlayerStory {
  title: string;
  author: string | null;
  fromName: string;
  note: string | null;
  durationSec: number | null;
  playStartedCount: number; // real plays (audio 'play' event)
  listenedMs: number; // true measured listening time
}

/** A subtle "played N times · ~M min listened" line. Both numbers are now *measured*:
 * real plays (the audio 'play' event) and actual accumulated playback time — no
 * estimate. Returns "" before the first real play so we don't render "Played 0 times". */
function statsLine(plays: number, listenedMs: number): string {
  const p = Math.max(0, plays || 0);
  if (p <= 0) return "";
  const playsTxt = p === 1 ? "Played once" : `Played ${p.toLocaleString("en-US")} times`;
  const mins = Math.max(0, listenedMs || 0) / 60000;
  if (mins <= 0) return playsTxt;
  const listenTxt = mins < 1 ? "under a minute of listening" : `about ${Math.round(mins).toLocaleString("en-US")} min of listening`;
  return `${playsTxt} · ${listenTxt}`;
}

/** The player shell. Metadata is injected server-side; the signed stream + peaks
 * URLs are fetched client-side from /p/:token so they are always fresh. */
export function renderPlayer(args: { token: string; story: PlayerStory }): string {
  const { token, story } = args;
  const byline =
    (story.author ? `by <span class="nm">${esc(story.author)}</span> · ` : "") +
    `read by <span class="nm">${esc(story.fromName)}</span>`;

  // The streamlined voice-memo recorder lives on this same backend origin.
  const noteHref = esc(`/note/${encodeURIComponent(token)}`);

  const inner = `
<p class="eyebrow">A story for you</p>
<h1 class="title">${esc(story.title)}</h1>
<p class="byline">${byline}</p>
${story.note ? `<p class="note">${esc(story.note)}</p>` : ""}

<section class="player" aria-label="Story player">
  <div class="wave-wrap">
    <canvas id="wave" aria-hidden="true"></canvas>
    <input id="seek" type="range" min="0" max="1000" value="0" step="1" aria-label="Seek through the story">
  </div>
  <div class="times"><span id="cur">0:00</span><span id="dur">${fmt(story.durationSec ?? 0)}</span></div>
  <div class="transport">
    <button id="pp" class="pp" aria-label="Play">
      <svg id="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
    </button>
    <button id="rp" class="rp" aria-pressed="false" aria-label="Repeat off" title="Repeat">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M17 2.5l3.5 3.5L17 9.5"/><path d="M3.5 11.5V10a4 4 0 0 1 4-4h13"/>
        <path d="M7 21.5L3.5 18 7 14.5"/><path d="M20.5 12.5V14a4 4 0 0 1-4 4h-13"/>
        <circle class="dot" cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>
      </svg>
    </button>
  </div>
  <p class="hint" id="hint">Tap play to begin</p>
</section>

<section class="ft-cta" aria-label="Send a voice note back">
  <p class="lead">Add your voice</p>
  <a class="ft-btn ft-btn-ghost" id="noteCta" href="${noteHref}">
    <svg viewBox="0 0 24 24" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15a4 4 0 0 0 4-4V6a4 4 0 1 0-8 0v5a4 4 0 0 0 4 4z"/><path d="M18 11a6 6 0 0 1-12 0H4a8 8 0 0 0 7 7.94V22H8.5v2h7v-2H13v-3.06A8 8 0 0 0 20 11h-2z"/></svg>
    <span>Record a voice note for ${esc(story.fromName)}</span>
  </a>
</section>

<p class="stats" id="stats"${statsLine(story.playStartedCount, story.listenedMs) ? "" : " hidden"}>${esc(statsLine(story.playStartedCount, story.listenedMs))}</p>

<audio id="audio" preload="none" playsinline></audio>
<script>
(function(){
  var token=${JSON.stringify(token)};
  var audio=document.getElementById('audio');
  var pp=document.getElementById('pp'), ic=document.getElementById('ic');
  var seek=document.getElementById('seek'), cur=document.getElementById('cur'), dur=document.getElementById('dur'), hint=document.getElementById('hint');
  var canvas=document.getElementById('wave'), ctx=canvas.getContext('2d');
  var statsEl=document.getElementById('stats'), noteCta=document.getElementById('noteCta');
  var peaks=null, ready=false, dpr=Math.max(1, window.devicePixelRatio||1);
  var ICON_PLAY='M8 5v14l11-7z', ICON_PAUSE='M6 5h4v14H6zM14 5h4v14h-4z';

  // Measured playback stats (start from the server-rendered values, refreshed by /p).
  var plays=${JSON.stringify(story.playStartedCount)}, listenedMs=${JSON.stringify(story.listenedMs)};
  var playCounted=false;   // beacon a real play only once per page load
  var lastCT=0;            // last currentTime seen while playing (for listened deltas)
  var pendingMs=0;         // measured-but-unflushed playback time
  var flushTimer=null;

  function fmt(s){ s=Math.max(0,Math.floor(s||0)); var m=Math.floor(s/60), x=s%60; return m+':'+(x<10?'0':'')+x; }

  // "Played N times · ~M min of listening" — both measured (real plays + actual
  // playback time). Hidden until the first real play, to avoid "Played 0 times".
  function renderStats(p, lms){
    if(!statsEl) return;
    p=Math.max(0, p||0);
    if(p<=0){ statsEl.textContent=''; statsEl.hidden=true; return; }
    var playsTxt = p===1 ? 'Played once' : 'Played '+p.toLocaleString('en-US')+' times';
    var mins=Math.max(0, lms||0)/60000;
    if(mins>0){
      var listenTxt = mins<1 ? 'under a minute of listening' : 'about '+Math.round(mins).toLocaleString('en-US')+' min of listening';
      statsEl.textContent = playsTxt+' · '+listenTxt;
    } else {
      statsEl.textContent = playsTxt;
    }
    statsEl.hidden=false;
  }

  // Best-effort beacon helper (never blocks the navigation / outbound tap).
  function beacon(path){
    try{
      var url='/play/'+encodeURIComponent(token)+path;
      if(navigator.sendBeacon){ navigator.sendBeacon(url); }
      else { fetch(url,{ method:'POST', keepalive:true }).catch(function(){}); }
    }catch(e){}
  }

  // Track taps on the "record a voice note" CTA.
  if(noteCta){
    noteCta.addEventListener('click', function(){ beacon('/note-click'); });
  }

  // Track taps on the "FoxTales" brand link in the footer. It's rendered after this
  // script in the document, so delegate on document rather than binding it directly.
  document.addEventListener('click', function(e){
    var el = e.target;
    if(el && el.closest && el.closest('#ftLink')){ beacon('/foxtales-click'); }
  });

  function sizeCanvas(){
    var r=canvas.getBoundingClientRect();
    canvas.width=Math.round(r.width*dpr); canvas.height=Math.round(r.height*dpr);
    draw();
  }
  function draw(){
    var w=canvas.width, h=canvas.height; ctx.clearRect(0,0,w,h);
    var prog = (audio.duration && isFinite(audio.duration)) ? (audio.currentTime/audio.duration) : 0;
    var n = peaks && peaks.length ? peaks.length : 80;
    var gap = Math.max(1*dpr, (w/n)*0.42);
    var step = w/n, mid=h/2, maxH=h*0.86;
    for(var i=0;i<n;i++){
      var v = peaks && peaks.length ? peaks[i] : 0.12;
      var bh = Math.max(2*dpr, v*maxH);
      var x = i*step + (step-gap)/2;
      var played = (i/n) <= prog;
      ctx.fillStyle = played ? '#26231E' : 'rgba(168,138,92,0.38)';
      ctx.fillRect(x, mid-bh/2, gap, bh);
    }
  }
  function setIcon(playing){ ic.setAttribute('d',''); ic.querySelector('path')?ic.querySelector('path').setAttribute('d', playing?ICON_PAUSE:ICON_PLAY):0; }

  function onTime(){
    if(audio.duration && isFinite(audio.duration)){
      seek.value = String(Math.round((audio.currentTime/audio.duration)*1000));
      cur.textContent = fmt(audio.currentTime);
    }
    draw();
  }

  seek.addEventListener('input', function(){
    if(audio.duration && isFinite(audio.duration)){
      audio.currentTime = (Number(seek.value)/1000)*audio.duration;
      draw();
    }
  });

  pp.addEventListener('click', function(){
    if(!ready) return;
    if(audio.paused){ audio.play(); } else { audio.pause(); }
  });

  // Repeat: play the story again from the top, over and over, until it is paused.
  // audio.loop does the looping natively, which also means 'ended' stops firing
  // while it is on — so the pause icon correctly stays put across each repeat.
  var rp=document.getElementById('rp');
  var HINT_IDLE='Tap play to begin', HINT_LOOP='Repeat is on — it will keep playing until you pause.';
  function setRepeat(on){
    audio.loop=on;
    rp.setAttribute('aria-pressed', on?'true':'false');
    rp.setAttribute('aria-label', on?'Repeat on':'Repeat off');
    rp.setAttribute('title', on?'Repeat on':'Repeat');
    if(ready && hint.style.visibility!=='hidden') hint.textContent = on?HINT_LOOP:HINT_IDLE;
  }
  rp.addEventListener('click', function(){ setRepeat(!audio.loop); });
  audio.addEventListener('play', function(){ ic.querySelector('path').setAttribute('d', ICON_PAUSE); pp.setAttribute('aria-label','Pause'); hint.style.visibility='hidden'; });
  audio.addEventListener('pause', function(){ ic.querySelector('path').setAttribute('d', ICON_PLAY); pp.setAttribute('aria-label','Play'); });
  audio.addEventListener('timeupdate', onTime);
  audio.addEventListener('loadedmetadata', function(){ dur.textContent=fmt(audio.duration); draw(); });
  audio.addEventListener('ended', function(){ ic.querySelector('path').setAttribute('d', ICON_PLAY); pp.setAttribute('aria-label','Play'); });
  window.addEventListener('resize', sizeCanvas);

  // ---- Real-play + listening-time tracking (measured; beaconed best-effort) ----
  function stopTimer(){ if(flushTimer){ clearInterval(flushTimer); flushTimer=null; } }
  function flushListened(){
    var ms=Math.round(pendingMs);
    if(ms>0){ pendingMs=0; listenedMs+=ms; beacon('/listened?ms='+ms); renderStats(plays, listenedMs); }
  }
  audio.addEventListener('play', function(){
    lastCT=audio.currentTime;
    if(!playCounted){                 // count one real play per page load, not per resume
      playCounted=true;
      beacon('/play-started');
      plays+=1;                       // optimistic (the beacon just returns 204)
      renderStats(plays, listenedMs);
    }
    if(!flushTimer){ flushTimer=setInterval(flushListened, 15000); } // survive long single-sitting listens
  });
  // Accumulate only genuine forward playback — excludes seeks and paused gaps.
  audio.addEventListener('timeupdate', function(){
    if(!audio.paused){
      var dt=audio.currentTime-lastCT;
      if(dt>0 && dt<1.5){ pendingMs+=dt*1000; }
      lastCT=audio.currentTime;
    }
  });
  audio.addEventListener('seeking', function(){ lastCT=audio.currentTime; }); // don't count the jump
  audio.addEventListener('pause', function(){ flushListened(); stopTimer(); });
  audio.addEventListener('ended', function(){ flushListened(); stopTimer(); });
  window.addEventListener('pagehide', flushListened);
  document.addEventListener('visibilitychange', function(){ if(document.hidden){ flushListened(); } });

  // Lock-screen / Control Center metadata on modern Safari (spec 2.3 / 6.1).
  if('mediaSession' in navigator){
    navigator.mediaSession.metadata = new MediaMetadata({
      title: ${JSON.stringify(story.title)},
      artist: ${JSON.stringify((story.author ? "by " + story.author + " · " : "") + "read by " + story.fromName)},
      album: 'FoxTales'
    });
    navigator.mediaSession.setActionHandler('play', function(){ audio.play(); });
    navigator.mediaSession.setActionHandler('pause', function(){ audio.pause(); });
  }

  sizeCanvas();

  // Fetch a fresh signed stream + peaks for this token.
  fetch('/p/'+token, { headers:{ 'Accept':'application/json' }})
    .then(function(r){ if(!r.ok) throw new Error('resolve '+r.status); return r.json(); })
    .then(function(data){
      audio.src = data.stream.url;
      ready=true;
      if(data.story){
        if(data.story.playStartedCount!=null){ plays=data.story.playStartedCount; }
        if(data.story.listenedMs!=null){ listenedMs=data.story.listenedMs; }
        renderStats(plays, listenedMs);
      }
      if(data.story && data.story.peaksUrl){
        return fetch(data.story.peaksUrl).then(function(r){ return r.ok?r.json():null; }).then(function(p){ if(p&&p.peaks){ peaks=p.peaks; draw(); } });
      }
    })
    .catch(function(){ hint.textContent='This story is taking a moment — please try again.'; });
})();
</script>`;
  return shell(inner, { title: story.title });
}

/** Branded message page for not-yet-linked / processing / revoked / not-found. */
export function renderMessage(args: { title: string; body: string; eyebrow?: string }): string {
  const inner = `
<p class="eyebrow">${esc(args.eyebrow ?? "FoxTales")}</p>
<h1 class="title">${esc(args.title)}</h1>
<p class="msg">${esc(args.body)}</p>`;
  return shell(inner, { title: args.title });
}

function fmt(s: number): string {
  s = Math.max(0, Math.floor(s || 0));
  const m = Math.floor(s / 60);
  const x = s % 60;
  return `${m}:${x < 10 ? "0" : ""}${x}`;
}
