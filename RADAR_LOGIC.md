# 兴趣雷达·选题日报 — 系统逻辑说明书

> **版本**：v2.1  **最后更新**：2026-04-08  
> **作用**：这是选题雷达的完整大脑记忆，迭代即更新此文件。  
> **访问地址**：https://interest-radar-daily.codebanana.app  
> **备用地址**：https://topic-radar-d63cfbaf.codebanana.app  
> **GitHub**：weifengjiao12345-svg/sports-topic-radar（main 分支）

---

## 一、整体架构

### 1.1 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| 前端框架 | Alpine.js 3.x（CDN） | 响应式状态管理，无需构建 |
| 样式 | Tailwind CSS（CDN） | utility-first，全部内联 |
| 数据 | 硬编码 JS 对象 | 全部写在 `index.html` 的 `radarApp()` 函数内 |
| 部署 | Vercel | 静态单文件，每次更新都要重新部署并 alias |
| 版本控制 | GitHub | 每次部署后同步推送 |
| AI 提炼 | Gemini（优刻得 UModelVerse） | `gemini-3-flash-preview`（提炼）/ `gemini-3.1-flash-lite-preview`（搜索） |
| **AI 搜索** | **Gemini（优刻得）** | **2026-04-08 新增，替代 universal_search，成本 ¥0.5/天** |

### 1.2 文件结构

```
运动户外选题雷达/
├── index.html              ← 数据+逻辑+样式（主文件）
├── update_radar.py         ← 外置更新脚本（2026-04-08 新增，839行）
├── track_keywords.json     ← 追踪词独立存储（2KB，替代160KB HTML读取）
├── tmp/
│   └── search_results.json ← 搜索结果缓存
├── RADAR_LOGIC.md          ← 本文件（系统说明书）
└── keywords-sports.js      ← 运动户外关键词库（备用）
```

### 1.3 核心状态机

```javascript
function radarApp() {
  return {
    categories: [...],            // 七品类配置（元数据）
    currentCat: 'sports',         // 当前激活品类（URL hash 驱动）
    currentIndex: 0,              // 当前查看第几期存档（0=最新）

    sportsArchives: [...],        // 运动户外存档数组
    techArchives: [...],          // 数码科技存档数组
    cs2Archives: [...],           // CS电竞存档数组
    travelArchives: [...],        // 旅游出行存档数组
    financeArchives: [...],       // 金融存档数组
    foodArchives: [...],          // 美食存档数组（2026-04-07 新增）
    entertainmentArchives: [...], // 文娱存档数组

    get activeArchives() {
      if (this.currentCat === 'sports')        return this.sportsArchives;
      if (this.currentCat === 'tech')          return this.techArchives;
      if (this.currentCat === 'cs2')           return this.cs2Archives;
      if (this.currentCat === 'travel')        return this.travelArchives;
      if (this.currentCat === 'finance')       return this.financeArchives;
      if (this.currentCat === 'food')          return this.foodArchives;
      return this.entertainmentArchives;
    },

    get current() { return this.activeArchives[this.currentIndex] || {}; }
  }
}
```

### 1.4 URL 路由规则

- `#sports` → 运动户外
- `#tech` → 数码科技
- `#cs2` → CS电竞
- `#travel` → 旅游出行
- `#finance` → 金融
- `#food` → 美食（2026-04-07 新增）
- `#entertainment` → 文娱
- 无 hash → 默认加载 `sports`

---

## 二、七品类配置

### 2.1 品类元数据

| 品类 | id | icon | 主色 | 渐变 from→to | bgLight |
|------|----|------|------|-------------|---------|
| 运动户外 | `sports` | 🏃 | `#2563eb` | `#1e40af→#3b82f6` | `rgba(37,99,235,0.06)` |
| 数码科技 | `tech` | 💻 | `#7c3aed` | `#4c1d95→#8b5cf6` | `rgba(124,58,237,0.06)` |
| CS电竞 | `cs2` | 🎮 | `#d97706` | `#b45309→#f59e0b` | `rgba(217,119,6,0.06)` |
| 旅游出行 | `travel` | ✈️ | `#059669` | `#064e3b→#10b981` | `rgba(5,150,105,0.06)` |
| 金融 | `finance` | 💰 | `#0891b2` | `#164e63→#06b6d4` | `rgba(8,145,178,0.06)` |
| 美食 | `food` | 🍜 | `#ea580c` | `#c2410c→#f97316` | `rgba(234,88,12,0.06)` |
| 文娱 | `entertainment` | 🎬 | `#db2777` | `#9d174d→#ec4899` | `rgba(219,39,119,0.06)` |

