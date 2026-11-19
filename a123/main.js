// A123（a123tv.com）· 黑果夜剧 idj1 适配插件
// 移植自 quanju-tv 的 provider_a123.go（w4 模板全站影视聚合，电影/连续剧/综艺/动漫）。
// 外层把 idj1 沙箱能力映射进来，导出 home/category/search/detail/play 五个协议函数。
// idj1 沙箱以 ES module 加载插件，要求顶层 export default 一个对象。

var _plugin = (function () {
  'use strict';

  var SOURCE = 'a123';
  var SITE = 'https://a123tv.com';
  var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  var CATEGORIES = [
    { id: '10', name: '电影' },
    { id: '11', name: '连续剧' },
    { id: '12', name: '综艺' },
    { id: '13', name: '动漫' },
    { id: '15', name: '福利' }
  ];

  function validCategory(c) {
    if (c === '') return true;
    return /^\d{1,8}$/.test(c) && CATEGORIES.some(function (e) { return e.id === c; });
  }
  function validSlug(s) {
    return typeof s === 'string' && s.length > 0 && s.length <= 128 && /^[A-Za-z0-9_-]+$/.test(s);
  }
  function unescapeHtml(text) {
    if (!text) return '';
    var out = String(text);
    for (var i = 0; i < 3; i++) {
      var next = out
        .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, function (e) {
          return ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' })[e] || e;
        })
        .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { try { return String.fromCodePoint(parseInt(h, 16)); } catch (e) { return _; } })
        .replace(/&#(\d+);/g, function (_, d) { try { return String.fromCodePoint(parseInt(d, 10)); } catch (e) { return _; } });
      if (next === out) break;
      out = next;
    }
    return out;
  }
  function stripTags(s) {
    return unescapeHtml(String(s || '').replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ').trim();
  }
  function truncate(s, n) {
    s = String(s || '');
    return s.length <= n ? s : s.slice(0, n);
  }
  function fixUrl(raw) {
    var v = unescapeHtml(String(raw || '').trim());
    if (!v) return '';
    if (v.indexOf('//') === 0) return 'https:' + v;
    if (v.charAt(0) === '/') return SITE + v;
    return v;
  }
  function pageSuffix(p) {
    p = parseInt(p, 10) || 1;
    return p <= 1 ? '' : '/p' + p;
  }

  function fetchText(path) {
    var url = path.indexOf('http') === 0 ? path : SITE + path;
    var res = host.http.requestSync({
      url: url,
      headers: { 'User-Agent': UA, 'Referer': SITE + '/' },
      timeout: 20000
    });
    return typeof res.body === 'string' ? res.body : JSON.stringify(res.body || {});
  }

  // 解析 w4-item 卡片（目录页与搜索页共用）
  function parseCards(body, categoryName) {
    var items = [];
    var seen = {};
    var cardRe = /<a[^>]*class="w4-item"[^>]*href="\/v\/([^"/]+)\.html"[^>]*>([\s\S]*?)<\/a>/gi;
    var m;
    while ((m = cardRe.exec(body)) !== null) {
      var slug = (m[1] || '').trim();
      if (!validSlug(slug) || seen[slug]) continue;
      var block = m[2] || '';
      var title = '';
      var t = /<div class="t" title="([^"]*)"[^>]*>([\s\S]*?)<\/div>/i.exec(block);
      if (t) {
        title = unescapeHtml((t[1] || '').trim());
        if (!title && t[2]) title = unescapeHtml(stripTags(t[2]));
      }
      if (!title) {
        var alt = /\balt="([^"]*)"/i.exec(block);
        if (alt) title = unescapeHtml(alt[1].trim());
      }
      if (!title) continue;
      var cover = '';
      var src = /(?:data-src|src)="([^"]+)"/i.exec(block);
      if (src) cover = fixUrl(src[1]);
      var remark = '';
      var im = /<div class="i"[^>]*>([\s\S]*?)<\/div>/i.exec(block);
      if (im) remark = truncate(stripTags(im[1]), 64);
      seen[slug] = true;
      items.push({
        id: SOURCE + ':' + slug,
        title: truncate(title, 512),
        cover: cover,
        desc: remark,
        category: categoryName || ''
      });
    }
    return items;
  }

  function catalogPage(page, category) {
    page = parseInt(page, 10) || 1;
    if (page < 1 || page > 100000) return { items: [], hasMore: false };
    if (!validCategory(category || '')) return { items: [], hasMore: false };
    var path, catName = '';
    if (!category && page === 1) {
      path = '/';
    } else if (!category) {
      path = '/t/10' + pageSuffix(page) + '.html';
      catName = '电影';
    } else {
      path = '/t/' + category + pageSuffix(page) + '.html';
      for (var i = 0; i < CATEGORIES.length; i++) {
        if (CATEGORIES[i].id === category) catName = CATEGORIES[i].name;
      }
    }
    var body = fetchText(path);
    var items = parseCards(body, catName);
    return { items: items, hasMore: items.length >= 24 };
  }

  function search(page, keyword) {
    keyword = String(keyword || '').trim();
    page = parseInt(page, 10) || 1;
    if (!keyword || keyword.length > 256 || page > 1) return { items: [], hasMore: false };
    var body = fetchText('/s/' + encodeURIComponent(keyword) + '.html');
    return { items: parseCards(body, ''), hasMore: false };
  }

  function detail(id) {
    var sid = String(id || '');
    var prefix = SOURCE + ':';
    if (sid.indexOf(prefix) === 0) sid = sid.slice(prefix.length);
    if (!validSlug(sid)) return { title: '', cover: '', desc: '', tags: [], lines: [] };

    var body = fetchText('/v/' + sid + '.html');
    var title = '';
    var h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(body);
    if (h1) title = unescapeHtml(stripTags(h1[1]));
    if (!title) {
      var pt = /data-title="([^"]*)"/i.exec(body);
      if (pt) title = unescapeHtml(pt[1].split(' - ')[0].trim());
    }
    var cover = '';
    var poster = /<div[^>]*class="w4-player"[^>]*data-poster="([^"]+)"/i.exec(body);
    if (poster) cover = fixUrl(poster[1]);

    var desc = '';
    var intro = /<div[^>]*class="w4-(?:info|content|desc)[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(body);
    if (intro) desc = truncate(stripTags(intro[1]), 600);

    // 选集列表：全文匹配属于本片（/v/{slug}/...）的选集链接。
    // w4 页面的 w4-episode-list 块常被嵌套 </div> 提前截断，直接用全文 + slug 前缀过滤更稳，
    // 配合 path 去重不会重复；title 形如"第N集"。
    var block = body;
    var episodes = [];
    var seen = {};
    var linkRe = /<a[^>]*href="(\/v\/[^"/]+\/[^"]+\.html)"[^>]*>/gi;
    var lm;
    while ((lm = linkRe.exec(block)) !== null) {
      var link = (lm[1] || '').trim();
      if (link.indexOf('/v/' + sid + '/') !== 0 || seen[link]) continue;
      var name = '';
      var nm = /\btitle="([^"]*)"/i.exec(lm[0]);
      if (nm) name = unescapeHtml(nm[1].trim());
      if (!name) {
        var gt = lm[0].lastIndexOf('>');
        name = stripTags(lm[0].slice(gt + 1));
      }
      seen[link] = true;
      // id 里带上选集页路径，play 时据此抓页取流
      episodes.push({ id: SOURCE + ':' + sid + ':' + link, name: truncate(name || ('第' + (episodes.length + 1) + '集'), 128) });
    }
    episodes.sort(function (a, b) {
      return episodeOrder(a.name) - episodeOrder(b.name);
    });

    return {
      title: truncate(title, 512),
      cover: cover,
      desc: desc,
      tags: [],
      lines: [{ name: '默认', episodes: episodes }]
    };
  }

  function episodeOrder(name) {
    var m = /第\s*(\d{1,6})\s*[集期话部]/.exec(String(name || ''));
    if (m) { var n = parseInt(m[1], 10); if (n > 0) return n; }
    return 100000;
  }

  function play(a) {
    var epId = String((a && a.episodeId) || '');
    // 格式：a123:{slug}:/v/{slug}/{code}.html
    var marker = SOURCE + ':';
    if (epId.indexOf(marker) !== 0) throw host.error('E_NOT_FOUND', '分集信息无效，请刷新详情');
    var rest = epId.slice(marker.length);
    var idx = rest.indexOf(':/v/');
    if (idx < 0) throw host.error('E_NOT_FOUND', '分集信息无效，请刷新详情');
    var slug = rest.slice(0, idx);
    var path = rest.slice(idx + 1); // /v/{slug}/{code}.html
    if (!validSlug(slug) || !/^\/v\/[^"/]+\/[^"]+\.html$/.test(path)) {
      throw host.error('E_NOT_FOUND', '分集信息无效，请刷新详情');
    }
    var body = fetchText(path);
    var options = [];
    var seen = {};

    function add(url) {
      url = String(url || '').trim();
      if (!/^https?:\/\//i.test(url) || seen[url]) return;
      seen[url] = true;
      options.push(url);
    }

    // 当集实际地址：w4-player data-src 排第一
    var ps = /<div[^>]*class="w4-player"[^>]*data-src="([^"]+)"/i.exec(body);
    if (ps) add(fixUrl(ps[1]));

    // var pp.la = 全线路 m3u8 直链表
    var ppm = /var\s+pp\s*=\s*(\{[\s\S]*?\})\s*;/i.exec(body);
    if (ppm) {
      try {
        var pp = JSON.parse(ppm[1]);
        var la = pp.la || [];
        for (var i = 0; i < la.length; i++) {
          var row = la[i];
          if (Array.isArray(row) && row.length > 4 && typeof row[4] === 'string') add(row[4]);
        }
      } catch (e) {}
    }

    if (!options.length) throw host.error('E_NOT_FOUND', '该集暂无可用播放地址，请换集或稍后重试');

    var streams = options.map(function (url, i) {
      return {
        url: url,
        name: options.length > 1 ? ('线路' + (i + 1)) : '默认',
        format: /\.m3u8/i.test(url) ? 'hls' : 'mp4',
        headers: { 'User-Agent': UA, 'Referer': SITE + '/' }
      };
    });
    return { streams: streams };
  }

  function home() {
    var cats = CATEGORIES.map(function (c) { return { id: c.id, name: c.name }; });
    var first = catalogPage(1, cats.length ? cats[0].id : '');
    return { categories: cats, items: first.items, hasMore: first.hasMore };
  }

  return {
    home: home,
    category: function (a) { a = a || {}; return catalogPage(a.page || 1, a.id || ''); },
    search: function (a) { a = a || {}; return search(a.page || 1, a.keyword || ''); },
    detail: function (a) { return detail((a && a.id) || ''); },
    play: play
  };
})();

export default _plugin;
