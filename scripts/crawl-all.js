#!/usr/bin/env node
// 全平台热点数据采集 - 整合自官方 route.ts
// 支持 29 个平台
// 用法: node crawl-all.js [--platform=平台名] [--limit=数量]

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

// ============ 微博热搜 ============
async function crawlWeibo() {
    const res = await fetch('https://weibo.com/ajax/side/hotSearch', {
        headers: {
            'User-Agent': UA,
            'Referer': 'https://weibo.com/',
            'Accept': 'application/json',
        },
    });
    const json = await res.json();
    if (json.ok !== 1) return [];
    return (json.data.realtime || []).map((v, i) => {
        const key = v.word_scheme ? v.word_scheme : `#${v.word}`;
        return {
            id: v.mid || i,
            title: v.word,
            desc: key,
            hot: v.num,
            label: v.label_name || '',
            url: `https://s.weibo.com/weibo?q=${encodeURIComponent(key)}&t=31&band_rank=1&Refer=top`,
            mobileUrl: `https://s.weibo.com/weibo?q=${encodeURIComponent(key)}&t=31&band_rank=1&Refer=top`,
        };
    });
}

// ============ 小红书热搜 ============
async function crawlXiaohongshu() {
    const xhsHeaders = {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.7(0x18000733) NetType/WIFI Language/zh_CN',
        'referer': 'https://app.xhs.cn/',
        'xy-direction': '22',
        'shield': 'XYAAAAAQAAAAEAAABTAAAAUzUWEe4xG1IYD9/c+qCLOlKGmTtFa+lG434Oe+FTRagxxoaz6rUWSZ3+juJYz8RZqct+oNMyZQxLEBaBEL+H3i0RhOBVGrauzVSARchIWFYwbwkV',
        'xy-platform-info': 'platform=iOS&version=8.7&build=8070515&deviceId=C323D3A5-6A27-4CE6-AA0E-51C9D4C26A24&bundle=com.xingin.discover',
        'xy-common-params': 'app_id=ECFAAF02&build=8070515&channel=AppStore&deviceId=C323D3A5-6A27-4CE6-AA0E-51C9D4C26A24&device_fingerprint=20230920120211bd7b71a80778509cf4211099ea911000010d2f20f6050264&device_fingerprint1=20230920120211bd7b71a80778509cf4211099ea911000010d2f20f6050264&device_model=phone&fid=1695182528-0-0-63b29d709954a1bb8c8733eb2fb58f29&gid=7dc4f3d168c355f1a886c54a898c6ef21fe7b9a847359afc77fc24ad&identifier_flag=0&lang=zh-Hans&launch_id=716882697&platform=iOS&project_id=ECFAAF&sid=session.1695189743787849952190&t=1695190591&teenager=0&tz=Asia/Shanghai&uis=light&version=8.7',
    };
    const res = await fetch('https://edith.xiaohongshu.com/api/sns/v1/search/hot_list', {
        headers: xhsHeaders,
    });
    const json = await res.json();
    if (!json.success) return [];
    return (json.data?.items || []).map((v, i) => ({
        id: v.id || i,
        title: v.title,
        hot: v.score,
        label: (!v.word_type || v.word_type === '无') ? '' : v.word_type,
        url: `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(v.title)}`,
        mobileUrl: `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(v.title)}`,
    }));
}

// ============ 抖音热搜 ============
async function crawlDouyin() {
    const res = await fetch('https://aweme.snssdk.com/aweme/v1/hot/search/list/', {
        headers: { 'User-Agent': UA },
    });
    const json = await res.json();
    if (json.status_code !== 0) return [];
    return (json.data.word_list || []).map((v, i) => ({
        id: v.group_id || i,
        title: v.word,
        pic: v.word_cover?.url_list?.[0] || '',
        hot: Number(v.hot_value),
        url: `https://www.douyin.com/hot/${encodeURIComponent(v.sentence_id)}`,
        mobileUrl: `https://www.douyin.com/hot/${encodeURIComponent(v.sentence_id)}`,
    }));
}

