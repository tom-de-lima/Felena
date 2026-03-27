const path = require("path")
const crypto = require("crypto")
const express = require("express")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const nodemailer = require("nodemailer")
const { run, get, all, initDb } = require("./db")
const { calculateCompensation, FUNCTION_BONUS_OPTIONS } = require("./calculator")

const app = express()
const port = process.env.PORT || 3000
const jwtSecret = process.env.JWT_SECRET || "granacheck-dev-secret"
const appTz = process.env.APP_TIMEZONE || "America/Fortaleza"
const pixKey = process.env.PIX_KEY || "chave-pix-do-desenvolvedor"
const adminSecret = process.env.ADMIN_SECRET || ""
const adminJwtSecret = process.env.ADMIN_JWT_SECRET || `${jwtSecret}-admin`
const masterAdminName = process.env.MASTER_ADMIN_NAME || "Administrador Master"
const masterAdminEmail = String(
  process.env.MASTER_ADMIN_EMAIL || "master@granacheck.local"
).toLowerCase()
const masterAdminPassword = process.env.MASTER_ADMIN_PASSWORD || "Master@123456"

app.use(express.json())
app.use(express.static(__dirname))

function buildToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
    },
    jwtSecret,
    { expiresIn: "7d" }
  )
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || ""
  const [, token] = authHeader.split(" ")
  if (!token) {
    res.status(401).json({ error: "Token ausente." })
    return
  }

  try {
    const payload = jwt.verify(token, jwtSecret)
    req.user = payload
    next()
  } catch (_error) {
    res.status(401).json({ error: "Token inválido ou expirado." })
  }
}

function getDateInTimeZone(date = new Date(), timeZone = appTz) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  return formatter.format(date)
}

function getMonthKeyInTimeZone(date = new Date(), timeZone = appTz) {
  return getDateInTimeZone(date, timeZone).slice(0, 7)
}

function toNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function roundMoney(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100
}

function mapSubscription(user) {
  return {
    status: user.subscription_status || "PENDING",
    paidUntil: user.paid_until || null,
    pixPaymentReference: user.pix_payment_reference || null,
    pixKey,
  }
}

function isSubscriptionActive(subscription) {
  if (subscription.status !== "ACTIVE") return false
  if (!subscription.paidUntil) return false
  const today = getDateInTimeZone()
  return subscription.paidUntil >= today
}

async function requireActiveSubscription(req, res, next) {
  const user = await get(
    "SELECT id, subscription_status, paid_until, pix_payment_reference FROM users WHERE id = ?",
    [req.user.sub]
  )
  if (!user) {
    res.status(404).json({ error: "Usuário não encontrado." })
    return
  }

  const subscription = mapSubscription(user)
  if (!isSubscriptionActive(subscription)) {
    res.status(403).json({
      error:
        "Assinatura inativa. Acesso liberado somente para contas com pagamento anual confirmado.",
      subscription,
    })
    return
  }

  req.subscription = subscription
  next()
}

function adminMiddleware(req, res, next) {
  const adminContext = getAdminContextFromRequest(req)
  if (!adminContext) {
    res.status(403).json({ error: "Acesso administrativo negado." })
    return
  }
  req.admin = adminContext
  next()
}

function getAdminContextFromRequest(req) {
  const incoming = req.headers["x-admin-secret"]
  if (adminSecret && incoming === adminSecret) {
    return { via: "secret" }
  }

  const authHeader = req.headers.authorization || ""
  const [, bearerToken] = authHeader.split(" ")
  const cookieToken = getCookie(req.headers.cookie || "", "gc_admin_session")
  const token = bearerToken || cookieToken

  if (!token) {
    return null
  }

  try {
    const payload = jwt.verify(token, adminJwtSecret)
    if (payload.role !== "admin") {
      return null
    }
    return payload
  } catch (_error) {
    return null
  }
}

function getCookie(cookieHeader, name) {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split("="))
    .find(([key]) => key === name)?.[1]
}

function buildAdminToken(admin) {
  return jwt.sign(
    {
      role: "admin",
      sub: admin.id,
      email: admin.email,
      adminRole: admin.role,
      iatSource: "admin-login",
    },
    adminJwtSecret,
    { expiresIn: "2h" }
  )
}

