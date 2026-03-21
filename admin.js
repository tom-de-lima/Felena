document.addEventListener("DOMContentLoaded", () => {
  const appTimeZone = "America/Fortaleza"
  const banner = document.getElementById("admin-message-banner")
  const confirmForm = document.getElementById("admin-confirm-form")
  const statusForm = document.getElementById("admin-status-form")
  const refreshBtn = document.getElementById("admin-refresh-pending")
  const filterQ = document.getElementById("admin-filter-q")
  const filterStatus = document.getElementById("admin-filter-status")
  const pendingList = document.getElementById("admin-pending-list")
  const logoutBtn = document.getElementById("admin-logout-btn")
  const railItems = Array.from(document.querySelectorAll(".side-rail .rail-item"))
  const auditList = document.getElementById("admin-audit-list")
  const statTotalUsers = document.getElementById("stat-total-users")
  const statActiveUsers = document.getElementById("stat-active-users")
  const statPendingUsers = document.getElementById("stat-pending-users")
  const statExpiredUsers = document.getElementById("stat-expired-users")
  const statCanceledUsers = document.getElementById("stat-canceled-users")

  function parseServerDate(value) {
    if (!value) return null
    const raw = String(value).trim()
    if (!raw) return null

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const parsed = new Date(`${raw}T00:00:00`)
      return Number.isNaN(parsed.getTime()) ? null : parsed
    }

    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) {
      const parsed = new Date(raw.replace(" ", "T") + "Z")
      return Number.isNaN(parsed.getTime()) ? null : parsed
    }

    const parsed = new Date(raw)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  function formatDateBR(value) {
    const parsed = parseServerDate(value)
    if (!parsed) return "-"
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: appTimeZone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(parsed)
  }

  function formatDateTimeBR(value) {
    const parsed = parseServerDate(value)
    if (!parsed) return "-"
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: appTimeZone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(parsed)
  }

  function showMessage(message, type = "ok") {
    banner.textContent = message
    banner.classList.remove("hidden", "ok", "error")
    banner.classList.add(type)
  }

  function addAuditEntry(text) {
    const row = document.createElement("li")
    const timestamp = formatDateTimeBR(new Date())
    row.innerHTML = `
      <div>
        <strong>${text}</strong>
        <p>${timestamp}</p>
      </div>
      <span>OK</span>
    `
    auditList.prepend(row)
    while (auditList.children.length > 8) {
      auditList.removeChild(auditList.lastChild)
    }
  }

  function setRailActive(targetId) {
    railItems.forEach((item) => {
      const current = item.dataset.target === targetId
      item.classList.toggle("active", current)
      item.setAttribute("aria-current", current ? "page" : "false")
    })
  }

  function navigateToSection(targetId) {
    const target = document.getElementById(targetId)
    if (!target) return
    target.scrollIntoView({ behavior: "smooth", block: "start" })
    setRailActive(targetId)
    if (targetId === "admin-users-card") {
      filterQ.focus()
    }
  }

  async function adminFetch(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data.error || "Falha na operação administrativa.")
    }
    return data
  }

  function attachRowActions() {
    document.querySelectorAll(".admin-fill-btn").forEach((button) => {
      button.addEventListener("click", () => {
        document.getElementById("admin-email").value = button.dataset.email
        document.getElementById("admin-status-email").value = button.dataset.email
      })
    })

    document.querySelectorAll(".admin-status-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        const email = button.dataset.email
        const status = button.dataset.status
        const accepted = window.confirm(
          `Deseja alterar a assinatura de ${email} para ${status}?`
        )
        if (!accepted) return

        try {
          await adminFetch("/api/admin/subscription/set-status", {
            method: "POST",
            body: JSON.stringify({ email, status }),
          })
          showMessage(`Assinatura de ${email} atualizada para ${status}.`, "ok")
          addAuditEntry(`Status alterado para ${status}: ${email}`)
          await loadUsers()
          await loadStats()
        } catch (error) {
          showMessage(error.message, "error")
        }
      })
    })
  }

  async function loadUsers() {
    const query = new URLSearchParams({
      q: filterQ.value.trim(),
      status: filterStatus.value,
    })
    const data = await adminFetch(`/api/admin/subscription/pending?${query.toString()}`)
    pendingList.innerHTML = ""

    if (!data.users.length) {
      const empty = document.createElement("li")
      empty.classList.add("history-empty")
      empty.textContent = "Nenhum usuário encontrado para este filtro."
      pendingList.appendChild(empty)
      return
    }

    data.users.forEach((user) => {
      const li = document.createElement("li")
      const actionButtons = [
        `<button type="button" class="admin-fill-btn" data-email="${user.email}">Selecionar</button>`,
      ]
      if (user.subscriptionStatus !== "EXPIRED") {
        actionButtons.push(
          `<button type="button" class="admin-status-btn admin-expire-btn" data-email="${user.email}" data-status="EXPIRED">Expirar</button>`
        )
      }
      if (user.subscriptionStatus !== "CANCELED") {
        actionButtons.push(
          `<button type="button" class="admin-status-btn admin-cancel-btn" data-email="${user.email}" data-status="CANCELED">Cancelar</button>`
        )
      }
      li.innerHTML = `
        <div>
          <strong>${user.name} (${user.email})</strong>
          <p>Status: ${user.subscriptionStatus} | Ate: ${formatDateBR(user.paidUntil)}</p>
        </div>
        <div class="admin-row-actions">${actionButtons.join("")}</div>
      `
      pendingList.appendChild(li)
    })

    attachRowActions()
  }

  async function loadStats() {
    const data = await adminFetch("/api/admin/subscription/pending?status=ALL&q=")
    const totals = {
      ALL: data.users.length,
      ACTIVE: 0,
      PENDING: 0,
      EXPIRED: 0,
      CANCELED: 0,
    }
    data.users.forEach((user) => {
      if (totals[user.subscriptionStatus] !== undefined) {
        totals[user.subscriptionStatus] += 1
      }
    })
    statTotalUsers.textContent = totals.ALL
    statActiveUsers.textContent = totals.ACTIVE
    statPendingUsers.textContent = totals.PENDING
    statExpiredUsers.textContent = totals.EXPIRED
    statCanceledUsers.textContent = totals.CANCELED
  }

  confirmForm.addEventListener("submit", async (event) => {
    event.preventDefault()
    try {
      const email = document.getElementById("admin-email").value
      const pixPaymentReference = document.getElementById("admin-pix-reference").value
      const paidUntil = document.getElementById("admin-paid-until").value
      await adminFetch("/api/admin/subscription/confirm", {
        method: "POST",
        body: JSON.stringify({ email, pixPaymentReference, paidUntil }),
      })
      showMessage("Assinatura confirmada com sucesso.", "ok")
      addAuditEntry(`Assinatura confirmada para ${email}`)
      confirmForm.reset()
      setDefaultDate()
      await loadUsers()
      await loadStats()
    } catch (error) {
      showMessage(error.message, "error")
    }
  })

  statusForm.addEventListener("submit", async (event) => {
    event.preventDefault()
    try {
      const email = document.getElementById("admin-status-email").value
      const status = document.getElementById("admin-status-value").value
      await adminFetch("/api/admin/subscription/set-status", {
        method: "POST",
        body: JSON.stringify({ email, status }),
      })
      showMessage("Status atualizado com sucesso.", "ok")
      addAuditEntry(`Status alterado para ${status}: ${email}`)
      await loadUsers()
      await loadStats()
    } catch (error) {
      showMessage(error.message, "error")
    }
  })

  refreshBtn.addEventListener("click", async () => {
    try {
      await loadUsers()
      await loadStats()
      showMessage("Lista atualizada.", "ok")
    } catch (error) {
      showMessage(error.message, "error")
    }
  })

  filterQ.addEventListener("input", () => {
    loadUsers().catch(() => {})
  })

  filterStatus.addEventListener("change", () => {
    loadUsers().catch(() => {})
  })

  logoutBtn.addEventListener("click", async () => {
    try {
      await adminFetch("/api/admin/auth/logout", { method: "POST" })
    } catch (_error) {
      // Mesmo em erro de rede, seguimos para a tela inicial.
    }
    window.location.assign("/")
  })

  railItems.forEach((item) => {
    item.addEventListener("click", () => {
      const targetId = item.dataset.target
      if (!targetId) return
      navigateToSection(targetId)
    })
  })

  function setDefaultDate() {
    const oneYearAhead = new Date()
    oneYearAhead.setFullYear(oneYearAhead.getFullYear() + 1)
    document.getElementById("admin-paid-until").value = oneYearAhead
      .toISOString()
      .slice(0, 10)
  }

  setDefaultDate()
  addAuditEntry("Sessão administrativa iniciada")
  loadUsers().catch((error) => {
    showMessage(error.message, "error")
    setTimeout(() => {
      window.location.assign("/")
    }, 1200)
  })
  loadStats().catch(() => {})
})
