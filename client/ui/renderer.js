const $ = (id) => document.getElementById(id);
const SCAN_COUNT = 10;
const toDVPN = (u) =>
  (u / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 });

const log = (m) => {
  const el = $("log");
  if (el) {
    el.textContent += `${m}\n`;
    el.scrollTop = el.scrollHeight;
  }
  console.log(m);
};

if (!window.api) {
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div style="background:#ff8fa3;color:#06122b;padding:10px;
     text-align:center;font-weight:600">
     Preload failed to load — window.api is undefined.</div>`,
  );
  throw new Error("preload/contextBridge not available");
}

window.api.onLog(log);

function shortAddr(a) {
  return a.length > 18 ? `${a.slice(0, 10)}…${a.slice(-6)}` : a;
}

// ---- Fetch tiers from coordinator and populate dropdown ----
let TIER_DATA = {};
let FIXED_FEE = 0;

async function loadTiers() {
  try {
    const data = await window.api.fetchTiers();
    TIER_DATA = data.tiers;
    FIXED_FEE = data.fixedFee;
    const sel = $("tier");
    sel.innerHTML = "";
    for (const [key, cfg] of Object.entries(data.tiers)) {
      const dvpn = toDVPN(cfg.mixAmount);
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = `${dvpn} DVPN`;
      sel.appendChild(opt);
    }
    // Select the first tier by default.
    if (sel.options.length > 0) sel.options[0].selected = true;
    $("tierFee").value = `${toDVPN(data.fixedFee)} DVPN`;
    log(`Coordinator fee: ${toDVPN(data.fixedFee)} DVPN`);
  } catch (e) {
    log(`WARNING: could not fetch tiers from coordinator: ${e.message || e}`);
    // Fallback: keep "Loading…" placeholder.
  }
}

loadTiers();

async function refreshBalances() {
  $("totalBal").textContent = "…";
  try {
    const { rows, total } = await window.api.scan(SCAN_COUNT);
    $("totalBal").textContent = toDVPN(total);

    $("rows").innerHTML = "";
    for (const r of rows) {
      const div = document.createElement("div");
      div.className = "trow";
      const zero = r.amount === 0 ? "zero" : "";
      div.innerHTML = `
        <span class="idx">#${r.index}</span>
        <span class="addr mono">${shortAddr(r.address)}</span>
        <button class="copy-btn" title="Copy full address" data-addr="${r.address}">⧉</button>
        <span class="amt ${zero}">${toDVPN(r.amount)} DVPN</span>`;
      $("rows").appendChild(div);
    }
    log(`Scanned ${rows.length} addresses — total ${toDVPN(total)} DVPN`);
  } catch (e) {
    $("totalBal").textContent = "—";
    log(`ERROR scanning balances: ${e.message || e}`);
  }
}

$("btnNew").onclick = async () => {
  const { mnemonic } = await window.api.newWallet();
  $("seed").value = mnemonic;
  const { address } = await window.api.loadWallet(mnemonic);
  $("addr").textContent = `Input[0]: ${address}`;
  $("addr").classList.remove("hidden");
  log("New wallet created. Fund address #0, then refresh balances.");
  await refreshBalances();
};

$("btnLoad").onclick = async () => {
  const seed = $("seed").value.trim();
  if (!seed) return log("Enter a seed phrase first.");
  try {
    const { address } = await window.api.loadWallet(seed);
    $("addr").textContent = `Input[0]: ${address}`;
    $("addr").classList.remove("hidden");
    log("Seed loaded.");
    await refreshBalances();
  } catch (e) {
    log(`ERROR loading seed: ${e.message || e}`);
  }
};

$("btnRefresh").onclick = refreshBalances;

// Delegate copy-button clicks inside the addresses table.
$("rows").addEventListener("click", async (e) => {
  const btn = e.target.closest(".copy-btn");
  if (!btn) return;
  const addr = btn.dataset.addr;
  if (!addr) return;
  try {
    await navigator.clipboard.writeText(addr);
    // Brief visual feedback.
    const orig = btn.textContent;
    btn.textContent = "✓";
    btn.style.color = "var(--good)";
    setTimeout(() => {
      btn.textContent = orig;
      btn.style.color = "";
    }, 1200);
  } catch (err) {
    log(`Copy failed: ${err.message || err}`);
  }
});

$("btnMix").onclick = async () => {
  const btn = $("btnMix");
  btn.disabled = true;
  try {
    const tierKey = $("tier").value;
    const tierCfg = TIER_DATA[tierKey];
    const mixAmt = tierCfg ? toDVPN(tierCfg.mixAmount) : "?";
    const feeAmt = toDVPN(FIXED_FEE);
    const inIdx = Number($("inIdx").value);
    const outIdx = Number($("outIdx").value);
    log(
      `Starting mix: ${mixAmt} DVPN from #${inIdx} → #${outIdx} ` +
        `(coordinator fee ${feeAmt} DVPN)`,
    );
    const res = await window.api.runMix({
      tier: tierKey,
      inputIndex: inIdx,
      outputIndex: outIdx,
    });
    log(`DONE. Output ${res.outputAddress} — tx ${res.txHash}`);
    await refreshBalances();
  } catch (e) {
    log(`ERROR: ${e.message || e}`);
  } finally {
    btn.disabled = false;
  }
};

// Send-max toggles the amount field.
$("sendMax").onchange = () => {
  const on = $("sendMax").checked;
  $("sendAmt").disabled = on;
  if (on) $("sendAmt").value = "";
};

$("btnSend").onclick = async () => {
  const btn = $("btnSend");
  btn.disabled = true;
  try {
    const opts = {
      index: Number($("sendIdx").value),
      toAddress: $("sendTo").value.trim(),
      amountDVPN: $("sendAmt").value,
      sendMax: $("sendMax").checked,
    };
    log(
      `Sending from index #${opts.index} to ${shortAddr(opts.toAddress)}${
        opts.sendMax ? " (max)" : ` — ${opts.amountDVPN} DVPN`
      }...`,
    );
    const res = await window.api.send(opts);
    log(
      `SENT ${toDVPN(res.amount)} DVPN (fee ${toDVPN(res.fee)}) ` +
        `to ${res.to} — tx ${res.txHash}`,
    );
    await refreshBalances();
  } catch (e) {
    log(`SEND ERROR: ${e.message || e}`);
  } finally {
    btn.disabled = false;
  }
};