// ============ 百度热搜 ============
async function crawlBaidu() {
    const res = await fetch('https://top.baidu.com/api/board?platform=wise&tab=realtime', {
        headers: { 'User-Agent': UA },
    });
    const json = await res.json();
    if (!json.success) return [];
    const list = json.data?.cards?.[0]?.content?.[0]?.content || [];
    return list.map((v, i) => ({
        id: v.index || i,
        title: v.word,
        label: v.newHotName || '',
        hot: v.hotScore || '',
        url: `https://www.baidu.com/s?wd=${encodeURIComponent(v.word)}`,
        mobileUrl: v.url || '',
    }));
}

// ============ B站热门榜 ============
async function crawlBilibili() {
    const res = await fetch('https://api.bilibili.com/x/web-interface/ranking/v2', {
        headers: {
            'User-Agent': UA,
            'Referer': 'https://www.bilibili.com/ranking/all',
        },
    });
    const json = await res.json();
    const data = json?.data?.list || [];
    return data.map(v => ({
        id: v.bvid,
        title: v.title,
        desc: v.desc,
        pic: (v.pic || '').replace(/http:/, 'https:'),
        hot: v.stat?.view || 0,
        url: v.short_link_v2 || `https://b23.tv/${v.bvid}`,
        mobileUrl: `https://m.bilibili.com/video/${v.bvid}`,
    }));
}

// ============ B站搜索热搜 ============
async function crawlBilibiliSearch() {
    const res = await fetch('https://api.bilibili.com/x/web-interface/wbi/search/square?limit=50', {
        headers: { 'User-Agent': UA },
    });
    const json = await res.json();
    const list = json?.data?.trending?.list || [];
    return list.map((v, i) => ({
        id: i,
        title: v.show_name || v.keyword,
        desc: v.keyword,
        pic: v.icon || '',
        hot: v.heat_score || 0,
        url: `https://search.bilibili.com/all?keyword=${encodeURIComponent(v.keyword)}`,
        mobileUrl: `https://m.bilibili.com/search?keyword=${encodeURIComponent(v.keyword)}`,
    }));
}

// ============ 36kr热榜 ============
async function crawl36kr() {
    const res = await fetch('https://gateway.36kr.com/api/mis/nav/home/nav/rank/hot', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        },
        body: JSON.stringify({
            partner_id: 'wap',
            param: { siteId: 1, platformId: 2 },
            timestamp: Date.now(),
        }),
    });
    const json = await res.json();
    if (json.code !== 0) return [];
    return (json.data?.hotRankList || []).map(v => ({
        id: v.itemId,
        title: v?.templateMaterial?.widgetTitle || '',
        pic: v?.templateMaterial?.widgetImage || '',
        hot: v?.templateMaterial?.statRead || 0,
        url: `https://www.36kr.com/p/${v.itemId}`,
        mobileUrl: `https://m.36kr.com/p/${v.itemId}`,
    }));
}

// ============ 豆瓣电影榜单 ============
async function crawlDoubanMovie() {
    const res = await fetch('https://movie.douban.com/chart', {
        headers: {
            'User-Agent': UA,
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'zh-CN,zh;q=0.9',
        },
    });
    const html = await res.text();
    const results = [];
    const regex = /<a class="nbg" href="(https:\/\/movie\.douban\.com\/subject\/(\d+)\/)"[^>]*title="([^"]+)"[^>]*>/g;
    let match;
    while ((match = regex.exec(html)) !== null && results.length < 50) {
        results.push({
            id: match[2],
            title: match[3],
            url: match[1],
            mobileUrl: match[1].replace('https://movie.douban.com', 'https://m.douban.com'),
        });
    }
    return results;
}

