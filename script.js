/* Simple full-version credit manager using localStorage
   Features:
   - Customers with balances (credit + payments)
   - Purchases (dealer) with cash-source deduction
   - Expenses with cash-source deduction
   - Cash sources: kalla/home/bank/upi/other
   - Dashboard + recent activity
   - Export / Import JSON backup
   - WhatsApp reminder template generation
*/

// ---------- STORAGE KEYS & DEFAULTS ----------
const STORAGE_KEY = "om_data_v1";
const CURRENCY_CODE = "₹";
const LOCALE = "en-IN";

const defaultData = {
  customers: [], // {id,name,mobile,balance,entries: [{type,amount,date,note}]}
  purchases: [], // {id,dealer,amount,source,date}
  expenses: [], // {id,title,amount,source,date}
  cash: { kalla: 0, home: 0, bank: 0, upi: 0, other: 0 },
  settings: { 
    waTemplate: "Dear {name}, your outstanding at Oil Murugan is ₹{balance}. Please pay when convenient. - Oil Murugan",
    autoCalc: true // Added from HTML setting
  },
  recent: [] // simple activity lines
};

// ---------- UTILITIES & DATA MANAGEMENT ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const fmt = (n) => CURRENCY_CODE + Number(n || 0).toLocaleString(LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const todayISO = () => new Date().toISOString().slice(0, 10);

let appData = loadData();

function loadData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...defaultData, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error("Could not load data from localStorage", e);
  }
  return JSON.parse(JSON.stringify(defaultData)); // Deep copy default
}

function saveData(d = appData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
}

// ---------- BOOTSTRAP UI & EVENT LISTENERS ----------
function init() {
  attachTabListeners();
  attachFormSubmitListeners();
  attachUtilityListeners();
  attachSettingsListeners();
  attachCashModalListeners();
  
  // Set initial date values for inputs
  $$('input[type="date"]').forEach(input => input.value = todayISO());

  renderAll();
}

function attachTabListeners() {
  $$(".tabs button").forEach(b => {
    b.addEventListener("click", () => {
      $$(".tabs button").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      showTab(b.dataset.tab);
    });
  });
}

function attachFormSubmitListeners() {
  $("#addCustomerForm").addEventListener("submit", (e) => { e.preventDefault(); handleAddCustomer(); });
  $("#addPurchaseForm").addEventListener("submit", (e) => { e.preventDefault(); handleAddPurchase(); });
  $("#addExpenseForm").addEventListener("submit", (e) => { e.preventDefault(); handleAddExpense(); });
}

function attachUtilityListeners() {
  $("#backupBtn").addEventListener("click", exportJSON);
  $("#importBtn").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", importJSON);
  $("#clearAllBtn").addEventListener("click", handleClearAll);
  $("#generateStatement").addEventListener("click", handleGenerateStatement);
}

function attachSettingsListeners() {
  $("#waTemplate").value = appData.settings.waTemplate;
  $("#waTemplate").addEventListener("change", (e) => {
    appData.settings.waTemplate = e.target.value;
    saveData();
  });
}

function attachCashModalListeners() {
  $$(".addCash").forEach(b => b.addEventListener("click", openCashModal));
  $("#cashApply").addEventListener("click", handleApplyCashChange);
  $("#cashCancel").addEventListener("click", closeCashModal);
}

function showTab(name) {
  $$(".tabcontent").forEach(t => t.classList.remove("active"));
  const el = document.getElementById(name);
  if (el) el.classList.add("active");
}

// ---------- UTILITY HANDLERS ----------

function handleClearAll() {
  if (confirm("Clear ALL data? This cannot be undone and will reset the application.")) {
    appData = JSON.parse(JSON.stringify(defaultData));
    saveData(appData);
    renderAll();
    alert("All data cleared.");
  }
}

// ---------- CRUD: Customers ----------

function handleAddCustomer() {
  const name = $("#custName").value.trim();
  const mobile = $("#custMobile").value.trim();
  const opening = Number($("#custOpening").value || 0);

  if (!name) return alert("Enter customer name");

  const newCust = { id: uid(), name, mobile, balance: opening, entries: [] };
  
  if (opening > 0) {
    newCust.entries.push({ type: "opening", amount: opening, date: todayISO(), note: "Opening balance" });
  }
  appData.customers.push(newCust);
  appData.recent.unshift(`Customer added: **${name}** (opening ${fmt(opening)})`);

  saveData(); renderAll();
  $("#addCustomerForm").reset();
}