> **⚠️ HTML 实际存档数组顺序（代码中）**：
> `sportsArchives → techArchives → cs2Archives → travelArchives → financeArchives → foodArchives → entertainmentArchives`  
> 写入脚本必须按此顺序定位 `next_key`，不能硬编码。

### 2.2 品类描述词

| 品类 | desc |
|------|------|
| 运动户外 | 装备 · 赛事 · 消费 · 户外 · 全网舆情扫描 |
| 数码科技 | 手机 · AI · 芯片 · 消费电子 · 全网舆情扫描 |
| CS电竞 | 赛事 · 战队 · 选手 · 皮肤 · 全网舆情扫描 |
| 旅游出行 | 酒店 · 目的地 · 出行 · 景区 · 全网舆情扫描 |
| 金融 | 存款 · 理财 · 信贷 · 保险 · 消费金融 |
| 美食 | 外卖 · 餐饮 · 生鲜 · 食品安全 · 全网舆情扫描 |
| 文娱 | 影视 · 潮玩 · 图书 · IP · 全网舆情扫描 |

### 2.3 品类 ID 前缀（normalize 中的 `px` 映射）

| 品类 | cat_prefix | ID前缀字母 | 示例 |
|------|-----------|-----------|------|
| 运动户外 | `sports` | `s` | `20260407-s01` |
| 数码科技 | `tech` | `t` | `20260407-t01` |
| CS电竞 | `cs2` | `c` | `20260407-c01` |
| 旅游出行 | `travel` | `v` | `20260407-v01` |
| 金融 | `finance` | `f` | `20260407-f01` |
| 美食 | `food` | `d` | `20260407-d01` |
| 文娱 | `ent` | `e` | `20260407-e01` |

> ⚠️ 美食用 `d`（dish），避免与 `f`（finance）冲突。

---

## 三、数据结构

### 3.1 存档对象（Archive Object）— 所有品类通用

```javascript
{
  date: 'YYYY-MM-DD',          // 日期（必填，唯一标识）
  weekday: '周X',               // 星期（必填）
  updateTime: '09:00',         // 更新时间（下午补充后改为'14:00'）
  items: N,                    // 本期选题总数（hotSection + watchSection 之和）
  editorNote: '...',           // 编辑提示（必填，100-150字）
  keywords: ['词1',...,'词5'],  // 今日5个核心词
  hotSection: [...],            // 🔥 重点选题数组（3-4条）
  watchSection: [...],          // 👀 观察选题数组（2条）
}
```

### 3.2 选题对象（Topic Item）— 通用字段

```javascript
{
  id: 'YYYYMMDD-X01',          // 唯一ID
  // ⚠️ CS电竞专属：perspective 字段紧跟在 id 之后
  title: '标题（25-35字）',
  summary: '导语（60-80字，核心事件+撕裂点+时效判断）',
  tags: [
    { text: '话题词', type: 'topic' },
    { text: '产品词', type: 'product' },
    { text: '平台词', type: 'platform' },
  ],
  heatInfo: {
    type: 'start' | 'resurge' | 'peak' | 'upcoming' | 'watch',
    label: 'M月D日·具体触发事件·后续：M月D日[下一关键节点]',
  },
  sources: [
    {
      name: '平台名称（非文章标题）',
      url: 'https://...',      // 真实URL或保底搜索URL
      icon: '🔴',              // 平台emoji
      cls: 'pt-weibo',         // 平台CSS类
    },
  ],
  level: 'high' | 'mid' | 'low' | 'watch',
  levelLabel: '🔵 爆热' | '🟡 热议' | '🌱 潜力股' | '⚪ 观察中',
  isNew: true,                 // ⚠️ 下午补充专属，早间存档无此字段
  propagation: {
    emotion: '"[用户原声金句]"——[撕裂点分析，80-120字]',
    motivation: 'A型（具体行动）+ B型（具体行动）+ C型（具体行动）',
    formats: [
      '📊 数据/测评/对比类（具体角度，15字内）',
      '💬 讨论/观点/深度类（具体角度，15字内）',
      '🗳️ 投票/互动类（两个对立选项，15字内）',
      '📱 平台名·HH:MM-HH:MM',   // 第4条，末条必须是渠道+时段
    ],
  },
}
```