// ============ 豆瓣精选 ============
async function crawlDouban() {
    const res = await fetch('https://m.douban.com/rexxar/api/v2/gallery/hot_items?start=0&count=50', {
        headers: {
            'User-Agent': UA,
            'Accept': 'application/json, text/plain, */*',
            'Origin': 'https://www.douban.com',
            'Referer': 'https://www.douban.com/gallery/',
        },
    });
    const json = await res.json();
    const list = json.items || [];
    return list.map((v, i) => {
        const webUrl = v.target?.uri?.replace('douban://douban.com/', 'https://www.douban.com/')?.split('?')[0] || '';
        return {
            id: v.target_id || i,
            title: v.target?.title || (v.target?.abstract?.substring(0, 50) + '...'),
            desc: v.target?.abstract || '',
            pic: v.target?.photos?.[0]?.large?.url || v.target?.photos?.[0]?.normal?.url || '',
            tip: v.target?.card_subtitle || '',
            url: webUrl,
            mobileUrl: webUrl,
        };
    });
}

// ============ 豆瓣搜索热搜 ============
async function crawlDoubanSearch() {
    const res = await fetch('https://m.douban.com/rexxar/api/v2/chart/hot_search_board?count=50&start=0', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Origin': 'https://www.douban.com',
            'Referer': 'https://www.douban.com/gallery/',
        },
    });
    const list = await res.json();
    if (!Array.isArray(list)) return [];
    return list.map((v, i) => {
        const searchQuery = v.uri?.split('q=')[1] || encodeURIComponent(`#${v.name}#`);
        return {
            id: i,
            title: v.name,
            hot: v.score || 0,
            label: v.trend_flag === 1 ? '上升' : v.trend_flag === 2 ? '下降' : '',
            url: `https://www.douban.com/search?q=${searchQuery}`,
            mobileUrl: `https://www.douban.com/search?q=${searchQuery}`,
        };
    });
}

// ============ 豆瓣话题 ============
async function crawlDoubanTopic() {
    const res = await fetch('https://m.douban.com/rexxar/api/v2/gallery/web_hot_topics?count=50&filter_names=&start=0', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Origin': 'https://www.douban.com',
            'Referer': 'https://www.douban.com/gallery/',
        },
    });
    const json = await res.json();
    const list = json.items || [];
    return list.map((v, i) => ({
        id: v.id || i,
        title: v.title || v.name,
        hot: v.read_count || 0,
        url: v.url || '',
        mobileUrl: v.sharing_url || v.url || '',
    }));
}

// ============ 虎扑步行街 ============
async function crawlHupu() {
    const res = await fetch('https://bbs.hupu.com/all-gambia', {
        headers: { 'User-Agent': UA },
    });
    const html = await res.text();
    const match = html.match(/window\.\$\$data=({.+})/);
    if (!match) return [];
    const data = JSON.parse(match[1]);
    const threads = data?.pageData?.threads || [];
    return threads.map(v => ({
        id: v.tid,
        title: v.title,
        desc: v.desc || '',
        pic: v.cover || '',
        tip: v.lights || '',
        url: `https://bbs.hupu.com${v.url}`,
        mobileUrl: `https://bbs.hupu.com${v.url}`,
    }));
}

// ============ 懂车帝热搜 ============
async function crawlDongchedi() {
    const res = await fetch('https://www.dongchedi.com/news', {
        headers: { 'User-Agent': UA },
    });
    const html = await res.text();
    const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
    if (!match) return [];
    const data = JSON.parse(match[1]);
    const list = data?.props?.pageProps?.hotSearchList || [];
    return list.map((v, i) => ({
        id: i + 1,
        title: v.title,
        hot: v.score || 0,
        url: `https://www.dongchedi.com/search?keyword=${encodeURIComponent(v.title)}`,
        mobileUrl: `https://www.dongchedi.com/search?keyword=${encodeURIComponent(v.title)}`,
    }));
}

