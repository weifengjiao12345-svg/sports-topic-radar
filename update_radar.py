#!/usr/bin/env python3
"""
选题雷达更新脚本（外置版）
最高性价比方案：Gemini 搜索 + URL验证 + Gemini 提炼

用法：
  python update_radar.py --search    # 仅执行搜索，输出 search_results.json
  python update_radar.py --process   # 处理搜索结果，生成 HTML
  python update_radar.py --full      # 完整流程（search + process）
"""

import argparse
import json
import re
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta

import pytz

# ============ 配置 ============
TZ = pytz.timezone('Asia/Shanghai')
NOW = datetime.now(TZ)
TODAY = NOW.strftime('%Y-%m-%d')
YESTERDAY = (NOW - timedelta(days=1)).strftime('%Y-%m-%d')
DAY_BEFORE = (NOW - timedelta(days=2)).strftime('%Y-%m-%d')
WEEKDAY = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][NOW.weekday()]
COMPACT = NOW.strftime('%Y%m%d')
YEAR_MONTH = NOW.strftime('%Y年%m月')
YEAR = NOW.year

WORKSPACE = '/data/coda/dr4awfq4/ws/51f8dc26-a89b-4703-bd6a-b2aa31ae5f9d'
HTML_PATH = f'{WORKSPACE}/运动户外选题雷达/index.html'
TRACK_PATH = f'{WORKSPACE}/运动户外选题雷达/track_keywords.json'
TMP_DIR = f'{WORKSPACE}/运动户外选题雷达/tmp'

GEMINI_API_KEY = '1sGK0Ye0792JMtNQD4D59770-0859-4958-bBdA-F451De4d'
GEMINI_ENDPOINT = 'https://api.modelverse.cn/v1/chat/completions'
GEMINI_MODEL_SEARCH = 'gemini-3.1-flash-lite-preview'  # 搜索用最便宜的模型
GEMINI_MODEL_PROCESS = 'gemini-3-flash-preview'       # 提炼用标准模型

# 兜底模板（降本优化）
FALLBACK_FORMATS = [
    '📊 数据对比：搜索指数vs讨论热度',
    '💬 话题讨论：撕裂点在哪里',
    '🗳️ 投票互动：站队投票'
]
FALLBACK_MOTIVATION = '用户在社交平台发起话题讨论 + 媒体跟进报道引发热议 + 网友自发分享真实体验'

# ============ 节日档期 ============
FESTIVALS = [
    (1, 1, '元旦', ['元旦假期', '跨年', '新年出行', '新年购物']),
    (1, 25, '春节', ['春节档', '春运', '过年', '年货', '春节出行', '贺岁片']),
    (4, 4, '清明', ['清明假期', '清明出行', '扫墓', '踏青']),
    (5, 1, '五一', ['五一档', '五一出行', '劳动节', '五一旅游', '五一购物', '假日消费']),
    (6, 1, '端午', ['端午假期', '端午出行', '龙舟', '端午旅游']),
    (7, 1, '暑期', ['暑期档', '暑假出行', '暑假旅游', '暑期消费']),
    (10, 1, '国庆', ['国庆档', '国庆旅游', '黄金周', '国庆出行', '国庆购物']),
    (12, 25, '元旦前', ['跨年档', '跨年旅游', '圣诞', '元旦出行']),
]

today_date = NOW.date()
FESTIVAL_NAME, FESTIVAL_KEYWORDS, DAYS_TO_FESTIVAL = '', [], 999
for month, day, name, kws in FESTIVALS:
    try:
        fd = date(YEAR, month, day)
    except:
        continue
    diff = (fd - today_date).days
    if -7 <= diff <= 45 and abs(diff) < abs(DAYS_TO_FESTIVAL):
        DAYS_TO_FESTIVAL, FESTIVAL_NAME, FESTIVAL_KEYWORDS = diff, name, kws

# ============ Gemini API ============
def call_gemini(system_prompt, user_content, model=GEMINI_MODEL_PROCESS, max_tokens=7000, temperature=0.5):
    """调用 Gemini API"""
    payload = json.dumps({
        'model': model,
        'messages': [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': user_content}
        ],
        'max_tokens': max_tokens,
        'temperature': temperature
    }).encode('utf-8')
    
    req = urllib.request.Request(
        GEMINI_ENDPOINT,
        data=payload,
        headers={
            'Authorization': f'Bearer {GEMINI_API_KEY}',
            'Content-Type': 'application/json'
        },
        method='POST'
    )
    
    with urllib.request.urlopen(req, timeout=90) as resp:
        result = json.loads(resp.read().decode())
        return result['choices'][0]['message']['content']