function setAdminSessionCookie(res, token) {
  const secure = String(process.env.COOKIE_SECURE || "false") === "true"
  const securePart = secure ? "; Secure" : ""
  res.setHeader(
    "Set-Cookie",
    `gc_admin_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7200${securePart}`
  )
}

function clearAdminSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    "gc_admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
  )
}

function createResetTransporter() {
  if (!process.env.SMTP_HOST) return null
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        }
      : undefined,
  })
}

const mailer = createResetTransporter()

async function sendResetEmail({ to, name, token }) {
  const resetUrl = `${process.env.APP_BASE_URL || "http://localhost:3000"}/?resetToken=${token}`
  if (!mailer) {
    console.log(`Reset link (${to}): ${resetUrl}`)
    return { delivered: false, resetUrl }
  }

  await mailer.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: "Recuperação de senha - GranaCheck",
    text: [
      `Olá, ${name}.`,
      "Recebemos um pedido para redefinir sua senha.",
      `Use este link para redefinir: ${resetUrl}`,
      "Se você não solicitou, ignore este e-mail.",
    ].join("\n"),
  })
  return { delivered: true }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true })
})

app.post("/api/auth/register", async (req, res) => {
  try {
    const fullName = String(req.body.fullName || req.body.name || "").trim()
    const matricula = String(req.body.matricula || "").trim()
    const email = String(req.body.email || "").trim().toLowerCase()
    const password = String(req.body.password || "")

    if (!fullName || !matricula || !email || !password) {
      res.status(400).json({
        error: "Nome completo, matrícula, e-mail e senha são obrigatórios.",
      })
      return
    }
    if (password.length < 6) {
      res.status(400).json({ error: "A senha precisa ter no mínimo 6 caracteres." })
      return
    }

    const existing = await get("SELECT id FROM users WHERE email = ?", [email])
    if (existing) {
      res.status(409).json({ error: "Já existe um usuário com este e-mail." })
      return
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const result = await run(
      `
      INSERT INTO users (name, full_name, matricula, email, password_hash, subscription_status)
      VALUES (?, ?, ?, ?, ?, 'PENDING')
      `,
      [fullName, fullName, matricula, email, passwordHash]
    )

    const user = {
      id: result.lastID,
      name: fullName,
      full_name: fullName,
      matricula,
      email,
      subscription_status: "PENDING",
      paid_until: null,
      pix_payment_reference: null,
    }
    const token = buildToken(user)
    res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        fullName: user.full_name,
        matricula: user.matricula,
        email: user.email,
      },
      subscription: mapSubscription(user),
      subscriptionActive: false,
    })
  } catch (error) {
    if (String(error?.message || "").includes("idx_users_matricula")) {
      res.status(409).json({ error: "Já existe usuário cadastrado com esta matrícula." })
      return
    }
    res.status(500).json({ error: "Falha ao criar usuário." })
  }
})

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase()
    const password = String(req.body.password || "")

    if (!email || !password) {
      res.status(400).json({ error: "Informe e-mail e senha." })
      return
    }

    const user = await get(
      `
      SELECT id, name, full_name, matricula, email, password_hash, subscription_status, paid_until, pix_payment_reference
      FROM users
      WHERE email = ?
      `,
      [email]
    )

    if (!user) {
      res.status(401).json({ error: "Credenciais inválidas." })
      return
    }

    const matches = await bcrypt.compare(password, user.password_hash)
    if (!matches) {
      res.status(401).json({ error: "Credenciais inválidas." })
      return
    }

    const token = buildToken(user)
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        fullName: user.full_name || user.name,
        matricula: user.matricula || null,
        email: user.email,
      },
      subscription: mapSubscription(user),
      subscriptionActive: isSubscriptionActive(mapSubscription(user)),
    })
  } catch (_error) {
    res.status(500).json({ error: "Falha ao fazer login." })
  }
})

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  try {
    const user = await get(
      `
      SELECT id, name, full_name, matricula, email, subscription_status, paid_until, pix_payment_reference, created_at
      FROM users
      WHERE id = ?
      `,
      [req.user.sub]
    )
    if (!user) {
      res.status(404).json({ error: "Usuário não encontrado." })
      return
    }

    res.json({
      user: {
        id: user.id,
        name: user.name,
        fullName: user.full_name || user.name,
        matricula: user.matricula || null,
        email: user.email,
        createdAt: user.created_at,
      },
      subscription: mapSubscription(user),
      subscriptionActive: isSubscriptionActive(mapSubscription(user)),
    })
  } catch (_error) {
    res.status(500).json({ error: "Falha ao obter usuário." })
  }
})

