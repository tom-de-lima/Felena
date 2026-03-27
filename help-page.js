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

  const overviewText = document.getElementById("help-overview-text")
  const impactText = document.getElementById("help-impact-text")
  const lastExample = document.getElementById("help-last-example")
  const faqList = document.getElementById("help-faq-list")

  const currencyFormatter = new Intl.NumberFormat("pt-BR", {
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

  function addFaq(question, answer) {
    const details = document.createElement("details")
    details.className = "faq-item"
    details.innerHTML = `
      <summary>${question}</summary>
      <div class="faq-answer">${answer}</div>
    `
    faqList.appendChild(details)
  }

  const me = await getMe()
  if (!me) {
    setFlash("Faça login para acessar a ajuda do sistema.", "error")
    window.location.assign("/app/login")
    return
  }

  updateUserBadge(me.user)
  setupSidebarNavigation("/app/ajuda", isLoggedIn)
  setupLogout()
  consumeFlash()

  try {
    const data = await apiFetch("/api/help/guide")
    overviewText.textContent = data?.app?.objetivo || "Guia indisponível no momento."
    impactText.textContent = data?.app?.impactoDosDados || ""

    const exemplo = data?.exemploUltimoCalculo
    if (exemplo) {
      lastExample.textContent =
        `Último exemplo real do seu histórico (${formatMonthKey(exemplo.monthKey)} em ${formatDateTimeBR(
          exemplo.createdAt
        )}): bruto ${currencyFormatter.format(Number(exemplo.totalBruto || 0))}, líquido ${currencyFormatter.format(
          Number(exemplo.totalLiquido || 0)
        )}, base de IR ${currencyFormatter.format(Number(exemplo.baseCalculoIR || 0))}.`
    } else {
      lastExample.textContent =
        "Ainda não há cálculo salvo no histórico para mostrar exemplo personalizado. Faça um cálculo em Entradas Financeiras."
    }

    faqList.innerHTML = ""

    addFaq(
      "O que este sistema faz?",
      `${data.app.objetivo}<br><br>${data.app.impactoDosDados}`
    )

    addFaq(
      "Como devo preencher os campos de entrada?",
      data.camposEntrada
        .map(
          (item) =>
            `<strong>${item.campo}</strong><br>` +
            `O que é: ${item.significado}<br>` +
            `Como preencher: ${item.preenchimento}<br>` +
            `Impacto no cálculo: ${item.impacto}`
        )
        .join("<hr>")
    )

    addFaq(
      "Como o Imposto de Renda é calculado no app?",
      `Faixa de isenção até ${currencyFormatter.format(data.regras.impostoRenda.isencaoAte)}.<br>` +
        `Faixa intermediária até ${currencyFormatter.format(
          data.regras.impostoRenda.faixaIntermediariaAte
        )}, com aplicação da fórmula:<br>` +
        `<code>${data.regras.impostoRenda.formulaDescontoIntermediaria}</code><br><br>` +
        `${data.regras.impostoRenda.observacaoFaixaAlta}`
    )

    addFaq(
      "O que é total bruto, total líquido e descontos?",
      data.resultados
        .filter((item) =>
          ["Total Bruto", "Total Líquido", "Descontos", "Base de Cálculo de IR"].includes(item.nome)
        )
        .map((item) => `<strong>${item.nome}</strong><br>${item.explicacao}`)
        .join("<hr>")
    )

    addFaq(
      "O que significa comprometimento de renda?",
      `Mostra o peso de cada desconto na sua renda mensal.<br>` +
        `Regra de acumulado anual: <code>${data.regras.comprometimento.acumuladoAnual}</code>.<br>` +
        `Regra de percentual: <code>${data.regras.comprometimento.percentualRendaMensal}</code>.`
    )

    addFaq(
      "Como funciona a sugestão de reserva financeira?",
      `A sugestão atual usa ${data.regras.reserva.percentualSugestao}% da renda líquida média mensal.<br>` +
        `Simulação: ${data.regras.reserva.rendimentoMensalPercentual}% ao mês por ${data.regras.reserva.periodoMeses} meses (juros compostos).`
    )

    addFaq(
      "Quais gratificações por função entram no cálculo?",
      data.regras.gratificacoesFuncao
        .map((item) => `${item.nome}: ${item.percentual}% sobre a base inicial.`)
        .join("<br>")
    )
  } catch (error) {
    showBanner(error.message, "error")
    overviewText.textContent = "Não foi possível carregar o manual neste momento."
    impactText.textContent = ""
    lastExample.textContent = ""
    faqList.innerHTML = ""
  }
})
