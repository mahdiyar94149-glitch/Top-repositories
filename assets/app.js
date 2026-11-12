/**
 * Maison Vespera — Main Storefront & Telegram Concierge Controller
 * Pure Vanilla JavaScript — Ready for direct deployment on Cloudflare Pages.
 */
(function () {
  'use strict';

  var STORAGE_KEY_CART = 'maison_vespera_cart_v1';
  var STORAGE_KEY_CLIENT = 'maison_vespera_client_v1';

  var Logic = window.VesperaLogic;
  var Catalog = window.VESPERA_CATALOG || [];

  var state = {
    cart: loadCart(),
    client: loadClientDetails(),
    filterCategory: 'all',
    searchQuery: '',
    sortBy: 'featured',
    activeQuickViewProduct: null,
    lastConfirmedOrder: null
  };

  function loadCart() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY_CART);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveCart() {
    try {
      localStorage.setItem(STORAGE_KEY_CART, JSON.stringify(state.cart));
    } catch (e) {
      // Ignore storage quota errors in restricted contexts
    }
  }

  function loadClientDetails() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY_CLIENT);
      if (!raw) {
        return {
          fullName: '',
          telegramHandle: '',
          cityCountry: '',
          paymentMethod: 'Wire Transfer / Concierge Invoice',
          notes: ''
        };
      }
      return JSON.parse(raw);
    } catch (e) {
      return {
        fullName: '',
        telegramHandle: '',
        cityCountry: '',
        paymentMethod: 'Wire Transfer / Concierge Invoice',
        notes: ''
      };
    }
  }

  function saveClientDetails() {
    try {
      localStorage.setItem(STORAGE_KEY_CLIENT, JSON.stringify(state.client));
    } catch (e) {
      // Ignore storage errors
    }
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function findProductById(productId) {
    for (var i = 0; i < Catalog.length; i++) {
      if (Catalog[i].id === productId) return Catalog[i];
    }
    return null;
  }

  /* ========================================================================
     PRODUCT CARD RENDERING
     ======================================================================== */
  function renderProductCardHtml(product) {
    return (
      '<article class="product-card" data-product-id="' + escapeHtml(product.id) + '">' +
        '<div class="product-media">' +
          '<img src="' + escapeHtml(product.image) + '" alt="' + escapeHtml(product.name) + '" loading="lazy" referrerpolicy="no-referrer" />' +
        '</div>' +
        '<div class="product-body">' +
          '<div class="product-meta-line">' +
            '<span>' + escapeHtml(product.category) + '</span>' +
            '<span aria-hidden="true">·</span>' +
            '<span>' + escapeHtml(product.edition) + '</span>' +
          '</div>' +
          '<h3 class="product-title">' + escapeHtml(product.name) + '</h3>' +
          '<p class="product-desc">' + escapeHtml(product.subtitle) + '</p>' +
          '<div class="product-footer">' +
            '<span class="product-price tabular-nums">' + Logic.formatCurrency(product.price) + '</span>' +
            '<div class="product-actions">' +
              '<button type="button" class="btn-ghost js-quickview-btn" data-product-id="' + escapeHtml(product.id) + '" aria-label="Inspect ' + escapeHtml(product.name) + '">Inspect</button>' +
              '<button type="button" class="btn-card-add js-add-to-bag" data-product-id="' + escapeHtml(product.id) + '" aria-label="Add ' + escapeHtml(product.name) + ' to Telegram Bag">Add to Bag</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  function renderFeaturedGrid() {
    var container = document.getElementById('featured-products-grid');
    if (!container) return;
    var featuredList = Catalog.filter(function (p) { return p.featured; }).slice(0, 6);
    container.innerHTML = featuredList.map(renderProductCardHtml).join('');
  }

  function renderCatalogGrid() {
    var container = document.getElementById('catalog-products-grid');
    if (!container) return;

    var filtered = Logic.filterAndSortProducts(Catalog, {
      category: state.filterCategory,
      query: state.searchQuery,
      sortBy: state.sortBy
    });

    var countEl = document.getElementById('catalog-results-count');
    if (countEl) {
      countEl.textContent = filtered.length + (filtered.length === 1 ? ' Edition Available' : ' Editions Available');
    }

    if (filtered.length === 0) {
      container.innerHTML = (
        '<div style="grid-column: 1 / -1; padding: 3.5rem 2rem; text-align: center; background: var(--bg-elevated); border: 1px solid var(--border-hairline); border-radius: var(--radius-lg);">' +
          '<h3 class="section-title" style="font-size: 1.5rem; margin-bottom: 0.5rem;">No Matching Editions Found</h3>' +
          '<p style="color: var(--text-secondary); margin-bottom: 1.25rem;">No archival or current pieces match your filter criteria.</p>' +
          '<button type="button" class="btn-secondary" id="reset-catalog-filters-btn">Reset Catalog Filters</button>' +
        '</div>'
      );
      var resetBtn = document.getElementById('reset-catalog-filters-btn');
      if (resetBtn) {
        resetBtn.addEventListener('click', function () {
          state.filterCategory = 'all';
          state.searchQuery = '';
          state.sortBy = 'featured';
          var searchInput = document.getElementById('catalog-search-input');
          if (searchInput) searchInput.value = '';
          var sortSelect = document.getElementById('catalog-sort-select');
          if (sortSelect) sortSelect.value = 'featured';
          syncFilterButtons();
          renderCatalogGrid();
        });
      }
      return;
    }

    container.innerHTML = filtered.map(renderProductCardHtml).join('');
  }

  function syncFilterButtons() {
    var buttons = document.querySelectorAll('.js-category-filter');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var cat = btn.getAttribute('data-category') || 'all';
      if (cat.toLowerCase() === state.filterCategory.toLowerCase()) {
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
      }
    }
  }

  /* ========================================================================
     QUICK VIEW SPECIFICATION MODAL
     ======================================================================== */
  function openQuickView(productId) {
    var product = findProductById(productId);
    if (!product) return;
    state.activeQuickViewProduct = product;

    var modal = document.getElementById('quickview-modal');
    var backdrop = document.getElementById('modal-backdrop');
    if (!modal || !backdrop) return;

    var imgEl = document.getElementById('qv-image');
    var metaEl = document.getElementById('qv-meta');
    var titleEl = document.getElementById('qv-title');
    var priceEl = document.getElementById('qv-price');
    var descEl = document.getElementById('qv-description');
    var matEl = document.getElementById('qv-materials');
    var dimEl = document.getElementById('qv-dimensions');
    var origEl = document.getElementById('qv-origin');
    var addBtn = document.getElementById('qv-add-btn');

    if (imgEl) {
      imgEl.src = product.image;
      imgEl.alt = product.name;
    }
    if (metaEl) metaEl.textContent = product.category + ' · ' + product.edition + ' · ' + product.sku;
    if (titleEl) titleEl.textContent = product.name;
    if (priceEl) priceEl.textContent = Logic.formatCurrency(product.price);
    if (descEl) descEl.textContent = product.description;
    if (matEl) matEl.textContent = product.materials;
    if (dimEl) dimEl.textContent = product.dimensions;
    if (origEl) origEl.textContent = product.origin + ' · ' + product.availability;
    if (addBtn) addBtn.setAttribute('data-product-id', product.id);

    backdrop.classList.add('open');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeQuickView() {
    var modal = document.getElementById('quickview-modal');
    var drawer = document.getElementById('bag-drawer');
    var backdrop = document.getElementById('modal-backdrop');
    if (modal) {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
    if (backdrop && (!drawer || !drawer.classList.contains('open'))) {
      backdrop.classList.remove('open');
    }
  }

  /* ========================================================================
     TELEGRAM ORDER BAG DRAWER & LIVE DISPATCH GENERATOR
     ======================================================================== */
  function openBagDrawer() {
    closeQuickView();
    var drawer = document.getElementById('bag-drawer');
    var backdrop = document.getElementById('modal-backdrop');
    if (!drawer || !backdrop) return;
    renderBagDrawer();
    backdrop.classList.add('open');
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
  }

  function closeBagDrawer() {
    var drawer = document.getElementById('bag-drawer');
    var backdrop = document.getElementById('modal-backdrop');
    if (drawer) {
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
    }
    if (backdrop) {
      backdrop.classList.remove('open');
    }
  }

  function updateHeaderBagBadge() {
    var summary = Logic.calculateCartSummary(state.cart);
    var badges = document.querySelectorAll('.js-bag-count');
    for (var i = 0; i < badges.length; i++) {
      badges[i].textContent = String(summary.itemCount);
    }
  }

  function readClientInputsFromDOM() {
    var nameInput = document.getElementById('order-client-name');
    var tgInput = document.getElementById('order-client-telegram');
    var cityInput = document.getElementById('order-client-city');
    var payInput = document.getElementById('order-client-payment');
    var notesInput = document.getElementById('order-client-notes');

    if (nameInput) state.client.fullName = nameInput.value;
    if (tgInput) state.client.telegramHandle = tgInput.value;
    if (cityInput) state.client.cityCountry = cityInput.value;
    if (payInput) state.client.paymentMethod = payInput.value;
    if (notesInput) state.client.notes = notesInput.value;
    saveClientDetails();
  }

  function updateTelegramLivePreview() {
    var previewEl = document.getElementById('telegram-live-preview');
    var directLinkEl = document.getElementById('telegram-direct-dispatch-link');
    if (!previewEl) return;

    var ref = state.lastConfirmedOrder ? state.lastConfirmedOrder.orderRef : 'MV-PREVIEW';
    var payload = Logic.buildTelegramOrderPayload(state.cart, state.client, ref);
    previewEl.textContent = payload.messageText;

    if (directLinkEl) {
      directLinkEl.setAttribute('href', payload.telegramUrl);
    }
  }

  function renderBagDrawer() {
    updateHeaderBagBadge();
    var itemsContainer = document.getElementById('bag-items-container');
    var summaryContainer = document.getElementById('bag-summary-container');
    var courierNoteEl = document.getElementById('bag-courier-note');
    if (!itemsContainer || !summaryContainer) return;

    var summary = Logic.calculateCartSummary(state.cart);

    if (courierNoteEl) {
      if (summary.subtotal === 0) {
        courierNoteEl.textContent = 'Complimentary insured armored courier on allocations above $1,500.';
      } else if (summary.complimentaryCourierUnlocked) {
        courierNoteEl.textContent = 'Complimentary Geneva-to-Door Insured Courier unlocked for this allocation.';
      } else {
        courierNoteEl.textContent = 'Add ' + Logic.formatCurrency(summary.amountToFreeCourier) + ' more to unlock complimentary insured courier.';
      }
    }

    if (state.cart.length === 0) {
      itemsContainer.innerHTML = (
        '<div style="padding: 2rem 1rem; text-align: center; border: 1px dashed var(--border-strong); border-radius: var(--radius-md);">' +
          '<p style="color: var(--text-primary); font-weight: 500; margin-bottom: 0.35rem;">Your Telegram Order Dossier is Empty</p>' +
          '<p style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 1rem;">Select any timepiece, objet d\'art, or extrait to prepare a direct concierge allocation.</p>' +
        '</div>'
      );
    } else {
      itemsContainer.innerHTML = state.cart.map(function (item) {
        var lineTotal = item.price * item.quantity;
        return (
          '<div class="bag-item" data-bag-item-id="' + escapeHtml(item.id) + '">' +
            '<div class="bag-item-thumb">' +
              '<img src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(item.name) + '" referrerpolicy="no-referrer" />' +
            '</div>' +
            '<div>' +
              '<div class="bag-item-title">' + escapeHtml(item.name) + '</div>' +
              '<div class="bag-item-meta">' + escapeHtml(item.edition) + ' · <span class="tabular-nums">' + Logic.formatCurrency(lineTotal) + '</span></div>' +
              '<button type="button" class="js-remove-bag-item" data-product-id="' + escapeHtml(item.id) + '" style="font-size: 0.74rem; color: var(--text-muted); margin-top: 0.25rem; text-decoration: underline;">Remove</button>' +
            '</div>' +
            '<div class="qty-stepper">' +
              '<button type="button" class="qty-btn js-qty-step" data-product-id="' + escapeHtml(item.id) + '" data-delta="-1" aria-label="Decrease quantity of ' + escapeHtml(item.name) + '">−</button>' +
              '<span class="qty-value tabular-nums">' + item.quantity + '</span>' +
              '<button type="button" class="qty-btn js-qty-step" data-product-id="' + escapeHtml(item.id) + '" data-delta="1" aria-label="Increase quantity of ' + escapeHtml(item.name) + '">+</button>' +
            '</div>' +
          '</div>'
        );
      }).join('');
    }

    summaryContainer.innerHTML = (
      '<div class="summary-row">' +
        '<span>Subtotal (' + summary.itemCount + (summary.itemCount === 1 ? ' piece' : ' pieces') + ')</span>' +
        '<span class="tabular-nums">' + Logic.formatCurrency(summary.subtotal) + '</span>' +
      '</div>' +
      '<div class="summary-row">' +
        '<span>Insured Armored Courier</span>' +
        '<span class="tabular-nums">' + (summary.shipping === 0 ? (summary.subtotal > 0 ? 'Complimentary' : '$0') : Logic.formatCurrency(summary.shipping)) + '</span>' +
      '</div>' +
      '<div class="summary-row total">' +
        '<span>Total Allocation</span>' +
        '<span class="tabular-nums">' + Logic.formatCurrency(summary.total) + '</span>' +
      '</div>'
    );

    // Sync form inputs with saved client state
    var nameInput = document.getElementById('order-client-name');
    var tgInput = document.getElementById('order-client-telegram');
    var cityInput = document.getElementById('order-client-city');
    var payInput = document.getElementById('order-client-payment');
    var notesInput = document.getElementById('order-client-notes');

    if (nameInput && document.activeElement !== nameInput) nameInput.value = state.client.fullName || '';
    if (tgInput && document.activeElement !== tgInput) tgInput.value = state.client.telegramHandle || '';
    if (cityInput && document.activeElement !== cityInput) cityInput.value = state.client.cityCountry || '';
    if (payInput && document.activeElement !== payInput) payInput.value = state.client.paymentMethod || 'Wire Transfer / Concierge Invoice';
    if (notesInput && document.activeElement !== notesInput) notesInput.value = state.client.notes || '';

    updateTelegramLivePreview();
  }

  function handleAddToBag(productId, buttonEl) {
    var product = findProductById(productId);
    if (!product) return;
    state.cart = Logic.addItemToCart(state.cart, product, 1);
    saveCart();
    updateHeaderBagBadge();
    renderBagDrawer();

    if (buttonEl) {
      var originalText = buttonEl.textContent;
      buttonEl.textContent = 'Added to Bag';
      setTimeout(function () {
        buttonEl.textContent = originalText;
      }, 900);
    }
  }

  function clearOrderValidationErrors() {
    var errEls = document.querySelectorAll('.js-order-err');
    for (var i = 0; i < errEls.length; i++) {
      errEls[i].textContent = '';
    }
  }

  function handlePrepareTelegramOrder(e) {
    if (e) e.preventDefault();
    clearOrderValidationErrors();
    readClientInputsFromDOM();

    var validation = Logic.validateOrderDetails(state.client, state.cart);
    if (!validation.valid) {
      if (validation.errors.cart) {
        var cartErr = document.getElementById('err-order-cart');
        if (cartErr) cartErr.textContent = validation.errors.cart;
      }
      if (validation.errors.fullName) {
        var nameErr = document.getElementById('err-order-name');
        if (nameErr) nameErr.textContent = validation.errors.fullName;
      }
      if (validation.errors.telegramHandle) {
        var tgErr = document.getElementById('err-order-telegram');
        if (tgErr) tgErr.textContent = validation.errors.telegramHandle;
      }
      if (validation.errors.cityCountry) {
        var cityErr = document.getElementById('err-order-city');
        if (cityErr) cityErr.textContent = validation.errors.cityCountry;
      }
      return;
    }

    var orderRef = Logic.generateOrderReference();
    var payload = Logic.buildTelegramOrderPayload(state.cart, state.client, orderRef);
    state.lastConfirmedOrder = payload;
    updateTelegramLivePreview();

    var statusBanner = document.getElementById('telegram-order-confirmed-box');
    var refSpan = document.getElementById('confirmed-order-ref');
    var directLink = document.getElementById('telegram-direct-dispatch-link');
    if (refSpan) refSpan.textContent = payload.orderRef;
    if (directLink) directLink.setAttribute('href', payload.telegramUrl);
    if (statusBanner) {
      statusBanner.style.display = 'block';
      statusBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function handleCopyOrderDossier() {
    readClientInputsFromDOM();
    var ref = state.lastConfirmedOrder ? state.lastConfirmedOrder.orderRef : Logic.generateOrderReference();
    var payload = Logic.buildTelegramOrderPayload(state.cart, state.client, ref);
    var copyBtn = document.getElementById('copy-order-dossier-btn');

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(payload.messageText).then(function () {
        if (copyBtn) {
          copyBtn.textContent = 'Dossier Copied';
          setTimeout(function () {
            copyBtn.textContent = 'Copy Order Dossier';
          }, 1400);
        }
      });
    }
  }

  /* ========================================================================
     ABOUT PAGE TABS & CONTACT PAGE BESPOKE FORM / FAQ
     ======================================================================== */
  function initCraftsmanshipTabs() {
    var tabButtons = document.querySelectorAll('.js-craft-tab');
    if (!tabButtons.length) return;

    for (var i = 0; i < tabButtons.length; i++) {
      tabButtons[i].addEventListener('click', function () {
        var targetId = this.getAttribute('data-tab-target');
        for (var j = 0; j < tabButtons.length; j++) {
          tabButtons[j].classList.remove('active');
          tabButtons[j].setAttribute('aria-selected', 'false');
        }
        this.classList.add('active');
        this.setAttribute('aria-selected', 'true');

        var panes = document.querySelectorAll('.craft-pane');
        for (var k = 0; k < panes.length; k++) {
          if (panes[k].id === targetId) {
            panes[k].classList.add('active');
          } else {
            panes[k].classList.remove('active');
          }
        }
      });
    }
  }

  function initFaqAccordion() {
    var triggers = document.querySelectorAll('.js-faq-trigger');
    for (var i = 0; i < triggers.length; i++) {
      triggers[i].addEventListener('click', function () {
        var parent = this.closest('.faq-item');
        if (!parent) return;
        var isOpen = parent.classList.contains('open');
        parent.classList.toggle('open', !isOpen);
        this.setAttribute('aria-expanded', !isOpen ? 'true' : 'false');
      });
    }
  }

  function initContactInquiryForm() {
    var form = document.getElementById('bespoke-inquiry-form');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var errName = document.getElementById('err-inq-name');
      var errContact = document.getElementById('err-inq-contact');
      var errSubject = document.getElementById('err-inq-subject');
      var errMessage = document.getElementById('err-inq-message');

      if (errName) errName.textContent = '';
      if (errContact) errContact.textContent = '';
      if (errSubject) errSubject.textContent = '';
      if (errMessage) errMessage.textContent = '';

      var formData = {
        name: (document.getElementById('inq-name') || {}).value || '',
        contact: (document.getElementById('inq-contact') || {}).value || '',
        subject: (document.getElementById('inq-subject') || {}).value || '',
        salon: (document.getElementById('inq-salon') || {}).value || 'Geneva Flagship',
        message: (document.getElementById('inq-message') || {}).value || ''
      };

      var check = Logic.validateInquiryForm(formData);
      if (!check.valid) {
        if (check.errors.name && errName) errName.textContent = check.errors.name;
        if (check.errors.contact && errContact) errContact.textContent = check.errors.contact;
        if (check.errors.subject && errSubject) errSubject.textContent = check.errors.subject;
        if (check.errors.message && errMessage) errMessage.textContent = check.errors.message;
        return;
      }

      var payload = Logic.buildTelegramInquiryPayload(formData);
      var resultBox = document.getElementById('inquiry-confirmed-box');
      var refEl = document.getElementById('inquiry-ref-code');
      var previewEl = document.getElementById('inquiry-telegram-preview');
      var linkEl = document.getElementById('inquiry-telegram-link');

      if (refEl) refEl.textContent = payload.inquiryRef;
      if (previewEl) previewEl.textContent = payload.messageText;
      if (linkEl) linkEl.setAttribute('href', payload.telegramUrl);
      if (resultBox) {
        resultBox.style.display = 'block';
      }
    });
  }

  /* ========================================================================
     GLOBAL EVENT DELEGATION & INITIALIZATION
     ======================================================================== */
  function initGlobalListeners() {
    document.addEventListener('click', function (e) {
      var addBtn = e.target.closest('.js-add-to-bag');
      if (addBtn) {
        var pid = addBtn.getAttribute('data-product-id');
        handleAddToBag(pid, addBtn);
        return;
      }

      var qvBtn = e.target.closest('.js-quickview-btn');
      if (qvBtn) {
        openQuickView(qvBtn.getAttribute('data-product-id'));
        return;
      }

      var openBagBtn = e.target.closest('.js-open-bag');
      if (openBagBtn) {
        openBagDrawer();
        return;
      }

      var closeBagBtn = e.target.closest('.js-close-bag');
      if (closeBagBtn) {
        closeBagDrawer();
        return;
      }

      var closeQvBtn = e.target.closest('.js-close-quickview');
      if (closeQvBtn) {
        closeQuickView();
        return;
      }

      var backdrop = e.target.closest('#modal-backdrop');
      if (backdrop) {
        closeQuickView();
        closeBagDrawer();
        return;
      }

      var qtyStepBtn = e.target.closest('.js-qty-step');
      if (qtyStepBtn) {
        var prodId = qtyStepBtn.getAttribute('data-product-id');
        var delta = parseInt(qtyStepBtn.getAttribute('data-delta'), 10) || 0;
        var currentItem = null;
        for (var i = 0; i < state.cart.length; i++) {
          if (state.cart[i].id === prodId) {
            currentItem = state.cart[i];
            break;
          }
        }
        if (currentItem) {
          state.cart = Logic.updateCartItemQuantity(state.cart, prodId, currentItem.quantity + delta);
          saveCart();
          renderBagDrawer();
        }
        return;
      }

      var removeBtn = e.target.closest('.js-remove-bag-item');
      if (removeBtn) {
        var rmId = removeBtn.getAttribute('data-product-id');
        state.cart = Logic.updateCartItemQuantity(state.cart, rmId, 0);
        saveCart();
        renderBagDrawer();
        return;
      }

      var catBtn = e.target.closest('.js-category-filter');
      if (catBtn) {
        state.filterCategory = catBtn.getAttribute('data-category') || 'all';
        syncFilterButtons();
        renderCatalogGrid();
        return;
      }
    });

    // Mobile Menu Toggle
    var mobileBtn = document.getElementById('mobile-menu-toggle');
    var mobileDrawer = document.getElementById('mobile-nav-drawer');
    if (mobileBtn && mobileDrawer) {
      mobileBtn.addEventListener('click', function () {
        var isOpen = mobileDrawer.classList.toggle('open');
        mobileBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });
    }

    // Catalog Search & Sort
    var searchInput = document.getElementById('catalog-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        state.searchQuery = this.value;
        renderCatalogGrid();
      });
    }

    var sortSelect = document.getElementById('catalog-sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', function () {
        state.sortBy = this.value;
        renderCatalogGrid();
      });
    }

    // Order Bag Client Form Live Updates & Submission
    var orderForm = document.getElementById('telegram-order-form');
    if (orderForm) {
      orderForm.addEventListener('input', function () {
        readClientInputsFromDOM();
        updateTelegramLivePreview();
      });
      orderForm.addEventListener('submit', handlePrepareTelegramOrder);
    }

    var copyBtn = document.getElementById('copy-order-dossier-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', handleCopyOrderDossier);
    }

    // Escape key closes modals/drawers
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeQuickView();
        closeBagDrawer();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    updateHeaderBagBadge();
    renderFeaturedGrid();
    renderCatalogGrid();
    renderBagDrawer();
    initCraftsmanshipTabs();
    initFaqAccordion();
    initContactInquiryForm();
    initGlobalListeners();
  });
})();
