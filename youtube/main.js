// 油管 · i短剧 idj1 视频插件（单文件，只用 host.* 能力）
// 列表：YouTube 官方 innertube browse/next —— key / clientVersion 运行时从 YouTube 页面动态获取，
//       不再写死，YouTube 更新版本号也不会失效；不需要解 cipher。
//       视频解析借鉴 App 内 Telegram 频道的做法：不认死路径，递归按「特征节点」扫描（TGParser 思路），
//       YouTube 换结构也不会扑空。
// 播放：第三方 Invidious/Piped 实例把带 cipher 的流解成直链（插件沙箱禁 eval，自己解不了）。
const WEB_KEY_FALLBACK = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const VERSION_FALLBACK = '2.20260306.01.00';
const INNERTUBE = 'https://www.youtube.com';
const THUMB = 'https://i.ytimg.com';

// 播放实例（settings.api = 'auto' 时按此顺序逐个尝试）
// 2026-11 更新：只保留官方目录仍在列的存活实例（Invidious 明网 5 个 + Piped 官方目录若干）
const FLAVORS = {
  invidious: [
    'https://yt.chocolatemoo53.com',  // 官方列表唯一 api:true
    'https://inv.nadeko.net', 'https://invidious.tiekoetter.com',
    'https://invidious.nerdvpn.de'
  ],
  piped: [
    'https://pipedapi.kavin.rocks', 'https://api.piped.yt',
    'https://pipedapi.nosebs.ru', 'https://pipedapi.owo.si',
    'https://piped-api.privacy.com.de', 'https://pipedapi.adminforge.de',
    'https://pipedapi.darkness.services', 'https://pipedapi.orangenet.cc',
    'https://pipedapi.reallyaweso.me', 'https://pipedapi.ducks.party',
    'https://api.piped.private.coffee', 'https://pipedapi.leptons.xyz',
    'https://pipedapi.drgns.space', 'https://piped-api.codespace.cz',
    'https://pipedapi.syncpundit.io'
  ]
};

// ---- 动态 client：从 YouTube 页面抠当前有效的 API key / clientVersion ----
let _client = null;
function parseClientFromHtml(body) {
  const s = String(body || '');
  const k = (s.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || [])[1];
  const v = (s.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/) || [])[1];
  if (k || v) _client = { key: k || WEB_KEY_FALLBACK, version: v || VERSION_FALLBACK };
  return _client;
}
async function ensureClient() {
  if (_client) return _client;
  try {
    const res = await host.http.request({ url: INNERTUBE + '/', timeout: 15000 });
    parseClientFromHtml(res.body);
  } catch (e) { host.log('动态获取 client 失败，用内置值', (e && e.message) || e); }
  if (!_client) _client = { key: WEB_KEY_FALLBACK, version: VERSION_FALLBACK };
  return _client;
}

function cfg() {
  const s = host.settings || {};
  return {
    channels: String(s.channels || ''),
    api: String(s.api || 'auto'),
    flavor: String(s.flavor || 'auto')
  };
}

// ---- 频道输入解析：支持 @handle / UC...ID / 完整 URL ----
function parseChannel(raw) {
  let x = String(raw || '').trim();
  if (!x) return null;
  let m = x.match(/youtube\.com\/(@[\w.\-]+)/);
  if (m) return { kind: 'handle', value: m[1], label: m[1] };
  m = x.match(/youtube\.com\/channel\/(UC[\w\-]{22})/);
  if (m) return { kind: 'id', value: m[1], label: m[1] };
  m = x.match(/youtube\.com\/(?:c|user)\/([\w.\-]+)/);
  if (m) return { kind: 'user', value: m[1], label: m[1] };
  if (/^UC[\w\-]{22}$/.test(x)) return { kind: 'id', value: x, label: x };
  if (/^@/.test(x)) return { kind: 'handle', value: x, label: x };
  return { kind: 'user', value: x, label: x };
}

function channelList() {
  const raw = cfg().channels;
  const parts = raw.split(/[\n,，;；]+/).map(s => s.trim()).filter(Boolean);
  const out = [], seen = {};
  for (const p of parts) {
    const c = parseChannel(p);
    if (!c || seen[c.value]) continue;
    seen[c.value] = 1;
    out.push(c);
  }
  return out;
}

