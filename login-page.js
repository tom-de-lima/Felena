document.addEventListener("DOMContentLoaded", async () => {
  const {
    apiFetch,
    setToken,
    getMe,
    showBanner,
    clearBanner,
    consumeFlash,
    updateUserBadge,
    setupSidebarNavigation,
    setupLogout,
    formatDateBR,
  } = window.AppCommon

  let authenticatedUser = null
  let subscription = null

  const loginForm = document.getElementById("login-form")
  const registerForm = document.getElementById("register-form")
  const resetRequestForm = document.getElementById("reset-request-form")
  const resetConfirmForm = document.getElementById("reset-confirm-form")
  const adminAccessForm = document.getElementById("admin-access-form")
  const authCard = document.getElementById("auth-card")

  function isLoggedIn() {
    return Boolean(authenticatedUser)
  }

  function updateLoggedStateUI() {
    if (!subscription) return
    const loggedBox = document.getElementById("already-logged-box")
    if (!loggedBox) return
    if (!isLoggedIn()) {
      loggedBox.classList.add("hidden")
      authCard.classList.remove("hidden")
      return
    }

    loggedBox.classList.remove("hidden")
    authCard.classList.add("hidden")

    const status = document.getElementById("already-status")
    const expiry = document.getElementById("already-expiry")
    if (subscription.status === "ACTIVE") {
      status.textContent = "Ativa"
      expiry.textContent = formatDateBR(subscription.paidUntil)
    } else {
      status.textContent = "Pendente"
      expiry.textContent = "-"
    }
  }

  const me = await getMe()
  if (me) {
    authenticatedUser = me.user
    subscription = me.subscription
    updateUserBadge(authenticatedUser)
  } else {
    updateUserBadge(null)
  }

  consumeFlash()
  setupSidebarNavigation("/app/login", isLoggedIn)
  setupLogout()
  updateLoggedStateUI()

  const resetTokenFromQuery = new URLSearchParams(window.location.search).get("resetToken")
  if (resetTokenFromQuery) {
    const resetInput = document.getElementById("reset-token")
    if (resetInput) resetInput.value = resetTokenFromQuery
  }

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault()
    clearBanner()
    try {
      const email = document.getElementById("login-email").value
      const password = document.getElementById("login-password").value
      const data = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      })
      setToken(data.token)
      authenticatedUser = data.user
      subscription = data.subscription
      updateUserBadge(authenticatedUser)
      showBanner("Login realizado com sucesso.", "ok")
      updateLoggedStateUI()
      loginForm.reset()
    } catch (error) {
      showBanner(error.message, "error")
    }
  })

  registerForm?.addEventListener("submit", async (event) => {
    event.preventDefault()
    clearBanner()
    try {
      const fullName = document.getElementById("register-full-name").value
      const matricula = document.getElementById("register-matricula").value
      const email = document.getElementById("register-email").value
      const password = document.getElementById("register-password").value
      const data = await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ fullName, matricula, email, password }),
      })
      setToken(data.token)
      authenticatedUser = data.user
      subscription = data.subscription
      updateUserBadge(authenticatedUser)
      showBanner("Conta criada. Aguardando confirmação de pagamento.", "ok")
      updateLoggedStateUI()
      registerForm.reset()
    } catch (error) {
      showBanner(error.message, "error")
    }
  })

  resetRequestForm?.addEventListener("submit", async (event) => {
    event.preventDefault()
    clearBanner()
    try {
      const email = document.getElementById("reset-email").value
      const response = await apiFetch("/api/auth/request-password-reset", {
        method: "POST",
        body: JSON.stringify({ email }),
      })
      let message = "Se o email existir, enviamos instruções de recuperação."
      if (response.debugResetUrl) message += ` Link de teste: ${response.debugResetUrl}`
      showBanner(message, "ok")
      resetRequestForm.reset()
    } catch (error) {
      showBanner(error.message, "error")
    }
  })

  resetConfirmForm?.addEventListener("submit", async (event) => {
    event.preventDefault()
    clearBanner()
    try {
      const token = document.getElementById("reset-token").value
      const newPassword = document.getElementById("reset-new-password").value
      await apiFetch("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword }),
      })
      showBanner("Senha redefinida com sucesso.", "ok")
      resetConfirmForm.reset()
    } catch (error) {
      showBanner(error.message, "error")
    }
  })

  adminAccessForm?.addEventListener("submit", async (event) => {
    event.preventDefault()
    clearBanner()
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
      showBanner(error.message, "error")
    }
  })
})
