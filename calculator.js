const BASE_INICIAL = 1890.0
const EPSILON = 0.01

const EDUCATION_MAP = {
  1: { increase: 0.0, nightFactor: 2.6 },
  2: { increase: 0.1, nightFactor: 2.86 },
  3: { increase: 0.2, nightFactor: 3.13 },
  4: { increase: 0.3, nightFactor: 3.39 },
}

const SHIFT_MAP = {
  7: { nightHours: 77, ex50: 4, ex70: 4, auxDays: 21 },
  8: { nightHours: 88, ex50: 17, ex70: 15, auxDays: 24 },
  adm: { nightHours: 0, ex50: 0, ex70: 0, auxDays: 0 },
}

const FUNCTION_BONUS_OPTIONS = {
  comandante: { label: "Gratificação de Comandante", rate: 1.0 },
  subcomandante: { label: "Gratificação de Subcomandante", rate: 0.85 },
  inspetor: { label: "Gratificação de Inspetor", rate: 0.75 },
  subinspetor: { label: "Gratificação de Subinspetor", rate: 0.5 },
  auxiliar_corregedoria: { label: "Gratificação de Auxiliar de Corregedoria", rate: 0.2 },
  corregedor: { label: "Gratificação de Corregedor", rate: 0.7 },
}

function clampNumber(value, fallback = 0) {
  const parsed = Number(value)
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    return fallback
  }
  return Math.max(0, parsed)
}

function roundCurrency(value) {
  return Math.round(value * 100) / 100
}

function normalizeFunctionBonuses(value) {
  const list = Array.isArray(value) ? value : []
  const unique = new Set()
  list.forEach((item) => {
    const key = String(item || "").trim()
    if (FUNCTION_BONUS_OPTIONS[key]) {
      unique.add(key)
    }
  })
  return Array.from(unique)
}

function normalizeInput(rawInput) {
  const input = rawInput || {}
  const plantoesRaw = String(input.plantoes || "").trim().toLowerCase()
  const plantoes =
    plantoesRaw === "adm"
      ? "adm"
      : [7, 8].includes(Number(input.plantoes))
        ? Number(input.plantoes)
        : 7
  const escolaridade = [1, 2, 3, 4].includes(Number(input.escolaridade))
    ? Number(input.escolaridade)
    : 1
  const especializacao = [0, 15, 25].includes(Number(input.especializacao))
    ? Number(input.especializacao)
    : 0
  const pensaoAtiva =
    input.pensaoAtiva === true ||
    input.pensaoAtiva === "1" ||
    input.pensaoAtiva === 1
  const pensaoValor = clampNumber(input.pensaoValor)

  return {
    baseAtual: clampNumber(input.baseAtual),
    plantoes,
    escolaridade,
    quinquenio: clampNumber(input.quinquenio),
    especializacao,
    extra24: clampNumber(input.extra24),
    extra10diurno: clampNumber(input.extra10diurno),
    extra10noturno: clampNumber(input.extra10noturno),
    extraFestivo: clampNumber(input.extraFestivo),
    valorExtraFestivo: clampNumber(input.valorExtraFestivo),
    quantidadeAuxilioAlimentacaoManual:
      plantoes === "adm" ? clampNumber(input.quantidadeAuxilioAlimentacaoManual) : 0,
    dependentes: clampNumber(input.dependentes),
    sindicalizado:
      input.sindicalizado === true ||
      input.sindicalizado === "1" ||
      input.sindicalizado === 1,
    outrosDescontos: clampNumber(input.outrosDescontos),
    ferias:
      input.ferias === true || input.ferias === "1" || input.ferias === 1,
    pensaoAtiva,
    pensaoValor: pensaoAtiva ? pensaoValor : 0,
    gratificacoesFuncao: normalizeFunctionBonuses(input.gratificacoesFuncao),
  }
}

