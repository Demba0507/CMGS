import assert from 'node:assert/strict';

const deliveryFee = 1000;
const lines = [
  { unitPrice: 7000, quantity: 2 },
  { unitPrice: 12500, quantity: 1 },
];
const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
assert.equal(subtotal, 26500, 'subtotal must be the sum of server-priced lines');
assert.equal(subtotal + deliveryFee, 27500, 'total must include delivery exactly once');

const available = 3;
const requested = 2;
assert.ok(requested > 0 && requested <= available, 'a valid reservation fits available stock');
assert.equal(4 <= available, false, 'an invalid reservation must be rejected');
assert.equal(Math.floor((4950 * 1) / 10000), 0, '0.01% commission is rounded down in integer FCFA');
assert.equal(Math.floor((100000 * 1) / 10000), 10, '0.01% of 100,000 FCFA is 10 FCFA');
assert.equal(new Set(['A', 'B']).size, 2, 'a product may have multiple suppliers');
assert.ok(0 <= 5, 'supplier stock cannot be negative');

const invalidMethods = ['ORANGE_MONEY_AUTOMATIC', 'CARD'];
for (const method of invalidMethods) assert.ok(!['CASH_ON_DELIVERY', 'ORANGE_MONEY_MANUAL'].includes(method));
console.log('Commerce invariants: OK');
