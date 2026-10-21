const state = {
  page: "stock",
  range: "today",
  group: "day",
  salesSearch: "",
  salesPage: 1,
  salesPageSize: 10,
  salesSortBy: "created_at",
  salesSortDir: "desc",
  chart: null
};

const pageTitle = document.getElementById("pageTitle");
const pageSubtitle = document.getElementById("pageSubtitle");
const fromDate = document.getElementById("fromDate");
const toDate = document.getElementById("toDate");

const pageMeta = {
  stock: {
    title: "Stock",
    subtitle: "Current inventory and stock-in history"
  },
  sales: {
    title: "Sales records",
    subtitle: "Search, sort, paginate, and export transactions"
  },
  revenue: {
    title: "Revenue",
    subtitle: "Performance across your selected period"
  }
};

function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function isoDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function setRange(range) {
  state.range = range;
  const today = todayIso();

  if (range === "today") {
    fromDate.value = today;
    toDate.value = today;
  } else if (range === "7d") {
    fromDate.value = isoDaysAgo(6);
    toDate.value = today;
  } else if (range === "30d") {
    fromDate.value = isoDaysAgo(29);
    toDate.value = today;
  }

  document.querySelectorAll("#rangeSelector .segment").forEach((button) => {
    button.classList.toggle("active", button.dataset.range === range);
  });

  state.salesPage = 1;
  loadCurrentPage();
}

function getApiRange() {
  const params = new URLSearchParams();

  if (fromDate.value) {
    params.set("from", new Date(`${fromDate.value}T00:00:00`).toISOString());
  }

  if (toDate.value) {
    params.set("to", new Date(`${toDate.value}T23:59:59.999`).toISOString());
  }

  return params.toString();
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value || 0);
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

function formatDate(value) {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
}

function showSkeletons(ids, show) {
  ids.forEach((id) => {
    document.getElementById(id).classList.toggle("hidden", !show);
  });
}

function navigate(page) {
  state.page = page;

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  document.querySelectorAll(".page").forEach((section) => {
    section.classList.toggle("active", section.id === `page-${page}`);
  });

  pageTitle.textContent = pageMeta[page].title;
  pageSubtitle.textContent = pageMeta[page].subtitle;

  document.getElementById("sidebar").classList.remove("open");
  loadCurrentPage();
}

async function loadStock() {
  const stockSkeleton = document.getElementById("stockSkeleton");
  const stockCountSkeleton = document.getElementById("stockCountSkeleton");
  const latestStockSkeleton = document.getElementById("latestStockSkeleton");

  stockSkeleton.classList.remove("hidden");
  stockCountSkeleton.classList.remove("hidden");
  latestStockSkeleton.classList.remove("hidden");

  const query = getApiRange();
  const data = await fetchJson(`/api/stock?${query}`);

  document.getElementById("currentStock").textContent =
    `${formatNumber(data.current_stock)} eggs`;

  document.getElementById("stockRecordCount").textContent = formatNumber(
    data.records.length
  );

  const latest = data.records[0];

  document.getElementById("latestStockQty").textContent = latest
    ? `${formatNumber(latest.qty)} eggs`
    : "No deliveries";

  document.getElementById("latestStockDate").textContent = latest
    ? formatDate(latest.created_at)
    : "—";

  stockSkeleton.classList.add("hidden");
  stockCountSkeleton.classList.add("hidden");
  latestStockSkeleton.classList.add("hidden");

  const tbody = document.getElementById("stockTableBody");
  const empty = document.getElementById("stockEmpty");

  tbody.innerHTML = "";

  if (!data.records.length) {
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");

  data.records.forEach((record) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${formatDate(record.created_at)}</td>
      <td class="muted">${formatTime(record.created_at)}</td>
      <td><span class="badge">${formatNumber(record.qty)} eggs</span></td>
      <td class="muted">${record.id}</td>
    `;

    tbody.appendChild(row);
  });
}

async function loadSales() {
  const params = new URLSearchParams(getApiRange());

  params.set("page", state.salesPage);
  params.set("page_size", state.salesPageSize);
  params.set("sort_by", state.salesSortBy);
  params.set("sort_dir", state.salesSortDir);

  if (state.salesSearch) {
    params.set("search", state.salesSearch);
  }

  const data = await fetchJson(`/api/sales?${params.toString()}`);
  const tbody = document.getElementById("salesTableBody");
  const empty = document.getElementById("salesEmpty");

  tbody.innerHTML = "";

  if (!data.records.length) {
    empty.classList.remove("hidden");
  } else {
    empty.classList.add("hidden");
  }

  data.records.forEach((record) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${formatDate(record.created_at)}</td>
      <td class="muted">${formatTime(record.created_at)}</td>
      <td><span class="badge">${formatNumber(record.qty)}</span></td>
      <td>${formatMoney(record.price_per_egg)}</td>
      <td><strong>${formatMoney(record.total)}</strong></td>
    `;

    tbody.appendChild(row);
  });

  document.getElementById("salesPageInfo").textContent =
    `Page ${data.page} of ${data.total_pages}`;

  document.getElementById("salesPrev").disabled = data.page <= 1;
  document.getElementById("salesNext").disabled =
    data.page >= data.total_pages;
}