app.get("/api/subscription/status", authMiddleware, async (req, res) => {
  try {
    const user = await get(
      "SELECT subscription_status, paid_until, pix_payment_reference FROM users WHERE id = ?",
      [req.user.sub]
    )
    if (!user) {
      res.status(404).json({ error: "Usuário não encontrado." })
      return
    }
    const subscription = mapSubscription(user)
    res.json({
      subscription,
      subscriptionActive: isSubscriptionActive(subscription),
    })
  } catch (_error) {
    res.status(500).json({ error: "Falha ao carregar assinatura." })
  }
})

app.post("/api/admin/auth/login", async (req, res) => {
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase()
  const password = String(req.body.password || "")
  if (!email || !password) {
    res.status(400).json({ error: "Informe e-mail e senha de administrador." })
    return
  }

  const admin = await get(
    `
    SELECT id, name, email, password_hash, role, is_active
    FROM admin_users
    WHERE email = ?
    `,
    [email]
  )
  if (!admin || !admin.is_active) {
    res.status(403).json({ error: "Credenciais administrativas inválidas." })
    return
  }

  const matches = await bcrypt.compare(password, admin.password_hash)
  if (!matches) {
    res.status(403).json({ error: "Credenciais administrativas inválidas." })
    return
  }

  await run("UPDATE admin_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?", [admin.id])

  const token = buildAdminToken({
    id: admin.id,
    email: admin.email,
    role: admin.role,
  })
  setAdminSessionCookie(res, token)
  res.json({
    ok: true,
    token,
    admin: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
    },
  })
})

app.post("/api/admin/auth/logout", adminMiddleware, async (_req, res) => {
  clearAdminSessionCookie(res)
  res.json({ ok: true })
})

app.get("/api/admin/access", adminMiddleware, async (_req, res) => {
  res.json({
    ok: true,
    redirectUrl: "/admin",
  })
})

app.post("/api/admin/subscription/confirm", adminMiddleware, async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase()
    const pixPaymentReference = String(req.body.pixPaymentReference || "").trim()
    if (!email) {
      res.status(400).json({ error: "E-mail obrigatório." })
      return
    }

    const user = await get("SELECT id FROM users WHERE email = ?", [email])
    if (!user) {
      res.status(404).json({ error: "Usuário não encontrado." })
      return
    }

    const paidUntil =
      String(req.body.paidUntil || "").trim() ||
      getDateInTimeZone(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000))

    await run(
      `
      UPDATE users
      SET subscription_status = 'ACTIVE',
          paid_until = ?,
          pix_payment_reference = ?
      WHERE id = ?
      `,
      [paidUntil, pixPaymentReference || null, user.id]
    )

    res.json({
      ok: true,
      message: "Assinatura confirmada.",
      paidUntil,
    })
  } catch (_error) {
    res.status(500).json({ error: "Falha ao confirmar assinatura." })
  }
})

