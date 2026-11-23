// Output schemas for every AI stage. They are sent to Claude as structured-output
// JSON schemas (descriptions included), and validated again on our side.
import { z } from "zod";

const Evidence = z
  .string()
  .describe(
    "依据：注明来源标签 + 原文要点。标签用 [卖点] [规格] [描述] [A+] [评价·维度名 N次提及] [评分] [图片] [推断]。例：'[评价·ease of cleaning 1849次提及] 买家普遍说很好清洗'",
  );

// ---------- Stage A: product info + content brief (fast) ----------

export const ProductInfoSchema = z.object({
  nameZh: z.string().describe("中文商品名：品牌 + 核心品类词 + 1-2个关键规格，自然简洁，≤30字。例：'Ninja 4夸脱四合一空气炸锅'"),
  category: z.string().describe("中文品类路径，2-3级，例：'厨房家电 > 空气炸锅'"),
  oneLiner: z.string().describe("一句话说清：它是什么、给谁用、解决什么问题。≤40字，不用营销腔"),
  price: z.string().describe("价格说明：现价、划线价、折扣、多款式价格区间。资料没有价格时写'页面未显示价格'，不得编造或估算"),
  socialProof: z.string().describe("评分/评分数量/近期销量/榜单排名的中文概述，例：'4.7分（5.9万评分）· 亚马逊空气炸锅类第10名'；没有数据写'暂无'"),
  coreFeatures: z
    .array(
      z.object({
        title: z.string().describe("功能名，≤10字"),
        detail: z.string().describe("具体说明，保留关键数字和单位，≤50字"),
      }),
    )
    .describe("3-6个核心功能，按对消费者的重要性排序，只能来自资料"),
  keySpecs: z
    .array(z.object({ name: z.string().describe("中文参数名"), value: z.string().describe("参数值；英制单位后用括号补公制换算，换算要准确") }))
    .describe("4-8个最影响购买决策的规格参数"),
  variants: z.string().describe("可选款式/尺寸/颜色概述，例：'4种容量、2种颜色可选'；没有则为空字符串"),
});

export const ContentBriefSchema = z.object({
  audience: z.string().describe("最核心的目标人群，一句话，具体到身份+处境"),
  mainPain: z.string().describe("这群人最痛的一个痛点，用他们自己的口吻说，一句话"),
  topSellingPoints: z.array(z.string()).describe("对这群人最有说服力的3个卖点，每条带具体数字或细节，全部来自资料"),
  proof: z.string().describe("可用作信任背书的真实数据（评分、评价数、销量、排名、买家原话），没有则为空字符串"),
  hookAngle: z.string().describe("推荐的短视频钩子切入角度，一句话说明为什么"),
});

export const InfoStageSchema = z.object({
  productInfo: ProductInfoSchema,
  brief: ContentBriefSchema,
});

// ---------- Stage B: deep analysis ----------

export const ProductAnalysisSchema = z.object({
  positioning: z.object({
    summary: z.string().describe("一句话产品定位：为谁、在什么场景、提供什么核心价值，≤50字"),
    priceBand: z.string().describe("价格带判断（入门/中端/高端）+ 理由，基于资料价格与品类常识；没有价格就说明无法判断"),
    purchaseDrivers: z.array(z.string()).describe("2-3个购买驱动力（功能/情感/社交），每条≤25字"),
  }),
  targetUsers: z
    .array(
      z.object({
        persona: z.string().describe("人群画像，身份+处境，例：'租房、厨房小的上班族'"),
        need: z.string().describe("他们想完成的事 / 真实需求"),
        trigger: z.string().describe("什么时刻会决定下单（触发场景）"),
      }),
    )
    .describe("2-3个目标用户，按重要性排序"),
  scenarios: z
    .array(z.object({ scene: z.string().describe("具体场景"), value: z.string().describe("该场景下产品带来的具体价值") }))
    .describe("3-4个典型使用场景"),
  painPoints: z
    .array(
      z.object({
        pain: z.string().describe("用户痛点，用户口吻"),
        solution: z.string().describe("产品具体怎么解决（功能/参数）"),
        evidence: Evidence,
      }),
    )
    .describe("3-4个 痛点→解决方案"),
  sellingPoints: z
    .array(
      z.object({
        point: z.string().describe("卖点，≤15字"),
        benefit: z.string().describe("翻译成消费者利益：对我有什么好处"),
        evidence: Evidence,
        strength: z.enum(["强", "中", "弱"]).describe("证据强度：有具体参数或大量评价印证为'强'，仅商家自述为'中'，推断为'弱'"),
      }),
    )
    .describe("3-5个核心卖点，按说服力排序"),
  voiceOfCustomer: z.object({
    verdict: z.string().describe("买家整体评价结论，引用评分、评分数量、星级分布或提及次数；没有评价数据就明确说明"),
    loves: z.array(z.string()).describe("买家最认可的2-4点，带提及次数等数据"),
    complaints: z.array(z.string()).describe("买家主要不满或分歧1-3点，带数据；资料里没有负面信息就写一条说明"),
  }),
  objections: z
    .array(z.object({ concern: z.string().describe("消费者的购买顾虑"), response: z.string().describe("基于事实的回应，以及内容里怎么提前化解") }))
    .describe("2-3个购买顾虑及应对"),
  competition: z
    .object({
      alternatives: z.array(z.string()).describe("消费者通常会拿来比较的2-3类替代方案（品类/形态，不点名攻击具体品牌）"),
      advantage: z.string().describe("相对替代方案的差异化优势"),
      weakness: z.string().describe("相对劣势或风险"),
    })
    .describe("竞争格局；这部分基于品类常识推断，要在文字中体现是推断"),
  contentStrategy: z.object({
    bestAngle: z.string().describe("最推荐的内容切入角度及原因"),
    angles: z
      .array(
        z.object({
          angle: z.string().describe("内容角度"),
          hook: z.string().describe("一句对应的钩子示例（口语）"),
          platform: z.string().describe("适合的平台/形式，例：'抖音 测评对比'"),
        }),
      )
      .describe("2-3个可选内容角度"),
    avoid: z.array(z.string()).describe("内容里应避免的说法或风险点（夸大、合规、容易引发差评的承诺）"),
  }),
  visualInsights: z.object({
    observations: z.array(z.string()).describe("从商品图片中观察到的信息：外观、颜色、材质质感、使用场景、图上标注的卖点文字。没有提供图片则为空数组"),
    shotIdeas: z.array(z.string()).describe("2-3个短视频拍摄画面建议"),
  }),
  dataGaps: z.array(z.string()).describe("资料中缺失、需要人工核实的关键信息；资料完整则为空数组"),
});