def gemini_search(query, max_results=3):
    """用 Gemini 搜索替代 universal_search（最高性价比）
    
    ⚠️ 注意：Gemini 生成的 URL 可能虚构，需通过 validate_and_fix_urls 验证
    """
    
    SEARCH_PROMPT = f"""搜索并返回关于"{query}"的最新信息（优先 {TODAY} 或 {YESTERDAY} 发生的）。

返回 JSON 数组格式，每条包含：
- title: 标题（60字内）
- url: 来源链接（如不确定真实URL，写 https://s.weibo.com/weibo?q=关键词）
- date: 日期（YYYY-MM-DD格式，优先今天或昨天）
- snippet: 摘要（100字内）

返回 {max_results} 条最新结果。
如果不确定真实URL，优先返回微博热搜链接格式。
只返回 JSON，不要其他文字。"""

    try:
        response = call_gemini(
            "",  # 无 system prompt
            SEARCH_PROMPT,
            model=GEMINI_MODEL_SEARCH,  # 用最便宜的模型
            max_tokens=2000,
            temperature=0.3
        )
        
        # 清理响应
        cleaned = re.sub(r'```json\n?', '', response).strip()
        cleaned = re.sub(r'\n?```', '', cleaned)
        
        results = json.loads(cleaned)
        if isinstance(results, list):
            return results
        return []
    except Exception as e:
        print(f"  ⚠️ Gemini搜索失败: {e}")
        return []


def validate_and_fix_urls(results, query):
    """验证 URL 可访问性，无效时用微博热搜替代"""
    
    validated = []
    for r in results:
        url = r.get('url', '')
        name = r.get('title', '')[:20] or query[:20]
        
        if url and url.startswith('http'):
            # 快速检查 URL 是否真实存在（3秒超时）
            try:
                check = subprocess.run(
                    ['curl', '-s', '-I', '-m', '3', url],
                    capture_output=True, text=True
                )
                if '200' in check.stdout or '301' in check.stdout or '302' in check.stdout:
                    validated.append(r)
                    continue
            except:
                pass
        
        # URL 无效 → 用微博热搜替代
        r['url'] = f"https://s.weibo.com/weibo?q={urllib.parse.quote(name)}"
        r['name'] = name
        validated.append(r)
    
    return validated


def gemini_search_with_validation(query, max_results=5):
    """Gemini 搜索 + URL 验证"""
    results = gemini_search(query, max_results)
    if results:
        validated = validate_and_fix_urls(results, query)
        return validated
    # Gemini 搜索失败 → 返回微博热搜链接作为兜底
    return [{
        'title': query,
        'url': f"https://s.weibo.com/weibo?q={urllib.parse.quote(query)}",
        'date': TODAY,
        'snippet': '请通过微博查看最新讨论'
    }]


# ============ 热榜抓取（curl） ============
def curl_get(url, headers=None):
    """curl 获取内容"""
    cmd = ['curl', '-s', '-m', '10']
    if headers:
        for k, v in headers.items():
            cmd += ['-H', f'{k}: {v}']
    cmd.append(url)
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.stdout


def fetch_realtime_hot():
    """抓取4路实时热榜"""
    realtime_hot = []
    
    # 微博热搜
    try:
        wb_raw = curl_get('https://weibo.com/ajax/side/hotSearch', {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Referer': 'https://weibo.com/'
        })
        wb_data = json.loads(wb_raw)
        wb_hot = wb_data.get('data', {}).get('realtime', [])
        weibo_hot = [(item.get('word', ''), item.get('num', 0)) for item in wb_hot if item.get('word')]
        realtime_hot += [w for w, _ in weibo_hot[:30]]
        print(f"✅ 微博热搜: {len(weibo_hot)}条 | Top5: {[w for w, _ in weibo_hot[:5]]}")
    except Exception as e:
        print(f"⚠️ 微博热搜失败: {e}")
    
    # 百度热搜
    try:
        bd_raw = curl_get('https://top.baidu.com/board?tab=realtime', {'User-Agent': 'Mozilla/5.0'})
        baidu_hot = re.findall(r'"query":"([^"]+)"', bd_raw)[:20]
        realtime_hot += baidu_hot
        print(f"✅ 百度热搜: {len(baidu_hot)}条 | Top5: {baidu_hot[:5]}")
    except Exception as e:
        print(f"⚠️ 百度热搜失败: {e}")
    
    # 头条热榜
    try:
        tt_raw = curl_get('https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc', {'User-Agent': 'Mozilla/5.0'})
        tt_data = json.loads(tt_raw)
        toutiao_hot = [item.get('Title', '') for item in tt_data.get('data', [])[:20] if item.get('Title')]
        realtime_hot += toutiao_hot
        print(f"✅ 头条热榜: {len(toutiao_hot)}条 | Top5: {toutiao_hot[:5]}")
    except Exception as e:
        print(f"⚠️ 头条热搜失败: {e}")
    
    # 澎湃热榜
    try:
        pp_raw = curl_get('https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar', {'User-Agent': 'Mozilla/5.0'})
        pp_data = json.loads(pp_raw)
        hot_list = pp_data.get('data', {}).get('hotNews', []) or pp_data.get('data', {}).get('hotList', [])
        pengpai_hot = [item.get('name', '') or item.get('title', '') for item in hot_list[:10]]
        pengpai_hot = [t for t in pengpai_hot if t]
        realtime_hot += pengpai_hot
        print(f"✅ 澎湃热榜: {len(pengpai_hot)}条 | Top3: {pengpai_hot[:3]}")
    except Exception as e:
        print(f"⚠️ 澎湃热搜失败: {e}")
    
    # 去重
    seen = set()
    dedup = []
    for w in realtime_hot:
        w = w.strip().lstrip('#').rstrip('#')
        if w and w not in seen:
            seen.add(w)
            dedup.append(w)
    
    return dedup