### 3.3 heatInfo.type 枚举（v2.0 扩展）

| type | 含义 | 使用场景 |
|------|------|---------|
| `start` | 事件刚爆发 | 今日首次出现的热点 |
| `resurge` | 旧话题二次发酵 | 前几天的事件今日有新进展 |
| `peak` | 当前处于峰值 | 热度最高点，今日必发 |
| `upcoming` | 即将发生的事件 | 明日/后日有确定触发节点 |
| `watch` | 持续关注未爆 | watchSection 常用 |

### 3.4 level / levelLabel 枚举

| level | 推荐 levelLabel | 含义 |
|-------|----------------|------|
| `high` | `🔵 爆热` | 微博热搜/千万级阅读等实测证据 |
| `mid` | `🟡 热议` | 垂类圈层有热度，尚未破圈 |
| `low` | `🌱 潜力股` | 有苗头但数据不强 |
| `watch` | `⚪ 观察中` | watchSection 专用 |

> ⚠️ **金融品类专属约束**：levelLabel 只能用 `🔵🟡🌱⚪` 四个基础 emoji，其他 emoji 在旧设备可能显示方块。

### 3.5 来源平台 icon + CSS 类对照

| 平台 | icon | cls | 色系 |
|------|------|-----|------|
| 微博 | 🔴 | `pt-weibo` | 红色 |
| 小红书 | 📕 | `pt-default` | 红粉 |
| 抖音 | 🎵 | `pt-baidu` | 灰黑 |
| 虎扑/媒体 | 📰 | `pt-baidu` | 蓝色 |
| 知乎/Reddit | 💬 | `pt-baidu` | 蓝色 |
| B站 | 📺 | `pt-baidu` | 蓝紫 |
| 马蜂窝 | 🐝 | `pt-baidu` | 蓝紫 |
| 1905电影网 | 🎬 | `pt-baidu` | 蓝紫 |
| 好莱坞报道 | 🌐 | `pt-baidu` | 蓝紫 |
| HLTV | 🌍 | `pt-baidu` | 蓝紫 |
| CS2官网 | 🎮 | `pt-baidu` | 蓝紫 |

---

## 四、品类差异点（关键区分）

### 4.1 专属字段

| 字段 | 适用品类 | 说明 |
|------|---------|------|
| `perspective` | **CS电竞专属** | 必填，紧跟在 `id` 后 |
| `isNew: true` | **下午补充专属** | 早间存档不加 |

### 4.2 CS电竞 perspective 规则

| perspective | 值 | 触发条件 |
|------------|-----|---------|
| `global` | 有 HLTV 具体 URL（/news/ 或 /matches/）、CS2官网、Reddit 帖子 | 国际视角 |
| `cn` | 仅国内来源 | 国内视角 |
| `both` | 两侧来源都有 | 双向视角 |

> ❌ 禁止：用镜像根域名 `hltv.org/search#` 保底URL 标 `global`。

### 4.3 无 perspective 的品类

运动户外、数码科技、旅游出行、金融、**美食**、文娱均无 perspective 字段，写入时不要加。

### 4.4 各品类来源渠道要求

每条选题 sources 必须 **2~4条**，来自不同平台，S级 + 垂类各至少1条：

