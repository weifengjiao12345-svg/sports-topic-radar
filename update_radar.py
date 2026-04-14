#!/usr/bin/env python3
"""
选题雷达更新脚本 v3（Hot API 真实热榜版）

架构：
  Hot API（真实热榜）→ 按品类关键词匹配 → Gemini 提炼 → 写入 HTML

用法：
  python update_radar.py --full      # 完整流程（推荐）
  python update_radar.py --search    # 仅拉取热榜，保存 tmp/search_results.json
  python update_radar.py --process   # 读取已保存的热榜结果，执行提炼+写入
"""

import argparse
import json
import os
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
WEEKDAY = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][NOW.weekday()]
COMPACT = NOW.strftime('%Y%m%d')
YEAR_MONTH = NOW.strftime('%Y年%m月')
YEAR = NOW.year

WORKSPACE = '/Users/jiaojiao/WorkBuddy/20260413150055/topic-radar'
HTML_PATH = f'{WORKSPACE}/index.html'
TRACK_PATH = f'{WORKSPACE}/track_keywords.json'
TMP_DIR = f'{WORKSPACE}/tmp'

# Hot API（真实热榜聚合）
HOT_API_BASE = 'https://hot-api.codebanana.app'
HOT_PLATFORMS = ['weibo', 'douyin', 'baidu', 'thepaper', 'toutiao', 'bilibili']

# Gemini API（只用于提炼，不用于搜索）
GEMINI_API_KEY = '1sGK0Ye0792JMtNQD4D59770-0859-4958-bBdA-F451De4d'
GEMINI_ENDPOINT = 'https://api.modelverse.cn/v1/chat/completions'
GEMINI_MODEL = 'gemini-3-flash-preview'

# 兜底模板
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

# ============ 品类关键词表 ============
# 用于从热榜里匹配各品类相关条目
CATEGORY_KEYWORDS = {
    'sports': [
        '运动', '户外', '跑步', '骑行', '马拉松', '健身', '装备', '登山', '跑鞋',
        '冲锋衣', '自行车', '瑜伽', '游泳', '羽毛球', '网球', '足球', '篮球',
        '李宁', '安踏', '特步', '始祖鸟', '萨洛蒙', '迪卡侬', '耐克', '阿迪达斯',
        '碳板', '越野', '铁人三项', '骑行裤', '运动手表', 'Garmin', '佳明',
    ],
    'tech': [
        '手机', '数码', '科技', 'AI', '大模型', '苹果', '华为', '小米', '三星',
        '芯片', '半导体', '笔记本', '平板', '耳机', '智能', '发布', '新品',
        '电动车', '新能源', '特斯拉', '比亚迪', '问界', '理想', '小鹏',
        'GPT', '大模型', '机器人', 'OPPO', 'vivo', '荣耀', '魅族',
        '显卡', 'CPU', '英伟达', '高通', '联发科', '台积电',
    ],
    'cs2': [
        'CS2', 'CS:GO', '反恐精英', 'HLTV', '钢盔杯', '虎牙杯', 'CSBOY',
        'TYLOO', 'RA', 'LVG', 'MOS', '5E', 'VAC', '电竞', 'Major',
        '皮肤', '武器箱', '刀', 'AWP', 'AK47', '完美世界', 'PWA',
    ],
    'travel': [
        '旅游', '出行', '酒店', '民宿', '机票', '高铁', '景区', '出境',
        '签证', '旅行', '度假', '攻略', '打卡', '特种兵', '穷游', '自驾',
        '携程', '飞猪', '途牛', '马蜂窝', '民宿', '露营',
    ] + (FESTIVAL_KEYWORDS if DAYS_TO_FESTIVAL <= 30 else []),
    'finance': [
        '理财', '基金', '股票', 'A股', '存款', '利率', '信用卡', '贷款',
        '保险', '银行', '券商', '投资', '韭菜', '割', '暴跌', '暴涨',
        '黄金', '美元', '汇率', '降息', '提前还贷', '房贷', '蚂蚁',
        '雪球', '东方财富', '天天基金', '炒股', '基金经理',
    ],
    'food': [
        '外卖', '美食', '餐饮', '网红', '探店', '预制菜', '食品安全',
        '添加剂', '麦当劳', '肯德基', '海底捞', '瑞幸', '喜茶', '奈雪',
        '生鲜', '菜市场', '超市', '零食', '减脂', '轻食', '健康饮食',
        '外卖平台', '美团', '饿了么', '涨价', '关店', '联名',
    ],
    'entertainment': [
        '电影', '票房', '明星', '综艺', '影视', '剧', '演唱会', '演员',
        '导演', '上映', '首映', '口碑', '豆瓣', '烂番茄', '院线',
        '追剧', '番剧', '动漫', '漫画', 'IP', '潮玩', '联名',
        '爱奇艺', '优酷', '腾讯视频', '芒果', 'B站',
    ] + (FESTIVAL_KEYWORDS if FESTIVAL_NAME else []),
}