# ============ 追踪词读取 ============
def load_track_keywords():
    """从 JSON 读取追踪词"""
    try:
        with open(TRACK_PATH, 'r') as f:
            data = json.load(f)
        print(f"✅ 追踪词从JSON读取：{len(data)}品类")
        return data
    except Exception as e:
        print(f"⚠️ 追踪词读取失败，用默认值: {e}")
        return {
            'sports': ['运动', '户外', '装备'],
            'tech': ['数码', '科技', '新品'],
            'cs2': ['CS2', '赛事', '选手'],
            'travel': ['旅游', '酒店', '出行'],
            'entertainment': ['电影', '明星', '综艺'],
            'finance': ['理财', '利率', '基金'],
            'food': ['外卖', '美食', '餐饮']
        }


# ============ 搜索执行 ============
def execute_searches(track_data, realtime_hot):
    """执行七品类搜索，返回结构化数据"""
    
    print(f"\n📊 开始搜索（Gemini + URL验证）...")
    search_results = {}
    fallback_count = 0
    
    # 运动户外 8组
    sports_results = []
    sports_queries = [
        f"运动装备 户外 {TODAY}",
        f"骑行 自行车 {TODAY}",
        f"健康监测 运动手表 {TODAY}",
        f"始祖鸟 巴塔哥尼亚 萨洛蒙 {TODAY}",
        f"李宁 安踏 特步 户外国货 {TODAY}",
        f"马拉松 越野跑 骑行赛事 {TODAY}",
        f"碳板跑鞋 冲锋衣 防水 {TODAY}",
        f"{track_data['sports'][0]} {track_data['sports'][1]} {TODAY}",
    ]
    for i, q in enumerate(sports_queries, 1):
        print(f"  G{i}: {q[:40]}...")
        results = gemini_search_with_validation(q, max_results=5)
        sports_results.extend(results)
        if not results or len(results) < 3:
            fallback_count += 1
    search_results['sports'] = sports_results
    
    # 数码科技 9组
    tech_results = []
    tech_queries = [
        f"手机 新品发布 {TODAY}",
        f"AI 大模型 {TODAY}",
        f"苹果 华为 小米 {TODAY}",
        f"笔记本 平板 {TODAY}",
        f"电动车 新能源汽车 {TODAY}",
        f"芯片 半导体 {TODAY}",
        f"智能家居 {TODAY}",
        f"{track_data['tech'][0]} {track_data['tech'][1]} {TODAY}",
        f"科技品牌 维权 投诉 抵制 {TODAY}",
    ]
    for i, q in enumerate(tech_queries, 1):
        print(f"  T{i}: {q[:40]}...")
        results = gemini_search_with_validation(q, max_results=5)
        tech_results.extend(results)
        if not results or len(results) < 3:
            fallback_count += 1
    search_results['tech'] = tech_results
    
    # CS电竞 11组
    cs2_results = []
    cs2_queries = [
        f"HLTV CS2 Major tournament {TODAY}",
        f"CS2 player transfer team {TODAY}",
        f"钢盔杯 虎牙杯 CSBOY XSE {TODAY}",
        f"TYLOO RA LVG MOS CS2 {TODAY}",
        f"CS2 update patch version {TODAY}",
        f"CS2 5E对战 国服 玩家 {TODAY}",
        f"CS2 游戏机制 争议 {TODAY}",
        f"CS2 B站 电竞 {TODAY}",
        f"CS2 皮肤 市场 {TODAY}",
        f"CS2 微博 热搜 {TODAY}",
        f"{track_data['cs2'][0]} {track_data['cs2'][1]} {TODAY}",
    ]
    for i, q in enumerate(cs2_queries, 1):
        print(f"  C{i}: {q[:40]}...")
        results = gemini_search_with_validation(q, max_results=5)
        cs2_results.extend(results)
        if not results or len(results) < 3:
            fallback_count += 1
    search_results['cs2'] = cs2_results
    
    # 旅游出行 8组
    travel_results = []
    travel_queries = [
        f"酒店 民宿 {TODAY}",
        f"机票 高铁 {TODAY}",
        f"旅游目的地 景区 {TODAY}",
        f"{FESTIVAL_NAME} 旅游 出行 {YEAR_MONTH}" if FESTIVAL_NAME else f"旅游出行 {TODAY}",
        f"奢华游 高端旅游 {TODAY}",
        f"特种兵旅游 穷游 {TODAY}",
        f"旅游消费趋势 {TODAY}",
        f"{track_data['travel'][0]} {track_data['travel'][1]} {TODAY}",
    ]
    for i, q in enumerate(travel_queries, 1):
        print(f"  V{i}: {q[:40]}...")
        results = gemini_search_with_validation(q, max_results=5)
        travel_results.extend(results)
        if not results or len(results) < 3:
            fallback_count += 1
    search_results['travel'] = travel_results
    
    # 金融 8组
    finance_results = []
    finance_queries = [
        f"银行权益 存款利率 {TODAY}",
        f"理财 基金 {TODAY}",
        f"信用卡 消费贷 {TODAY}",
        f"股票 A股 {TODAY}",
        f"年轻人理财 投资 {TODAY}",
        f"理财避坑 测评 {TODAY}",
        f"保险 {TODAY}",
        f"{track_data['finance'][0]} {track_data['finance'][1]} {TODAY}",
    ]
    for i, q in enumerate(finance_queries, 1):
        print(f"  G{i}: {q[:40]}...")
        results = gemini_search_with_validation(q, max_results=5)
        finance_results.extend(results)
        if not results or len(results) < 3:
            fallback_count += 1
    search_results['finance'] = finance_results
    
    # 文娱 6组
    ent_results = []
    ent_queries = [
        f"{FESTIVAL_NAME}档 电影 定档 集中 {YEAR_MONTH}" if FESTIVAL_NAME else f"电影票房 {TODAY}",
        f"电影 票房 上映 {TODAY}",
        f"明星 艺人 综艺 {TODAY}",
        f"IP 潮玩 联名 {TODAY}",
        f"影视剧 播放量 口碑 {TODAY}",
        f"{track_data['entertainment'][0]} {track_data['entertainment'][1]} {TODAY}",
    ]
    for i, q in enumerate(ent_queries, 1):
        print(f"  E{i}: {q[:40]}...")
        results = gemini_search_with_validation(q, max_results=5)
        ent_results.extend(results)
        if not results or len(results) < 3:
            fallback_count += 1
    search_results['entertainment'] = ent_results
    
    # 美食 8组
    food_results = []
    food_queries = [
        f"外卖 配送费 涨价 平台 {TODAY}",
        f"网红食品 爆款 新品 零食 {TODAY}",
        f"食品安全 添加剂 问题食品 {TODAY}",
        f"餐饮 品牌 涨价 关店 联名 {YEAR_MONTH}",
        f"生鲜电商 社区团购 超市 买菜 {TODAY}",
        f"减脂餐 低卡 健康饮食 预制菜 {TODAY}",
        f"{FESTIVAL_NAME} 美食 联名 节日限定 {YEAR_MONTH}" if FESTIVAL_NAME else f"美食 {TODAY}",
        f"{track_data['food'][0]} {track_data['food'][1]} {TODAY}",
    ]
    for i, q in enumerate(food_queries, 1):
        print(f"  F{i}: {q[:40]}...")
        results = gemini_search_with_validation(q, max_results=5)
        food_results.extend(results)
        if not results or len(results) < 3:
            fallback_count += 1
    search_results['food'] = food_results
    
    print(f"\n📊 搜索完成：7品类，兜底链接{fallback_count}次")
    
    # 保存结果
    import os
    os.makedirs(TMP_DIR, exist_ok=True)
    with open(f'{TMP_DIR}/search_results.json', 'w') as f:
        json.dump({
            'date': TODAY,
            'weekday': WEEKDAY,
            'festival': {'name': FESTIVAL_NAME, 'days': DAYS_TO_FESTIVAL},
            'realtime_hot': realtime_hot[:50],
            'results': search_results,
            'fallback_count': fallback_count
        }, f, indent=2, ensure_ascii=False)
    
    print(f"✅ 搜索结果保存至 tmp/search_results.json")
    return search_results