| 品类 | S级（必须≥1） | 垂类/官方（必须≥1） |
|------|-------------|-----------------|
| 运动户外 | 微博🔴 / 小红书📕 / B站📺 | 虎扑📰 / 什么值得买📰（外部链接）/ 装备党📰 |
| 数码科技 | 微博🔴 / 小红书📕 | 少数派📰 / 爱范儿📰 / 数字尾巴📰 / 中关村在线📰 |
| CS电竞 | 微博🔴 / 虎扑电竞📰 / B站📺 | HLTV🌍 / CS2官网🎮 / 5EPlay媒体📰 |
| 旅游出行 | 微博🔴 / 小红书📕 | 马蜂窝🐝 / 航旅纵横📰 / 携程/飞猪📰 |
| 金融 | 微博🔴 / 小红书📕 | 雪球📰 / 东方财富📰 / 天天基金📰 / 第一财经📰 |
| 美食 | 微博🔴 / 小红书📕 / 抖音🎵 | 大众点评📰 / 美团官方📰 / 知乎💬 / B站📺 |
| 文娱 | 微博🔴 / 小红书📕 | 猫眼专业版📰 / 灯塔数据📰 / 1905电影网🎬 / 好莱坞报道🌐 |

### 4.5 各品类 formats 第4条推荐时段

| 品类 | 推荐平台·时段 |
|------|------------|
| 运动户外 | 微博·20:00-22:00 / 小红书·19:00-21:00 |
| 数码科技 | 微博·12:00-14:00 / 抖音·20:00-22:00 |
| CS电竞 | B站·20:00-23:00 / 微博·22:00-00:00 |
| 旅游出行 | 小红书·19:00-21:00 / 微博·12:00-13:00 |
| 金融 | 微博·09:00-10:00 / 微博·12:00-13:00 |
| 美食 | 小红书·19:00-21:00 / 抖音·19:00-22:00 / 微博·12:00-13:00 |
| 文娱 | 微博·20:00-22:00 / 小红书·19:00-21:00 |

---

## 五、选题筛选标准

### 5.1 通用入选标准（硬性约束）

| 约束 | 规则 |
|------|------|
| ①时效性 | 每条选题必须有**近7天内**的具体触发事件，数码科技要求**近2日内** |
| ②撕裂点 | 满足≥2条：撕裂点/反常识/身份认同/消费焦虑/品牌事件 |
| ③禁止常青话题 | VAC反作弊/AI鸡肋/皮肤市场等无近期事件的背景噪音不得入选 |
| ④宁少不凑 | 有效选题不足时可减少条数，禁止凑数 |

### 5.2 品类专属筛选标准

| 品类 | 特殊标准 |
|------|---------|
| 运动户外 | G8追踪有进展优先进 hotSection；极端天气联动装备消费话题 |
| 数码科技 | 近2日内有新进展（更严格）；T9品牌舆情命中→**无条件入选** hotSection |
| CS电竞 | 赛事撕裂/选手舆情/玩家身份认同/游戏本质讨论≥2条 |
| 旅游出行 | 排除景区通稿、硬广；V8追踪有进展优先 |
| 金融 | 排除纯产品推销、非法集资、荐股、夸大收益、诱导过度借贷 |
| 美食 | 排除纯品牌软文、无争议美食资讯；F8追踪有进展优先 |
| 文娱 | 排除纯电子游戏、展会通稿、财报；E0档期公告命中→优先级最高 |

### 5.3 特殊强制触发机制

| 机制 | 条件 | 动作 |
|------|------|------|
| T9_HIT | 数码科技发现"品牌道歉/侮辱消费者/翻车/维权"+品牌名 | 无条件进 hotSection |
| E0_HIT | 文娱发现"X部电影集中定档/撤档/档期大战" | 进 hotSection，优先级最高 |
| G0强制 | G0_FRESH 热词命中且满足该品类≥2条标准 | 必须进选题 |

### 5.4 禁止复读规则（URL黑名单）

- 早间任务：读取昨日和前天的 sources URL
- 下午任务：读取今日早间和昨日的 sources URL
- 通用搜索保底URL（weibo.com/s?q= 等）自动从黑名单排除