app.get("/api/admin/subscription/pending", adminMiddleware, async (req, res) => {
  try {
    const statusFilter = String(req.query.status || "ALL")
      .trim()
      .toUpperCase()
    const queryFilter = String(req.query.q || "")
      .trim()
      .toLowerCase()

    const allowedStatuses = ["ALL", "PENDING", "ACTIVE", "EXPIRED", "CANCELED"]
    const status = allowedStatuses.includes(statusFilter) ? statusFilter : "ALL"

    const rows = await all(
      `
      SELECT id, name, email, subscription_status, paid_until, pix_payment_reference, created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 200
      `
    )

    const today = getDateInTimeZone()

    const normalizedRows = rows.map((user) => {
      const computedStatus =
        user.subscription_status === "ACTIVE" && user.paid_until && user.paid_until >= today
          ? "ACTIVE"
          : user.subscription_status === "CANCELED"
            ? "CANCELED"
            : user.subscription_status === "EXPIRED"
              ? "EXPIRED"
              : "PENDING"
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        subscriptionStatus: computedStatus,
        paidUntil: user.paid_until,
        pixPaymentReference: user.pix_payment_reference,
        createdAt: user.created_at,
      }
    })

    const filteredByStatus =
      status === "ALL"
        ? normalizedRows
        : normalizedRows.filter((user) => user.subscriptionStatus === status)

    const filteredRows = !queryFilter
      ? filteredByStatus
      : filteredByStatus.filter((user) => {
          const haystack = `${user.name} ${user.email}`.toLowerCase()
          return haystack.includes(queryFilter)
        })

    res.json({
      users: filteredRows,
    })
  } catch (_error) {
    res.status(500).json({ error: "Falha ao listar pendências de assinatura." })
  }
})

app.post("/api/admin/subscription/set-status", adminMiddleware, async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase()
    const status = String(req.body.status || "")
      .trim()
      .toUpperCase()
    const allowedStatuses = ["PENDING", "EXPIRED", "CANCELED"]
    if (!email || !allowedStatuses.includes(status)) {
      res.status(400).json({ error: "E-mail e status válidos são obrigatórios." })
      return
    }

    const user = await get("SELECT id FROM users WHERE email = ?", [email])
    if (!user) {
      res.status(404).json({ error: "Usuário não encontrado." })
      return
    }

    const paidUntil = status === "PENDING" ? null : getDateInTimeZone(new Date(Date.now() - 24 * 60 * 60 * 1000))
    await run(
      `
      UPDATE users
      SET subscription_status = ?,
          paid_until = ?,
          pix_payment_reference = CASE WHEN ? = 'PENDING' THEN NULL ELSE pix_payment_reference END
      WHERE id = ?
      `,
      [status, paidUntil, status, user.id]
    )

    res.json({ ok: true, status })
  } catch (_error) {
    res.status(500).json({ error: "Falha ao atualizar status da assinatura." })
  }
})

app.post("/api/auth/request-password-reset", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase()
    if (!email) {
      res.status(400).json({ error: "Informe o e-mail." })
      return
    }

    const user = await get("SELECT id, name, email FROM users WHERE email = ?", [email])
    if (!user) {
      res.json({
        ok: true,
        message:
          "Se existir uma conta com esse e-mail, enviaremos as instruções para recuperação.",
      })
      return
    }

    const rawToken = crypto.randomBytes(32).toString("hex")
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex")
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()

    await run("DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL", [
      user.id,
    ])
    await run(
      `
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES (?, ?, ?)
      `,
      [user.id, tokenHash, expiresAt]
    )

    const delivery = await sendResetEmail({
      to: user.email,
      name: user.name,
      token: rawToken,
    })

    res.json({
      ok: true,
      message:
        "Se existir uma conta com esse e-mail, enviaremos as instruções para recuperação.",
      debugResetUrl: delivery.delivered ? undefined : delivery.resetUrl,
    })
  } catch (_error) {
    res.status(500).json({ error: "Falha ao solicitar recuperacao de senha." })
  }
})

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const token = String(req.body.token || "").trim()
    const newPassword = String(req.body.newPassword || "")
    if (!token || !newPassword) {
      res.status(400).json({ error: "Token e nova senha são obrigatórios." })
      return
    }
    if (newPassword.length < 6) {
      res.status(400).json({ error: "A nova senha precisa ter no mínimo 6 caracteres." })
      return
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex")
    const row = await get(
      `
      SELECT id, user_id, expires_at, used_at
      FROM password_reset_tokens
      WHERE token_hash = ?
      `,
      [tokenHash]
    )
    if (!row || row.used_at) {
      res.status(400).json({ error: "Token inválido." })
      return
    }
    if (new Date(row.expires_at) < new Date()) {
      res.status(400).json({ error: "Token expirado." })
      return
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await run("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, row.user_id])
    await run("UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?", [
      row.id,
    ])

    res.json({ ok: true, message: "Senha atualizada com sucesso." })
  } catch (_error) {
    res.status(500).json({ error: "Falha ao redefinir senha." })
  }
})