# ============ 搜索结果压缩 ============
def compress_results(results):
    """压缩搜索结果（每条只保留关键信息）"""
    lines = []
    for r in results:
        title = r.get('title', '')[:60]
        url = r.get('url', '')
        date_s = r.get('date', '')
        snippet = (r.get('snippet', '') or '')[:100]
        lines.append(f"[{date_s}] {title} | {url} | {snippet}")
    return '\n'.join(lines)


# ============ Gemini 提炼 ============
def process_with_gemini(search_results, realtime_hot):
    """用 Gemini 提炼搜索结果，生成选题 JSON"""
    
    realtime_hot_str = '\n'.join([f"{i+1}. {w}" for i, w in enumerate(realtime_hot[:50])])
    
    SYSTEM_PROMPT = f"""你是资深内容选题编辑，今日{TODAY}（{WEEKDAY}），节日档期：{FESTIVAL_NAME}（距今{DAYS_TO_FESTIVAL}天）。

## 🔴 最高优先级：命中实时热榜
以下是今日各平台（微博/百度/头条/澎湃）的实时热搜词，共{len(realtime_hot)}条：
{realtime_hot_str}

选题必须命中热榜词之一。不在热榜的事件一律放watchSection，不得进hotSection。

sources.url 必须直接来自搜索数据URL，不得凭空生成。
微博来源：https://s.weibo.com/weibo?q=热榜关键词

[propagation.formats] 恰好3条：第1条📊；第2条💬；第3条🗳️。不要写第4条📱。

[propagation.emotion] 引用用户原声金句 + -- + 撕裂分析（80-120字）。注意：emotion字段不要使用中文引号和，只用普通标点。

[propagation.motivation] 行为A（具体事）+ 行为B（具体事）+ 行为C（具体事）。不要使用中文引号，只用普通标点。

[editorNote] 100-150字，说明命中了哪条热榜词，无内部编号，不使用中文引号。

[keywords] 3-6个今日核心话题词，直接来自热榜词。

输出：完整JSON对象，hot区3-4条（必须命中热榜），watch区2条，每条formats恰好3条，纯JSON不加代码块。"""

    SELF_CHECK = f"""
自检：
1. hotSection每条命中今日热榜词？未命中→watchSection
2. sources.url来自搜索数据或 https://s.weibo.com/weibo?q=热榜词
3. formats恰好3条（📊/💬/🗳️）？
4. emotion/motivation/editorNote没有使用中文引号？（禁止使用和，用普通引号或不用）
今日热榜前20词：{realtime_hot[:20]}"""

    category_outputs = {}
    
    # 运动户外
    sports_data = compress_results(search_results['sports'])
    SPORTS_RAW = call_gemini(SYSTEM_PROMPT, 
        f"为【运动户外】品类生成今日选题存档JSON，ID前缀{COMPACT}-s。\n搜索数据：\n{sports_data}\n{SELF_CHECK}", 
        max_tokens=7000)
    category_outputs['sports'] = normalize_output(SPORTS_RAW, 'sports')
    
    # 数码科技
    tech_data = compress_results(search_results['tech'])
    TECH_RAW = call_gemini(SYSTEM_PROMPT,
        f"为【数码科技】品类生成今日选题存档JSON，ID前缀{COMPACT}-t。\n搜索数据：\n{tech_data}\n{SELF_CHECK}",
        max_tokens=7000)
    category_outputs['tech'] = normalize_output(TECH_RAW, 'tech')
    
    # CS电竞
    cs2_data = compress_results(search_results['cs2'])
    CS2_RAW = call_gemini(SYSTEM_PROMPT,
        f"为【CS电竞】品类生成今日选题存档JSON，ID前缀{COMPACT}-c。\n每条必须含perspective字段：有HLTV具体URL→global，仅国内→cn，两侧→both。\n搜索数据：\n{cs2_data}\n{SELF_CHECK}",
        max_tokens=7000)
    category_outputs['cs2'] = normalize_output(CS2_RAW, 'cs2')
    
    # 旅游出行
    travel_data = compress_results(search_results['travel'])
    TRAVEL_RAW = call_gemini(SYSTEM_PROMPT,
        f"为【旅游出行】品类生成今日选题存档JSON，ID前缀{COMPACT}-v。\n排除景区通稿硬广。\n搜索数据：\n{travel_data}\n{SELF_CHECK}",
        max_tokens=7000)
    category_outputs['travel'] = normalize_output(TRAVEL_RAW, 'travel')
    
    # 金融
    finance_data = compress_results(search_results['finance'])
    FINANCE_RAW = call_gemini(SYSTEM_PROMPT,
        f"为【金融】品类生成今日选题存档JSON，ID前缀{COMPACT}-f。\n排除荐股/非法集资/夸大收益/诱导借贷。\n搜索数据：\n{finance_data}\n{SELF_CHECK}",
        max_tokens=7000)
    category_outputs['finance'] = normalize_output(FINANCE_RAW, 'finance')
    
    # 文娱
    ent_data = compress_results(search_results['entertainment'])
    ENT_RAW = call_gemini(SYSTEM_PROMPT,
        f"为【文娱】品类生成今日选题存档JSON，ID前缀{COMPACT}-e。\n文娱专属约束：①今年大陆首映/上映；②近2日有新事件；③今日实际票房有撕裂点——三选一才可入选\n禁止仅凭预售榜热度入选；禁止往年旧片仅靠大陆预热入选\n搜索数据：\n{ent_data}\n{SELF_CHECK}",
        max_tokens=7000)
    category_outputs['entertainment'] = normalize_output(ENT_RAW, 'ent')
    
    # 美食
    food_data = compress_results(search_results['food'])
    FOOD_RAW = call_gemini(SYSTEM_PROMPT,
        f"为【美食】品类生成今日选题存档JSON，ID前缀{COMPACT}-d。\n品类：外卖/餐饮/食品生鲜/食品安全/饮食健康。撕裂点：外卖vs做饭/网红vs老字号/预制菜vs现炒。\n搜索数据：\n{food_data}\n{SELF_CHECK}",
        max_tokens=7000)
    category_outputs['food'] = normalize_output(FOOD_RAW, 'food')
    
    return category_outputs


