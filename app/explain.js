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
    body: "新鲜输入与缓存写入的 token 合计，不含缓存读取。这里统计的是数量，不是金额；不同模型、供应商的缓存写入价格也可能不同。",
  },
  out: {
    title: "输出 token",
    body: "模型生成回来的 token。输入和输出通常采用不同单价，输出单价也可能更高；请以实际供应商账单为准。",
  },
  errorRate: {
    title: "失败率",
    body: "出错请求占比；主动取消单独统计。失败是否消耗 token 或收费，取决于失败发生的阶段和供应商回执。",
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
    body: "在网关采样工具名、参数 schema 和描述的 JSON 体积，以字节数 ÷ 3.5 估算 token。不是精确 tokenizer 计数；可能命中缓存，也不等于实际费用。",
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
    body: "所选窗口内，同一 session 首末请求的跨度中位数，包含闲置，不是持续工作时间。超过 6 小时的会话目前不参与时长统计。",
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
    body: "根据用量日志端点统计所选范围内的协议分布，可能包含网关转换后的上游协议。不能当作当前客户端配置。",
  },
  live: {
    title: "正在使用",
    body: "网关 hook 已记录请求开始、尚未收到对应结束回调的数量，每约 2 秒刷新。丢失结束回调的记录最多保留 15 分钟；这是观测状态，不是 Agent 的后台进程状态。",
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
