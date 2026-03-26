/**
 * 运动户外选题雷达 - 每日自动更新脚本
 * 运行方式: node update.mjs
 * 环境变量: PERPLEXITY_API_KEY
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

if (!PERPLEXITY_API_KEY) {
  console.error('❌ 缺少环境变量 PERPLEXITY_API_KEY');
  process.exit(1);
}

// ── 获取北京时间日期 ──────────────────────────
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
  };
}

// ── 调用 Perplexity API ───────────────────────
async function callPerplexity(prompt) {
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [
        {
          role: 'system',
          content: '你是一位专注运动户外行业的内容选题编辑，擅长从全网舆情中找到有传播力的话题。请严格按照要求返回 JSON 格式，不要有任何额外说明文字。',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Perplexity API 错误 ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

// ── 主函数 ────────────────────────────────────
async function main() {
  const { date, dateCompact, weekday } = getBeijingDate();
  console.log(`📅 开始生成 ${date} (${weekday}) 的选题雷达...`);

  // 构建搜索 prompt
  const prompt = `
今天是 ${date}（${weekday}），请搜索并分析过去24小时内中国运动户外行业的真实热点新闻，生成选题雷达简报。

要求：
1. 搜索微博、小红书、虎扑、知乎、抖音、百家号等平台最新动态
2. 聚焦：跑步装备、户外装备、运动品牌、马拉松赛事、户外消费趋势
3. 过滤：广告软文、品牌赞助公告、纯展会通知
4. 选取 6~8 条真实有话题性的内容，分为 hotSection（2-4条已热起来）和 watchSection（3-4条潜力盯）

请严格返回以下 JSON 格式，不要有任何其他文字：

{
  "editorNote": "今日整体背景一句话概括，100字以内，突出最重要热点",
  "keywords": ["关键词1", "关键词2", "关键词3", "关键词4", "关键词5"],
  "hotSection": [
    {
      "id": "${dateCompact}-01",
      "title": "选题标题，要有话题感和传播钩子，30字以内",
      "summary": "一句话导语，说清楚事件背景和争议点，50字以内",
      "tags": [
        { "text": "标签文字", "type": "topic" },
        { "text": "平台名", "type": "platform" },
        { "text": "情绪词", "type": "emotion" },
        { "text": "品牌名", "type": "product" }
      ],
      "heatInfo": { "type": "start", "label": "X月X日起热·简要说明" },
      "sources": [
        { "name": "来源名称", "url": "真实URL或#", "icon": "🔴", "cls": "pt-weibo" }
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
      "id": "${dateCompact}-05",
      "title": "选题标题",
      "summary": "一句话导语",
      "tags": [{ "text": "标签", "type": "topic" }],
      "heatInfo": { "type": "start", "label": "X月X日出现·简要说明" },
      "sources": [{ "name": "来源", "url": "#", "icon": "📰", "cls": "pt-default" }],
      "level": "mid",
      "levelLabel": "🩵 中潜力",
      "propagation": {
        "emotion": "情绪分析",
        "motivation": "参与动机",
        "formats": ["💬 讨论帖（说明）"]
      }
    }
  ]
}

注意事项：
- level 只能是 high / mid / low
- heatInfo.type 只能是 start 或 resurge
- cls 只能是：pt-weibo / pt-xhs / pt-douyin / pt-hupu / pt-zhihu / pt-weixin / pt-baidu / pt-default
- 如果是复涨/二次发酵，type 用 resurge，levelLabel 可以用"🔁 复涨"
- hotSection 的 levelLabel 用 🔵 爆热 或 🔵 高热
- watchSection 的 levelLabel 用 🩵 中潜力 或 🩵 中热 或 💚 观察中
`;

  let rawContent;
  try {
    console.log('🔍 正在调用 Perplexity API 搜索热点...');
    rawContent = await callPerplexity(prompt);
    console.log('✅ API 返回成功');
  } catch (err) {
    console.error('❌ API 调用失败:', err.message);
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
    console.error('原始返回:', rawContent.slice(0, 500));
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

  // 在 archives 数组最前面插入新数据
  const newArchiveStr = JSON.stringify(newArchive, null, 6)
    .replace(/^/gm, '      ')  // 缩进对齐
    .trimStart();

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
    `> 编辑更新时间：09:00 北京时间`,
    '',
    `## 📋 编辑提示`,
    '',
    `> ${newData.editorNote || ''}`,
    '',
    `**关键词：** ${(newData.keywords || []).join(' · ')}`,
    '',
    '---',
    '',
    '## 第一部分：已热起来 🔥',
    '',
  ];

  (newData.hotSection || []).forEach((item, i) => {
    mdLines.push(`### ${String(i + 1).padStart(2, '0')} | ${item.title}`);
    mdLines.push('');
    mdLines.push(`**导语：** ${item.summary}`);
    mdLines.push('');
    mdLines.push(`**热度：** ${item.levelLabel}　**时间：** ${item.heatInfo?.label || ''}`);
    mdLines.push('');
    if (item.sources?.length) {
      mdLines.push(`**来源：** ${item.sources.map(s => `[${s.name}](${s.url})`).join(' · ')}`);
      mdLines.push('');
    }
    mdLines.push('---');
    mdLines.push('');
  });

  mdLines.push('## 第二部分：值得盯 👀', '');
  (newData.watchSection || []).forEach((item, i) => {
    const num = (newData.hotSection?.length || 0) + i + 1;
    mdLines.push(`### ${String(num).padStart(2, '0')} | ${item.title}`);
    mdLines.push('');
    mdLines.push(`**导语：** ${item.summary}`);
    mdLines.push('');
    mdLines.push(`**热度：** ${item.levelLabel}　**时间：** ${item.heatInfo?.label || ''}`);
    mdLines.push('');
    mdLines.push('---');
    mdLines.push('');
  });

  mdLines.push('*本简报由选题雷达系统每日自动生成*');

  fs.writeFileSync(mdPath, mdLines.join('\n'), 'utf-8');
  console.log(`✅ MD 文件已生成：${date}.md`);
  console.log(`🎉 完成！本期共 ${totalItems} 条选题`);
}

main().catch(err => {
  console.error('❌ 脚本执行失败:', err);
  process.exit(1);
});