def normalize_output(raw, cat_prefix):
    """标准化 Gemini 输出为 JS 格式"""
    
    icon_cls = {
        '🔴': 'pt-weibo', '📕': 'pt-default', '📺': 'pt-baidu',
        '🎵': 'pt-baidu', '🐝': 'pt-baidu', '📰': 'pt-baidu',
        '🎬': 'pt-baidu', '🌐': 'pt-baidu', '🌍': 'pt-baidu',
        '💬': 'pt-baidu', '🎮': 'pt-baidu'
    }
    lv_map = {'high': '🔵 爆热', 'mid': '🟡 热议', 'low': '🌱 潜力股', 'watch': '⚪ 观察中'}
    px = {'sports': 's', 'tech': 't', 'cs2': 'c', 'travel': 'v', 'ent': 'e', 'finance': 'f', 'food': 'd'}.get(cat_prefix, cat_prefix)
    
    # 解析 JSON
    try:
        cleaned = re.sub(r'```[a-z]*\n?', '', raw).strip()
        data = json.loads(cleaned)
    except:
        print(f"  [{cat_prefix}] ⚠️ JSON解析失败")
        return None
    
    # 补全顶级字段
    if 'date' not in data: data['date'] = TODAY
    if 'weekday' not in data: data['weekday'] = WEEKDAY
    if 'updateTime' not in data: data['updateTime'] = '09:00'
    
    en = data.get('editorNote', '')
    en = re.sub(r'\[[a-z]\d+\]', '', en).strip()
    if not en or len(en) < 20:
        hot_titles = [t.get('title', '')[:15] for t in data.get('hotSection', [])[:2]]
        en = f"{WEEKDAY}·{cat_prefix}品类重点：{'、'.join(hot_titles)}等选题值得优先发布"
    en = en.replace('"', '').replace('"', '').replace("'", '').replace("'", '')
    data['editorNote'] = en
    
    if not data.get('keywords'):
        data['keywords'] = [t.get('title', '')[:8] for t in data.get('hotSection', [])[:4] if t.get('title')]
    
    # 处理 sources
    def fix_source(s):
        if isinstance(s, str):
            return {'name': s[:20], 'url': f"https://s.weibo.com/weibo?q={urllib.parse.quote(s[:20])}", 'icon': '🔴', 'cls': 'pt-weibo'}
        icon = s.get('icon', '📰')
        if icon not in icon_cls: icon = '📰'
        url = s.get('url', s.get('link', ''))
        name = s.get('name', s.get('title', ''))
        return {'name': name, 'url': url, 'icon': icon, 'cls': icon_cls.get(icon, 'pt-baidu')}
    
    # 处理每条选题
    def fix_topic(t, idx):
        t['id'] = f"{COMPACT}-{px}{idx:02d}"
        for k in ['trigger', 'category', 'type', 'analysis', 'event']: t.pop(k, None)
        if 'sources' in t:
            t['sources'] = [fix_source(s) for s in t['sources']]
        if 'heatInfo' not in t:
            t['heatInfo'] = {'type': 'start', 'label': f"{TODAY[-5:]}·{t.get('title', '')[:15]}"}
        
        lv = t.get('heat', t.get('level', 'watch'))
        if lv not in ['high', 'mid', 'low', 'watch']: lv = 'mid'
        t['level'] = lv
        if not any(e in t.get('levelLabel', '') for e in ['🔵', '🟡', '🌱', '⚪']):
            t['levelLabel'] = lv_map.get(lv, '⚪ 观察中')
        
        if 'tags' in t and t['tags'] and isinstance(t['tags'][0], str):
            t['tags'] = [{'text': tg, 'type': 'topic'} for tg in t['tags']]
        elif 'tags' not in t: t['tags'] = []
        if 'summary' not in t: t['summary'] = t.get('title', '')[:60]
        
        p = t.get('propagation', {})
        for k in ['emotion', 'motivation', 'formats']:
            if k not in p and k in t: p[k] = t.pop(k)
        fmts = p.get('formats', [])
        if isinstance(fmts, str): fmts = [fmts]
        fmts = [f for f in fmts if not f.startswith('📱')][:3]
        p['formats'] = fmts
        
        if not p.get('emotion'): p['emotion'] = ''
        else: p['emotion'] = p['emotion'].replace('"', '').replace('"', '').replace("'", '').replace("'", '')
        if not p.get('motivation'): p['motivation'] = ''
        else: p['motivation'] = p['motivation'].replace('"', '').replace('"', '').replace("'", '').replace("'", '')
        
        t['propagation'] = p
        
        # 兜底模板（降本）
        if len(t['propagation']['formats']) < 3:
            need = 3 - len(t['propagation']['formats'])
            t['propagation']['formats'] += FALLBACK_FORMATS[-need:]
        if len(t['propagation'].get('motivation', '')) < 10:
            t['propagation']['motivation'] = FALLBACK_MOTIVATION
        
        return t
    
    hot = data.get('hotSection', [])
    watch = data.get('watchSection', [])
    for i, t in enumerate(hot): hot[i] = fix_topic(t, i + 1)
    for i, t in enumerate(watch): watch[i] = fix_topic(t, len(hot) + i + 1)
    data['hotSection'] = hot
    data['watchSection'] = watch
    data['items'] = len(hot) + len(watch)
    
    # 转 JS 格式
    def to_js(o, d=0):
        pad = '  ' * d
        if isinstance(o, dict):
            return '{\n' + ',\n'.join([f"{pad}  {k}: {to_js(v, d + 1)}" for k, v in o.items()]) + '\n' + pad + '}'
        elif isinstance(o, list):
            if not o: return '[]'
            return '[\n' + ',\n'.join([f"{pad}  {to_js(v, d + 1)}" for v in o]) + '\n' + pad + ']'
        elif isinstance(o, str):
            s = o.replace('"', '').replace('"', '').replace("'", '').replace("'", '')
            s = s.replace('\\', '\\\\').replace("'", "\\'")
            return f"'{s}'"
        elif isinstance(o, bool): return 'true' if o else 'false'
        elif o is None: return 'null'
        else: return str(o)
    
    js = to_js(data)
    print(f"  [{cat_prefix}] ✅ {data['items']}条")
    return js