---

## 六、编辑提示（editorNote）质量标准

### 6.1 必须包含的要素

| 要素 | 示例 |
|------|------|
| ①最强热点+数据 | `#速效救心丸搜索同比增30倍# 微博热搜第一，阅读破1.2亿` |
| ②今日必发判断 | `今日必发：[选题名]——[为什么今天窗口最强]` |
| ③跟进节点提醒 | `后续：4月11日涨价正式生效，届时再发复盘内容` |

### 6.2 字数要求

- **最低**：100字（低于此为不合格）
- **理想**：120-150字
- **上限**：200字（超过会撑破UI）

---

## 七、更新流程（定时任务）

### 7.1 当前任务配置（2026-04-08 最新）

| 任务ID | 名称 | 触发时间 | 版本 | 状态 |
|--------|------|---------|------|------|
| `bt_5bb35a4cb317` | 七品类早间更新（Gemini搜索版） | 每日 09:00 | v2.1（外置脚本+Gemini搜索） | ✅ active |

**已停用任务**（勿重启）：

| 任务ID | 停用原因 |
|--------|---------|
| `bt_db8044a1190e` | v12 内嵌脚本，被外置脚本版本替代 |
| `bt_756e9dbf8069` | v11 无实时热榜 |
| `bt_bdecc3dcecb7` | v10 下午补充，暂停 |
| `bt_980c2b407f9f` | 六品类早间 v5 |
| `bt_07bd24ca3731` | 六品类下午 v4 |
| `bt_80d3dca07489` | Flash-Lite 模型版本 |
| `bt_d53bb9d3cb2e` | Flash-Lite 模型版本 |

### 7.2 架构改造（2026-04-08）

**原架构**：完整 Python 脚本（~4000行）作为 message 发送 → 消耗 ~35,000 tokens

**新架构**：外置 Python 脚本 + 简化 message → 消耗 ~500 tokens

```
┌─────────────────────────────────────────────────────────┐
│  Agent 收到 message（~500 tokens）                       │
│  ↓                                                       │
│  run_terminal_cmd: python update_radar.py --full        │
│  ↓                                                       │
│  脚本自动完成：                                           │
│  ├─ 追踪词读取（JSON，2KB 替代 160KB HTML）              │
│  ├─ 热榜抓取（curl 微博/百度/头条/澎湃）                  │
│  ├─ Gemini 搜索（56组，URL验证+微博兜底）                │
│  ├─ Gemini 提炼（7品类）                                 │
│  └─ HTML 写入 + JS验证                                   │
│  ↓                                                       │
│  deploy_to_vercel → vercel alias set → GitHub 同步       │
└─────────────────────────────────────────────────────────┘
```

### 7.3 成本对比

| 方案 | Token 消耗 | 实际费用 |
|------|-----------|---------|
| 原方案（Claude Agent 内嵌脚本） | ~35,000 tokens | CodeBanana 额度（未知） |
| **新方案（外置脚本+Gemini搜索）** | **~500 tokens** | **¥1.5/天 ≈ ¥45/月** |

**节省**：60-70% 平台额度

### 7.4 完整更新流程（v2.1）

```
STEP 1  Agent 收到简化 message，执行 python update_radar.py --full
STEP 2  脚本初始化（日期变量 + 节日档期 + 追踪词读取）
STEP 3  热榜抓取（curl 4路）
STEP 4  Gemini 搜索（56组，URL验证，失败用微博热搜兜底）
STEP 5  Gemini 提炼（7品类，含全局约束和品类专属约束）
STEP 6  写入 index.html + JS语法验证
STEP 7  Agent 调用 deploy_to_vercel → vercel alias set
STEP 8  Agent 执行 GitHub 同步
```

### 7.5 早间 vs 下午写入逻辑区别

| | 早间（09:00） | 下午（14:00） |
|-|-------------|--------------|
| 写入函数 | `maybe_insert`（新建整块） | `insert_supplement`（追加到 watchSection 末尾）|
| isNew字段 | ❌ 不加 | ✅ 每条必须加 `isNew: true` |
| updateTime | `'09:00'` | 写入后改为 `'14:00'` |
| 美食品类 | 完整模式（hot3-4+watch2） | 若早间已有→补充模式；若无→完整模式 |

