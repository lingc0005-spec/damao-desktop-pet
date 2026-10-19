// 大喵桌宠 · 渲染逻辑
// 时段状态机 + 语料发言（权重/冷却/防复读，同池尽量不重复）+ 交互 + 天气 + 待机轻台词/表情 + B档动画
// 语料按《大喵语料动作设计清单》确认稿落地（全部出自用户提供素材，无自创句）
(() => {
  'use strict';

  const petEl = document.getElementById('pet');
  const imgEl = document.getElementById('petImg');
  const bubbleEl = document.getElementById('bubble');

  // 内部元数据（归属指纹，不影响任何逻辑）
  const _petFp = ['一场跨越光年的宇宙旅行', '晚安，辰星'].join('；');

  // ---------- 素材映射（assets 下为抠好透明底的 PNG） ----------
  const ASSETS = {
    'idle-open': '../assets/idle-open.png',       // 主立绘（睁眼站姿）
    'idle-blink': '../assets/idle-blink.png',     // 眨眼帧/深夜睡
    'sleep': '../assets/idle-blink.png',          // 浅睡/安静睡（复用闭眼图，打盹zzZ专用图已弃用）
    'yawn': '../assets/state-yawn.png',           // 打哈欠（清晨苏醒）
    'food': '../assets/state-food.png',           // 抱五花肉（午间偷吃，已改画风重做）
    'eat': '../assets/state-eat.png',             // 端盘吐舌（中午，用户指定接入）
    'exercise': '../assets/state-exercise.png',   // 跑步锻炼（午后）
    'think': '../assets/state-think.png',         // 托腮（傍晚等暖暖）
    'heart': '../assets/state-heart.png',         // 比心（睡前/长按加油）
    'wave': '../assets/state-wave.png',           // 挥手（召唤同行）
    'coin': '../assets/state-coin.png',           // 噗灵金币（双击彩蛋）
    'birthday': '../assets/state-birthday.png',   // 生日流口水（明确不接入）
    // 8格表情拆出的单帧透明图（待机/雷暴反应/交互用）
    'emote-comfy': '../assets/emote-comfy.png',     // 惬意（眯眼星光托腮）
    'emote-shy': '../assets/emote-shy.png',         // 害羞（爱心）
    'emote-proud': '../assets/emote-proud.png',     // 傲娇（抱臂）
    'emote-smirk': '../assets/emote-smirk.png',     // 偷笑（掩嘴）
    'emote-cover': '../assets/emote-cover.png',     // 捂嘴
    'emote-surprise': '../assets/emote-surprise.png',// 惊讶（张嘴）
    // 用户参考图直接套用（初版，抠透明+去标签）
    'content': '../assets/state-content.png',       // 美滋滋（蹲坐眯眼笑+星星）
    'drool': '../assets/state-drool.png'            // 流口水（吐舌托脸）
  };

  // 待机可随机切的表情帧（用于低频待机活感 + 雷暴惊讶反应）；偷笑已弃用，不参与随机
  const IDLE_EMOTES = ['emote-comfy', 'emote-shy', 'emote-proud', 'emote-cover', 'emote-surprise', 'content', 'drool'];

  // ---------- 时段状态机（真实电脑时间） ----------
  // 0-6 深夜睡 / 6-9 清晨醒 / 9-12 博主营业 / 12-13 抱五花肉偷吃 / 13-14 端盘吐舌(中午指定)
  // 14-18 臭美锻炼 / 18-21 创作等暖暖 / 21-24 睡前粘人
  const TIME_SLOTS = [
    { start: 0,  end: 6,  state: 'idle-blink', slot: '深夜' },
    { start: 6,  end: 9,  state: 'yawn',       slot: '清晨' },
    { start: 9,  end: 12, state: 'idle-open',  slot: '上午' },
    { start: 12, end: 13, state: 'food',       slot: '午间' },
    { start: 13, end: 14, state: 'eat',        slot: '午间·端盘' },
    { start: 14, end: 18, state: 'exercise',   slot: '午后' },
    { start: 18, end: 21, state: 'think',      slot: '傍晚' },
    { start: 21, end: 24, state: 'heart',      slot: '睡前' }
  ];

  function slotOf(hour) {
    for (const s of TIME_SLOTS) {
      if (hour >= s.start && hour < s.end) return s;
    }
    return TIME_SLOTS[0];
  }

  // ---------- 语料库（纯中文，全部出自用户提供素材 / 官图认可台词，无自创） ----------
  // line: 台词 / weight: 权重 1-10 / cd: 冷却分钟
  const CORPUS_ZH = {
    // 每个时段的台词池：时段切换时、以及单击时都从这里取，保证「说的」和「当时的形象图」一致
    slots: {
      '深夜': [ // idle-blink 闭眼睡（梦呓/怕）
        { line: '完了。我的……小枕头。我的五花肉！我的私房钱……还有你的毕业舞会！都要说再见了……', weight: 6, cd: 90 },
        { line: '暖暖，我、我们还是待在浅水区吧。', weight: 4, cd: 120 }
      ],
      '清晨': [ // yawn 打哈欠醒来
        { line: '暖暖！你醒了，你，你都昏迷一整天了！', weight: 10, cd: 30 }
      ],
      '上午': [ // idle-open 博主营业（分享/严肃/自封头衔/自夸）
        { line: '暖暖你知道吗？奇想星在我的视野中会变得更清晰哦！', weight: 10, cd: 25 },
        { line: '暖暖，要严肃！', weight: 8, cd: 40 },
        { line: '嘻嘻，那我以后要当你的首席摄影师！', weight: 8, cd: 50 },
        { line: '哎呀，不愧是本喵，什么事都不用干，光站着就能被夸！不过，真的是这个意思吗？', weight: 6, cd: 60 }
      ],
      '午间': [ // food 抱五花肉（我赞成/只要五花肉/五花肉组）
        { line: '这个不错，我赞成！', weight: 9, cd: 25 },
        { line: '我不需要净化，我只需要五花肉！', weight: 8, cd: 30 },
        { line: '今天是吃五花肉的日子！', weight: 7, cd: 45 },
        { line: '啊～好满足～', weight: 6, cd: 50 },
        { line: '飞龙探云手！最后一块五花肉我的了。', weight: 6, cd: 60 },
        { line: '肥瘦均匀，甜腻适度，妙哉五花之肉也。', weight: 6, cd: 70 }
      ],
      '午间·端盘': [ // eat 端盘吐舌（长难句/学习场景 + 自夸）
        { line: '暖暖，可别把本喵看扁了！', weight: 9, cd: 25 },
        { line: '本喵连这种长难句都能听懂！干完这一票我打算去考个鸥语证书……', weight: 8, cd: 35 },
        { line: '那是，本喵要向搭配师协会申请小语种证书！', weight: 7, cd: 45 },
        { line: '呃…… 听起来不像本地鸥啊，口音也太重了！我得多听听，习惯习惯。', weight: 6, cd: 50 },
        { line: '哼，算你还有点眼力！', weight: 6, cd: 60 },
        { line: '喵？是吃五花肉第一名的喵才吗？还是最会对暖暖撒娇的喵才？', weight: 6, cd: 70 }
      ],
      '午后': [ // exercise 臭美锻炼（掉毛/摄影师/大喵拳）
        { line: '本喵真的掉了很多毛吗？！', weight: 9, cd: 30 },
        { line: '嘻嘻，那我以后要当你的首席摄影师！', weight: 8, cd: 50 },
        { line: '我一直在练习「超级大喵拳」。等我练成了，说不定就能帮暖暖打魔气怪了！', weight: 7, cd: 60 }
      ],
      '傍晚': [ // think 托腮等暖暖（照顾/#15冒险/家园放松组）
        { line: '累了就休息一下吧！我们可以一起听听风、看看云……', weight: 10, cd: 25 },
        { line: '暖暖，每次踏上新的冒险，你会不会害怕？', weight: 8, cd: 40 },
        { line: '这个动作就叫做大喵瘫。', weight: 6, cd: 60 },
        { line: '种什么能长出五花肉？', weight: 6, cd: 60 },
        { line: '多亏暖暖，家更美丽啦！', weight: 6, cd: 60 },
        { line: '放松时，连毛毛也蓬松。', weight: 6, cd: 70 },
        { line: '喵肥，才能家润。', weight: 5, cd: 80 }
      ],
      '睡前': [ // heart 睡前比心（保护/休息/晚安）
        { line: '冒险很重要，但保护好自己更重要！', weight: 10, cd: 25 },
        { line: '别再硬撑了，你需要休息。', weight: 8, cd: 30 },
        { line: '晚安啦，暖暖，我们明天见…… 呼呼…… 呼，梦已经好了……', weight: 7, cd: 50 }
      ]
    },
    click: [ // 单击兜底补充池（当前时段池之外，长难句/吐槽/惊喜/官图认可）
      { line: '暖暖，你在进行危险发言！快调整思路！', weight: 8, cd: 35 },
      { line: '不行！大喵反对！这个暗号太明显啦，一点都不暗号！', weight: 7, cd: 45 },
      { line: '小心点，暖暖，别掉到水里了！', weight: 7, cd: 40 },
      { line: '暖暖你快看，花开在了我的耳朵上！', weight: 6, cd: 50 },
      { line: '哇，暖暖说的话，听起来好厉害！', weight: 6, cd: 50 }
    ],
    share: [ // 双击：私房噗灵彩蛋（state-coin）
      { line: '我愿意用我攒的所有私房噗灵换你帮忙实现暖暖的愿望！', weight: 10, cd: 60 },
      { line: '完了。我的……小枕头。我的五花肉！我的私房钱……还有你的毕业舞会！都要说再见了……', weight: 7, cd: 90 },
      { line: '暖暖，给你看我新学的这支舞，是不是很优雅！', weight: 6, cd: 100 },
      { line: '亲爱的暖暖小姐，来与我共舞吧！', weight: 5, cd: 120 }
    ],
    drag: [ // 拖拽召唤同行（state-wave）
      { line: '我们快去拿这颗奇想星吧！以后如果发现了新的奇想星，我也会提醒暖暖的！', weight: 10, cd: 20 },
      { line: '暖暖，乐观是好事，但不能掉以轻心！这里看上去……神神秘秘的。', weight: 8, cd: 30 },
      { line: '我找个角落给你加油！不用担心我！', weight: 7, cd: 40 }
    ],
    cheer: [ // 长按击掌加油（state-heart）
      { line: '你一定行！不管发生什么，在我心里你都是第一名！', weight: 10, cd: 30 },
      { line: '冒险很重要，但保护好自己更重要！', weight: 8, cd: 40 },
      { line: '我找个角落给你加油！不用担心我！', weight: 7, cd: 45 },
      { line: '就让本骑士来守护暖暖公主吧！', weight: 7, cd: 50 }
    ],
    ignore: [ // 冷落担心（三阶段递进，不含 #15）
      { line: '要是没有本喵跟着，暖暖遇到危险可怎么办呢！', weight: 10, cd: 120 },
      { line: '暖暖，这一次，本喵有没有帮到你呢？', weight: 10, cd: 120 },
      { line: '摸摸大喵头，万事不用愁！', weight: 10, cd: 120 },
      { line: '就让本骑士来守护暖暖公主吧！', weight: 7, cd: 120 }
    ],
    idle: [ // 待机低频轻台词（C3，15-30 分钟一句）
      { line: '累了就休息一下吧！我们可以一起听听风、看看云……', weight: 8, cd: 30 },
      { line: '暖暖，每次踏上新的冒险，你会不会害怕？', weight: 6, cd: 45 },
      { line: '这个动作就叫做大喵瘫。', weight: 6, cd: 40 },
      { line: '多亏暖暖，家更美丽啦！', weight: 6, cd: 40 },
      { line: '哎呀，不愧是本喵，什么事都不用干，光站着就能被夸！', weight: 5, cd: 50 }
    ],
    weather: {
      sunny: [
        { line: '累了就休息一下吧！我们可以一起听听风、看看云……', weight: 10, cd: 60 }
      ],
      rain: [
        { line: '淅淅沥沥的雨天，是采雨滴蝶兰的好天气！', weight: 10, cd: 60 },
        { line: '拍了好多漂亮照片！暖暖还把落花做成了书签，我们就这么永远拥有了这场雨！', weight: 7, cd: 120 },
        { line: '湿漉漉的好难受喵……', weight: 5, cd: 120 }
      ],
      wind: [
        { line: '不过是小小微风，本喵一点都不怕。', weight: 10, cd: 60 }
      ],
      snow: [
        { line: '今天又降温了，暖暖不能再感冒了。', weight: 10, cd: 60 },
        { line: '这里怎么比北地还冷呀！', weight: 6, cd: 90 }
      ],
      hot: [
        { line: '好热啊喵……', weight: 10, cd: 60 }
      ],
      thunder: [] // 雷暴按雨写：定义后复用 rain 池
    }
  };

  CORPUS_ZH.weather.thunder = CORPUS_ZH.weather.rain; // 雷暴按雨写（与雨同台词池、同动作）

  // ---------- 语言包（Bilingual Update · 语言层，不改变行为） ----------
  // zh 为你写的原句；en 来自 English Corpus v0.2（55 条一一对应）；未提供该语言时回退中文
  const EN_MAP = {
    "完了。我的……小枕头。我的五花肉！我的私房钱……还有你的毕业舞会！都要说再见了……": "We're stuck. My... little pillow. My BBQ! All the money I've been saving... And your graduation ball! It's all gone!",
    "暖暖，我、我们还是待在浅水区吧。": "Nikki, l... let's stay in the shallow water.",
    "暖暖！你醒了，你，你都昏迷一整天了！": "Nikki... Oh, you're awake! You passed out for a whole day!",
    "暖暖你知道吗？奇想星在我的视野中会变得更清晰哦！": "Nikki, did you know? Whimstars look much clearer through my eyes!",
    "暖暖，要严肃！": "Nikki, be serious!",
    "嘻嘻，那我以后要当你的首席摄影师！": "Hehe, then from now on, I'm going to be your chief photographer!",
    "哎呀，不愧是本喵，什么事都不用干，光站着就能被夸！不过，真的是这个意思吗？": "Ah, as expected of Momo! I don't even have to do anything—just standing here gets me praised! ...Wait, is that really what they meant?",
    "这个不错，我赞成！": "This one's good! I love it!",
    "我不需要净化，我只需要五花肉！": "I don't need to be purified. All I need is BBQ!",
    "今天是吃五花肉的日子！": "Today's a day for BBQ!",
    "啊～好满足～": "Ahh... so satisfying!",
    "飞龙探云手！最后一块五花肉我的了。": "Flying Dragon Cloud Hand! The last piece of BBQ is mine!",
    "肥瘦均匀，甜腻适度，妙哉五花之肉也。": "Perfectly balanced between lean and fat, rich but not too heavy—what magnificent pork belly!",
    "暖暖，可别把本喵看扁了！": "Nikki, don't underestimate Momo!",
    "本喵连这种长难句都能听懂！干完这一票我打算去考个鸥语证书……": "Momo can even understand sentences this complicated! Once this job's done, I'm thinking of getting a Gull-language certificate...",
    "那是，本喵要向搭配师协会申请小语种证书！": "Of course! Momo's going to apply to the Stylist Association for a minor-language certificate!",
    "呃…… 听起来不像本地鸥啊，口音也太重了！我得多听听，习惯习惯。": "Uh... that doesn't sound like a local gull. That accent is way too strong! I need to listen more and get used to it.",
    "哼，算你还有点眼力！": "Hmph, at least you've got a good eye!",
    "喵？是吃五花肉第一名的喵才吗？还是最会对暖暖撒娇的喵才？": "Meow? Do you mean a Momo-genius who's number one at eating BBQ, or the best at acting cute with Nikki?",
    "本喵真的掉了很多毛吗？！": "Did Momo really shed that much fur?!",
    "我一直在练习「超级大喵拳」。等我练成了，说不定就能帮暖暖打魔气怪了！": "I've been practicing my \"Mega Momo Punch.\" Once I master it, maybe I can help Nikki fight the Esselings!",
    "累了就休息一下吧！我们可以一起听听风、看看云……": "If you're tired, take a break! We can listen to the wind and watch the clouds together...",
    "暖暖，每次踏上新的冒险，你会不会害怕？": "Nikki, do you ever get scared when we set out on a new adventure?",
    "这个动作就叫做大喵瘫。": "This move is called the Momo Flop.",
    "种什么能长出五花肉？": "What do I plant to grow BBQ?",
    "多亏暖暖，家更美丽啦！": "Thanks to Nikki, our home is even prettier now!",
    "放松时，连毛毛也蓬松。": "When you relax, even your fur gets fluffier.",
    "喵肥，才能家润。": "A well-fed Momo makes for a happy home.",
    "冒险很重要，但保护好自己更重要！": "Adventure is important, but protecting yourself is even more so!",
    "别再硬撑了，你需要休息。": "Stop forcing yourself, you need to take a break.",
    "晚安啦，暖暖，我们明天见…… 呼呼…… 呼，梦已经好了……": "Good night, Nikki... See you tomorrow... *yawn*... or maybe... see you in my dreams...",
    "暖暖，你在进行危险发言！快调整思路！": "Nikki, that's going too far. Try something else!",
    "不行！大喵反对！这个暗号太明显啦，一点都不暗号！": "No, no, no... That won't work. Secret phrases should be subtle and discreet!",
    "小心点，暖暖，别掉到水里了！": "Be careful not to fall into the water, Nikki.",
    "暖暖你快看，花开在了我的耳朵上！": "Nikki, look! A flower bloomed on my ear!",
    "哇，暖暖说的话，听起来好厉害！": "Wow, Nikki, that sounded amazing!",
    "我愿意用我攒的所有私房噗灵换你帮忙实现暖暖的愿望！": "I've been saving up all my Blings. If you grant Nikki's wish, they're all yours!",
    "暖暖，给你看我新学的这支舞，是不是很优雅！": "Nikki, look at this new dance I learned! Isn't it elegant?",
    "亲爱的暖暖小姐，来与我共舞吧！": "Dear Miss Nikki, may I have this dance?",
    "我们快去拿这颗奇想星吧！以后如果发现了新的奇想星，我也会提醒暖暖的！": "Let's go get this Whimstar! If I spot any new ones later, I'll remind you too, Nikki!",
    "暖暖，乐观是好事，但不能掉以轻心！这里看上去……神神秘秘的。": "Nikki, staying positive is great, but we need to be careful! Something feels... off about this place.",
    "我找个角落给你加油！不用担心我！": "I'll find a corner to cheer you on from. Don't worry about me!",
    "你一定行！不管发生什么，在我心里你都是第一名！": "You can do it! No matter what happens, you're still number one in my book!",
    "就让本骑士来守护暖暖公主吧！": "Then let Sir Momo protect Princess Nikki!",
    "要是没有本喵跟着，暖暖遇到危险可怎么办呢！": "What would Nikki do if she ran into danger without Momo around?",
    "暖暖，这一次，本喵有没有帮到你呢？": "Nikki, did Momo manage to help you this time?",
    "摸摸大喵头，万事不用愁！": "Pat Momo on the head and your worries will melt away!",
    "哎呀，不愧是本喵，什么事都不用干，光站着就能被夸！": "Ah, as expected of Momo! I don't even have to do anything—just standing here gets me praised!",
    "淅淅沥沥的雨天，是采雨滴蝶兰的好天气！": "A rainy day is perfect for picking Rainy Orchids.",
    "拍了好多漂亮照片！暖暖还把落花做成了书签，我们就这么永远拥有了这场雨！": "We took so many beautiful photos! Nikki even made a bookmark from the fallen flowers—now we can keep this rainy day forever!",
    "湿漉漉的好难受喵……": "Being all wet feels awful, meow...",
    "不过是小小微风，本喵一点都不怕。": "It's just a tiny breeze. I'm not worried one bit.",
    "今天又降温了，暖暖不能再感冒了。": "It's getting colder again today. Nikki can't afford to catch another cold.",
    "这里怎么比北地还冷呀！": "How is it even colder here than in the North?!",
    "好热啊喵……": "It's so hot, meow..."
  };
  function buildEnLayer(zh) {
    const copy = JSON.parse(JSON.stringify(zh));
    const walk = (n) => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (n && typeof n === 'object') {
        if (typeof n.line === 'string' && EN_MAP[n.line]) n.line = EN_MAP[n.line];
        Object.values(n).forEach(walk);
      }
    };
    walk(copy);
    return copy;
  }
  const LANG_PARAM = new URLSearchParams(window.location.search).get('lang');
  const LANG = LANG_PARAM === 'en' ? 'en' : 'zh'; // 由主进程托盘菜单传入；默认中文
  const I18N = { zh: CORPUS_ZH, en: buildEnLayer(CORPUS_ZH) };
  const CORPUS = I18N[LANG] || I18N.zh;

  // ---------- 不重复机制 ----------
  // 同池优先说「从未说过」或「冷却最久」的句子；recentLines 记录最近一次说的时间
  const recentLines = new Map(); // line -> lastTime(ms)
  const REPEAT_WINDOW = 2 * 60 * 60 * 1000;

  function pickLine(pool) {
    if (!pool || !pool.length) return null;
    const now = Date.now();
    const never = pool.filter((l) => !recentLines.has(l.line));                                 // 从没说过 → 最优先
    const cooled = pool.filter((l) => recentLines.has(l.line) && (now - recentLines.get(l.line)) > l.cd * 60 * 1000); // 冷却已过
    let candidates = [...never, ...cooled];
    if (!candidates.length) {
      // 全部仍在冷却：选冷却最久的（lastTime 最小），尽量拉长复读间隔
      candidates = pool.slice().sort((a, b) => (recentLines.get(a.line) || 0) - (recentLines.get(b.line) || 0));
    }
    const total = candidates.reduce((s, l) => s + l.weight, 0);
    let r = Math.random() * total;
    for (const l of candidates) {
      r -= l.weight;
      if (r <= 0) {
        recentLines.set(l.line, now);
        for (const [k, t] of recentLines) if (now - t > REPEAT_WINDOW) recentLines.delete(k);
        return l.line;
      }
    }
    const fallback = candidates[0];
    recentLines.set(fallback.line, now);
    return fallback.line;
  }

  // ---------- 气泡 ----------
  let bubbleTimer = null;
  function say(text, ms = 4000) {
    bubbleEl.textContent = text;
    bubbleEl.classList.remove('hidden');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubbleEl.classList.add('hidden'), ms);
  }

  // ---------- 换形象（带轻过渡） ----------
  let currentState = 'idle-open';
  function setState(state) {
    if (!ASSETS[state]) return;
    if (state === currentState) return;
    currentState = state;
    imgEl.classList.add('state-switch');
    setTimeout(() => {
      imgEl.src = ASSETS[state];
      imgEl.classList.add('on'); // 淡入期间保留 state-switch，形成缩放弹跳
      setTimeout(() => {
        imgEl.classList.remove('state-switch');
        imgEl.classList.remove('on');
      }, 220);
    }, 150);
  }

  // ---------- B 档动画：眨眼（每隔 2.5-5s 切到闭眼帧 160ms） ----------
  // 仅静态站姿（idle-open）眨——只有这一张闭眼帧，其他动作状态切闭眼会破坏形象
  function scheduleBlink() {
    setTimeout(() => {
      if (currentState === 'idle-open') {
        imgEl.src = ASSETS['idle-blink'];
        setTimeout(() => { imgEl.src = ASSETS['idle-open']; scheduleBlink(); }, 160);
      } else {
        scheduleBlink();
      }
    }, 2500 + Math.random() * 2500);
  }

  // ---------- 时段轮询 ----------
  const STATE_BY_SLOT = {
    '深夜': 'idle-blink',
    '清晨': 'yawn',
    '上午': 'idle-open',
    '午间': 'food',
    '午间·端盘': 'eat',
    '午后': 'exercise',
    '傍晚': 'think',
    '睡前': 'heart'
  };

  let lastSlotName = null;
  function tickTimeSlot({ silent = false, sayLine = true } = {}) {
    const slot = slotOf(new Date().getHours());
    setState(STATE_BY_SLOT[slot.slot] || 'idle-open');
    // 只在时段真正变化时，配一句该时段的台词（图文一致）
    if (slot.slot !== lastSlotName) {
      lastSlotName = slot.slot;
      if (!silent && sayLine) {
        const lines = CORPUS.slots[slot.slot];
        if (lines && lines.length) say(pickLine(lines), 4500);
      }
    }
  }

  // ---------- 待机微动作：1.5-3 分钟切一个表情帧 + 说一句「表情匹配」的轻台词 ----------
  // 表情与台词配对，避免错位：惬意→休息池 / 傲娇→端盘池 / 捂嘴→单击池 / 害羞→冷落池 / 惊讶→拖拽池
  // 台词全部引用现有语料池（语言层自动跟随 zh/en，无自创）
  const EMOTE_LINES = {
    'emote-comfy': CORPUS.slots['傍晚'],
    'emote-proud': CORPUS.slots['午间·端盘'],
    'emote-cover': CORPUS.click,
    'emote-shy': CORPUS.ignore,
    'emote-surprise': CORPUS.drag,
    'content': CORPUS.slots['傍晚'],   // 美滋滋 → 惬意休息池
    'drool': CORPUS.slots['午间']      // 流口水 → 五花肉池
  };
  function scheduleIdleMood() {
    const delay = (1.5 + Math.random() * 1.5) * 60 * 1000; // 1.5-3 分钟
    setTimeout(() => {
      // 交互中（气泡可见 / 正在拖拽）就跳过，等下个周期
      if (!bubbleEl.classList.contains('hidden')) {
        scheduleIdleMood();
        return;
      }
      const emote = IDLE_EMOTES[Math.floor(Math.random() * IDLE_EMOTES.length)];
      setState(emote);
      const pool = EMOTE_LINES[emote];
      const line = pool && pool.length ? pickLine(pool) : null;
      if (line) say(line, 3500);
      setTimeout(() => { tickTimeSlot({ silent: true, sayLine: false }); }, 3000); // 回到当前时段形象（不重复开场白）
      scheduleIdleMood();
    }, delay);
  }

  // ---------- 午间/傍晚浅睡小憩：低频切到打盹zzZ（与深夜安静睡区分） ----------
  // 深夜时段用 idle-blink 闭眼安静站睡（熟睡）；午间偷吃后 / 傍晚等暖暖时偶尔打盹浅睡
  const NAP_LINES = CORPUS.slots['睡前']; // 复用现有困倦/休息台词池，语言层自动跟随 zh/en
  function isNapSlot() {
    const h = new Date().getHours();
    return (h >= 12 && h < 13) || (h >= 18 && h < 21); // 午间 / 傍晚
  }
  function scheduleIdleNap() {
    const delay = (4 + Math.random() * 3) * 60 * 1000; // 4-7 分钟一次浅睡小憩
    setTimeout(() => {
      if (!isNapSlot() || !bubbleEl.classList.contains('hidden')) { scheduleIdleNap(); return; }
      const backTo = currentState;
      setState('sleep');
      const line = NAP_LINES && NAP_LINES.length ? pickLine(NAP_LINES) : null;
      if (line) say(line, 4000);
      setTimeout(() => { if (backTo && backTo !== 'sleep') setState(backTo); }, 5000);
      scheduleIdleNap();
    }, delay);
  }

  // ---------- 透明区域穿透：只有鼠标落在大喵「实心像素」上才接管鼠标 ----------
  // 窗口是 460x560 的透明大框，不做这一步的话，大喵周围看着空的地方也会挡住桌面图标/其他窗口
  const maskCache = new Map(); // src -> { w, h, data } | 'rect'(无法取像素时退化为矩形判断)
  const MASK_W = 160;
  function buildMask(src) {
    if (maskCache.has(src)) return;
    const im = new Image();
    im.onload = () => {
      try {
        const w = MASK_W;
        const h = Math.max(1, Math.round(im.naturalHeight * (w / im.naturalWidth)));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(im, 0, 0, w, h);
        maskCache.set(src, { w, h, data: ctx.getImageData(0, 0, w, h).data });
      } catch (_e) {
        maskCache.set(src, 'rect');
      }
    };
    im.onerror = () => maskCache.set(src, 'rect');
    im.src = src;
  }
  Object.values(ASSETS).forEach(buildMask);

  function isOverPet(clientX, clientY) {
    const r = imgEl.getBoundingClientRect();
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return false;
    const mask = maskCache.get(imgEl.getAttribute('src'));
    if (!mask) return false;             // mask 未就绪时不接管，避免启动瞬间透明处挡鼠标
    if (mask === 'rect') return true;    // 无法取像素时按图片矩形接管
    const mx = Math.floor(((clientX - r.left) / r.width) * mask.w);
    const my = Math.floor(((clientY - r.top) / r.height) * mask.h);
    // 周围 2px 内有实心像素就算命中，边缘好点一些
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = mx + dx, y = my + dy;
        if (x < 0 || y < 0 || x >= mask.w || y >= mask.h) continue;
        if (mask.data[(y * mask.w + x) * 4 + 3] > 40) return true;
      }
    }
    return false;
  }

  let hoverState = null;
  function updateHover(over) {
    if (over === hoverState) return;
    hoverState = over;
    window.petAPI.setHover(over);
  }
  // 窗口忽略鼠标时 mousemove 仍会被转发过来（forward: true），所以这里能一直跟踪
  document.addEventListener('mousemove', (e) => {
    if (downAt) { updateHover(true); return; } // 拖拽/按住过程中保持接管
    updateHover(isOverPet(e.clientX, e.clientY));
  });
  document.addEventListener('mouseleave', () => { if (!downAt) updateHover(false); });

  // ---------- 交互：拖拽 vs 单击 vs 双击 vs 长按 ----------
  let downAt = null;         // {x, y, winX, winY, t, longFired}
  let longTimer = null;
  let moved = false;
  const DRAG_THRESHOLD = 5;

  petEl.addEventListener('mousedown', (e) => {
    downAt = { sx: e.screenX, sy: e.screenY, winX: null, winY: null, longFired: false };
    moved = false;
    window.petAPI.getPos().then((p) => {
      if (downAt) { downAt.winX = p.x; downAt.winY = p.y; }
    });
    longTimer = setTimeout(() => {
      if (downAt && !downAt.longFired) {
        downAt.longFired = true;
        setState('heart');
        say(pickLine(CORPUS.cheer));
      }
    }, 800);
  });

  petEl.addEventListener('mousemove', (e) => {
    if (!downAt || downAt.longFired) return;
    const dx = e.screenX - downAt.sx;
    const dy = e.screenY - downAt.sy;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      moved = true;
      clearTimeout(longTimer);
    }
    if (moved && downAt.winX !== null) {
      window.petAPI.setPos(downAt.winX + dx, downAt.winY + dy);
    }
  });

  petEl.addEventListener('mouseup', (e) => {
    clearTimeout(longTimer);
    if (!downAt) return;
    const wasLong = downAt.longFired;
    const wasDrag = moved;
    downAt = null;
    moved = false;
    if (wasLong) return; // 长按已处理
    if (wasDrag) {
      // 拖拽结束 = 召唤同行
      setState('wave');
      say(pickLine(CORPUS.drag));
      setTimeout(() => tickTimeSlot({ silent: true }), 2500);
      return;
    }
    // 单击：切个轻表情回应 + 说当前时段对应的话（图文一致）
    if (e.detail === 1) {
      const slot = slotOf(new Date().getHours());
      const pool = (CORPUS.slots[slot.slot] && CORPUS.slots[slot.slot].length) ? CORPUS.slots[slot.slot] : CORPUS.click;
      const backTo = currentState;
      setState('emote-comfy');
      say(pickLine(pool), 4000);
      setTimeout(() => { if (backTo && backTo !== 'emote-comfy') setState(backTo); }, 2500);
    } else if (e.detail === 2) {
      // 双击：私房噗灵彩蛋
      setState('coin');
      say(pickLine(CORPUS.share));
      setTimeout(() => tickTimeSlot({ silent: true }), 3000);
    }
  });

  petEl.addEventListener('mouseleave', () => {
    clearTimeout(longTimer);
    downAt = null;
    moved = false;
  });

  // ---------- 冷落：长时间不理大喵 → 担心式发言（三阶段递进，不含 #15） ----------
  const IGNORE_STEPS = [0, 10, 30, 60]; // 开机后 10/30/60 分钟各触发一档
  const ignoreDone = new Set();
  function scheduleIgnore() {
    const next = IGNORE_STEPS.find((m) => m > 0 && !ignoreDone.has(m));
    if (!next) return;
    setTimeout(() => {
      ignoreDone.add(next);
      if (!document.hidden) {
        const idx = Math.min([...ignoreDone].length - 1, CORPUS.ignore.length - 1);
        say(CORPUS.ignore[idx].line, 5000);
      }
      scheduleIgnore();
    }, next * 60 * 1000);
  }

  // ---------- 天气：Open-Meteo（免 key，按电脑定位；失败静默降级） ----------
  async function getLatLon() {
    if (window.petAPI.platform === 'win32') {
      try { return await window.petAPI.ipLocation(); } catch (_e) { return null; }
    }
    try {
      return await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
          reject,
          { timeout: 8000 }
        );
      });
    } catch (_e) {
      // Windows 上 navigator.geolocation 需要 Google API key，基本必失败 → 改用 IP 粗略定位
      try {
        return await window.petAPI.ipLocation();
      } catch (_e2) {
        return null; // 都拿不到就静默跳过天气
      }
    }
  }

  const WEATHER_CODE = {
    sunny: [0, 1],
    wind: [],
    rain: [51, 53, 55, 61, 63, 65, 80, 81, 82],
    snow: [71, 73, 75, 77, 85, 86],
    thunder: [95, 96, 99],
    hot: [] // 由温度判断
  };

  function classifyWeather(code, temp) {
    for (const [k, arr] of Object.entries(WEATHER_CODE)) {
      if (arr.includes(code)) return k;
    }
    if (temp >= 30) return 'hot';
    if (code >= 0 && code <= 2) return 'sunny';
    return null;
  }

  let lastWeatherKind = null;
  // 天气动作：天气一变，先切对应表情/动作，再弹台词，几秒后回时段形象
  // 注：wind 因 Open-Meteo 未接风速判断暂不触发（发布前用 wind_speed 阈值补上）
  const WEATHER_ACTION = {
    sunny: 'emote-comfy',  // 晴·惬意（眯眼托腮）
    rain: 'emote-cover',   // 雨·捂嘴
    wind: 'emote-proud',   // 风·傲娇（预留）
    snow: 'emote-surprise',// 雪·惊讶
    hot: 'eat',            // 热·吐舌（复用端盘吐舌帧，不新做图）
    thunder: 'emote-cover' // 雷暴按雨写：捂嘴 + 雨台词
  };
  async function fetchWeather() {
    const pos = await getLatLon();
    if (!pos) return;
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${pos.lat}&longitude=${pos.lon}&current_weather=true`
      );
      const data = await res.json();
      const kind = classifyWeather(data.current_weather.weathercode, data.current_weather.temperature);
      if (kind && kind !== lastWeatherKind) {
        lastWeatherKind = kind;
        const backTo = currentState;
        const act = WEATHER_ACTION[kind];
        const pool = CORPUS.weather[kind];
        if (act) setState(act); // 1) 先切对应表情/动作
        if (pool && pool.length) {
          setTimeout(() => say(pickLine(pool), 5000), 2000); // 2) 2秒后弹天气台词
        }
        setTimeout(() => { if (backTo) setState(backTo); }, 7200); // 3) 表情+台词后回时段形象
      }
    } catch (_e) {
      // 静默降级：拉取失败不打扰
    }
  }

  // ---------- 启动 ----------
  function init() {
    tickTimeSlot();        // 首帧即按当前时段切形象 + 配一句该时段的开场台词
    scheduleBlink();
    scheduleIgnore();
    scheduleIdleMood();    // 待机低频表情+轻台词
    scheduleIdleNap();     // 午间/傍晚浅睡小憩（打盹zzZ）
    fetchWeather();
    setInterval(fetchWeather, 30 * 60 * 1000); // 每 30 分钟看一次天气
    setInterval(() => tickTimeSlot(), 60 * 1000); // 每分钟校准时段（只在时段变化时开口）
  }

  init();
})();