function renderCustomers() {
  const tbody = $("#customersTable tbody");
  tbody.innerHTML = "";
  appData.customers.forEach(c => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${c.name}</td>
      <td>${c.mobile || "-"}</td>
      <td class="${c.balance > 0 ? 'text-danger' : 'text-success'}">${fmt(c.balance)}</td>
      <td>
        <button class="action-icon-btn action-credit" data-id="${c.id}" title="Add Credit / Sale">🛒</button>
        <button class="action-icon-btn action-payment" data-id="${c.id}" title="Record Payment Received">💵</button>
        <button class="action-icon-btn action-statement" data-id="${c.id}" title="View Statement">📜</button>
        <button class="action-icon-btn action-whatsapp" data-id="${c.id}" title="Send WhatsApp Reminder">📱</button>
      </td>`;
    tbody.appendChild(tr);
  });

  // Attach specific customer action listeners using delegation for efficiency
  tbody.removeEventListener('click', handleCustomerActionClick); // Remove existing listener before adding
  tbody.addEventListener('click', handleCustomerActionClick);

  // Fill report customer select
  const sel = $("#reportCustomerSelect");
  sel.innerHTML = "<option value=''>--select customer--</option>";
  appData.customers.forEach(c => sel.insertAdjacentHTML("beforeend", `<option value="${c.id}">${c.name} (${c.mobile || '-'})</option>`));
}

function handleCustomerActionClick(e) {
  const btn = e.target.closest('button');
  if (!btn || !btn.dataset.id) return;
  const id = btn.dataset.id;
  
  if (btn.classList.contains('action-credit')) handleCustomerCredit(id);
  else if (btn.classList.contains('action-payment')) handleCustomerPayment(id);
  else if (btn.classList.contains('action-statement')) handleCustomerStatement(id);
  else if (btn.classList.contains('action-whatsapp')) sendWhatsApp(id);
}

function getCustomer(id) {
  return appData.customers.find(x => x.id === id);
}

function handleCustomerCredit(id) {
  const cust = getCustomer(id);
  if (!cust) return;

  const amountStr = prompt(`Add Credit for ${cust.name} (Amount owed by customer):`, "0");
  const amount = Number(amountStr);
  
  if (isNaN(amount) || amount <= 0) return;

  cust.balance = Number((cust.balance + amount).toFixed(2));
  cust.entries.push({ type: "credit", amount, date: todayISO(), note: prompt("Credit Note/Reason:", "Sale on credit") || "Sale on credit" });
  
  appData.recent.unshift(`${cust.name} credited **${fmt(amount)}**`);
  saveData(); renderAll();
}

function handleCustomerPayment(id) {
  const cust = getCustomer(id);
  if (!cust) return;

  const amountStr = prompt(`Record Payment Received from ${cust.name}:`, "0");
  const amount = Number(amountStr);
  
  if (isNaN(amount) || amount <= 0) return;

  cust.balance = Number((cust.balance - amount).toFixed(2));
  cust.entries.push({ type: "payment", amount, date: todayISO(), note: prompt("Payment Note/Type:", "Payment received") || "Payment received" });

  const src = prompt("Which source to credit? (kalla/home/bank/upi/other)", "kalla");
  if (src && appData.cash[src] !== undefined) {
    appData.cash[src] = Number((appData.cash[src] + amount).toFixed(2));
    appData.recent.unshift(`${cust.name} paid **${fmt(amount)}** to ${src}`);
  } else {
    appData.recent.unshift(`${cust.name} paid **${fmt(amount)}** (Cash source unrecorded)`);
  }

  saveData(); renderAll();
}

function handleCustomerStatement(id) {
  const cust = getCustomer(id);
  if (!cust) return;
  
  $("#statementArea").innerHTML = generateCustomerStatementHTML(cust);
  showTab("reports");
}

function sendWhatsApp(id) {
  const cust = getCustomer(id);
  if (!cust) return;
  
  if (!cust.mobile || cust.mobile.length !== 10) return alert(`${cust.name} does not have a valid 10-digit mobile number recorded.`);

  const tpl = appData.settings.waTemplate || "";
  const msg = tpl.replace("{name}", cust.name).replace("{balance}", fmt(cust.balance));
  const number = cust.mobile.replace(/\D/g, '');
  
  // Assume country code is 91 (India) for WhatsApp link
  const url = `https://wa.me/91${number}?text=` + encodeURIComponent(msg);
  
  window.open(url, "_blank");
}

// ---------- Purchases ----------

function handleAddPurchase() {
  const dealer = $("#pDealer").value.trim();
  const amount = Number($("#pAmount").value || 0);
  const source = $("#pSource").value;
  const date = $("#pDate").value || todayISO();

  if (!dealer || amount <= 0) return alert("Enter dealer and positive amount");

  // Validate cash balance (simple check)
  if (appData.cash[source] < amount) {
    if (!confirm(`Warning: ${source} balance will go negative by ${fmt(amount - appData.cash[source])}. Continue?`)) {
      return;
    }
  }

  const rec = { id: uid(), dealer, amount, source, date };
  appData.purchases.unshift(rec);

  // Deduct from source
  if (appData.cash[source] !== undefined) {
    appData.cash[source] = Number((appData.cash[source] - amount).toFixed(2));
  }
  
  appData.recent.unshift(`Purchase **${fmt(amount)}** from ${dealer} (from ${source})`);
  saveData(); renderAll();
  $("#addPurchaseForm").reset();
  $("#pDate").value = todayISO(); // Reset date field to current day
}

function renderPurchases() {
  const tbody = $("#purchasesTable tbody"); tbody.innerHTML = "";
  appData.purchases.forEach(p => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.date}</td>
      <td>${p.dealer}</td>
      <td>${fmt(p.amount)}</td>
      <td>${p.source}</td>
      <td><button class="delete-btn" data-id="${p.id}">🗑️</button></td>`;
    tbody.appendChild(tr);
  });
  // Use event delegation for delete buttons
  tbody.removeEventListener('click', handleDeletePurchaseClick);
  tbody.addEventListener('click', handleDeletePurchaseClick);
}

function handleDeletePurchaseClick(e) {
  const btn = e.target.closest('.delete-btn');
  if (btn && btn.dataset.id) {
    deletePurchase(btn.dataset.id);
  }
}

function deletePurchase(id) {
  const recIndex = appData.purchases.findIndex(x => x.id === id);
  if (recIndex === -1 || !confirm("Delete purchase? This will NOT refund cash automatically.")) return;
  
  appData.purchases.splice(recIndex, 1);
  saveData(); renderAll();
}

// ---------- Expenses ----------

function handleAddExpense() {
  const title = $("#eTitle").value.trim();
  const amount = Number($("#eAmount").value || 0);
  const source = $("#eSource").value;
  const date = $("#eDate").value || todayISO();

  if (!title || amount <= 0) return alert("Enter title and positive amount");

  // Validate cash balance (simple check)
  if (appData.cash[source] < amount) {
    if (!confirm(`Warning: ${source} balance will go negative by ${fmt(amount - appData.cash[source])}. Continue?`)) {
      return;
    }
  }

  const rec = { id: uid(), title, amount, source, date };
  appData.expenses.unshift(rec);

  if (appData.cash[source] !== undefined) {
    appData.cash[source] = Number((appData.cash[source] - amount).toFixed(2));
  }
  
  appData.recent.unshift(`Expense **${fmt(amount)}**: ${title} (from ${source})`);
  saveData(); renderAll();
  $("#addExpenseForm").reset();
  $("#eDate").value = todayISO(); // Reset date field to current day
}

function renderExpenses() {
  const tbody = $("#expensesTable tbody"); tbody.innerHTML = "";
  appData.expenses.forEach(e => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${e.date}</td>
      <td>${e.title}</td>
      <td>${fmt(e.amount)}</td>
      <td>${e.source}</td>
      <td><button class="delete-btn" data-id="${e.id}">🗑️</button></td>`;
    tbody.appendChild(tr);
  });
  // Use event delegation for delete buttons
  tbody.removeEventListener('click', handleDeleteExpenseClick);
  tbody.addEventListener('click', handleDeleteExpenseClick);
}