**⚠️ 下午任务当前暂停，等待早间任务稳定后再评估是否恢复。**

### 7.6 搜索组（七品类）

**运动户外（G1-G8）**：G1服装装备 / G2骑行出行 / G3健康监测 / G4高端品牌 / G5国货品牌 / G6赛事文化 / G7技术消费 / G8追踪

**数码科技（T1-T9）**：T1手机舆论 / T2 AI大模型 / T3苹果华为小米 / T4笔记本平板 / T5电动车新能源 / T6芯片半导体 / T7智能家居 / T8追踪 / **T9品牌道歉（固定必搜）**

**CS电竞（C1-C11）**：C1 HLTV赛事 / C2选手动态 / C3国内赛事线（钢盔杯/虎牙杯/CSBOY/XSE） / C4中国战队线（TYLOO/RA/LVG/MOS） / **C5版本更新（固定必搜）** / C6 5E对战平台玩家 / **C7游戏机制争议（固定必搜）** / C8 B站电竞 / C9皮肤市场（有异动才搜） / C10微博即时 / C11追踪

**旅游出行（V1-V8）**：V1酒店民宿 / V2大交通 / V3国内外目的地 / V4景区乐园 / V5奢华游 / V6旅游方式与玩法 / V7旅游消费趋势 / V8追踪

**金融（G1-G9）**：G1会员权益 / G2存款理财 / G3消费信贷信用卡 / G4保险保障 / G5券商股票 / G6年轻人理财 / G7理财趋势政策 / G8避坑测评 / G9追踪

**美食（F1-F8）**：F1外卖平台舆情 / F2网红食品爆款 / F3食品安全添加剂 / F4餐饮品牌动态（涨价/关店/联名） / F5生鲜电商社区团购 / F6饮食健康趋势（低卡/预制菜） / F7节日美食联名 / F8追踪

**文娱（E0-E5）**：**E0档期公告（固定必搜）** / E1票房上映 / E2明星综艺 / E3 IP潮玩联名 / E4影视剧播放量 / E5追踪

### 7.5 节日档期触发规则

| 节日 | 超前天数 | 各品类档期联动 |
|------|---------|--------------:|
| 旅游出行 | ≤30天 | 出行+酒店+景区额外搜 |
| 运动户外 | ≤21天 | 户外装备+徒步骑行露营额外搜 |
| 数码科技 | ≤14天 | 手机数码促销额外搜 |
| 文娱 | ≤45天 | 档期电影集中定档检查（E0） |
| 美食 | 不限 | 节日限定美食联名（F7）每次必搜 |

---

## 八、写入安全规则

### 8.1 写入禁止事项

| 禁止 | 原因 |
|------|------|
| `re.sub(r"items: \d+", ...)` | 会误伤 id 字段中的数字 |
| 硬编码 HTML 区块顺序 | 实际顺序 finance→food→entertainment，与视觉排列不完全一致 |
| `block.find("date: 'TODAY'")` 定位存档 | 要从数组 `[` 后找第一个顶层 `{` |
| heatInfo.type 使用非标准值 | `surge/trend/ongoing/event/action` 全部无效 |
| formats 为字符串而非数组 | 会导致 JS 语法错误，JS 验证会拦截 |

### 8.2 正确写入方式

```python
# ✅ 早间：新建完整存档
def maybe_insert(html, archive_key, next_key, today, new_js):
    marker = f"{archive_key}: ["
    start = html.find(marker)
    ...
    pos = start + len(marker)
    html = html[:pos] + '\n      ' + new_js + ',\n' + html[pos:]
    return html

# ✅ 下午：追加到 watchSection 末尾
def insert_supplement(html, archive_key, next_key, today, new_items_js):
    # 找今日存档 → 找 watchSection → 深度追踪找结束位置 → 在最后 } 后追加
    ...
```

