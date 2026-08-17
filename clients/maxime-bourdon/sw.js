const CACHE_VERSION = 'client-maxime-bourdon-portal-3-4-0-msmhj9uk';
const CACHE_SCOPE_KEY = self.registration.scope.replace(/[^a-z0-9]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase()||'root';
const CACHE_PREFIX = 'legacy-protocol-'+CACHE_SCOPE_KEY+'-';
const CACHE_NAME = CACHE_PREFIX+CACHE_VERSION;
const TRUSTED_EXTERNAL_ORIGINS=[
  'https://cdn.jsdelivr.net',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com'
];
const APP_SHELL=[
  './',
  './index.html',
  './i18n.js?v=7',
  './version.json',
  './site.webmanifest',
  './training-program.json',
  './nutrition-program.json',
  './apple-touch-icon.png',
  './favicon-16x16.png',
  './favicon-32x32.png',
  './icon-192.png',
  './icon-512.png',
  './fe-logo-home.png',
  './fe-logo-splash.png',
  './fe-logo-part-f.png',
  './fe-logo-part-e.png',
  './fe-logo-part-wordbar.png',
  './measure-icons/arm.png',
  './measure-icons/bodyweight.png',
  './measure-icons/calf.png',
  './measure-icons/chest.png',
  './measure-icons/thigh.png',
  './measure-icons/waist.png'
];
const OPTIONAL_SHELL=['./client-info.json'];

function cacheSuccessful(request,response){
  if(!response||!response.ok)return Promise.resolve(response);
  const copy=response.clone();
  return caches.open(CACHE_NAME).then(cache=>cache.put(request,copy)).then(()=>response);
}

function canonicalProgramRequest(url){
  return new Request(url.origin+url.pathname,{method:'GET'});
}

function cacheExternal(request,response){
  if(!response||(!response.ok&&response.type!=='opaque'))return Promise.resolve(response);
  const copy=response.clone();
  return caches.open(CACHE_NAME).then(cache=>cache.put(request,copy)).then(()=>response);
}

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache=>cache.addAll(APP_SHELL).then(()=>Promise.all(OPTIONAL_SHELL.map(path=>cache.add(path).catch(()=>null)))))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin){
    if(!TRUSTED_EXTERNAL_ORIGINS.includes(url.origin))return;
    event.respondWith(
      caches.match(req).then(cached=>cached||fetch(req).then(res=>cacheExternal(req,res)).catch(()=>Response.error()))
    );
    return;
  }
  const isProgramFile=url.pathname.endsWith('/training-program.json')||url.pathname.endsWith('/nutrition-program.json');
  const isPortalReleaseFile=url.pathname.endsWith('/version.json');
  if(isProgramFile||isPortalReleaseFile){
    const cacheKey=canonicalProgramRequest(url);
    event.respondWith(
      fetch(req,{cache:'no-store'}).then(res=>{
        if(!res.ok)throw new Error('Fresh JSON fetch failed: '+res.status);
        return cacheSuccessful(cacheKey,res);
      }).catch(()=>caches.match(cacheKey).then(cached=>cached||caches.match(req,{ignoreSearch:true})))
    );
    return;
  }
  const isAppDocument=req.mode==='navigate'||url.pathname.endsWith('/')||url.pathname.endsWith('/index.html');
  if(isAppDocument){
    event.respondWith(
      fetch(req,{cache:'no-store'}).then(res=>{
        if(!res.ok)throw new Error('Navigation fetch failed: '+res.status);
        return cacheSuccessful(req,res);
      }).catch(()=>caches.match(req).then(cached=>cached||caches.match('./index.html')))
    );
    return;
  }
  event.respondWith(
    caches.match(req).then(cached=>{
      const network=fetch(req).then(res=>{
        return cacheSuccessful(req,res);
      }).catch(()=>cached||Response.error());
      return cached||network;
    })
  );
});