# ============ HTML 写入 ============
def write_to_html(category_outputs):
    """写入 HTML"""
    
    with open(HTML_PATH) as f:
        html = f.read()
    
    def maybe_insert(html, archive_key, next_key, new_js):
        if new_js is None:
            print(f"  ⚠️ {archive_key} skip")
            return html
        marker = f"{archive_key}: ["
        start = html.find(marker)
        if start == -1: return html
        end = html.find(next_key) if next_key else len(html)
        block = html[start:end]
        if TODAY in re.findall(r"date: '(\d{4}-\d{2}-\d{2})'", block):
            print(f"  ⏭️ {archive_key} 今日已存在，跳过")
            return html
        pos = start + len(marker)
        html = html[:pos] + '\n      ' + new_js + ',\n' + html[pos:]
        print(f"  ✅ {archive_key} 写入成功")
        return html
    
    html = maybe_insert(html, 'sportsArchives', 'techArchives', category_outputs['sports'])
    html = maybe_insert(html, 'techArchives', 'cs2Archives', category_outputs['tech'])
    html = maybe_insert(html, 'cs2Archives', 'travelArchives', category_outputs['cs2'])
    html = maybe_insert(html, 'travelArchives', 'financeArchives', category_outputs['travel'])
    html = maybe_insert(html, 'financeArchives', 'foodArchives', category_outputs['finance'])
    html = maybe_insert(html, 'foodArchives', 'entertainmentArchives', category_outputs['food'])
    html = maybe_insert(html, 'entertainmentArchives', None, category_outputs['entertainment'])
    
    # 检查重复
    for ak in ['sportsArchives:', 'techArchives:', 'cs2Archives:', 'travelArchives:', 'financeArchives:', 'foodArchives:', 'entertainmentArchives:']:
        cnt = html.count(ak)
        if cnt != 1:
            raise SystemExit(f'⚠️ 写入后 {ak} 出现{cnt}次！终止。')
    
    with open(HTML_PATH, 'w') as f:
        f.write(html)
    
    print('写入完成')
    return html


