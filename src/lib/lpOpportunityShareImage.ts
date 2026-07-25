export type LpOpportunityShareData = {
  slug: string
  title: string
  variant?: 'opportunity' | 'report'
  insight?: string
  footerUrl?: string
  verificationLabel?: string
  dailyReward?: number
  liveSpread?: number
  depthAtTwoCents?: number
  minSize?: number
  estimatedRewardCapitalUsdc?: number
  daysToResolve?: number
  suggestedYesBid?: number
  suggestedNoBid?: number
  tickSize?: string
  lpExecutionRisk?: string
  updatedAt?: string
}

const WIDTH = 1080
const HEIGHT = 1350
const BLUE = '#2f5bff'
const YES = '#2563eb'
const NO = '#dc2626'
const INK = '#111827'
const MUTED = '#6b7280'
const LINE = '#e5e7eb'

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + r, y)
  context.arcTo(x + width, y, x + width, y + height, r)
  context.arcTo(x + width, y + height, x, y + height, r)
  context.arcTo(x, y + height, x, y, r)
  context.arcTo(x, y, x + width, y, r)
  context.closePath()
}

function format(value: unknown, maximumFractionDigits = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toLocaleString(undefined, { maximumFractionDigits }) : '—'
}

function quote(value: unknown, tickSize = '0.01') {
  const parsed = Number(value)
  const digits = tickSize.split('.')[1]?.length ?? 2
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : '—'
}

function wrapLines(context: CanvasRenderingContext2D, value: string, maxWidth: number, maxLines: number) {
  const words = value.trim().split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (context.measureText(next).width <= maxWidth) {
      line = next
      continue
    }
    if (line) lines.push(line)
    line = word
    if (lines.length === maxLines - 1) break
  }
  if (line && lines.length < maxLines) lines.push(line)
  if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) {
    let last = lines[maxLines - 1]
    while (last.length > 1 && context.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1)
    lines[maxLines - 1] = `${last.replace(/[.,;:]$/, '')}…`
  }
  return lines
}

function drawLabel(context: CanvasRenderingContext2D, value: string, x: number, y: number, color = MUTED) {
  context.fillStyle = color
  context.font = '700 20px Inter, Arial, sans-serif'
  context.fillText(value.toUpperCase(), x, y)
}

function drawRadarMark(context: CanvasRenderingContext2D, x: number, y: number, size: number) {
  context.save()
  context.translate(x, y)
  context.strokeStyle = BLUE
  context.lineWidth = 6
  context.beginPath()
  context.arc(size / 2, size / 2, size * 0.34, 0, Math.PI * 2)
  context.stroke()
  context.beginPath()
  context.arc(size / 2, size / 2, size * 0.15, 0, Math.PI * 2)
  context.stroke()
  context.beginPath()
  context.moveTo(size / 2, size / 2)
  context.lineTo(size * 0.78, size * 0.26)
  context.stroke()
  context.fillStyle = BLUE
  context.beginPath()
  context.arc(size / 2, size / 2, 6, 0, Math.PI * 2)
  context.fill()
  context.restore()
}

