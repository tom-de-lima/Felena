const fs = require("fs")
const path = require("path")
const sqlite3 = require("sqlite3").verbose()

const dataDir = path.join(__dirname, "data")
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const dbPath = path.join(dataDir, "granacheck.db")
const db = new sqlite3.Database(dbPath)

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err)
        return
      }
      resolve(this)
    })
  })
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err)
        return
      }
      resolve(row)
    })
  })
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err)
        return
      }
      resolve(rows)
    })
  })
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      full_name TEXT,
      matricula TEXT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      subscription_status TEXT NOT NULL DEFAULT 'PENDING',
      paid_until TEXT,
      pix_payment_reference TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await ensureColumn("users", "subscription_status", "TEXT NOT NULL DEFAULT 'PENDING'")
  await ensureColumn("users", "paid_until", "TEXT")
  await ensureColumn("users", "pix_payment_reference", "TEXT")
  await ensureColumn("users", "full_name", "TEXT")
  await ensureColumn("users", "matricula", "TEXT")
  await run("UPDATE users SET full_name = name WHERE full_name IS NULL OR trim(full_name) = ''")
  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_matricula
    ON users(matricula)
    WHERE matricula IS NOT NULL AND trim(matricula) <> ''
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS salary_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      month_key TEXT NOT NULL,
      total_bruto REAL NOT NULL DEFAULT 0,
      total_liquido REAL NOT NULL DEFAULT 0,
      input_json TEXT NOT NULL,
      output_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)

  await ensureColumn("salary_records", "month_key", "TEXT")
  await ensureColumn("salary_records", "total_bruto", "REAL NOT NULL DEFAULT 0")
  await ensureColumn("salary_records", "total_liquido", "REAL NOT NULL DEFAULT 0")
  await run(
    "UPDATE salary_records SET month_key = substr(created_at, 1, 7) WHERE month_key IS NULL OR trim(month_key) = ''"
  )

  await run(`
    DELETE FROM salary_records
    WHERE id NOT IN (
      SELECT MAX(id)
      FROM salary_records
      WHERE month_key IS NOT NULL AND trim(month_key) <> ''
      GROUP BY user_id, month_key
    )
  `)

  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_salary_records_user_month
    ON salary_records(user_id, month_key)
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)

  await run(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'MASTER',
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

async function ensureColumn(tableName, columnName, columnDefinition) {
  const columns = await all(`PRAGMA table_info(${tableName})`)
  const exists = columns.some((column) => column.name === columnName)
  if (exists) return
  await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`)
}

module.exports = {
  db,
  run,
  get,
  all,
  initDb,
}
