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

  const historyList = document.getElementById("history-list")
  const summaryText = document.getElementById("history-summary-text")
  const formatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
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
    setFlash("Faça login para visualizar seu histórico.", "error")
    window.location.assign("/app/login")
    return
  }

  updateUserBadge(me.user)
  setupSidebarNavigation("/app/historico", isLoggedIn)
  setupLogout()
  consumeFlash()

  try {
    const data = await apiFetch("/api/calculations")
    historyList.innerHTML = ""

    if (!data.records.length) {
      const empty = document.createElement("li")
      empty.classList.add("history-empty")
      empty.textContent = "Nenhum cálculo mensal salvo até o momento."
      historyList.appendChild(empty)
      summaryText.textContent = "Sem registros para exibição."
      return
    }

    let totalLiquido = 0
    let totalBruto = 0
    data.records.forEach((record) => {
      totalLiquido += Number(record.totalLiquido || 0)
      totalBruto += Number(record.totalBruto || 0)
      const row = document.createElement("li")
      row.innerHTML = `
        <div>
          <strong>Mês ${formatMonthKey(record.monthKey)}</strong>
          <p>${formatDateTimeBR(record.createdAt)}</p>
          <p>Bruto: ${formatter.format(Number(record.totalBruto || 0))}</p>
        </div>
        <span>Líquido: ${formatter.format(Number(record.totalLiquido || 0))}</span>
      `
      historyList.appendChild(row)
    })

    summaryText.textContent = `Acumulado dos últimos ${data.records.length} meses - Bruto: ${formatter.format(totalBruto)} | Líquido: ${formatter.format(totalLiquido)}`
  } catch (error) {
    historyList.innerHTML = ""
    const blocked = document.createElement("li")
    blocked.classList.add("history-empty")
    blocked.textContent = "Histórico indisponível enquanto a assinatura estiver pendente."
    historyList.appendChild(blocked)
    showBanner(error.message, "error")
  }
})