// ---------- Stage C: short-video voice-over script ----------

export const VideoScriptSchema = z.object({
  title: z.string().describe("视频标题，≤20字"),
  hookType: z.string().describe("钩子类型：痛点提问 / 反常识 / 场景代入 / 结果前置 / 对比反差 / 悬念 等"),
  hook: z.string().describe("前5秒的钩子原话，必须与 script 开头完全一致，≤25字"),
  script: z.string().describe("完整口播文案，以 hook 开头，总长 110-145 字（含标点），口语化短句"),
  segments: z
    .array(
      z.object({
        time: z.string().describe("时间段，例：'0-5s'"),
        line: z.string().describe("该段口播原文，所有段拼起来等于 script"),
        visual: z.string().describe("对应画面/镜头建议"),
      }),
    )
    .describe("3-5个分段，第一段是 0-5s 的钩子"),
  hashtags: z.array(z.string()).describe("3-5个话题标签，不带#"),
  alternativeHooks: z
    .array(z.object({ type: z.string().describe("钩子类型"), line: z.string().describe("钩子原话，≤25字") }))
    .describe("另外2个不同类型的钩子备选"),
});

// ---------- Stage D: quality review ----------

export const ReviewReportSchema = z.object({
  claims: z
    .array(
      z.object({
        claim: z.string().describe("文案中的一个事实性表述（原文片段）"),
        status: z.enum(["有依据", "无依据", "夸大", "与资料不符"]),
        source: z.string().describe("对应的资料依据，或为什么判定有问题"),
        fix: z.string().describe("需要修改时的改法；无需修改为空字符串"),
      }),
    )
    .describe("逐条核查文案里所有事实性表述：数字、功能、材质、效果、评价、价格、对比、单位换算"),
  compliance: z
    .array(z.object({ text: z.string().describe("问题原文"), issue: z.string().describe("问题类型与原因"), fix: z.string().describe("改法") }))
    .describe("合规问题：绝对化用语、虚假紧迫感、功效/医疗承诺、无依据的比较、价格承诺等；没有则为空数组"),
  hookFeedback: z.string().describe("对前5秒钩子的评价：是否具体、是否能让人停下来、是否像真人在说话"),
  scores: z
    .object({
      factuality: z.number().describe("事实准确 1-10"),
      compliance: z.number().describe("合规 1-10"),
      hook: z.number().describe("钩子吸引力 1-10"),
      naturalness: z.number().describe("口语自然度 1-10"),
    })
    .describe("评分"),
  revisedScript: z.string().describe("修正全部问题后的最终口播文案：保持原风格和钩子，110-145字（含标点）。无需修改就原样返回"),
  changes: z.array(z.string()).describe("修改说明，每条一句；没有修改则为空数组"),
  verdict: z.string().describe("一句话质检结论"),
});

// ---------- Fallback: extract product data from fetched page / pasted text ----------

export const ExtractedProductSchema = z.object({
  found: z.boolean().describe("是否拿到了这个商品的可信信息"),
  title: z.string(),
  brand: z.string(),
  price: z.string().describe("价格原文，例：'$39.99'；未知为空字符串"),
  rating: z.number().describe("评分 0-5，未知为 0"),
  ratingCount: z.number().describe("评分数量，未知为 0"),
  categories: z.array(z.string()).describe("类目路径，从大到小"),
  bullets: z.array(z.string()).describe("卖点 / About this item 原文"),
  description: z.string(),
  specs: z.array(z.object({ name: z.string(), value: z.string() })),
  variations: z.string().describe("款式/尺寸/颜色概述"),
  reviewSummary: z.string().describe("买家评价要点（若有）"),
  images: z.array(z.string()).describe("商品图片 URL（若有）"),
  notes: z.string().describe("信息来源与可信度说明"),
});

export type InfoStage = z.infer<typeof InfoStageSchema>;
export type ProductInfo = z.infer<typeof ProductInfoSchema>;
export type ContentBrief = z.infer<typeof ContentBriefSchema>;
export type ProductAnalysis = z.infer<typeof ProductAnalysisSchema>;
export type VideoScript = z.infer<typeof VideoScriptSchema>;
export type ReviewReport = z.infer<typeof ReviewReportSchema>;
export type ExtractedProduct = z.infer<typeof ExtractedProductSchema>;
