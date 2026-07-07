const CACHE_NAME='legacy-protocol-cache-2026-07-07-install-name';
const APP_SHELL=[
  './',
  './index.html',
  './site.webmanifest',
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

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  const isAppDocument=req.mode==='navigate'||url.pathname.endsWith('/')||url.pathname.endsWith('/index.html');
  if(isAppDocument){
    event.respondWith(
      fetch(req).then(res=>{
        const copy=res.clone();
        caches.open(CACHE_NAME).then(cache=>cache.put(req,copy));
        return res;
      }).catch(()=>caches.match(req).then(cached=>cached||caches.match('./index.html')))
    );
    return;
  }
  event.respondWith(
    caches.match(req).then(cached=>{
      const network=fetch(req).then(res=>{
        const copy=res.clone();
        caches.open(CACHE_NAME).then(cache=>cache.put(req,copy));
        return res;
      }).catch(()=>cached||caches.match('./index.html'));
      return cached||network;
    })
  );
});