app.post("/api/calc", authMiddleware, requireActiveSubscription, async (req, res) => {
  try {
    const calculation = calculateCompensation(req.body)
    const monthKey = getMonthKeyInTimeZone()
    const overwrite =
      req.body.overwrite === true || req.body.overwrite === "1" || req.body.overwrite === 1

    const existing = await get(
      `
      SELECT id, output_json, total_bruto, total_liquido, created_at
      FROM salary_records
      WHERE user_id = ? AND month_key = ?
      `,
      [req.user.sub, monthKey]
    )

    if (existing && !overwrite) {
      const parsed = JSON.parse(existing.output_json)
      res.status(409).json({
        error:
          "Já existe remuneração salva para este mês. Confirme a sobrescrita para atualizar o registro mensal.",
        requiresOverwrite: true,
        monthKey,
        existing: {
          id: existing.id,
          createdAt: existing.created_at,
          totalLiquido: existing.total_liquido ?? parsed?.totals?.totalLiquido ?? null,
          totalBruto: existing.total_bruto ?? parsed?.totals?.totalBruto ?? null,
        },
      })
      return
    }

    let recordId
    const totalBruto = Number(calculation?.totals?.totalBruto || 0)
    const totalLiquido = Number(calculation?.totals?.totalLiquido || 0)
    if (existing && overwrite) {
      await run(
        `
        UPDATE salary_records
        SET total_bruto = ?, total_liquido = ?, input_json = ?, output_json = ?, created_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
        [
          totalBruto,
          totalLiquido,
          JSON.stringify(calculation.normalizedInput),
          JSON.stringify(calculation),
          existing.id,
        ]
      )
      recordId = existing.id
    } else {
      const saveResult = await run(
        `
        INSERT INTO salary_records (user_id, month_key, total_bruto, total_liquido, input_json, output_json)
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          req.user.sub,
          monthKey,
          totalBruto,
          totalLiquido,
          JSON.stringify(calculation.normalizedInput),
          JSON.stringify(calculation),
        ]
      )
      recordId = saveResult.lastID
    }

    res.status(201).json({
      id: recordId,
      monthKey,
      createdAt: new Date().toISOString(),
      validation: { ok: true },
      ...calculation,
    })
  } catch (error) {
    if (error?.details?.length) {
      res.status(422).json({
        error: "Cálculo reprovado na validação interna.",
        details: error.details,
      })
      return
    }
    res.status(500).json({ error: "Erro ao processar cálculo." })
  }
})

app.get("/api/calculations", authMiddleware, requireActiveSubscription, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 50)
    const rows = await all(
      `
      SELECT id, month_key, total_bruto, total_liquido, output_json, created_at
      FROM salary_records
      WHERE user_id = ?
      ORDER BY month_key DESC
      LIMIT ?
      `,
      [req.user.sub, limit]
    )

    const records = rows.map((row) => {
      const parsed = JSON.parse(row.output_json)
      return {
        id: row.id,
        monthKey: row.month_key,
        createdAt: row.created_at,
        totalLiquido: row.total_liquido ?? parsed?.totals?.totalLiquido ?? 0,
        totalBruto: row.total_bruto ?? parsed?.totals?.totalBruto ?? 0,
      }
    })

    res.json({ records })
  } catch (_error) {
    res.status(500).json({ error: "Erro ao carregar histórico." })
  }
})

app.get(
  "/api/calculations/useful-info/latest",
  authMiddleware,
  requireActiveSubscription,
  async (req, res) => {
    try {
      const row = await get(
        `
        SELECT id, month_key, total_bruto, total_liquido, output_json, created_at
        FROM salary_records
        WHERE user_id = ?
        ORDER BY month_key DESC, id DESC
        LIMIT 1
        `,
        [req.user.sub]
      )

      if (!row) {
        res.status(404).json({
          error: "Nenhum cálculo encontrado para exibir as informações úteis.",
        })
        return
      }

      const parsed = JSON.parse(row.output_json)
      res.json({
        record: {
          id: row.id,
          monthKey: row.month_key,
          createdAt: row.created_at,
          totalBruto: row.total_bruto ?? parsed?.totals?.totalBruto ?? 0,
          totalLiquido: row.total_liquido ?? parsed?.totals?.totalLiquido ?? 0,
        },
        informacoesCalculo: parsed?.informacoesCalculo || null,
      })
    } catch (_error) {
      res.status(500).json({ error: "Erro ao carregar informações úteis do cálculo." })
    }
  }
)

