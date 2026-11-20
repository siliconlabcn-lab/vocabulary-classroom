import { REFERENCE_BANKS } from './reference-banks.js';

const banks = [
  ['小学基础', `
apple 苹果|banana 香蕉|blue 蓝色的|red 红色的|yellow 黄色的|green 绿色的|orange 橙子|grape 葡萄|milk 牛奶|bread 面包|rice 米饭|egg 鸡蛋|dog 狗|cat 猫|bird 鸟|fish 鱼|desk 书桌|chair 椅子|book 书|pencil 铅笔|school 学校|teacher 老师|friend 朋友|family 家庭|sister 姐妹|brother 兄弟|mother 母亲|father 父亲|morning 早晨|night 夜晚|sun 太阳|moon 月亮|star 星星|rain 雨|wind 风|snow 雪|happy 开心的|tired 疲倦的|hungry 饥饿的|small 小的|tall 高的|long 长的|jump 跳|swim 游泳|sing 唱歌|draw 画画|dance 跳舞|read 阅读
`],
  ['小学进阶', `
garden 花园|window 窗户|river 河流|cloud 云|forest 森林|mountain 山|island 岛屿|beach 海滩|bridge 桥|market 市场|station 车站|library 图书馆|hospital 医院|museum 博物馆|pocket 口袋|blanket 毯子|basket 篮子|bottle 瓶子|camera 照相机|mirror 镜子|pillow 枕头|ticket 票|weather 天气|season 季节|weekend 周末|holiday 假日|breakfast 早餐|dinner 晚餐|vegetable 蔬菜|chicken 鸡肉|butterfly 蝴蝶|elephant 大象|rabbit 兔子|turtle 乌龟|whale 鲸|careful 小心的|quiet 安静的|friendly 友好的|clean 干净的|heavy 重的|bright 明亮的|collect 收集|carry 携带|borrow 借入|visit 参观|arrive 到达|follow 跟随|build 建造
`],
  ['初中', `
journey 旅程|notice 注意到|improve 改进|provide 提供|protect 保护|decide 决定|discover 发现|continue 继续|prepare 准备|describe 描述|explain 解释|encourage 鼓励|remember 记得|receive 收到|suggest 建议|prefer 更喜欢|support 支持|compare 比较|choose 选择|allow 允许|separate 分开|imagine 想象|return 返回|reduce 减少|increase 增加|language 语言|message 消息|material 材料|purpose 目的|result 结果|reason 原因|culture 文化|history 历史|future 未来|chance 机会|accident 事故|habit 习惯|subject 科目|experience 经验|environment 环境|information 信息|popular 流行的|common 常见的|polite 有礼貌的|patient 有耐心的|possible 可能的|simple 简单的|similar 相似的
`],
  ['高中', `
evidence 证据|approach 方法|benefit 益处|context 语境|consequence 后果|perspective 视角|assumption 假设|contribution 贡献|strategy 策略|priority 优先事项|attitude 态度|principle 原则|resource 资源|challenge 挑战|characteristic 特征|achievement 成就|responsibility 责任|solution 解决办法|reaction 反应|behavior 行为|conclusion 结论|variety 多样性|opportunity 机会|independent 独立的|significant 重要的|efficient 高效的|accurate 准确的|essential 必不可少的|flexible 灵活的|curious 好奇的|appropriate 合适的|ordinary 普通的|familiar 熟悉的|reasonable 合理的|specific 具体的|evaluate 评估|analyze 分析|predict 预测|maintain 保持|observe 观察|confirm 确认|consider 考虑|recognize 认出|establish 建立|determine 确定|indicate 表明|represent 代表|estimate 估计
`],
  ['拓展', `
intuition 直觉|ambiguity 歧义|constraint 限制|inference 推断|coincidence 巧合|credibility 可信度|notion 概念|phenomenon 现象|resilience 韧性|consensus 共识|controversy 争议|hierarchy 层级|dilemma 两难处境|implication 暗示|distinction 区别|integrity 正直|legitimacy 合法性|discrepancy 差异|prevalence 普遍程度|complexity 复杂性|durability 耐久性|consistency 一致性|versatility 多功能性|autonomy 自主性|plausible 貌似合理的|arbitrary 任意的|coherent 连贯的|subtle 微妙的|explicit 明确的|tentative 暂定的|inevitable 不可避免的|genuine 真诚的|persistent 持续的|inherent 内在的|mutual 相互的|successive 连续的|interpret 解读|justify 证明合理|reinforce 加强|negotiate 协商|sustain 维持|allocate 分配|anticipate 预料|distinguish 区分|accommodate 容纳|facilitate 促进|articulate 清楚表达|contemplate 沉思
`],
];

export const TRIAL_BANKS = banks.map(([label, entries], index) => ({
  id: `trial-${index}`,
  group: '体验词库',
  label,
  words: entries.trim().split('|').map(entry => {
    const [en, zh] = entry.split(' ');
    return { en, zh };
  }),
}));

export const BANKS = [...TRIAL_BANKS, ...REFERENCE_BANKS.map(({ entries, ...bank }) => ({
  ...bank,
  words: entries.map(([en, zh]) => ({ en, zh })),
}))];

const bankIndex = new Map(BANKS.map(bank => [bank.id, bank]));
export const bankFor = reference => typeof reference === 'number' ? TRIAL_BANKS[reference] : bankIndex.get(reference);

export const GRADES = [
  { name: '小学一至二年级', bank: 0, total: 15 },
  { name: '小学三至六年级', bank: 1, total: 30 },
  { name: '初中', bank: 2, total: 30 },
  { name: '高中及以上', bank: 3, total: 30 },
];

export const WORDS = Object.fromEntries([...BANKS].reverse().flatMap(bank => bank.words).map(word => [word.en, word]));
