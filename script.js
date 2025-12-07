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
const STORAGE_KEY = "om_data_v1"; // oil murugan data
const defaultData = {
  customers: [], // {id,name,mobile,balance,entries: [{type,amount,date,note}]}
  purchases: [], // {id,dealer,amount,source,date}
  expenses: [], // {id,title,amount,source,date}
  cash: { kalla: 0, home: 0, bank: 0, upi: 0, other: 0 },
  settings: { waTemplate: "Dear {name}, your outstanding at Oil Murugan is ₹{balance}. Please pay when convenient. - Oil Murugan" },
  recent: [] // simple activity lines
};

// ---------- UTILITIES ----------
const $ = (sel) => document.querySelector(sel);
const fmt = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const load = () => JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || JSON.parse(JSON.stringify(defaultData));
const save = (d) => localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
let data = load();

// ---------- BOOTSTRAP UI ----------
function init() {
  // tab clicks
  document.querySelectorAll(".tabs button").forEach(b=>{
    b.addEventListener("click", ()=> { document.querySelectorAll(".tabs button").forEach(x=>x.classList.remove("active")); b.classList.add("active"); showTab(b.dataset.tab); });
  });

  // forms
  $("#addCustomerForm").addEventListener("submit", e=> { e.preventDefault(); addCustomer(); });
  $("#addPurchaseForm").addEventListener("submit", e=> { e.preventDefault(); addPurchase(); });
  $("#addExpenseForm").addEventListener("submit", e=> { e.preventDefault(); addExpense(); });

  // backup/import/clear
  $("#backupBtn").addEventListener("click", exportJSON);
  $("#importBtn").addEventListener("click", ()=> $("#importFile").click());
  $("#importFile").addEventListener("change", importJSON);
  $("#clearAllBtn").addEventListener("click", ()=>{
    if(confirm("Clear ALL data? This cannot be undone.")) { data = JSON.parse(JSON.stringify(defaultData)); save(data); renderAll(); }
  });

  // statement
  $("#generateStatement").addEventListener("click", generateStatement);

  // settings
  $("#waTemplate").value = data.settings.waTemplate;
  $("#waTemplate").addEventListener("change", e=> { data.settings.waTemplate = e.target.value; save(data); });

  // cash modal
  document.querySelectorAll(".addCash").forEach(b=>b.addEventListener("click", openCashModal));
  $("#cashApply").addEventListener("click", applyCashChange);
  $("#cashCancel").addEventListener("click", closeCashModal);

  renderAll();
}

function showTab(name){
  document.querySelectorAll(".tabcontent").forEach(t=>t.classList.remove("active"));
  const el = document.getElementById(name);
  if(el) el.classList.add("active");
}

// ---------- CRUD: Customers ----------
function addCustomer(){
  const name = $("#custName").value.trim();
  const mobile = $("#custMobile").value.trim();
  const opening = Number($("#custOpening").value || 0);
  if(!name) return alert("Enter customer name");
  const newCust = { id: uid(), name, mobile, balance: opening, entries: [] };
  if(opening>0){
    newCust.entries.push({ type: "opening", amount: opening, date: (new Date()).toISOString().slice(0,10), note: "Opening balance" });
  }
  data.customers.push(newCust);
  data.recent.unshift(`${name} added (opening ${fmt(opening)})`);
  save(data); renderAll();
  $("#addCustomerForm").reset();
}