app.get(
  "/api/calculations/commitment-reserve",
  authMiddleware,
  requireActiveSubscription,
  async (req, res) => {
    try {
      const limit = 12
      const rows = await all(
        `
        SELECT id, month_key, total_bruto, total_liquido, output_json, created_at
        FROM salary_records
        WHERE user_id = ?
        ORDER BY month_key DESC, id DESC
        LIMIT ?
        `,
        [req.user.sub, limit]
      )

      if (!rows.length) {
        res.status(404).json({
          error: "Nenhum cálculo encontrado para gerar a análise financeira.",
        })
        return
      }

      const discountAccumulator = new Map()
      const latestDiscounts = new Map()
      let totalBrutoAcumulado = 0
      let totalLiquidoAcumulado = 0

      rows.forEach((row) => {
        const parsed = JSON.parse(row.output_json || "{}")
        const totalBruto = toNumber(row.total_bruto ?? parsed?.totals?.totalBruto)
        const totalLiquido = toNumber(row.total_liquido ?? parsed?.totals?.totalLiquido)
        totalBrutoAcumulado += totalBruto
        totalLiquidoAcumulado += totalLiquido

        const discounts = Array.isArray(parsed?.discountItems) ? parsed.discountItems : []
        discounts.forEach((item) => {
          const label = String(item?.label || "Desconto não identificado")
          const value = toNumber(item?.value)

          // Usa o primeiro registro (mais recente) como referência mensal atual.
          if (!latestDiscounts.has(label)) {
            latestDiscounts.set(label, value)
          }

          discountAccumulator.set(label, toNumber(discountAccumulator.get(label)) + value)
        })
      })

      const mesesConsiderados = rows.length
      const mediaMensalBruta = mesesConsiderados > 0 ? totalBrutoAcumulado / mesesConsiderados : 0
      const mediaMensalLiquida =
        mesesConsiderados > 0 ? totalLiquidoAcumulado / mesesConsiderados : 0

      const descontos = Array.from(discountAccumulator.entries())
        .map(([label, valorAcumuladoHistorico]) => {
          const valorMensalAtual = toNumber(latestDiscounts.get(label))
          const valorAcumuladoAnualProjetado = valorMensalAtual * 12
          const valorMensalMedio =
            mesesConsiderados > 0 ? valorAcumuladoHistorico / mesesConsiderados : 0
          const percentualDaRendaMensal =
            mediaMensalBruta > 0 ? (valorMensalMedio / mediaMensalBruta) * 100 : 0

          return {
            tipo: label,
            valorAcumuladoAnual: roundMoney(valorAcumuladoAnualProjetado),
            percentualDaRendaMensal: roundMoney(percentualDaRendaMensal),
          }
        })
        .sort((a, b) => b.valorAcumuladoAnual - a.valorAcumuladoAnual)

      const sugestaoReservaMensal = roundMoney(mediaMensalLiquida * 0.1)
      const taxaMensal = 0.01
      const mesesSimulacao = 12
      const fatorAcumulacao = (Math.pow(1 + taxaMensal, mesesSimulacao) - 1) / taxaMensal
      const totalAcumulado12Meses = roundMoney(sugestaoReservaMensal * fatorAcumulacao)

      const referencia = rows[0]
      res.json({
        referencia: {
          monthKey: referencia.month_key,
          createdAt: referencia.created_at,
          mesesConsiderados,
        },
        analiseDescontos: descontos,
        resumoRenda: {
          mediaMensalBruta: roundMoney(mediaMensalBruta),
          mediaMensalLiquida: roundMoney(mediaMensalLiquida),
        },
        reservaFinanceira: {
          percentualAplicado: 10,
          rendimentoMensalPercentual: 1,
          sugestaoMensal: sugestaoReservaMensal,
          totalAcumulado12Meses,
        },
      })
    } catch (_error) {
      res.status(500).json({ error: "Erro ao carregar comprometimento e reserva financeira." })
    }
  }
)

