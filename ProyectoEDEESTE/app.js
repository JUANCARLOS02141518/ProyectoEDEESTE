(function () {
  "use strict";

  var STORAGE_KEY = "ordenesBrigadas.v1";
  var TWO_HOURS = 2 * 60 * 60 * 1000;

  var BRIGADES = [
    "BL1P-5A1",
    "BL1P-5A2",
    "BL1P-5A3",
    "BL1P-5A4",
    "BL1P-5A5",
    "BL1P-5A6",
    "BL1P-5A7",
    "BL1P-5A8",
    "BL1P-5A9",
    "BL1P-5A10",
    "BL1P-5A11",
    "BL1P-5A12",
    "BL1P-5A13",
    "BL1P-5A14",
    "BL1P-5A15",
    "BL1P-5A16",
    "BL1P-5A17",
    "BL1P-5A18",
    "BL1P-5A19",
    "BL1UP-SP50",
    "BL1UP-SP51",
    "BL1UP-SP52",
    "BL1UP-SP53",
    "BL1UP-SP54",
    "BL1UP-SP55",
    "BL2UP-SP50",
    "BL2UP-SP51",
    "BL2UP-SP52",
    "BL2UP-SP53"
  ];

  var STATUSES = {
    waiting: { label: "En espera", className: "waiting" },
    generated: { label: "Generada", className: "generated" },
    dispatched: { label: "Despachada", className: "dispatched" },
    pending: { label: "Pendiente", className: "pending" }
  };

  var STATUS_ORDER = ["waiting", "generated", "pending", "dispatched"];

  var TYPES = [
    "Regular",
    "Inspeccion por barrido",
    "Anomalia automatica del sistema",
    "Otra"
  ];

  var orders = loadOrders();
  var selectedBrigade = "";

  var els = {
    summaryGrid: document.getElementById("summaryGrid"),
    orderForm: document.getElementById("orderForm"),
    nicInput: document.getElementById("nicInput"),
    brigadeSelect: document.getElementById("brigadeSelect"),
    typeSelect: document.getElementById("typeSelect"),
    noteInput: document.getElementById("noteInput"),
    formMessage: document.getElementById("formMessage"),
    searchInput: document.getElementById("searchInput"),
    filterBrigade: document.getElementById("filterBrigade"),
    filterStatus: document.getElementById("filterStatus"),
    filterType: document.getElementById("filterType"),
    filterDate: document.getElementById("filterDate"),
    todayButton: document.getElementById("todayButton"),
    toggleOrderPanel: document.getElementById("toggleOrderPanel"),
    newOrderDialog: document.getElementById("newOrderDialog"),
    closeNewOrderDialogButton: document.getElementById("closeNewOrderDialogButton"),

    toggleFilterPanel: document.getElementById("toggleFilterPanel"),
    filterDialog: document.getElementById("filterDialog"),
    closeFilterDialogButton: document.getElementById("closeFilterDialogButton"),

    orderPanel: document.getElementById("orderPanel"),
    filterPanel: document.getElementById("filterPanel"),

    clearFiltersButton: document.getElementById("clearFiltersButton"),
    exportPdfButton: document.getElementById("exportPdfButton"),
    orderCountLabel: document.getElementById("orderCountLabel"),
    brigadeCountLabel: document.getElementById("brigadeCountLabel"),
    brigadeGrid: document.getElementById("brigadeGrid"),
    ordersBody: document.getElementById("ordersBody"),
    emptyState: document.getElementById("emptyState"),
    brigadeDialog: document.getElementById("brigadeDialog"),
    dialogTitle: document.getElementById("dialogTitle"),
    dialogBody: document.getElementById("dialogBody"),
    closeDialogButton: document.getElementById("closeDialogButton"),
    printReport: document.getElementById("printReport")
  };

  function init() {
    fillSelects();
    bindEvents();
    expireGeneratedOrders();
    render();

    setInterval(function () {
      if (expireGeneratedOrders()) {
        render();
      }
    }, 60000);
  }

  function fillSelects() {
    els.brigadeSelect.innerHTML = BRIGADES.map(optionMarkup).join("");
    els.filterBrigade.innerHTML = '<option value="">Todas</option>' + BRIGADES.map(optionMarkup).join("");
    els.filterStatus.innerHTML =
      '<option value="">Todos</option>' +
      STATUS_ORDER.map(function (key) {
        return '<option value="' + key + '">' + STATUSES[key].label + "</option>";
      }).join("");
    els.typeSelect.innerHTML = TYPES.map(optionMarkup).join("");
    els.filterType.innerHTML = '<option value="">Todos</option>' + TYPES.map(optionMarkup).join("");
  }

  function bindEvents() {
    els.orderForm.addEventListener("submit", handleOrderSubmit);

    // Modal de “Nueva orden”
    els.toggleOrderPanel.addEventListener("click", openNewOrderDialog);
    els.closeNewOrderDialogButton.addEventListener("click", closeNewOrderDialog);
    els.newOrderDialog.addEventListener("click", function (e) {
      // Cerrar si se clickea el backdrop (en algunos navegadores dialog no hace esto solo)
      if (e.target === els.newOrderDialog) {
        closeNewOrderDialog();
      }
    });

    els.searchInput.addEventListener("input", render);
    els.filterBrigade.addEventListener("change", render);
    els.filterStatus.addEventListener("change", render);
    els.filterType.addEventListener("change", render);
    els.filterDate.addEventListener("change", render);
    els.todayButton.addEventListener("click", function () {
      els.filterDate.value = getDateKey(new Date());
      render();
    });

    els.toggleFilterPanel.addEventListener("click", openFilterDialog);
    els.closeFilterDialogButton.addEventListener("click", closeFilterDialog);
    els.filterDialog.addEventListener("click", function (e) {
      if (e.target === els.filterDialog) {
        closeFilterDialog();
      }
    });

    els.clearFiltersButton.addEventListener("click", clearFilters);
    els.exportPdfButton.addEventListener("click", exportDailyPdf);
    els.brigadeGrid.addEventListener("click", handleBrigadeClick);
    els.ordersBody.addEventListener("click", handleOrderAction);
    els.dialogBody.addEventListener("click", handleOrderAction);
    els.closeDialogButton.addEventListener("click", function () {
      els.brigadeDialog.close();
    });
    window.addEventListener("afterprint", function () {
      document.body.classList.remove("printing");
      els.printReport.setAttribute("aria-hidden", "true");
    });
  }

  function handleOrderSubmit(event) {
    event.preventDefault();

    var nic = normalizeNic(els.nicInput.value);
    var brigade = els.brigadeSelect.value;
    var type = els.typeSelect.value;
    var note = els.noteInput.value.trim();

    if (!nic) {
      showMessage("Debes escribir un NIC.", "error");
      return;
    }

    if (orders.some(function (order) { return order.nic === nic; })) {
      showMessage("Ese NIC ya existe. Revisa el historial antes de registrarlo otra vez.", "error");
      return;
    }

    var now = new Date().toISOString();
    var order = {
      id: makeId(),
      nic: nic,
      brigade: brigade,
      type: type,
      status: "waiting",
      createdAt: now,
      generatedAt: "",
      pendingAt: "",
      dispatchedAt: "",
      note: note,
      history: [
        {
          status: "waiting",
          at: now,
          label: "Orden registrada en espera"
        }
      ]
    };

    orders.unshift(order);
    saveOrders();
    els.nicInput.value = "";
    els.noteInput.value = "";
    showMessage("Orden " + nic + " agregada en espera para " + brigade + ".", "ok");
    render();
  }

  function handleBrigadeClick(event) {
    var button = event.target.closest("button[data-brigade-action]");
    if (!button) {
      return;
    }

    var brigade = button.getAttribute("data-brigade");
    var action = button.getAttribute("data-brigade-action");

    if (action === "add") {
      els.brigadeSelect.value = brigade;
      els.nicInput.focus();
      els.orderForm.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    if (action === "detail") {
      openBrigadeDialog(brigade);
    }
  }

  function handleOrderAction(event) {
    var button = event.target.closest("button[data-order-action]");
    if (!button) {
      return;
    }

    var order = findOrder(button.getAttribute("data-id"));
    if (!order) {
      return;
    }

    var action = button.getAttribute("data-order-action");

    if (action === "generate") {
      moveToGenerated(order);
    }

    if (action === "dispatch") {
      moveToDispatched(order);
    }

    if (action === "delete") {
      deleteOrder(order);
      return;
    }

    saveOrders();
    render();

    if (selectedBrigade && els.brigadeDialog.open) {
      openBrigadeDialog(selectedBrigade, true);
    }
  }

  function moveToGenerated(order) {
    if (order.status !== "waiting") {
      return;
    }

    var now = new Date().toISOString();
    order.status = "generated";
    order.generatedAt = now;
    order.pendingAt = "";
    addHistory(order, "generated", now, "Orden marcada como generada");
  }

  function moveToDispatched(order) {
    if (order.status !== "generated" && order.status !== "pending") {
      return;
    }

    var now = new Date().toISOString();
    order.status = "dispatched";
    order.dispatchedAt = now;
    addHistory(order, "dispatched", now, "Orden marcada como despachada");
  }

  function deleteOrder(order) {
    var ok = window.confirm("Quieres eliminar el NIC " + order.nic + "? Esta accion solo corrige el registro local.");
    if (!ok) {
      return;
    }

    orders = orders.filter(function (item) {
      return item.id !== order.id;
    });
    saveOrders();
    render();

    if (selectedBrigade && els.brigadeDialog.open) {
      openBrigadeDialog(selectedBrigade, true);
    }
  }

  function expireGeneratedOrders() {
    var nowTime = Date.now();
    var changed = false;

    orders.forEach(function (order) {
      if (order.status !== "generated" || !order.generatedAt) {
        return;
      }

      var generatedTime = new Date(order.generatedAt).getTime();
      if (Number.isNaN(generatedTime)) {
        return;
      }

      if (nowTime - generatedTime >= TWO_HOURS) {
        var now = new Date().toISOString();
        order.status = "pending";
        order.pendingAt = now;
        addHistory(order, "pending", now, "Marcada pendiente automaticamente por superar 2 horas");
        changed = true;
      }
    });

    if (changed) {
      saveOrders();
    }

    return changed;
  }

  function render() {
    expireGeneratedOrders();
    renderSummary();
    renderBrigades();
    renderOrdersTable();
  }

  function renderSummary() {
    var today = getDateKey(new Date());
    var currentCounts = countByStatus(orders);
    var createdToday = orders.filter(function (order) {
      return getDateKey(order.createdAt) === today;
    }).length;
    var dispatchedToday = orders.filter(function (order) {
      return order.dispatchedAt && getDateKey(order.dispatchedAt) === today;
    }).length;

    var cards = [
      { label: "En espera", value: currentCounts.waiting, className: "waiting" },
      { label: "Generadas", value: currentCounts.generated, className: "generated" },
      { label: "Despachadas", value: currentCounts.dispatched, className: "dispatched" },
      { label: "Pendientes", value: currentCounts.pending, className: "pending" },
      { label: "Creadas hoy", value: createdToday, className: "" },
      { label: "Despachadas hoy", value: dispatchedToday, className: "dispatched" }
    ];

    els.summaryGrid.innerHTML = cards.map(function (card) {
      return (
        '<article class="summary-card ' + card.className + '">' +
        "<span>" + card.label + "</span>" +
        "<strong>" + card.value + "</strong>" +
        "</article>"
      );
    }).join("");
  }

  function renderBrigades() {
    var today = getDateKey(new Date());
    els.brigadeCountLabel.textContent = BRIGADES.length + " brigadas precargadas";
    els.brigadeGrid.innerHTML = BRIGADES.map(function (brigade) {
      var brigadeOrders = orders.filter(function (order) {
        return order.brigade === brigade;
      });
      var counts = countByStatus(brigadeOrders);
      var todayTotal = brigadeOrders.filter(function (order) {
        return getDateKey(order.createdAt) === today;
      }).length;
      var todayDispatched = brigadeOrders.filter(function (order) {
        return order.dispatchedAt && getDateKey(order.dispatchedAt) === today;
      }).length;
      var active = brigadeOrders
        .filter(function (order) { return order.status !== "dispatched"; })
        .sort(compareOperationalPriority)
        .slice(0, 4);

      return (
        '<article class="brigade-card">' +
        '<div class="brigade-card-head">' +
        "<h3 class=\"brigade-name\">" + brigade + "</h3>" +
        '<div class="daily-total">Hoy: ' + todayTotal + "<br>Despachadas: " + todayDispatched + "</div>" +
        "</div>" +
        '<div class="status-counts">' +
        statusCountMarkup("waiting", counts.waiting) +
        statusCountMarkup("generated", counts.generated) +
        statusCountMarkup("dispatched", counts.dispatched) +
        statusCountMarkup("pending", counts.pending) +
        "</div>" +
        activeListMarkup(active) +
        '<div class="card-actions">' +
        '<button class="button primary small" type="button" data-brigade-action="add" data-brigade="' + brigade + '">Agregar</button>' +
        '<button class="button secondary small" type="button" data-brigade-action="detail" data-brigade="' + brigade + '">Detalle</button>' +
        "</div>" +
        "</article>"
      );
    }).join("");
  }

  function renderOrdersTable() {
    var filtered = getFilteredOrders();
    els.orderCountLabel.textContent = filtered.length + " ordenes encontradas";
    els.emptyState.hidden = filtered.length > 0;

    els.ordersBody.innerHTML = filtered.map(orderRowMarkup).join("");
  }

  function openBrigadeDialog(brigade, keepOpen) {
    selectedBrigade = brigade;
    var brigadeOrders = orders
      .filter(function (order) { return order.brigade === brigade; })
      .sort(compareOperationalPriority);
    var counts = countByStatus(brigadeOrders);

    els.dialogTitle.textContent = brigade;
    els.dialogBody.innerHTML =
      '<div class="dialog-summary">' +
      statusCountMarkup("waiting", counts.waiting) +
      statusCountMarkup("generated", counts.generated) +
      statusCountMarkup("dispatched", counts.dispatched) +
      statusCountMarkup("pending", counts.pending) +
      "</div>" +
      '<div class="table-wrap">' +
      "<table>" +
      "<thead><tr><th>NIC</th><th>Tipo</th><th>Estado</th><th>Creada</th><th>Generada</th><th>Despachada</th><th>Acciones</th></tr></thead>" +
      "<tbody>" +
      (brigadeOrders.length
        ? brigadeOrders.map(orderRowMarkupCompact).join("")
        : '<tr><td colspan="7">Esta brigada no tiene ordenes registradas.</td></tr>') +
      "</tbody></table></div>";

    if (!keepOpen) {
      els.brigadeDialog.showModal();
    }
  }

  function getFilteredOrders() {
    var search = normalizeNic(els.searchInput.value);
    var brigade = els.filterBrigade.value;
    var status = els.filterStatus.value;
    var type = els.filterType.value;
    var date = els.filterDate.value;

    return orders
      .filter(function (order) {
        if (search && order.nic.indexOf(search) === -1) {
          return false;
        }
        if (brigade && order.brigade !== brigade) {
          return false;
        }
        if (status && order.status !== status) {
          return false;
        }
        if (type && order.type !== type) {
          return false;
        }
        if (date && !orderHasDate(order, date)) {
          return false;
        }
        return true;
      })
      .sort(compareOperationalPriority);
  }

  function orderHasDate(order, date) {
    return [
      order.createdAt,
      order.generatedAt,
      order.pendingAt,
      order.dispatchedAt
    ].some(function (value) {
      return value && getDateKey(value) === date;
    });
  }

  function orderRowMarkup(order) {
    return (
      "<tr>" +
      '<td class="nic-cell">' + escapeHtml(order.nic) + noteMarkup(order.note) + "</td>" +
      "<td>" + escapeHtml(order.brigade) + "</td>" +
      "<td>" + escapeHtml(order.type) + "</td>" +
      "<td>" + statePillMarkup(order.status) + overdueMarkup(order) + "</td>" +
      "<td>" + formatDateTime(order.createdAt) + "</td>" +
      "<td>" + formatDateTime(order.generatedAt) + "</td>" +
      "<td>" + formatDateTime(order.dispatchedAt) + "</td>" +
      "<td>" + actionButtonsMarkup(order) + "</td>" +
      "</tr>"
    );
  }

  function orderRowMarkupCompact(order) {
    return (
      "<tr>" +
      '<td class="nic-cell">' + escapeHtml(order.nic) + noteMarkup(order.note) + "</td>" +
      "<td>" + escapeHtml(order.type) + "</td>" +
      "<td>" + statePillMarkup(order.status) + overdueMarkup(order) + "</td>" +
      "<td>" + formatDateTime(order.createdAt) + "</td>" +
      "<td>" + formatDateTime(order.generatedAt) + "</td>" +
      "<td>" + formatDateTime(order.dispatchedAt) + "</td>" +
      "<td>" + actionButtonsMarkup(order) + "</td>" +
      "</tr>"
    );
  }

  function actionButtonsMarkup(order) {
    var buttons = [];
    if (order.status === "waiting") {
      buttons.push('<button class="button warning small" type="button" data-order-action="generate" data-id="' + order.id + '">Generar</button>');
    }
    if (order.status === "generated" || order.status === "pending") {
      buttons.push('<button class="button success small" type="button" data-order-action="dispatch" data-id="' + order.id + '">Despachar</button>');
    }
    buttons.push('<button class="button danger small" type="button" data-order-action="delete" data-id="' + order.id + '">Eliminar</button>');
    return '<div class="row-actions">' + buttons.join("") + "</div>";
  }

  function statusCountMarkup(status, count) {
    return (
      '<div class="status-count ' + STATUSES[status].className + '">' +
      "<strong>" + count + "</strong>" +
      "<span>" + STATUSES[status].label + "</span>" +
      "</div>"
    );
  }

  function activeListMarkup(activeOrders) {
    if (!activeOrders.length) {
      return '<div class="empty-mini">Sin ordenes activas.</div>';
    }

    return (
      '<ul class="active-list">' +
      activeOrders.map(function (order) {
        return (
          "<li>" +
          '<span class="nic">' + escapeHtml(order.nic) + "</span>" +
          '<span class="time">' + STATUSES[order.status].label + "</span>" +
          "</li>"
        );
      }).join("") +
      "</ul>"
    );
  }

  function statePillMarkup(status) {
    return '<span class="state-pill ' + STATUSES[status].className + '">' + STATUSES[status].label + "</span>";
  }

  function noteMarkup(note) {
    if (!note) {
      return "";
    }
    return '<span class="note-line">' + escapeHtml(note) + "</span>";
  }

  function overdueMarkup(order) {
    if (order.status !== "generated" || !order.generatedAt) {
      return "";
    }

    var remaining = TWO_HOURS - (Date.now() - new Date(order.generatedAt).getTime());
    if (remaining <= 0) {
      return "";
    }

    return '<span class="note-line">Pendiente en ' + formatDuration(remaining) + "</span>";
  }

  function exportDailyPdf() {
    expireGeneratedOrders();
    var date = els.filterDate.value || getDateKey(new Date());
    var dispatched = orders
      .filter(function (order) {
        return order.dispatchedAt && getDateKey(order.dispatchedAt) === date;
      })
      .sort(function (a, b) {
        return new Date(a.dispatchedAt).getTime() - new Date(b.dispatchedAt).getTime();
      });

    var byBrigade = countBy(dispatched, "brigade");
    var byType = countBy(dispatched, "type");
    var generatedAt = new Date();

    els.printReport.innerHTML =
      "<h1>Reporte diario de ordenes despachadas</h1>" +
      '<div class="report-meta">' +
      '<div class="report-box"><strong>Fecha del reporte</strong><br>' + formatDateOnly(date) + "</div>" +
      '<div class="report-box"><strong>Hora de generacion</strong><br>' + formatTime(generatedAt.toISOString()) + "</div>" +
      '<div class="report-box"><strong>Total despachadas</strong><br>' + dispatched.length + "</div>" +
      "</div>" +
      "<h2>Conteo por brigada</h2>" +
      reportCountTable(["Brigada", "Despachadas"], byBrigade, BRIGADES) +
      "<h2>Conteo por tipo de orden</h2>" +
      reportCountTable(["Tipo", "Despachadas"], byType, TYPES) +
      "<h2>Listado de ordenes despachadas</h2>" +
      reportOrdersTable(dispatched) +
      '<p><strong>Total final:</strong> ' + dispatched.length + " ordenes despachadas.</p>";

    els.printReport.setAttribute("aria-hidden", "false");
    document.body.classList.add("printing");

    setTimeout(function () {
      window.print();
    }, 120);
  }

  function reportCountTable(headers, counts, preferredOrder) {
    var keys = preferredOrder.filter(function (key) {
      return counts[key];
    });

    Object.keys(counts).forEach(function (key) {
      if (keys.indexOf(key) === -1) {
        keys.push(key);
      }
    });

    if (!keys.length) {
      return "<p>No hay datos para esta fecha.</p>";
    }

    return (
      "<table><thead><tr><th>" + headers[0] + "</th><th>" + headers[1] + "</th></tr></thead><tbody>" +
      keys.map(function (key) {
        return "<tr><td>" + escapeHtml(key) + "</td><td>" + counts[key] + "</td></tr>";
      }).join("") +
      "</tbody></table>"
    );
  }

  function reportOrdersTable(dispatched) {
    if (!dispatched.length) {
      return "<p>No hay ordenes despachadas en esta fecha.</p>";
    }

    return (
      "<table><thead><tr><th>NIC</th><th>Brigada</th><th>Tipo</th><th>Fecha</th><th>Hora de despacho</th></tr></thead><tbody>" +
      dispatched.map(function (order) {
        return (
          "<tr>" +
          "<td>" + escapeHtml(order.nic) + "</td>" +
          "<td>" + escapeHtml(order.brigade) + "</td>" +
          "<td>" + escapeHtml(order.type) + "</td>" +
          "<td>" + formatDateOnly(getDateKey(order.dispatchedAt)) + "</td>" +
          "<td>" + formatTime(order.dispatchedAt) + "</td>" +
          "</tr>"
        );
      }).join("") +
      "</tbody></table>"
    );
  }

  function clearFilters() {
    els.searchInput.value = "";
    els.filterBrigade.value = "";
    els.filterStatus.value = "";
    els.filterType.value = "";
    els.filterDate.value = "";
    render();
  }

  function openNewOrderDialog() {
    if (!els.newOrderDialog) return;

    // aseguramos selects cargados
    fillSelects();

    els.newOrderDialog.showModal();
    if (els.toggleOrderPanel) {
      els.toggleOrderPanel.setAttribute("aria-expanded", "true");
    }

    setTimeout(function () {
      if (els.nicInput) {
        els.nicInput.focus();
      }
    }, 0);
  }

  function closeNewOrderDialog() {
    if (!els.newOrderDialog) return;
    if (els.newOrderDialog.open) {
      els.newOrderDialog.close();
    }
    if (els.toggleOrderPanel) {
      els.toggleOrderPanel.setAttribute("aria-expanded", "false");
    }
  }

  function openFilterDialog() {
    if (!els.filterDialog) return;
    // ensures selects loaded
    fillSelects();
    els.filterDialog.showModal();
    if (els.toggleFilterPanel) {
      els.toggleFilterPanel.setAttribute("aria-expanded", "true");
    }
  }

  function closeFilterDialog() {
    if (!els.filterDialog) return;
    if (els.filterDialog.open) {
      els.filterDialog.close();
    }
    if (els.toggleFilterPanel) {
      els.toggleFilterPanel.setAttribute("aria-expanded", "false");
    }
  }

  function togglePanel(panel, button) {

    if (!panel) {
      return;
    }
    var collapsed = panel.classList.toggle("collapsed");
    if (button) {
      button.setAttribute("aria-expanded", String(!collapsed));
    }
    if (!collapsed) {
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
      var focusField = panel === els.orderPanel ? els.nicInput : els.searchInput;
      if (focusField) {
        focusField.focus();
      }
    }
  }


  function countByStatus(list) {
    return list.reduce(function (acc, order) {
      acc[order.status] += 1;
      return acc;
    }, { waiting: 0, generated: 0, dispatched: 0, pending: 0 });
  }

  function countBy(list, key) {
    return list.reduce(function (acc, item) {
      var value = item[key] || "Sin dato";
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});
  }

  function compareOperationalPriority(a, b) {
    var priority = { pending: 0, generated: 1, waiting: 2, dispatched: 3 };
    var statusDiff = priority[a.status] - priority[b.status];
    if (statusDiff !== 0) {
      return statusDiff;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }

  function findOrder(id) {
    return orders.find(function (order) {
      return order.id === id;
    });
  }

  function addHistory(order, status, at, label) {
    if (!Array.isArray(order.history)) {
      order.history = [];
    }
    order.history.push({ status: status, at: at, label: label });
  }

  function loadOrders() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  function saveOrders() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  }

  function showMessage(message, type) {
    els.formMessage.textContent = message;
    els.formMessage.className = "form-message " + type;
  }

  function optionMarkup(value) {
    return '<option value="' + escapeHtml(value) + '">' + escapeHtml(value) + "</option>";
  }

  function normalizeNic(value) {
    return String(value || "").trim().toUpperCase();
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function getDateKey(value) {
    var date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    return date.getFullYear() + "-" + month + "-" + day;
  }

  function formatDateTime(value) {
    if (!value) {
      return "-";
    }
    return new Intl.DateTimeFormat("es-DO", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(new Date(value));
  }

  function formatDateOnly(dateKey) {
    if (!dateKey) {
      return "-";
    }
    var parts = dateKey.split("-");
    if (parts.length !== 3) {
      return dateKey;
    }
    return parts[2] + "/" + parts[1] + "/" + parts[0];
  }

  function formatTime(value) {
    if (!value) {
      return "-";
    }
    return new Intl.DateTimeFormat("es-DO", {
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  }

  function formatDuration(milliseconds) {
    var totalMinutes = Math.max(0, Math.ceil(milliseconds / 60000));
    var hours = Math.floor(totalMinutes / 60);
    var minutes = totalMinutes % 60;
    if (hours > 0) {
      return hours + "h " + minutes + "m";
    }
    return minutes + "m";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  init();
})();