function handleDeleteExpenseClick(e) {
  const btn = e.target.closest('.delete-btn');
  if (btn && btn.dataset.id) {
    deleteExpense(btn.dataset.id);
  }
}

function deleteExpense(id) {
  const recIndex = appData.expenses.findIndex(x => x.id === id);
  if (recIndex === -1 || !confirm("Delete expense? This will NOT refund cash automatically.")) return;
  
  appData.expenses.splice(recIndex, 1);
  saveData(); renderAll();
}

// ---------- Cash Sources ----------

let currentCashSource = null;
function openCashModal(e) {
  const src = e.currentTarget.dataset.src;
  currentCashSource = src;
  $("#cashModalTitle").textContent = `Modify ${src.charAt(0).toUpperCase() + src.slice(1)} Cash`;
  $("#cashAmount").value = "";
  $("#cashAction").value = "add";
  $("#cashModal").classList.remove("hidden");
}

function closeCashModal() { 
  $("#cashModal").classList.add("hidden"); 
  currentCashSource = null; 
}

function handleApplyCashChange() {
  const amt = Number($("#cashAmount").value || 0);
  const act = $("#cashAction").value;

  if (!currentCashSource || amt <= 0 || isNaN(amt)) return alert("Enter a positive amount.");

  let newBalance = appData.cash[currentCashSource];

  if (act === "add") {
    newBalance += amt;
  } else if (act === "remove") {
    newBalance -= amt;
  }
  
  appData.cash[currentCashSource] = Number(newBalance.toFixed(2));

  appData.recent.unshift(`${act === 'add' ? 'Added' : 'Removed'} **${fmt(amt)}** ${act === 'add' ? 'to' : 'from'} ${currentCashSource}`);
  saveData(); renderAll(); closeCashModal();
}