// ============ 今日头条 ============
async function crawlToutiao() {
    const res = await fetch('https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc', {
        headers: { 'User-Agent': UA },
    });
    const json = await res.json();
    if (json.status !== 'success') return [];
    return (json.data || []).map((v, i) => ({
        id: v.ClusterId || i,
        title: v.Title,
        pic: v.Image?.url || '',
        hot: v.HotValue || 0,
        url: `https://www.toutiao.com/trending/${v.ClusterIdStr}/`,
        mobileUrl: `https://api.toutiaoapi.com/feoffline/amos_land/new/html/main/index.html?topic_id=${v.ClusterIdStr}`,
    }));
}

// ============ CSDN热榜 ============
async function crawlCsdn() {
    const res = await fetch('https://blog.csdn.net/phoenix/web/blog/hot-rank?page=0&pageSize=100', {
        headers: {
            'User-Agent': UA,
            'Referer': 'https://blog.csdn.net/',
            'Accept': 'application/json, text/plain, */*',
            'Origin': 'https://blog.csdn.net',
        },
        cache: 'no-store',
    });
    if (!res.ok) {
        const res2 = await fetch('https://hot.cnblogs.com/hot?name=%E9%A6%96%E9%A1%B5&period=0&pageSize=50', {
            headers: { 'User-Agent': UA },
        });
        const json2 = await res2.json();
        return (json2 || []).slice(0, 50).map((v, i) => ({
            id: v.articleDetailUrl || i,
            title: v.articleTitle || v.title || '',
            tip: v.pcHotRankScore || v.hot || '',
            hot: v.hotRankScore || 0,
            url: v.articleDetailUrl || v.url || '',
            mobileUrl: v.articleDetailUrl || v.url || '',
        }));
    }
    const json = await res.json();
    if (json.code !== 200) return [];
    return (json.data || []).map((v, i) => ({
        id: v.articleDetailUrl || i,
        title: v.articleTitle || '',
        tip: v.pcHotRankScore || '',
        hot: v.hotRankScore || 0,
        url: v.articleDetailUrl || '',
        mobileUrl: v.articleDetailUrl || '',
    }));
}

// ============ 百度贴吧 ============
async function crawlBaidutieba() {
    const res = await fetch('https://tieba.baidu.com/hottopic/browse/topicList', {
        headers: {
            'User-Agent': UA,
            'Referer': 'https://tieba.baidu.com/',
            'Accept': 'application/json',
        },
    });
    const json = await res.json();
    if (json.errmsg !== 'success') return [];
    const list = json.data?.bang_topic?.topic_list || [];
    return list.map((v, i) => ({
        id: v.topic_id || i,
        title: v.topic_name,
        desc: v.topic_desc || '',
        hot: v.discuss_num || 0,
        url: `https://tieba.baidu.com/topic/q?kw=${encodeURIComponent(v.topic_name)}`,
        mobileUrl: `https://tieba.baidu.com/f?kw=${encodeURIComponent(v.topic_name)}`,
    }));
}

// ============ GitHub Trending ============
async function crawlGithubTrending() {
    const res = await fetch('https://api.github.com/search/repositories?q=stars:>1&sort=stars&order=desc&per_page=50', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Accept': 'application/vnd.github.v3+json',
        },
    });
    const json = await res.json();
    return (json.items || []).map((v, i) => ({
        id: v.id || i,
        title: v.full_name,
        desc: v.description || '',
        pic: v.owner?.avatar_url || '',
        hot: v.stargazers_count || 0,
        label: v.language || '',
        url: v.html_url,
        mobileUrl: v.html_url,
    }));
}

// ============ HelloGithub ============
async function crawlHelloGithub() {
    const res = await fetch('https://api.github.com/search/repositories?q=stars:>1000+created:>2024-01-01&sort=stars&order=desc&per_page=50', {
        headers: {
            'User-Agent': UA,
            'Accept': 'application/vnd.github.v3+json',
        },
    });
    const json = await res.json();
    return (json.items || []).map((v, i) => ({
        id: v.id || i,
        title: v.full_name,
        desc: v.description || '',
        pic: v.owner?.avatar_url || '',
        hot: v.stargazers_count || 0,
        label: v.language || '',
        url: v.html_url,
        mobileUrl: v.html_url,
    }));
}