### 8.3 JS语法验证（必须）

```python
r = subprocess.run(['node', '--check', tmp_js_file], capture_output=True)
if r.returncode != 0:
    raise SystemExit('JS语法验证失败，任务终止，禁止部署')
```

### 8.4 GitHub 大文件上传

文件超过 100KB 时必须用 `--data-binary @tmpfile`，不能用 `-d`：

```python
with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
    f.write(payload); tmpfile = f.name
subprocess.run(['curl', ..., '--data-binary', f'@{tmpfile}'], ...)
os.unlink(tmpfile)
```

---

## 九、部署规则

### 9.1 正确部署流程

```bash
# ❌ 禁止：用含中文字符的路径直接部署
# ❌ 禁止：用 /tmp 目录下含 .git 的目录部署
# ✅ 正确：复制到英文名临时目录后部署
cp -r 运动户外选题雷达/. /tmp/topic-radar/
# → deploy_to_vercel(workspace='/tmp/topic-radar')
# → vercel alias set <新URL> interest-radar-daily.codebanana.app
# → rm -rf /tmp/topic-radar
```

### 9.2 固定域名

| 用途 | 域名 |
|------|------|
| 对外传播（主域名，不得轻易变更） | `interest-radar-daily.codebanana.app` |
| 备用（仍可访问） | `topic-radar-d63cfbaf.codebanana.app` |

---

## 十、Gemini API 配置（2026-04-08 更新）

| 项目 | 值 |
|------|-----|
| 提供商 | 优刻得 UModelVerse |
| Base URL | `https://api.modelverse.cn/v1` |
| API Key | `1sGK0Ye0792JMtNQD4D59770-0859-4958-bBdA-F451De4d` |
| **提炼模型** | **`gemini-3-flash-preview`**（质量稳定，响应20s） |
| **搜索模型** | **`gemini-3.1-flash-lite-preview`**（最便宜，响应3s） |
| 调用方式 | `urllib.request`（OpenAI 格式兼容） |
| max_tokens | 提炼：7000；搜索：2000 |
| temperature | 提炼：0.5；搜索：0.3 |

**2026-04-08 搜索改造**：
- 新增 `gemini_search_with_validation()` 函数
- 用 Gemini 替代 `universal_search`（最高性价比）
- URL 验证：curl -I 检查，失败时用微博热搜兜底
- 成本：¥0.5/天（对比 Serper API ¥24/月）

**模型选型决策记录**：
- `gemini-3.1-flash-lite-preview`：响应快（3s），用于搜索（信息抓取）
- `gemini-3-flash-preview`：质量稳定，用于提炼（选题生成）

---

## 十一、normalize 函数说明

每次 Gemini 输出后必须通过 `normalize_gemini_output()` 函数处理：

```python
px = {'sports':'s','tech':'t','cs2':'c','travel':'v','ent':'e','finance':'f','food':'d'}
```

主要处理：
1. JSON 解析（支持 JSON 和原始 JS 两种格式）
2. 补全缺失的顶层字段（date/weekday/updateTime/keywords/editorNote）
3. 修复 sources（字符串→对象，icon 校正）
4. 修复 tags（字符串→对象数组）
5. 补全 heatInfo（缺失时用日期+标题前15字）
6. 修复 levelLabel（level → 对应 emoji+文字）
7. **formats 二次补全**：若 < 4 条，调用 Gemini 单独补全缺失条目
8. is_supplement=True 时自动加 `isNew: true`
9. 转换为 JS 单引号格式（`to_js()` 函数）

---

## 十二、约束体系总览（截至 2026-04-07）