# ============ 验证 ============
def validate_html():
    """JS 语法验证"""
    
    import os
    with open(HTML_PATH) as f:
        html = f.read()
    
    start = html.find('function radarApp()')
    end = html.rfind('</script>')
    js = html[start:end]
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False) as f:
        f.write(js)
        tmp = f.name
    
    r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
    os.unlink(tmp)
    
    if r.returncode != 0:
        raise SystemExit('❌ JS语法验证失败：' + r.stderr[:200])
    
    print('✅ JS语法验证通过')


# ============ 更新追踪词 ============
def update_track_keywords():
    """更新追踪词 JSON"""
    
    with open(HTML_PATH) as f:
        html = f.read()
    
    kw_pattern = r"keywords:\s*\[(.*?)\]"
    
    def extract_kws(block_start, block_end):
        chunk = html[html.find(block_start):html.find(block_end)][:5000]
        match = re.search(kw_pattern, chunk)
        if match:
            return re.findall(r"'([^']+)'", match.group(1))[:5]
        return []
    
    track_data = {
        'sports': extract_kws('sportsArchives', 'techArchives') or ['运动', '户外', '装备'],
        'tech': extract_kws('techArchives', 'cs2Archives') or ['数码', '科技', '新品'],
        'cs2': extract_kws('cs2Archives', 'travelArchives') or ['CS2', '赛事', '选手'],
        'travel': extract_kws('travelArchives', 'financeArchives') or ['旅游', '酒店', '出行'],
        'finance': extract_kws('financeArchives', 'foodArchives') or ['理财', '利率', '基金'],
        'food': extract_kws('foodArchives', 'entertainmentArchives') or ['外卖', '美食', '餐饮'],
        'entertainment': extract_kws('entertainmentArchives', None) or ['电影', '明星', '综艺']
    }
    
    with open(TRACK_PATH, 'w') as f:
        json.dump(track_data, f, indent=2, ensure_ascii=False)
    
    print(f"✅ 追踪词JSON已更新")


