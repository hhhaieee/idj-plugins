// 韩小圈（hanxiaoquan）· 黑果夜剧 idj1 适配插件
// 主体逻辑来自 guoapp-modules/hanxiaoquan v1.0.1（MIT），原样嵌入；
// 外层把 guoapp 的 host.* 能力映射到 idj1 沙箱，并把导出函数桥接到 idj1 视频协议。
// 注意：idj1 沙箱以 ES module 加载插件，要求顶层 export default 一个对象。

var _plugin = (function () {
  'use strict';

  // ---- guoapp host 兼容层 ----
  var HXQ_SOURCE = 'hanxiaoquan';
  var HXQ_BASE = 'https://www.jennyhow.com';
  var compatHost = {
    source: HXQ_SOURCE,
    dramaId: function (id) { return HXQ_SOURCE + ':' + id; },
    chapterId: function (id, order) { return HXQ_SOURCE + ':' + id + ':' + order; },
    fetchText: function (o) {
      var headers = { 'User-Agent': o.userAgent || 'Mozilla/5.0', 'Referer': o.referer || '' };
      if (o.cookie) headers['Cookie'] = o.cookie;
      var hi = (o && o.headers) || {};
      for (var k in hi) headers[k] = hi[k];
      var res = host.http.requestSync({ url: o.url, headers: headers, timeout: o.timeout || 20000 });
      return { body: typeof res.body === 'string' ? res.body : JSON.stringify(res.body), url: res.url || o.url, status: res.status };
    },
    parseUrl: function (value) {
      var s = String(value || '');
      var m = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^\/?#]*)([^#]*)?/.exec(s);
      if (!m) return { href: s, scheme: '', host: '', hostname: '', port: '', path: '', pathname: '', query: '', search: '', userInfo: '', username: '', password: '' };
      var scheme = m[1];
      var authority = m[2];
      var rest = m[3] || '';
      var userInfo = '';
      var hostport = authority;
      var at = authority.lastIndexOf('@');
      if (at >= 0) { userInfo = authority.slice(0, at); hostport = authority.slice(at + 1); }
      var hostname = hostport;
      var port = '';
      if (hostport.charAt(0) === '[') {
        var close = hostport.indexOf(']');
        if (close >= 0) { hostname = hostport.slice(0, close + 1); var rp = hostport.slice(close + 1); if (rp.charAt(0) === ':') port = rp.slice(1); }
      } else {
        var colon = hostport.lastIndexOf(':');
        if (colon >= 0) { hostname = hostport.slice(0, colon); port = hostport.slice(colon + 1); }
      }
      var q = rest.indexOf('?');
      var pathname = q >= 0 ? rest.slice(0, q) : rest;
      var search = q >= 0 ? rest.slice(q) : '';
      var query = q >= 0 ? rest.slice(q + 1) : '';
      return { href: s, scheme: scheme, host: hostport, hostname: hostname, port: port,
               path: pathname, pathname: pathname, query: query, search: search,
               userInfo: userInfo, username: userInfo.split(':')[0] || '', password: userInfo.indexOf(':') >= 0 ? userInfo.slice(userInfo.indexOf(':') + 1) : '' };
    },
    prepareWebMedia: function (media, channel) { return media; },
    log: function (msg) { host.log('[hanxiaoquan] ' + msg); }
  };

  // ---- 韩小圈主体（原样，注入 compatHost 作为局部 host）----
  var HXQ = (function (host) {
const siteBaseUrl = "https://www.jennyhow.com";
const userAgent = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const pageSize = 24;
const sourceName = "韩小圈";

const categories = [
  { id: "1", name: "最新韩剧" },
  { id: "2", name: "韩国电影" },
  { id: "3", name: "韩国综艺" },
  { id: "4", name: "韩国动漫" },
];

const cardPicPattern = /<a href="\/hanxiaoquan\/(\d+)\.html"[^>]*title="([^"]*)"[^>]*class="module-item-pic"/gis;
const cardImagePattern = /<img[^>]*data-src="([^"]+)"/is;
const cardTextPattern = /<a href="\/hanxiaoquan\/\d+\.html"[^>]*class="module-item-title"[^>]*>([^<]*)<\/a>/is;
const cardNotePattern = /class="module-item-text"[^>]*>([^<]*)</is;
const adTextPattern = /@[^@]{1,60}@/g;
const titlePattern = /<h1 class="page-title"[^>]*>(.*?)<\/h1>/is;
const ogImagePattern = /property="og:image"\s+content="([^"]+)"/is;
const coverSourcePattern = /<div class="video-cover">.*?<img[^>]*data-src="([^"]+)"/is;
const infoItemPattern = /<span class="video-info-itemtitle">([^<]*)<\/span>\s*<div class="video-info-item[^"]*">(.*?)<\/div>/gis;
const lineTabPattern = /href="#playlist(\d+)"[^>]*>\s*<i[^>]*><\/i>\s*([^<]+)/gis;
const episodePattern = /<a title="([^"]*)" href="(\/play\/\d+-\d+-\d+\.html)"/gis;
const nowPattern = /var\s+now\s*=\s*["']([^"']+)["']/is;
const mediaPattern = /https?:\/\/[^"'\s<>\\]+\.(?:m3u8|mp4)(?:\?[^"'\s<>\\]*)?/i;
const browserCheckPattern = /document\.cookie="(idc_search_browser=[0-9a-f]+)/;
const tagPattern = /<[^>]+>/g;
const leadingNumberPattern = /(\d+)/;

const namedEntities = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'", "&nbsp;": " " };

function truncate(text, limit) {
  const trimmed = text.trim();
  const characters = Array.from(trimmed);
  return characters.length <= limit ? trimmed : characters.slice(0, limit).join("") + "...";
}

function unescapeHtml(text) {
  for (let round = 0; round < 3; round++) {
    const next = text
      .replace(/&(?:amp|lt|gt|quot|apos|#39|nbsp);/g, (entity) => namedEntities[entity])
      .replace(/&#x([0-9a-fA-F]+);/g, (entity, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (entity, decimal) => String.fromCodePoint(parseInt(decimal, 10)));
    if (next === text) {
      break;
    }
    text = next;
  }
  return text;
}

function clean(text) {
  if (!text) {
    return "";
  }
  return unescapeHtml(text.replace(tagPattern, ""))
    .replace(/　/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

function validCategory(category) {
  if (category === "") {
    return true;
  }
  return category.length <= 8 && !/[|/\\\x00\r\n]/.test(category) && categories.some((entry) => entry.id === category);
}

function numericId(value) {
  const trimmed = value.trim();
  return /^\d{1,12}$/.test(trimmed) && parseInt(trimmed, 10) > 0;
}

function parseHttpUrl(raw) {
  let parsed;
  try {
    parsed = host.parseUrl(raw);
  } catch (failure) {
    return null;
  }
  const http = parsed.scheme === "https" || parsed.scheme === "http";
  return http && parsed.hostname !== "" && !parsed.userInfo ? parsed : null;
}

function fixUrl(raw) {
  raw = raw.trim();
  if (raw === "") {
    return "";
  }
  if (raw.startsWith("//")) {
    raw = "https:" + raw;
  } else if (raw.startsWith("/")) {
    raw = siteBaseUrl + raw;
  }
  const parsed = parseHttpUrl(raw);
  return parsed ? parsed.href : "";
}

function playUrl(href) {
  href = href.trim();
  if (href === "") {
    return "";
  }
  if (!href.startsWith("http")) {
    href = siteBaseUrl + "/" + href.replace(/^\//, "");
  }
  const parsed = parseHttpUrl(href);
  if (!parsed) {
    return "";
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== "jennyhow.com" && hostname !== "www.jennyhow.com") {
    return "";
  }
  if (!parsed.path.toLowerCase().endsWith(".html") || !parsed.path.includes("/play/")) {
    return "";
  }
  return parsed.href;
}

function get(path) {
  const url = path.startsWith("http") ? path : siteBaseUrl + path;
  return host.fetchText({ url, referer: siteBaseUrl + "/", userAgent }).body;
}

function parseCards(body) {
  const items = [];
  const seen = new Set();
  for (const match of body.matchAll(cardPicPattern)) {
    const id = match[1];
    let title = clean(match[2]);
    if (!numericId(id) || seen.has(id)) {
      continue;
    }
    const chunk = body.slice(match.index + match[0].length, match.index + match[0].length + 600);
    const coverMatch = chunk.match(cardImagePattern);
    const cover = coverMatch ? fixUrl(coverMatch[1]) : "";
    const noteMatch = chunk.match(cardNotePattern);
    const note = noteMatch ? clean(noteMatch[1]) : "";
    if (title === "") {
      const titleMatch = chunk.match(cardTextPattern);
      title = titleMatch ? clean(titleMatch[1]) : "";
    }
    if (title === "") {
      continue;
    }
    seen.add(id);
    items.push({
      id: host.dramaId(id),
      source: host.source,
      sourceId: id,
      title: truncate(title, 512),
      name: truncate(title, 512),
      cover,
      coverUrl: cover,
      channelName: sourceName,
      categoryName: "韩剧",
      remark: truncate(note, 64),
    });
    if (items.length > 500) {
      break;
    }
  }
  return items;
}

function pageCount(body, category, page, count) {
  const pattern = new RegExp("/hxq/" + category + "-(\\d+)\\.html", "gis");
  let maxPage = page;
  for (const match of body.matchAll(pattern)) {
    const value = parseInt(match[1], 10);
    if (value > maxPage && value < 100000) {
      maxPage = value;
    }
  }
  if (maxPage > page) {
    return maxPage;
  }
  return count >= pageSize ? page + 1 : page;
}

function infoFields(body) {
  const fields = {};
  for (const match of body.matchAll(infoItemPattern)) {
    const label = match[1].trim().replace(/：$/, "").trim();
    const value = clean(match[2]);
    if (label !== "" && value !== "" && !fields[label]) {
      fields[label] = value;
    }
  }
  return fields;
}

function pickPlaylist(body, sourceId) {
  const lineIds = [...new Set(Array.from(body.matchAll(lineTabPattern), (tab) => tab[1]))].sort();
  if (lineIds.length === 0) {
    lineIds.push("");
  }
  let best = [];
  for (const lineId of lineIds) {
    let segment = body;
    if (lineId !== "") {
      const marker = 'id="playlist' + lineId + '"';
      const start = body.indexOf(marker);
      if (start < 0) {
        continue;
      }
      segment = body.slice(start + marker.length);
      let end = segment.indexOf('id="playlist');
      if (end < 0) {
        end = segment.indexOf('class="module-footer"');
      }
      if (end >= 0) {
        segment = segment.slice(0, end);
      }
    }
    const chapters = [];
    const seenUrls = new Set();
    let index = 0;
    for (const episode of segment.matchAll(episodePattern)) {
      index++;
      let title = clean(episode[1]);
      const url = playUrl(episode[2]);
      if (url === "" || seenUrls.has(url)) {
        continue;
      }
      seenUrls.add(url);
      let order = index;
      const number = title.match(leadingNumberPattern);
      if (number && number[1].length <= 6) {
        const parsed = parseInt(number[1], 10);
        if (parsed > 0 && parsed <= 100000) {
          order = parsed;
        }
      }
      if (title === "") {
        title = "第 " + order + " 集";
      }
      chapters.push({
        id: host.chapterId(sourceId, url),
        source: host.source,
        title: truncate(title, 128),
        currentEpisode: order,
        videoUrl: "hanxiaoquan-play://" + url,
        pageUrl: url,
        referer: siteBaseUrl + "/",
      });
    }
    if (chapters.length > best.length) {
      best = chapters;
    }
  }
  if (best.length === 0) {
    throw new Error("韩小圈暂无可播放分集");
  }
  return best.sort((left, right) => left.currentEpisode - right.currentEpisode);
}

function search(page, query) {
  query = query.trim();
  if (query === "" || query.length > 256) {
    throw new Error("韩小圈搜索关键词无效");
  }
  if (page > 1) {
    return { items: [], hasMore: false };
  }
  const url = siteBaseUrl + "/search.php?searchword=" + encodeURIComponent(query).replace(/%20/g, "+");
  let body = get(url);
  const browserCheck = body.match(browserCheckPattern);
  if (browserCheck) {
    const pass = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    body = host.fetchText({ url: url + "&_idc_pass=" + pass, referer: url, userAgent, cookie: browserCheck[1], noCache: true }).body;
  }
  return { items: parseCards(body), hasMore: false };
}

return {
  validCategory,
  search,

  categories() {
    return categories;
  },

  catalogPage(page, category) {
    if (page < 1 || page > 100000) {
      throw new Error("韩小圈目录页码无效");
    }
    if (!validCategory(category)) {
      throw new Error("韩小圈内容分类无效");
    }
    category = category || categories[0].id;
    const path = page > 1 ? "/hxq/" + category + "-" + page + ".html" : "/hxq/" + category + ".html";
    const body = get(path);
    const items = parseCards(body);
    if (items.length === 0) {
      return { items: [], hasMore: false };
    }
    return { items, hasMore: page < pageCount(body, category, page, items.length) };
  },

  detail(sourceId) {
    if (!numericId(sourceId)) {
      throw new Error("韩小圈视频 ID 无效");
    }
    const body = get("/hanxiaoquan/" + sourceId + ".html");
    const titleMatch = body.match(titlePattern);
    const name = titleMatch ? clean(titleMatch[1]) : "";
    if (name === "") {
      throw new Error("韩小圈详情缺少视频名称");
    }
    const ogImage = body.match(ogImagePattern);
    let cover = ogImage ? fixUrl(ogImage[1]) : "";
    if (cover === "") {
      const coverSource = body.match(coverSourcePattern);
      cover = coverSource ? fixUrl(coverSource[1]) : "";
    }
    const fields = infoFields(body);
    const description = truncate((fields["剧情"] || fields["简介"] || "").replace(adTextPattern, ""), 12000);
    const tags = [];
    const addTag = (value) => {
      value = value.trim();
      if (value !== "" && !tags.includes(value) && Array.from(value).length <= 48 && tags.length < 16) {
        tags.push(value);
      }
    };
    if (fields["上映"]) {
      addTag(fields["上映"] + "年");
    }
    if (fields["导演"]) {
      addTag("导演 " + truncate(fields["导演"], 32));
    }
    if (fields["主演"]) {
      addTag("主演 " + truncate(fields["主演"], 48));
    }
    const chapters = pickPlaylist(body, sourceId);
    const drama = {
      id: host.dramaId(sourceId),
      source: host.source,
      sourceId,
      title: truncate(name, 512),
      name: truncate(name, 512),
      desc: description,
      intro: description,
      cover,
      coverUrl: cover,
      channelName: sourceName,
      categoryName: "韩剧",
      remark: truncate(fields["更新"] || fields["状态"] || "", 64),
      onlineDate: truncate(fields["更新"] || "", 32),
      tags,
      totalEpisode: chapters.length,
      episodeCount: chapters.length,
    };
    return { drama, chapters };
  },

  resolveMedia(task) {
    const dramaPrefix = host.source + ":";
    const sourceId = task.dramaId.startsWith(dramaPrefix) ? task.dramaId.slice(dramaPrefix.length).trim() : "";
    const chapterPrefix = host.chapterId(sourceId, "");
    if (!numericId(sourceId) || !task.chapter.id.startsWith(chapterPrefix)) {
      throw new Error("韩小圈播放分集信息无效，请刷新详情");
    }
    const pageUrl = task.chapter.id.slice(chapterPrefix.length) || task.chapter.pageUrl || "";
    if (playUrl(pageUrl) === "") {
      throw new Error("韩小圈播放页地址无效");
    }
    const body = get(pageUrl);
    const now = body.match(nowPattern);
    let address = now ? now[1].trim() : "";
    if (address === "") {
      const any = body.match(mediaPattern);
      address = any ? any[0] : "";
    }
    if (address === "") {
      throw new Error("韩小圈该集暂无可用播放地址");
    }
    if (address.startsWith("//")) {
      address = "https:" + address;
    }
    const parsed = parseHttpUrl(address.trim());
    if (!parsed) {
      throw new Error("韩小圈播放地址无效");
    }
    const media = { url: address, referer: siteBaseUrl + "/" };
    return parsed.path.toLowerCase().endsWith(".m3u8") ? host.prepareWebMedia(media, sourceName) : media;
  },
};

  })(compatHost);

  // ---- idj1 协议适配 ----
  function toItems(list) {
    return (list || []).map(function (d) {
      return {
        id: d.id || d.sourceId || '',
        title: d.title || d.name || '',
        cover: d.cover || '',
        remarks: d.remark || d.categoryName || d.channelName || ''
      };
    });
  }

  function home() {
    var cats = HXQ.categories().map(function (c) { return { id: c.id, name: c.name }; });
    var first = HXQ.catalogPage(1, cats.length ? cats[0].id : '');
    return { categories: cats, items: toItems(first.items), hasMore: !!first.hasMore };
  }

  function category(a) {
    var r = HXQ.catalogPage(a.page || 1, a.id || '');
    return { items: toItems(r.items), hasMore: !!r.hasMore };
  }

  function search(a) {
    var r = HXQ.search(a.page || 1, a.keyword || '');
    return { items: toItems(r.items), hasMore: !!r.hasMore };
  }

  function detail(a) {
    var sid = String(a.id || '');
    var prefix = HXQ_SOURCE + ':';
    if (sid.indexOf(prefix) === 0) sid = sid.slice(prefix.length);
    var raw = HXQ.detail(sid);
    var drama = raw.drama || {};
    var chapters = raw.chapters || [];
    var episodes = chapters.map(function (c) {
      return { id: c.id, name: c.title || (c.currentEpisode ? '第' + c.currentEpisode + '集' : '') };
    });
    var tagList = (drama.tags || []).slice();
    if (drama.onlineDate) tagList.unshift(String(drama.onlineDate));
    return {
      title: drama.title || '',
      cover: drama.cover || '',
      desc: drama.desc || '',
      tags: tagList,
      lines: [{ name: '默认', episodes: episodes }]
    };
  }

  function play(a) {
    var episodeId = String(a.episodeId || '');
    var sourceId = '';
    var parts = episodeId.split(':');
    if (parts.length >= 2) sourceId = parts[1];
    var dramaId = HXQ_SOURCE + ':' + sourceId;
    var chapter = { id: episodeId, pageUrl: '' };
    var media = HXQ.resolveMedia({ dramaId: dramaId, chapter: chapter });
    var url = String((media && media.url) || '');
    var referer = (media && media.referer) || (HXQ_BASE + '/');
    var streams = [];
    if (url) {
      streams.push({ url: url, name: '默认', format: /\.m3u8/.test(url) ? 'hls' : 'mp4',
        headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36', 'Referer': referer } });
    }
    if (!streams.length) throw host.error('E_NOT_FOUND', '没有可用播放线路');
    return { streams: streams };
  }

  return { home: home, category: category, search: search, detail: detail, play: play };
})();

export default _plugin;
