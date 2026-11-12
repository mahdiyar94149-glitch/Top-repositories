/**
 * Maison Vespera — Pure Order, Catalog & Telegram Dispatch Logic
 * Works in browser (window.VesperaLogic) and Node.js unit tests (module.exports)
 * Zero external dependencies.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VesperaLogic = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TELEGRAM_BOT_USERNAME = 'MaisonVesperaConcierge';
  var COMPLIMENTARY_COURIER_THRESHOLD = 1500;
  var INSURED_COURIER_FEE = 65;

  function formatCurrency(amount) {
    var num = Number(amount) || 0;
    return '$' + num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  }

  function addItemToCart(cart, product, quantity) {
    var currentCart = Array.isArray(cart) ? cart.slice() : [];
    if (!product || !product.id) return currentCart;
    var qtyToAdd = Math.max(1, Math.min(10, parseInt(quantity, 10) || 1));
    var existingIndex = -1;
    for (var i = 0; i < currentCart.length; i++) {
      if (currentCart[i].id === product.id) {
        existingIndex = i;
        break;
      }
    }

    if (existingIndex > -1) {
      var updated = Object.assign({}, currentCart[existingIndex]);
      updated.quantity = Math.min(10, updated.quantity + qtyToAdd);
      currentCart[existingIndex] = updated;
    } else {
      currentCart.push({
        id: product.id,
        sku: product.sku || product.id.toUpperCase(),
        name: product.name,
        category: product.category,
        price: Number(product.price) || 0,
        edition: product.edition || 'Limited Edition',
        image: product.image || '',
        quantity: qtyToAdd
      });
    }
    return currentCart;
  }

  function updateCartItemQuantity(cart, productId, nextQuantity) {
    var currentCart = Array.isArray(cart) ? cart : [];
    var parsedQty = parseInt(nextQuantity, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      return currentCart.filter(function (item) {
        return item.id !== productId;
      });
    }
    var clampedQty = Math.min(10, parsedQty);
    return currentCart.map(function (item) {
      if (item.id !== productId) return item;
      return Object.assign({}, item, { quantity: clampedQty });
    });
  }

  function calculateCartSummary(cart) {
    var currentCart = Array.isArray(cart) ? cart : [];
    var itemCount = 0;
    var subtotal = 0;

    for (var i = 0; i < currentCart.length; i++) {
      var qty = Math.max(0, parseInt(currentCart[i].quantity, 10) || 0);
      var price = Math.max(0, Number(currentCart[i].price) || 0);
      itemCount += qty;
      subtotal += qty * price;
    }

    var shipping = subtotal === 0
      ? 0
      : (subtotal >= COMPLIMENTARY_COURIER_THRESHOLD ? 0 : INSURED_COURIER_FEE);

    var total = subtotal + shipping;
    var amountToFreeCourier = subtotal >= COMPLIMENTARY_COURIER_THRESHOLD
      ? 0
      : COMPLIMENTARY_COURIER_THRESHOLD - subtotal;

    return {
      itemCount: itemCount,
      subtotal: subtotal,
      shipping: shipping,
      total: total,
      complimentaryCourierUnlocked: subtotal >= COMPLIMENTARY_COURIER_THRESHOLD,
      amountToFreeCourier: amountToFreeCourier
    };
  }

  function filterAndSortProducts(products, options) {
    var list = Array.isArray(products) ? products.slice() : [];
    var opts = options || {};
    var category = (opts.category || 'all').trim().toLowerCase();
    var query = (opts.query || '').trim().toLowerCase();
    var sortBy = opts.sortBy || 'featured';

    var filtered = list.filter(function (item) {
      var matchesCategory = category === 'all' ||
        (item.category && item.category.toLowerCase() === category);

      var matchesQuery = !query ||
        (item.name && item.name.toLowerCase().indexOf(query) !== -1) ||
        (item.subtitle && item.subtitle.toLowerCase().indexOf(query) !== -1) ||
        (item.materials && item.materials.toLowerCase().indexOf(query) !== -1) ||
        (item.category && item.category.toLowerCase().indexOf(query) !== -1);

      return matchesCategory && matchesQuery;
    });

    if (sortBy === 'price-asc') {
      filtered.sort(function (a, b) { return a.price - b.price; });
    } else if (sortBy === 'price-desc') {
      filtered.sort(function (a, b) { return b.price - a.price; });
    } else if (sortBy === 'name-asc') {
      filtered.sort(function (a, b) { return a.name.localeCompare(b.name); });
    } else {
      filtered.sort(function (a, b) { return (a.featuredRank || 99) - (b.featuredRank || 99); });
    }

    return filtered;
  }

  function validateOrderDetails(details, cart) {
    var errors = {};
    var d = details || {};
    var items = Array.isArray(cart) ? cart : [];

    if (items.length === 0) {
      errors.cart = 'Your order bag is empty. Add at least one edition before dispatching.';
    }
    if (!d.fullName || d.fullName.trim().length < 2) {
      errors.fullName = 'Please enter your full name for the provenance certificate.';
    }
    if (!d.telegramHandle || d.telegramHandle.trim().length < 2) {
      errors.telegramHandle = 'Please provide your Telegram username (e.g. @alexandrev) or phone.';
    }
    if (!d.cityCountry || d.cityCountry.trim().length < 3) {
      errors.cityCountry = 'Please specify your delivery city and country.';
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors: errors
    };
  }

  function generateOrderReference(seed) {
    var suffix = seed
      ? String(seed).slice(-4).toUpperCase()
      : String(Math.floor(1000 + Math.random() * 9000));
    return 'MV-' + suffix;
  }

  function buildTelegramOrderPayload(cart, details, orderRef) {
    var summary = calculateCartSummary(cart);
    var d = details || {};
    var ref = orderRef || generateOrderReference();
    var handle = (d.telegramHandle || '').trim();
    if (handle && handle.charAt(0) !== '@' && handle.charAt(0) !== '+') {
      handle = '@' + handle;
    }

    var lines = [
      'MAISON VESPERA — DIRECT CONCIERGE ORDER',
      'Order Reference: ' + ref,
      '----------------------------------------',
      'SELECTED EDITIONS:'
    ];

    for (var i = 0; i < cart.length; i++) {
      var item = cart[i];
      var lineTotal = (Number(item.price) || 0) * (Number(item.quantity) || 1);
      lines.push(
        (i + 1) + '. ' + item.name + ' [' + (item.sku || item.id) + '] x' + item.quantity + ' — ' + formatCurrency(lineTotal)
      );
    }

    lines.push('----------------------------------------');
    lines.push('Subtotal: ' + formatCurrency(summary.subtotal));
    lines.push('Armored Courier: ' + (summary.shipping === 0 ? 'Complimentary (Insured)' : formatCurrency(summary.shipping)));
    lines.push('Total Valuation: ' + formatCurrency(summary.total));
    lines.push('Settlement Preference: ' + (d.paymentMethod || 'Wire Transfer / USDT / Concierge Invoice'));
    lines.push('----------------------------------------');
    lines.push('CLIENT DISPATCH DOSSIER:');
    lines.push('Client Name: ' + (d.fullName || '').trim());
    lines.push('Telegram Contact: ' + handle);
    lines.push('Destination: ' + (d.cityCountry || '').trim());
    if (d.notes && d.notes.trim()) {
      lines.push('Engraving / Delivery Notes: ' + d.notes.trim());
    }
    lines.push('----------------------------------------');
    lines.push('Please confirm allocation availability and dispatch schedule.');

    var messageText = lines.join('\n');
    var encodedText = encodeURIComponent(messageText);
    var telegramUrl = 'https://t.me/' + TELEGRAM_BOT_USERNAME + '?text=' + encodedText;

    return {
      orderRef: ref,
      messageText: messageText,
      telegramUrl: telegramUrl,
      summary: summary
    };
  }

  function validateInquiryForm(form) {
    var errors = {};
    var f = form || {};

    if (!f.name || f.name.trim().length < 2) {
      errors.name = 'Please enter your name.';
    }
    if (!f.contact || f.contact.trim().length < 3) {
      errors.contact = 'Please enter your Telegram handle or email address.';
    }
    if (!f.subject || f.subject.trim().length < 2) {
      errors.subject = 'Please select an inquiry subject.';
    }
    if (!f.message || f.message.trim().length < 10) {
      errors.message = 'Please include at least 10 characters describing your request.';
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors: errors
    };
  }

  function buildTelegramInquiryPayload(form) {
    var f = form || {};
    var ref = 'INQ-' + String(Math.floor(1000 + Math.random() * 9000));
    var lines = [
      'MAISON VESPERA — PRIVATE CLIENT INQUIRY',
      'Inquiry ID: ' + ref,
      '----------------------------------------',
      'Client: ' + (f.name || '').trim(),
      'Contact: ' + (f.contact || '').trim(),
      'Subject: ' + (f.subject || '').trim(),
      'Salon Location: ' + (f.salon || 'Geneva Flagship / Digital Concierge'),
      '----------------------------------------',
      'Message:',
      (f.message || '').trim()
    ];
    var messageText = lines.join('\n');
    return {
      inquiryRef: ref,
      messageText: messageText,
      telegramUrl: 'https://t.me/' + TELEGRAM_BOT_USERNAME + '?text=' + encodeURIComponent(messageText)
    };
  }

  return {
    TELEGRAM_BOT_USERNAME: TELEGRAM_BOT_USERNAME,
    COMPLIMENTARY_COURIER_THRESHOLD: COMPLIMENTARY_COURIER_THRESHOLD,
    INSURED_COURIER_FEE: INSURED_COURIER_FEE,
    formatCurrency: formatCurrency,
    addItemToCart: addItemToCart,
    updateCartItemQuantity: updateCartItemQuantity,
    calculateCartSummary: calculateCartSummary,
    filterAndSortProducts: filterAndSortProducts,
    validateOrderDetails: validateOrderDetails,
    generateOrderReference: generateOrderReference,
    buildTelegramOrderPayload: buildTelegramOrderPayload,
    validateInquiryForm: validateInquiryForm,
    buildTelegramInquiryPayload: buildTelegramInquiryPayload
  };
});