async function loadRevenue() {
  showSkeletons(
    ["revenueSkeleton", "eggsSkeleton", "averageSkeleton", "bestSkeleton"],
    true
  );

  const params = new URLSearchParams(getApiRange());
  params.set("group", state.group);

  const data = await fetchJson(`/api/revenue?${params.toString()}`);

  document.getElementById("totalRevenue").textContent = formatMoney(
    data.total_revenue
  );

  document.getElementById("eggsSold").textContent =
    `${formatNumber(data.eggs_sold)} eggs`;

  document.getElementById("averageSale").textContent = formatMoney(
    data.average_sale
  );

  document.getElementById("bestDayRevenue").textContent = data.best_day
    ? formatMoney(data.best_day.revenue)
    : "—";

  document.getElementById("bestDayLabel").textContent = data.best_day
    ? formatPeriodLabel(data.best_day.period)
    : "No sales yet";

  showSkeletons(
    ["revenueSkeleton", "eggsSkeleton", "averageSkeleton", "bestSkeleton"],
    false
  );

  renderRevenueChart(data.series);
}

function formatPeriodLabel(period) {
  if (state.group === "month") {
    const [year, month] = period.split("-");
    return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric"
    });
  }

  if (state.group === "week") {
    return `Week ${period.split("-W")[1]}, ${period.split("-W")[0]}`;
  }

  return formatDate(period);
}

function renderRevenueChart(series) {
  const canvas = document.getElementById("revenueChart");

  if (state.chart) {
    state.chart.destroy();
  }

  const labels = series.map((row) => formatPeriodLabel(row.period));
  const values = series.map((row) => row.revenue);

  const styles = getComputedStyle(document.documentElement);
  const textColor = styles.getPropertyValue("--muted").trim();
  const borderColor = styles.getPropertyValue("--border").trim();

  const gradient = canvas
    .getContext("2d")
    .createLinearGradient(0, 0, 0, 360);

  gradient.addColorStop(0, "rgba(255, 138, 0, 0.35)");
  gradient.addColorStop(1, "rgba(255, 94, 58, 0.02)");

  state.chart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Revenue",
          data: values,
          borderColor: "#ff8a00",
          backgroundColor: gradient,
          borderWidth: 3,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: "#ff5e3a",
          pointBorderColor: "#ffffff",
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#17181c",
          padding: 12,
          cornerRadius: 10,
          callbacks: {
            label: (context) =>
              ` ${formatMoney(context.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: textColor },
          border: { color: borderColor }
        },
        y: {
          beginAtZero: true,
          grid: { color: borderColor },
          ticks: {
            color: textColor,
            callback: (value) => formatMoney(value)
          },
          border: { display: false }
        }
      }
    }
  });
}

async function loadCurrentPage() {
  try {
    if (state.page === "stock") await loadStock();
    if (state.page === "sales") await loadSales();
    if (state.page === "revenue") await loadRevenue();
  } catch (error) {
    console.error(error);
  }
}

function exportSalesCsv() {
  const params = new URLSearchParams(getApiRange());
  params.set("page", 1);
  params.set("page_size", 100);
  params.set("sort_by", state.salesSortBy);
  params.set("sort_dir", state.salesSortDir);

  if (state.salesSearch) {
    params.set("search", state.salesSearch);
  }

  fetch(`/api/sales?${params.toString()}`)
    .then((response) => response.json())
    .then((data) => {
      const rows = [["Date", "Time", "Quantity", "Price per egg", "Total"]];

      data.records.forEach((record) => {
        rows.push([
          new Date(record.created_at).toISOString(),
          "",
          record.qty,
          record.price_per_egg,
          record.total
        ]);
      });

      const csv = rows
        .map((row) =>
          row
            .map((value) => `"${String(value).replace(/"/g, '""')}"`)
            .join(",")
        )
        .join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `eggtrack-sales-${todayIso()}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    });
}

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => navigate(button.dataset.page));
});

document.querySelectorAll("#rangeSelector .segment").forEach((button) => {
  button.addEventListener("click", () => setRange(button.dataset.range));
});

document.querySelectorAll("#groupSelector .segment").forEach((button) => {
  button.addEventListener("click", () => {
    state.group = button.dataset.group;

    document.querySelectorAll("#groupSelector .segment").forEach((item) => {
      item.classList.toggle("active", item === button);
    });

    loadRevenue();
  });
});

fromDate.addEventListener("change", () => {
  state.salesPage = 1;
  setRange("custom");
});

toDate.addEventListener("change", () => {
  state.salesPage = 1;
  setRange("custom");
});

document.getElementById("menuToggle").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
});

document.getElementById("themeToggle").addEventListener("click", () => {
  const isDark = document.documentElement.dataset.theme === "dark";
  document.documentElement.dataset.theme = isDark ? "light" : "dark";
  localStorage.setItem("eggtrack-theme", isDark ? "light" : "dark");
  loadCurrentPage();
});

document.getElementById("salesSearch").addEventListener("input", (event) => {
  clearTimeout(window.salesSearchTimer);
  window.salesSearchTimer = setTimeout(() => {
    state.salesSearch = event.target.value.trim();
    state.salesPage = 1;
    loadSales();
  }, 300);
});

document.querySelectorAll(".sortable").forEach((header) => {
  header.addEventListener("click", () => {
    const field = header.dataset.sort;

    if (state.salesSortBy === field) {
      state.salesSortDir =
        state.salesSortDir === "asc" ? "desc" : "asc";
    } else {
      state.salesSortBy = field;
      state.salesSortDir = "desc";
    }

    state.salesPage = 1;
    loadSales();
  });
});

document.getElementById("salesPrev").addEventListener("click", () => {
  if (state.salesPage > 1) {
    state.salesPage -= 1;
    loadSales();
  }
});

document.getElementById("salesNext").addEventListener("click", () => {
  state.salesPage += 1;
  loadSales();
});

document.getElementById("exportCsv").addEventListener("click", exportSalesCsv);

document.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();

  const savedTheme = localStorage.getItem("eggtrack-theme") || "light";
  document.documentElement.dataset.theme = savedTheme;

  setRange("today");
  navigate("stock");
});