app.get("/api/help/guide", authMiddleware, requireActiveSubscription, async (req, res) => {
  try {
    const latest = await get(
      `
      SELECT month_key, output_json, created_at
      FROM salary_records
      WHERE user_id = ?
      ORDER BY month_key DESC, id DESC
      LIMIT 1
      `,
      [req.user.sub]
    )

    let latestSnapshot = null
    if (latest?.output_json) {
      const parsed = JSON.parse(latest.output_json)
      latestSnapshot = {
        monthKey: latest.month_key,
        createdAt: latest.created_at,
        totalBruto: roundMoney(parsed?.totals?.totalBruto),
        totalLiquido: roundMoney(parsed?.totals?.totalLiquido),
        baseCalculoIR: roundMoney(parsed?.totals?.baseCalculoIRNova ?? parsed?.totals?.baseCalculoIR),
        descontos: Array.isArray(parsed?.discountItems)
          ? parsed.discountItems.map((item) => ({
              tipo: item.label,
              valor: roundMoney(item.value),
            }))
          : [],
      }
    }

    const gratificacoesFuncao = Object.values(FUNCTION_BONUS_OPTIONS).map((item) => ({
      nome: item.label,
      percentual: roundMoney(toNumber(item.rate) * 100),
      baseReferencia: "BASE_INICIAL",
    }))

    res.json({
      app: {
        objetivo:
          "Organizar as entradas financeiras mensais do servidor, calcular remuneração com regras de proventos e descontos e armazenar histórico mensal para consulta.",
        impactoDosDados:
          "Cada campo informado altera diretamente os proventos, os descontos e as bases tributárias. O resultado final depende dos valores inseridos pelo usuário em cada mês.",
      },
      regras: {
        impostoRenda: {
          isencaoAte: 5000,
          faixaIntermediariaAte: 7350,
          formulaDescontoIntermediaria:
            "978,62 - (0,133145 * (totalBruto - (auxAlimentacao + valorEspecializacao + pensaoAlimenticia)))",
          observacaoFaixaAlta:
            "Acima de R$ 7.350,00, aplica-se apenas a regra antiga de IR sobre a base de cálculo antiga.",
        },
        comprometimento: {
          acumuladoAnual: "valor mensal atual * 12",
          percentualRendaMensal:
            "desconto mensal médio / renda mensal bruta média * 100",
        },
        reserva: {
          percentualSugestao: 10,
          rendimentoMensalPercentual: 1,
          periodoMeses: 12,
        },
        gratificacoesFuncao,
      },
      camposEntrada: [
        {
          campo: "Salário Base Atual",
          significado: "Valor principal da remuneração mensal.",
          preenchimento: "Informe em reais, usando formato numérico (ex.: 3000,00).",
          impacto: "Serve de base para adicionais, previdência, sindicato e parte dos cálculos de proventos.",
        },
        {
          campo: "Quantidade de Plantões",
          significado: "Define a escala usada para calcular adicionais da jornada.",
          preenchimento: "Selecione 7 ou 8 plantões.",
          impacto: "Altera horas noturnas, horas excedentes e quantidade de auxílios-alimentação.",
        },
        {
          campo: "Escolaridade",
          significado: "Nível de formação do usuário.",
          preenchimento: "Selecione o nível correspondente.",
          impacto: "Afeta o reajuste aplicado na base e, consequentemente, todo o cálculo.",
        },
        {
          campo: "Quinquênios",
          significado: "Quantidade de adicionais por tempo de serviço.",
          preenchimento: "Informe número inteiro (0 ou maior).",
          impacto: "Aumenta proventos e também influencia descontos vinculados à base.",
        },
        {
          campo: "Especialização",
          significado: "Percentual de especialização (15% ou 25%).",
          preenchimento: "Selecione o percentual aplicável.",
          impacto: "Entra como provento e compõe dedução específica usada na base de IR nova.",
        },
        {
          campo: "Gratificação por Função",
          significado: "Adicionais por função exercida, cumulativos.",
          preenchimento: "Marque uma ou mais funções aplicáveis.",
          impacto: "Soma proventos e também compõe a base da especialização.",
        },
        {
          campo: "Pensão Alimentícia",
          significado: "Desconto judicial ou voluntário de pensão.",
          preenchimento: "Marque se possui pensão e informe o valor em reais.",
          impacto: "É desconto direto e também dedução da base de IR.",
        },
        {
          campo: "Dependentes (IR)",
          significado: "Quantidade de dependentes com dedução no IR.",
          preenchimento: "Informe número inteiro.",
          impacto: "Reduz a base de cálculo antiga do imposto de renda.",
        },
      ],
      resultados: [
        {
          nome: "Total Bruto",
          explicacao: "Soma de todos os proventos do mês antes dos descontos.",
        },
        {
          nome: "Total Líquido",
          explicacao: "Valor final após subtrair todos os descontos do total bruto.",
        },
        {
          nome: "Descontos",
          explicacao: "Itens como previdência, IR, sindicato, pensão e descontos individuais.",
        },
        {
          nome: "Base de Cálculo de IR",
          explicacao:
            "Base usada para enquadrar a regra de IR vigente (isenção, faixa intermediária com ajuste ou faixa superior).",
        },
        {
          nome: "Comprometimento de Renda",
          explicacao:
            "Mostra quanto cada desconto pesa na renda mensal e projeta acumulado anual com base no valor mensal atual.",
        },
        {
          nome: "Reserva Sugerida",
          explicacao:
            "Sugere guardar 10% da renda líquida média mensal e simula acumulação por 12 meses com juros compostos de 1% ao mês.",
        },
      ],
      exemploUltimoCalculo: latestSnapshot,
    })
  } catch (_error) {
    res.status(500).json({ error: "Erro ao carregar guia de ajuda." })
  }
})