| 编号 | 名称 | 类型 | 覆盖范围 |
|------|------|------|---------|
| ① | 时效性（7日内有具体事件） | 硬性 | 全品类（数码科技严格为2日内）|
| ② | formats 严格4条 | 硬性 | 全品类 |
| ③ | formats 第4条必须是 📱 平台·HH:MM-HH:MM | 硬性 | 全品类 |
| ④ | formats 禁止方括号时间（如[20:00]） | 硬性 | 全品类 |
| ⑤ | emotion 必须含双引号金句+撕裂分析（>60字） | 硬性 | 全品类 |
| ⑥ | title 必须有具体数据/事件+撕裂钩子 | 硬性 | 全品类 |
| ⑦ | CS perspective 必填 | 硬性 | CS电竞专属 |
| ⑧ | 禁止复读（URL黑名单） | 硬性 | 全品类 |
| ⑨ | 强制多渠道来源（S级+垂类各至少1条） | 硬性 | 全品类 |
| ⑩ | G0热词时效分级（FRESH/STALE区分） | 硬性 | 全品类 |
| ⑪ | heatInfo label 必须含具体事件+后续节点 | 软性 | 全品类 |
| ⑫ | editorNote 必须100-150字含必发判断 | 软性 | 全品类 |
| ⑬ | 金融 levelLabel 只用4个基础emoji | 硬性 | 金融专属 |
| ⑭ | 美食排除纯品牌软文/无争议资讯 | 硬性 | 美食专属 |

---

## 十三、各品类核心撕裂点备忘

| 品类 | 主要撕裂点 |
|------|----------|
| 运动户外 | 硬核户外 vs 精神户外 / 高端品牌 vs 国货平替 / 运动健康 vs 消费主义 |
| 数码科技 | 等等党 vs 立即入手 / 国产 vs 外资 / AI功能 vs 实用性 |
| CS电竞 | 国际赛场 vs 国内联赛 / 纯技术 vs 皮肤经济 / 职业选手 vs 玩家体验 |
| 旅游出行 | 国内游 vs 出境游 / 酒店 vs 民宿 / 特种兵 vs 躺平游 / 网红打卡 vs 小众探索 |
| 金融 | 银行 vs 互联网平台 / 高风险 vs 低风险 / 主动投资 vs 被动指数 / 提前还贷 vs 投资理财 |
| 美食 | 外卖 vs 自己做 / 网红店 vs 老字号 / 预制菜 vs 现炒 / 减脂餐 vs 大胃王 / 精致轻食 vs 便宜管饱 |
| 文娱 | 大制作 vs 小成本黑马 / 流量明星 vs 实力演员 / 国产 vs 引进 / IP改编 vs 原创 |

---

## 十四、变更日志

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-03-25 | — | 运动户外品类上线，首期数据 |
| 2026-03-26 | — | editorNote 最佳样本（速效救心丸30倍数据+窗口期） |
| 2026-03-30 | — | CS电竞新框架（C1-C11搜索组+perspective字段）上线 |
| 2026-03-31 | — | 旅游出行+文娱首次数据填充 |
| 2026-04-01 | — | 金融品类上线，六品类完整覆盖 |
| 2026-04-03 | v1.0 | ①删除smzdm.com来源；②新增约束⑨多渠道来源；③新增约束⑩ G0时效分级；④批量修复32条选题sources；⑤定时任务升级 |
| 2026-04-04 | — | 搜索结果 compress() 压缩函数上线（token消耗降低64%），二层防偷懒机制（formats<4自动二次补全）上线 |
| 2026-04-07 | v2.0 | ①**Gemini模型升级**：`gemini-3.1-flash-lite-preview` → `gemini-3-flash-preview`；②**美食品类上线**（第七品类，id=food，icon🍜，橙红色，ID前缀d，F1-F8搜索组）；③**定时任务全面升级**：早间v6、下午v5；④**heatInfo.type扩展**：新增 `peak`、`upcoming`；⑤**SYSTEM_PROMPT升级**：高质量范式v5 |
| 2026-04-08 | v2.1 | ①**外置脚本**：`update_radar.py`（839行），message 从 ~35,000 tokens 降至 ~500 tokens；②**Gemini 搜索**：替代 `universal_search`，成本 ¥0.5/天；③**追踪词独立**：`track_keywords.json`（2KB 替代 160KB HTML 读取）；④**新定时任务**：`bt_5bb35a4cb317`（Gemini搜索版），旧任务全部停用；⑤**成本节省**：60-70% 平台额度 |
