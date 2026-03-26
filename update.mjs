/**
 * 运动户外选题雷达 - 每日自动更新脚本
 * 数据来源: 微博热搜 + 百度热搜 + 百家号新闻（免费）
 * AI 分析: DeepSeek API（deepseek-chat）
 * 运行方式: node update.mjs
 * 环境变量: DEEPSEEK_API_KEY
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

if (!DEEPSEEK_API_KEY) {
  console.error('❌ 缺少环境变量 DEEPSEEK_API_KEY');
  process.exit(1);
}

// ── 获取北京时间 ──────────────────────────────
function getBeijingDate() {
  const now = new Date();
  const bjTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  const y = bjTime.getFullYear();
  const m = String(bjTime.getMonth() + 1).padStart(2, '0');
  const d = String(bjTime.getDate()).padStart(2, '0');
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return {
    date: `${y}-${m}-${d}`,
    dateCompact: `${y}${m}${d}`,
    weekday: weekdays[bjTime.getDay()],
    month: parseInt(m),
    day: parseInt(d),
  };
}

// ── 抓取微博热搜（含热度值）────────────────────
async function fetchWeiboHot() {
  try {
    const res = await fetch('https://weibo.com/ajax/side/hotSearch', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://weibo.com/',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    return (data?.data?.realtime || []).slice(0, 35).map(i => ({
      word: i.word || '',
      num: i.num || 0,
      url: `https://s.weibo.com/weibo?q=%23${encodeURIComponent(i.word)}%23`,
    }));
  } catch (e) {
    console.warn('⚠️ 微博热搜抓取失败:', e.message);
    return [];
  }
}

// ── 抓取百度热搜 ──────────────────────────────
async function fetchBaiduHot() {
  try {
    const res = await fetch('https://top.baidu.com/board?tab=realtime', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();
    const words = [...html.matchAll(/"word":"([^"]+)"/g)].map(m => m[1]);
    return words.slice(0, 20).map(w => ({
      word: w,
      url: `https://www.baidu.com/s?wd=${encodeURIComponent(w)}`,
    }));
  } catch (e) {
    console.warn('⚠️ 百度热搜抓取失败:', e.message);
    return [];
  }
}

// ── 抓取百家号运动户外新闻摘要 ────────────────
async function fetchSportsNews() {
  const queries = ['运动装备', '跑步马拉松', '户外冲锋衣'];
  const results = [];
  for (const q of queries) {
    try {
      const res = await fetch(
        `https://www.baidu.com/s?wd=${encodeURIComponent(q + ' 最新')}&rn=5&tn=json`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
          signal: AbortSignal.timeout(8000),
        }
      );
      const text = await res.text();
      // 提取标题
      const titles = [...text.matchAll(/"title":"([^"]{10,60})"/g)].map(m => m[1]);
      results.push(...titles.slice(0, 4).map(t => `[${q}] ${t}`));
    } catch (e) { /* 忽略单个失败 */ }
  }
  return results;
}