# ============ 主流程 ============
def main():
    parser = argparse.ArgumentParser(description='选题雷达更新脚本')
    parser.add_argument('--search', action='store_true', help='仅执行搜索')
    parser.add_argument('--process', action='store_true', help='处理搜索结果')
    parser.add_argument('--full', action='store_true', help='完整流程')
    args = parser.parse_args()
    
    print(f"\n{'='*60}")
    print(f"选题雷达更新 | {TODAY} {WEEKDAY} | 节日：{FESTIVAL_NAME}（距今{DAYS_TO_FESTIVAL}天）")
    print(f"{'='*60}\n")
    
    # 加载追踪词
    track_data = load_track_keywords()
    
    # 抓取热榜
    realtime_hot = fetch_realtime_hot()
    print(f"\n📊 合并实时热榜共 {len(realtime_hot)} 条")
    print("前10条:", realtime_hot[:10])
    
    if args.search or args.full:
        # 执行搜索
        search_results = execute_searches(track_data, realtime_hot)
        
        if args.search and not args.full:
            print("\n✅ 搜索完成，结果已保存至 tmp/search_results.json")
            return
    
    if args.process or args.full:
        # 加载搜索结果
        if not args.full:
            try:
                with open(f'{TMP_DIR}/search_results.json') as f:
                    saved = json.load(f)
                    search_results = saved['results']
                    realtime_hot = saved['realtime_hot']
            except:
                print("⚠️ 未找到搜索结果，先执行搜索")
                search_results = execute_searches(track_data, realtime_hot)
        
        # Gemini 提炼
        print(f"\n📊 Gemini 提炼...")
        category_outputs = process_with_gemini(search_results, realtime_hot)
        
        # 写入 HTML
        print(f"\n📊 写入 HTML...")
        write_to_html(category_outputs)
        
        # 验证
        validate_html()
        
        # 更新追踪词
        update_track_keywords()
        
        print(f"\n{'='*60}")
        print(f"✅ 更新完成！")
        print(f"{'='*60}")
        
        # 输出摘要供 Agent 部署
        print(f"\n📝 部署指令：")
        print(f"  deploy_to_vercel(workspace='{WORKSPACE}/运动户外选题雷达')")
        print(f"  vercel alias set <部署URL> interest-radar-daily.codebanana.app")
        print(f"  GitHub 同步: repos/weifengjiao12345-svg/sports-topic-radar")


if __name__ == '__main__':
    main()