# ============ Hot API 调用 ============
def fetch_hot_api(platform):
    """从 Hot API 拉取单个平台热榜，返回 [{title, desc, hot, url}]"""
    try:
        url = f'{HOT_API_BASE}/api/{platform}'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            items = data.get('data', [])
            # 每条加上平台标记
            for item in items:
                item['platform'] = platform
            return items
    except Exception as e:
        print(f'  ⚠️ Hot API [{platform}] 失败: {e}')
        return []


def fetch_all_hot():
    """拉取所有平台热榜，返回合并去重后的列表"""
    print(f'\n🔥 拉取 Hot API 热榜（{len(HOT_PLATFORMS)} 个平台）...')
    all_items = []
    platform_icons = {
        'weibo': '🔴', 'douyin': '🎵', 'baidu': '📺',
        'thepaper': '📰', 'toutiao': '📰', 'bilibili': '🎬',
    }

    for platform in HOT_PLATFORMS:
        items = fetch_hot_api(platform)
        icon = platform_icons.get(platform, '📰')
        for item in items:
            item['icon'] = icon
            item['platform_name'] = {
                'weibo': '微博', 'douyin': '抖音', 'baidu': '百度',
                'thepaper': '澎湃', 'toutiao': '头条', 'bilibili': 'B站',
            }.get(platform, platform)
        all_items.extend(items)
        print(f'  ✅ {platform}: {len(items)}条 | Top3: {[v["title"][:15] for v in items[:3]]}')

    # 按 hot 值排序（hot 可能是字符串，统一转 int）
    for item in all_items:
        try:
            item['hot'] = int(str(item.get('hot', 0)).replace(',', ''))
        except:
            item['hot'] = 0
    all_items.sort(key=lambda x: x.get('hot', 0), reverse=True)

    # 标题去重
    seen = set()
    dedup = []
    for item in all_items:
        title = item.get('title', '').strip()
        if title and title not in seen:
            seen.add(title)
            dedup.append(item)

    print(f'\n📊 合并去重后共 {len(dedup)} 条热榜')
    return dedup


# ============ 按品类匹配热榜 ============
def match_category(all_hot, category, extra_keywords=None):
    """从全量热榜中匹配某品类相关条目"""
    keywords = CATEGORY_KEYWORDS.get(category, [])
    if extra_keywords:
        keywords = keywords + extra_keywords

    matched = []
    for item in all_hot:
        title = item.get('title', '') + ' ' + item.get('desc', '')
        for kw in keywords:
            if kw.lower() in title.lower():
                matched.append(item)
                break  # 已匹配，不重复加

    # 补充：若匹配太少，取热度最高的前5条通用热榜兜底
    if len(matched) < 3:
        top_general = [x for x in all_hot[:20] if x not in matched][:3]
        matched = matched + top_general

    return matched[:30]  # 最多30条给Gemini


def format_hot_items(items):
    """将热榜条目格式化为 Gemini 可读的文本"""
    lines = []
    for i, item in enumerate(items, 1):
        title = item.get('title', '')
        desc = item.get('desc', '') or title
        url = item.get('url', '')
        platform = item.get('platform_name', '')
        hot = item.get('hot', 0)
        lines.append(f'{i}. [{platform}] {title} | 热度:{hot} | {url}\n   摘要: {desc[:80]}')
    return '\n'.join(lines)