// ── 抓取虎扑运动热帖 ──────────────────────────
async function fetchHupuHot() {
  try {
    const res = await fetch('https://www.hupu.com/home/v1/news?pageNo=1&pageSize=20', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    return (data?.data?.list || []).slice(0, 10).map(i => ({
      word: i.title || '',
      url: i.jumpUrl || '#',
    }));
  } catch (e) {
    console.warn('⚠️ 虎扑热帖抓取失败:', e.message);
    return [];
  }
}

// ── 调用 DeepSeek API ─────────────────────────
async function callDeepSeek(systemPrompt, userPrompt) {
  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 4000,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DeepSeek API 错误 ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

// ── 主函数 ────────────────────────────────────
async function main() {
  const { date, dateCompact, weekday, month, day } = getBeijingDate();
  console.log(`📅 开始生成 ${date}（${weekday}）的选题雷达...`);

  // 检查今日是否已生成（防止重复插入）
  const indexPath = path.join(__dirname, 'index.html');
  const existingHtml = fs.readFileSync(indexPath, 'utf-8');
  if (existingHtml.includes(`"date": "${date}"`)) {
    console.log(`✅ 今日（${date}）已存在，跳过生成`);
    return;
  }

  // 并行抓取所有数据源
  console.log('🔍 正在抓取热搜和新闻数据...');
  const [weiboHot, baiduHot, hupuHot, sportsNews] = await Promise.all([
    fetchWeiboHot(),
    fetchBaiduHot(),
    fetchHupuHot(),
    fetchSportsNews(),
  ]);

  console.log(`  微博: ${weiboHot.length}条 | 百度: ${baiduHot.length}条 | 虎扑: ${hupuHot.length}条 | 新闻: ${sportsNews.length}条`);

  if (weiboHot.length === 0 && baiduHot.length === 0) {
    console.error('❌ 热搜数据全部获取失败，退出');
    process.exit(1);
  }

  const weiboStr = weiboHot.map(i => `  ${String(i.num).padStart(7)} | ${i.word}`).join('\n');
  const baiduStr = baiduHot.map(i => `  ${i.word}`).join('\n');
  const hupuStr = hupuHot.map(i => `  ${i.word}`).join('\n');
  const newsStr = sportsNews.map(s => `  ${s}`).join('\n');

  const systemPrompt = `你是一位深度运营的运动户外行业内容选题编辑，有10年行业经验。你能从热搜数据中挖掘出有真实传播力的选题，不只看表面词汇，而是分析背后的用户情绪、消费矛盾、品牌争议、社会现象。你的选题有独特的角度和钩子，能引发真实评论区互动。请严格按照要求返回 JSON 格式，不要有任何额外说明文字。`;

  const userPrompt = `
今天是 ${date}（${weekday}），以下是今日实时多平台数据：

【微博热搜 Top35（格式：热度值 | 词条）】
${weiboStr || '（获取失败）'}

【百度热搜 Top20】
${baiduStr || '（获取失败）'}

【虎扑运动热帖】
${hupuStr || '（无数据）'}

【百度运动户外相关新闻标题】
${newsStr || '（无数据）'}

---

请按以下思路生成今日运动户外选题：

**第一步：识别运动户外相关信号**
从上述数据找出所有与【跑步/马拉松/冲锋衣/户外装备/运动品牌/健身/骑行/徒步/运动消费/运动安全】直接或间接相关的词条。

**第二步：扩展延伸**
即使热搜词不直接写"运动"，也要联想：
- 健康/医疗热点 → 运动安全/装备选题
- 消费/品牌热点 → 运动消费焦虑选题
- 社会情绪 → 运动生活方式选题
- 季节/气候 → 户外装备需求选题

**第三步：提炼传播钩子**
每个选题必须有明确的"撕裂点"或"反常识"或"身份认同"，能让人在评论区站队。

**第四步：输出标准格式**

返回 JSON（只返回JSON，不要任何其他文字）：

{
  "editorNote": "今日背景：[用100字描述今日最重要的运动户外舆情背景，点出1-2个核心热点和整体情绪基调]",
  "keywords": ["关键词1", "关键词2", "关键词3", "关键词4", "关键词5"],
  "hotSection": [
    {
      "id": "${dateCompact}-01",
      "title": "标题：必须有钩子，能一眼引发好奇或站队冲动，25字以内",
      "summary": "导语：交代事件背景+核心争议点，语气犀利有态度，60字以内",
      "tags": [
        { "text": "具体话题词", "type": "topic" },
        { "text": "情绪标签", "type": "emotion" },
        { "text": "品牌名", "type": "product" },
        { "text": "平台", "type": "platform" }
      ],
      "heatInfo": { "type": "start", "label": "${month}月${day}日起热·[一句话说明热度来源]" },
      "sources": [
        { "name": "微博热搜", "url": "https://s.weibo.com/weibo?q=%23关键词%23", "icon": "🔴", "cls": "pt-weibo" }
      ],
      "level": "high",
      "levelLabel": "🔵 爆热",
      "propagation": {
        "emotion": "[核心情绪/矛盾点：具体说明是什么样的对立或焦虑，60字以内]",
        "motivation": "[用户为什么要参与：利益/认同/自我表达/猎奇，40字以内]",
        "formats": ["📊 具体形式1（说明切入角度）", "🗳️ 具体形式2（说明互动设计）", "💬 具体形式3（说明内容方向）"]
      }
    }
  ],
  "watchSection": [
    {
      "id": "${dateCompact}-04",
      "title": "标题，25字以内",
      "summary": "导语，60字以内",
      "tags": [{ "text": "标签", "type": "topic" }],
      "heatInfo": { "type": "start", "label": "${month}月${day}日·[热度说明]" },
      "sources": [{ "name": "来源平台", "url": "https://s.weibo.com/weibo?q=关键词", "icon": "🔴", "cls": "pt-weibo" }],
      "level": "mid",
      "levelLabel": "🩵 中潜力",
      "propagation": {
        "emotion": "情绪分析，50字以内",
        "motivation": "参与动机，35字以内",
        "formats": ["💬 形式1", "🗳️ 形式2"]
      }
    }
  ]
}

数量要求：hotSection 3~4条，watchSection 3~4条。
level 只能是 high/mid/low，heatInfo.type 只能是 start/resurge。
cls 只能是：pt-weibo/pt-xhs/pt-douyin/pt-hupu/pt-zhihu/pt-weixin/pt-baidu/pt-default。
hotSection levelLabel 用 🔵 爆热 或 🔵 高热。
watchSection levelLabel 用 🩵 中潜力 或 🩵 中热 或 💚 观察中。
`;

  let rawContent;
  try {
    console.log('🤖 正在调用 DeepSeek 分析热点...');
    rawContent = await callDeepSeek(systemPrompt, userPrompt);
    console.log('✅ DeepSeek 分析完成');
  } catch (err) {
    console.error('❌ DeepSeek API 调用失败:', err.message);
    process.exit(1);
  }

  // 提取 JSON
  let newData;
  try {
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('未找到 JSON 内容');
    newData = JSON.parse(jsonMatch[0]);
    console.log(`📦 解析成功：热门 ${newData.hotSection?.length || 0} 条，观察 ${newData.watchSection?.length || 0} 条`);
  } catch (err) {
    console.error('❌ JSON 解析失败:', err.message);
    console.error('原始返回前800字:', rawContent.slice(0, 800));
    process.exit(1);
  }

  // 构建新存档对象
  const totalItems = (newData.hotSection?.length || 0) + (newData.watchSection?.length || 0);
  const newArchive = {
    date,
    weekday,
    updateTime: '09:00',
    items: totalItems,
    editorNote: newData.editorNote || '',
    keywords: newData.keywords || [],
    hotSection: newData.hotSection || [],
    watchSection: newData.watchSection || [],
  };

  // ── 更新 index.html（安全插入，不破坏历史数据）──
  let html = existingHtml;

  // 1. 更新 today 字段
  html = html.replace(/today:\s*'[\d-]+'/, `today: '${date}'`);

  // 2. 找到 archives: [ 的位置，在第一个 { 之前精确插入
  //    用更稳健的方式：找到 "archives: [" 然后在其后插入，而不是替换
  const newArchiveJson = JSON.stringify(newArchive, null, 6)
    .split('\n')
    .map((line, i) => i === 0 ? line : '      ' + line)
    .join('\n');

  // 匹配 archives: [ 后面紧跟的第一个 { （即第一期存档的开头）
  // 在它之前插入新存档
  const insertPattern = /(archives:\s*\[\s*\n\s*)\{/;
  if (insertPattern.test(html)) {
    html = html.replace(insertPattern, `$1${newArchiveJson},\n      {`);
  } else {
    console.error('❌ 未找到 archives 插入位置，HTML 结构可能已损坏');
    process.exit(1);
  }

  fs.writeFileSync(indexPath, html, 'utf-8');
  console.log('✅ index.html 已更新（历史数据保留）');

  // 验证插入后存档数量
  const dateMatches = (html.match(/"date": "\d{4}-\d{2}-\d{2}"/g) || []);
  console.log(`📚 当前存档期数: ${dateMatches.length} 期`);

  // 生成 MD 文件
  const mdPath = path.join(__dirname, `${date}.md`);
  const mdLines = [
    `# 🏃 运动户外选题雷达 ${date}（${weekday}）`,
    `> 编辑更新时间：09:00 北京时间 | 自动生成`,
    '',
    `## 📋 编辑提示`,
    '',
    `> ${newData.editorNote || ''}`,
    '',
    `**关键词：** ${(newData.keywords || []).join(' · ')}`,
    '',
    '---',
    '',
    `## 🔥 已热起来（${newData.hotSection?.length || 0} 条）`,
    '',
  ];
  (newData.hotSection || []).forEach((item, i) => {
    mdLines.push(`### ${String(i + 1).padStart(2, '0')} | ${item.levelLabel} ${item.title}`);
    mdLines.push('', `**导语：** ${item.summary}`, '');
    mdLines.push(`**热度：** ${item.heatInfo?.label || ''}`);
    if (item.sources?.length) {
      mdLines.push('', `**来源：** ${item.sources.map(s => `[${s.name}](${s.url})`).join(' · ')}`);
    }
    if (item.propagation) {
      mdLines.push('', `**情绪/矛盾点：** ${item.propagation.emotion || ''}`);
      mdLines.push('', `**参与动机：** ${item.propagation.motivation || ''}`);
      if (item.propagation.formats?.length) {
        mdLines.push('', `**推荐形式：** ${item.propagation.formats.join(' | ')}`);
      }
    }
    mdLines.push('', '---', '');
  });
  mdLines.push(`## 👀 值得盯（${newData.watchSection?.length || 0} 条）`, '');
  (newData.watchSection || []).forEach((item, i) => {
    const num = (newData.hotSection?.length || 0) + i + 1;
    mdLines.push(`### ${String(num).padStart(2, '0')} | ${item.levelLabel} ${item.title}`);
    mdLines.push('', `**导语：** ${item.summary}`, '');
    mdLines.push(`**热度：** ${item.heatInfo?.label || ''}`);
    if (item.propagation?.formats?.length) {
      mdLines.push('', `**推荐形式：** ${item.propagation.formats.join(' | ')}`);
    }
    mdLines.push('', '---', '');
  });
  mdLines.push('*本简报由选题雷达系统每日自动生成 · 数据来源：微博/百度/虎扑热搜*');

  fs.writeFileSync(mdPath, mdLines.join('\n'), 'utf-8');
  console.log(`✅ MD 文件已生成：${date}.md`);
  console.log(`🎉 完成！本期共 ${totalItems} 条选题`);
}

main().catch(err => {
  console.error('❌ 脚本执行失败:', err);
  process.exit(1);
});
