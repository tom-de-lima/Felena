;(function bootstrapAppCommon() {
  const tokenKey = "gc_auth_token"
  const flashKey = "gc_flash_message"
  const appTimeZone = "America/Fortaleza"
  const mobileMenuOpenClass = "mobile-nav-open"

  function getToken() {
    return localStorage.getItem(tokenKey) || ""
  }

  function setToken(token) {
    if (!token) {
      localStorage.removeItem(tokenKey)
      return
    }
    localStorage.setItem(tokenKey, token)
  }

  function showBanner(message, type = "ok") {
    const banner = document.getElementById("message-banner")
    if (!banner) return
    banner.textContent = message
    banner.classList.remove("hidden", "ok", "error")
    banner.classList.add(type)
  }

  function clearBanner() {
    const banner = document.getElementById("message-banner")
    if (!banner) return
    banner.classList.add("hidden")
  }

  function setFlash(message, type = "ok") {
    sessionStorage.setItem(flashKey, JSON.stringify({ message, type }))
  }

  function consumeFlash() {
    const raw = sessionStorage.getItem(flashKey)
    if (!raw) return
    sessionStorage.removeItem(flashKey)
    try {
      const parsed = JSON.parse(raw)
      if (parsed?.message) {
        showBanner(parsed.message, parsed.type || "ok")
      }
    } catch (_error) {
      // noop
    }
  }

  async function apiFetch(url, options = {}) {
    const token = getToken()
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    }
    if (token) headers.Authorization = `Bearer ${token}`

    const response = await fetch(url, {
      ...options,
      headers,
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(data.error || "Falha na requisição.")
      error.status = response.status
      error.payload = data
      throw error
    }
    return data
  }

  async function getMe() {
    const token = getToken()
    if (!token) return null
    try {
      return await apiFetch("/api/auth/me")
    } catch (_error) {
      setToken("")
      return null
    }
  }

  function updateUserBadge(user) {
    const userBadge = document.getElementById("user-badge")
    const userName = document.getElementById("user-name")
    if (!userBadge || !userName) return
    if (!user) {
      userBadge.classList.add("hidden")
      userName.textContent = ""
      return
    }
    userBadge.classList.remove("hidden")
    userName.textContent = user.name
  }

  function setupSidebarNavigation(currentRoute, isLoggedIn) {
    setupMobileMenuShell()

    const routeToTarget = {
      "/app/login": "login",
      "/app/entradas": "entradas",
      "/app/historico": "historico",
      "/app/conta": "conta",
      "/app/informacoes-calculo": "info-calculo",
      "/app/comprometimento-reserva": "comprometimento-reserva",
      "/app/ajuda": "ajuda",
    }

    const targetKey = routeToTarget[currentRoute] || "login"
    const items = Array.from(document.querySelectorAll(".side-rail .rail-item[data-route]"))
    items.forEach((item) => {
      const isCurrent = item.dataset.nav === targetKey
      item.classList.toggle("active", isCurrent)
      item.setAttribute("aria-current", isCurrent ? "page" : "false")

      item.addEventListener("click", () => {
        closeMobileMenu()

        const destination = item.dataset.route
        if (!destination) return

        if (destination === "/app/login" && isLoggedIn()) {
          showBanner("Você já está logado.", "ok")
          return
        }

        if (destination !== "/app/login" && !isLoggedIn()) {
          setFlash("Faça login para acessar essa área.", "error")
          window.location.assign("/app/login")
          return
        }

        window.location.assign(destination)
      })
    })
  }

  function setupMobileMenuShell() {
    const sideRail = document.querySelector(".side-rail")
    const topbar = document.querySelector(".app-topbar")
    const appLayout = document.querySelector(".app-layout")
    if (!sideRail || !topbar || !appLayout) return

    if (!topbar.querySelector(".menu-toggle-btn")) {
      const menuButton = document.createElement("button")
      menuButton.type = "button"
      menuButton.className = "menu-toggle-btn"
      menuButton.setAttribute("aria-label", "Abrir menu de navegação")
      menuButton.textContent = "Menu"
      menuButton.addEventListener("click", toggleMobileMenu)
      topbar.prepend(menuButton)
    }

    if (!document.querySelector(".app-overlay")) {
      const overlay = document.createElement("button")
      overlay.type = "button"
      overlay.className = "app-overlay"
      overlay.setAttribute("aria-label", "Fechar menu")
      overlay.addEventListener("click", closeMobileMenu)
      appLayout.appendChild(overlay)
    }

    if (!window.__gcMobileMenuEventsBound) {
      window.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeMobileMenu()
      })
      window.addEventListener("resize", () => {
        if (window.innerWidth > 980) closeMobileMenu()
      })
      window.__gcMobileMenuEventsBound = true
    }
  }

  function toggleMobileMenu() {
    document.body.classList.toggle(mobileMenuOpenClass)
  }

  function closeMobileMenu() {
    document.body.classList.remove(mobileMenuOpenClass)
  }

  function setupLogout() {
    const logoutBtn = document.getElementById("logout-btn")
    if (!logoutBtn) return
    logoutBtn.addEventListener("click", () => {
      setToken("")
      updateUserBadge(null)
      setFlash("Sessão encerrada.", "ok")
      window.location.assign("/app/login")
    })
  }

  function parseServerDate(value) {
    if (!value) return null
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value

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

  window.AppCommon = {
    getToken,
    setToken,
    apiFetch,
    getMe,
    showBanner,
    clearBanner,
    consumeFlash,
    setFlash,
    updateUserBadge,
    setupSidebarNavigation,
    setupLogout,
    formatDateBR,
    formatDateTimeBR,
    closeMobileMenu,
  }
})()
