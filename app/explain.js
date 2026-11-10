// What every number on this page means, in one place. Each entry becomes a
// small "?" that shows the explanation on hover or focus — so a reader who
// does not know the term can find out without leaving the page.
//
// The explanations name what is measured, where the number comes from, and
// what makes it misleading. Anything that is an estimate says so.

export const EXPLAIN = {
  // top-level blocks
  prompt: {
    title: "输入 token",
    body: "这段时间读进模型的所有 token：新鲜输入 + 缓存读取 + 缓存写入。模型每轮读到的上下文都算在这里，是账单里最大的一块。",
  },
  avgPrompt: {
    title: "每次读",
    body: "平均每次请求读进模型的 token。总额会被「用了多少次」放大，摊到每次请求才能看出哪个 harness 单次更重。",
  },
  cacheRate: {
    title: "缓存命中",
    body: "读进来的 token 里，有多少是从 prompt cache 取的。命中的部分按折扣价算，没命中的按原价。命中率低不等于模型差，通常是前缀不稳定（比如工具定义变了）。",
  },
  fullPrice: {
    title: "按原价",
    body: "没有命中缓存、按原价计费的 token（新鲜输入 + 缓存写入）。这一栏就是实打实花掉的钱，比「输入 token」更接近账单。",
  },
  out: {
    title: "输出 token",
    body: "模型生成回来的 token。通常比输入便宜得多，但长回答也会累积。",
  },
  errorRate: {
    title: "失败率",
    body: "返回 4xx/5xx 或出错的请求占比。失败的请求一样读了 prompt、一样计费，所以它同时是成本项和体验问题。",
  },
  calls: {
    title: "请求",
    body: "经过网关的请求数。注意这里只算你用的 harness，脚本和内部请求默认隐藏。",
  },
  p50ttft: {
    title: "首字 p50",
    body: "一半的请求比这个快。首字时间决定你等多久能看到第一个字，比总耗时更影响体感。",
  },
  p50ms: {
    title: "耗时 p50",
    body: "一半的请求比这个快，指请求从进网关到拿到完整回复的总时长（含思考和生成）。",
  },
  toolTokens: {
    title: "工具 token/次",
    body: "每次请求重发的工具定义（工具名 + 参数 schema + 描述）折算成多少 token。这部分按输入 token 计费，每一轮都付。只有网关看得到。",
  },
  toolShare: {
    title: "占输入比",
    body: "工具定义占这个 harness 自己读进的 token 的比例。25% 意味着模型读 4 个 token 就有 1 个是工具定义，跟对话内容无关。",
  },
  toolCount: {
    title: "工具个数",
    body: "每次请求带了多少个工具定义。注意：个数不等于成本。有的工具描述特别长，少数几个就能顶掉一打短工具。要裁就按字节裁。",
  },
  sessionMedian: {
    title: "单次会话时长",
    body: "同一个会话（session）从第一次请求到最后一次请求隔了多久，中位数。反映「一次对话大概用多久」。",
  },
  sessionP90: {
    title: "长会话 p90",
    body: "九成的会话比这个短。少数超长会话（桌面端挂着不关）会拉高平均值，所以这个数比平均更可靠。",
  },
  sessionCount: {
    title: "会话数",
    body: "这段时间内出现过的不同会话数量。会话 id 由 harness 自己维护，所以有的 harness 没有这个概念。",
  },
  protocol: {
    title: "接入协议",
    body: "这个 harness 走网关时用的接口格式。协议不同，同一个模型的计费和缓存行为可能不一样——所以对比时要先看这一栏是不是一致。",
  },
  live: {
    title: "正在使用",
    body: "这个 Agent 刚刚还有请求经过网关。呼吸的光晕表示它现在活跃。",
  },
  fullPriceShare: {
    title: "按原价占比",
    body: "按原价计费的 token 占它读进的总 token 的比例。这个比例越高，同样的用量越贵。",
  },
  credits: {
    title: "credits",
    body: "magpie 记账的按量额度，取决于你走的 provider 怎么定价，不是 token 数本身。",
  },
}

// The order the table uses, with the tooltip key for each column.
export const COLS = [
  ["agent", "Agent", false, null],
  ["calls", "请求", true, "calls"],
  ["prompt", "输入 token", true, "prompt"],
  ["avgPrompt", "每次读", true, "avgPrompt"],
  ["cacheRate", "缓存命中", true, "cacheRate"],
  ["fullPrice", "按原价", true, "fullPrice"],
  ["out", "输出", true, "out"],
  ["errorRate", "失败率", true, "errorRate"],
  ["p50ttft", "首字 p50", true, "p50ttft"],
  ["p50ms", "耗时 p50", true, "p50ms"],
  ["toolTokens", "工具 token/次", true, "toolTokens"],
  ["protocol", "协议", false, "protocol"],
  ["session", "会话时长", true, "sessionMedian"],
]

// The card order: what the cards can be sorted by.
export const CARD_SORTS = [
  ["prompt", "读入 token", "prompt"],
  ["avgPrompt", "每次读", "avgPrompt"],
  ["cacheRate", "缓存命中", "cacheRate"],
  ["fullPrice", "按原价", "fullPrice"],
  ["errorRate", "失败率", "errorRate"],
  ["p50ms", "耗时 p50", "p50ms"],
  ["p50ttft", "首字 p50", "p50ttft"],
  ["toolTokens", "工具重量", "toolTokens"],
]
