document.addEventListener("DOMContentLoaded", async () => {
  const {
    getMe,
    showBanner,
    consumeFlash,
    updateUserBadge,
    setupSidebarNavigation,
    setupLogout,
    setFlash,
    formatDateBR,
  } = window.AppCommon

  const statusText = document.getElementById("subscription-status-text")
  const expiryText = document.getElementById("subscription-expiration-text")
  const paymentText = document.getElementById("subscription-payment-text")
  const pixText = document.getElementById("subscription-pix-text")
  const fullNameText = document.getElementById("account-full-name")
  const matriculaText = document.getElementById("account-matricula")
  const emailText = document.getElementById("account-email")
  const createdAtText = document.getElementById("account-created-at")

  function isLoggedIn() {
    return true
  }

  const me = await getMe()
  if (!me) {
    setFlash("Faça login para visualizar o status da conta.", "error")
    window.location.assign("/app/login")
    return
  }

  updateUserBadge(me.user)
  setupSidebarNavigation("/app/conta", isLoggedIn)
  setupLogout()
  consumeFlash()

  fullNameText.textContent = me.user.fullName || me.user.name || "-"
  matriculaText.textContent = me.user.matricula || "-"
  emailText.textContent = me.user.email || "-"
  createdAtText.textContent = formatDateBR(me.user.createdAt)

  if (me.subscriptionActive) {
    statusText.textContent = "Ativa"
    expiryText.textContent = formatDateBR(me.subscription.paidUntil)
    paymentText.textContent = "Confirmado"
    pixText.textContent = me.subscription.pixPaymentReference
      ? `Referência Pix: ${me.subscription.pixPaymentReference}`
      : "Pagamento anual confirmado."
    showBanner("Conta validada e ativa.", "ok")
  } else {
    statusText.textContent = "Pendente"
    expiryText.textContent = "-"
    paymentText.textContent = "Aguardando confirmação"
    pixText.textContent = `Pix do desenvolvedor: ${me.subscription.pixKey}`
    showBanner("Conta aguardando confirmação de pagamento.", "error")
  }
})
