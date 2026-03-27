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

  const referenceEl = document.getElementById("commitment-reference")
  const avgGrossEl = document.getElementById("commitment-avg-gross")
  const avgNetEl = document.getElementById("commitment-avg-net")
  const discountsListEl = document.getElementById("commitment-discounts-list")
  const reservePercentEl = document.getElementById("reserve-percent")
  const reserveMonthlyEl = document.getElementById("reserve-monthly")
  const reserveRateEl = document.getElementById("reserve-rate")
  const reserveTotalEl = document.getElementById("reserve-total")

  const currencyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  })
  const percentFormatter = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  function isLoggedIn() {
    return true
  }

  function formatMonthKey(monthKey) {
    const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/)
    if (!match) return monthKey || "-"
    return `${match[2]}/${match[1]}`
  }

  const me = await getMe()
  if (!me) {
    setFlash("Faça login para visualizar o comprometimento de renda.", "error")
    window.location.assign("/app/login")
    return
  }

  updateUserBadge(me.user)
  setupSidebarNavigation("/app/comprometimento-reserva", isLoggedIn)
  setupLogout()
  consumeFlash()

  try {
    const data = await apiFetch("/api/calculations/commitment-reserve")
    const reference = data.referencia || {}
    const resumoRenda = data.resumoRenda || {}
    const reservaFinanceira = data.reservaFinanceira || {}
    const analiseDescontos = Array.isArray(data.analiseDescontos) ? data.analiseDescontos : []

    referenceEl.textContent = `Última referência: ${formatMonthKey(reference.monthKey)} (atualizado em ${formatDateTimeBR(reference.createdAt)}). Base de ${reference.mesesConsiderados || 0} mês(es).`
    avgGrossEl.textContent = currencyFormatter.format(Number(resumoRenda.mediaMensalBruta || 0))
    avgNetEl.textContent = currencyFormatter.format(Number(resumoRenda.mediaMensalLiquida || 0))

    discountsListEl.innerHTML = ""
    if (!analiseDescontos.length) {
      const emptyRow = document.createElement("div")
      emptyRow.className = "commitment-row empty"
      emptyRow.textContent = "Nenhum desconto identificado nos últimos cálculos."
      discountsListEl.appendChild(emptyRow)
    } else {
      analiseDescontos.forEach((item) => {
        const row = document.createElement("article")
        row.className = "commitment-row"
        row.innerHTML = `
          <div class="commitment-col type">${item.tipo}</div>
          <div class="commitment-col amount">
            <span>Acumulado anual</span>
            <strong>${currencyFormatter.format(Number(item.valorAcumuladoAnual || 0))}</strong>
          </div>
          <div class="commitment-col percent">
            <span>% da renda mensal</span>
            <strong>${percentFormatter.format(Number(item.percentualDaRendaMensal || 0))}%</strong>
          </div>
        `
        discountsListEl.appendChild(row)
      })
    }

    reservePercentEl.textContent = `${percentFormatter.format(
      Number(reservaFinanceira.percentualAplicado || 0)
    )}% da remuneração líquida média`
    reserveMonthlyEl.textContent = currencyFormatter.format(
      Number(reservaFinanceira.sugestaoMensal || 0)
    )
    reserveRateEl.textContent = `${percentFormatter.format(
      Number(reservaFinanceira.rendimentoMensalPercentual || 0)
    )}% ao mês (juros compostos)`
    reserveTotalEl.textContent = currencyFormatter.format(
      Number(reservaFinanceira.totalAcumulado12Meses || 0)
    )
  } catch (error) {
    referenceEl.textContent = "Sem dados para análise no momento."
    discountsListEl.innerHTML = `<div class="commitment-row empty">Não foi possível carregar os dados financeiros.</div>`
    showBanner(error.message, "error")
  }
})