// ============ 历史上的今天 ============
async function crawlHistoryToday() {
    const now = new Date();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const res = await fetch(`https://baike.baidu.com/cms/home/eventsOnHistory/${month}.json`, {
        headers: { 'User-Agent': UA },
    });
    const json = await res.json();
    const list = json[month]?.[month + day] || [];
    return list.map((v, i) => ({
        id: i,
        title: (v.title || '').replace(/<[^>]+>/g, ''),
        tip: v.year,
        url: v.link || '',
        mobileUrl: v.link || '',
    }));
}

// ============ 虎嗅 ============
async function crawlHuxiu() {
    const res = await fetch('https://moment-api.huxiu.com/web-v3/moment/feed?platform=www', {
        headers: {
            'User-Agent': UA,
            'Referer': 'https://www.huxiu.com/moment/',
        },
    });
    const json = await res.json();
    return (json?.data?.moment_list?.datalist || []).map(v => {
        const content = (v.content || "").replace(/<br\s*\/?>/gi, "\n");
        const [titleLine, ...rest] = content.split("\n").map(s => s.trim()).filter(Boolean);
        return {
            id: v.object_id,
            title: (titleLine || "").replace(/。$/, ""),
            url: `https://www.huxiu.com/moment/${v.object_id}.html`,
            mobileUrl: `https://m.huxiu.com/moment/${v.object_id}.html`,
        };
    });
}

// ============ 爱范儿 ============
async function crawlIfanr() {
    const res = await fetch('https://sso.ifanr.com/api/v5/wp/buzz/?limit=50&offset=0', {
        headers: {
            'User-Agent': UA,
            'Accept': 'application/json',
        },
    });
    const json = await res.json();
    const list = json.objects || [];
    return list.map((v) => ({
        id: v.post_id,
        title: v.post_title,
        url: v.buzz_original_url || `https://www.ifanr.com/${v.post_id}`,
        mobileUrl: v.buzz_original_url || `https://www.ifanr.com/digest/${v.post_id}`,
    }));
}

// ============ IT之家 ============
async function crawlIthome() {
    const res = await fetch('https://m.ithome.com/rankm', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
            'Referer': 'https://m.ithome.com/',
        },
    });
    const html = await res.text();
    const items = [];
    // 解析结构: plc-title 和 review-num
    const itemRegex = /<p class="plc-title">([^<]+)<\/p>[\s\S]*?<span class="review-num">(\d+)评<\/span>/g;
    let match;
    while ((match = itemRegex.exec(html)) !== null && items.length < 50) {
        items.push({
            id: items.length + 1,
            title: match[1].trim(),
            hot: parseInt(match[2]) || 0,
            url: 'https://m.ithome.com/rankm',
            mobileUrl: 'https://m.ithome.com/rankm',
        });
    }
    return items;
}

// ============ 掘金 ============
async function crawlJuejin() {
    const res = await fetch('https://api.juejin.cn/content_api/v1/content/article_rank?category_id=1&type=hot', {
        headers: { 'User-Agent': UA },
    });
    const json = await res.json();
    if (json.err_msg !== 'success') return [];
    const list = json.data || [];
    return list.map((v, i) => ({
        id: v.content.content_id || i,
        title: v.content.title || '',
        desc: v.content.brief || '',
        pic: v.content.cover_image || '',
        hot: v.content_counter?.hot_rank || 0,
        label: v.content.category?.category_name || '',
        url: `https://juejin.cn/post/${v.content.content_id}`,
        mobileUrl: `https://juejin.cn/post/${v.content.content_id}`,
    }));
}