# ============ 追踪词读取 ============
def load_track_keywords():
    """从 JSON 读取追踪词"""
    try:
        with open(TRACK_PATH, 'r') as f:
            data = json.load(f)
        print(f'✅ 追踪词从JSON读取：{len(data)}品类')
        return data
    except Exception as e:
        print(f'⚠️ 追踪词读取失败，用默认值: {e}')
        return {
            'sports': ['运动', '户外', '装备'],
            'tech': ['数码', '科技', '新品'],
            'cs2': ['CS2', '赛事', '选手'],
            'travel': ['旅游', '酒店', '出行'],
            'entertainment': ['电影', '明星', '综艺'],
            'finance': ['理财', '利率', '基金'],
            'food': ['外卖', '美食', '餐饮'],
        }


# ============ Gemini API ============
def call_gemini(system_prompt, user_content, max_tokens=7000, temperature=0.5):
    """调用 Gemini API（仅用于提炼，不用于搜索）"""
    payload = json.dumps({
        'model': GEMINI_MODEL,
        'messages': [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': user_content},
        ],
        'max_tokens': max_tokens,
        'temperature': temperature,
    }).encode('utf-8')

    req = urllib.request.Request(
        GEMINI_ENDPOINT,
        data=payload,
        headers={
            'Authorization': f'Bearer {GEMINI_API_KEY}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )

    with urllib.request.urlopen(req, timeout=90) as resp:
        result = json.loads(resp.read().decode())
        return result['choices'][0]['message']['content']


# ============ Gemini 提炼 ============
def process_with_gemini(category_data, all_hot):
    """用 Gemini 提炼各品类热榜数据，生成选题 JSON"""

    # 全量热榜词列表（供 Gemini 参考命中度）
    hot_titles = [item.get('title', '') for item in all_hot[:60]]
    hot_titles_str = '\n'.join([f'{i+1}. {t}' for i, t in enumerate(hot_titles)])

    SYSTEM_PROMPT = f"""你是资深内容选题编辑，今日{TODAY}（{WEEKDAY}），节日档期：{FESTIVAL_NAME}（距今{DAYS_TO_FESTIVAL}天）。

## 数据来源说明
以下热榜数据来自微博/抖音/百度/澎湃/头条/B站的实时热榜，每条均包含：
- 平台来源、标题、摘要、真实URL、热度值
- 这些是今日真实正在发酵的热点，不是预测或编造

## 选题规则
1. hotSection（3-4条）：必须直接对应热榜中的条目，title要能在热榜数据中找到对应
2. watchSection（2条）：相关但热度较低的潜力话题
3. sources.url：直接使用热榜数据中的 url 字段，不得凭空生成
4. sources.icon 规则：微博→🔴，抖音→🎵，百度→📺，澎湃/头条→📰，B站→🎬

## 格式约束
[propagation.formats] 恰好3条：第1条📊；第2条💬；第3条🗳️
[propagation.emotion] 引用用户原声金句 + -- + 撕裂分析（80-120字），只用普通标点
[propagation.motivation] 行为A（具体事）+ 行为B（具体事）+ 行为C（具体事），只用普通标点
[editorNote] 100-150字，说明命中了哪条热榜，无内部编号，不使用中文引号
[keywords] 3-6个今日核心话题词

## 今日全平台热榜前60条（参考命中度）
{hot_titles_str}

输出：完整JSON对象，纯JSON不加代码块。"""

    SELF_CHECK = f"""
自检：
1. hotSection每条都能在上方热榜数据中找到对应标题？
2. sources.url是热榜数据中的真实url，不是自己生成的？
3. formats恰好3条（📊/💬/🗳️）？
4. emotion/motivation/editorNote无中文引号？"""

    category_outputs = {}

    configs = [
        ('sports',        '运动户外', f'{COMPACT}-s', ''),
        ('tech',          '数码科技', f'{COMPACT}-t', ''),
        ('cs2',           'CS电竞',   f'{COMPACT}-c', '每条必须含perspective字段：有HLTV具体URL→global，仅国内→cn，两侧→both。'),
        ('travel',        '旅游出行', f'{COMPACT}-v', '排除景区通稿硬广。'),
        ('finance',       '金融',     f'{COMPACT}-f', '排除荐股/非法集资/夸大收益/诱导借贷。'),
        ('food',          '美食',     f'{COMPACT}-d', '品类：外卖/餐饮/食品生鲜/食品安全/饮食健康。撕裂点：外卖vs做饭/网红vs老字号/预制菜vs现炒。'),
        ('entertainment', '文娱',     f'{COMPACT}-e', '文娱专属约束：①今年大陆首映/上映；②近2日有新事件；③今日实际票房有撕裂点——三选一才可入选。禁止仅凭预售榜热度入选。'),
    ]

    for cat_key, cat_name, id_prefix, extra_constraint in configs:
        items = category_data.get(cat_key, [])
        hot_text = format_hot_items(items)
        print(f'  [{cat_name}] 匹配到 {len(items)} 条热榜数据，提炼中...')

        user_msg = (
            f'为【{cat_name}】品类生成今日选题存档JSON，ID前缀{id_prefix}。\n'
            f'{extra_constraint}\n'
            f'以下是今日{cat_name}相关热榜数据（真实来源，直接使用其URL作为sources）：\n'
            f'{hot_text}\n'
            f'{SELF_CHECK}'
        )

        try:
            raw = call_gemini(SYSTEM_PROMPT, user_msg, max_tokens=7000)
            px = {'sports': 's', 'tech': 't', 'cs2': 'c', 'travel': 'v',
                  'entertainment': 'e', 'finance': 'f', 'food': 'd'}.get(cat_key, cat_key)
            category_outputs[cat_key] = normalize_output(raw, px, items)
        except Exception as e:
            print(f'  [{cat_name}] ❌ 提炼失败: {e}')
            category_outputs[cat_key] = None

    return category_outputs


# ============ 标准化输出 ============
def normalize_output(raw, cat_prefix, source_items):
    """标准化 Gemini 输出为 JS 格式，sources URL 优先用热榜真实 URL"""

    # source_items 的 title→url 映射，供修正用
    url_map = {item.get('title', ''): item.get('url', '') for item in source_items}
    icon_map = {item.get('title', ''): item.get('icon', '📰') for item in source_items}
    platform_map = {item.get('title', ''): item.get('platform_name', '') for item in source_items}

    icon_cls = {
        '🔴': 'pt-weibo', '🎵': 'pt-baidu', '📺': 'pt-baidu',
        '📰': 'pt-baidu', '🎬': 'pt-baidu', '🌍': 'pt-baidu',
        '💬': 'pt-baidu', '🎮': 'pt-baidu',
    }
    lv_map = {'high': '🔵 爆热', 'mid': '🟡 热议', 'low': '🌱 潜力股', 'watch': '⚪ 观察中'}

    # 解析 JSON
    try:
        cleaned = re.sub(r'```[a-z]*\n?', '', raw).strip()
        cleaned = re.sub(r'\n?```', '', cleaned)
        data = json.loads(cleaned)
    except Exception as e:
        print(f'  [{cat_prefix}] ⚠️ JSON解析失败: {e}')
        return None

    # 补全顶级字段
    if 'date' not in data: data['date'] = TODAY
    if 'weekday' not in data: data['weekday'] = WEEKDAY
    if 'updateTime' not in data: data['updateTime'] = NOW.strftime('%H:%M')

    en = data.get('editorNote', '')
    en = re.sub(r'\[[a-z]\d+\]', '', en).strip()
    if not en or len(en) < 20:
        hot_titles = [t.get('title', '')[:15] for t in data.get('hotSection', [])[:2]]
        en = f"{WEEKDAY}·{cat_prefix}品类重点：{'、'.join(hot_titles)}等选题值得优先发布"
    en = en.replace('"', '').replace('"', '').replace("'", '').replace("'", '')
    data['editorNote'] = en

    if not data.get('keywords'):
        data['keywords'] = [t.get('title', '')[:8] for t in data.get('hotSection', [])[:4] if t.get('title')]

    def fix_source(s, topic_title=''):
        """修正 source，优先用热榜真实 URL"""
        if isinstance(s, str):
            real_url = url_map.get(s, f"https://s.weibo.com/weibo?q={urllib.parse.quote(s[:20])}")
            real_icon = icon_map.get(s, '🔴')
            return {'name': s[:20], 'url': real_url, 'icon': real_icon, 'cls': icon_cls.get(real_icon, 'pt-baidu')}

        name = s.get('name', s.get('title', ''))
        url = s.get('url', s.get('link', ''))
        icon = s.get('icon', '📰')

        # 如果 url 看起来像是编造的（不含真实域名特征），尝试用热榜 URL 替换
        if not url or 'weibo.com/search' in url or 's.weibo.com' in url:
            # 尝试从热榜 title 匹配
            real_url = url_map.get(name, '') or url_map.get(topic_title, '')
            if real_url:
                url = real_url
                icon = icon_map.get(name, '') or icon_map.get(topic_title, icon)

        if icon not in icon_cls:
            icon = '📰'
        return {'name': name, 'url': url, 'icon': icon, 'cls': icon_cls.get(icon, 'pt-baidu')}

    def fix_topic(t, idx):
        px_str = cat_prefix
        t['id'] = f"{COMPACT}-{px_str}{idx:02d}"
        for k in ['trigger', 'category', 'type', 'analysis', 'event']:
            t.pop(k, None)

        topic_title = t.get('title', '')

        if 'sources' in t:
            t['sources'] = [fix_source(s, topic_title) for s in t['sources']]
        else:
            # 从热榜数据中找最匹配的 source
            matched_url = url_map.get(topic_title, f"https://s.weibo.com/weibo?q={urllib.parse.quote(topic_title[:20])}")
            matched_icon = icon_map.get(topic_title, '🔴')
            matched_platform = platform_map.get(topic_title, '微博')
            t['sources'] = [{'name': matched_platform, 'url': matched_url, 'icon': matched_icon, 'cls': icon_cls.get(matched_icon, 'pt-weibo')}]

        if 'heatInfo' not in t:
            t['heatInfo'] = {'type': 'start', 'label': f"{TODAY[-5:]}·{topic_title[:15]}"}

        lv = t.get('heat', t.get('level', 'watch'))
        if lv not in ['high', 'mid', 'low', 'watch']:
            lv = 'mid'
        t['level'] = lv
        if not any(e in t.get('levelLabel', '') for e in ['🔵', '🟡', '🌱', '⚪']):
            t['levelLabel'] = lv_map.get(lv, '⚪ 观察中')

        if 'tags' in t and t['tags'] and isinstance(t['tags'][0], str):
            t['tags'] = [{'text': tg, 'type': 'topic'} for tg in t['tags']]
        elif 'tags' not in t:
            t['tags'] = []
        if 'summary' not in t:
            t['summary'] = t.get('title', '')[:60]

        p = t.get('propagation', {})
        for k in ['emotion', 'motivation', 'formats']:
            if k not in p and k in t:
                p[k] = t.pop(k)
        fmts = p.get('formats', [])
        if isinstance(fmts, str):
            fmts = [fmts]
        fmts = [f for f in fmts if not f.startswith('📱')][:3]
        p['formats'] = fmts

        if not p.get('emotion'):
            p['emotion'] = ''
        else:
            p['emotion'] = p['emotion'].replace('"', '').replace('"', '').replace("'", '').replace("'", '')
        if not p.get('motivation'):
            p['motivation'] = ''
        else:
            p['motivation'] = p['motivation'].replace('"', '').replace('"', '').replace("'", '').replace("'", '')

        t['propagation'] = p

        # 兜底
        if len(t['propagation']['formats']) < 3:
            need = 3 - len(t['propagation']['formats'])
            t['propagation']['formats'] += FALLBACK_FORMATS[-need:]
        if len(t['propagation'].get('motivation', '')) < 10:
            t['propagation']['motivation'] = FALLBACK_MOTIVATION

        return t

    hot = data.get('hotSection', [])
    watch = data.get('watchSection', [])
    for i, t in enumerate(hot):
        hot[i] = fix_topic(t, i + 1)
    for i, t in enumerate(watch):
        watch[i] = fix_topic(t, len(hot) + i + 1)
    data['hotSection'] = hot
    data['watchSection'] = watch
    data['items'] = len(hot) + len(watch)

    # 转 JS 格式
    def to_js(o, d=0):
        pad = '  ' * d
        if isinstance(o, dict):
            return '{\n' + ',\n'.join([f"{pad}  {k}: {to_js(v, d + 1)}" for k, v in o.items()]) + '\n' + pad + '}'
        elif isinstance(o, list):
            if not o:
                return '[]'
            return '[\n' + ',\n'.join([f"{pad}  {to_js(v, d + 1)}" for v in o]) + '\n' + pad + ']'
        elif isinstance(o, str):
            s = o.replace('"', '').replace('"', '').replace("'", '').replace("'", '')
            s = s.replace('\\', '\\\\').replace("'", "\\'")
            return f"'{s}'"
        elif isinstance(o, bool):
            return 'true' if o else 'false'
        elif o is None:
            return 'null'
        else:
            return str(o)

    js = to_js(data)
    print(f'  [{cat_prefix}] ✅ {data["items"]}条')
    return js


# ============ HTML 写入 ============
def write_to_html(category_outputs):
    """写入 HTML"""
    with open(HTML_PATH) as f:
        html = f.read()

    # 备份
    os.makedirs(TMP_DIR, exist_ok=True)
    with open(f'{TMP_DIR}/index.html.bak', 'w') as f:
        f.write(html)

    def maybe_insert(html, archive_key, next_key, new_js):
        if new_js is None:
            print(f'  ⚠️ {archive_key} skip（提炼失败）')
            return html
        marker = f'{archive_key}: ['
        start = html.find(marker)
        if start == -1:
            print(f'  ⚠️ {archive_key} 在 HTML 中找不到，跳过')
            return html
        end = html.find(next_key) if next_key else len(html)
        block = html[start:end]
        if TODAY in re.findall(r"date: '(\d{4}-\d{2}-\d{2})'", block):
            print(f'  ⏭️ {archive_key} 今日已存在，跳过')
            return html
        pos = start + len(marker)
        html = html[:pos] + '\n      ' + new_js + ',\n' + html[pos:]
        print(f'  ✅ {archive_key} 写入成功')
        return html

    html = maybe_insert(html, 'sportsArchives',        'techArchives',          category_outputs.get('sports'))
    html = maybe_insert(html, 'techArchives',           'cs2Archives',           category_outputs.get('tech'))
    html = maybe_insert(html, 'cs2Archives',            'travelArchives',        category_outputs.get('cs2'))
    html = maybe_insert(html, 'travelArchives',         'financeArchives',       category_outputs.get('travel'))
    html = maybe_insert(html, 'financeArchives',        'foodArchives',          category_outputs.get('finance'))
    html = maybe_insert(html, 'foodArchives',           'entertainmentArchives', category_outputs.get('food'))
    html = maybe_insert(html, 'entertainmentArchives',  None,                    category_outputs.get('entertainment'))

    # 检查重复
    for ak in ['sportsArchives:', 'techArchives:', 'cs2Archives:', 'travelArchives:',
               'financeArchives:', 'foodArchives:', 'entertainmentArchives:']:
        cnt = html.count(ak)
        if cnt != 1:
            raise SystemExit(f'⚠️ 写入后 {ak} 出现{cnt}次！终止，已备份至 tmp/index.html.bak')

    with open(HTML_PATH, 'w') as f:
        f.write(html)

    print('写入完成')
    return html


# ============ JS 语法验证 ============
def validate_html():
    """JS 语法验证"""
    with open(HTML_PATH) as f:
        html = f.read()

    start = html.find('function radarApp()')
    end = html.rfind('</script>')
    js = html[start:end]

    with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False) as f:
        f.write(js)
        tmp = f.name

    # 尝试多个 node 路径
    node_cmd = None
    for candidate in ['node', '/usr/local/bin/node', '/opt/homebrew/bin/node',
                      os.path.expanduser('~/.workbuddy/binaries/node/versions/22.12.0/bin/node')]:
        if os.path.isfile(candidate) or candidate == 'node':
            node_cmd = candidate
            break

    r = subprocess.run([node_cmd or 'node', '--check', tmp], capture_output=True, text=True)
    os.unlink(tmp)

    if r.returncode != 0:
        raise SystemExit('❌ JS语法验证失败：' + r.stderr[:300])

    print('✅ JS语法验证通过')


# ============ 更新追踪词 ============
def update_track_keywords():
    """更新追踪词 JSON"""
    with open(HTML_PATH) as f:
        html = f.read()

    kw_pattern = r"keywords:\s*\[(.*?)\]"

    def extract_kws(block_start, block_end):
        start_pos = html.find(block_start)
        end_pos = html.find(block_end) if block_end is not None else len(html)
        chunk = html[start_pos:end_pos][:5000]
        match = re.search(kw_pattern, chunk)
        if match:
            return re.findall(r"'([^']+)'", match.group(1))[:5]
        return []

    track_data = {
        'sports':        extract_kws('sportsArchives',        'techArchives')          or ['运动', '户外', '装备'],
        'tech':          extract_kws('techArchives',           'cs2Archives')           or ['数码', '科技', '新品'],
        'cs2':           extract_kws('cs2Archives',            'travelArchives')        or ['CS2', '赛事', '选手'],
        'travel':        extract_kws('travelArchives',         'financeArchives')       or ['旅游', '酒店', '出行'],
        'finance':       extract_kws('financeArchives',        'foodArchives')          or ['理财', '利率', '基金'],
        'food':          extract_kws('foodArchives',           'entertainmentArchives') or ['外卖', '美食', '餐饮'],
        'entertainment': extract_kws('entertainmentArchives',  None)                    or ['电影', '明星', '综艺'],
    }

    with open(TRACK_PATH, 'w') as f:
        json.dump(track_data, f, indent=2, ensure_ascii=False)

    print('✅ 追踪词JSON已更新')


# ============ 主流程 ============
def main():
    parser = argparse.ArgumentParser(description='选题雷达更新脚本 v3（Hot API 真实热榜版）')
    parser.add_argument('--search',  action='store_true', help='仅拉取热榜，保存 search_results.json')
    parser.add_argument('--process', action='store_true', help='读取已保存热榜，执行提炼+写入')
    parser.add_argument('--full',    action='store_true', help='完整流程（推荐）')
    args = parser.parse_args()

    print(f'\n{"="*60}')
    print(f'选题雷达更新 v3 | {TODAY} {WEEKDAY} | 节日：{FESTIVAL_NAME}（距今{DAYS_TO_FESTIVAL}天）')
    print(f'{"="*60}\n')

    track_data = load_track_keywords()

    if args.search or args.full:
        # 拉取全量真实热榜
        all_hot = fetch_all_hot()

        # 按品类匹配
        print('\n🔍 按品类匹配热榜数据...')
        category_data = {}
        for cat in ['sports', 'tech', 'cs2', 'travel', 'finance', 'food', 'entertainment']:
            extra = track_data.get(cat, [])  # 追踪词也加入匹配
            matched = match_category(all_hot, cat, extra_keywords=extra)
            category_data[cat] = matched
            print(f'  {cat}: {len(matched)}条')

        # 保存
        os.makedirs(TMP_DIR, exist_ok=True)
        with open(f'{TMP_DIR}/search_results.json', 'w') as f:
            json.dump({
                'date': TODAY,
                'weekday': WEEKDAY,
                'festival': {'name': FESTIVAL_NAME, 'days': DAYS_TO_FESTIVAL},
                'all_hot': all_hot[:100],
                'category_data': category_data,
            }, f, indent=2, ensure_ascii=False)
        print('✅ 热榜数据保存至 tmp/search_results.json')

        if args.search and not args.full:
            return

    if args.process or args.full:
        if not args.full:
            try:
                with open(f'{TMP_DIR}/search_results.json') as f:
                    saved = json.load(f)
                    category_data = saved['category_data']
                    all_hot = saved['all_hot']
                print('✅ 从 tmp/search_results.json 加载热榜数据')
            except Exception as e:
                print(f'⚠️ 无法加载已保存数据: {e}，重新拉取')
                all_hot = fetch_all_hot()
                category_data = {}
                for cat in ['sports', 'tech', 'cs2', 'travel', 'finance', 'food', 'entertainment']:
                    category_data[cat] = match_category(all_hot, cat, track_data.get(cat, []))

        # Gemini 提炼（7次调用，真实内容输入）
        print(f'\n🤖 Gemini 提炼（{len(category_data)} 品类）...')
        category_outputs = process_with_gemini(category_data, all_hot)

        # 写入 HTML
        print('\n📝 写入 HTML...')
        write_to_html(category_outputs)

        # JS 语法验证
        validate_html()

        # 更新追踪词
        update_track_keywords()

        print(f'\n{"="*60}')
        print('✅ 更新完成！')
        print(f'{"="*60}')

        print('\n📝 部署指令：')
        print(f"  deploy_to_vercel(workspace='{WORKSPACE}/运动户外选题雷达')")
        print(f"  vercel alias set <部署URL> interest-radar-daily.codebanana.app")
        print(f"  GitHub 同步: repos/weifengjiao12345-svg/sports-topic-radar")


if __name__ == '__main__':
    main()