export async function renderLpOpportunityPng(data: LpOpportunityShareData) {
  await document.fonts?.ready.catch(() => undefined)
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Image canvas is unavailable.')

  context.fillStyle = BLUE
  context.fillRect(0, 0, WIDTH, HEIGHT)

  context.fillStyle = '#ffffff'
  context.font = '700 28px Inter, Arial, sans-serif'
  context.fillText('PolyDesk', 98, 78)
  context.strokeStyle = '#ffffff'
  context.lineWidth = 4
  context.beginPath()
  context.arc(64, 68, 18, 0, Math.PI * 2)
  context.stroke()
  context.beginPath()
  context.moveTo(64, 68)
  context.lineTo(76, 56)
  context.stroke()
  context.fillStyle = 'rgba(255,255,255,0.78)'
  context.font = '600 18px Inter, Arial, sans-serif'
  context.textAlign = 'right'
  context.fillText('POLYDESK.TRADE', 1016, 76)
  context.textAlign = 'left'

  const cardX = 48
  const cardY = 112
  const cardW = 984
  const cardH = 1178
  roundedRect(context, cardX, cardY, cardW, cardH, 30)
  context.fillStyle = '#ffffff'
  context.fill()

  drawRadarMark(context, 90, 170, 74)
  const isReport = data.variant === 'report'
  drawLabel(context, isReport ? (data.verificationLabel || 'Verified LP Scout brief') : 'Market reward opportunity', 196, 187, BLUE)
  context.fillStyle = INK
  context.font = '700 48px Inter, Arial, sans-serif'
  const titleLines = wrapLines(context, data.title, 760, 3)
  titleLines.forEach((line, index) => context.fillText(line, 196, 245 + index * 56))

  if (isReport) {
    roundedRect(context, 88, 410, 420, 132, 18)
    context.fillStyle = '#eff6ff'
    context.fill()
    drawLabel(context, 'Daily rewards', 120, 450, BLUE)
    context.fillStyle = BLUE
    context.font = '700 48px Inter, Arial, sans-serif'
    context.fillText(format(data.dailyReward), 120, 510)
    const reportRewardWidth = context.measureText(format(data.dailyReward)).width
    context.font = '700 23px Inter, Arial, sans-serif'
    context.fillText('USDC', 134 + reportRewardWidth, 507)

    const reportMetrics = [
      { label: 'Spread', value: data.liveSpread == null ? '—' : `${format(data.liveSpread, 1)}c`, x: 528, width: 140 },
      { label: 'Min setup', value: data.estimatedRewardCapitalUsdc == null ? '—' : `≈${format(data.estimatedRewardCapitalUsdc, 2)}`, x: 688, width: 160 },
      { label: 'Ends', value: data.daysToResolve == null ? '—' : `${format(data.daysToResolve)}d`, x: 868, width: 124 },
    ]
    reportMetrics.forEach(metric => {
      roundedRect(context, metric.x, 410, metric.width, 132, 18)
      context.fillStyle = '#f9fafb'
      context.fill()
      drawLabel(context, metric.label, metric.x + 20, 450)
      context.fillStyle = INK
      context.font = '700 30px Inter, Arial, sans-serif'
      context.fillText(metric.value, metric.x + 20, 506)
    })
  } else {
  roundedRect(context, 88, 410, 420, 132, 18)
  context.fillStyle = '#eff6ff'
  context.fill()
  drawLabel(context, 'Daily rewards', 124, 450, BLUE)
  context.fillStyle = BLUE
  context.font = '700 54px Inter, Arial, sans-serif'
  context.fillText(format(data.dailyReward), 124, 514)
  const rewardWidth = context.measureText(format(data.dailyReward)).width
  context.font = '700 26px Inter, Arial, sans-serif'
  context.fillText('USDC', 140 + rewardWidth, 511)

  roundedRect(context, 528, 410, 220, 132, 18)
  context.fillStyle = '#f9fafb'
  context.fill()
  drawLabel(context, 'Min setup', 550, 450)
  context.fillStyle = INK
  context.font = '700 30px Inter, Arial, sans-serif'
  context.fillText(data.estimatedRewardCapitalUsdc == null ? '—' : `≈${format(data.estimatedRewardCapitalUsdc, 2)}`, 550, 506)

  roundedRect(context, 766, 410, 226, 132, 18)
  context.fillStyle = '#f9fafb'
  context.fill()
  drawLabel(context, 'Ends in', 800, 450)
  context.fillStyle = INK
  context.font = '700 42px Inter, Arial, sans-serif'
  context.fillText(data.daysToResolve == null ? '—' : `${format(data.daysToResolve)} days`, 800, 510)

  }

  context.strokeStyle = LINE
  context.lineWidth = 2
  context.setLineDash([10, 10])
  context.beginPath()
  context.moveTo(48, 584)
  context.lineTo(1032, 584)
  context.stroke()
  context.setLineDash([])
  context.fillStyle = BLUE
  context.beginPath()
  context.arc(48, 584, 18, 0, Math.PI * 2)
  context.fill()
  context.beginPath()
  context.arc(1032, 584, 18, 0, Math.PI * 2)
  context.fill()

  drawLabel(context, 'Suggested prices', 88, 640)
  roundedRect(context, 88, 670, 430, 142, 16)
  context.fillStyle = '#eff6ff'
  context.fill()
  context.fillStyle = YES
  context.fillRect(88, 670, 12, 142)
  drawLabel(context, 'YES', 128, 712, YES)
  context.fillStyle = YES
  context.font = '700 54px Inter, Arial, sans-serif'
  context.fillText(quote(data.suggestedYesBid, data.tickSize), 128, 778)

  roundedRect(context, 562, 670, 430, 142, 16)
  context.fillStyle = '#fef2f2'
  context.fill()
  context.fillStyle = NO
  context.fillRect(562, 670, 12, 142)
  drawLabel(context, 'NO', 602, 712, NO)
  context.fillStyle = NO
  context.font = '700 54px Inter, Arial, sans-serif'
  context.fillText(quote(data.suggestedNoBid, data.tickSize), 602, 778)

  drawLabel(context, isReport ? 'Scout takeaway' : 'How to join', 88, 878)
  context.fillStyle = INK
  context.font = '600 28px Inter, Arial, sans-serif'
  const takeaway = isReport
    ? (data.insight || 'Review the live market before placing a liquidity order.')
    : 'Choose a side, enter an amount, and wait for a match.'
  const takeawayLines = wrapLines(context, takeaway, 886, isReport ? 3 : 1)
  takeawayLines.forEach((line, index) => context.fillText(line, 88, 928 + index * 38))

  roundedRect(context, 88, isReport ? 1058 : 982, 904, 88, 18)
  context.fillStyle = BLUE
  context.fill()
  context.fillStyle = '#ffffff'
  context.font = '700 27px Inter, Arial, sans-serif'
  context.textAlign = 'center'
  context.fillText(isReport ? 'Explore LP Scout on PolyDesk' : 'View opportunity on PolyDesk', 540, isReport ? 1114 : 1038)
  context.textAlign = 'left'

  context.fillStyle = MUTED
  context.font = '500 20px Inter, Arial, sans-serif'
  context.fillText(isReport ? 'Live market conditions can change before an order is placed.' : 'Rewards are shared across eligible liquidity providers', 88, isReport ? 1208 : 1142)
  context.fillText(isReport ? 'Review the current book before acting.' : 'and are not guaranteed.', 88, isReport ? 1240 : 1174)
  context.textAlign = 'right'
  context.fillStyle = '#ffffff'
  context.font = '600 18px Inter, Arial, sans-serif'
  context.fillText(data.footerUrl || `polydesk.trade/opportunity/${data.slug}`, 1016, 1320)
  context.textAlign = 'left'

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The LP image could not be generated.')), 'image/png', 1)
  })
}

export function downloadLpOpportunityPng(blob: Blob, slug: string) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `polydesk-lp-${slug}.png`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}
