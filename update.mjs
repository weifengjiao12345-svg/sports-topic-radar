/**
 * 运动户外选题雷达 - 每日自动更新脚本
 * 数据来源: 微博热搜（免费）+ 百度热搜（免费）
 * AI 分析: DeepSeek API（deepseek-chat，极低成本）
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

// ── 获取北京时间 ───────────────────────────────
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
    month: m,
    day: d,
  };
}

// ── 抓取微博热搜 ───────────────────────────────
async function fetchWeiboHot() {
  try {
    const res = await fetch('https://weibo.com/ajax/side/hotSearch', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://weibo.com/',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    const items = data?.data?.realtime || [];
    return items.slice(0, 30).map(i => ({
      word: i.word || '',
      num: i.num || 0,
      url: i.word ? `https://s.weibo.com/weibo?q=%23${encodeURIComponent(i.word)}%23` : '',
    }));
  } catch (e) {
    console.warn('⚠️ 微博热搜抓取失败:', e.message);
    return [];
  }
}

// ── 抓取百度热搜 ───────────────────────────────
async function fetchBaiduHot() {
  try {
    const res = await fetch('https://top.baidu.com/board?tab=realtime', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();
    const words = [];
    const regex = /"word":"([^"]+)"/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      words.push(match[1]);
    }
    return words.slice(0, 20).map(w => ({
      word: w,
      num: 0,
      url: `https://www.baidu.com/s?wd=${encodeURIComponent(w)}`,
    }));
  } catch (e) {
    console.warn('⚠️ 百度热搜抓取失败:', e.message);
    return [];
  }
}

// ── 抓取虎扑运动热帖 ──────────────────────────
async function fetchHupuHot() {
  try {
    const res = await fetch('https://www.hupu.com/home/v1/news?pageNo=1&pageSize=20', {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    const list = data?.data?.list || [];
    return list.slice(0, 10).map(i => ({
      word: i.title || '',
      num: i.recommendNum || 0,
      url: i.jumpUrl || '#',
    }));
  } catch (e) {
    console.warn('⚠️ 虎扑热帖抓取失败:', e.message);
    return [];
  }
}

// ── 调用 DeepSeek API ─────────────────────────────
async function callDeepSeek(prompt) {
  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: '你是一位专注运动户外行业的内容选题编辑，擅长从热搜数据中找到与跑步、装备、户外运动相关的有传播力的话题。请严格按照要求返回 JSON 格式，不要有任何额外说明文字。',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 3000,
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DeepSeek API 错误 ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

// ── 主函数 ────────────────────────────────────
async function main() {
  const { date, dateCompact, weekday, month, day } = getBeijingDate();
  console.log(`📅 开始生成 ${date}（${weekday}）的选题雷达...`);

  // 并行抓取热搜数据
  console.log('🔍 正在抓取热搜数据...');
  const [weiboHot, baiduHot, hupuHot] = await Promise.all([
    fetchWeiboHot(),
    fetchBaiduHot(),
    fetchHupuHot(),
  ]);

  const weiboList = weiboHot.map(i => `  - ${i.word}（热度${i.num}）`).join('\n');
  const baiduList = baiduHot.map(i => `  - ${i.word}`).join('\n');
  const hupuList = hupuHot.map(i => `  - ${i.word}`).join('\n');

  console.log(`  微博: ${weiboHot.length} 条 | 百度: ${baiduHot.length} 条 | 虎扑: ${hupuHot.length} 条`);

  if (weiboHot.length === 0 && baiduHot.length === 0) {
    console.error('❌ 热搜数据全部获取失败，退出');
    process.exit(1);
  }

  // 构建分析 prompt
  const prompt = `
今天是 ${date}（${weekday}），以下是从微博、百度、虎扑抓取的今日实时热搜数据：

【微博热搜（含热度值）】
${weiboList || '（获取失败）'}

【百度热搜】
${baiduList || '（获取失败）'}

【虎扑热帖标题】
${hupuList || '（获取失败）'}

请从以上数据中，筛选出 6~8 条与【运动户外】行业相关的话题（跑步/马拉松/装备/冲锋衣/户外品牌/运动消费/健身/骑行/徒步），分析其传播价值，生成选题雷达简报。

如果热搜中运动户外相关话题不足，可以基于热搜中的社会情绪（如健康焦虑、消费焦虑、国货话题）结合运动户外角度进行延伸创作。

严格返回以下 JSON 格式，不要有任何其他文字：

{
  "editorNote": "今日整体背景概括，100字以内，突出最重要的运动户外相关热点",
  "keywords": ["关键词1", "关键词2", "关键词3", "关键词4", "关键词5"],
  "hotSection": [
    {
      "id": "${dateCompact}-01",
      "title": "选题标题，要有话题感和传播钩子，30字以内",
      "summary": "一句话导语，说清楚事件背景和争议点，60字以内",
      "tags": [
        { "text": "标签文字", "type": "topic" },
        { "text": "情绪词", "type": "emotion" },
        { "text": "品牌名", "type": "product" }
      ],
      "heatInfo": { "type": "start", "label": "${month}月${day}日起热·简要说明" },
      "sources": [
        { "name": "微博热搜", "url": "https://s.weibo.com/weibo?q=%23关键词%23", "icon": "🔴", "cls": "pt-weibo" }
      ],
      "level": "high",
      "levelLabel": "🔵 爆热",
      "propagation": {
        "emotion": "核心情绪/矛盾点分析，50字以内",
        "motivation": "用户参与动机，40字以内",
        "formats": ["📊 资讯帖（简要说明）", "🗳️ 投票帖（简要说明）"]
      }
    }
  ],
  "watchSection": [
    {
      "id": "${dateCompact}-04",
      "title": "选题标题，30字以内",
      "summary": "一句话导语，60字以内",
      "tags": [{ "text": "标签", "type": "topic" }],
      "heatInfo": { "type": "start", "label": "${month}月${day}日·简要说明" },
      "sources": [{ "name": "来源", "url": "#", "icon": "📰", "cls": "pt-default" }],
      "level": "mid",
      "levelLabel": "🩵 中潜力",
      "propagation": {
        "emotion": "情绪分析，40字以内",
        "motivation": "参与动机，30字以内",
        "formats": ["💬 讨论帖（说明）"]
      }
    }
  ]
}

规则：
- hotSection 2~4条（已确认热起来的），watchSection 2~4条（潜力盯的）
- level 只能是 high / mid / low
- heatInfo.type 只能是 start 或 resurge（复涨）
- cls 只能是：pt-weibo / pt-xhs / pt-douyin / pt-hupu / pt-zhihu / pt-weixin / pt-baidu / pt-default
- hotSection levelLabel 用 🔵 爆热 或 🔵 高热
- watchSection levelLabel 用 🩵 中潜力 或 🩵 中热 或 💚 观察中
- 来源 url 尽量填真实的搜索链接，如 https://s.weibo.com/weibo?q=关键词
`;

  let rawContent;
  try {
    console.log('🤖 正在调用 DeepSeek AI 分析热点...');
    rawContent = await callDeepSeek(prompt);
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
    console.error('原始返回前500字:', rawContent.slice(0, 500));
    process.exit(1);
  }

  // 构建新的存档对象
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

  // 读取并更新 index.html
  const indexPath = path.join(__dirname, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf-8');

  // 更新 today 字段
  html = html.replace(/today:\s*'[\d-]+'/, `today: '${date}'`);

  // 在 archives 数组最前面插入新数据（缩进对齐）
  const newArchiveStr = JSON.stringify(newArchive, null, 6)
    .split('\n')
    .map((line, i) => i === 0 ? line : '      ' + line)
    .join('\n');

  html = html.replace(
    /archives:\s*\[(\s*)\{/,
    `archives: [\n      ${newArchiveStr},\n      {`
  );

  fs.writeFileSync(indexPath, html, 'utf-8');
  console.log('✅ index.html 已更新');

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
    mdLines.push('');
    mdLines.push(`**导语：** ${item.summary}`);
    mdLines.push('');
    mdLines.push(`**热度时间：** ${item.heatInfo?.label || ''}`);
    mdLines.push('');
    if (item.sources?.length) {
      mdLines.push(`**来源：** ${item.sources.map(s => `[${s.name}](${s.url})`).join(' · ')}`);
      mdLines.push('');
    }
    if (item.propagation) {
      mdLines.push(`**情绪/矛盾点：** ${item.propagation.emotion || ''}`);
      mdLines.push('');
      mdLines.push(`**参与动机：** ${item.propagation.motivation || ''}`);
      mdLines.push('');
      if (item.propagation.formats?.length) {
        mdLines.push(`**推荐形式：** ${item.propagation.formats.join(' | ')}`);
        mdLines.push('');
      }
    }
    mdLines.push('---');
    mdLines.push('');
  });

  mdLines.push(`## 👀 值得盯（${newData.watchSection?.length || 0} 条）`, '');
  (newData.watchSection || []).forEach((item, i) => {
    const num = (newData.hotSection?.length || 0) + i + 1;
    mdLines.push(`### ${String(num).padStart(2, '0')} | ${item.levelLabel} ${item.title}`);
    mdLines.push('');
    mdLines.push(`**导语：** ${item.summary}`);
    mdLines.push('');
    mdLines.push(`**热度时间：** ${item.heatInfo?.label || ''}`);
    mdLines.push('');
    if (item.propagation) {
      mdLines.push(`**推荐形式：** ${(item.propagation.formats || []).join(' | ')}`);
      mdLines.push('');
    }
    mdLines.push('---');
    mdLines.push('');
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
