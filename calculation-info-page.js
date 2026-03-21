document.addEventListener("DOMContentLoaded", async () => {
  const {
    apiFetch,
    getMe,
    showBanner,
    consumeFlash,
    updateUserBadge,
    setupSidebarNavigation,
    setupLogout,
    setFlash,
    formatDateTimeBR,
  } = window.AppCommon

  const formatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  })

  const monthRef = document.getElementById("calc-info-month")
  const nightHours = document.getElementById("info-night-hours")
  const ex50Hours = document.getElementById("info-ex50-hours")
  const ex70Hours = document.getElementById("info-ex70-hours")
  const auxQty = document.getElementById("info-aux-qty")
  const irRule = document.getElementById("info-ir-rule")
  const irBase = document.getElementById("info-ir-base")
  const irFormulaDiscount = document.getElementById("info-ir-formula-discount")
  const totalBruto = document.getElementById("info-total-bruto")
  const totalLiquido = document.getElementById("info-total-liquido")

  function isLoggedIn() {
    return true
  }

  function formatMonthKey(monthKey) {
    const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/)
    if (!match) return monthKey || "-"
    return `${match[2]}/${match[1]}`
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(Number(value || 0))
  }

  const me = await getMe()
  if (!me) {
    setFlash("Faça login para visualizar as informações úteis de cálculo.", "error")
    window.location.assign("/app/login")
    return
  }

  updateUserBadge(me.user)
  setupSidebarNavigation("/app/informacoes-calculo", isLoggedIn)
  setupLogout()
  consumeFlash()

  try {
    const data = await apiFetch("/api/calculations/useful-info/latest")
    const info = data.informacoesCalculo || {}
    monthRef.textContent = `Mês ${formatMonthKey(data.record.monthKey)} - atualizado em ${formatDateTimeBR(data.record.createdAt)}`
    nightHours.textContent = formatNumber(info.quantidadeHorasAdicionalNoturno)
    ex50Hours.textContent = formatNumber(info.quantidadeHorasExcedentes50)
    ex70Hours.textContent = formatNumber(info.quantidadeHorasExcedentes70)
    auxQty.textContent = formatNumber(info.quantidadeAuxiliosAlimentacao)
    irRule.textContent = info.regraImpostoRenda || "-"
    irBase.textContent = formatter.format(Number(info.baseCalculoImpostoRenda || 0))
    irFormulaDiscount.textContent =
      info.descontoFormulaIntermediaria === null ||
      info.descontoFormulaIntermediaria === undefined
        ? "Não aplicável para esta faixa."
        : formatter.format(Number(info.descontoFormulaIntermediaria || 0))
    totalBruto.textContent = formatter.format(Number(data.record.totalBruto || 0))
    totalLiquido.textContent = formatter.format(Number(data.record.totalLiquido || 0))
  } catch (error) {
    monthRef.textContent = "Nenhuma referência disponível no momento."
    showBanner(error.message, "error")
  }
})