app.get("/admin", (req, res) => {
  const adminContext = getAdminContextFromRequest(req)
  if (!adminContext) {
    res.redirect("/app/login")
    return
  }
  res.sendFile(path.join(__dirname, "admin.html"))
})

app.get("/", (_req, res) => {
  res.redirect("/app/login")
})

app.get("/app", (_req, res) => {
  res.redirect("/app/login")
})

app.get("/app/login", (_req, res) => {
  res.sendFile(path.join(__dirname, "index2.html"))
})

app.get("/app/entradas", (_req, res) => {
  res.sendFile(path.join(__dirname, "entries.html"))
})

app.get("/app/historico", (_req, res) => {
  res.sendFile(path.join(__dirname, "history.html"))
})

app.get("/app/conta", (_req, res) => {
  res.sendFile(path.join(__dirname, "account.html"))
})

app.get("/app/informacoes-calculo", (_req, res) => {
  res.sendFile(path.join(__dirname, "calculation-info.html"))
})

app.get("/app/comprometimento-reserva", (_req, res) => {
  res.sendFile(path.join(__dirname, "commitment-reserve.html"))
})

app.get("/app/ajuda", (_req, res) => {
  res.sendFile(path.join(__dirname, "help.html"))
})

app.get("*", (_req, res) => {
  res.redirect("/app/login")
})

async function ensureMasterAdmin() {
  const existing = await get("SELECT id FROM admin_users WHERE email = ?", [masterAdminEmail])
  if (existing) return

  const passwordHash = await bcrypt.hash(masterAdminPassword, 12)
  await run(
    `
    INSERT INTO admin_users (name, email, password_hash, role, is_active)
    VALUES (?, ?, ?, 'MASTER', 1)
    `,
    [masterAdminName, masterAdminEmail, passwordHash]
  )

  console.log("Administrador master criado:")
  console.log(`  Email: ${masterAdminEmail}`)
  console.log(`  Senha: ${masterAdminPassword}`)
}

async function startServer() {
  await initDb()
  await ensureMasterAdmin()
  app.listen(port, () => {
    console.log(`GranaCheck ativo em http://localhost:${port}`)
  })
}

startServer().catch((error) => {
  console.error("Falha ao inicializar aplicação:", error)
  process.exit(1)
})