function calculateIncomeTax(baseCalculoIR) {
  if (baseCalculoIR <= 2428.8) return 0
  if (baseCalculoIR <= 2826.65) return baseCalculoIR * 0.075 - 182.16
  if (baseCalculoIR <= 3751.05) return baseCalculoIR * 0.15 - 394.16
  if (baseCalculoIR <= 4664.68) return baseCalculoIR * 0.225 - 675.45
  return baseCalculoIR * 0.275 - 908.73
}

function calculateIncomeTaxWithNewRules({
  baseCalculoIRAntiga,
  totalBruto,
  auxAlimentacao,
  valorEspecializacao,
  pensaoAlimenticia,
}) {
  const valorIRRegraAntiga = Math.max(0, calculateIncomeTax(baseCalculoIRAntiga))
  const baseCalculoIRNova =
    totalBruto - (auxAlimentacao + valorEspecializacao + pensaoAlimenticia)
  const descontoIR = 978.62 - 0.133145 * baseCalculoIRNova

  if (baseCalculoIRNova <= 5000) {
    return {
      impostoFinal: 0,
      valorIRRegraAntiga,
      baseCalculoIRNova,
      descontoIR: null,
      descontoFormulaAplicado: null,
      formulaElegivel: false,
    }
  }

  if (baseCalculoIRNova <= 7350) {
    return {
      impostoFinal: Math.max(0, valorIRRegraAntiga - descontoIR),
      valorIRRegraAntiga,
      baseCalculoIRNova,
      descontoIR,
      descontoFormulaAplicado: descontoIR,
      formulaElegivel: true,
    }
  }

  return {
    impostoFinal: valorIRRegraAntiga,
    valorIRRegraAntiga,
    baseCalculoIRNova,
    descontoIR: null,
    descontoFormulaAplicado: null,
    formulaElegivel: false,
  }
}

function getIncomeTaxRuleLabel(baseCalculoIRNova) {
  if (baseCalculoIRNova <= 5000) {
    return "Isenção até R$ 5.000,00"
  }
  if (baseCalculoIRNova <= 7350) {
    return "Faixa intermediária (R$ 5.000,01 a R$ 7.350,00) com ajuste complementar"
  }
  return "Faixa superior (> R$ 7.350,00) sem desconto complementar"
}

function validateCalculation(calculation) {
  const issues = []
  const { breakdownItems, discountItems, totals } = calculation

  const brutoFromBreakdown = breakdownItems.reduce((sum, item) => sum + item.value, 0)
  if (Math.abs(brutoFromBreakdown - totals.totalBrutoRaw) > EPSILON) {
    issues.push("Divergência entre itens de proventos e total bruto.")
  }

  const descontosFromItems = discountItems.reduce((sum, item) => sum + item.value, 0)
  if (Math.abs(descontosFromItems - totals.totalDescontosRaw) > EPSILON) {
    issues.push("Divergência entre itens de descontos e total de descontos.")
  }

  const liquidoEsperado = totals.totalBrutoRaw - totals.totalDescontosRaw
  if (Math.abs(liquidoEsperado - totals.totalLiquidoRaw) > EPSILON) {
    issues.push("Divergência na consolidação do total líquido.")
  }

  if (totals.totalLiquidoRaw < -EPSILON) {
    issues.push("Total líquido negativo, revise os dados de entrada.")
  }

  if (issues.length > 0) {
    const error = new Error("Falha de validação nos cálculos.")
    error.details = issues
    throw error
  }
}

function calculateFunctionBonusTotal(baseInicial, selectedBonuses) {
  return selectedBonuses.reduce((sum, key) => {
    const bonus = FUNCTION_BONUS_OPTIONS[key]
    return sum + baseInicial * bonus.rate
  }, 0)
}