function renderSources() {
  ["kalla", "home", "bank", "upi", "other"].forEach(s => {
    const el = $(`#src-${s}`);
    if (el) el.textContent = fmt(appData.cash[s]);
  });
}

// ---------- Dashboard & Recent ----------

function calcTotals() {
  const totalOutstanding = appData.customers.reduce((acc, c) => acc + Number(c.balance || 0), 0);
  const today = todayISO();
  const todayPurchases = appData.purchases.filter(p => p.date === today).reduce((a, b) => a + b.amount, 0);
  const totalExpenses = appData.expenses.reduce((a, b) => a + b.amount, 0);
  
  return { totalOutstanding, todayPurchases, totalExpenses };
}

function renderDashboard() {
  const totals = calcTotals();
  $("#totalOutstanding").textContent = fmt(totals.totalOutstanding);
  $("#todayPurchases").textContent = fmt(totals.todayPurchases);
  $("#totalExpenses").textContent = fmt(totals.totalExpenses);
  $("#kallaBalance").textContent = fmt(appData.cash.kalla);

  // Recent Activity
  const list = $("#recentList"); list.innerHTML = "";
  appData.recent.slice(0, 10).forEach(r => { // Show top 10 for dashboard
    const li = document.createElement("li"); 
    li.innerHTML = `<span class="activity-date">${todayISO()}</span> - ${r}`;
    list.appendChild(li);
  });
}

// ---------- Statements & Reports ----------

function generateCustomerStatementHTML(cust) {
  const entriesHTML = cust.entries
    .sort((a, b) => new Date(a.date) - new Date(b.date)) // Sort entries by date
    .map(e => {
      const typeClass = e.type === 'credit' || e.type === 'opening' ? 'text-danger' : 'text-success';
      return `<tr>
        <td>${e.date}</td>
        <td>${e.type.toUpperCase()}</td>
        <td class="${typeClass}">${fmt(e.amount)}</td>
        <td>${e.note || '-'}</td>
      </tr>`;
    }).join("");

  return `
    <div class="statement-header">
      <h3>Statement - ${cust.name}</h3>
      <p>Mobile: ${cust.mobile || '-'}</p>
    </div>
    <div class="statement-summary">
      <strong>CURRENT BALANCE: <span class="balance-final">${fmt(cust.balance)}</span></strong>
    </div>
    <table class="statement-table data-table">
      <thead>
        <tr><th>Date</th><th>Type</th><th>Amount</th><th>Note</th></tr>
      </thead>
      <tbody>${entriesHTML}</tbody>
    </table>
    <div class="statement-print-action">
      <button class="secondary-btn" onclick="window.print()">🖨️ Print / Save PDF</button>
    </div>`;
}

function handleGenerateStatement() {
  const cid = $("#reportCustomerSelect").value;
  if (!cid) return alert("Please select a customer.");
  const cust = getCustomer(cid);
  if (!cust) return alert("Customer not found.");
  
  $("#statementArea").innerHTML = generateCustomerStatementHTML(cust);
}

// ---------- Export / Import ----------

function exportJSON() {
  const blob = new Blob([JSON.stringify(appData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; 
  a.download = `oil_murugan_backup_${todayISO()}.json`;
  
  document.body.appendChild(a); 
  a.click(); 
  a.remove();
  URL.revokeObjectURL(url);
  alert("Data exported successfully!");
}

function importJSON(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      // Basic check for data structure to prevent importing junk
      if (!parsed || !Array.isArray(parsed.customers) || typeof parsed.cash !== 'object') {
        throw new Error("File structure mismatch.");
      }

      if (confirm("Importing new data will overwrite ALL current data. Proceed?")) {
        // Merge imported data with defaults to ensure all keys exist
        appData = { ...defaultData, ...parsed }; 
        saveData(appData); 
        renderAll();
        alert("Data imported successfully!");
      }
    } catch (err) { 
      alert(`Invalid JSON file or structure: ${err.message}`); 
    }
  };
  reader.readAsText(file);
}

// ---------- Render everything ----------

function renderAll() {
  saveData();
  renderCustomers();
  renderPurchases();
  renderExpenses();
  renderSources();
  renderDashboard();
}

// ---------- Start ----------
init();

// ---------- Expose for Console Debugging ----------
window._om_data = appData;
window._om_save = () => { saveData(appData); alert("Data saved and UI rendered."); renderAll(); };