// ============ 快手热搜 ============
async function crawlKuaishou() {
    const res = await fetch('https://www.kuaishou.com/?isHome=1', {
        headers: { 'User-Agent': UA },
    });
    const html = await res.text();
    const result = [];
    const pattern = /window\.__APOLLO_STATE__=(.*);\(function\(\)/s;
    const idPattern = /clientCacheKey=([A-Za-z0-9]+)/s;
    const matchResult = html.match(pattern);
    if (!matchResult) return result;
    const jsonObject = JSON.parse(matchResult[1])['defaultClient'] || {};
    const allItems = jsonObject['$ROOT_QUERY.visionHotRank({"page":"home"})']?.items || [];
    allItems.forEach((v) => {
        const image = jsonObject[v.id]?.poster || '';
        const id = image.match(idPattern)?.[1] || '';
        result.push({
            id,
            title: jsonObject[v.id]?.name || '',
            pic: jsonObject[v.id]?.poster || '',
            hot: (parseFloat(jsonObject[v.id]?.hotValue || '0') * 10000) || 0,
            url: `https://www.kuaishou.com/short-video/${id}`,
            mobileUrl: `https://www.kuaishou.com/short-video/${id}`,
        });
    });
    return result;
}

// ============ 英雄联盟 ============
async function crawlLol() {
    const res = await fetch('https://apps.game.qq.com/cmc/zmMcnTargetContentList?page=1&num=50&target=24&source=web_pc', {
        headers: { 'User-Agent': UA },
    });
    const json = await res.json();
    if (json.status !== 1) return [];
    const list = json.data?.result || [];
    return list.map((v) => ({
        id: v.iDocID,
        title: v.sTitle || '',
        desc: v.sAuthor || '',
        pic: v.sIMG || '',
        hot: parseInt(v.iTotalPlay) || 0,
        url: `https://lol.qq.com/news/detail.shtml?docid=${encodeURIComponent(v.iDocID)}`,
        mobileUrl: `https://lol.qq.com/news/detail.shtml?docid=${encodeURIComponent(v.iDocID)}`,
    }));
}

// ============ 网易新闻 ============
async function crawlNetease() {
    const res = await fetch('https://news.163.com/rank/', {
        headers: { 'User-Agent': UA },
    });
    const html = await res.text();
    const items = [];
    const regex = /<a[^>]*href="(https?:\/\/[^\"]+163\.com\/[^\"]+)"[^>]*>([^<]+)<\/a>/g;
    let match;
    while ((match = regex.exec(html)) !== null && items.length < 50) {
        const title = match[2].trim();
        if (title && title.length > 5) {
            items.push({
                id: items.length,
                title: title,
                url: match[1],
                mobileUrl: match[1].replace('163.com', 'm.163.com'),
            });
        }
    }
    return items;
}

// ============ 网易云音乐 ============
async function crawlNeteaseMusic() {
    const res = await fetch('https://music.163.com/api/playlist/detail?id=3778678', {
        headers: {
            'User-Agent': UA,
            'Referer': 'https://music.163.com/',
            'authority': 'music.163.com',
        },
    });
    const json = await res.json();
    const tracks = json.result?.tracks || [];
    return tracks.map((v, i) => ({
        id: v.id,
        title: v.name,
        author: v.artists.map((a) => a.name).join('/'),
        pic: v.album?.picUrl || '',
        url: `https://music.163.com/#/song?id=${v.id}`,
        mobileUrl: `https://music.163.com/m/song?id=${v.id}`,
    }));
}

// ============ QQ热搜 ============
async function crawlQq() {
    const res = await fetch('https://r.inews.qq.com/gw/event/hot_ranking_list', {
        headers: { 'User-Agent': UA },
    });
    const json = await res.json();
    const list = json.idlist?.[0]?.newslist?.slice(1) || [];
    return list.map((v) => ({
        id: v.id,
        title: v.title,
        desc: v.abstract || '',
        pic: v.miniProShareImage || '',
        hot: v.readCount || 0,
        url: `https://new.qq.com/rain/a/${v.id}`,
        mobileUrl: `https://view.inews.qq.com/a/${v.id}`,
    }));
}

// ============ 夸克热搜 ============
async function crawlQuark() {
    const res = await fetch('https://iflow.quark.cn/iflow/api/v1/article/aggregation?aggregation_id=16665090098771297825&count=50&bottom_pos=0', {
        headers: { 'User-Agent': UA },
    });
    const json = await res.json();
    const list = json.data?.articles || [];
    return list.map((v) => ({
        id: v.id,
        title: v.title,
        url: `https://123.quark.cn/detail?item_id=${v.id}`,
        mobileUrl: `https://123.quark.cn/detail?item_id=${v.id}`,
    }));
}

// ============ 澎湃新闻 ============
async function crawlThepaper() {
    const res = await fetch('https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar', {
        headers: { 'User-Agent': UA },
    });
    const json = await res.json();
    if (json.resultCode !== 1) return [];
    const list = json.data?.hotNews || [];
    return list.map((v) => ({
        id: v.contId,
        title: v.name || '',
        pic: v.pic || '',
        hot: parseInt(v.praiseTimes) || 0,
        url: `https://www.thepaper.cn/newsDetail_forward_${v.contId}`,
        mobileUrl: `https://m.thepaper.cn/newsDetail_forward_${v.contId}`,
    }));
}

// ============ 微信读书 ============
async function crawlWeread() {
    const res = await fetch('https://weread.qq.com/web/bookListInCategory/rising?rank=1', {
        headers: { 'User-Agent': UA },
    });
    const json = await res.json();
    const books = json.books || [];
    return books.map((v) => {
        const info = v.bookInfo;
        return {
            id: info.bookId,
            title: info.title,
            hot: v.readingCount || 0,
            pic: (info.cover || '').replace('s_', 't9_'),
            url: `https://weread.qq.com/bookDetail/${info.bookId}`,
            mobileUrl: `https://weread.qq.com/bookDetail/${info.bookId}`,
        };
    });
}

// ============ 知乎 ============
async function crawlZhihu() {
    const res = await fetch('https://api.zhihu.com/topstory/hot-lists/total', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            'X-API-Version': '3.0.40',
            'X-App-Version': '5.36.0',
        },
    });
    const json = await res.json();
    const list = json.data || [];
    return list.map((v, i) => ({
        id: v.target?.id || i,
        title: v.target?.title || v.target?.question?.title || '',
        desc: v.target?.excerpt || '',
        pic: v.target?.thumbnail || '',
        hot: v.detail_text || v.metrics || 0,
        label: v.target?.type || '',
        url: v.target?.url?.replace('api.zhihu.com', 'zhihu.com') || '',
        mobileUrl: v.target?.url?.replace('api.zhihu.com', 'zhuanlan.zhihu.com') || '',
    }));
}