function calculateCompensation(rawInput) {
  const input = normalizeInput(rawInput)
  if (input.baseAtual <= 0) {
    const error = new Error("Salário base inválido.")
    error.details = ["Informe um salário base maior que zero."]
    throw error
  }

  const educationRules = EDUCATION_MAP[input.escolaridade]
  const shiftRules = SHIFT_MAP[input.plantoes]

  const baseReferencia = input.baseAtual
  const baseReajustada = baseReferencia * (1 + educationRules.increase)
  const riscoVida = baseReajustada * 0.5
  let adNoturno = educationRules.nightFactor * shiftRules.nightHours
  const horasExcedentes50 = (baseReajustada / 160) * 1.5 * shiftRules.ex50
  const horasExcedentes70 = (baseReajustada / 160) * 1.7 * shiftRules.ex70

  let quantidadeAuxiliosAlimentacao = 0
  let auxAlimentacao = 0
  if (input.plantoes === "adm") {
    quantidadeAuxiliosAlimentacao =
      input.quantidadeAuxilioAlimentacaoManual + input.extra24 * 3
    auxAlimentacao = BASE_INICIAL * 0.02 * quantidadeAuxiliosAlimentacao
  } else {
    quantidadeAuxiliosAlimentacao =
      shiftRules.auxDays + input.extra24 * 3 + input.extra10diurno + input.extra10noturno
    auxAlimentacao = BASE_INICIAL * 0.02 * quantidadeAuxiliosAlimentacao
  }

  const valorExtra24 = 370.0 * input.extra24
  const valorExtra10diurno = 141.48 * input.extra10diurno
  const valorExtra10noturno = 163.25 * input.extra10noturno
  {
    const valorAdNoturnoExtra24 = educationRules.nightFactor * 11 * input.extra24
    adNoturno += valorAdNoturnoExtra24
  }
  if (input.plantoes !== "adm") {
    const valorAdNoturnoExtra10 = educationRules.nightFactor * input.extra10noturno
    adNoturno += valorAdNoturnoExtra10
  }

  const totalExtraFestivo = input.valorExtraFestivo * input.extraFestivo
  const valorQuinquenio = baseReajustada * 0.05 * input.quinquenio

  const valorGratificacaoFuncao = calculateFunctionBonusTotal(
    BASE_INICIAL,
    input.gratificacoesFuncao
  )

  const totalAntesEspecializacao = [
    baseReajustada,
    riscoVida,
    adNoturno,
    horasExcedentes50,
    horasExcedentes70,
    auxAlimentacao,
    valorExtra24,
    valorExtra10diurno,
    valorExtra10noturno,
    totalExtraFestivo,
    valorQuinquenio,
    valorGratificacaoFuncao,
  ].reduce((sum, current) => sum + current, 0)

  const valorEspecializacao =
    input.especializacao === 0
      ? 0
      : totalAntesEspecializacao * (input.especializacao / 100)

  const breakdownItems = [
    { label: "Base Ajustada", value: baseReajustada },
    { label: "Risco de Vida", value: riscoVida },
    { label: "Adicional Noturno", value: adNoturno },
    { label: "Horas Excedentes 50%", value: horasExcedentes50 },
    { label: "Horas Excedentes 70%", value: horasExcedentes70 },
    { label: "Auxílio Alimentação", value: auxAlimentacao },
    { label: "Serviço Extra 24h", value: valorExtra24 },
    { label: "Serviço Extra 10h Diurno", value: valorExtra10diurno },
    { label: "Serviço Extra 10h Noturno", value: valorExtra10noturno },
    { label: "Extras Festivos", value: totalExtraFestivo },
    { label: "Quinquênio", value: valorQuinquenio },
    { label: "Gratificação por Função", value: valorGratificacaoFuncao },
    { label: "Especialização", value: valorEspecializacao },
  ]

  let totalBruto = breakdownItems.reduce((sum, item) => sum + item.value, 0)
  let valorFerias = 0
  if (input.ferias) {
    valorFerias = totalBruto / 3
    breakdownItems.push({ label: "Férias (1/3 sobre o bruto)", value: valorFerias })
    totalBruto += valorFerias
  }

  const previdencia = (baseReajustada + valorQuinquenio) * 0.14
  const sindicato = input.sindicalizado ? baseReajustada * 0.02 : 0
  const valorDependentes = 189.59 * input.dependentes
  const pensaoAlimenticia = input.pensaoValor

  const baseCalculoIRAntiga = totalBruto - (
    previdencia +
    auxAlimentacao +
    valorEspecializacao +
    valorDependentes +
    pensaoAlimenticia
  )

  const taxResult = calculateIncomeTaxWithNewRules({
    baseCalculoIRAntiga,
    totalBruto,
    auxAlimentacao,
    valorEspecializacao,
    pensaoAlimenticia,
  })
  const descontoIR = taxResult.impostoFinal

  const discountItems = [
    { label: "Sindicato", value: sindicato },
    { label: "Previdência", value: previdencia },
    { label: "Pensão Alimentícia", value: pensaoAlimenticia },
    { label: "Imposto de Renda", value: descontoIR },
    { label: "Descontos Individuais", value: input.outrosDescontos },
  ]

  const totalDescontos = discountItems.reduce((sum, item) => sum + item.value, 0)
  const totalLiquido = totalBruto - totalDescontos
  const regraImpostoRenda = getIncomeTaxRuleLabel(taxResult.baseCalculoIRNova)
  const quantidadeHorasAdicionalNoturno =
    input.plantoes === "adm"
      ? 11 * input.extra24
      : shiftRules.nightHours + 11 * input.extra24 + input.extra10noturno

  const calculated = {
    normalizedInput: input,
    breakdownItems,
    discountItems,
    totals: {
      totalBrutoRaw: totalBruto,
      totalDescontosRaw: totalDescontos,
      totalLiquidoRaw: totalLiquido,
      baseCalculoIRRaw: baseCalculoIRAntiga,
      baseCalculoIRNovaRaw: taxResult.baseCalculoIRNova,
    },
  }

  validateCalculation(calculated)

  return {
    normalizedInput: input,
    breakdownItems: breakdownItems.map((item) => ({
      label: item.label,
      value: roundCurrency(item.value),
    })),
    discountItems: discountItems.map((item) => ({
      label: item.label,
      value: roundCurrency(item.value),
    })),
    totals: {
      totalBruto: roundCurrency(totalBruto),
      totalDescontos: roundCurrency(totalDescontos),
      totalLiquido: roundCurrency(totalLiquido),
      baseCalculoIR: roundCurrency(baseCalculoIRAntiga),
      baseCalculoIRNova: roundCurrency(taxResult.baseCalculoIRNova),
    },
    reservas: {
      sugestaoReserva10: roundCurrency(totalLiquido * 0.1),
      sugestaoReserva20: roundCurrency(totalLiquido * 0.2),
      projecaoAnualLiquida: roundCurrency(totalLiquido * 12),
    },
    meta: {
      gratificacoesSelecionadas: input.gratificacoesFuncao.map(
        (key) => FUNCTION_BONUS_OPTIONS[key].label
      ),
      validado: true,
    },
    informacoesCalculo: {
      quantidadeHorasAdicionalNoturno: roundCurrency(quantidadeHorasAdicionalNoturno),
      quantidadeHorasExcedentes50: roundCurrency(shiftRules.ex50),
      quantidadeHorasExcedentes70: roundCurrency(shiftRules.ex70),
      quantidadeAuxiliosAlimentacao: roundCurrency(quantidadeAuxiliosAlimentacao),
      regraImpostoRenda,
      baseCalculoImpostoRenda: roundCurrency(taxResult.baseCalculoIRNova),
      baseCalculoImpostoRendaAntiga: roundCurrency(baseCalculoIRAntiga),
      valorIRRegraAntiga: roundCurrency(taxResult.valorIRRegraAntiga),
      descontoFormulaIntermediaria: taxResult.formulaElegivel
        ? roundCurrency(taxResult.descontoIR)
        : null,
    },
  }
}

module.exports = {
  calculateCompensation,
  FUNCTION_BONUS_OPTIONS,
}
