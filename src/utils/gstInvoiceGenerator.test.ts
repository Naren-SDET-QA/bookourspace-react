import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGSTInvoiceHTML } from './gstInvoiceGenerator';

test('invoice HTML renders customer, item and invoice data as text rather than executable markup', () => {
  const malicious = '</title><img src=x onerror="alert(1)"><script>alert(1)</script>';
  const html = buildGSTInvoiceHTML({
    invoiceNumber: malicious, transactionId: malicious, date: '2026-11-02',
    customerName: malicious, customerPhone: malicious, customerEmail: malicious,
    customerGstin: malicious, customerAddress: malicious, planOrItemName: malicious,
    description: malicious, baseAmount: 100, paymentMethod: malicious,
    companyName: malicious, companyGstin: malicious, hsnSacCode: malicious,
  });
  assert.doesNotMatch(html, /<img src=x|<script>alert\(1\)<\/script>/);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
});

test('invoice output preserves readable literal text and numeric totals', () => {
  const html = buildGSTInvoiceHTML({
    invoiceNumber: 'INV-100', transactionId: 'TX-100', date: '2026-11-02',
    customerName: 'Rao & Sons', customerPhone: '9000000000',
    planOrItemName: 'Room <Deluxe>', baseAmount: 100, totalAmount: 118, paymentMethod: 'Pay later',
  });
  assert.ok(html.includes('Rao &amp; Sons'));
  assert.ok(html.includes('Room &lt;Deluxe&gt;'));
  assert.ok(html.includes('118'));
});
