import civilianImg from '../assets/civilian.jpeg'
import guardImg from '../assets/guard.jpeg'
import hunterImg from '../assets/hunter.jpeg'
import prophetImg from '../assets/prophet.jpeg'
import werewolfImg from '../assets/werewolf.jpeg'
import witchImg from '../assets/witch.jpeg'

export const ROLE_IMG: Record<string, string> = {
  villager: civilianImg,
  guard: guardImg,
  hunter: hunterImg,
  seer: prophetImg,
  werewolf: werewolfImg,
  witch: witchImg,
}

export const ROLE_LABEL: Record<string, string> = {
  villager: '村民',
  guard: '守卫',
  hunter: '猎人',
  seer: '预言家',
  werewolf: '狼人',
  witch: '女巫',
}

export const ROLE_COLOR: Record<string, string> = {
  villager: '#60a5fa',
  guard: '#34d399',
  hunter: '#f59e0b',
  seer: '#c084fc',
  werewolf: '#f87171',
  witch: '#a78bfa',
}

export const PHASE_LABEL: Record<string, string> = {
  lobby: '等待中',
  deal: '发牌中',
  guard: '守卫行动',
  wolf: '狼人行动',
  'witch-save': '女巫解药',
  'witch-poison': '女巫毒药',
  seer: '预言家查验',
  night: '黑夜',
  day: '白天发言',
  dayResolution: '白天结算',
  vote: '投票放逐',
  tie: '平票重投',
  end: '游戏结束',
}

export const PHASE_ICON: Record<string, string> = {
  lobby: '🏠',
  deal: '🃏',
  guard: '🛡',
  wolf: '🐺',
  'witch-save': '💊',
  'witch-poison': '☠️',
  seer: '🔮',
  night: '🌙',
  day: '☀️',
  dayResolution: '☀️',
  vote: '🗳',
  tie: '⚖️',
  end: '🏁',
}