function renderCustomers(){
  const tbody = $("#customersTable tbody");
  tbody.innerHTML = "";
  data.customers.forEach(c=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${c.name}</td><td>${c.mobile || ""}</td><td>${fmt(c.balance)}</td>
      <td>
        <button class="small" data-cid="${c.id}" onclick="openCustomerActions('${c.id}')">Actions</button>
        <button class="small" data-cid="${c.id}" onclick="sendWhatsApp('${c.id}')">WA</button>
      </td>`;
    tbody.appendChild(tr);
  });
  // fill report customer select
  const sel = $("#reportCustomerSelect");
  sel.innerHTML = "<option value=''>--select--</option>";
  data.customers.forEach(c=> sel.insertAdjacentHTML("beforeend", `<option value="${c.id}">${c.name} (${c.mobile||'-'})</option>`));
}

// customer actions (global function to be callable from markup)
window.openCustomerActions = function(id){
  const cust = data.customers.find(x=>x.id===id);
  if(!cust) return;
  const action = prompt(`Customer: ${cust.name}\nChoose:\n1 - Add credit (customer owes more)\n2 - Record payment (received)\n3 - View statement\nEnter 1/2/3`);
  if(action==="1") {
    const amount = Number(prompt("Credit amount (add to customer balance)","0"));
    if(amount>0){
      cust.balance += amount;
      cust.entries.push({ type:"credit", amount, date:(new Date()).toISOString().slice(0,10), note:"Sale on credit" });
      data.recent.unshift(`${cust.name} credited ${fmt(amount)}`);
      save(data); renderAll();
    }
  } else if(action==="2"){
    const amount = Number(prompt("Payment received amount","0"));
    if(amount>0){
      cust.balance = Number((cust.balance - amount).toFixed(2));
      cust.entries.push({ type:"payment", amount, date:(new Date()).toISOString().slice(0,10), note:"Payment received" });
      // add money to default cash (kalla) - ask user which source quickly
      const src = prompt("Which source to credit? (kalla/home/bank/upi/other)","kalla");
      if(src && data.cash[src]!==undefined){
        data.cash[src] = Number((data.cash[src] + amount).toFixed(2));
      }
      data.recent.unshift(`${cust.name} paid ${fmt(amount)}`);
      save(data); renderAll();
    }
  } else if(action==="3"){
    // show small statement in statement area
    const area = $("#statementArea");
    area.innerHTML = generateCustomerStatementHTML(cust);
    showTab("reports");
  }
};

// generate WhatsApp message and open wa.me
window.sendWhatsApp = function(id){
  const cust = data.customers.find(x=>x.id===id);
  if(!cust) return;
  const tpl = data.settings.waTemplate || "";
  const msg = tpl.replace("{name}", cust.name).replace("{balance}", String(cust.balance));
  const number = cust.mobile ? cust.mobile.replace(/\D/g,'') : "";
  const url = `https://wa.me/${number ? "91"+number : ""}?text=` + encodeURIComponent(msg);
  // open in new tab
  window.open(url, "_blank");
};

// ---------- Purchases ----------
function addPurchase(){
  const dealer = $("#pDealer").value.trim();
  const amount = Number($("#pAmount").value||0);
  const source = $("#pSource").value;
  const date = $("#pDate").value || (new Date()).toISOString().slice(0,10);
  if(!dealer || amount<=0) return alert("Enter dealer and amount");
  const rec = { id: uid(), dealer, amount, source, date };
  data.purchases.unshift(rec);
  // deduct from source
  if(data.cash[source]!==undefined){
    data.cash[source] = Number((data.cash[source] - amount).toFixed(2));
  }
  data.recent.unshift(`Purchase ${fmt(amount)} from ${dealer} (from ${source})`);
  save(data); renderAll();
  $("#addPurchaseForm").reset();
}

function renderPurchases(){
  const tbody = $("#purchasesTable tbody"); tbody.innerHTML = "";
  data.purchases.forEach(p=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${p.date}</td><td>${p.dealer}</td><td>${fmt(p.amount)}</td><td>${p.source}</td>
      <td><button class="small" onclick="deletePurchase('${p.id}')">Delete</button></td>`;
    tbody.appendChild(tr);
  });
}
window.deletePurchase = function(id){
  if(!confirm("Delete purchase?")) return;
  data.purchases = data.purchases.filter(x=>x.id!==id);
  save(data); renderAll();
};

// ---------- Expenses ----------
function addExpense(){
  const title = $("#eTitle").value.trim();
  const amount = Number($("#eAmount").value||0);
  const source = $("#eSource").value;
  const date = $("#eDate").value || (new Date()).toISOString().slice(0,10);
  if(!title || amount<=0) return alert("Enter title and amount");
  const rec = { id: uid(), title, amount, source, date };
  data.expenses.unshift(rec);
  if(data.cash[source]!==undefined){
    data.cash[source] = Number((data.cash[source] - amount).toFixed(2));
  }
  data.recent.unshift(`Expense ${fmt(amount)}: ${title} (from ${source})`);
  save(data); renderAll();
  $("#addExpenseForm").reset();
}

function renderExpenses(){
  const tbody = $("#expensesTable tbody"); tbody.innerHTML = "";
  data.expenses.forEach(e=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${e.date}</td><td>${e.title}</td><td>${fmt(e.amount)}</td><td>${e.source}</td>
      <td><button class="small" onclick="deleteExpense('${e.id}')">Delete</button></td>`;
    tbody.appendChild(tr);
  });
}
window.deleteExpense = function(id){
  if(!confirm("Delete expense?")) return;
  data.expenses = data.expenses.filter(x=>x.id!==id);
  save(data); renderAll();
};

