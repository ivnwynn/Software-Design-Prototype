const express = require("express");
const cors = require("cors");
const path = require("path");
const { db, normalizeDate } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

// Change this before exposing the app publicly.
const API_KEY = "eggtrack-secret-key-2026";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function getDateRange(query) {
  const now = new Date();

  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 30);
  defaultFrom.setHours(0, 0, 0, 0);

  const from = normalizeDate(query.from, defaultFrom.toISOString());
  const to = normalizeDate(query.to, now.toISOString());

  return { from, to };
}

function getCurrentStock() {
  const stockTotal = db
    .prepare("SELECT COALESCE(SUM(qty), 0) AS total FROM stock")
    .get().total;

  const soldTotal = db
    .prepare("SELECT COALESCE(SUM(qty), 0) AS total FROM sales")
    .get().total;

  return stockTotal - soldTotal;
}

function getSummary(from, to) {
  const sales = db
    .prepare(`
      SELECT
        COALESCE(SUM(qty), 0) AS eggs_sold,
        COALESCE(SUM(total), 0) AS revenue,
        COUNT(*) AS transactions
      FROM sales
      WHERE created_at >= ? AND created_at <= ?
    `)
    .get(from, to);

  return {
    current_stock: getCurrentStock(),
    eggs_sold: sales.eggs_sold,
    revenue: Number(sales.revenue.toFixed(2)),
    transactions: sales.transactions
  };
}

function getRevenueSeries(from, to, group) {
  const format =
    group === "week"
      ? "%Y-%W"
      : group === "month"
        ? "%Y-%m"
        : "%Y-%m-%d";

  const rows = db
    .prepare(`
      SELECT
        strftime(?, created_at) AS period,
        COALESCE(SUM(total), 0) AS revenue,
        COALESCE(SUM(qty), 0) AS eggs_sold,
        COUNT(*) AS transactions
      FROM sales
      WHERE created_at >= ? AND created_at <= ?
      GROUP BY period
      ORDER BY period ASC
    `)
    .all(format, from, to);

  return rows.map((row) => ({
    period: row.period,
    revenue: Number(row.revenue.toFixed(2)),
    eggs_sold: row.eggs_sold,
    transactions: row.transactions
  }));
}

app.get("/api/summary", (req, res) => {
  try {
    const { from, to } = getDateRange(req.query);
    res.json(getSummary(from, to));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load summary" });
  }
});

app.get("/api/stock", (req, res) => {
  try {
    const { from, to } = getDateRange(req.query);

    const rows = db
      .prepare(`
        SELECT id, qty, created_at
        FROM stock
        WHERE created_at >= ? AND created_at <= ?
        ORDER BY created_at DESC
      `)
      .all(from, to);

    res.json({
      current_stock: getCurrentStock(),
      records: rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load stock records" });
  }
});

app.get("/api/sales", (req, res) => {
  try {
    const { from, to } = getDateRange(req.query);

    const search = (req.query.search || "").toString().trim();
    const page = Math.max(1, Number.parseInt(req.query.page || "1", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(5, Number.parseInt(req.query.page_size || "10", 10) || 10)
    );

    const sortBy = ["created_at", "qty", "price_per_egg", "total"].includes(
      req.query.sort_by
    )
      ? req.query.sort_by
      : "created_at";

    const sortDir = req.query.sort_dir === "asc" ? "ASC" : "DESC";

    const where = "created_at >= ? AND created_at <= ?";
    const params = [from, to];

    let searchClause = "";
    if (search) {
      searchClause = `
        AND (
          CAST(qty AS TEXT) LIKE ?
          OR CAST(price_per_egg AS TEXT) LIKE ?
          OR CAST(total AS TEXT) LIKE ?
          OR created_at LIKE ?
        )
      `;

      const like = `%${search}%`;
      params.push(like, like, like, like);
    }

    const totalRow = db
      .prepare(`
        SELECT COUNT(*) AS count
        FROM sales
        WHERE ${where} ${searchClause}
      `)
      .get(...params);

    const records = db
      .prepare(`
        SELECT id, qty, price_per_egg, total, created_at
        FROM sales
        WHERE ${where} ${searchClause}
        ORDER BY ${sortBy} ${sortDir}
        LIMIT ? OFFSET ?
      `)
      .all(...params, pageSize, (page - 1) * pageSize);

    res.json({
      records,
      page,
      page_size: pageSize,
      total: totalRow.count,
      total_pages: Math.max(1, Math.ceil(totalRow.count / pageSize))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load sales records" });
  }
});

app.get("/api/revenue", (req, res) => {
  try {
    const { from, to } = getDateRange(req.query);
    const group = ["day", "week", "month"].includes(req.query.group)
      ? req.query.group
      : "day";

    const series = getRevenueSeries(from, to, group);

    const totalRevenue = series.reduce((sum, row) => sum + row.revenue, 0);
    const totalEggs = series.reduce((sum, row) => sum + row.eggs_sold, 0);
    const totalTransactions = series.reduce(
      (sum, row) => sum + row.transactions,
      0
    );

    const bestDay = series.reduce(
      (best, row) => (row.revenue > (best?.revenue || 0) ? row : best),
      null
    );

    res.json({
      series,
      total_revenue: Number(totalRevenue.toFixed(2)),
      eggs_sold: totalEggs,
      transactions: totalTransactions,
      average_sale:
        totalTransactions > 0
          ? Number((totalRevenue / totalTransactions).toFixed(2))
          : 0,
      best_day: bestDay
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load revenue data" });
  }
});

app.post("/api/sync", (req, res) => {
  try {
    if (req.header("x-api-key") !== API_KEY) {
      return res.status(401).json({ error: "Invalid or missing API key" });
    }

    const stock = Array.isArray(req.body?.stock) ? req.body.stock : [];
    const sales = Array.isArray(req.body?.sales) ? req.body.sales : [];

    const insertStock = db.prepare(`
      INSERT OR IGNORE INTO stock (id, qty, created_at)
      VALUES (?, ?, ?)
    `);

    const insertSale = db.prepare(`
      INSERT OR IGNORE INTO sales (id, qty, price_per_egg, total, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    let received = 0;

    const syncTransaction = db.transaction(() => {
      for (const item of stock) {
        if (!item?.id || !Number.isInteger(item.qty) || !isValidDate(item.created_at)) {
          continue;
        }

        const result = insertStock.run(
          item.id,
          item.qty,
          new Date(item.created_at).toISOString()
        );

        received += result.changes;
      }

      for (const item of sales) {
        const qty = Number(item?.qty);
        const price = Number(item?.price_per_egg);
        const total = Number(item?.total);

        if (
          !item?.id ||
          !Number.isInteger(qty) ||
          qty <= 0 ||
          !Number.isFinite(price) ||
          price < 0 ||
          !Number.isFinite(total) ||
          total < 0 ||
          !isValidDate(item.created_at)
        ) {
          continue;
        }

        const result = insertSale.run(
          item.id,
          qty,
          price,
          total,
          new Date(item.created_at).toISOString()
        );

        received += result.changes;
      }
    });

    syncTransaction();

    res.json({
      ok: true,
      received,
      stock_received: stock.length,
      sales_received: sales.length
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Sync failed" });
  }
});

function isValidDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`EggTrack running at http://localhost:${PORT}`);
});