// ============ 知乎日报 ============
async function crawlZhihuDaily() {
    const res = await fetch('https://daily.zhihu.com/api/4/news/latest', {
        headers: {
            'User-Agent': UA,
            'Referer': 'https://daily.zhihu.com/',
            'Host': 'daily.zhihu.com',
        },
    });
    const json = await res.json();
    const list = json.stories || [];
    return list.map(v => ({
        id: v.id,
        title: v.title,
        pic: v.images?.[0] || '',
        label: v.type === 1 ? '今日头条' : '',
        url: v.url,
        mobileUrl: v.url,
    }));
}

// ============ 知乎搜索热搜 ============
async function crawlZhihuSearch() {
    const res = await fetch('https://www.zhihu.com/api/v4/search/hot_search', {
        headers: {
            'User-Agent': UA,
        },
    });
    const json = await res.json();
    const list = json.hot_search_queries || [];
    return list.map((v, i) => ({
        id: v.query_id || i,
        title: v.query,
        pic: v.icon_url || '',
        hot: v.hot_show || v.hot || 0,
        label: v.label || '',
        url: v.redirect_link || `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(v.query)}`,
        mobileUrl: `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(v.query)}`,
    }));
}

// 平台映射
const CRAWLERS = {
    // 社交媒体
    weibo: { fn: crawlWeibo, label: '微博热搜' },
    xiaohongshu: { fn: crawlXiaohongshu, label: '小红书热搜' },
    douyin: { fn: crawlDouyin, label: '抖音热搜' },
    kuaishou: { fn: crawlKuaishou, label: '快手热搜' },
    qq: { fn: crawlQq, label: 'QQ热搜' },
    quark: { fn: crawlQuark, label: '夸克热搜' },

    // 搜索引擎/综合
    baidu: { fn: crawlBaidu, label: '百度热搜' },
    baidutieba: { fn: crawlBaidutieba, label: '百度贴吧' },
    zhihu: { fn: crawlZhihu, label: '知乎热榜' },
    'zhihu-daily': { fn: crawlZhihuDaily, label: '知乎日报' },
    'zhihu-search': { fn: crawlZhihuSearch, label: '知乎搜索热搜' },

    // 视频/二次元
    bilibili: { fn: crawlBilibili, label: 'B站热门榜' },
    'bilibili-search': { fn: crawlBilibiliSearch, label: 'B站搜索热搜' },
    lol: { fn: crawlLol, label: '英雄联盟' },

    // 新闻/科技
    toutiao: { fn: crawlToutiao, label: '今日头条' },
    netease: { fn: crawlNetease, label: '网易新闻' },
    thepaper: { fn: crawlThepaper, label: '澎湃新闻' },
    ithome: { fn: crawlIthome, label: 'IT之家' },
    huxiu: { fn: crawlHuxiu, label: '虎嗅' },
    ifanr: { fn: crawlIfanr, label: '爱范儿' },
    '36kr': { fn: crawl36kr, label: '36kr热榜' },

    // 技术社区
    juejin: { fn: crawlJuejin, label: '掘金热榜' },
    csdn: { fn: crawlCsdn, label: 'CSDN热榜' },
    github: { fn: crawlGithubTrending, label: 'GitHub趋势' },
    'hello-github': { fn: crawlHelloGithub, label: 'HelloGithub' },

    // 豆瓣
    douban: { fn: crawlDouban, label: '豆瓣精选' },
    'douban-movie': { fn: crawlDoubanMovie, label: '豆瓣电影热门' },
    'douban-search': { fn: crawlDoubanSearch, label: '豆瓣搜索' },
    'douban-topic': { fn: crawlDoubanTopic, label: '豆瓣话题' },

    // 其他
    weread: { fn: crawlWeread, label: '微信读书' },
    'netease-music': { fn: crawlNeteaseMusic, label: '网易云音乐' },
    hupu: { fn: crawlHupu, label: '虎扑步行街' },
    dongchedi: { fn: crawlDongchedi, label: '懂车帝热搜' },
    'history-today': { fn: crawlHistoryToday, label: '历史上的今天' },
};

// 主函数
async function main() {
    const args = process.argv.slice(2);
    let platform = 'all';
    let limit = 10;

    for (const arg of args) {
        if (arg.startsWith('--platform=')) platform = arg.split('=')[1];
        if (arg.startsWith('--limit=')) limit = parseInt(arg.split('=')[1]) || 10;
    }

    const targets = platform === 'all' ? Object.keys(CRAWLERS) : [platform];
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const results = {};

    for (const name of targets) {
        const crawler = CRAWLERS[name];
        if (!crawler) {
            results[name] = { success: false, error: `不支持的平台: ${name}` };
            continue;
        }
        try {
            const data = await crawler.fn();
            results[name] = {
                success: true,
                label: crawler.label,
                data: { sj: data.slice(0, limit), time: now },
                count: Math.min(data.length, limit),
                total: data.length,
            };
        } catch (e) {
            results[name] = { success: false, error: e.message };
        }
    }

    console.log(JSON.stringify({ status: 'ok', results }, null, 2));
}

main().catch(e => {
    console.error(JSON.stringify({ status: 'error', message: e.message }));
    process.exit(1);
});