// ---------- Cash Sources ----------
let currentCashSource = null;
function openCashModal(e){
  const src = e.currentTarget.dataset.src;
  currentCashSource = src;
  $("#cashModalTitle").textContent = `Modify ${src}`;
  $("#cashAmount").value = "";
  $("#cashAction").value = "add";
  $("#cashModal").classList.remove("hidden");
}
function closeCashModal(){ $("#cashModal").classList.add("hidden"); currentCashSource = null; }
function applyCashChange(){
  const amt = Number($("#cashAmount").value||0);
  const act = $("#cashAction").value;
  if(!currentCashSource || amt<=0) return alert("Enter positive amount");
  if(act==="add") data.cash[currentCashSource] = Number((data.cash[currentCashSource] + amt).toFixed(2));
  else data.cash[currentCashSource] = Number((data.cash[currentCashSource] - amt).toFixed(2));
  data.recent.unshift(`${act==='add'?'Added':'Removed'} ${fmt(amt)} ${act==='add'?'to':'from'} ${currentCashSource}`);
  save(data); renderAll(); closeCashModal();
}

function renderSources(){
  ["kalla","home","bank","upi","other"].forEach(s=>{
    const el = $(`#src-${s}`);
    if(el) el.textContent = fmt(data.cash[s]);
  });
}

// ---------- Dashboard & Recent ----------
function calcTotals(){
  const totalOutstanding = data.customers.reduce((acc,c)=>acc + Number(c.balance||0),0);
  const today = (new Date()).toISOString().slice(0,10);
  const todayPurchases = data.purchases.filter(p=>p.date===today).reduce((a,b)=>a+b.amount,0);
  const totalExpenses = data.expenses.reduce((a,b)=>a+b.amount,0);
  return { totalOutstanding, todayPurchases, totalExpenses };
}
function renderDashboard(){
  const totals = calcTotals();
  $("#totalOutstanding").textContent = fmt(totals.totalOutstanding);
  $("#todayPurchases").textContent = fmt(totals.todayPurchases);
  $("#totalExpenses").textContent = fmt(totals.totalExpenses);
  $("#kallaBalance").textContent = fmt(data.cash.kalla);
  // recent
  const list = $("#recentList"); list.innerHTML = "";
  data.recent.slice(0,20).forEach(r=> {
    const li = document.createElement("li"); li.textContent = `${r}`;
    list.appendChild(li);
  });
}

// ---------- Statements & Reports ----------
function generateCustomerStatementHTML(cust){
  const lines = cust.entries.map(e => `<tr><td>${e.date}</td><td>${e.type}</td><td>${fmt(e.amount)}</td><td>${e.note||''}</td></tr>`).join("");
  return `<div class="statement"><h3>Statement - ${cust.name}</h3>
    <p>Mobile: ${cust.mobile||'-'}</p>
    <p>Balance: ${fmt(cust.balance)}</p>
    <table style="width:100%;margin-top:8px"><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Note</th></tr></thead><tbody>${lines}</tbody></table>
    <p style="margin-top:8px"><button onclick="window.print()">Print / Save PDF</button></p></div>`;
}

function generateStatement(){
  const cid = $("#reportCustomerSelect").value;
  if(!cid) return alert("Select customer");
  const cust = data.customers.find(x=>x.id===cid);
  if(!cust) return alert("Customer not found");
  $("#statementArea").innerHTML = generateCustomerStatementHTML(cust);
}

// ---------- Export / Import ----------
function exportJSON(){
  const blob = new Blob([JSON.stringify(data,null,2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `oil_murugan_backup_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function importJSON(e){
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const parsed = JSON.parse(reader.result);
      if(confirm("Import will replace current data. Proceed?")){
        data = parsed;
        save(data); renderAll();
        alert("Imported");
      }
    }catch(err){ alert("Invalid JSON"); }
  };
  reader.readAsText(file);
}

// ---------- Render everything ----------
function renderAll(){
  save(data);
  renderCustomers();
  renderPurchases();
  renderExpenses();
  renderSources();
  renderDashboard();
}

// ---------- Start ----------
init();

// ---------- Expose save for console quick fixes ----------
window._om_data = data;
window._om_save = ()=>{ save(data); alert("saved"); renderAll(); };