// @handle / 用户名 → UC id。三条通道各自独立 try，互为兜底：
//  ① youtubei browse 直接把 handle 当 browseId（返回 JSON，POST 不受频道页 302 跳转拦截影响，最稳）
//  ② 频道页 HTML 正则（补 browseId / vanityChannelUrl / 转义引号等多种字段）
//  ③ 站内搜频道名，从 channelRenderer.channelId 取
async function resolveBrowseId(ch) {
  if (ch.kind === 'id') return ch.value;

  // ① browse 接口：handle 可直接作 browseId；失败不影响后续通道
  try {
    const r = await browse({ browseId: ch.value });
    const id = pick(r,
      'header.channelHeaderRenderer.channelId',
      'header.channelHeaderRenderer.externalId',
      'metadata.channelMetadataRenderer.externalId',
      'contents.twoColumnBrowseResultsRenderer.tabs.0.tabRenderer.content.sectionListRenderer.contents.0.itemSectionRenderer.contents.0.channelRenderer.channelId');
    if (id && /^UC[\w\-]{22}$/.test(id)) { host.log('browse 解析频道 ID 成功', ch.value, id); return id; }
  } catch (e) { host.log('browse 解析频道 ID 失败', ch.value, (e && e.message) || e); }

  // ② 频道页 HTML 正则：多字段 + 转义引号 + /channel/UC 形式
  try {
    const res = await host.http.request({ url: INNERTUBE + '/' + ch.value, timeout: 15000 });
    const body = String(res.body || '');
    parseClientFromHtml(body);
    const pats = [
      /"externalId":"(UC[\w\-]{22})"/,
      /"channelId":"(UC[\w\-]{22})"/,
      /"browseId":"(UC[\w\-]{22})"/,
      /channel\/(UC[\w\-]{22})/,
      /\\?"externalId\\?":\\?"(UC[\w\-]{22})\\?"/,
      /\\?"channelId\\?":\\?"(UC[\w\-]{22})\\?"/,
      /\\?"browseId\\?":\\?"(UC[\w\-]{22})\\?"/,
    ];
    for (const p of pats) {
      const m = body.match(p);
      if (m) { host.log('HTML 解析频道 ID 成功', ch.value, m[1]); return m[1]; }
    }
  } catch (e) { host.log('频道页 HTML 解析失败', ch.value, (e && e.message) || e); }

  // ③ 搜索兜底：搜频道名，递归找 channelRenderer.channelId
  try {
    const c = await ensureClient();
    const q = ch.value.replace(/^@/, '');
    const body = JSON.stringify({
      context: { client: { clientName: 'WEB', clientVersion: c.version, hl: 'zh-CN', gl: 'US' } },
      searchQuery: q
    });
    const res = await host.http.post(INNERTUBE + '/youtubei/v1/search?key=' + c.key, body,
      { headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 });
    const r = JSON.parse(res.body || '{}');
    let id = null;
    const walk = (x, d) => {
      if (id || !x || typeof x !== 'object' || d > 30) return;
      const v = x.channelRenderer || x.gridChannelRenderer;
      if (v && /^UC[\w\-]{22}$/.test(v.channelId || '')) { id = v.channelId; return; }
      for (const k in x) walk(x[k], d + 1);
    };
    walk(r, 0);
    if (id) { host.log('搜索解析频道 ID 成功', ch.value, id); return id; }
  } catch (e) { host.log('搜索解析频道 ID 失败', ch.value, (e && e.message) || e); }

  return null;
}

// ---- innertube ----
async function browse(params) {
  const c = await ensureClient();
  const body = JSON.stringify(Object.assign({
    context: { client: { clientName: 'WEB', clientVersion: c.version, hl: 'zh-CN', gl: 'US' } }
  }, params));
  const res = await host.http.post(INNERTUBE + '/youtubei/v1/browse?key=' + c.key, body,
    { headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 });
  if (res.status < 200 || res.status >= 300) throw host.error('E_HTTP', 'browse HTTP ' + res.status);
  return JSON.parse(res.body || '{}');
}
async function next(token) {
  const c = await ensureClient();
  const body = JSON.stringify({
    context: { client: { clientName: 'WEB', clientVersion: c.version, hl: 'zh-CN', gl: 'US' } },
    continuation: token
  });
  const res = await host.http.post(INNERTUBE + '/youtubei/v1/next?key=' + c.key, body,
    { headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 });
  if (res.status < 200 || res.status >= 300) throw host.error('E_HTTP', 'next HTTP ' + res.status);
  return JSON.parse(res.body || '{}');
}

