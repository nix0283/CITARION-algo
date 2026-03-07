/**
 * Built-in Indicators Library
 * 
 * Pre-configured indicators for CITARION platform
 */

export interface BuiltInIndicator {
  id: string;
  name: string;
  category: string;
  subcategory?: string;  // Подкатегория для организации индикаторов
  description: string;
  pineCode: string;
  inputSchema: Array<{
    name: string;
    type: 'int' | 'float' | 'string' | 'bool';
    default: number | string | boolean;
    min?: number;
    max?: number;
    options?: string[];
  }>;
  outputConfig: Array<{
    name: string;
    type: 'line' | 'histogram' | 'area';
    color: string;
  }>;
  overlay: boolean;
  author: string;
}

export const BUILTIN_INDICATORS: BuiltInIndicator[] = [
  // ==================== MOVING AVERAGES ====================
  {
    id: 'sma',
    name: 'Simple Moving Average',
    category: 'moving_average',
    description: 'Simple Moving Average - среднее арифметическое цен за указанный период',
    pineCode: `//@version=5
indicator("SMA", overlay=true)
length = input.int(20, "Length", minval=1)
src = close
out = ta.sma(src, length)
plot(out, color=color.blue, title="SMA")`,
    inputSchema: [
      { name: 'length', type: 'int', default: 20, min: 1, max: 500 },
    ],
    outputConfig: [
      { name: 'sma', type: 'line', color: '#2962FF' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'ema',
    name: 'Exponential Moving Average',
    category: 'moving_average',
    description: 'EMA быстрее реагирует на последние цены, чем SMA',
    pineCode: `//@version=5
indicator("EMA", overlay=true)
length = input.int(20, "Length", minval=1)
src = close
out = ta.ema(src, length)
plot(out, color=color.green, title="EMA")`,
    inputSchema: [
      { name: 'length', type: 'int', default: 20, min: 1, max: 500 },
    ],
    outputConfig: [
      { name: 'ema', type: 'line', color: '#00C853' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'ema_cross',
    name: 'EMA Cross',
    category: 'moving_average',
    description: 'Две EMA для определения тренда и точек входа/выхода',
    pineCode: `//@version=5
indicator("EMA Cross", overlay=true)
fastLength = input.int(9, "Fast Length", minval=1)
slowLength = input.int(21, "Slow Length", minval=1)
fastEMA = ta.ema(close, fastLength)
slowEMA = ta.ema(close, slowLength)
plot(fastEMA, color=color.green, title="Fast EMA")
plot(slowEMA, color=color.red, title="Slow EMA")`,
    inputSchema: [
      { name: 'fastLength', type: 'int', default: 9, min: 1, max: 200 },
      { name: 'slowLength', type: 'int', default: 21, min: 1, max: 500 },
    ],
    outputConfig: [
      { name: 'fast', type: 'line', color: '#00C853' },
      { name: 'slow', type: 'line', color: '#F6465D' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'wma',
    name: 'Weighted Moving Average',
    category: 'moving_average',
    description: 'WMA придаёт больший вес недавним ценам, обеспечивая более быструю реакцию на изменения цены',
    pineCode: `//@version=5
indicator("WMA", overlay=true)
length = input.int(20, "Length", minval=1)
out = ta.wma(close, length)
plot(out, color=color.blue, title="WMA")`,
    inputSchema: [
      { name: 'length', type: 'int', default: 20, min: 1, max: 500 },
    ],
    outputConfig: [
      { name: 'wma', type: 'line', color: '#2196F3' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'hma',
    name: 'Hull Moving Average',
    category: 'moving_average',
    description: 'HMA - быстрая и сглаженная скользящая средняя, разработанная Аланом Халлом для уменьшения лага',
    pineCode: `//@version=5
indicator("HMA", overlay=true)
length = input.int(20, "Length", minval=1)
out = ta.hma(close, length)
plot(out, color=color.orange, title="HMA")`,
    inputSchema: [
      { name: 'length', type: 'int', default: 20, min: 1, max: 500 },
    ],
    outputConfig: [
      { name: 'hma', type: 'line', color: '#FF9800' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'vwma',
    name: 'Volume Weighted Moving Average',
    category: 'moving_average',
    description: 'VWMA взвешивает цены по объёму, что даёт более точное представление о тренде с учётом торговой активности',
    pineCode: `//@version=5
indicator("VWMA", overlay=true)
length = input.int(20, "Length", minval=1)
out = ta.vwma(close, length)
plot(out, color=color.purple, title="VWMA")`,
    inputSchema: [
      { name: 'length', type: 'int', default: 20, min: 1, max: 500 },
    ],
    outputConfig: [
      { name: 'vwma', type: 'line', color: '#9C27B0' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'smma',
    name: 'Smoothed Moving Average',
    category: 'moving_average',
    description: 'SMMA (Wilder\'s MA) - сглаженная скользящая средняя, используемая в RSI и ATR для уменьшения шума',
    pineCode: `//@version=5
indicator("SMMA", overlay=true)
length = input.int(20, "Length", minval=1)
out = ta.rma(close, length)
plot(out, color=color.teal, title="SMMA")`,
    inputSchema: [
      { name: 'length', type: 'int', default: 20, min: 1, max: 500 },
    ],
    outputConfig: [
      { name: 'smma', type: 'line', color: '#009688' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'lsma',
    name: 'Linear Regression MA',
    category: 'moving_average',
    description: 'LSMA - скользящая средняя на основе линейной регрессии, предсказывает будущее значение цены',
    pineCode: `//@version=5
indicator("LSMA", overlay=true)
length = input.int(20, "Length", minval=1)
out = ta.linreg(close, length, 0)
plot(out, color=color.cyan, title="LSMA")`,
    inputSchema: [
      { name: 'length', type: 'int', default: 20, min: 1, max: 500 },
    ],
    outputConfig: [
      { name: 'lsma', type: 'line', color: '#00BCD4' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'dema',
    name: 'Double EMA',
    category: 'moving_average',
    description: 'DEMA - двойная экспоненциальная скользящая средняя с меньшим лагом, чем обычная EMA',
    pineCode: `//@version=5
indicator("DEMA", overlay=true)
length = input.int(20, "Length", minval=1)
out = ta.dema(close, length)
plot(out, color=color.lime, title="DEMA")`,
    inputSchema: [
      { name: 'length', type: 'int', default: 20, min: 1, max: 500 },
    ],
    outputConfig: [
      { name: 'dema', type: 'line', color: '#CDDC39' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'tema',
    name: 'Triple EMA',
    category: 'moving_average',
    description: 'TEMA - тройная экспоненциальная скользящая средняя с ещё меньшим лагом, чем DEMA',
    pineCode: `//@version=5
indicator("TEMA", overlay=true)
length = input.int(20, "Length", minval=1)
out = ta.tema(close, length)
plot(out, color=color.yellow, title="TEMA")`,
    inputSchema: [
      { name: 'length', type: 'int', default: 20, min: 1, max: 500 },
    ],
    outputConfig: [
      { name: 'tema', type: 'line', color: '#FFEB3B' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'kama',
    name: 'Kaufman Adaptive MA',
    category: 'moving_average',
    description: 'KAMA - адаптивная скользящая средняя Перри Кауфмана, автоматически регулирует скорость в зависимости от волатильности',
    pineCode: `//@version=5
indicator("KAMA", overlay=true)
length = input.int(10, "Length", minval=1)
fast = input.int(2, "Fast Length", minval=1)
slow = input.int(30, "Slow Length", minval=1)
out = ta.kama(close, length, fast, slow)
plot(out, color=color.fuchsia, title="KAMA")`,
    inputSchema: [
      { name: 'length', type: 'int', default: 10, min: 1, max: 200 },
      { name: 'fastLength', type: 'int', default: 2, min: 1, max: 50 },
      { name: 'slowLength', type: 'int', default: 30, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'kama', type: 'line', color: '#E91E63' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'vidya',
    name: 'Variable Index DYMA',
    category: 'moving_average',
    description: 'VIDYA - переменная индексная динамическая скользящая средняя, адаптируется к волатильности через CMO',
    pineCode: `//@version=5
indicator("VIDYA", overlay=true)
length = input.int(20, "Length", minval=1)
cmoPeriod = input.int(10, "CMO Period", minval=1)
// VIDYA uses CMO for adaptation
out = ta.vidya(close, length, cmoPeriod)
plot(out, color=color.maroon, title="VIDYA")`,
    inputSchema: [
      { name: 'length', type: 'int', default: 20, min: 1, max: 500 },
      { name: 'cmoPeriod', type: 'int', default: 10, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'vidya', type: 'line', color: '#7B1FA2' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'mcginley',
    name: 'McGinley Dynamic',
    category: 'moving_average',
    description: 'McGinley Dynamic - адаптивная скользящая средняя, автоматически подстраивается под скорость рынка',
    pineCode: `//@version=5
indicator("McGinley Dynamic", overlay=true)
length = input.int(10, "Length", minval=1)
// McGinley formula adapts to market speed
out = 0.0
out := nz(out[1]) + (close - nz(out[1])) / (length * math.pow(close / nz(out[1]), 4))
plot(out, color=color.olive, title="McGinley")`,
    inputSchema: [
      { name: 'length', type: 'int', default: 10, min: 1, max: 500 },
    ],
    outputConfig: [
      { name: 'mcginley', type: 'line', color: '#8BC34A' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'rolling_vwap',
    name: 'Rolling VWAP',
    category: 'moving_average',
    description: 'Rolling VWAP - скользящая VWAP за указанный период, комбинирует средневзвешенную цену с ограниченным периодом',
    pineCode: `//@version=5
indicator("Rolling VWAP", overlay=true)
length = input.int(20, "Length", minval=1)
out = ta.vwap(close, length)
plot(out, color=color.navy, title="Rolling VWAP")`,
    inputSchema: [
      { name: 'length', type: 'int', default: 20, min: 1, max: 500 },
    ],
    outputConfig: [
      { name: 'rolling_vwap', type: 'line', color: '#3F51B5' },
    ],
    overlay: true,
    author: 'CITARION',
  },

  // ==================== OSCILLATORS ====================
  {
    id: 'rsi',
    name: 'Relative Strength Index',
    category: 'oscillator',
    description: 'RSI измеряет скорость и изменение ценовых движений. Значения 0-100',
    pineCode: `//@version=5
indicator("RSI", overlay=false)
length = input.int(14, "Length", minval=1)
src = close
rsi = ta.rsi(src, length)
plot(rsi, color=color.purple, title="RSI")
hline(70, "Overbought", color=color.red)
hline(30, "Oversold", color=color.green)`,
    inputSchema: [
      { name: 'length', type: 'int', default: 14, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'rsi', type: 'line', color: '#D500F9' },
    ],
    overlay: false,
    author: 'CITARION',
  },
  {
    id: 'macd',
    name: 'MACD',
    category: 'oscillator',
    description: 'Moving Average Convergence Divergence - трендовый индикатор',
    pineCode: `//@version=5
indicator("MACD", overlay=false)
fastLength = input.int(12, "Fast Length")
slowLength = input.int(26, "Slow Length")
signalLength = input.int(9, "Signal Length")
fastMA = ta.ema(close, fastLength)
slowMA = ta.ema(close, slowLength)
macd = fastMA - slowMA
signal = ta.ema(macd, signalLength)
hist = macd - signal
plot(macd, "MACD", color=color.blue)
plot(signal, "Signal", color=color.orange)
plot(hist, "Histogram", style=plot.style_histogram, color=color.green)`,
    inputSchema: [
      { name: 'fastLength', type: 'int', default: 12, min: 1, max: 100 },
      { name: 'slowLength', type: 'int', default: 26, min: 1, max: 200 },
      { name: 'signalLength', type: 'int', default: 9, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'macd', type: 'line', color: '#2962FF' },
      { name: 'signal', type: 'line', color: '#FF6D00' },
      { name: 'histogram', type: 'histogram', color: '#26a69a' },
    ],
    overlay: false,
    author: 'CITARION',
  },
  {
    id: 'stochrsi',
    name: 'Stochastic RSI',
    category: 'oscillator',
    description: 'StochRSI - стохастический осциллятор, применённый к RSI. Более чувствителен к изменениям цены, чем обычный RSI',
    pineCode: `//@version=5
indicator("StochRSI", overlay=false)
rsiPeriod = input.int(14, "RSI Period")
stochPeriod = input.int(14, "Stochastic Period")
kPeriod = input.int(3, "%K Smooth")
dPeriod = input.int(3, "%D Smooth")
rsiVal = ta.rsi(close, rsiPeriod)
k = ta.sma(ta.stoch(rsiVal, rsiVal, rsiVal, stochPeriod), kPeriod)
d = ta.sma(k, dPeriod)
plot(k, "%K", color=color.blue)
plot(d, "%D", color=color.orange)`,
    inputSchema: [
      { name: 'rsiPeriod', type: 'int', default: 14, min: 1, max: 100 },
      { name: 'stochPeriod', type: 'int', default: 14, min: 1, max: 100 },
      { name: 'kPeriod', type: 'int', default: 3, min: 1, max: 50 },
      { name: 'dPeriod', type: 'int', default: 3, min: 1, max: 50 },
    ],
    outputConfig: [
      { name: 'k', type: 'line', color: '#2962FF' },
      { name: 'd', type: 'line', color: '#FF6D00' },
    ],
    overlay: false,
    author: 'CITARION',
  },
  {
    id: 'ppo',
    name: 'PPO',
    category: 'oscillator',
    description: 'Percentage Price Oscillator - процентная версия MACD, показывает разницу между двумя EMA в процентах',
    pineCode: `//@version=5
indicator("PPO", overlay=false)
fastLength = input.int(12, "Fast Length")
slowLength = input.int(26, "Slow Length")
signalLength = input.int(9, "Signal Length")
ppo = ta.ema(close, fastLength) - ta.ema(close, slowLength)
signal = ta.ema(ppo, signalLength)
histogram = ppo - signal
plot(ppo, "PPO", color=color.blue)
plot(signal, "Signal", color=color.orange)
plot(histogram, "Histogram", style=plot.style_histogram, color=color.green)`,
    inputSchema: [
      { name: 'fastLength', type: 'int', default: 12, min: 1, max: 100 },
      { name: 'slowLength', type: 'int', default: 26, min: 1, max: 200 },
      { name: 'signalLength', type: 'int', default: 9, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'ppo', type: 'line', color: '#2962FF' },
      { name: 'signal', type: 'line', color: '#FF6D00' },
      { name: 'histogram', type: 'histogram', color: '#26a69a' },
    ],
    overlay: false,
    author: 'CITARION',
  },
  {
    id: 'williams_r',
    name: 'Williams %R',
    category: 'oscillator',
    description: 'Williams %R - моментум-индикатор, показывающий уровень закрытия относительно максимума за период. Диапазон от -100 до 0',
    pineCode: `//@version=5
indicator("Williams %R", overlay=false)
length = input.int(14, "Length")
wr = ta.wpr(length)
plot(wr, "%R", color=color.purple)
hline(-20, "Overbought", color=color.red)
hline(-80, "Oversold", color=color.green)`,
    inputSchema: [
      { name: 'length', type: 'int', default: 14, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'williams_r', type: 'line', color: '#9C27B0' },
    ],
    overlay: false,
    author: 'CITARION',
  },
  {
    id: 'cci',
    name: 'Commodity Channel Index',
    category: 'oscillator',
    description: 'CCI измеряет текущую цену относительно средней за период. Значения >+100 = перекупленность, <-100 = перепроданность',
    pineCode: `//@version=5
indicator("CCI", overlay=false)
length = input.int(20, "Length")
cci = ta.cci(close, high, low, length)
plot(cci, "CCI", color=color.blue)
hline(100, "Overbought", color=color.red)
hline(-100, "Oversold", color=color.green)`,
    inputSchema: [
      { name: 'length', type: 'int', default: 20, min: 1, max: 200 },
    ],
    outputConfig: [
      { name: 'cci', type: 'line', color: '#2962FF' },
    ],
    overlay: false,
    author: 'CITARION',
  },
  {
    id: 'mfi',
    name: 'Money Flow Index',
    category: 'oscillator',
    description: 'MFI - осциллятор, использующий цену и объём для измерения давления покупки/продажи. RSI с учётом объёма',
    pineCode: `//@version=5
indicator("MFI", overlay=false)
length = input.int(14, "Length")
mfi = ta.mfi(close, high, low, volume, length)
plot(mfi, "MFI", color=color.green)
hline(80, "Overbought", color=color.red)
hline(20, "Oversold", color=color.green)`,
    inputSchema: [
      { name: 'length', type: 'int', default: 14, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'mfi', type: 'line', color: '#26A69A' },
    ],
    overlay: false,
    author: 'CITARION',
  },
  {
    id: 'roc',
    name: 'Rate of Change',
    category: 'oscillator',
    description: 'ROC измеряет процентное изменение цены за период. Положительные значения = рост, отрицательные = падение',
    pineCode: `//@version=5
indicator("ROC", overlay=false)
length = input.int(10, "Length")
roc = ta.roc(close, length)
plot(roc, "ROC", color=color.blue)
hline(0, "Zero", color=color.gray)`,
    inputSchema: [
      { name: 'length', type: 'int', default: 10, min: 1, max: 200 },
    ],
    outputConfig: [
      { name: 'roc', type: 'line', color: '#2962FF' },
    ],
    overlay: false,
    author: 'CITARION',
  },
  {
    id: 'momentum',
    name: 'Momentum',
    category: 'oscillator',
    description: 'Momentum - разница между текущей ценой и ценой N периодов назад. Показывает скорость движения цены',
    pineCode: `//@version=5
indicator("Momentum", overlay=false)
length = input.int(10, "Length")
mom = close - close[length]
plot(mom, "Momentum", color=color.purple)
hline(0, "Zero", color=color.gray)`,
    inputSchema: [
      { name: 'length', type: 'int', default: 10, min: 1, max: 200 },
    ],
    outputConfig: [
      { name: 'momentum', type: 'line', color: '#9C27B0' },
    ],
    overlay: false,
    author: 'CITARION',
  },
  {
    id: 'cmo',
    name: 'Chande Momentum Oscillator',
    category: 'oscillator',
    description: 'CMO - осциллятор моментума Чанде, измеряет силу тренда. Диапазон от -100 до +100',
    pineCode: `//@version=5
indicator("CMO", overlay=false)
length = input.int(14, "Length")
cmo = ta.cmo(close, length)
plot(cmo, "CMO", color=color.teal)
hline(50, "Overbought", color=color.red)
hline(-50, "Oversold", color=color.green)`,
    inputSchema: [
      { name: 'length', type: 'int', default: 14, min: 1, max: 200 },
    ],
    outputConfig: [
      { name: 'cmo', type: 'line', color: '#009688' },
    ],
    overlay: false,
    author: 'CITARION',
  },
  {
    id: 'ultimate_osc',
    name: 'Ultimate Oscillator',
    category: 'oscillator',
    description: 'Ultimate Oscillator - взвешенный осциллятор Ларри Вильямса, использует три разных таймфрейма',
    pineCode: `//@version=5
indicator("Ultimate Oscillator", overlay=false)
period1 = input.int(7, "Period 1")
period2 = input.int(14, "Period 2")
period3 = input.int(28, "Period 3")
uo = ta.uo(close, high, low, period1, period2, period3)
plot(uo, "UO", color=color.blue)
hline(70, "Overbought", color=color.red)
hline(30, "Oversold", color=color.green)`,
    inputSchema: [
      { name: 'period1', type: 'int', default: 7, min: 1, max: 100 },
      { name: 'period2', type: 'int', default: 14, min: 1, max: 100 },
      { name: 'period3', type: 'int', default: 28, min: 1, max: 200 },
    ],
    outputConfig: [
      { name: 'ultimate_osc', type: 'line', color: '#2962FF' },
    ],
    overlay: false,
    author: 'CITARION',
  },
  {
    id: 'ao',
    name: 'Awesome Oscillator',
    category: 'oscillator',
    description: 'AO Билла Вильямса - разница между 5 и 34-периодной SMA медианной цены. Показывает силу тренда',
    pineCode: `//@version=5
indicator("Awesome Oscillator", overlay=false)
ao = ta.ao(high, low, close)
plot(ao, "AO", style=plot.style_histogram, color=ao >= 0 ? ao >= ao[1] ? color.green : color.lime : ao <= ao[1] ? color.red : color.maroon)`,
    inputSchema: [
      { name: 'fastPeriod', type: 'int', default: 5, min: 1, max: 50 },
      { name: 'slowPeriod', type: 'int', default: 34, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'ao', type: 'histogram', color: '#26A69A' },
    ],
    overlay: false,
    author: 'CITARION',
  },
  {
    id: 'ac',
    name: 'Accelerator Oscillator',
    category: 'oscillator',
    description: 'AC Билла Вильямса - разница между AO и его 5-периодной SMA. Показывает ускорение моментума',
    pineCode: `//@version=5
indicator("Accelerator Oscillator", overlay=false)
ao = ta.ao(high, low, close)
ac = ao - ta.sma(ao, 5)
plot(ac, "AC", style=plot.style_histogram, color=ac >= 0 ? ac >= ac[1] ? color.green : color.lime : ac <= ac[1] ? color.red : color.maroon)`,
    inputSchema: [],
    outputConfig: [
      { name: 'ac', type: 'histogram', color: '#4CAF50' },
    ],
    overlay: false,
    author: 'CITARION',
  },
  {
    id: 'tsi',
    name: 'True Strength Index',
    category: 'oscillator',
    description: 'TSI - индекс истинной силы, сглаженный моментум с двойным сглаживанием. Показывает силу тренда',
    pineCode: `//@version=5
indicator("TSI", overlay=false)
longLength = input.int(25, "Long Length")
shortLength = input.int(13, "Short Length")
tsi = 100 * ta.ema(ta.ema(close - close[1], longLength), shortLength) / ta.ema(ta.ema(math.abs(close - close[1]), longLength), shortLength)
plot(tsi, "TSI", color=color.blue)`,
    inputSchema: [
      { name: 'longLength', type: 'int', default: 25, min: 1, max: 100 },
      { name: 'shortLength', type: 'int', default: 13, min: 1, max: 50 },
    ],
    outputConfig: [
      { name: 'tsi', type: 'line', color: '#2962FF' },
    ],
    overlay: false,
    author: 'CITARION',
  },
  {
    id: 'vortex',
    name: 'Vortex Indicator',
    category: 'oscillator',
    description: 'Vortex Indicator - определяет начало тренда через положительные и отрицательные вихревые движения',
    pineCode: `//@version=5
indicator("Vortex Indicator", overlay=false)
length = input.int(14, "Length")
[plusVI, minusVI] = ta.vortex(high, low, close, length)
plot(plusVI, "+VI", color=color.green)
plot(minusVI, "-VI", color=color.red)`,
    inputSchema: [
      { name: 'length', type: 'int', default: 14, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'plusVI', type: 'line', color: '#26A69A' },
      { name: 'minusVI', type: 'line', color: '#EF5350' },
    ],
    overlay: false,
    author: 'CITARION',
  },
  {
    id: 'aroon',
    name: 'Aroon',
    category: 'oscillator',
    description: 'Aroon - определяет силу тренда и его направление через время с последнего максимума/минимума',
    pineCode: `//@version=5
indicator("Aroon", overlay=false)
length = input.int(14, "Length")
[aroonUp, aroonDown] = ta.aroon(high, low, length)
oscillator = aroonUp - aroonDown
plot(aroonUp, "Aroon Up", color=color.green)
plot(aroonDown, "Aroon Down", color=color.red)
plot(oscillator, "Oscillator", style=plot.style_histogram, color=color.blue)`,
    inputSchema: [
      { name: 'length', type: 'int', default: 14, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'aroon_up', type: 'line', color: '#26A69A' },
      { name: 'aroon_down', type: 'line', color: '#EF5350' },
      { name: 'oscillator', type: 'histogram', color: '#2962FF' },
    ],
    overlay: false,
    author: 'CITARION',
  },

  // ==================== VOLATILITY ====================
  {
    id: 'bb',
    name: 'Bollinger Bands',
    category: 'volatility',
    description: 'Bollinger Bands показывают волатильность и потенциальные развороты',
    pineCode: `//@version=5
indicator("Bollinger Bands", overlay=true)
length = input.int(20, "Length", minval=1)
mult = input.float(2.0, "Multiplier", minval=0.1, step=0.1)
src = close
basis = ta.sma(src, length)
dev = mult * ta.stdev(src, length)
upper = basis + dev
lower = basis - dev
plot(basis, "Basis", color=color.orange)
p1 = plot(upper, "Upper", color=color.blue)
p2 = plot(lower, "Lower", color=color.blue)
fill(p1, p2, color=color.blue, transp=90)`,
    inputSchema: [
      { name: 'length', type: 'int', default: 20, min: 1, max: 200 },
      { name: 'mult', type: 'float', default: 2.0, min: 0.1, max: 5.0 },
    ],
    outputConfig: [
      { name: 'upper', type: 'line', color: '#2962FF' },
      { name: 'middle', type: 'line', color: '#FF6D00' },
      { name: 'lower', type: 'line', color: '#2962FF' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'atr',
    name: 'Average True Range',
    category: 'volatility',
    description: 'ATR измеряет волатильность рынка',
    pineCode: `//@version=5
indicator("ATR", overlay=false)
length = input.int(14, "Length", minval=1)
atr = ta.atr(length)
plot(atr, "ATR", color=color.orange)`,
    inputSchema: [
      { name: 'length', type: 'int', default: 14, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'atr', type: 'line', color: '#FF6D00' },
    ],
    overlay: false,
    author: 'CITARION',
  },
  {
    id: 'true_range',
    name: 'True Range',
    category: 'volatility',
    description: 'True Range - истинный диапазон, измеряет волатильность одного периода с учётом гэпов',
    pineCode: `//@version=5
indicator("True Range", overlay=false)
tr = ta.tr
plot(tr, "TR", color=color.orange)`,
    inputSchema: [],
    outputConfig: [
      { name: 'true_range', type: 'line', color: '#FF6D00' },
    ],
    overlay: false,
    author: 'CITARION',
  },
  {
    id: 'donchian',
    name: 'Donchian Channels',
    category: 'volatility',
    description: 'Donchian Channels - канал из максимума и минимума за период, показывает границы ценового диапазона',
    pineCode: `//@version=5
indicator("Donchian Channels", overlay=true)
length = input.int(20, "Length")
upper = ta.highest(high, length)
lower = ta.lowest(low, length)
middle = (upper + lower) / 2
plot(upper, "Upper", color=color.blue)
plot(middle, "Middle", color=color.orange)
plot(lower, "Lower", color=color.blue)`,
    inputSchema: [
      { name: 'length', type: 'int', default: 20, min: 1, max: 200 },
    ],
    outputConfig: [
      { name: 'upper', type: 'line', color: '#2962FF' },
      { name: 'middle', type: 'line', color: '#FF6D00' },
      { name: 'lower', type: 'line', color: '#2962FF' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'stddev',
    name: 'Standard Deviation',
    category: 'volatility',
    description: 'Standard Deviation - стандартное отклонение цены, измеряет разброс цен относительно средней',
    pineCode: `//@version=5
indicator("Standard Deviation", overlay=false)
length = input.int(20, "Length")
std = ta.stdev(close, length)
plot(std, "StdDev", color=color.purple)`,
    inputSchema: [
      { name: 'length', type: 'int', default: 20, min: 1, max: 200 },
    ],
    outputConfig: [
      { name: 'stddev', type: 'line', color: '#9C27B0' },
    ],
    overlay: false,
    author: 'CITARION',
  },
  {
    id: 'hist_vol',
    name: 'Historical Volatility',
    category: 'volatility',
    description: 'Historical Volatility - историческая волатильность, годовое стандартное отклонение доходности',
    pineCode: `//@version=5
indicator("Historical Volatility", overlay=false)
length = input.int(20, "Length")
annualize = input.bool(true, "Annualize")
returns = ta.log(close / close[1])
std = ta.stdev(returns, length)
hv = annualize ? std * math.sqrt(252) * 100 : std * 100
plot(hv, "HV", color=color.teal)`,
    inputSchema: [
      { name: 'length', type: 'int', default: 20, min: 1, max: 200 },
      { name: 'annualize', type: 'bool', default: true },
    ],
    outputConfig: [
      { name: 'hist_vol', type: 'line', color: '#009688' },
    ],
    overlay: false,
    author: 'CITARION',
  },
  {
    id: 'natr',
    name: 'Normalized ATR',
    category: 'volatility',
    description: 'NATR - нормализованный ATR в процентах от цены, позволяет сравнивать волатильность разных активов',
    pineCode: `//@version=5
indicator("NATR", overlay=false)
length = input.int(14, "Length")
natr = ta.atr(length) / close * 100
plot(natr, "NATR", color=color.orange)`,
    inputSchema: [
      { name: 'length', type: 'int', default: 14, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'natr', type: 'line', color: '#FF6D00' },
    ],
    overlay: false,
    author: 'CITARION',
  },
  {
    id: 'psar',
    name: 'Parabolic SAR',
    category: 'volatility',
    description: 'Parabolic SAR - Stop And Reverse, показывает уровни стоп-лосс и направление тренда',
    pineCode: `//@version=5
indicator("Parabolic SAR", overlay=true)
start = input.float(0.02, "Start")
increment = input.float(0.02, "Increment")
maximum = input.float(0.2, "Maximum")
sar = ta.sar(start, increment, maximum)
plot(sar, "SAR", style=plot.style_circles, color=color.red)`,
    inputSchema: [
      { name: 'start', type: 'float', default: 0.02, min: 0.001, max: 0.1 },
      { name: 'increment', type: 'float', default: 0.02, min: 0.001, max: 0.1 },
      { name: 'maximum', type: 'float', default: 0.2, min: 0.01, max: 0.5 },
    ],
    outputConfig: [
      { name: 'psar', type: 'line', color: '#EF5350' },
    ],
    overlay: true,
    author: 'CITARION',
  },

  // ==================== VOLUME ====================
  {
    id: 'vol_sma',
    name: 'Volume SMA',
    category: 'volume',
    description: 'SMA объёма показывает средний объём торгов',
    pineCode: `//@version=5
indicator("Volume SMA", overlay=false)
length = input.int(20, "Length", minval=1)
vol = volume
volSMA = ta.sma(vol, length)
plot(vol, "Volume", style=plot.style_columns, color=color.new(color.blue, 50))
plot(volSMA, "Volume SMA", color=color.orange)`,
    inputSchema: [
      { name: 'length', type: 'int', default: 20, min: 1, max: 200 },
    ],
    outputConfig: [
      { name: 'volume', type: 'histogram', color: '#2962FF' },
      { name: 'volSMA', type: 'line', color: '#FF6D00' },
    ],
    overlay: false,
    author: 'CITARION',
  },
  {
    id: 'obv',
    name: 'On-Balance Volume',
    category: 'volume',
    description: 'OBV - кумулятивный индикатор объёма, добавляет объём при росте цены и вычитает при падении',
    pineCode: `//@version=5
indicator("OBV", overlay=false)
obv = ta.obv
plot(obv, "OBV", color=color.blue)`,
    inputSchema: [],
    outputConfig: [
      { name: 'obv', type: 'line', color: '#2962FF' },
    ],
    overlay: false,
    author: 'CITARION',
  },
  {
    id: 'cmf',
    name: 'Chaikin Money Flow',
    category: 'volume',
    description: 'CMF - индикатор денежного потока Чайкина, измеряет давление покупки/продажи на основе объёма',
    pineCode: `//@version=5
indicator("CMF", overlay=false)
length = input.int(20, "Length")
cmf = ta.cmf(close, high, low, volume, length)
plot(cmf, "CMF", color=color.green)
hline(0, "Zero", color=color.gray)`,
    inputSchema: [
      { name: 'length', type: 'int', default: 20, min: 1, max: 200 },
    ],
    outputConfig: [
      { name: 'cmf', type: 'line', color: '#26A69A' },
    ],
    overlay: false,
    author: 'CITARION',
  },
  {
    id: 'adl',
    name: 'Accumulation/Distribution Line',
    category: 'volume',
    description: 'ADL - линия накопления/распределения, кумулятивный индикатор на основе позиции закрытия в диапазоне',
    pineCode: `//@version=5
indicator("ADL", overlay=false)
ad = ta.ad
plot(ad, "ADL", color=color.blue)`,
    inputSchema: [],
    outputConfig: [
      { name: 'adl', type: 'line', color: '#2962FF' },
    ],
    overlay: false,
    author: 'CITARION',
  },
  {
    id: 'vol_osc',
    name: 'Volume Oscillator',
    category: 'volume',
    description: 'Volume Oscillator - разница между двумя MA объёма, показывает тренд объёма',
    pineCode: `//@version=5
indicator("Volume Oscillator", overlay=false)
fastLength = input.int(5, "Fast Length")
slowLength = input.int(10, "Slow Length")
volOsc = ta.sma(volume, fastLength) - ta.sma(volume, slowLength)
plot(volOsc, "Volume Osc", style=plot.style_histogram, color=volOsc >= 0 ? color.green : color.red)`,
    inputSchema: [
      { name: 'fastLength', type: 'int', default: 5, min: 1, max: 100 },
      { name: 'slowLength', type: 'int', default: 10, min: 1, max: 200 },
    ],
    outputConfig: [
      { name: 'vol_osc', type: 'histogram', color: '#26A69A' },
    ],
    overlay: false,
    author: 'CITARION',
  },
  {
    id: 'emv',
    name: 'Ease of Movement',
    category: 'volume',
    description: 'EMV - индикатор лёгкости движения, показывает связь между ценой и объёмом',
    pineCode: `//@version=5
indicator("Ease of Movement", overlay=false)
length = input.int(14, "Length")
divisor = input.int(10000, "Divisor")
emv = ta.emv(close, high, low, volume, divisor)
plot(ta.sma(emv, length), "EMV", color=color.teal)
hline(0, "Zero", color=color.gray)`,
    inputSchema: [
      { name: 'length', type: 'int', default: 14, min: 1, max: 100 },
      { name: 'divisor', type: 'int', default: 10000, min: 100, max: 100000 },
    ],
    outputConfig: [
      { name: 'emv', type: 'line', color: '#009688' },
    ],
    overlay: false,
    author: 'CITARION',
  },

  // ==================== PIVOT POINTS ====================
  {
    id: 'pivot_standard',
    name: 'Pivot Points (Standard)',
    category: 'pivot',
    description: 'Standard Floor Pivot Points - наиболее распространённый тип пивотов на основе HLC предыдущего периода',
    pineCode: `//@version=5
indicator("Pivot Points Standard", overlay=true)
// Standard Pivot Points
// PP = (High + Low + Close) / 3
// R1 = 2*PP - Low, S1 = 2*PP - High
// R2 = PP + (High - Low), S2 = PP - (High - Low)
// R3 = High + 2*(PP - Low), S3 = Low - 2*(High - PP)`,
    inputSchema: [
      { name: 'type', type: 'string', default: 'standard', options: ['standard', 'fibonacci', 'camarilla', 'woodie', 'demark'] },
      { name: 'useWeekly', type: 'bool', default: false },
      { name: 'useMonthly', type: 'bool', default: false },
    ],
    outputConfig: [
      { name: 'pivot', type: 'line', color: '#FFD700' },
      { name: 'r1', type: 'line', color: '#EF5350' },
      { name: 'r2', type: 'line', color: '#E91E63' },
      { name: 'r3', type: 'line', color: '#CE93D8' },
      { name: 's1', type: 'line', color: '#26A69A' },
      { name: 's2', type: 'line', color: '#66BB6A' },
      { name: 's3', type: 'line', color: '#A5D6A7' },
    ],
    overlay: true,
    author: 'ai-technicals',
  },
  {
    id: 'pivot_fibonacci',
    name: 'Pivot Points (Fibonacci)',
    category: 'pivot',
    description: 'Fibonacci Pivot Points - используют уровни Фибоначчи для расчёта поддержки и сопротивления',
    pineCode: `//@version=5
indicator("Pivot Points Fibonacci", overlay=true)
// Fibonacci Pivot Points
// PP = (High + Low + Close) / 3
// R1 = PP + 0.382*(High-Low), S1 = PP - 0.382*(High-Low)
// R2 = PP + 0.618*(High-Low), S2 = PP - 0.618*(High-Low)
// R3 = PP + 1.000*(High-Low), S3 = PP - 1.000*(High-Low)`,
    inputSchema: [
      { name: 'type', type: 'string', default: 'fibonacci', options: ['standard', 'fibonacci', 'camarilla', 'woodie', 'demark'] },
      { name: 'useWeekly', type: 'bool', default: false },
      { name: 'useMonthly', type: 'bool', default: false },
    ],
    outputConfig: [
      { name: 'pivot', type: 'line', color: '#FFD700' },
      { name: 'r1', type: 'line', color: '#EF5350' },
      { name: 'r2', type: 'line', color: '#E91E63' },
      { name: 'r3', type: 'line', color: '#CE93D8' },
      { name: 's1', type: 'line', color: '#26A69A' },
      { name: 's2', type: 'line', color: '#66BB6A' },
      { name: 's3', type: 'line', color: '#A5D6A7' },
    ],
    overlay: true,
    author: 'ai-technicals',
  },
  {
    id: 'pivot_camarilla',
    name: 'Pivot Points (Camarilla)',
    category: 'pivot',
    description: 'Camarilla Pivot Points - разработаны Ником Стоттом, используют особую формулу с фактором диапазона',
    pineCode: `//@version=5
indicator("Pivot Points Camarilla", overlay=true)
// Camarilla Pivot Points
// R1 = Close + (High-Low)*1.1/12
// S1 = Close - (High-Low)*1.1/12
// R4 = Close + (High-Low)*1.1/2
// S4 = Close - (High-Low)*1.1/2`,
    inputSchema: [
      { name: 'type', type: 'string', default: 'camarilla', options: ['standard', 'fibonacci', 'camarilla', 'woodie', 'demark'] },
      { name: 'useWeekly', type: 'bool', default: false },
      { name: 'useMonthly', type: 'bool', default: false },
    ],
    outputConfig: [
      { name: 'pivot', type: 'line', color: '#FFD700' },
      { name: 'r1', type: 'line', color: '#EF5350' },
      { name: 'r2', type: 'line', color: '#E91E63' },
      { name: 'r3', type: 'line', color: '#CE93D8' },
      { name: 'r4', type: 'line', color: '#AB47BC' },
      { name: 's1', type: 'line', color: '#26A69A' },
      { name: 's2', type: 'line', color: '#66BB6A' },
      { name: 's3', type: 'line', color: '#A5D6A7' },
      { name: 's4', type: 'line', color: '#81C784' },
    ],
    overlay: true,
    author: 'ai-technicals',
  },
  {
    id: 'pivot_woodie',
    name: 'Pivot Points (Woodie)',
    category: 'pivot',
    description: 'Woodie Pivot Points - придают больший вес цене закрытия в расчётах',
    pineCode: `//@version=5
indicator("Pivot Points Woodie", overlay=true)
// Woodie Pivot Points
// PP = (High + Low + 2*Close) / 4
// R1 = 2*PP - Low, S1 = 2*PP - High
// R2 = PP + High - Low, S2 = PP - High + Low`,
    inputSchema: [
      { name: 'type', type: 'string', default: 'woodie', options: ['standard', 'fibonacci', 'camarilla', 'woodie', 'demark'] },
      { name: 'useWeekly', type: 'bool', default: false },
      { name: 'useMonthly', type: 'bool', default: false },
    ],
    outputConfig: [
      { name: 'pivot', type: 'line', color: '#FFD700' },
      { name: 'r1', type: 'line', color: '#EF5350' },
      { name: 'r2', type: 'line', color: '#E91E63' },
      { name: 'r3', type: 'line', color: '#CE93D8' },
      { name: 's1', type: 'line', color: '#26A69A' },
      { name: 's2', type: 'line', color: '#66BB6A' },
      { name: 's3', type: 'line', color: '#A5D6A7' },
    ],
    overlay: true,
    author: 'ai-technicals',
  },
  {
    id: 'pivot_demark',
    name: 'Pivot Points (Demark)',
    category: 'pivot',
    description: 'Demark Pivot Points - созданы Томом Демарком, используют цену открытия для определения формулы',
    pineCode: `//@version=5
indicator("Pivot Points Demark", overlay=true)
// Demark Pivot Points
// If Close < Open: X = High + 2*Low + Close
// If Close > Open: X = 2*High + Low + Close
// If Close = Open: X = High + Low + 2*Close
// PP = X/4, R1 = X/2 - Low, S1 = X/2 - High`,
    inputSchema: [
      { name: 'type', type: 'string', default: 'demark', options: ['standard', 'fibonacci', 'camarilla', 'woodie', 'demark'] },
      { name: 'useWeekly', type: 'bool', default: false },
      { name: 'useMonthly', type: 'bool', default: false },
    ],
    outputConfig: [
      { name: 'pivot', type: 'line', color: '#FFD700' },
      { name: 'r1', type: 'line', color: '#EF5350' },
      { name: 's1', type: 'line', color: '#26A69A' },
    ],
    overlay: true,
    author: 'ai-technicals',
  },

  // ==================== FIBONACCI ====================
  {
    id: 'fib_retracement',
    name: 'Fibonacci Retracement',
    category: 'fibonacci',
    description: 'Fibonacci Retracement - уровни коррекции Фибоначчи для определения поддержки и сопротивления',
    pineCode: `//@version=5
indicator("Fibonacci Retracement", overlay=true)
lookback = input.int(100, "Lookback Period")
highPrice = ta.highest(high, lookback)
lowPrice = ta.lowest(low, lookback)
diff = highPrice - lowPrice
level0 = highPrice
level236 = highPrice - 0.236 * diff
level382 = highPrice - 0.382 * diff
level500 = highPrice - 0.5 * diff
level618 = highPrice - 0.618 * diff
level786 = highPrice - 0.786 * diff
level1000 = lowPrice
plot(level0, "0%", color=color.red)
plot(level236, "23.6%", color=color.orange)
plot(level382, "38.2%", color=color.yellow)
plot(level500, "50%", color=color.green)
plot(level618, "61.8%", color=color.blue)
plot(level786, "78.6%", color=color.purple)
plot(level1000, "100%", color=color.red)`,
    inputSchema: [
      { name: 'lookback', type: 'int', default: 100, min: 10, max: 500 },
    ],
    outputConfig: [
      { name: 'level0', type: 'line', color: '#EF5350' },
      { name: 'level236', type: 'line', color: '#FF9800' },
      { name: 'level382', type: 'line', color: '#FFEB3B' },
      { name: 'level500', type: 'line', color: '#4CAF50' },
      { name: 'level618', type: 'line', color: '#2962FF' },
      { name: 'level786', type: 'line', color: '#9C27B0' },
      { name: 'level1000', type: 'line', color: '#EF5350' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'fib_extensions',
    name: 'Fibonacci Extensions',
    category: 'fibonacci',
    description: 'Fibonacci Extensions - уровни расширения Фибоначчи для определения целей движения',
    pineCode: `//@version=5
indicator("Fibonacci Extensions", overlay=true)
lookback = input.int(50, "Lookback Period")
highPrice = ta.highest(high, lookback)
lowPrice = ta.lowest(low, lookback)
diff = highPrice - lowPrice
level618 = highPrice + 0.618 * diff
level1000 = highPrice + 1.0 * diff
level1618 = highPrice + 1.618 * diff
plot(highPrice, "High", color=color.red)
plot(level618, "61.8%", color=color.green)
plot(level1000, "100%", color=color.blue)
plot(level1618, "161.8%", color=color.purple)`,
    inputSchema: [
      { name: 'lookback', type: 'int', default: 50, min: 10, max: 500 },
    ],
    outputConfig: [
      { name: 'high', type: 'line', color: '#EF5350' },
      { name: 'level618', type: 'line', color: '#4CAF50' },
      { name: 'level1000', type: 'line', color: '#2962FF' },
      { name: 'level1618', type: 'line', color: '#9C27B0' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'fib_levels',
    name: 'Fibonacci Levels',
    category: 'fibonacci',
    description: 'Fibonacci Levels - динамические уровни Фибоначчи на основе последнего движения цены',
    pineCode: `//@version=5
indicator("Fibonacci Levels", overlay=true)
length = input.int(20, "Period")
highest = ta.highest(high, length)
lowest = ta.lowest(low, length)
range_val = highest - lowest
level0 = highest
level236 = highest - range_val * 0.236
level382 = highest - range_val * 0.382
level500 = highest - range_val * 0.5
level618 = highest - range_val * 0.618
level1000 = lowest
plot(level0, "0%", color=color.red, style=plot.style_stepline)
plot(level382, "38.2%", color=color.orange, style=plot.style_stepline)
plot(level618, "61.8%", color=color.blue, style=plot.style_stepline)
plot(level1000, "100%", color=color.green, style=plot.style_stepline)`,
    inputSchema: [
      { name: 'length', type: 'int', default: 20, min: 5, max: 200 },
    ],
    outputConfig: [
      { name: 'level0', type: 'line', color: '#EF5350' },
      { name: 'level382', type: 'line', color: '#FF9800' },
      { name: 'level618', type: 'line', color: '#2962FF' },
      { name: 'level1000', type: 'line', color: '#4CAF50' },
    ],
    overlay: true,
    author: 'CITARION',
  },

  // ==================== TREND ====================
  {
    id: 'dmi',
    name: 'DMI (Directional Movement)',
    category: 'trend',
    description: 'DMI - индекс направленного движения, показывает силу и направление тренда через +DI и -DI',
    pineCode: `//@version=5
indicator("DMI", overlay=false)
length = input.int(14, "Length")
[plusDI, minusDI, adx] = ta.dmi(length, length)
plot(plusDI, "+DI", color=color.green)
plot(minusDI, "-DI", color=color.red)
plot(adx, "ADX", color=color.blue)`,
    inputSchema: [
      { name: 'length', type: 'int', default: 14, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'plusDI', type: 'line', color: '#26A69A' },
      { name: 'minusDI', type: 'line', color: '#EF5350' },
      { name: 'adx', type: 'line', color: '#2962FF' },
    ],
    overlay: false,
    author: 'CITARION',
  },

  // ==================== ICHIMOKU ====================
  {
    id: 'ichimoku',
    name: 'Ichimoku Cloud',
    category: '',
    description: 'Ichimoku Kinko Hyo - комплексный индикатор, определяющий тренд, поддержку/сопротивление и сигналы',
    pineCode: `//@version=5
indicator("Ichimoku Cloud", overlay=true)
conversionPeriods = input.int(9, "Tenkan-sen")
basePeriods = input.int(26, "Kijun-sen")
laggingSpan2Periods = input.int(52, "Senkou Span B")
displacement = input.int(26, "Displacement")

Tenkan = ta.highest(high, conversionPeriods) + ta.lowest(low, conversionPeriods) / 2
Kijun = ta.highest(high, basePeriods) + ta.lowest(low, basePeriods) / 2
SenkouA = (Tenkan + Kijun) / 2
SenkouB = (ta.highest(high, laggingSpan2Periods) + ta.lowest(low, laggingSpan2Periods)) / 2

plot(Tenkan, "Tenkan-sen", color=color.blue)
plot(Kijun, "Kijun-sen", color=color.red)
plot(close, "Chikou Span", color=color.green, offset=-displacement)
p1 = plot(SenkouA, "Senkou Span A", offset=displacement, color=color.green)
p2 = plot(SenkouB, "Senkou Span B", offset=displacement, color=color.red)
fill(p1, p2, color=SenkouA > SenkouB ? color.green : color.red)`,
    inputSchema: [
      { name: 'tenkanPeriod', type: 'int', default: 9, min: 1, max: 100 },
      { name: 'kijunPeriod', type: 'int', default: 26, min: 1, max: 100 },
      { name: 'senkouBPeriod', type: 'int', default: 52, min: 1, max: 200 },
      { name: 'displacement', type: 'int', default: 26, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'tenkan', type: 'line', color: '#2962FF' },
      { name: 'kijun', type: 'line', color: '#FF6D00' },
      { name: 'senkouA', type: 'line', color: '#26A69A' },
      { name: 'senkouB', type: 'line', color: '#EF5350' },
      { name: 'chikou', type: 'line', color: '#9C27B0' },
    ],
    overlay: true,
    author: 'ai-technicals',
  },

  // ==================== DEPTH INDICATORS ====================
  {
    id: 'depth_delta',
    name: 'Depth Delta',
    category: 'depth',
    description: 'Order Book Delta - дисбаланс объёмов bids/asks, показывает давление покупателей/продавцов',
    pineCode: `//@version=5
indicator("Depth Delta", overlay=false)
// Delta = Bid Volume - Ask Volume
// Positive = Buy Pressure, Negative = Sell Pressure
// Requires order book data feed`,
    inputSchema: [
      { name: 'levels', type: 'int', default: 20, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'delta', type: 'histogram', color: '#26A69A' },
    ],
    overlay: false,
    author: 'ai-technicals',
  },
  {
    id: 'depth_imbalance',
    name: 'Depth Imbalance',
    category: 'depth',
    description: 'Order Book Imbalance - нормализованный дисбаланс от -1 до 1 для анализа давления рынка',
    pineCode: `//@version=5
indicator("Depth Imbalance", overlay=false)
// Imbalance = (BidVol - AskVol) / (BidVol + AskVol)
// Range: -1 (100% asks) to +1 (100% bids)
// Requires order book data feed`,
    inputSchema: [
      { name: 'levels', type: 'int', default: 20, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'imbalance', type: 'line', color: '#9C27B0' },
    ],
    overlay: false,
    author: 'ai-technicals',
  },
  {
    id: 'depth_weighted_mid',
    name: 'Depth Weighted Mid Price',
    category: 'depth',
    description: 'Volume-Weighted Mid Price - взвешенная по объёму средняя цена из order book',
    pineCode: `//@version=5
indicator("Depth Weighted Mid Price", overlay=true)
// Weighted Mid = (BidVWAP*BidVol + AskVWAP*AskVol) / TotalVol
// More accurate than simple mid-price when volume is imbalanced`,
    inputSchema: [
      { name: 'levels', type: 'int', default: 20, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'simple_mid', type: 'line', color: '#FFD700' },
      { name: 'weighted_mid', type: 'line', color: '#00BCD4' },
    ],
    overlay: true,
    author: 'ai-technicals',
  },
  {
    id: 'depth_true_range',
    name: 'Depth True Range',
    category: 'depth',
    description: 'Depth True Range - волатильность на основе глубины order book, показывает разброс цен в стакане',
    pineCode: `//@version=5
indicator("Depth True Range", overlay=false)
// Calculates range from order book depth levels
// Shows bid/ask spread depth volatility`,
    inputSchema: [
      { name: 'levels', type: 'int', default: 20, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'depth_tr', type: 'line', color: '#FF6D00' },
    ],
    overlay: false,
    author: 'ai-technicals',
  },
  {
    id: 'depth_block_points',
    name: 'Depth Block Points',
    category: 'depth',
    description: 'Depth Block Points - определяет крупные ордера в order book, которые могут служить поддержкой/сопротивлением',
    pineCode: `//@version=5
indicator("Depth Block Points", overlay=true)
// Identifies large orders (blocks) in the order book
// These act as support/resistance levels`,
    inputSchema: [
      { name: 'levels', type: 'int', default: 20, min: 1, max: 100 },
      { name: 'threshold', type: 'float', default: 3.0, min: 1.0, max: 10.0 },
    ],
    outputConfig: [
      { name: 'bid_blocks', type: 'line', color: '#26A69A' },
      { name: 'ask_blocks', type: 'line', color: '#EF5350' },
    ],
    overlay: true,
    author: 'ai-technicals',
  },
  {
    id: 'depth_pressure',
    name: 'Depth Pressure',
    category: 'depth',
    description: 'Depth Pressure - индикатор давления рынка на основе дисбаланса order book, показывает направление давления',
    pineCode: `//@version=5
indicator("Depth Pressure", overlay=false)
// Pressure indicator based on order book imbalance
// Positive = buy pressure, Negative = sell pressure`,
    inputSchema: [
      { name: 'levels', type: 'int', default: 20, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'pressure', type: 'line', color: '#9C27B0' },
      { name: 'strength', type: 'line', color: '#FF6D00' },
    ],
    overlay: false,
    author: 'ai-technicals',
  },

  // ==================== FRACTALS ====================
  {
    id: 'fractals',
    name: 'Williams Fractals',
    category: '',
    description: 'Williams Fractals - определение разворотных точек по паттернам из 5 баров. Бычий фрактал - минимум ниже соседних, медвежий - максимум выше соседних',
    pineCode: `//@version=5
indicator("Williams Fractals", overlay=true)
// Bullish Fractal: Low is lower than the 2 lows on each side
// Bearish Fractal: High is higher than the 2 highs on each side
period = input.int(2, "Period", minval=1, maxval=10)

// Detect fractals
bullishFractal = low[period] < low[period-1] and low[period] < low[period+1]
bearishFractal = high[period] > high[period-1] and high[period] > high[period+1]

plotshape(bullishFractal, "Bullish", shape.triangleup, location.belowbar, color.green, size=size.small)
plotshape(bearishFractal, "Bearish", shape.triangledown, location.abovebar, color.red, size=size.small)`,
    inputSchema: [
      { name: 'period', type: 'int', default: 2, min: 1, max: 10 },
      { name: 'showBullish', type: 'bool', default: true },
      { name: 'showBearish', type: 'bool', default: true },
    ],
    outputConfig: [
      { name: 'bullish', type: 'line', color: '#26A69A' },
      { name: 'bearish', type: 'line', color: '#EF5350' },
    ],
    overlay: true,
    author: 'ai-technicals',
  },

  // ==================== QUANTCLUB PORTED INDICATORS ====================
  {
    id: 'stochastic',
    name: 'Stochastic Oscillator',
    category: 'oscillator',
    description: 'Stochastic Oscillator - показывает позицию закрытия относительно диапазона High-Low за период. %K выше 80 = перекупленность, ниже 20 = перепроданность',
    pineCode: `//@version=5
indicator("Stochastic", overlay=false)
kPeriod = input.int(14, "%K Period")
dPeriod = input.int(3, "%D Period")
smoothK = input.int(1, "Smooth %K")
k = ta.sma(ta.stoch(close, high, low, kPeriod), smoothK)
d = ta.sma(k, dPeriod)
plot(k, "%K", color=color.blue)
plot(d, "%D", color=color.orange)
hline(80, "Overbought", color=color.red)
hline(20, "Oversold", color=color.green)`,
    inputSchema: [
      { name: 'kPeriod', type: 'int', default: 14, min: 1, max: 100 },
      { name: 'dPeriod', type: 'int', default: 3, min: 1, max: 50 },
      { name: 'smoothK', type: 'int', default: 1, min: 1, max: 10 },
    ],
    outputConfig: [
      { name: 'k', type: 'line', color: '#2962FF' },
      { name: 'd', type: 'line', color: '#FF6D00' },
    ],
    overlay: false,
    author: 'quantclub',
  },
  {
    id: 'adx',
    name: 'ADX (Average Directional Index)',
    category: 'trend',
    description: 'ADX измеряет силу тренда (не направление). ADX > 25 = сильный тренд, ADX < 20 = слабый/отсутствующий тренд. +DI > -DI = бычий тренд',
    pineCode: `//@version=5
indicator("ADX", overlay=false)
period = input.int(14, "Period")
[diPlus, diMinus, adx] = ta.dmi(period, period)
plot(adx, "ADX", color=color.blue)
plot(diPlus, "+DI", color=color.green)
plot(diMinus, "-DI", color=color.red)
hline(25, "Strong Trend", color=color.orange)`,
    inputSchema: [
      { name: 'period', type: 'int', default: 14, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'adx', type: 'line', color: '#2962FF' },
      { name: 'plusDI', type: 'line', color: '#26A69A' },
      { name: 'minusDI', type: 'line', color: '#EF5350' },
    ],
    overlay: false,
    author: 'quantclub',
  },

  // ==================== TA4J PORTED INDICATORS ====================
  {
    id: 'supertrend',
    name: 'SuperTrend',
    category: '',
    description: 'SuperTrend - трендовый индикатор на основе ATR. Определяет динамическую поддержку/сопротивление. Зелёная линия = бычий тренд, красная = медвежий',
    pineCode: `//@version=5
indicator("SuperTrend", overlay=true)
period = input.int(10, "ATR Period")
multiplier = input.float(3.0, "Multiplier")
[supertrend, direction] = ta.supertrend(multiplier, period)
plot(supertrend, color=direction < 0 ? color.green : color.red, linewidth=2)`,
    inputSchema: [
      { name: 'period', type: 'int', default: 10, min: 1, max: 100 },
      { name: 'multiplier', type: 'float', default: 3.0, min: 0.1, max: 10.0 },
    ],
    outputConfig: [
      { name: 'supertrend_bullish', type: 'line', color: '#26A69A' },
      { name: 'supertrend_bearish', type: 'line', color: '#EF5350' },
    ],
    overlay: true,
    author: 'ta4j',
  },
  {
    id: 'vwap',
    name: 'VWAP',
    category: 'volume',
    description: 'Volume Weighted Average Price - средневзвешенная по объёму цена. Используется институциональными трейдерами для определения справедливой цены',
    pineCode: `//@version=5
indicator("VWAP", overlay=true)
src = input(hlc3, "Source")
[vwap, upper, lower] = ta.vwap(src)
plot(vwap, color=color.blue, linewidth=2)
plot(upper, color=color.blue, style=plot.style_circles)
plot(lower, color=color.blue, style=plot.style_circles)`,
    inputSchema: [
      { name: 'stddevBands', type: 'float', default: 1.0, min: 0.1, max: 3.0 },
    ],
    outputConfig: [
      { name: 'vwap', type: 'line', color: '#2962FF' },
      { name: 'upper_band', type: 'line', color: '#2962FF50' },
      { name: 'lower_band', type: 'line', color: '#2962FF50' },
    ],
    overlay: true,
    author: 'ta4j',
  },
  {
    id: 'heikin_ashi',
    name: 'Heikin-Ashi',
    category: 'chart_types',
    description: 'Heikin-Ashi - сглаженные свечи, показывающие тренд более чётко. HA Close = среднее всех цен, HA Open = среднее предыдущих HA Open и Close',
    pineCode: `//@version=5
indicator("Heikin-Ashi", overlay=true)
haClose = (open + high + low + close) / 4
haOpen = float(na)
haOpen := na(haOpen[1]) ? (open + close) / 2 : (haOpen[1] + haClose[1]) / 2
haHigh = max(high, max(haOpen, haClose))
haLow = min(low, min(haOpen, haClose))
plot(haOpen, "HA Open", color=color.orange)
plot(haClose, "HA Close", color=color.blue)`,
    inputSchema: [],
    outputConfig: [
      { name: 'ha_open', type: 'line', color: '#FF6D00' },
      { name: 'ha_close', type: 'line', color: '#2962FF' },
    ],
    overlay: true,
    author: 'ta4j',
  },
  {
    id: 'renko',
    name: 'Renko',
    category: 'chart_types',
    description: 'Renko - кирпичный график, где каждый кирпич имеет одинаковый размер. Игнорирует время, показывает только движение цены',
    pineCode: `//@version=5
indicator("Renko", overlay=true)
brick_size = input.float(1.0, "Brick Size")
// Renko calculation simplified for display
plot(close, color=color.teal, linewidth=2)`,
    inputSchema: [
      { name: 'brickSize', type: 'float', default: 0, min: 0, max: 10000 },
      { name: 'useAtr', type: 'bool', default: true },
      { name: 'atrPeriod', type: 'int', default: 14, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'renko', type: 'line', color: '#26A69A' },
    ],
    overlay: true,
    author: 'ta4j',
  },
  {
    id: 'keltner_channel',
    name: 'Keltner Channel',
    category: 'volatility',
    description: 'Keltner Channel - волатильный канал на основе ATR. Средняя линия = EMA, полосы = EMA ± (множитель × ATR)',
    pineCode: `//@version=5
indicator("Keltner Channel", overlay=true)
emaPeriod = input.int(20, "EMA Period")
atrPeriod = input.int(10, "ATR Period")
multiplier = input.float(2.0, "Multiplier")
middle = ta.ema(close, emaPeriod)
atr_val = ta.atr(atrPeriod)
upper = middle + multiplier * atr_val
lower = middle - multiplier * atr_val
plot(middle, "Middle", color=color.orange)
p1 = plot(upper, "Upper", color=color.blue)
p2 = plot(lower, "Lower", color=color.blue)
fill(p1, p2, color=color.blue, transp=90)`,
    inputSchema: [
      { name: 'emaPeriod', type: 'int', default: 20, min: 1, max: 200 },
      { name: 'atrPeriod', type: 'int', default: 10, min: 1, max: 100 },
      { name: 'multiplier', type: 'float', default: 2.0, min: 0.1, max: 5.0 },
    ],
    outputConfig: [
      { name: 'upper', type: 'line', color: '#2962FF' },
      { name: 'middle', type: 'line', color: '#FF6D00' },
      { name: 'lower', type: 'line', color: '#2962FF' },
    ],
    overlay: true,
    author: 'ta4j',
  },
  {
    id: 'mass_index',
    name: 'Mass Index',
    category: 'oscillator',
    description: 'Mass Index - индикатор разворота. Измеряет сужение/расширение диапазона High-Low. Сигнал: подъём выше 27 и падение ниже 26.5',
    pineCode: `//@version=5
indicator("Mass Index", overlay=false)
emaPeriod = input.int(9, "EMA Period")
sumPeriod = input.int(25, "Sum Period")
range_val = high - low
single_ema = ta.ema(range_val, emaPeriod)
double_ema = ta.ema(single_ema, emaPeriod)
ema_ratio = single_ema / double_ema
mass_index = ta.sum(ema_ratio, sumPeriod)
plot(mass_index, "Mass Index", color=color.purple)
hline(27, "Reversal", color=color.red)
hline(26.5, "Signal", color=color.green)`,
    inputSchema: [
      { name: 'emaPeriod', type: 'int', default: 9, min: 1, max: 50 },
      { name: 'sumPeriod', type: 'int', default: 25, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'mass_index', type: 'line', color: '#9C27B0' },
    ],
    overlay: false,
    author: 'ta4j',
  },

  // ==================== CHART TYPES (ТИПЫ ГРАФИКОВ) ====================
  {
    id: 'ct_bars',
    name: 'Bars (OHLC)',
    category: 'chart_types',
    description: 'Bars (OHLC) - стандартный барный график, показывающий Open, High, Low, Close для каждого периода',
    pineCode: `//@version=5
indicator("Bars OHLC", overlay=true)
plotbar(open, high, low, close, color=close >= open ? color.green : color.red)`,
    inputSchema: [],
    outputConfig: [
      { name: 'bar', type: 'line', color: '#2962FF' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'ct_line',
    name: 'Line Chart',
    category: 'chart_types',
    description: 'Line Chart - линейный график, соединяющий цены закрытия каждой свечи',
    pineCode: `//@version=5
indicator("Line Chart", overlay=true)
plot(close, color=color.blue, linewidth=2)`,
    inputSchema: [],
    outputConfig: [
      { name: 'line', type: 'line', color: '#2962FF' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'ct_area',
    name: 'Area Chart',
    category: 'chart_types',
    description: 'Area Chart - график области, линейный график с заполненной областью под линией',
    pineCode: `//@version=5
indicator("Area Chart", overlay=true)
plot(close, color=color.blue, style=plot.style_area)`,
    inputSchema: [],
    outputConfig: [
      { name: 'area', type: 'area', color: '#2962FF' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'ct_crosses',
    name: 'Crosses',
    category: 'chart_types',
    description: 'Crosses - кресты на каждой цене закрытия, полезно для scatter-анализа',
    pineCode: `//@version=5
indicator("Crosses", overlay=true)
plot(close, color=color.blue, style=plot.style_cross, linewidth=2)`,
    inputSchema: [],
    outputConfig: [
      { name: 'cross', type: 'line', color: '#2962FF' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'ct_columns',
    name: 'Columns (HLC)',
    category: 'chart_types',
    description: 'Columns - вертикальные столбцы, показывающие диапазон High-Low с маркером Close',
    pineCode: `//@version=5
indicator("Columns HLC", overlay=true)
plot(high, color=color.green, style=plot.style_columns)
plot(low, color=color.red, style=plot.style_columns)
plot(close, color=color.blue, style=plot.style_circles, linewidth=3)`,
    inputSchema: [],
    outputConfig: [
      { name: 'high_col', type: 'histogram', color: '#26A69A' },
      { name: 'low_col', type: 'histogram', color: '#EF5350' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'ct_kagi',
    name: 'Kagi',
    category: 'chart_types',
    description: 'Kagi - график спроса/предложения с линиями, меняющими направление при движении цены на размер разворота',
    pineCode: `//@version=5
indicator("Kagi", overlay=true)
// Kagi lines change direction when price moves by reversal amount
reversal = input.float(1.0, "Reversal Amount")
plot(close, color=color.blue, linewidth=2)`,
    inputSchema: [
      { name: 'reversalAmount', type: 'float', default: 1.0, min: 0.1, max: 100 },
      { name: 'useAtr', type: 'bool', default: true },
      { name: 'atrPeriod', type: 'int', default: 14, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'kagi', type: 'line', color: '#2962FF' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'ct_line_break',
    name: 'Line Break (Three Line)',
    category: 'chart_types',
    description: 'Line Break - график, где новая линия добавляется только когда цена превышает High/Low предыдущих N линий',
    pineCode: `//@version=5
indicator("Line Break", overlay=true)
// Three Line Break - reversal chart
lines = input.int(3, "Number of Lines")
plot(close, color=color.blue, linewidth=2)`,
    inputSchema: [
      { name: 'lineCount', type: 'int', default: 3, min: 1, max: 10 },
    ],
    outputConfig: [
      { name: 'lb_open', type: 'line', color: '#2962FF' },
      { name: 'lb_close', type: 'line', color: '#FF6D00' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'ct_range_bars',
    name: 'Range Bars',
    category: 'chart_types',
    description: 'Range Bars - ценовые бары с фиксированным диапазоном, не зависящие от времени',
    pineCode: `//@version=5
indicator("Range Bars", overlay=true)
// Range bars - fixed price range bars
rangeSize = input.float(1.0, "Range Size")
plot(close, color=color.blue, linewidth=2)`,
    inputSchema: [
      { name: 'rangeSize', type: 'float', default: 0, min: 0, max: 10000 },
      { name: 'useAtr', type: 'bool', default: true },
      { name: 'atrPeriod', type: 'int', default: 14, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'range_open', type: 'line', color: '#2962FF' },
      { name: 'range_close', type: 'line', color: '#FF6D00' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'ct_point_figure',
    name: 'Point & Figure',
    category: 'chart_types',
    description: 'Point & Figure - график X/O, показывающий только значительные ценовые движения',
    pineCode: `//@version=5
indicator("Point & Figure", overlay=true)
// X columns for rising, O columns for falling
boxSize = input.float(1.0, "Box Size")
reversal = input.int(3, "Reversal (boxes)")
plot(close, color=color.blue, linewidth=2)`,
    inputSchema: [
      { name: 'boxSize', type: 'float', default: 0, min: 0, max: 10000 },
      { name: 'reversal', type: 'int', default: 3, min: 1, max: 10 },
      { name: 'useAtr', type: 'bool', default: true },
      { name: 'atrPeriod', type: 'int', default: 14, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'x_column', type: 'line', color: '#26A69A' },
      { name: 'o_column', type: 'line', color: '#EF5350' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'ct_hollow_candles',
    name: 'Hollow Candles',
    category: 'chart_types',
    description: 'Hollow Candles - свечи с заполнением на основе тренда (Close > PrevClose)',
    pineCode: `//@version=5
indicator("Hollow Candles", overlay=true)
// Hollow candles - fill based on trend direction
plotcandle(open, high, low, close, color=close >= close[1] ? color.green : color.red)`,
    inputSchema: [],
    outputConfig: [
      { name: 'hc_open', type: 'line', color: '#2962FF' },
      { name: 'hc_close', type: 'line', color: '#FF6D00' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'ct_volume_candles',
    name: 'Volume Candles',
    category: 'chart_types',
    description: 'Volume Candles - свечи с шириной/интенсивностью на основе объёма',
    pineCode: `//@version=5
indicator("Volume Candles", overlay=true)
// Candle width/intensity based on volume
avgVol = ta.sma(volume, 20)
volRatio = volume / avgVol
plotcandle(open, high, low, close, color=close >= open ? color.green : color.red, linewidth=volRatio)`,
    inputSchema: [
      { name: 'volumePeriod', type: 'int', default: 20, min: 1, max: 100 },
    ],
    outputConfig: [
      { name: 'vc_open', type: 'line', color: '#2962FF' },
      { name: 'vc_close', type: 'line', color: '#FF6D00' },
    ],
    overlay: true,
    author: 'CITARION',
  },

  // ==================== PATTERNS - CANDLESTICK (СВЕЧНЫЕ ПАТТЕРНЫ) ====================
  {
    id: 'cp_doji',
    name: 'Doji',
    category: 'patterns',
    subcategory: 'candlestick_patterns',
    description: 'Doji - свеча нерешительности, где открытие и закрытие почти равны. Сигнал неопределённости на рынке',
    pineCode: `//@version=5
indicator("Doji Pattern", overlay=true)
bodySize = math.abs(close - open)
totalRange = high - low
isDoji = bodySize < totalRange * 0.1
plotshape(isDoji, "Doji", shape.cross, location.abovebar, color.yellow)`,
    inputSchema: [
      { name: 'threshold', type: 'float', default: 0.1, min: 0.01, max: 0.3 },
    ],
    outputConfig: [
      { name: 'doji', type: 'line', color: '#FFEB3B' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'cp_dragonfly_doji',
    name: 'Dragonfly Doji',
    category: 'patterns',
    subcategory: 'candlestick_patterns',
    description: 'Dragonfly Doji - бычий разворотный паттерн с длинной нижней тенью и без верхней',
    pineCode: `//@version=5
indicator("Dragonfly Doji", overlay=true)
bodySize = math.abs(close - open)
upperWick = high - math.max(open, close)
lowerWick = math.min(open, close) - low
isDragonfly = bodySize < (high - low) * 0.1 and lowerWick > (high - low) * 0.6 and upperWick < (high - low) * 0.1
plotshape(isDragonfly, "Dragonfly", shape.triangleup, location.belowbar, color.green)`,
    inputSchema: [],
    outputConfig: [
      { name: 'dragonfly', type: 'line', color: '#26A69A' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'cp_gravestone_doji',
    name: 'Gravestone Doji',
    category: 'patterns',
    subcategory: 'candlestick_patterns',
    description: 'Gravestone Doji - медвежий разворотный паттерн с длинной верхней тенью и без нижней',
    pineCode: `//@version=5
indicator("Gravestone Doji", overlay=true)
bodySize = math.abs(close - open)
upperWick = high - math.max(open, close)
lowerWick = math.min(open, close) - low
isGravestone = bodySize < (high - low) * 0.1 and upperWick > (high - low) * 0.6 and lowerWick < (high - low) * 0.1
plotshape(isGravestone, "Gravestone", shape.triangledown, location.abovebar, color.red)`,
    inputSchema: [],
    outputConfig: [
      { name: 'gravestone', type: 'line', color: '#EF5350' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'cp_hammer',
    name: 'Hammer',
    category: 'patterns',
    subcategory: 'candlestick_patterns',
    description: 'Hammer - бычий разворотный паттерн с маленьким телом сверху и длинной нижней тенью',
    pineCode: `//@version=5
indicator("Hammer", overlay=true)
bodySize = math.abs(close - open)
upperWick = high - math.max(open, close)
lowerWick = math.min(open, close) - low
isHammer = lowerWick >= bodySize * 2 and upperWick < bodySize * 0.5 and bodySize < (high - low) * 0.35
plotshape(isHammer, "Hammer", shape.triangleup, location.belowbar, color.green)`,
    inputSchema: [],
    outputConfig: [
      { name: 'hammer', type: 'line', color: '#26A69A' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'cp_inverted_hammer',
    name: 'Inverted Hammer',
    category: 'patterns',
    subcategory: 'candlestick_patterns',
    description: 'Inverted Hammer - потенциальный бычий разворот с маленьким телом снизу и длинной верхней тенью',
    pineCode: `//@version=5
indicator("Inverted Hammer", overlay=true)
bodySize = math.abs(close - open)
upperWick = high - math.max(open, close)
lowerWick = math.min(open, close) - low
isInvertedHammer = upperWick >= bodySize * 2 and lowerWick < bodySize * 0.5 and bodySize < (high - low) * 0.35
plotshape(isInvertedHammer, "Inv Hammer", shape.triangleup, location.belowbar, color.lime)`,
    inputSchema: [],
    outputConfig: [
      { name: 'inverted_hammer', type: 'line', color: '#CDDC39' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'cp_hanging_man',
    name: 'Hanging Man',
    category: 'patterns',
    subcategory: 'candlestick_patterns',
    description: 'Hanging Man - медвежий разворотный паттерн после uptrend, форма как Hammer но в другом контексте',
    pineCode: `//@version=5
indicator("Hanging Man", overlay=true)
bodySize = math.abs(close - open)
upperWick = high - math.max(open, close)
lowerWick = math.min(open, close) - low
isHangingMan = lowerWick >= bodySize * 2 and upperWick < bodySize * 0.5 and close[1] > open[1]
plotshape(isHangingMan, "Hanging Man", shape.triangledown, location.abovebar, color.red)`,
    inputSchema: [],
    outputConfig: [
      { name: 'hanging_man', type: 'line', color: '#EF5350' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'cp_shooting_star',
    name: 'Shooting Star',
    category: 'patterns',
    subcategory: 'candlestick_patterns',
    description: 'Shooting Star - медвежий разворотный паттерн с маленьким телом снизу и длинной верхней тенью после uptrend',
    pineCode: `//@version=5
indicator("Shooting Star", overlay=true)
bodySize = math.abs(close - open)
upperWick = high - math.max(open, close)
lowerWick = math.min(open, close) - low
isShootingStar = upperWick >= bodySize * 2 and lowerWick < bodySize * 0.5 and close[1] > open[1]
plotshape(isShootingStar, "Shooting Star", shape.triangledown, location.abovebar, color.red)`,
    inputSchema: [],
    outputConfig: [
      { name: 'shooting_star', type: 'line', color: '#EF5350' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'cp_marubozu',
    name: 'Marubozu',
    category: 'patterns',
    subcategory: 'candlestick_patterns',
    description: 'Marubozu - сильная свеча без теней, показывает сильное давление покупателей/продавцов',
    pineCode: `//@version=5
indicator("Marubozu", overlay=true)
bodySize = math.abs(close - open)
totalRange = high - low
isMarubozu = bodySize >= totalRange * 0.95
isBullish = close > open
plotshape(isMarubozu and isBullish, "Bull Marubozu", shape.triangleup, location.belowbar, color.green)
plotshape(isMarubozu and not isBullish, "Bear Marubozu", shape.triangledown, location.abovebar, color.red)`,
    inputSchema: [],
    outputConfig: [
      { name: 'marubozu_bull', type: 'line', color: '#26A69A' },
      { name: 'marubozu_bear', type: 'line', color: '#EF5350' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'cp_spinning_top',
    name: 'Spinning Top',
    category: 'patterns',
    subcategory: 'candlestick_patterns',
    description: 'Spinning Top - свеча нерешительности с маленьким телом и длинными тенями с обеих сторон',
    pineCode: `//@version=5
indicator("Spinning Top", overlay=true)
bodySize = math.abs(close - open)
upperWick = high - math.max(open, close)
lowerWick = math.min(open, close) - low
totalRange = high - low
isSpinningTop = bodySize < totalRange * 0.35 and upperWick > totalRange * 0.25 and lowerWick > totalRange * 0.25
plotshape(isSpinningTop, "Spinning Top", shape.circle, location.abovebar, color.orange)`,
    inputSchema: [],
    outputConfig: [
      { name: 'spinning_top', type: 'line', color: '#FF9800' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'cp_bullish_engulfing',
    name: 'Bullish Engulfing',
    category: 'patterns',
    subcategory: 'candlestick_patterns',
    description: 'Bullish Engulfing - бычий разворотный паттерн, текущая бычья свеча полностью поглощает предыдущую медвежью',
    pineCode: `//@version=5
indicator("Bullish Engulfing", overlay=true)
isBullishEngulfing = close > open and close[1] < open[1] and close > open[1] and open < close[1]
plotshape(isBullishEngulfing, "Bull Engulf", shape.triangleup, location.belowbar, color.green, size=size.normal)`,
    inputSchema: [],
    outputConfig: [
      { name: 'bullish_engulfing', type: 'line', color: '#26A69A' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'cp_bearish_engulfing',
    name: 'Bearish Engulfing',
    category: 'patterns',
    subcategory: 'candlestick_patterns',
    description: 'Bearish Engulfing - медвежий разворотный паттерн, текущая медвежья свеча полностью поглощает предыдущую бычью',
    pineCode: `//@version=5
indicator("Bearish Engulfing", overlay=true)
isBearishEngulfing = close < open and close[1] > open[1] and close < open[1] and open > close[1]
plotshape(isBearishEngulfing, "Bear Engulf", shape.triangledown, location.abovebar, color.red, size=size.normal)`,
    inputSchema: [],
    outputConfig: [
      { name: 'bearish_engulfing', type: 'line', color: '#EF5350' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'cp_piercing_line',
    name: 'Piercing Line',
    category: 'patterns',
    subcategory: 'candlestick_patterns',
    description: 'Piercing Line - бычий разворотный паттерн из двух свечей, вторая закрывается выше середины первой',
    pineCode: `//@version=5
indicator("Piercing Line", overlay=true)
midpoint = (open[1] + close[1]) / 2
isPiercing = close[1] < open[1] and close > open and open < close[1] and close > midpoint and close < open[1]
plotshape(isPiercing, "Piercing", shape.triangleup, location.belowbar, color.green)`,
    inputSchema: [],
    outputConfig: [
      { name: 'piercing_line', type: 'line', color: '#26A69A' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'cp_dark_cloud_cover',
    name: 'Dark Cloud Cover',
    category: 'patterns',
    subcategory: 'candlestick_patterns',
    description: 'Dark Cloud Cover - медвежий разворотный паттерн, вторая свеча закрывается ниже середины первой',
    pineCode: `//@version=5
indicator("Dark Cloud Cover", overlay=true)
midpoint = (open[1] + close[1]) / 2
isDarkCloud = close[1] > open[1] and close < open and open > close[1] and close < midpoint and close > open[1]
plotshape(isDarkCloud, "Dark Cloud", shape.triangledown, location.abovebar, color.red)`,
    inputSchema: [],
    outputConfig: [
      { name: 'dark_cloud', type: 'line', color: '#EF5350' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'cp_tweezer_top',
    name: 'Tweezer Top',
    category: 'patterns',
    subcategory: 'candlestick_patterns',
    description: 'Tweezer Top - медвежий разворотный паттерн с двумя свечами с одинаковыми максимумами',
    pineCode: `//@version=5
indicator("Tweezer Top", overlay=true)
isTweezerTop = math.abs(high - high[1]) / high < 0.001 and close[1] > open[1] and close < open
plotshape(isTweezerTop, "Tweezer Top", shape.triangledown, location.abovebar, color.red)`,
    inputSchema: [],
    outputConfig: [
      { name: 'tweezer_top', type: 'line', color: '#EF5350' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'cp_tweezer_bottom',
    name: 'Tweezer Bottom',
    category: 'patterns',
    subcategory: 'candlestick_patterns',
    description: 'Tweezer Bottom - бычий разворотный паттерн с двумя свечами с одинаковыми минимумами',
    pineCode: `//@version=5
indicator("Tweezer Bottom", overlay=true)
isTweezerBottom = math.abs(low - low[1]) / low < 0.001 and close[1] < open[1] and close > open
plotshape(isTweezerBottom, "Tweezer Bottom", shape.triangleup, location.belowbar, color.green)`,
    inputSchema: [],
    outputConfig: [
      { name: 'tweezer_bottom', type: 'line', color: '#26A69A' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'cp_morning_star',
    name: 'Morning Star',
    category: 'patterns',
    subcategory: 'candlestick_patterns',
    description: 'Morning Star - сильный бычий разворотный паттерн из трёх свечей',
    pineCode: `//@version=5
indicator("Morning Star", overlay=true)
body1 = math.abs(close[2] - open[2])
body2 = math.abs(close[1] - open[1])
body3 = math.abs(close - open)
isMorningStar = close[2] < open[2] and body2 < body1 * 0.3 and close > open and close > (open[2] + close[2]) / 2
plotshape(isMorningStar, "Morning Star", shape.triangleup, location.belowbar, color.green, size=size.normal)`,
    inputSchema: [],
    outputConfig: [
      { name: 'morning_star', type: 'line', color: '#26A69A' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'cp_evening_star',
    name: 'Evening Star',
    category: 'patterns',
    subcategory: 'candlestick_patterns',
    description: 'Evening Star - сильный медвежий разворотный паттерн из трёх свечей',
    pineCode: `//@version=5
indicator("Evening Star", overlay=true)
body1 = math.abs(close[2] - open[2])
body2 = math.abs(close[1] - open[1])
body3 = math.abs(close - open)
isEveningStar = close[2] > open[2] and body2 < body1 * 0.3 and close < open and close < (open[2] + close[2]) / 2
plotshape(isEveningStar, "Evening Star", shape.triangledown, location.abovebar, color.red, size=size.normal)`,
    inputSchema: [],
    outputConfig: [
      { name: 'evening_star', type: 'line', color: '#EF5350' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'cp_three_white_soldiers',
    name: 'Three White Soldiers',
    category: 'patterns',
    subcategory: 'candlestick_patterns',
    description: 'Three White Soldiers - сильный бычий паттерн продолжения из трёх подряд растущих свечей',
    pineCode: `//@version=5
indicator("Three White Soldiers", overlay=true)
isThreeWhite = close > open and close[1] > open[1] and close[2] > open[2] and close > close[1] and close[1] > close[2]
plotshape(isThreeWhite, "3 White Soldiers", shape.triangleup, location.belowbar, color.green, size=size.normal)`,
    inputSchema: [],
    outputConfig: [
      { name: 'three_white', type: 'line', color: '#26A69A' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'cp_three_black_crows',
    name: 'Three Black Crows',
    category: 'patterns',
    subcategory: 'candlestick_patterns',
    description: 'Three Black Crows - сильный медвежий паттерн продолжения из трёх подряд падающих свечей',
    pineCode: `//@version=5
indicator("Three Black Crows", overlay=true)
isThreeBlack = close < open and close[1] < open[1] and close[2] < open[2] and close < close[1] and close[1] < close[2]
plotshape(isThreeBlack, "3 Black Crows", shape.triangledown, location.abovebar, color.red, size=size.normal)`,
    inputSchema: [],
    outputConfig: [
      { name: 'three_black', type: 'line', color: '#EF5350' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'cp_rising_three_methods',
    name: 'Rising Three Methods',
    category: 'patterns',
    subcategory: 'candlestick_patterns',
    description: 'Rising Three Methods - бычий паттерн продолжения из 5 свечей',
    pineCode: `//@version=5
indicator("Rising Three Methods", overlay=true)
isRising = close[4] > open[4] and close > open and close > close[4]
plotshape(isRising, "Rising 3 Methods", shape.triangleup, location.belowbar, color.green)`,
    inputSchema: [],
    outputConfig: [
      { name: 'rising_three', type: 'line', color: '#26A69A' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'cp_falling_three_methods',
    name: 'Falling Three Methods',
    category: 'patterns',
    subcategory: 'candlestick_patterns',
    description: 'Falling Three Methods - медвежий паттерн продолжения из 5 свечей',
    pineCode: `//@version=5
indicator("Falling Three Methods", overlay=true)
isFalling = close[4] < open[4] and close < open and close < close[4]
plotshape(isFalling, "Falling 3 Methods", shape.triangledown, location.abovebar, color.red)`,
    inputSchema: [],
    outputConfig: [
      { name: 'falling_three', type: 'line', color: '#EF5350' },
    ],
    overlay: true,
    author: 'CITARION',
  },

  // ==================== PATTERNS - CHART (ГРАФИЧЕСКИЕ ПАТТЕРНЫ) ====================
  {
    id: 'gp_double_top',
    name: 'Double Top',
    category: 'patterns',
    subcategory: 'chart_patterns',
    description: 'Double Top - медвежий разворотный паттерн с двумя пиками на одном уровне',
    pineCode: `//@version=5
indicator("Double Top", overlay=true)
lookback = input.int(20, "Lookback")
tolerance = input.float(0.5, "Tolerance %")
peak1 = ta.highest(high, lookback)
peak2 = ta.highest(high[1], lookback)
isDoubleTop = math.abs(peak1 - peak2) / peak1 < tolerance / 100
plotshape(isDoubleTop, "Double Top", shape.triangledown, location.abovebar, color.red)`,
    inputSchema: [
      { name: 'lookback', type: 'int', default: 20, min: 5, max: 100 },
      { name: 'tolerance', type: 'float', default: 0.5, min: 0.1, max: 5 },
    ],
    outputConfig: [
      { name: 'double_top', type: 'line', color: '#EF5350' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'gp_double_bottom',
    name: 'Double Bottom',
    category: 'patterns',
    subcategory: 'chart_patterns',
    description: 'Double Bottom - бычий разворотный паттерн с двумя минимумами на одном уровне',
    pineCode: `//@version=5
indicator("Double Bottom", overlay=true)
lookback = input.int(20, "Lookback")
tolerance = input.float(0.5, "Tolerance %")
trough1 = ta.lowest(low, lookback)
trough2 = ta.lowest(low[1], lookback)
isDoubleBottom = math.abs(trough1 - trough2) / trough1 < tolerance / 100
plotshape(isDoubleBottom, "Double Bottom", shape.triangleup, location.belowbar, color.green)`,
    inputSchema: [
      { name: 'lookback', type: 'int', default: 20, min: 5, max: 100 },
      { name: 'tolerance', type: 'float', default: 0.5, min: 0.1, max: 5 },
    ],
    outputConfig: [
      { name: 'double_bottom', type: 'line', color: '#26A69A' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'gp_head_shoulders',
    name: 'Head and Shoulders',
    category: 'patterns',
    subcategory: 'chart_patterns',
    description: 'Head and Shoulders - медвежий разворотный паттерн с головой и двумя плечами',
    pineCode: `//@version=5
indicator("Head & Shoulders", overlay=true)
lookback = input.int(50, "Lookback")
// Simplified detection
peak = ta.highest(high, lookback)
isHeadShoulders = high < peak and high[1] < peak
plotshape(isHeadShoulders, "H&S", shape.triangledown, location.abovebar, color.red)`,
    inputSchema: [
      { name: 'lookback', type: 'int', default: 50, min: 20, max: 200 },
    ],
    outputConfig: [
      { name: 'head_shoulders', type: 'line', color: '#EF5350' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'gp_inverse_head_shoulders',
    name: 'Inverse Head and Shoulders',
    category: 'patterns',
    subcategory: 'chart_patterns',
    description: 'Inverse Head and Shoulders - бычий разворотный паттерн, перевёрнутая версия H&S',
    pineCode: `//@version=5
indicator("Inverse H&S", overlay=true)
lookback = input.int(50, "Lookback")
// Simplified detection
trough = ta.lowest(low, lookback)
isInverseHS = low > trough and low[1] > trough
plotshape(isInverseHS, "Inv H&S", shape.triangleup, location.belowbar, color.green)`,
    inputSchema: [
      { name: 'lookback', type: 'int', default: 50, min: 20, max: 200 },
    ],
    outputConfig: [
      { name: 'inverse_hs', type: 'line', color: '#26A69A' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'gp_ascending_triangle',
    name: 'Ascending Triangle',
    category: 'patterns',
    subcategory: 'chart_patterns',
    description: 'Ascending Triangle - бычий паттерн продолжения с горизонтальным сопротивлением и растущей поддержкой',
    pineCode: `//@version=5
indicator("Ascending Triangle", overlay=true)
lookback = input.int(20, "Lookback")
resistance = ta.highest(high, lookback)
support = ta.lowest(low, lookback)
isAscendingTri = math.abs(high - resistance) / resistance < 0.01 and low > support
plotshape(isAscendingTri, "Asc Tri", shape.triangleup, location.belowbar, color.green)`,
    inputSchema: [
      { name: 'lookback', type: 'int', default: 20, min: 10, max: 100 },
    ],
    outputConfig: [
      { name: 'ascending_tri', type: 'line', color: '#26A69A' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'gp_descending_triangle',
    name: 'Descending Triangle',
    category: 'patterns',
    subcategory: 'chart_patterns',
    description: 'Descending Triangle - медвежий паттерн продолжения с горизонтальной поддержкой и падающим сопротивлением',
    pineCode: `//@version=5
indicator("Descending Triangle", overlay=true)
lookback = input.int(20, "Lookback")
resistance = ta.highest(high, lookback)
support = ta.lowest(low, lookback)
isDescendingTri = math.abs(low - support) / support < 0.01 and high < resistance
plotshape(isDescendingTri, "Desc Tri", shape.triangledown, location.abovebar, color.red)`,
    inputSchema: [
      { name: 'lookback', type: 'int', default: 20, min: 10, max: 100 },
    ],
    outputConfig: [
      { name: 'descending_tri', type: 'line', color: '#EF5350' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'gp_symmetrical_triangle',
    name: 'Symmetrical Triangle',
    category: 'patterns',
    subcategory: 'chart_patterns',
    description: 'Symmetrical Triangle - нейтральный паттерн с падающим сопротивлением и растущей поддержкой',
    pineCode: `//@version=5
indicator("Symmetrical Triangle", overlay=true)
lookback = input.int(20, "Lookback")
rangeHL = ta.highest(high, lookback) - ta.lowest(low, lookback)
currentRange = high - low
isSymmetrical = currentRange < rangeHL * 0.5
plotshape(isSymmetrical, "Sym Tri", shape.diamond, location.abovebar, color.orange)`,
    inputSchema: [
      { name: 'lookback', type: 'int', default: 20, min: 10, max: 100 },
    ],
    outputConfig: [
      { name: 'symmetrical_tri', type: 'line', color: '#FF9800' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'gp_flag',
    name: 'Flag Pattern',
    category: 'patterns',
    subcategory: 'chart_patterns',
    description: 'Flag - паттерн продолжения после сильного движения, консолидация в узком канале',
    pineCode: `//@version=5
indicator("Flag Pattern", overlay=true)
lookback = input.int(20, "Lookback")
range_val = ta.highest(high, lookback) - ta.lowest(low, lookback)
currentRange = high - low
isFlag = currentRange < range_val * 0.3
plotshape(isFlag, "Flag", shape.flag, location.abovebar, color.blue)`,
    inputSchema: [
      { name: 'lookback', type: 'int', default: 20, min: 10, max: 100 },
    ],
    outputConfig: [
      { name: 'flag', type: 'line', color: '#2962FF' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'gp_wedge_rising',
    name: 'Rising Wedge',
    category: 'patterns',
    subcategory: 'chart_patterns',
    description: 'Rising Wedge - медвежий разворотный паттерн с повышающимися минимумами и максимумами в сужающемся диапазоне',
    pineCode: `//@version=5
indicator("Rising Wedge", overlay=true)
lookback = input.int(20, "Lookback")
isRisingWedge = low > low[1] and low[1] > low[2] and high < high[1] + (high - low) * 0.5
plotshape(isRisingWedge, "Rising Wedge", shape.triangledown, location.abovebar, color.red)`,
    inputSchema: [
      { name: 'lookback', type: 'int', default: 20, min: 10, max: 100 },
    ],
    outputConfig: [
      { name: 'rising_wedge', type: 'line', color: '#EF5350' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'gp_wedge_falling',
    name: 'Falling Wedge',
    category: 'patterns',
    subcategory: 'chart_patterns',
    description: 'Falling Wedge - бычий разворотный паттерн с понижающимися минимумами и максимумами в сужающемся диапазоне',
    pineCode: `//@version=5
indicator("Falling Wedge", overlay=true)
lookback = input.int(20, "Lookback")
isFallingWedge = high < high[1] and high[1] < high[2] and low > low[1] - (high - low) * 0.5
plotshape(isFallingWedge, "Falling Wedge", shape.triangleup, location.belowbar, color.green)`,
    inputSchema: [
      { name: 'lookback', type: 'int', default: 20, min: 10, max: 100 },
    ],
    outputConfig: [
      { name: 'falling_wedge', type: 'line', color: '#26A69A' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'gp_channel_up',
    name: 'Up Channel',
    category: 'patterns',
    subcategory: 'chart_patterns',
    description: 'Up Channel - восходящий канал, цена движется между параллельными линиями вверх',
    pineCode: `//@version=5
indicator("Up Channel", overlay=true)
lookback = input.int(20, "Lookback")
upper = ta.highest(high, lookback)
lower = ta.lowest(low, lookback)
mid = (upper + lower) / 2
plot(upper, color=color.red)
plot(lower, color=color.green)
plot(mid, color=color.blue)`,
    inputSchema: [
      { name: 'lookback', type: 'int', default: 20, min: 10, max: 100 },
    ],
    outputConfig: [
      { name: 'channel_upper', type: 'line', color: '#EF5350' },
      { name: 'channel_lower', type: 'line', color: '#26A69A' },
    ],
    overlay: true,
    author: 'CITARION',
  },
  {
    id: 'gp_channel_down',
    name: 'Down Channel',
    category: 'patterns',
    subcategory: 'chart_patterns',
    description: 'Down Channel - нисходящий канал, цена движется между параллельными линиями вниз',
    pineCode: `//@version=5
indicator("Down Channel", overlay=true)
lookback = input.int(20, "Lookback")
upper = ta.highest(high, lookback)
lower = ta.lowest(low, lookback)
mid = (upper + lower) / 2
plot(upper, color=color.red)
plot(lower, color=color.green)
plot(mid, color=color.blue)`,
    inputSchema: [
      { name: 'lookback', type: 'int', default: 20, min: 10, max: 100 },
    ],
    outputConfig: [
      { name: 'channel_upper', type: 'line', color: '#EF5350' },
      { name: 'channel_lower', type: 'line', color: '#26A69A' },
    ],
    overlay: true,
    author: 'CITARION',
  },
];

/**
 * Get all built-in indicators
 */
export function getBuiltinIndicators(): BuiltInIndicator[] {
  return BUILTIN_INDICATORS;
}

/**
 * Get built-in indicator by ID
 */
export function getBuiltinIndicator(id: string): BuiltInIndicator | undefined {
  return BUILTIN_INDICATORS.find(ind => ind.id === id);
}

/**
 * Get indicators by category
 */
export function getIndicatorsByCategory(category: string): BuiltInIndicator[] {
  return BUILTIN_INDICATORS.filter(ind => ind.category === category);
}

/**
 * Get indicators by category and subcategory
 */
export function getIndicatorsBySubcategory(category: string, subcategory: string): BuiltInIndicator[] {
  return BUILTIN_INDICATORS.filter(ind => ind.category === category && ind.subcategory === subcategory);
}

/**
 * Get all categories
 */
export function getIndicatorCategories(): string[] {
  const categories = new Set(BUILTIN_INDICATORS.map(ind => ind.category));
  return Array.from(categories);
}

/**
 * Get all subcategories for a category
 */
export function getIndicatorSubcategories(category: string): string[] {
  const subcats = new Set(
    BUILTIN_INDICATORS
      .filter(ind => ind.category === category && ind.subcategory)
      .map(ind => ind.subcategory as string)
  );
  return Array.from(subcats);
}

/**
 * Get indicators grouped by category
 */
export function getIndicatorsGroupedByCategory(): Record<string, BuiltInIndicator[]> {
  const grouped: Record<string, BuiltInIndicator[]> = {};
  for (const ind of BUILTIN_INDICATORS) {
    if (!grouped[ind.category]) {
      grouped[ind.category] = [];
    }
    grouped[ind.category].push(ind);
  }
  return grouped;
}

/**
 * Get indicators grouped by subcategory within a category
 */
export function getIndicatorsGroupedBySubcategory(category: string): Record<string, BuiltInIndicator[]> {
  const grouped: Record<string, BuiltInIndicator[]> = {};
  const indicators = BUILTIN_INDICATORS.filter(ind => ind.category === category);
  for (const ind of indicators) {
    const key = ind.subcategory || '_default';
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(ind);
  }
  return grouped;
}
