document.addEventListener("DOMContentLoaded", async () => {
  const {
    apiFetch,
    getMe,
    showBanner,
    clearBanner,
    consumeFlash,
    updateUserBadge,
    setupSidebarNavigation,
    setupLogout,
    setFlash,
    formatDateBR,
  } = window.AppCommon

  const formatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  })

  const form = document.getElementById("remuneracao-form")
  const resultados = document.getElementById("resultados")
  const printBtn = document.getElementById("print-btn")
  const resultCard = document.getElementById("result-card")
  const accountHint = document.getElementById("entries-account-hint")

  const inputBaseAtual = document.getElementById("baseAtual")
  const inputValorExtraFestivo = document.getElementById("valorExtraFestivo")
  const inputOutrosDescontos = document.getElementById("outrosDescontos")
  const inputPensaoValor = document.getElementById("pensaoValor")
  const selectPensaoAtiva = document.getElementById("pensaoAtiva")
  const pensaoValorField = document.getElementById("pensaoValorField")

  let currentSubscriptionActive = false

  function isLoggedIn() {
    return true
  }

  function parseBRL(value) {
    return Number(
      String(value || "0")
        .replace(/\./g, "")
        .replace(",", ".")
        .replace(/[^0-9.]/g, "")
    )
  }

  function formatAsCurrencyInput(input) {
    input.addEventListener("input", (event) => {
      const numbers = event.target.value.replace(/\D/g, "")
      event.target.value = formatter.format(Number(numbers) / 100)
    })
  }

  function updatePensaoVisibility() {
    const hasPensao = selectPensaoAtiva.value === "1"
    pensaoValorField.classList.toggle("hidden", !hasPensao)
    if (!hasPensao) inputPensaoValor.value = formatter.format(0)
  }

  function getSelectedFunctionBonuses() {
    return Array.from(
      document.querySelectorAll('input[name="gratificacaoFuncao"]:checked')
    ).map((input) => input.value)
  }

  function getCalcPayload(overwrite = false) {
    const pensaoAtiva = document.getElementById("pensaoAtiva").value === "1"
    return {
      baseAtual: parseBRL(inputBaseAtual.value),
      plantoes: Number(document.getElementById("plantoes").value),
      escolaridade: Number(document.getElementById("escolaridade").value),
      quinquenio: Number(document.getElementById("quinquenio").value || 0),
      especializacao: Number(document.getElementById("especializacao").value || 0),
      gratificacoesFuncao: getSelectedFunctionBonuses(),
      extra24: Number(document.getElementById("extra24").value || 0),
      extra10diurno: Number(document.getElementById("extra10diurno").value || 0),
      extra10noturno: Number(document.getElementById("extra10noturno").value || 0),
      extraFestivo: Number(document.getElementById("extraFestivo").value || 0),
      valorExtraFestivo: parseBRL(inputValorExtraFestivo.value),
      dependentes: Number(document.getElementById("dependentes").value || 0),
      sindicalizado: document.getElementById("sindicalizado").value === "1",
      pensaoAtiva,
      pensaoValor: pensaoAtiva ? parseBRL(inputPensaoValor.value) : 0,
      outrosDescontos: parseBRL(inputOutrosDescontos.value),
      ferias: document.getElementById("ferias").value === "1",
      overwrite,
    }
  }

  function renderResults(payload) {
    resultados.innerHTML = ""
    resultCard.classList.remove("hidden")
    document.querySelector(".print-control").style.display = "block"

    payload.breakdownItems.forEach((item, index) => {
      const row = document.createElement("div")
      row.classList.add("item")
      if (index === 0) row.classList.add("highlight-base")
      row.innerHTML = `<span>${item.label}</span><span>${formatter.format(item.value)}</span>`
      resultados.appendChild(row)
    })

    const rowBruto = document.createElement("div")
    rowBruto.classList.add("item")
    rowBruto.innerHTML = `<strong>Total Bruto</strong><strong>${formatter.format(payload.totals.totalBruto)}</strong>`
    resultados.appendChild(rowBruto)

    const rowLiquido = document.createElement("div")
    rowLiquido.classList.add("item", "total-liquido")
    rowLiquido.innerHTML = `<strong>Total Liquido</strong><strong>${formatter.format(payload.totals.totalLiquido)}</strong>`
    resultados.appendChild(rowLiquido)

    payload.discountItems.forEach((item) => {
      const row = document.createElement("div")
      row.classList.add("item")
      row.innerHTML = `<span>${item.label}</span><span>${formatter.format(item.value)}</span>`
      resultados.appendChild(row)
    })

    const rowDescontos = document.createElement("div")
    rowDescontos.classList.add("item", "total-descontos")
    rowDescontos.innerHTML = `<strong>Total Descontos</strong><strong>${formatter.format(payload.totals.totalDescontos)}</strong>`
    resultados.appendChild(rowDescontos)
  }

  async function submitCalculation(overwrite = false) {
    const response = await apiFetch("/api/calc", {
      method: "POST",
      body: JSON.stringify(getCalcPayload(overwrite)),
    })
    renderResults(response)
    showBanner("Cálculo validado e salvo com sucesso.", "ok")
  }

  const me = await getMe()
  if (!me) {
    setFlash("Faça login para acessar Entradas Financeiras.", "error")
    window.location.assign("/app/login")
    return
  }

  updateUserBadge(me.user)
  setupSidebarNavigation("/app/entradas", isLoggedIn)
  setupLogout()
  consumeFlash()

  currentSubscriptionActive = Boolean(me.subscriptionActive)
  if (currentSubscriptionActive) {
    accountHint.textContent = `Conta ativa até ${formatDateBR(me.subscription.paidUntil)}.`
  } else {
    accountHint.textContent =
      "Conta com assinatura pendente. O envio do cálculo ficará bloqueado até a confirmação."
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault()
    clearBanner()
    if (!currentSubscriptionActive) {
      showBanner("Assinatura pendente. Regularize o pagamento para calcular.", "error")
      return
    }
    try {
      await submitCalculation(false)
    } catch (error) {
      if (error.status === 409 && error.payload?.requiresOverwrite) {
        const overwrite = window.confirm(
          "Já existe um cálculo salvo neste mês. Deseja sobrescrever?"
        )
        if (!overwrite) {
          showBanner("Cálculo mensal mantido sem alterações.", "ok")
          return
        }
        await submitCalculation(true)
        return
      }
      const details = error.payload?.details?.join(" | ")
      showBanner(details ? `${error.message} ${details}` : error.message, "error")
    }
  })

  printBtn?.addEventListener("click", () => {
    const now = new Date()
    document.getElementById("print-date").textContent = `Data de Impressão: ${now.toLocaleDateString(
      "pt-BR"
    )} ${now.toLocaleTimeString("pt-BR")}`
    window.print()
  })

  formatAsCurrencyInput(inputBaseAtual)
  formatAsCurrencyInput(inputValorExtraFestivo)
  formatAsCurrencyInput(inputOutrosDescontos)
  formatAsCurrencyInput(inputPensaoValor)
  inputPensaoValor.value = formatter.format(0)

  selectPensaoAtiva.addEventListener("change", updatePensaoVisibility)
  updatePensaoVisibility()
})