// 按点分路径取值
function pick(o, ...paths) {
  for (const p of paths) {
    let cur = o;
    for (const k of p.split('.')) { if (cur == null) { cur = undefined; break; } cur = cur[k]; }
    if (cur !== undefined && cur !== null) return cur;
  }
  return null;
}

// ---- 通用视频解析：递归按「特征节点」扫描，不认死路径（借鉴 TGParser）----
function collectVideos(root) {
  const items = [];
  const seen = Object.create(null);
  const add = (id, title, cover, remarks) => {
    const vid = String(id || '');
    if (!/^[\w\-]{11}$/.test(vid) || seen[vid]) return;
    seen[vid] = 1;
    items.push({
      id: vid,
      title: String(title || vid),
      cover: (cover && /^https?:\/\//.test(cover)) ? cover : (THUMB + '/vi/' + vid + '/hqdefault.jpg'),
      remarks: String(remarks || '')
    });
  };
  const walk = (x, d) => {
    if (!x || typeof x !== 'object' || d > 40) return;
    if (Array.isArray(x)) { for (const e of x) walk(e, d + 1); return; }
    // 旧结构：videoRenderer / gridVideoRenderer / playlistVideoRenderer
    const v = x.videoRenderer || x.gridVideoRenderer || x.playlistVideoRenderer;
    if (v && v.videoId) {
      const title = pick(v, 'title.runs.0.text', 'title.simpleText') || '';
      const thumb = pick(v, 'thumbnail.thumbnails.0.url', 'thumbnail.thumbnails.-1.url') || '';
      const len = pick(v, 'lengthText.simpleText', 'lengthText.runs.0.text') || '';
      const views = pick(v, 'viewCountText.simpleText', 'viewCountText.runs.0.text') || '';
      const age = pick(v, 'publishedTimeText.simpleText') || '';
      add(v.videoId, title, thumb, [age, views, len].filter(Boolean).join(' · '));
    }
    // 新结构：lockupViewModel（contentId 代替 videoId，标题在 metadata）
    if (x.lockupViewModel) {
      const vm = x.lockupViewModel;
      const ctype = String(vm.contentType || '');
      if (!ctype || /VIDEO/i.test(ctype)) {
        const id = vm.contentId || '';
        const title = pick(vm,
          'metadata.lockupMetadataViewModel.title.content',
          'metadata.lockupMetadataViewModel.title.simpleText',
          'content.metadata.lockupMetadataViewModel.title.content') || '';
        const thumb = pick(vm,
          'contentImage.thumbnailViewModel.image.sources.0.url',
          'contentImage.thumbnailViewModel.image.sources.0.content',
          'content.imageViewModel.sources.0.url',
          'content.imageViewModel.sources.0.content') || '';
        const meta = pick(vm,
          'metadata.lockupMetadataViewModel.metadata.content',
          'metadata.lockupMetadataViewModel.metadata.simpleText') || '';
        add(id, title, thumb, meta);
      }
    }
    for (const k in x) walk(x[k], d + 1);
  };
  walk(root, 0);
  return items;
}

// 递归找第一个 continuation token
function deepFindToken(o) {
  let found = null;
  const walk = (x, d) => {
    if (found || !x || typeof x !== 'object' || d > 30) return;
    if (x.continuationCommand && typeof x.continuationCommand.token === 'string') { found = x.continuationCommand.token; return; }
    for (const k in x) { walk(x[k], d + 1); if (found) return; }
  };
  walk(o, 0);
  return found;
}

// 频道首页：递归扫描整个响应里的视频节点（不认死路径）
async function channelPage(browseId) {
  const r = await browse({ browseId });
  const items = collectVideos(r);
  const token = deepFindToken(r);
  host.log('频道页解析：' + items.length + ' 条视频 / ' + (token ? '有翻页' : '无翻页'));
  return { items, token };
}

// 用 continuation token 翻页
async function continuePage(token) {
  const r = await next(token);
  const items = collectVideos(r);
  let t = deepFindToken(r);
  host.log('翻页解析：' + items.length + ' 条视频');
  return { items, token: t };
}

// ---- 播放：官方 player 直链优先 → 并发实例 → 记忆 ----
function apiList() {
  const c = cfg();
  const flavor = c.flavor;
  let list = [];
  if (flavor === 'invidious') list = FLAVORS.invidious;
  else if (flavor === 'piped') list = FLAVORS.piped;
  else if (c.api && /^https?:\/\//.test(c.api)) list = [c.api.replace(/\/$/, '')];
  else list = FLAVORS.invidious.concat(FLAVORS.piped);
  if (c.api && c.api !== 'auto' && !/^https?:\/\//.test(c.api)) {
    for (const f of Object.values(FLAVORS)) if (f.indexOf(c.api) >= 0) list = [c.api];
  }
  return list;
}

// 官方 player：尝试多种 client 身份，挑「带明文 url 或 HLS、无 cipher」的流（插件沙箱禁 JS，解不了 cipher / PO Token）。
// 2026-11 重要：YouTube 全面对 WEB/ANDROID/IOS 强制 PO Token（LOGIN_REQUIRED 人机验证墙）。
// 依据 yt-dlp 官方配置（2026-11）：web_safari 身份靠 Safari UA（clientName 仍是 WEB）拿预合并 HLS，
// HLS 当前免 GVS Token；注意 2026.07 起 YouTube 只向 logged-in/"trusted" 会话返回 HLS，匿名未必拿到。
// WEB_SAFARI 必须动态 clientVersion + Safari UA + gzip(gfe)，否则 400。TV/WEB_EMBEDDED 免 token 但受限。
// 故把 WEB_SAFARI(HLS) 放最前，其次 WEB_EMBEDDED / MWEB / TV。非 200 响应也记日志便于诊断。
const PLAYER_CLIENTS = [
  // ① WEB_SAFARI：走 HLS，当前免 PO Token，最有希望。clientVersion 用 Safari 对应的 16.x 系列。
  { name: 'WEB_SAFARI', cn: 'WEB', dyn: true, ver: '2.20260708.00.00', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Safari/605.1.15,gzip(gfe)', extra: {} },
  // ② WEB_EMBEDDED：Not required，但 embedUrl 必须是真实第三方域名（youtube.com 自己会被判"此视频不能观看"）
  { name: 'WEB_EMBEDDED_PLAYER', cn: 'WEB_EMBEDDED_PLAYER', dyn: true, ver: '2.20260708.00.00', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Safari/605.1.15,gzip(gfe)', extra: { clientScreen: 'EMBED', thirdParty: { embedUrl: 'https://www.youtube.com/' } } },
  // ③ MWEB：移动网页身份
  { name: 'MWEB', cn: 'MWEB', dyn: true, ver: '2.20260708.00.00', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1', extra: {} },
  // ④ TVHTML5：yt-dlp 标注 tv 免 PO Token（部分格式带 SABR/DRM，仍值得一试）
  { name: 'TVHTML5', ver: '7.20250312.18.00', ua: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version', extra: {} }
];
function plainUrl(f) {
  if (!f || !f.url) return null;
  const u = String(f.url);
  if (/(^|[?&])s=[^&]+/.test(u)) return null; // s 参数 = cipher 签名，解不了
  return u;
}
async function streamsFromOfficial(id) {
  const c = await ensureClient();
  for (const cli of PLAYER_CLIENTS) {
    try {
      const client = Object.assign({ clientName: cli.cn || cli.name, clientVersion: cli.dyn ? c.version : cli.ver, hl: 'zh-CN', gl: 'US' }, cli.extra || {});
      const body = JSON.stringify({ context: { client }, videoId: id, contentCheckOk: true, racyCheckOk: true, playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } } });
      const res = await host.http.post(INNERTUBE + '/youtubei/v1/player?key=' + c.key, body,
        { headers: { 'Content-Type': 'application/json', 'User-Agent': cli.ua }, timeout: 15000 });
      if (res.status < 200 || res.status >= 300) { host.log('官方 player HTTP 错误', cli.name, 'HTTP ' + res.status, String(res.body || '').slice(0, 120)); continue; }
      const r = JSON.parse(res.body || '{}');
      const ps = r.playabilityStatus || {};
      const sd = r.streamingData || {};
      const streams = [];
      const push = (f, label) => {
        const u = plainUrl(f);
        if (!u) return;
        const isHls = /\.m3u8/.test(u) || (f.mimeType && /mpegurl/i.test(f.mimeType));
        const parts = [label, f.qualityLabel, f.itag ? '#itag' + f.itag : ''].filter(Boolean);
        streams.push({ name: parts.join(' ') || '默认', url: u, format: isHls ? 'hls' : 'mp4',
          headers: u.indexOf('googlevideo.com') >= 0 ? { Origin: 'https://www.youtube.com' } : undefined });
      };
      (sd.formats || []).forEach(f => push(f, '官方'));
      (sd.adaptiveFormats || []).forEach(f => { if (f.mimeType && /audio\//.test(f.mimeType)) push(f, '音频'); });
      // HLS 清单当前免 GVS PO Token —— WEB_SAFARI 路线的主要产物
      if (sd.hlsManifestUrl) streams.push({ name: '官方HLS', url: sd.hlsManifestUrl, format: 'hls' });
      if (!streams.length) { host.log('官方 player 无直用流', cli.name, ps.status || '', String(ps.reason || '').slice(0, 80)); continue; }
      host.log('官方 player 直链成功', cli.name, streams.length + ' 条');
      return streams;
    } catch (e) { host.log('官方 player 失败', cli.name, (e && e.message) || e); }
  }
  return null;
}

// 记住上次成功的实例，下次优先用
function bestBase() { try { return host.storage.get('yt_best_base') || ''; } catch (e) { return ''; } }
function saveBase(b) { try { host.storage.set('yt_best_base', b); } catch (e) {} }

async function probeInstance(base, id) {
  const streams = FLAVORS.piped.indexOf(base) >= 0
    ? await streamsFromPiped(base, id) : await streamsFromInvidious(base, id);
  if (!streams.length) throw host.error('E_PARSE', '无流');
  return streams;
}
// 并发探测，谁先成功用谁；失败的不阻塞成功的
function streamsFromInstances(id) {
  let list = apiList();
  const best = bestBase();
  if (best && list.indexOf(best) >= 0) list = [best].concat(list.filter(b => b !== best));
  return new Promise((resolve, reject) => {
    let settled = false, pending = list.length;
    if (!pending) return reject(host.error('E_PARSE', '无可用播放实例'));
    list.forEach(base => {
      probeInstance(base, id).then(streams => {
        if (settled) return;
        settled = true; saveBase(base); resolve(streams);
      }, e => {
        host.log('实例失败', base, (e && e.message) || e);
        if (--pending === 0 && !settled) { settled = true; reject(host.error('E_PARSE', '所有播放实例都失败')); }
      });
    });
  });
}

async function streamsFromInvidious(base, id) {
  const res = await host.http.request({ url: base + '/api/v1/videos/' + id, timeout: 20000 });
  if (res.status < 200 || res.status >= 300) throw host.error('E_HTTP', 'HTTP ' + res.status);
  const v = JSON.parse(res.body || '{}');
  const streams = [];
  const push = (f, label, isHls) => {
    if (!f || !f.url) return;
    const parts = [label, f.qualityLabel, f.itag ? '#itag' + f.itag : ''].filter(Boolean);
    streams.push({ name: parts.join(' ') || '默认',
      url: f.url, format: isHls ? 'hls' : 'mp4',
      headers: (f.url && f.url.indexOf('googlevideo.com') >= 0) ? { Origin: 'https://www.youtube.com' } : undefined });
  };
  (v.formatStreams || []).forEach(f => push(f, '', false));
  (v.adaptiveFormats || []).forEach(f => {
    if (f.type && f.type.indexOf('audio/mp4') === 0 && f.url) {
      streams.push({ name: '音频 ' + (f.bitrate ? Math.round(f.bitrate / 1000) + 'k' : ''), url: f.url, format: 'mp4' });
    }
  });
  if (v.hlsUrl) streams.push({ name: 'HLS', url: v.hlsUrl, format: 'hls' });
  return streams;
}

async function streamsFromPiped(base, id) {
  const res = await host.http.request({ url: base + '/streams/' + id, timeout: 20000 });
  if (res.status < 200 || res.status >= 300) throw host.error('E_HTTP', 'HTTP ' + res.status);
  const v = JSON.parse(res.body || '{}');
  const streams = [];
  (v.videoStreams || []).forEach(f => {
    if (!f.url) return;
    const parts = [f.quality || '视频', f.format].filter(Boolean);
    streams.push({ name: parts.join(' '),
      url: f.url, format: (f.url.indexOf('.m3u8') > 0 || (f.format && f.format.indexOf('hls') >= 0)) ? 'hls' : 'mp4' });
  });
  (v.audioStreams || []).forEach(f => {
    if (!f.url) return;
    streams.push({ name: '音频 ' + (f.quality || ''), url: f.url, format: 'mp4' });
  });
  if (v.hlsUrl) streams.push({ name: 'HLS', url: v.hlsUrl, format: 'hls' });
  return streams;
}

async function playById(id) {
  // ① 官方 player 直链：不依赖任何第三方实例，最稳。网络抖动导致全体失败时重试一次
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const official = await streamsFromOfficial(id);
      if (official && official.length) {
        return { streams: official, expiresAt: Math.floor(Date.now() / 1000) + 3600 };
      }
    } catch (e) { host.log('官方通道异常', (e && e.message) || e); }
    if (attempt === 0) await Promise.resolve(); // 沙箱无定时器，用微任务让出一次
  }
  // ② 并发探测第三方实例：谁先成功用谁 + 记忆
  try {
    const streams = await streamsFromInstances(id);
    if (streams && streams.length) {
      return { streams, expiresAt: Math.floor(Date.now() / 1000) + 3600 };
    }
  } catch (e) {
    throw host.error('E_PARSE', '播放失败：官方通道与实例都不可用（' + (e && e.message || e) + '）');
  }
  throw host.error('E_PARSE', '播放失败：未拿到可用视频流');
}

export default {
  async init() {},

  async home() {
    const chans = channelList();
    if (!chans.length) {
      return { categories: [], items: [],
        notice: '请在插件设置「频道列表」里填入 YouTube 频道，支持 @频道名 / UC... / 频道链接，多个用逗号或换行分隔' };
    }
    const categories = chans.map((c, i) => ({ id: 'yt:' + c.kind + ':' + c.value, name: c.label }));
    return { categories, items: [] };
  },

  async category({ id, page = 1 }) {
    const m = String(id || '').match(/^yt:(id|handle|user):(.+)$/);
    if (!m) return { items: [], hasMore: false };
    const ch = { kind: m[1], value: m[2], label: m[2] };
    const cacheKey = 'ytcont:' + ch.value;
    let token = null;
    if (page > 1) token = host.storage.get(cacheKey);
    let parsed;
    if (page === 1 || !token) {
      const browseId = await resolveBrowseId(ch);
      if (!browseId) throw host.error('E_PARSE', '无法解析频道：' + ch.value);
      parsed = await channelPage(browseId);
    } else {
      parsed = await continuePage(token);
    }
    if (parsed.token) host.storage.set(cacheKey, parsed.token);
    else host.storage.remove(cacheKey);
    return { items: parsed.items, page, hasMore: !!parsed.token && parsed.items.length > 0 };
  },

  async search({ keyword, page = 1 }) {
    if (page > 1) return { items: [], hasMore: false };
    try {
      const c = await ensureClient();
      const body = JSON.stringify({
        context: { client: { clientName: 'WEB', clientVersion: c.version, hl: 'zh-CN', gl: 'US' } },
        searchQuery: keyword
      });
      const res = await host.http.post(INNERTUBE + '/youtubei/v1/search?key=' + c.key, body,
        { headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 });
      const r = JSON.parse(res.body || '{}');
      const items = collectVideos(r);
      host.log('搜索解析：' + items.length + ' 条视频');
      return { items: items.slice(0, 60), hasMore: false };
    } catch (e) { throw host.error('E_PARSE', '搜索失败：' + (e && e.message || e)); }
  },

  async detail({ id }) {
    let title = id;
    try {
      const res = await host.http.request({ url: 'https://www.youtube.com/oembed?url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id) + '&format=json', timeout: 12000 });
      if (res.status === 200) { const o = JSON.parse(res.body || '{}'); title = o.title || id; }
    } catch (e) {}
    return {
      title,
      cover: THUMB + '/vi/' + id + '/hqdefault.jpg',
      desc: 'YouTube 视频',
      lines: [{ name: '默认', episodes: [{ id, name: '播放' }] }]
    };
  },

  async play({ episodeId }) {
    const id = String(episodeId || '').split('/').pop();
    if (!/^[\w\-]{11}$/.test(id)) throw host.error('E_PARSE', '无效的视频 ID：' + episodeId);
    return await playById(id);
  }
};
