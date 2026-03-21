document.addEventListener("DOMContentLoaded", () => {
  const formatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  })

  const tokenKey = "gc_auth_token"
  let authToken = localStorage.getItem(tokenKey)
  let currentSubscriptionActive = false
  let isUserLoggedIn = false

  const authCard = document.getElementById("auth-card")
  const subscriptionCard = document.getElementById("subscription-card")
  const calculatorCard = document.getElementById("calculator-card")
  const resultCard = document.getElementById("result-card")
  const historyCard = document.getElementById("history-card")
  const userBadge = document.getElementById("user-badge")
  const userName = document.getElementById("user-name")
  const messageBanner = document.getElementById("message-banner")

  const subscriptionStatusText = document.getElementById("subscription-status-text")
  const subscriptionExpirationText = document.getElementById("subscription-expiration-text")
  const subscriptionPaymentText = document.getElementById("subscription-payment-text")
  const subscriptionPixText = document.getElementById("subscription-pix-text")

  const loginForm = document.getElementById("login-form")
  const registerForm = document.getElementById("register-form")
  const resetRequestForm = document.getElementById("reset-request-form")
  const resetConfirmForm = document.getElementById("reset-confirm-form")
  const adminAccessForm = document.getElementById("admin-access-form")
  const logoutBtn = document.getElementById("logout-btn")
  const form = document.getElementById("remuneracao-form")
  const resultados = document.getElementById("resultados")
  const historyList = document.getElementById("history-list")
  const printBtn = document.getElementById("print-btn")
  const railItems = Array.from(document.querySelectorAll(".side-rail .rail-item"))

  const inputBaseAtual = document.getElementById("baseAtual")
  const inputValorExtraFestivo = document.getElementById("valorExtraFestivo")
  const inputOutrosDescontos = document.getElementById("outrosDescontos")
  const inputPensaoValor = document.getElementById("pensaoValor")
  const selectPensaoAtiva = document.getElementById("pensaoAtiva")
  const pensaoValorField = document.getElementById("pensaoValorField")

  function showMessage(message, type = "ok") {
    messageBanner.textContent = message
    messageBanner.classList.remove("hidden", "ok", "error")
    messageBanner.classList.add(type)
  }

  function hideMessage() {
    messageBanner.classList.add("hidden")
  }

  function isVisibleSection(element) {
    return Boolean(element) && !element.classList.contains("hidden")
  }

  function setRailActiveByTarget(targetId) {
    railItems.forEach((item) => {
      const isCurrent = item.dataset.target === targetId
      item.classList.toggle("active", isCurrent)
      item.setAttribute("aria-current", isCurrent ? "page" : "false")
    })
  }

  function getBestVisibleSection(preferredTargetId) {
    const preferred = document.getElementById(preferredTargetId)
    if (isVisibleSection(preferred)) return preferred
    const fallbackOrder = [
      "subscription-card",
      "calculator-card",
      "result-card",
      "history-card",
      "auth-card",
    ]
    for (const id of fallbackOrder) {
      const candidate = document.getElementById(id)
      if (isVisibleSection(candidate)) return candidate
    }
    return null
  }

  function navigateToSection(targetId) {
    const target = getBestVisibleSection(targetId)
    if (!target) return
    target.scrollIntoView({ behavior: "smooth", block: "start" })
    setRailActiveByTarget(target.id)
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
    if (!hasPensao) {
      inputPensaoValor.value = formatter.format(0)
    }
  }

  async function apiFetch(url, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    }
    if (authToken) headers.Authorization = `Bearer ${authToken}`

    const response = await fetch(url, { ...options, headers })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(data.error || "Falha na requisição.")
      error.status = response.status
      error.payload = data
      throw error
    }
    return data
  }

  function setSubscriptionState(subscription, active) {
    currentSubscriptionActive = active
    subscriptionCard.classList.remove("hidden")
    if (active) {
      subscriptionStatusText.textContent = "Ativa"
      subscriptionExpirationText.textContent = subscription.paidUntil || "-"
      subscriptionPaymentText.textContent = "Confirmado"
      subscriptionPixText.textContent = subscription.pixPaymentReference
        ? `Referência Pix: ${subscription.pixPaymentReference}`
        : "Pagamento anual confirmado."
      calculatorCard.classList.remove("hidden")
      historyCard.classList.remove("hidden")
    } else {
      subscriptionStatusText.textContent = "Pendente"
      subscriptionExpirationText.textContent = "-"
      subscriptionPaymentText.textContent = "Aguardando confirmação"
      subscriptionPixText.textContent = `Pix do desenvolvedor: ${subscription.pixKey}`
      calculatorCard.classList.add("hidden")
      historyCard.classList.add("hidden")
      resultCard.classList.add("hidden")
    }
  }

  function setAuthenticatedUI(user, subscription, active) {
    isUserLoggedIn = true
    authCard.classList.add("hidden")
    userBadge.classList.remove("hidden")
    userName.textContent = user.name
    setSubscriptionState(subscription, active)
    setRailActiveByTarget("subscription-card")
  }

  function setLoggedOutUI() {
    isUserLoggedIn = false
    authCard.classList.remove("hidden")
    subscriptionCard.classList.add("hidden")
    calculatorCard.classList.add("hidden")
    historyCard.classList.add("hidden")
    resultCard.classList.add("hidden")
    userBadge.classList.add("hidden")
    userName.textContent = ""
    historyList.innerHTML = ""
    resultados.innerHTML = ""
    currentSubscriptionActive = false
    setRailActiveByTarget("auth-card")
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

    const rowReserva = document.createElement("div")
    rowReserva.classList.add("item", "reserve-row")
    rowReserva.innerHTML = `<span>Reserva recomendada (10%)</span><span>${formatter.format(payload.reservas.sugestaoReserva10)}</span>`
    resultados.appendChild(rowReserva)

    const rowAnual = document.createElement("div")
    rowAnual.classList.add("item", "reserve-row")
    rowAnual.innerHTML = `<span>Projecao anual liquida</span><span>${formatter.format(payload.reservas.projecaoAnualLiquida)}</span>`
    resultados.appendChild(rowAnual)
  }

  async function loadHistory() {
    if (!currentSubscriptionActive) return
    const data = await apiFetch("/api/calculations")
    historyList.innerHTML = ""

    if (!data.records.length) {
      const empty = document.createElement("li")
      empty.classList.add("history-empty")
      empty.textContent = "Ainda não há cálculos salvos."
      historyList.appendChild(empty)
      return
    }

    data.records.forEach((record) => {
      const li = document.createElement("li")
      const dataCalculo = new Date(record.createdAt).toLocaleString("pt-BR")
      li.innerHTML = `
        <div>
          <strong>Mes ${record.monthKey}</strong>
          <p>${dataCalculo}</p>
        </div>
        <span>${formatter.format(record.totalLiquido)}</span>
      `
      historyList.appendChild(li)
    })
  }

  async function verifySession() {
    if (!authToken) {
      setLoggedOutUI()
      return
    }

    try {
      const data = await apiFetch("/api/auth/me")
      setAuthenticatedUI(data.user, data.subscription, data.subscriptionActive)
      await loadHistory()
    } catch (_error) {
      localStorage.removeItem(tokenKey)
      authToken = ""
      setLoggedOutUI()
    }
  }

  async function submitCalculation(overwrite = false) {
    const payload = getCalcPayload(overwrite)
    const response = await apiFetch("/api/calc", {
      method: "POST",
      body: JSON.stringify(payload),
    })
    renderResults(response)
    await loadHistory()
    document.querySelector(".print-control").style.display = "block"
    showMessage("Cálculo validado e salvo com sucesso.", "ok")
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault()
    hideMessage()
    try {
      const email = document.getElementById("login-email").value
      const password = document.getElementById("login-password").value
      const data = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      })
      authToken = data.token
      localStorage.setItem(tokenKey, authToken)
      setAuthenticatedUI(data.user, data.subscription, data.subscriptionActive)
      await loadHistory()
      showMessage("Login realizado com sucesso.", "ok")
      loginForm.reset()
    } catch (error) {
      showMessage(error.message, "error")
    }
  })

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault()
    hideMessage()
    try {
      const name = document.getElementById("register-name").value
      const email = document.getElementById("register-email").value
      const password = document.getElementById("register-password").value
      const data = await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      })
      authToken = data.token
      localStorage.setItem(tokenKey, authToken)
      setAuthenticatedUI(data.user, data.subscription, data.subscriptionActive)
      showMessage("Conta criada. Aguarde confirmação de pagamento para liberar acesso.", "ok")
      registerForm.reset()
    } catch (error) {
      showMessage(error.message, "error")
    }
  })

  resetRequestForm.addEventListener("submit", async (event) => {
    event.preventDefault()
    hideMessage()
    try {
      const email = document.getElementById("reset-email").value
      const response = await apiFetch("/api/auth/request-password-reset", {
        method: "POST",
        body: JSON.stringify({ email }),
      })
      let message = "Se o email existir, enviamos instrucoes de recuperacao."
      if (response.debugResetUrl) message += ` Link de teste: ${response.debugResetUrl}`
      showMessage(message, "ok")
      resetRequestForm.reset()
    } catch (error) {
      showMessage(error.message, "error")
    }
  })

  resetConfirmForm.addEventListener("submit", async (event) => {
    event.preventDefault()
    hideMessage()
    try {
      const token = document.getElementById("reset-token").value
      const newPassword = document.getElementById("reset-new-password").value
      await apiFetch("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword }),
      })
      showMessage("Senha redefinida com sucesso.", "ok")
      resetConfirmForm.reset()
    } catch (error) {
      showMessage(error.message, "error")
    }
  })

  adminAccessForm.addEventListener("submit", async (event) => {
    event.preventDefault()
    hideMessage()
    try {
      const email = document.getElementById("admin-login-email").value
      const password = document.getElementById("admin-login-password").value
      await apiFetch("/api/admin/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      })
      const access = await apiFetch("/api/admin/access")
      window.location.assign(access.redirectUrl)
    } catch (error) {
      showMessage(error.message, "error")
    }
  })

  logoutBtn.addEventListener("click", () => {
    authToken = ""
    localStorage.removeItem(tokenKey)
    setLoggedOutUI()
    showMessage("Sessao encerrada.", "ok")
  })

  form.addEventListener("submit", async (event) => {
    event.preventDefault()
    hideMessage()
    if (!currentSubscriptionActive) {
      showMessage("Conta aguardando confirmação de pagamento para liberar o cálculo.", "error")
      return
    }

    try {
      await submitCalculation(false)
    } catch (error) {
      if (error.status === 409 && error.payload?.requiresOverwrite) {
        const shouldOverwrite = window.confirm(
          "Já existe um cálculo salvo para este mês. Deseja sobrescrever?"
        )
        if (!shouldOverwrite) {
          showMessage("Cálculo mensal mantido sem alterações.", "ok")
          return
        }
        await submitCalculation(true)
        return
      }

      if (error.status === 403 && error.payload?.subscription) {
        setSubscriptionState(error.payload.subscription, false)
      }

      const details = error.payload?.details?.join(" | ")
      showMessage(details ? `${error.message} ${details}` : error.message, "error")
    }
  })

  printBtn.addEventListener("click", () => {
    const now = new Date()
    const date = now.toLocaleDateString("pt-BR")
    const time = now.toLocaleTimeString("pt-BR")
    document.getElementById("print-date").textContent = `Data de Impressao: ${date} ${time}`
    window.print()
  })

  formatAsCurrencyInput(inputBaseAtual)
  formatAsCurrencyInput(inputValorExtraFestivo)
  formatAsCurrencyInput(inputOutrosDescontos)
  formatAsCurrencyInput(inputPensaoValor)
  inputPensaoValor.value = formatter.format(0)

  selectPensaoAtiva.addEventListener("change", updatePensaoVisibility)
  updatePensaoVisibility()

  const resetTokenFromQuery = new URLSearchParams(window.location.search).get("resetToken")
  if (resetTokenFromQuery) {
    document.getElementById("reset-token").value = resetTokenFromQuery
  }

  verifySession()

  railItems.forEach((item) => {
    item.addEventListener("click", () => {
      const targetId = item.dataset.target
      if (!targetId) return

      if (targetId === "auth-card" && isUserLoggedIn) {
        showMessage("Você já está logado.", "ok")
        return
      }

      if (!isUserLoggedIn && targetId !== "auth-card") {
        showMessage("Faça login para acessar esta área.", "error")
        navigateToSection("auth-card")
        return
      }

      if (
        (targetId === "calculator-card" || targetId === "history-card") &&
        !currentSubscriptionActive
      ) {
        showMessage(
          "Acesso bloqueado para esta área até a confirmação da assinatura.",
          "error"
        )
      }
      navigateToSection(targetId)
    })
  })
})
